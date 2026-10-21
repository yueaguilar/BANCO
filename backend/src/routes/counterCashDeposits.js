const crypto = require('crypto');
const bcrypt = require('bcrypt');
const express = require('express');
const jwt = require('jsonwebtoken');
const pool = require('../database');
const { authenticateDevice } = require('./counterDeposits');
const { verifyNip } = require('../services/cardGenerator');

const router = express.Router();
const DENOMINATIONS = new Set([20, 50, 100, 200, 500]);
const MAX_BILLS = 10000;
const MAX_NIP_ATTEMPTS = 5;
const NIP_LOCK_MINUTES = 15;
const MAX_COUNT_AGE_MS = 15 * 60 * 1000;
const DUMMY_NIP_HASH = bcrypt.hashSync(crypto.randomBytes(4).toString('hex'), 10);

function validUuid(value) {
    return typeof value === 'string'
        && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function getCounterSession(req, res, next) {
    const secret = process.env.JWT_SECRET;
    if (!secret || secret.length < 32) {
        return res.status(503).json({ success: false, message: 'La autenticación no está configurada.' });
    }

    const authorization = req.get('authorization') || '';
    const match = authorization.match(/^Bearer\s+(.+)$/i);
    if (!match) {
        return res.status(401).json({ success: false, message: 'La cuenta del depósito no está autenticada.' });
    }

    try {
        const claims = jwt.verify(match[1], secret, {
            issuer: 'banco-kike-counter-api',
            audience: 'banco-kike-counter'
        });
        const accountId = Number(claims.sub);
        if (!Number.isSafeInteger(accountId) || accountId <= 0
            || typeof claims.dispositivo_id !== 'string'
            || !req.authorizedDeviceIds.includes(claims.dispositivo_id)
            || req.body?.dispositivo_id !== claims.dispositivo_id) {
            return res.status(401).json({ success: false, message: 'La sesión del contador no es válida para este dispositivo.' });
        }
        req.counterSession = { accountId, deviceId: claims.dispositivo_id };
        return next();
    } catch {
        return res.status(401).json({ success: false, message: 'La sesión del contador no es válida o expiró.' });
    }
}

function matchesDeposit(existing, session, body, declared, detected) {
    return Number(existing.cuenta_id) === session.accountId
        && existing.dispositivo_id === session.deviceId
        && Number(existing.denominacion) === body.denominacion
        && Number(existing.cantidad_billetes) === declared
        && declared === detected;
}

function respondWithDatabaseError(res, error, message) {
    console.error(message, error);
    return res.status(500).json({ success: false, message });
}

router.post('/api/contador/depositos/autenticar', authenticateDevice, async (req, res) => {
    const { numero_cuenta: numeroCuenta, nip, dispositivo_id: deviceId } = req.body || {};
    const accountNumber = typeof numeroCuenta === 'string' ? numeroCuenta.trim() : '';
    if (!/^\d{10}$/.test(accountNumber) || typeof nip !== 'string' || !/^\d{4}$/.test(nip)) {
        return res.status(400).json({ success: false, message: 'El número de cuenta o el NIP no tiene un formato válido.' });
    }
    if (typeof deviceId !== 'string' || !req.authorizedDeviceIds.includes(deviceId)) {
        return res.status(403).json({ success: false, message: 'El identificador del dispositivo no está permitido.' });
    }
    const secret = process.env.JWT_SECRET;
    if (!secret || secret.length < 32) {
        return res.status(503).json({ success: false, message: 'La autenticación no está configurada.' });
    }

    let client;
    try {
        client = await pool.connect();
        await client.query('BEGIN');
        await client.query(
            `INSERT INTO contador_intentos_nip (dispositivo_id, numero_cuenta)
             VALUES ($1, $2)
             ON CONFLICT (dispositivo_id, numero_cuenta) DO NOTHING`,
            [deviceId, accountNumber]
        );
        const attemptResult = await client.query(
            `SELECT intentos, bloqueado_hasta
             FROM contador_intentos_nip
             WHERE dispositivo_id = $1 AND numero_cuenta = $2
             FOR UPDATE`,
            [deviceId, accountNumber]
        );
        const attempt = attemptResult.rows[0];
        if (attempt.bloqueado_hasta && new Date(attempt.bloqueado_hasta).getTime() > Date.now()) {
            await client.query('ROLLBACK');
            return res.status(429).json({
                success: false,
                message: 'Se alcanzó el límite de intentos. Intenta de nuevo en 15 minutos.'
            });
        }
        if (attempt.bloqueado_hasta) {
            await client.query(
                `UPDATE contador_intentos_nip
                 SET intentos = 0, bloqueado_hasta = NULL, updated_at = NOW()
                 WHERE dispositivo_id = $1 AND numero_cuenta = $2`,
                [deviceId, accountNumber]
            );
        }

        const accountResult = await client.query(
            `SELECT c.id, c.numero_cuenta, t.nip_hash
             FROM cuentas c
             JOIN tarjetas t ON t.cuenta_id = c.id
             WHERE c.numero_cuenta = $1`,
            [accountNumber]
        );
        const hashes = accountResult.rows.map((row) => row.nip_hash);
        const comparisons = await Promise.all((hashes.length > 0 ? hashes : [DUMMY_NIP_HASH])
            .map((hash) => verifyNip(nip, hash)));
        const validIndex = comparisons.findIndex(Boolean);
        const authenticatedAccount = validIndex >= 0 ? accountResult.rows[validIndex] : null;

        if (!authenticatedAccount) {
            await client.query(
                `UPDATE contador_intentos_nip
                 SET intentos = intentos + 1,
                     bloqueado_hasta = CASE
                         WHEN intentos + 1 >= $3 THEN NOW() + ($4 * INTERVAL '1 minute')
                         ELSE NULL
                     END,
                     updated_at = NOW()
                 WHERE dispositivo_id = $1 AND numero_cuenta = $2`,
                [deviceId, accountNumber, MAX_NIP_ATTEMPTS, NIP_LOCK_MINUTES]
            );
            await client.query('COMMIT');
            return res.status(401).json({ success: false, message: 'La cuenta o el NIP son incorrectos.' });
        }

        await client.query(
            `UPDATE contador_intentos_nip
             SET intentos = 0, bloqueado_hasta = NULL, updated_at = NOW()
             WHERE dispositivo_id = $1 AND numero_cuenta = $2`,
            [deviceId, accountNumber]
        );
        await client.query('COMMIT');
        const token = jwt.sign({ dispositivo_id: deviceId }, secret, {
            subject: String(authenticatedAccount.id),
            issuer: 'banco-kike-counter-api',
            audience: 'banco-kike-counter',
            expiresIn: '10m'
        });
        return res.json({
            success: true,
            message: 'Cuenta autenticada.',
            data: { token, numero_cuenta: authenticatedAccount.numero_cuenta, expires_in: 600 }
        });
    } catch (error) {
        if (client) {
            try {
                await client.query('ROLLBACK');
            } catch (rollbackError) {
                console.error('Error revirtiendo autenticación del contador:', rollbackError);
            }
        }
        return respondWithDatabaseError(res, error, 'No se pudo autenticar la cuenta del depósito.');
    } finally {
        if (client) client.release();
    }
});

router.post('/api/contador/depositos/preparar', authenticateDevice, getCounterSession, async (req, res) => {
    const body = req.body || {};
    const operationId = body.operacion_id;
    const denomination = body.denominacion;
    const declared = body.cantidad_declarada;
    const detected = body.cantidad_detectada;
    if (!validUuid(operationId)) {
        return res.status(400).json({ success: false, message: 'El identificador de operación debe ser un UUID válido.' });
    }
    if (!DENOMINATIONS.has(denomination)) {
        return res.status(400).json({ success: false, message: 'La denominación debe ser 20, 50, 100, 200 o 500 pesos.' });
    }
    if (!Number.isSafeInteger(declared) || declared < 1 || declared > MAX_BILLS
        || !Number.isSafeInteger(detected) || detected < 1 || detected > MAX_BILLS) {
        return res.status(400).json({ success: false, message: `Las cantidades deben ser enteros entre 1 y ${MAX_BILLS}.` });
    }
    if (declared !== detected) {
        return res.status(422).json({ success: false, message: 'La cantidad declarada no coincide con la detectada; no se registró el depósito.' });
    }

    let client;
    try {
        client = await pool.connect();
        await client.query('BEGIN');
        await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [operationId]);
        const existingResult = await client.query(
            `SELECT d.operacion_id, d.cuenta_id, d.contador_id, d.denominacion, d.cantidad_billetes,
                    d.importe, d.estado, c.dispositivo_id, a.numero_cuenta
             FROM depositos d
             JOIN contadores c ON c.id = d.contador_id
             JOIN cuentas a ON a.id = d.cuenta_id
             WHERE d.operacion_id = $1`,
            [operationId]
        );
        if (existingResult.rows.length > 0) {
            const existing = existingResult.rows[0];
            if (existing.estado === 'cancelado'
                || !matchesDeposit(existing, req.counterSession, body, declared, detected)) {
                await client.query('ROLLBACK');
                return res.status(409).json({ success: false, message: 'El identificador de operación ya está asociado a otros datos.' });
            }
            await client.query('COMMIT');
            return res.json({
                success: true,
                duplicate: true,
                message: 'La operación ya había sido preparada.',
                data: {
                    operacion_id: existing.operacion_id,
                    numero_cuenta: existing.numero_cuenta,
                    denominacion: Number(existing.denominacion),
                    cantidad_billetes: Number(existing.cantidad_billetes),
                    importe: Number(existing.importe),
                    estado: existing.estado
                }
            });
        }

        const accountResult = await client.query(
            'SELECT id, numero_cuenta FROM cuentas WHERE id = $1',
            [req.counterSession.accountId]
        );
        if (accountResult.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(401).json({ success: false, message: 'La cuenta autenticada ya no está disponible.' });
        }
        const counterResult = await client.query(
            `INSERT INTO contadores (dispositivo_id, cantidad_billetes, fecha_hora, lote_id)
             VALUES ($1, $2, NOW(), $3)
             RETURNING id`,
            [req.counterSession.deviceId, detected, operationId]
        );
        const amount = denomination * detected;
        await client.query(
            `INSERT INTO depositos
                (operacion_id, cuenta_id, contador_id, denominacion, cantidad_billetes, importe, estado)
             VALUES ($1, $2, $3, $4, $5, $6, 'pendiente')`,
            [operationId, req.counterSession.accountId, counterResult.rows[0].id, denomination, detected, amount]
        );
        await client.query('COMMIT');
        return res.status(201).json({
            success: true,
            message: 'Conteo validado. Confirma el depósito con la tecla A.',
            data: {
                operacion_id: operationId,
                numero_cuenta: accountResult.rows[0].numero_cuenta,
                contador_id: counterResult.rows[0].id,
                denominacion: denomination,
                cantidad_billetes: detected,
                importe: amount,
                estado: 'pendiente'
            }
        });
    } catch (error) {
        if (client) {
            try {
                await client.query('ROLLBACK');
            } catch (rollbackError) {
                console.error('Error revirtiendo preparación del depósito:', rollbackError);
            }
        }
        return respondWithDatabaseError(res, error, 'No se pudo preparar el depósito.');
    } finally {
        if (client) client.release();
    }
});

