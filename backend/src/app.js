require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
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

const app = express();
const userNips = new Map();

app.use(cors());
app.use(express.json());

// Determinar la carpeta pública del frontend. La estructura actual coloca los HTML
// en `FRONTEND/src/app/componentes/...` por lo que apuntamos al root `FRONTEND/src/app`.
const candidatePaths = [
    path.join(__dirname, '../../FRONTEND/src/app'),
    path.join(__dirname, '../../FRONTEND/src'),
    path.join(__dirname, '../../FRONTEND'),
    path.join(__dirname, '../../app/public')
];

const publicPath = candidatePaths.find((p) => fs.existsSync(p));

if (!publicPath) {
    throw new Error(`No se encontró la carpeta pública del frontend. Revisar rutas: ${candidatePaths.join(', ')}`);
}

// Busca recursivamente un archivo HTML que coincida con `page`. Devuelve ruta absoluta o null.
function findHtmlForPage(page) {
    const target = `${page}.html`;

    function search(dir) {
        const items = fs.readdirSync(dir, { withFileTypes: true });
        for (const it of items) {
            const full = path.join(dir, it.name);
            if (it.isFile() && it.name.toLowerCase() === target.toLowerCase()) {
                return full;
            }
            if (it.isDirectory()) {
                try {
                    const found = search(full);
                    if (found) return found;
                } catch (err) {
                    // ignorar permisos u otros errores puntuales
                }
            }
        }
        return null;
    }

    // Primero buscar en la raíz pública y luego dentro de `componentes` si existe.
    const foundRoot = search(publicPath);
    if (foundRoot) return foundRoot;

    const componentesPath = path.join(publicPath, 'componentes');
    if (fs.existsSync(componentesPath)) {
        return search(componentesPath);
    }

    return null;
}

async function generateSecureNip() {
    const nip = generateNip();
    const nipHash = await hashNip(nip);
    return { nip, nipHash };
}

app.use(express.static(publicPath));

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
                saldo NUMERIC(12,2) DEFAULT 0.00,
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

        // El NIP nunca se guarda en claro: se elimina la columna si existía de una versión previa.
        await pool.query('ALTER TABLE tarjetas DROP COLUMN IF EXISTS nip');

        // Saldo siempre con valor numérico válido, nunca NULL.
        await pool.query('UPDATE cuentas SET saldo = 0 WHERE saldo IS NULL');
        await pool.query('ALTER TABLE cuentas ALTER COLUMN saldo SET DEFAULT 0.00');
        await pool.query('ALTER TABLE cuentas ALTER COLUMN saldo SET NOT NULL');

        console.log('Tablas verificadas');
    } catch (err) {
        console.error('Error ensuring tables:', err);
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

        userNips.set(Number(userId), String(nip));

        const currentCvv = generateCvv(numeroTarjeta, Number(expiracion.month), Number(expiracion.year), 0);

        const tarjeta = tarjetaRes.rows[0];

        console.log('Cuenta y tarjeta creadas:', { cuentaId, numeroCuenta, tarjetaId: tarjeta.id });

        return {
            numeroCuenta: String(cuentaRes.rows[0].numero_cuenta),
            numeroTarjeta: String(tarjeta.numero_tarjeta),
            nip: String(nip),
            mesExpiracion: Number(tarjeta.mes_expiracion),
            anioExpiracion: Number(tarjeta.anio_expiracion),
            cvv: currentCvv
        };
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Error creando cuenta/tarjeta:', err);
        throw err;
    } finally {
        client.release();
    }
}

