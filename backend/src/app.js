require('dotenv').config();

const express = require('express');
const cors = require('cors');
const pool = require('./database');
const bcrypt = require('bcrypt');
const { randomInt } = require('node:crypto');
const generateAccountNumber = require('./services/accountGenerator');
const {
    generateCardNumber,
    generateNip,
    hashNip,
    generateExpirationDate
} = require('./services/cardGenerator');
const {
    generateVerificationCode,
    normalizePhone,
    storeVerificationCode,
    discardVerificationCode,
    consumeVerificationCode,
    isPhoneVerified,
    consumePhoneVerification,
    VerificationRateLimitError
} = require('./services/verificationService');
const { sendSms } = require('./services/textbeeService');
const jwt = require('jsonwebtoken');
const counterDepositsRouter = require('./routes/counterDeposits');
const counterCashDepositsRouter = require('./routes/counterCashDeposits');
const authenticateUser = require('./middleware/authenticateUser');

const app = express();
const TEMPORARY_NIP_TTL_MS = 5 * 60 * 1000;
const TEMPORARY_NIP_FAILURE_LIMIT = 5;
const TEMPORARY_NIP_LOCK_MS = 15 * 60 * 1000;
const TEMPORARY_NIP_SUCCESS_INTERVAL_MS = 60 * 1000;

app.use(cors());
app.use(express.json({ limit: '16kb' }));

app.get('/health', async (_req, res) => {
    try {
        await pool.query('SELECT 1');
        return res.json({ success: true, status: 'ok' });
    } catch (error) {
        console.error('Health check database query failed.');
        return res.status(503).json({ success: false, status: 'unavailable' });
    }
});

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
            CREATE TABLE IF NOT EXISTS phone_verifications (
                phone VARCHAR(10) PRIMARY KEY,
                code_hash CHAR(64),
                expires_at TIMESTAMPTZ,
                failed_attempts INTEGER NOT NULL DEFAULT 0 CHECK (failed_attempts >= 0),
                last_sent_at TIMESTAMPTZ,
                verified_until TIMESTAMPTZ
            )
        `);

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
            CREATE TABLE IF NOT EXISTS temporary_nip_attempts (
                user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
                failed_attempts INTEGER NOT NULL DEFAULT 0 CHECK (failed_attempts >= 0),
                blocked_until TIMESTAMPTZ,
                last_success_at TIMESTAMPTZ,
                nip_hash TEXT,
                expires_at TIMESTAMPTZ,
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
        `);
        await pool.query('ALTER TABLE temporary_nip_attempts ADD COLUMN IF NOT EXISTS nip_hash TEXT');
        await pool.query('ALTER TABLE temporary_nip_attempts ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ');

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
        console.error('Error ensuring tables:', err?.code || err?.name || 'unknown');
        throw err;
    }
}

async function createBankAccountForUser(userId) {
    const numeroCuenta = await generateAccountNumber();
    const numeroTarjeta = await generateCardNumber();
    const { nip, nipHash } = await generateSecureNip();
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
            nip,
            mesExpiracion: Number(tarjeta.mes_expiracion),
            anioExpiracion: Number(tarjeta.anio_expiracion)
        };
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Error creando cuenta/tarjeta:', err?.code || err?.name || 'unknown');
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
        console.error('Session fetch error:', err?.code || err?.name || 'unknown');
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
        console.error('Movement history fetch error:', err?.code || err?.name || 'unknown');
        return res.status(500).json({ success: false, message: 'Error consultando los movimientos' });
    }
});

