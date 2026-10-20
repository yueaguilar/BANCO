const crypto = require('crypto');
const express = require('express');
const pool = require('../database');
const authenticateUser = require('../middleware/authenticateUser');

const router = express.Router();
const DENOMINACIONES_PERMITIDAS = new Set([20, 50, 100, 200, 500]);
const MAXIMO_BILLETES = 10000;
const MAXIMA_ANTIGUEDAD_CONTEO_MS = 15 * 60 * 1000;

function getAuthorizedDeviceIds() {
    const configured = String(process.env.COUNTER_DEVICE_IDS || '')
        .split(',')
        .map((deviceId) => deviceId.trim())
        .filter(Boolean);

    return [...new Set(configured)];
}

function validUuid(value) {
    return typeof value === 'string'
        && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function authenticateDevice(req, res, next) {
    const configuredToken = process.env.COUNTER_DEVICE_TOKEN || '';
    const configuredDevices = getAuthorizedDeviceIds();
    const providedToken = req.get('x-device-token') || '';
    const expected = Buffer.from(configuredToken);
    const provided = Buffer.from(providedToken);

    if (configuredToken.length < 32 || configuredDevices.length === 0) {
        return res.status(503).json({ success: false, message: 'La autenticación del contador no está configurada.' });
    }

    if (expected.length !== provided.length || !crypto.timingSafeEqual(expected, provided)) {
        return res.status(401).json({ success: false, message: 'El dispositivo no está autorizado.' });
    }

    req.authorizedDeviceIds = configuredDevices;
    return next();
}

function respondWithDatabaseError(res, error, message) {
    console.error(message, error);
    return res.status(500).json({ success: false, message });
}

router.post('/api/contador', authenticateDevice, async (req, res) => {
    const body = req.body || {};
    const dispositivoId = typeof body.dispositivo_id === 'string' ? body.dispositivo_id.trim() : '';
    const cantidadBilletes = body.cantidad_billetes;
    const loteId = body.lote_id;
    const deviceIds = req.authorizedDeviceIds;

    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(dispositivoId)) {
        return res.status(400).json({
            success: false,
            message: 'El identificador del dispositivo no es válido.'
        });
    }

    if (!deviceIds.includes(dispositivoId)) {
        return res.status(403).json({ success: false, message: 'El identificador del dispositivo no está permitido.' });
    }

    if (!Number.isSafeInteger(cantidadBilletes) || cantidadBilletes < 1 || cantidadBilletes > MAXIMO_BILLETES) {
        return res.status(400).json({
            success: false,
            message: `La cantidad de billetes debe ser un entero entre 1 y ${MAXIMO_BILLETES}.`
        });
    }

    if (!validUuid(loteId)) {
        return res.status(400).json({ success: false, message: 'Cada lote debe incluir un lote_id UUID estable.' });
    }
    if (body.estado !== 'completado') {
        return res.status(400).json({ success: false, message: 'Solo se aceptan lotes con conteo completado.' });
    }

    const fechaHora = new Date(body.fecha_hora);
    if (typeof body.fecha_hora !== 'string' || Number.isNaN(fechaHora.getTime())) {
        return res.status(400).json({
            success: false,
            message: 'La fecha y hora no son válidas.'
        });
    }
    if (fechaHora.getTime() > Date.now() + 5 * 60 * 1000) {
        return res.status(400).json({ success: false, message: 'La fecha del conteo no puede estar en el futuro.' });
    }

    try {
        const { rows } = await pool.query(
            `INSERT INTO contadores (dispositivo_id, cantidad_billetes, fecha_hora, lote_id)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (dispositivo_id, lote_id) WHERE lote_id IS NOT NULL DO NOTHING
             RETURNING id, dispositivo_id, cantidad_billetes, fecha_hora, created_at, lote_id`,
            [dispositivoId, cantidadBilletes, fechaHora.toISOString(), loteId]
        );

        if (rows.length === 0) {
            const existing = await pool.query(
                `SELECT id, dispositivo_id, cantidad_billetes, fecha_hora, created_at, lote_id
                 FROM contadores
                 WHERE dispositivo_id = $1 AND lote_id = $2`,
                [dispositivoId, loteId]
            );
            if (existing.rows.length === 0 || Number(existing.rows[0].cantidad_billetes) !== cantidadBilletes) {
                return res.status(409).json({ success: false, message: 'El lote ya existe con datos diferentes.' });
            }
            return res.status(200).json({
                success: true,
                message: 'Este lote ya había sido recibido.',
                data: existing.rows[0],
                duplicate: true
            });
        }

        return res.status(200).json({
            success: true,
            message: 'Registro del contador guardado correctamente.',
            data: rows[0]
        });
    } catch (error) {
        return respondWithDatabaseError(res, error, 'No se pudo guardar el registro del contador.');
    }
});