const validPages = [
    'login',
    'veri',
    'app',
    'cuenta',
    'movimientos',
    'mas',
    'pago',
    'recarga',
    'srevicios',
    'transferir',
    'qr',
    'scan'
];

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

    // El NIP solo existe en claro en memoria, justo después de haberse generado.
    // Una vez hasheado no es recuperable, igual que la contraseña: por diseño.
    const visibleNip = userNips.get(Number(userId)) || null;

    const cvv = generateCvv(
        String(cuentaInfo.numero_tarjeta),
        Number(cuentaInfo.mes_expiracion),
        Number(cuentaInfo.anio_expiracion),
        0
    );

    return {
        cuentaId: cuentaInfo.cuenta_id,
        numeroCuenta: cuentaInfo.numero_cuenta,
        saldo: Number(cuentaInfo.saldo),
        numeroTarjeta: cuentaInfo.numero_tarjeta,
        mesExpiracion: Number(cuentaInfo.mes_expiracion),
        anioExpiracion: Number(cuentaInfo.anio_expiracion),
        nip: visibleNip,
        cvv
    };
}

async function getSessionDataByEmail(email) {
    const { rows } = await pool.query(
        'SELECT id, fullname, email FROM users WHERE email = $1',
        [email]
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

app.get('/', (req, res) => {
    const file = findHtmlForPage('login') || findHtmlForPage('app') || path.join(publicPath, 'index.html');
    if (!file || !fs.existsSync(file)) return res.status(404).send('Página de inicio no encontrada');
    res.sendFile(file);
});

app.get('/login.html', (req, res) => {
    const file = findHtmlForPage('login');
    if (!file) return res.status(404).send('Login no encontrado');
    res.sendFile(file);
});

app.get('/app', (req, res) => {
    const file = findHtmlForPage('app') || findHtmlForPage('app');
    if (!file) return res.status(404).send('App no encontrada');
    res.sendFile(file);
});

app.get('/app.html', (req, res) => {
    const file = findHtmlForPage('app');
    if (!file) return res.status(404).send('App no encontrada');
    res.sendFile(file);
});

app.get('/:page.html', (req, res) => {
    const page = req.params.page;
    if (!validPages.includes(page)) {
        return res.status(404).send('Página no encontrada');
    }

    const filePath = findHtmlForPage(page);
    if (!filePath) {
        return res.status(404).send('HTML no encontrado');
    }

    res.sendFile(filePath);
});

app.get('/api', (req, res) => {
    res.json({ mensaje: 'API del Banco funcionando' });
});

app.get('/api/session', async (req, res) => {
    const { email } = req.query;

    if (!email) {
        return res.status(400).json({ success: false, message: 'Email requerido' });
    }

    try {
        const session = await getSessionDataByEmail(email);
        if (!session) {
            return res.status(404).json({ success: false, message: 'Usuario no encontrado' });
        }

        return res.json({ success: true, ...session });
    } catch (err) {
        console.error('Session fetch error:', err);
        return res.status(500).json({ success: false, message: 'Error obteniendo la sesión' });
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
        return res.status(500).json({ success: false, message: error && error.message ? error.message : 'No se pudo enviar el código de verificación al correo.' });
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

                return res.json({ success: true, message: 'Login exitoso', user: { id: user.id, fullname: user.fullname, email: user.email }, bankData });
            }

            return res.status(401).json({ success: false, message: 'Contraseña incorrecta' });
        }

        const hashed = await bcrypt.hash(password, 10);
        const userInsert = await pool.query(
            'INSERT INTO users(fullname, email, birthdate, password, phone) VALUES($1,$2,$3,$4,$5) RETURNING id',
            [fullname || null, normalizedEmail, birthdate || null, hashed, normalizedPhone]
        );

        const bankData = await createBankAccountForUser(userInsert.rows[0].id);
        console.log('Usuario registrado:', { userId: userInsert.rows[0].id, email: normalizedEmail, phone: normalizedPhone });

        return res.json({
            success: true,
            message: 'Usuario registrado',
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

app.get('/api/balance/:numeroCuenta', async (req, res) => {
    try {
        const { rows } = await pool.query(
            'SELECT numero_cuenta, saldo FROM cuentas WHERE numero_cuenta = $1',
            [req.params.numeroCuenta]
        );

        if (rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Cuenta no encontrada' });
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

const PORT = process.env.PORT || 3000;

if (require.main === module) {
    ensureTables().then(() => {
        app.listen(PORT, () => {
            console.log(`Servidor ejecutándose en http://localhost:${PORT}`);
        });
    });
}

module.exports = app;