app.post('/api/account/temporary-nip', authenticateUser, async (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.set('Pragma', 'no-cache');

    const password = req.body?.password;
    if (typeof password !== 'string' || password.length === 0) {
        return res.status(400).json({ success: false, message: 'Debes ingresar tu contraseña.' });
    }

    let client;
    let transactionStarted = false;
    try {
        const userResult = await pool.query(
            'SELECT password FROM users WHERE id = $1',
            [req.user.id]
        );
        if (userResult.rows.length === 0 || !userResult.rows[0].password) {
            return res.status(404).json({ success: false, message: 'Usuario no encontrado.' });
        }

        client = await pool.connect();
        await client.query('BEGIN');
        transactionStarted = true;
        await client.query(
            'INSERT INTO temporary_nip_attempts (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING',
            [req.user.id]
        );
        const attemptResult = await client.query(
            `SELECT failed_attempts, blocked_until, last_success_at
             FROM temporary_nip_attempts
             WHERE user_id = $1
             FOR UPDATE`,
            [req.user.id]
        );
        const attempt = attemptResult.rows[0];

        if (attempt.blocked_until && new Date(attempt.blocked_until).getTime() > Date.now()) {
            await client.query('COMMIT');
            transactionStarted = false;
            const retryAfterSeconds = Math.ceil(
                (new Date(attempt.blocked_until).getTime() - Date.now()) / 1000
            );
            res.set('Retry-After', String(retryAfterSeconds));
            return res.status(429).json({
                success: false,
                message: 'Demasiados intentos fallidos. Inténtalo de nuevo en 15 minutos.'
            });
        }

        const passwordMatches = await bcrypt.compare(password, userResult.rows[0].password);
        if (!passwordMatches) {
            const failedAttempt = await client.query(
                `UPDATE temporary_nip_attempts
                 SET failed_attempts = CASE
                         WHEN blocked_until IS NOT NULL AND blocked_until <= NOW() THEN 1
                         ELSE failed_attempts + 1
                     END,
                     blocked_until = CASE
                         WHEN CASE
                             WHEN blocked_until IS NOT NULL AND blocked_until <= NOW() THEN 1
                             ELSE failed_attempts + 1
                         END >= $2
                         THEN NOW() + ($3 * INTERVAL '1 millisecond')
                         ELSE NULL
                     END,
                     updated_at = NOW()
                 WHERE user_id = $1
                 RETURNING failed_attempts, blocked_until`,
                [req.user.id, TEMPORARY_NIP_FAILURE_LIMIT, TEMPORARY_NIP_LOCK_MS]
            );
            await client.query('COMMIT');
            transactionStarted = false;

            const lockUntil = failedAttempt.rows[0]?.blocked_until;
            if (lockUntil && new Date(lockUntil).getTime() > Date.now()) {
                res.set('Retry-After', String(Math.ceil(
                    (new Date(lockUntil).getTime() - Date.now()) / 1000
                )));
                return res.status(429).json({
                    success: false,
                    message: 'Demasiados intentos fallidos. Inténtalo de nuevo en 15 minutos.'
                });
            }
            return res.status(401).json({ success: false, message: 'La contraseña es incorrecta.' });
        }

        const lastSuccessAt = attempt.last_success_at
            ? new Date(attempt.last_success_at).getTime()
            : 0;
        if (lastSuccessAt && Date.now() - lastSuccessAt < TEMPORARY_NIP_SUCCESS_INTERVAL_MS) {
            await client.query(
                `UPDATE temporary_nip_attempts
                 SET failed_attempts = 0, blocked_until = NULL, updated_at = NOW()
                 WHERE user_id = $1`,
                [req.user.id]
            );
            await client.query('COMMIT');
            transactionStarted = false;
            const retryAfterSeconds = Math.ceil(
                (TEMPORARY_NIP_SUCCESS_INTERVAL_MS - (Date.now() - lastSuccessAt)) / 1000
            );
            res.set('Retry-After', String(retryAfterSeconds));
            return res.status(429).json({
                success: false,
                message: 'Ya consultaste un NIP temporal recientemente. Inténtalo de nuevo en un minuto.'
            });
        }

        const code = String(randomInt(0, 10000)).padStart(4, '0');
        const nipHash = await bcrypt.hash(code, 12);
        await client.query(
            `UPDATE temporary_nip_attempts
             SET failed_attempts = 0,
                 blocked_until = NULL,
                 last_success_at = NOW(),
                 nip_hash = $2,
                 expires_at = NOW() + INTERVAL '5 minutes',
                 updated_at = NOW()
             WHERE user_id = $1`,
            [req.user.id, nipHash]
        );
        await client.query('COMMIT');
        transactionStarted = false;

        return res.json({
            success: true,
            code,
            expiresInSeconds: TEMPORARY_NIP_TTL_MS / 1000
        });
    } catch (error) {
        if (client && transactionStarted) {
            try {
                await client.query('ROLLBACK');
            } catch (rollbackError) {
                console.error('Temporary NIP transaction rollback failed:', rollbackError?.code || rollbackError?.name || 'unknown');
            }
        }
        console.error('Temporary NIP request error:', error?.code || error?.name || 'unknown');
        return res.status(500).json({ success: false, message: 'No se pudo consultar el NIP temporal.' });
    } finally {
        client?.release();
    }
});