router.get('/api/contador/pendientes', authenticateUser, async (req, res) => {
    const deviceIds = getAuthorizedDeviceIds();
    if (deviceIds.length === 0) {
        return res.status(503).json({ success: false, message: 'La lista de dispositivos autorizados no está configurada.' });
    }
    try {
        const { rows } = await pool.query(
            `SELECT c.id, c.dispositivo_id, c.cantidad_billetes, c.fecha_hora, c.created_at, c.lote_id
             FROM contadores c
             WHERE c.dispositivo_id = ANY($1::varchar[])
               AND c.cantidad_billetes > 0
               AND c.created_at >= NOW() - INTERVAL '15 minutes'
               AND NOT EXISTS (SELECT 1 FROM depositos d WHERE d.contador_id = c.id AND d.estado <> 'cancelado')
             ORDER BY c.created_at DESC
             LIMIT 30`,
            [deviceIds]
        );
        return res.json({ success: true, data: rows });
    } catch (error) {
        return respondWithDatabaseError(res, error, 'No se pudieron consultar los conteos pendientes.');
    }
});

router.post('/api/depositos/contador/validar', authenticateUser, async (req, res) => {
    const { operacion_id: operacionId, numero_cuenta: numeroCuenta, contador_id: contadorId, denominacion } = req.body || {};
    const cuenta = typeof numeroCuenta === 'string' ? numeroCuenta.trim() : '';

    if (!validUuid(operacionId)) {
        return res.status(400).json({ success: false, message: 'El identificador de operación debe ser un UUID válido.' });
    }
    if (!/^\d{10}$/.test(cuenta)) {
        return res.status(400).json({ success: false, message: 'El número de cuenta debe tener 10 dígitos.' });
    }
    if (!Number.isSafeInteger(contadorId) || contadorId <= 0) {
        return res.status(400).json({ success: false, message: 'El identificador del conteo no es válido.' });
    }

    const denomination = Number(denominacion);
    if (!DENOMINACIONES_PERMITIDAS.has(denomination)) {
        return res.status(400).json({ success: false, message: 'La denominación debe ser 20, 50, 100, 200 o 500 pesos.' });
    }

    try {
        const previous = await pool.query(
            `SELECT d.operacion_id, d.cuenta_id, d.contador_id, d.denominacion, d.cantidad_billetes,
                    d.importe, d.estado, c.numero_cuenta
             FROM depositos d
             JOIN cuentas c ON c.id = d.cuenta_id
             WHERE d.operacion_id = $1 AND c.usuario_id = $2`,
            [operacionId, req.user.id]
        );
        if (previous.rows.length > 0) {
            const operation = previous.rows[0];
            if (Number(operation.contador_id) !== contadorId || Number(operation.denominacion) !== denomination
                || operation.numero_cuenta !== cuenta || operation.estado !== 'pendiente') {
                return res.status(409).json({ success: false, message: 'El identificador de operación ya está asociado a otros datos.' });
            }
            return res.json({ success: true, message: 'La operación ya fue validada.', data: operation });
        }

        const accountResult = await pool.query(
            'SELECT id, numero_cuenta FROM cuentas WHERE numero_cuenta = $1 AND usuario_id = $2',
            [cuenta, req.user.id]
        );
        if (accountResult.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'La cuenta no existe o no pertenece al usuario autenticado.' });
        }

        const countResult = await pool.query(
            `SELECT id, dispositivo_id, cantidad_billetes, created_at
             FROM contadores
             WHERE id = $1 AND dispositivo_id = ANY($2::varchar[])`,
            [contadorId, getAuthorizedDeviceIds()]
        );
        if (countResult.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'No se encontró un conteo de un dispositivo autorizado.' });
        }

        const count = countResult.rows[0];
        const cantidadBilletes = Number(count.cantidad_billetes);
        if (!Number.isSafeInteger(cantidadBilletes) || cantidadBilletes < 1 || cantidadBilletes > MAXIMO_BILLETES) {
            return res.status(400).json({ success: false, message: 'La cantidad del conteo está fuera de los límites permitidos.' });
        }
        const receivedAt = new Date(count.created_at).getTime();
        if (!Number.isFinite(receivedAt) || Date.now() - receivedAt > MAXIMA_ANTIGUEDAD_CONTEO_MS) {
            return res.status(410).json({ success: false, message: 'El conteo expiró; solicita una nueva medición al dispositivo.' });
        }

        const importe = cantidadBilletes * denomination;
        const { rows } = await pool.query(
            `INSERT INTO depositos
                (operacion_id, cuenta_id, contador_id, denominacion, cantidad_billetes, importe, estado)
             VALUES ($1, $2, $3, $4, $5, $6, 'pendiente')
             RETURNING operacion_id, cuenta_id, contador_id, denominacion, cantidad_billetes, importe, estado, created_at`,
            [operacionId, accountResult.rows[0].id, contadorId, denomination, cantidadBilletes, importe]
        );
        return res.status(201).json({
            success: true,
            message: 'Conteo y cuenta validados. Confirma para acreditar el depósito.',
            data: { ...rows[0], numero_cuenta: cuenta }
        });
    } catch (error) {
        if (error.code === '23505') {
            return res.status(409).json({ success: false, message: 'El conteo u operación ya fue asociado a otro depósito.' });
        }
        return respondWithDatabaseError(res, error, 'No se pudo validar el depósito.');
    }
});

