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
    generateExpirationDate,
    generateCvv
} = require('./services/cardGenerator');

const app = express();

app.use(cors());
app.use(express.json());

const publicPath = path.join(__dirname, '../../app/public');
app.use(express.static(publicPath));

async function ensureTables() {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                fullname TEXT,
                email TEXT UNIQUE,
                birthdate DATE,
                password TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

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
                nip TEXT,
                nip_hash TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                CONSTRAINT fk_cuenta
                    FOREIGN KEY (cuenta_id)
                    REFERENCES cuentas(id)
                    ON DELETE CASCADE
            )
        `);

        await pool.query('ALTER TABLE tarjetas ADD COLUMN IF NOT EXISTS nip TEXT');

        console.log('Tablas verificadas');
    } catch (err) {
        console.error('Error ensuring tables:', err);
    }
}

async function createBankAccountForUser(userId) {
    const numeroCuenta = await generateAccountNumber();
    const numeroTarjeta = await generateCardNumber();
    const nip = generateNip();
    const expiracion = generateExpirationDate();

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const cuentaRes = await client.query(
            'INSERT INTO cuentas (usuario_id, numero_cuenta, saldo) VALUES ($1, $2, 0) RETURNING id, numero_cuenta, saldo',
            [userId, numeroCuenta]
        );

        const cuentaId = cuentaRes.rows[0].id;
        const nipHash = await bcrypt.hash(nip, 10);

        const tarjetaRes = await client.query(
            'INSERT INTO tarjetas (cuenta_id, numero_tarjeta, mes_expiracion, anio_expiracion, nip_hash) VALUES ($1, $2, $3, $4, $5) RETURNING id, numero_tarjeta, mes_expiracion, anio_expiracion',
            [cuentaId, numeroTarjeta, Number(expiracion.month), Number(expiracion.year), nipHash]
        );

        console.log('Valores para insertar tarjeta (antes update nip):', { cuentaId, numeroTarjeta, mes: Number(expiracion.month), anio: Number(expiracion.year), nip, nipHash: nipHash.slice(0,6) + '...' });

        // Some DB setups previously didn't persist `nip` reliably; set it explicitly after insert
        const tarjetaId = tarjetaRes.rows[0].id;
        await client.query('UPDATE tarjetas SET nip = $1 WHERE id = $2', [nip, tarjetaId]);

        await client.query('COMMIT');

        const tarjetaFinal = await client.query('SELECT id, numero_tarjeta, mes_expiracion, anio_expiracion, nip FROM tarjetas WHERE id = $1', [tarjetaId]);
        console.log('Resultado tarjeta final:', tarjetaFinal.rows[0]);

        // Do not store CVV in the database. Generate current CVV dynamically for immediate display.
        const currentCvv = generateCvv(numeroTarjeta, Number(expiracion.month), Number(expiracion.year), 0);

        const tarjeta = tarjetaRes.rows[0];

        console.log('Cuenta y tarjeta creadas:', { cuentaId, numeroCuenta, tarjetaId: tarjeta.id });

        return {
            numeroCuenta: String(cuentaRes.rows[0].numero_cuenta),
            numeroTarjeta: String(tarjeta.numero_tarjeta),
            nip: String(tarjeta.nip),
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
        `SELECT c.id as cuenta_id, c.numero_cuenta, c.saldo, t.id as tarjeta_id, t.numero_tarjeta, t.mes_expiracion, t.anio_expiracion, t.nip
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
        nip: cuentaInfo.nip || null,
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
    res.sendFile(path.join(publicPath, 'pages', 'login.html'));
});

app.get('/login.html', (req, res) => {
    res.sendFile(path.join(publicPath, 'pages', 'login.html'));
});

app.get('/app', (req, res) => {
    res.sendFile(path.join(publicPath, 'pages', 'app.html'));
});

app.get('/app.html', (req, res) => {
    res.sendFile(path.join(publicPath, 'pages', 'app.html'));
});

app.get('/:page.html', (req, res) => {
    const page = req.params.page;
    if (!validPages.includes(page)) {
        return res.status(404).send('Página no encontrada');
    }

    const filePath = path.join(publicPath, 'pages', `${page}.html`);
    if (!fs.existsSync(filePath)) {
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

app.post('/api/auth', async (req, res) => {
    const { email, fullname, birthdate, password } = req.body;
    if (!email || !password) {
        return res.status(400).json({ success: false, message: 'email y password requeridos' });
    }

    try {
        const { rows } = await pool.query('SELECT * FROM users WHERE email = $1', [email]);

        if (rows.length > 0) {
            const user = rows[0];
            const match = await bcrypt.compare(password, user.password);
            if (match) {
                const bankData = await getBankDataForUser(user.id);

                return res.json({ success: true, message: 'Login exitoso', user: { id: user.id, fullname: user.fullname, email: user.email }, bankData });
            }

            return res.status(401).json({ success: false, message: 'Contraseña incorrecta' });
        }

        const hashed = await bcrypt.hash(password, 10);
        const userInsert = await pool.query(
            'INSERT INTO users(fullname, email, birthdate, password) VALUES($1,$2,$3,$4) RETURNING id',
            [fullname || null, email, birthdate || null, hashed]
        );

        const bankData = await createBankAccountForUser(userInsert.rows[0].id);
        console.log('Usuario registrado:', { userId: userInsert.rows[0].id, email });
        console.log('bankData devuelto:', bankData);

        return res.json({
            success: true,
            message: 'Usuario registrado',
            user: {
                id: userInsert.rows[0].id,
                fullname: fullname || null,
                email
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
        const isNipValid = await bcrypt.compare(String(nip), cuenta.nip_hash);
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

        const nuevoSaldo = Number(cuenta.saldo) + Number(amount);
        await pool.query('UPDATE cuentas SET saldo = $1 WHERE id = $2', [nuevoSaldo, cuenta.id]);

        return res.json({
            success: true,
            message: 'Depósito realizado con éxito',
            saldo: nuevoSaldo
        });
    } catch (err) {
        console.error('Deposit error:', err);
        return res.status(500).json({ success: false, message: 'Error procesando el depósito' });
    }
});

const PORT = process.env.PORT || 3000;

ensureTables().then(() => {
    app.listen(PORT, () => {
        console.log(`Servidor ejecutándose en http://localhost:${PORT}`);
    });
});