app.post('/api/account/temporary-nip/consume', authenticateUser, async (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.set('Pragma', 'no-cache');

    const code = req.body?.code;
    if (typeof code !== 'string' || !/^\d{4}$/.test(code)) {
        return res.status(400).json({ success: false, message: 'Ingresa un NIP temporal de cuatro dígitos.' });
    }

    let client;
    let transactionStarted = false;
    try {
        client = await pool.connect();
        await client.query('BEGIN');
        transactionStarted = true;
        await client.query(
            'INSERT INTO temporary_nip_attempts (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING',
            [req.user.id]
        );
        const result = await client.query(
            `SELECT failed_attempts, blocked_until, nip_hash, expires_at
             FROM temporary_nip_attempts
             WHERE user_id = $1
             FOR UPDATE`,
            [req.user.id]
        );
        const attempt = result.rows[0];
        const blockedUntil = attempt?.blocked_until ? new Date(attempt.blocked_until).getTime() : 0;
        if (blockedUntil > Date.now()) {
            await client.query('COMMIT');
            transactionStarted = false;
            res.set('Retry-After', String(Math.ceil((blockedUntil - Date.now()) / 1000)));
            return res.status(429).json({ success: false, message: 'NIP bloqueado temporalmente. Inténtalo más tarde.' });
        }

        const expiresAt = attempt?.expires_at ? new Date(attempt.expires_at).getTime() : 0;
        if (!attempt?.nip_hash || expiresAt <= Date.now()) {
            if (attempt?.nip_hash) {
                await client.query(
                    `UPDATE temporary_nip_attempts
                     SET nip_hash = NULL, expires_at = NULL, updated_at = NOW()
                     WHERE user_id = $1`,
                    [req.user.id]
                );
            }
            await client.query('COMMIT');
            transactionStarted = false;
            return res.status(401).json({ success: false, message: 'El NIP temporal es inválido o expiró.' });
        }

        if (!await bcrypt.compare(code, attempt.nip_hash)) {
            const failedAttempt = await client.query(
                `UPDATE temporary_nip_attempts
                 SET failed_attempts = CASE
                         WHEN blocked_until IS NOT NULL AND blocked_until <= NOW() THEN 1
                         ELSE failed_attempts + 1
                     END,
                     blocked_until = CASE
                         WHEN CASE
                             WHEN blocked_until IS NOT NULL AND blocked_until <= NOW() THEN 1
                             ELSE failed_attempts + 1
                         END >= $2
                         THEN NOW() + ($3 * INTERVAL '1 millisecond')
                         ELSE NULL
                     END,
                     updated_at = NOW()
                 WHERE user_id = $1
                 RETURNING blocked_until`,
                [req.user.id, TEMPORARY_NIP_FAILURE_LIMIT, TEMPORARY_NIP_LOCK_MS]
            );
            await client.query('COMMIT');
            transactionStarted = false;
            const lockUntil = failedAttempt.rows[0]?.blocked_until;
            if (lockUntil && new Date(lockUntil).getTime() > Date.now()) {
                res.set('Retry-After', String(Math.ceil((new Date(lockUntil).getTime() - Date.now()) / 1000)));
                return res.status(429).json({ success: false, message: 'Demasiados intentos fallidos. Inténtalo de nuevo en 15 minutos.' });
            }
            return res.status(401).json({ success: false, message: 'El NIP temporal es inválido o expiró.' });
        }

        await client.query(
            `UPDATE temporary_nip_attempts
             SET nip_hash = NULL, expires_at = NULL, failed_attempts = 0, blocked_until = NULL, updated_at = NOW()
             WHERE user_id = $1`,
            [req.user.id]
        );
        await client.query('COMMIT');
        transactionStarted = false;
        return res.json({ success: true, message: 'NIP temporal consumido correctamente.' });
    } catch (error) {
        if (client && transactionStarted) {
            try {
                await client.query('ROLLBACK');
            } catch (rollbackError) {
                console.error('Temporary NIP consumption rollback failed:', rollbackError?.code || rollbackError?.name || 'unknown');
            }
        }
        console.error('Temporary NIP consumption failed.');
        return res.status(500).json({ success: false, message: 'No se pudo validar el NIP temporal.' });
    } finally {
        client?.release();
    }
});

