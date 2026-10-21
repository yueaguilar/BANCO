require('dotenv').config();

const express = require('express');
const cors = require('cors');
const pool = require('./database');
const bcrypt = require('bcrypt');
const generateAccountNumber = require('./services/accountGenerator');
const {
    generateCardNumber,
    generateNip,
    hashNip,
    verifyNip,
    generateExpirationDate,
    generateCvv
} = require('./services/cardGenerator');
const {
    generateVerificationCode,
    normalizePhone,
    storeVerificationCode,
    consumeVerificationCode,
    markPhoneVerified,
    isPhoneVerified,
    markEmailVerified,
    isEmailVerified
} = require('./services/verificationService');
const { enviarCorreoVerificacion } = require('./services/emailService');
const jwt = require('jsonwebtoken');
const counterDepositsRouter = require('./routes/counterDeposits');
const counterCashDepositsRouter = require('./routes/counterCashDeposits');
const authenticateUser = require('./middleware/authenticateUser');

const app = express();

app.use(cors());
app.use(express.json({ limit: '16kb' }));

async function generateSecureNip() {
    const nip = generateNip();
    const nipHash = await hashNip(nip);
    return { nip, nipHash };
}

async function ensureTables() {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                fullname TEXT,
                email TEXT UNIQUE,
                birthdate DATE,
                phone TEXT,
                password TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS phone TEXT');

        await pool.query(`
            CREATE TABLE IF NOT EXISTS cuentas (
                id SERIAL PRIMARY KEY,
                usuario_id INTEGER NOT NULL,
                numero_cuenta VARCHAR(10) UNIQUE NOT NULL,
                saldo NUMERIC(12,2) NOT NULL DEFAULT 0.00,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                CONSTRAINT fk_usuario
                    FOREIGN KEY (usuario_id)
                    REFERENCES users(id)
                    ON DELETE CASCADE
            )
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS tarjetas (
                id SERIAL PRIMARY KEY,
                cuenta_id INTEGER NOT NULL,
                numero_tarjeta VARCHAR(19) UNIQUE NOT NULL,
                mes_expiracion INTEGER NOT NULL,
                anio_expiracion INTEGER NOT NULL,
                nip_hash TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                CONSTRAINT fk_cuenta
                    FOREIGN KEY (cuenta_id)
                    REFERENCES cuentas(id)
                    ON DELETE CASCADE
            )
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS contador_intentos_nip (
                dispositivo_id VARCHAR(100) NOT NULL,
                numero_cuenta VARCHAR(10) NOT NULL,
                intentos INTEGER NOT NULL DEFAULT 0 CHECK (intentos >= 0),
                bloqueado_hasta TIMESTAMPTZ,
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                PRIMARY KEY (dispositivo_id, numero_cuenta)
            )
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS contadores (
                id SERIAL PRIMARY KEY,
                dispositivo_id VARCHAR(100) NOT NULL,
                cantidad_billetes INTEGER NOT NULL CHECK (cantidad_billetes >= 0),
                fecha_hora TIMESTAMPTZ NOT NULL,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                lote_id UUID NOT NULL
            )
        `);

        await pool.query('ALTER TABLE contadores ADD COLUMN IF NOT EXISTS lote_id UUID');
        await pool.query('UPDATE contadores SET lote_id = gen_random_uuid() WHERE lote_id IS NULL');
        await pool.query('ALTER TABLE contadores ALTER COLUMN lote_id SET NOT NULL');
        await pool.query(`
            CREATE UNIQUE INDEX IF NOT EXISTS uq_contadores_dispositivo_lote
            ON contadores (dispositivo_id, lote_id)
            WHERE lote_id IS NOT NULL
        `);
        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_contadores_pendientes
            ON contadores (dispositivo_id, created_at DESC)
            WHERE cantidad_billetes > 0
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS depositos (
                id BIGSERIAL PRIMARY KEY,
                operacion_id UUID NOT NULL UNIQUE,
                cuenta_id INTEGER NOT NULL REFERENCES cuentas(id) ON DELETE RESTRICT,
                contador_id INTEGER NOT NULL REFERENCES contadores(id) ON DELETE RESTRICT,
                denominacion INTEGER NOT NULL CHECK (denominacion IN (20, 50, 100, 200, 500)),
                cantidad_billetes INTEGER NOT NULL CHECK (cantidad_billetes BETWEEN 1 AND 10000),
                importe NUMERIC(12,2) NOT NULL CHECK (importe > 0),
                estado VARCHAR(20) NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'confirmado', 'cancelado')),
                saldo_resultante NUMERIC(12,2),
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                confirmado_at TIMESTAMPTZ,
                CONSTRAINT ck_deposito_importe
                    CHECK (importe = denominacion * cantidad_billetes),
                CONSTRAINT ck_deposito_confirmacion
                    CHECK (
                        (estado = 'pendiente' AND confirmado_at IS NULL AND saldo_resultante IS NULL)
                        OR (estado = 'confirmado' AND confirmado_at IS NOT NULL AND saldo_resultante IS NOT NULL)
                        OR (estado = 'cancelado' AND confirmado_at IS NULL AND saldo_resultante IS NULL)
                    )
            )
        `);
        await pool.query('ALTER TABLE depositos DROP CONSTRAINT IF EXISTS depositos_contador_id_key');
        await pool.query(`
            CREATE UNIQUE INDEX IF NOT EXISTS uq_depositos_contador_activo
            ON depositos (contador_id)
            WHERE estado <> 'cancelado'
        `);
        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_depositos_cuenta_created_at
            ON depositos (cuenta_id, created_at DESC)
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS movimientos (
                id BIGSERIAL PRIMARY KEY,
                cuenta_id INTEGER NOT NULL REFERENCES cuentas(id) ON DELETE RESTRICT,
                tipo VARCHAR(40) NOT NULL,
                monto NUMERIC(12,2) NOT NULL CHECK (monto > 0),
                descripcion TEXT NOT NULL,
                referencia_id UUID NOT NULL UNIQUE,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
        `);
        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_movimientos_cuenta_created_at
            ON movimientos (cuenta_id, created_at DESC)
        `);

        // El NIP nunca se guarda en claro: se elimina la columna si existía de una versión previa.
        await pool.query('ALTER TABLE tarjetas DROP COLUMN IF EXISTS nip');

        // Saldo siempre con valor numérico válido, nunca NULL.
        await pool.query('UPDATE cuentas SET saldo = 0 WHERE saldo IS NULL');
        await pool.query('ALTER TABLE cuentas ALTER COLUMN saldo SET DEFAULT 0.00');
        await pool.query('ALTER TABLE cuentas ALTER COLUMN saldo SET NOT NULL');

        console.log('Tablas verificadas');
    } catch (err) {
        console.error('Error ensuring tables:', err);
        throw err;
    }
}

async function createBankAccountForUser(userId) {
    const numeroCuenta = await generateAccountNumber();
    const numeroTarjeta = await generateCardNumber();
    const { nipHash } = await generateSecureNip();
    const expiracion = generateExpirationDate();

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const cuentaRes = await client.query(
            'INSERT INTO cuentas (usuario_id, numero_cuenta, saldo) VALUES ($1, $2, 0) RETURNING id, numero_cuenta, saldo',
            [userId, numeroCuenta]
        );

        const cuentaId = cuentaRes.rows[0].id;

        const tarjetaRes = await client.query(
            'INSERT INTO tarjetas (cuenta_id, numero_tarjeta, mes_expiracion, anio_expiracion, nip_hash) VALUES ($1, $2, $3, $4, $5) RETURNING id, numero_tarjeta, mes_expiracion, anio_expiracion',
            [cuentaId, numeroTarjeta, Number(expiracion.month), Number(expiracion.year), nipHash]
        );

        await client.query('COMMIT');

        const tarjeta = tarjetaRes.rows[0];

        console.log('Cuenta y tarjeta creadas:', { cuentaId, numeroCuenta, tarjetaId: tarjeta.id });

        return {
            numeroCuenta: String(cuentaRes.rows[0].numero_cuenta),
            numeroTarjeta: String(tarjeta.numero_tarjeta),
            mesExpiracion: Number(tarjeta.mes_expiracion),
            anioExpiracion: Number(tarjeta.anio_expiracion)
        };
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Error creando cuenta/tarjeta:', err);
        throw err;
    } finally {
        client.release();
    }
}

async function getBankDataForUser(userId) {
    const cuentasRes = await pool.query(
        `SELECT c.id as cuenta_id, c.numero_cuenta, c.saldo, t.id as tarjeta_id, t.numero_tarjeta, t.mes_expiracion, t.anio_expiracion
         FROM cuentas c
         LEFT JOIN tarjetas t ON t.cuenta_id = c.id
         WHERE c.usuario_id = $1
         ORDER BY c.id ASC
         LIMIT 1`,
        [userId]
    );

    const cuentaInfo = cuentasRes.rows.length > 0 ? cuentasRes.rows[0] : null;
    if (!cuentaInfo) {
        return null;
    }

    return {
        cuentaId: cuentaInfo.cuenta_id,
        numeroCuenta: cuentaInfo.numero_cuenta,
        saldo: Number(cuentaInfo.saldo),
        numeroTarjeta: cuentaInfo.numero_tarjeta,
        mesExpiracion: Number(cuentaInfo.mes_expiracion),
        anioExpiracion: Number(cuentaInfo.anio_expiracion)
    };
}

async function getSessionDataForUser(userId) {
    const { rows } = await pool.query(
        'SELECT id, fullname, email FROM users WHERE id = $1',
        [userId]
    );

    if (rows.length === 0) {
        return null;
    }

    const user = rows[0];
    const bankData = await getBankDataForUser(user.id);

    return {
        user: {
            id: user.id,
            fullname: user.fullname,
            email: user.email
        },
        bankData
    };
}

app.use(counterDepositsRouter);
app.use(counterCashDepositsRouter);

app.get('/', (_req, res) => {
    return res.json({ success: true, message: 'API del Banco funcionando' });
});

app.get('/api', (req, res) => {
    res.json({ mensaje: 'API del Banco funcionando' });
});

app.get('/api/session', authenticateUser, async (req, res) => {
    try {
        const session = await getSessionDataForUser(req.user.id);
        if (!session) {
            return res.status(404).json({ success: false, message: 'Usuario no encontrado' });
        }

        return res.json({ success: true, ...session });
    } catch (err) {
        console.error('Session fetch error:', err);
        return res.status(500).json({ success: false, message: 'Error obteniendo la sesión' });
    }
});

app.get('/api/movimientos', authenticateUser, async (req, res) => {
    try {
        const { rows } = await pool.query(
            `SELECT m.id, m.tipo, m.monto, m.descripcion, m.created_at
             FROM movimientos m
             INNER JOIN cuentas c ON c.id = m.cuenta_id
             WHERE c.usuario_id = $1
             ORDER BY m.created_at DESC, m.id DESC
             LIMIT 50`,
            [req.user.id]
        );
        return res.json({ success: true, data: rows });
    } catch (err) {
        console.error('Movement history fetch error:', err);
        return res.status(500).json({ success: false, message: 'Error consultando los movimientos' });
    }
});

app.post('/api/verification/send', async (req, res) => {
    const { phone, email } = req.body;
    const normalizedPhone = normalizePhone(phone);
    const normalizedEmail = String(email || '').trim().toLowerCase();

    if (!normalizedEmail) {
        return res.status(400).json({ success: false, message: 'Debes ingresar un correo electrónico válido.' });
    }

    if (normalizedPhone && normalizedPhone.length < 10) {
        return res.status(400).json({ success: false, message: 'Debes ingresar un número de teléfono válido para guardar el dato del usuario.' });
    }

    try {
        const code = generateVerificationCode();
        await enviarCorreoVerificacion(normalizedEmail, code);
        storeVerificationCode(normalizedEmail, code, 5 * 60 * 1000);

        return res.json({
            success: true,
            message: 'Código de verificación enviado al correo electrónico.'
        });
    } catch (error) {
        console.error('Error enviando el código de verificación por email:', error);
        return res.status(500).json({ success: false, message: 'No se pudo enviar el código de verificación al correo.' });
    }
});

app.post('/api/verification/verify', async (req, res) => {
    const { phone, email, code } = req.body;
    const normalizedPhone = normalizePhone(phone);
    const normalizedEmail = String(email || '').trim().toLowerCase();

    if (!normalizedEmail || !code) {
        return res.status(400).json({ success: false, message: 'Correo y código requeridos' });
    }

    const valid = consumeVerificationCode(normalizedEmail, code);

    if (!valid) {
        return res.status(401).json({ success: false, message: 'El código de verificación es inválido o expiró.' });
    }

    markEmailVerified(normalizedEmail, 10 * 60 * 1000);

    if (normalizedPhone) {
        markPhoneVerified(normalizedPhone, 10 * 60 * 1000);
    }

    return res.json({ success: true, message: 'Código verificado correctamente.' });
});

app.post('/api/auth', async (req, res) => {
    const { email, fullname, birthdate, password, phone } = req.body;
    const normalizedPhone = normalizePhone(phone);
    const normalizedEmail = String(email || '').trim().toLowerCase();

    if (!normalizedEmail || !password) {
        return res.status(400).json({ success: false, message: 'email y password requeridos' });
    }

    if (!normalizedPhone || normalizedPhone.length < 10) {
        return res.status(400).json({ success: false, message: 'Debes ingresar tu número de teléfono para continuar.' });
    }

    if (!isEmailVerified(normalizedEmail)) {
        return res.status(401).json({ success: false, message: 'Debes verificar el código enviado al correo electrónico.' });
    }

    if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
        return res.status(503).json({ success: false, message: 'La autenticación no está configurada correctamente.' });
    }

    try {
        const { rows } = await pool.query('SELECT * FROM users WHERE email = $1', [normalizedEmail]);

        if (rows.length > 0) {
            const user = rows[0];
            const match = await bcrypt.compare(password, user.password);
            if (match) {
                if (normalizedPhone && (!user.phone || user.phone !== normalizedPhone)) {
                    await pool.query('UPDATE users SET phone = $1 WHERE id = $2', [normalizedPhone, user.id]);
                }

                const bankData = await getBankDataForUser(user.id);

                const token = jwt.sign({}, process.env.JWT_SECRET, {
                    subject: String(user.id),
                    issuer: 'banco-kike-api',
                    audience: 'banco-kike-web',
                    expiresIn: '1h'
                });
                return res.json({ success: true, message: 'Login exitoso', token, user: { id: user.id, fullname: user.fullname, email: user.email }, bankData });
            }

            return res.status(401).json({ success: false, message: 'Contraseña incorrecta' });
        }

        const hashed = await bcrypt.hash(password, 10);
        const userInsert = await pool.query(
            'INSERT INTO users(fullname, email, birthdate, password, phone) VALUES($1,$2,$3,$4,$5) RETURNING id',
            [fullname || null, normalizedEmail, birthdate || null, hashed, normalizedPhone]
        );

        const bankData = await createBankAccountForUser(userInsert.rows[0].id);
        const token = jwt.sign({}, process.env.JWT_SECRET, {
            subject: String(userInsert.rows[0].id),
            issuer: 'banco-kike-api',
            audience: 'banco-kike-web',
            expiresIn: '1h'
        });
        console.log('Usuario registrado:', { userId: userInsert.rows[0].id, email: normalizedEmail, phone: normalizedPhone });

        return res.json({
            success: true,
            message: 'Usuario registrado',
            token,
            user: {
                id: userInsert.rows[0].id,
                fullname: fullname || null,
                email: normalizedEmail
            },
            bankData
        });
    } catch (err) {
        console.error('Auth error:', err);
        return res.status(500).json({ success: false, message: 'Error del servidor' });
    }
});

app.post('/api/deposit', async (req, res) => {
    const {
        accountNumber,
        cardNumber,
        expirationMonth,
        expirationYear,
        nip,
        cvv,
        amount
    } = req.body;

    if (!accountNumber || !cardNumber || !nip || !cvv || !amount) {
        return res.status(400).json({ success: false, message: 'Faltan datos para realizar el depósito' });
    }

    try {
        const { rows } = await pool.query(
            `SELECT c.id, c.numero_cuenta, c.saldo, t.numero_tarjeta, t.mes_expiracion, t.anio_expiracion, t.nip_hash
             FROM cuentas c
             INNER JOIN tarjetas t ON t.cuenta_id = c.id
             WHERE c.numero_cuenta = $1`,
            [accountNumber]
        );

        if (rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Cuenta no encontrada' });
        }

        const cuenta = rows[0];
        const isNipValid = await verifyNip(String(nip), cuenta.nip_hash);
        const isCardValid = String(cuenta.numero_tarjeta) === String(cardNumber);
        const isExpirationValid = Number(cuenta.mes_expiracion) === Number(expirationMonth)
            && Number(cuenta.anio_expiracion) === Number(expirationYear);

        // Validate CVV against current and previous time window
        const expectedCvvNow = generateCvv(String(cuenta.numero_tarjeta), Number(cuenta.mes_expiracion), Number(cuenta.anio_expiracion), 0);
        const expectedCvvPrev = generateCvv(String(cuenta.numero_tarjeta), Number(cuenta.mes_expiracion), Number(cuenta.anio_expiracion), -1);
        const isCvvValid = String(cvv) === String(expectedCvvNow) || String(cvv) === String(expectedCvvPrev);

        if (!isCardValid || !isExpirationValid || !isNipValid || !isCvvValid) {
            return res.status(401).json({ success: false, message: 'Datos de la tarjeta inválidos para el depósito' });
        }

        const monto = Number(amount);
        if (!Number.isFinite(monto) || monto <= 0) {
            return res.status(400).json({ success: false, message: 'El monto debe ser mayor a cero' });
        }

        const actualizado = await pool.query(
            'UPDATE cuentas SET saldo = saldo + $1 WHERE id = $2 RETURNING saldo',
            [monto, cuenta.id]
        );

        return res.json({
            success: true,
            message: 'Depósito realizado con éxito',
            saldo: Number(actualizado.rows[0].saldo)
        });
    } catch (err) {
        console.error('Deposit error:', err);
        return res.status(500).json({ success: false, message: 'Error procesando el depósito' });
    }
});

app.get('/api/balance/:numeroCuenta', authenticateUser, async (req, res) => {
    const { numeroCuenta } = req.params;
    const cuenta = String(numeroCuenta || '').trim();

    if (!/^\d{10}$/.test(cuenta)) {
        return res.status(400).json({ success: false, message: 'El número de cuenta debe tener 10 dígitos.' });
    }

    try {
        const { rows } = await pool.query(
            'SELECT c.id, c.numero_cuenta, c.saldo FROM cuentas c WHERE c.numero_cuenta = $1 AND c.usuario_id = $2',
            [cuenta, req.user.id]
        );

        if (rows.length === 0) {
            return res.status(404).json({ success: false, message: 'La cuenta no existe o no pertenece al usuario autenticado.' });
        }

        return res.json({
            success: true,
            numeroCuenta: rows[0].numero_cuenta,
            saldo: Number(rows[0].saldo)
        });
    } catch (err) {
        console.error('Balance error:', err);
        return res.status(500).json({ success: false, message: 'Error consultando el saldo' });
    }
});

app.use((_req, res) => {
    return res.status(404).json({ success: false, message: 'Ruta no encontrada.' });
});

app.use((error, _req, res, _next) => {
    console.error('Request processing error:', error);
    if (error.type === 'entity.too.large') {
        return res.status(413).json({ success: false, message: 'La solicitud excede el tamaño permitido.' });
    }
    if (error.type === 'entity.parse.failed') {
        return res.status(400).json({ success: false, message: 'El cuerpo de la solicitud no contiene JSON válido.' });
    }
    return res.status(500).json({ success: false, message: 'Error interno del servidor.' });
});

const PORT = process.env.PORT || 3000;

if (require.main === module) {
    const configuredDevices = [...new Set(
        String(process.env.COUNTER_DEVICE_IDS || '')
            .split(',')
            .map((id) => id.trim())
            .filter(Boolean)
    )];
    const invalidDeviceIds = configuredDevices.some((id) => !/^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(id));
    const requiredConfig = [
        ['JWT_SECRET', process.env.JWT_SECRET, 32],
        ['COUNTER_DEVICE_TOKEN', process.env.COUNTER_DEVICE_TOKEN, 32],
        ['COUNTER_DEVICE_IDS', configuredDevices.join(','), 1]
    ];
    const missingConfig = requiredConfig
        .filter(([name, value, minLength]) => !value || String(value).trim().length < minLength)
        .map(([name]) => name);
    if (invalidDeviceIds && !missingConfig.includes('COUNTER_DEVICE_IDS')) {
        missingConfig.push('COUNTER_DEVICE_IDS');
    }

    if (missingConfig.length > 0) {
        console.error(`Falta configurar variables requeridas: ${missingConfig.join(', ')}`);
        process.exit(1);
    }

    ensureTables()
        .then(() => {
            app.listen(PORT, () => {
                console.log(`Servidor ejecutándose en http://localhost:${PORT}`);
            });
        })
        .catch((err) => {
            console.error('Error inicializando la aplicación:', err);
            process.exit(1);
        });
}

module.exports = app;