router.post('/api/depositos/contador/confirmar', authenticateUser, async (req, res) => {
    const { operacion_id: operacionId } = req.body || {};
    if (!validUuid(operacionId)) {
        return res.status(400).json({ success: false, message: 'El identificador de operación debe ser un UUID válido.' });
    }

    let client;
    try {
        client = await pool.connect();
        await client.query('BEGIN');
        const depositResult = await client.query(
            `SELECT d.operacion_id, d.cuenta_id, d.contador_id, d.denominacion, d.cantidad_billetes,
                    d.importe, d.estado, d.saldo_resultante, d.created_at, c.numero_cuenta, ct.created_at AS conteo_creado
             FROM depositos d
             JOIN cuentas c ON c.id = d.cuenta_id
             JOIN contadores ct ON ct.id = d.contador_id
             WHERE d.operacion_id = $1 AND c.usuario_id = $2
             FOR UPDATE OF d`,
            [operacionId, req.user.id]
        );
        if (depositResult.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ success: false, message: 'No se encontró una operación autorizada para confirmar.' });
        }

        const deposit = depositResult.rows[0];
        if (deposit.estado === 'confirmado') {
            await client.query('COMMIT');
            return res.json({
                success: true,
                message: 'El depósito ya había sido confirmado.',
                data: { operacion_id: deposit.operacion_id, estado: deposit.estado, importe: Number(deposit.importe), saldo: Number(deposit.saldo_resultante) }
            });
        }
        if (deposit.estado !== 'pendiente') {
            await client.query('ROLLBACK');
            return res.status(409).json({ success: false, message: 'La operación no se encuentra pendiente de confirmación.' });
        }
        const receivedAt = new Date(deposit.conteo_creado).getTime();
        if (!Number.isFinite(receivedAt) || Date.now() - receivedAt > MAXIMA_ANTIGUEDAD_CONTEO_MS) {
            await client.query('ROLLBACK');
            return res.status(410).json({ success: false, message: 'El conteo expiró; valida un nuevo conteo antes de confirmar.' });
        }

        const accountResult = await client.query(
            'SELECT saldo FROM cuentas WHERE id = $1 AND usuario_id = $2 FOR UPDATE',
            [deposit.cuenta_id, req.user.id]
        );
        if (accountResult.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ success: false, message: 'La cuenta ya no está disponible para este usuario.' });
        }

        const balance = Number(accountResult.rows[0].saldo) + Number(deposit.importe);
        if (!Number.isFinite(balance) || balance > 9999999999.99) {
            await client.query('ROLLBACK');
            return res.status(409).json({ success: false, message: 'El saldo excedería el límite permitido para la cuenta.' });
        }

        const balanceResult = await client.query(
            'UPDATE cuentas SET saldo = saldo + $1 WHERE id = $2 RETURNING saldo',
            [deposit.importe, deposit.cuenta_id]
        );
        await client.query(
            `INSERT INTO movimientos (cuenta_id, tipo, monto, descripcion, referencia_id)
             VALUES ($1, 'deposito_contador', $2, $3, $4)`,
            [deposit.cuenta_id, deposit.importe, `Depósito de ${deposit.cantidad_billetes} billetes de $${deposit.denominacion}`, operacionId]
        );
        const confirmed = await client.query(
            `UPDATE depositos
             SET estado = 'confirmado', confirmado_at = NOW(), saldo_resultante = $2
             WHERE operacion_id = $1
             RETURNING operacion_id, estado, importe, saldo_resultante, confirmado_at`,
            [operacionId, balanceResult.rows[0].saldo]
        );
        await client.query('COMMIT');

        return res.json({
            success: true,
            message: 'Depósito confirmado y registrado correctamente.',
            data: {
                operacion_id: confirmed.rows[0].operacion_id,
                estado: confirmed.rows[0].estado,
                importe: Number(confirmed.rows[0].importe),
                saldo: Number(confirmed.rows[0].saldo_resultante),
                confirmado_at: confirmed.rows[0].confirmado_at
            }
        });
    } catch (error) {
        try {
            await client.query('ROLLBACK');
        } catch (rollbackError) {
            console.error('Error revirtiendo la transacción del depósito:', rollbackError);
        }
        return respondWithDatabaseError(res, error, 'No se pudo confirmar el depósito.');
    } finally {
        if (client) client.release();
    }
});