app.post('/api/verification/send', async (req, res) => {
    const { phone } = req.body || {};
    const normalizedPhone = normalizePhone(phone);

    if (!normalizedPhone) {
        return res.status(400).json({ success: false, message: 'Ingresa un número mexicano válido de 10 dígitos.' });
    }

    const code = generateVerificationCode();
    try {
        await storeVerificationCode(normalizedPhone, code);
    } catch (error) {
        if (error instanceof VerificationRateLimitError) {
            return res.status(error.statusCode).json({ success: false, message: error.message });
        }
        console.error('Error al guardar el desafío de verificación SMS.');
        return res.status(500).json({ success: false, message: 'No se pudo preparar la verificación del teléfono.' });
    }

    try {
        await sendSms(`+52${normalizedPhone}`, `Tu código de verificación de Banco KIKE es ${code}. Expira en 5 minutos.`);
    } catch {
        try {
            await discardVerificationCode(normalizedPhone, code);
        } catch {
            console.error('Error al invalidar un desafío SMS cuyo envío fue rechazado.');
        }
        console.error('Error al enviar el SMS mediante TextBee.');
        return res.status(502).json({ success: false, message: 'No se pudo enviar el SMS. Inténtalo de nuevo más tarde.' });
    }

    return res.json({
        success: true,
        message: 'Código SMS enviado al teléfono.'
    });
});

app.post('/api/verification/verify', async (req, res) => {
    const { phone, code } = req.body || {};
    const normalizedPhone = normalizePhone(phone);

    if (!normalizedPhone || typeof code !== 'string' || !/^\d{6}$/.test(code)) {
        return res.status(400).json({ success: false, message: 'Ingresa un teléfono válido y un código de seis dígitos.' });
    }

    try {
        const valid = await consumeVerificationCode(normalizedPhone, code);

        if (!valid) {
            return res.status(401).json({ success: false, message: 'El código de verificación es inválido o expiró.' });
        }

        return res.json({ success: true, message: 'Teléfono verificado correctamente.' });
    } catch (error) {
        console.error('Error al verificar el código SMS.');
        return res.status(500).json({ success: false, message: 'No se pudo verificar el código.' });
    }
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

    if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
        return res.status(503).json({ success: false, message: 'La autenticación no está configurada correctamente.' });
    }

    try {
        if (!await isPhoneVerified(normalizedPhone)) {
            return res.status(401).json({ success: false, message: 'Debes verificar por SMS el número de teléfono de esta solicitud.' });
        }

        const { rows } = await pool.query('SELECT * FROM users WHERE email = $1', [normalizedEmail]);

        if (rows.length > 0) {
            const user = rows[0];
            const match = await bcrypt.compare(password, user.password);
            if (match) {
                if (!await consumePhoneVerification(normalizedPhone)) {
                    return res.status(401).json({ success: false, message: 'Debes verificar por SMS el número de teléfono de esta solicitud.' });
                }

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
        if (!await consumePhoneVerification(normalizedPhone)) {
            return res.status(401).json({ success: false, message: 'Debes verificar por SMS el número de teléfono de esta solicitud.' });
        }

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
        console.error('Auth error:', err?.code || err?.name || 'unknown');
        return res.status(500).json({ success: false, message: 'Error del servidor' });
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
        console.error('Balance error:', err?.code || err?.name || 'unknown');
        return res.status(500).json({ success: false, message: 'Error consultando el saldo' });
    }
});

app.use((_req, res) => {
    return res.status(404).json({ success: false, message: 'Ruta no encontrada.' });
});

app.use((error, _req, res, _next) => {
    console.error('Request processing error:', error?.type || error?.code || error?.name || 'unknown');
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
        ['TEXTBEE_API_KEY', process.env.TEXTBEE_API_KEY, 1],
        ['JWT_SECRET', process.env.JWT_SECRET, 32],
        ['COUNTER_DEVICE_TOKEN', process.env.COUNTER_DEVICE_TOKEN, 32],
        ['SMS_CODE_HMAC_SECRET', process.env.SMS_CODE_HMAC_SECRET, 32],
        ['COUNTER_DEVICE_IDS', configuredDevices.join(','), 1]
    ];
    if (process.env.NODE_ENV === 'production') {
        requiredConfig.push(['DATABASE_URL', process.env.DATABASE_URL, 1]);
    }
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
            console.error('Error inicializando la aplicación:', err?.code || err?.name || 'unknown');
            process.exit(1);
        });
}

module.exports = app;