router.post('/api/contador/depositos/confirmar', authenticateDevice, getCounterSession, async (req, res) => {
    const { operacion_id: operationId, confirmacion } = req.body || {};
    if (!validUuid(operationId)) {
        return res.status(400).json({ success: false, message: 'El identificador de operación debe ser un UUID válido.' });
    }
    if (confirmacion !== 'A') {
        return res.status(400).json({ success: false, message: 'La confirmación debe corresponder a la tecla A.' });
    }

    let client;
    try {
        client = await pool.connect();
        await client.query('BEGIN');
        const depositResult = await client.query(
            `SELECT d.operacion_id, d.cuenta_id, d.denominacion, d.cantidad_billetes, d.importe,
                    d.estado, d.saldo_resultante, ct.dispositivo_id, ct.created_at AS conteo_creado
             FROM depositos d
             JOIN contadores ct ON ct.id = d.contador_id
             WHERE d.operacion_id = $1 AND d.cuenta_id = $2
             FOR UPDATE OF d`,
            [operationId, req.counterSession.accountId]
        );
        if (depositResult.rows.length === 0 || depositResult.rows[0].dispositivo_id !== req.counterSession.deviceId) {
            await client.query('ROLLBACK');
            return res.status(404).json({ success: false, message: 'No se encontró una operación de depósito válida para esta cuenta y dispositivo.' });
        }
        const deposit = depositResult.rows[0];
        if (deposit.estado === 'confirmado') {
            await client.query('COMMIT');
            return res.json({
                success: true,
                duplicate: true,
                message: 'El depósito ya había sido confirmado.',
                data: {
                    operacion_id: deposit.operacion_id,
                    importe: Number(deposit.importe),
                    saldo: Number(deposit.saldo_resultante),
                    estado: deposit.estado
                }
            });
        }
        if (deposit.estado !== 'pendiente') {
            await client.query('ROLLBACK');
            return res.status(409).json({ success: false, message: 'El depósito no está pendiente de confirmación.' });
        }
        const countAge = Date.now() - new Date(deposit.conteo_creado).getTime();
        if (!Number.isFinite(countAge) || countAge < 0 || countAge > MAX_COUNT_AGE_MS) {
            await client.query('ROLLBACK');
            return res.status(410).json({ success: false, message: 'El conteo expiró; inicia una nueva operación.' });
        }

        const balanceResult = await client.query(
            `UPDATE cuentas
             SET saldo = saldo + $1
             WHERE id = $2 AND saldo + $1 <= 9999999999.99
             RETURNING saldo`,
            [deposit.importe, deposit.cuenta_id]
        );
        if (balanceResult.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(409).json({ success: false, message: 'El saldo excedería el límite permitido para la cuenta.' });
        }
        await client.query(
            `INSERT INTO movimientos (cuenta_id, tipo, monto, descripcion, referencia_id)
             VALUES ($1, 'deposito_contador', $2, $3, $4)`,
            [deposit.cuenta_id, deposit.importe, `Depósito de ${deposit.cantidad_billetes} billetes de $${deposit.denominacion}`, operationId]
        );
        await client.query(
            `UPDATE depositos
             SET estado = 'confirmado', confirmado_at = NOW(), saldo_resultante = $2
             WHERE operacion_id = $1`,
            [operationId, balanceResult.rows[0].saldo]
        );
        await client.query('COMMIT');
        return res.json({
            success: true,
            message: 'Depósito confirmado y abonado.',
            data: {
                operacion_id: operationId,
                importe: Number(deposit.importe),
                saldo: Number(balanceResult.rows[0].saldo),
                estado: 'confirmado'
            }
        });
    } catch (error) {
        if (client) {
            try {
                await client.query('ROLLBACK');
            } catch (rollbackError) {
                console.error('Error revirtiendo confirmación del contador:', rollbackError);
            }
        }
        return respondWithDatabaseError(res, error, 'No se pudo confirmar el depósito.');
    } finally {
        if (client) client.release();
    }
});

module.exports = router;