router.post('/api/depositos/contador/cancelar', authenticateUser, async (req, res) => {
    const { operacion_id: operacionId } = req.body || {};
    if (!validUuid(operacionId)) {
        return res.status(400).json({ success: false, message: 'El identificador de operación debe ser un UUID válido.' });
    }
    try {
        const { rows } = await pool.query(
            `UPDATE depositos d
             SET estado = 'cancelado'
             FROM cuentas c
             WHERE d.cuenta_id = c.id
               AND d.operacion_id = $1
               AND c.usuario_id = $2
               AND d.estado = 'pendiente'
             RETURNING d.operacion_id, d.estado`,
            [operacionId, req.user.id]
        );
        if (rows.length === 0) {
            return res.status(409).json({ success: false, message: 'La operación no está pendiente o no pertenece al usuario.' });
        }
        return res.json({ success: true, message: 'La validación fue cancelada.', data: rows[0] });
    } catch (error) {
        return respondWithDatabaseError(res, error, 'No se pudo cancelar la validación del depósito.');
    }
});

router.get('/api/depositos/contador/:id', authenticateUser, async (req, res) => {
    if (!validUuid(req.params.id)) {
        return res.status(400).json({ success: false, message: 'El identificador de operación no es válido.' });
    }
    try {
        const { rows } = await pool.query(
            `SELECT d.operacion_id, c.numero_cuenta, d.contador_id, d.denominacion, d.cantidad_billetes,
                    d.importe, d.estado, d.saldo_resultante, d.created_at, d.confirmado_at
             FROM depositos d
             JOIN cuentas c ON c.id = d.cuenta_id
             WHERE d.operacion_id = $1 AND c.usuario_id = $2`,
            [req.params.id, req.user.id]
        );
        if (rows.length === 0) {
            return res.status(404).json({ success: false, message: 'No se encontró una operación para el usuario autenticado.' });
        }
        return res.json({ success: true, data: rows[0] });
    } catch (error) {
        return respondWithDatabaseError(res, error, 'No se pudo consultar el estado del depósito.');
    }
});

module.exports = router;
