const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { hashNip } = require('../src/services/cardGenerator');

process.env.JWT_SECRET = 'test-jwt-secret-with-more-than-32-characters';
process.env.COUNTER_DEVICE_TOKEN = 'test-counter-token-with-more-than-32-characters';
process.env.COUNTER_DEVICE_IDS = 'CNT-001';

const app = require('../src/app');
const pool = require('../src/database');

const originalConnect = pool.connect.bind(pool);
const operationId = () => crypto.randomUUID();
const deviceHeaders = {
    'Content-Type': 'application/json',
    'x-device-token': process.env.COUNTER_DEVICE_TOKEN
};

function counterToken(accountId = 11, deviceId = 'CNT-001') {
    return jwt.sign({ dispositivo_id: deviceId }, process.env.JWT_SECRET, {
        subject: String(accountId),
        issuer: 'banco-kike-counter-api',
        audience: 'banco-kike-counter',
        expiresIn: '10m'
    });
}

async function startServer() {
    const server = app.listen(0);
    await new Promise((resolve) => server.once('listening', resolve));
    return {
        server,
        url: `http://127.0.0.1:${server.address().port}`,
        async close() {
            await new Promise((resolve) => server.close(resolve));
            pool.connect = originalConnect;
        }
    };
}

function createCounterAuthDatabase({
    account = {
        id: 11,
        userId: 7,
        accountNumber: '1234567890',
        cardHashes: []
    },
    temporaryNip = null,
    failOnQuery = null
} = {}) {
    const state = {
        attempts: 0,
        blockedUntil: null,
        temporaryNip: temporaryNip ? { ...temporaryNip } : null,
        ownerLookups: [],
        rolledBack: false
    };
    let snapshot;
    const client = {
        async query(sql, params = []) {
            const query = String(sql);
            if (failOnQuery && query.includes(failOnQuery)) {
                throw Object.assign(new Error('Database query failed'), { code: 'DBFAIL' });
            }
            if (query === 'BEGIN') {
                snapshot = {
                    attempts: state.attempts,
                    blockedUntil: state.blockedUntil,
                    temporaryNip: state.temporaryNip ? { ...state.temporaryNip } : null
                };
                return { rows: [] };
            }
            if (query === 'COMMIT') return { rows: [] };
            if (query === 'ROLLBACK') {
                if (snapshot) {
                    state.attempts = snapshot.attempts;
                    state.blockedUntil = snapshot.blockedUntil;
                    state.temporaryNip = snapshot.temporaryNip;
                    state.rolledBack = true;
                }
                return { rows: [] };
            }
            if (query.includes('SELECT intentos, bloqueado_hasta')) {
                return { rows: [{ intentos: state.attempts, bloqueado_hasta: state.blockedUntil }] };
            }
            if (query.includes('SELECT c.id, c.usuario_id, c.numero_cuenta, t.nip_hash')) {
                if (!account || params[0] !== account.accountNumber) return { rows: [] };
                return {
                    rows: account.cardHashes.map((nip_hash) => ({
                        id: account.id,
                        usuario_id: account.userId,
                        numero_cuenta: account.accountNumber,
                        nip_hash
                    }))
                };
            }
            if (query.includes('FROM temporary_nip_attempts') && query.includes('FOR UPDATE')) {
                state.ownerLookups.push(params[0]);
                if (!state.temporaryNip || Number(params[0]) !== state.temporaryNip.userId) return { rows: [] };
                return {
                    rows: [{
                        failed_attempts: state.temporaryNip.failedAttempts,
                        blocked_until: state.temporaryNip.blockedUntil,
                        nip_hash: state.temporaryNip.nipHash,
                        expires_at: state.temporaryNip.expiresAt,
                        is_unexpired: Boolean(
                            state.temporaryNip.expiresAt
                            && new Date(state.temporaryNip.expiresAt).getTime() > Date.now()
                        ),
                        is_blocked: Boolean(
                            state.temporaryNip.blockedUntil
                            && new Date(state.temporaryNip.blockedUntil).getTime() > Date.now()
                        )
                    }]
                };
            }
            if (query.includes('SET failed_attempts = CASE')) {
                const nipAttempt = state.temporaryNip;
                nipAttempt.failedAttempts += 1;
                nipAttempt.blockedUntil = nipAttempt.failedAttempts >= params[1]
                    ? new Date(Date.now() + params[2] * 60_000)
                    : null;
                return { rows: [] };
            }
            if (query.includes('SET nip_hash = NULL, expires_at = NULL, failed_attempts = 0')) {
                const nipAttempt = state.temporaryNip;
                if (!nipAttempt
                    || Number(params[0]) !== nipAttempt.userId
                    || nipAttempt.nipHash !== params[1]
                    || new Date(nipAttempt.expiresAt).getTime() <= Date.now()
                    || (nipAttempt.blockedUntil && new Date(nipAttempt.blockedUntil).getTime() > Date.now())) {
                    return { rows: [] };
                }
                nipAttempt.nipHash = null;
                nipAttempt.expiresAt = null;
                nipAttempt.failedAttempts = 0;
                nipAttempt.blockedUntil = null;
                return { rows: [{ user_id: nipAttempt.userId }] };
            }
            if (query.includes('SET intentos = intentos + 1')) {
                state.attempts += 1;
                state.blockedUntil = state.attempts >= params[2]
                    ? new Date(Date.now() + params[3] * 60_000)
                    : null;
                return { rows: [] };
            }
            if (query.includes('SET intentos = 0, bloqueado_hasta = NULL')) {
                state.attempts = 0;
                state.blockedUntil = null;
                return { rows: [] };
            }
            return { rows: [] };
        },
        release() {}
    };
    return { client, state };
}

test('rechaza el NIP incorrecto y bloquea la cuenta después de cinco intentos', async () => {
    let attempts = 0;
    pool.connect = async () => ({
        async query(sql) {
            const query = String(sql);
            if (query === 'BEGIN' || query === 'COMMIT' || query === 'ROLLBACK') return { rows: [] };
            if (query.includes('SELECT intentos, bloqueado_hasta')) {
                return { rows: [{
                    intentos: attempts,
                    bloqueado_hasta: attempts >= 5 ? new Date(Date.now() + 60_000) : null
                }] };
            }
            if (query.includes('SELECT c.id, c.usuario_id, c.numero_cuenta, t.nip_hash')) return { rows: [] };
            if (query.includes('SET intentos = intentos + 1')) attempts += 1;
            return { rows: [] };
        },
        release() {}
    });

    const running = await startServer();
    try {
        for (let i = 0; i < 5; i += 1) {
            const response = await fetch(`${running.url}/api/contador/depositos/autenticar`, {
                method: 'POST',
                headers: deviceHeaders,
                body: JSON.stringify({
                    dispositivo_id: 'CNT-001',
                    numero_cuenta: '1234567890',
                    nip: '9999'
                })
            });
            assert.equal(response.status, 401);
        }
        const blocked = await fetch(`${running.url}/api/contador/depositos/autenticar`, {
            method: 'POST',
            headers: deviceHeaders,
            body: JSON.stringify({
                dispositivo_id: 'CNT-001',
                numero_cuenta: '1234567890',
                nip: '9999'
            })
        });
        assert.equal(blocked.status, 429);
        assert.equal(attempts, 5);
    } finally {
        await running.close();
    }
});

test('autentica el NIP contra el hash de la tarjeta y entrega una sesión temporal', async () => {
    const nipHash = await hashNip('1234');
    pool.connect = async () => ({
        async query(sql) {
            const query = String(sql);
            if (query === 'BEGIN' || query === 'COMMIT' || query === 'ROLLBACK') return { rows: [] };
            if (query.includes('SELECT intentos, bloqueado_hasta')) {
                return { rows: [{ intentos: 0, bloqueado_hasta: null }] };
            }
            if (query.includes('SELECT c.id, c.usuario_id, c.numero_cuenta, t.nip_hash')) {
                return { rows: [{ id: 11, usuario_id: 7, numero_cuenta: '1234567890', nip_hash: nipHash }] };
            }
            return { rows: [] };
        },
        release() {}
    });
    const running = await startServer();
    try {
        const response = await fetch(`${running.url}/api/contador/depositos/autenticar`, {
            method: 'POST',
            headers: deviceHeaders,
            body: JSON.stringify({
                dispositivo_id: 'CNT-001',
                numero_cuenta: '1234567890',
                nip: '1234'
            })
        });
        const body = await response.json();
        assert.equal(response.status, 200);
        assert.equal(body.success, true);
        assert.equal(body.data.numero_cuenta, '1234567890');
        const session = jwt.verify(body.data.token, process.env.JWT_SECRET, {
            issuer: 'banco-kike-counter-api',
            audience: 'banco-kike-counter'
        });
        assert.equal(session.sub, '11');
        assert.equal(session.dispositivo_id, 'CNT-001');
    } finally {
        await running.close();
    }
});

test('autentica con NIP temporal vigente, lo consume una sola vez y relaciona el usuario propietario', async () => {
    const temporaryNipHash = await bcrypt.hash('1234', 4);
    const cardHash = await bcrypt.hash('9999', 4);
    const rig = createCounterAuthDatabase({
        account: {
            id: 11,
            userId: 7,
            accountNumber: '1234567890',
            cardHashes: [cardHash]
        },
        temporaryNip: {
            userId: 7,
            nipHash: temporaryNipHash,
            expiresAt: new Date(Date.now() + 5 * 60_000),
            failedAttempts: 0,
            blockedUntil: null
        }
    });
    pool.connect = async () => rig.client;
    const running = await startServer();
    const payload = {
        dispositivo_id: 'CNT-001',
        numero_cuenta: '1234567890',
        nip: '1234'
    };
    try {
        const response = await fetch(`${running.url}/api/contador/depositos/autenticar`, {
            method: 'POST',
            headers: deviceHeaders,
            body: JSON.stringify(payload)
        });
        const body = await response.json();
        assert.equal(response.status, 200);
        assert.equal(body.success, true);
        assert.deepEqual(rig.state.ownerLookups, [7]);
        assert.equal(rig.state.temporaryNip.nipHash, null);
        assert.equal(JSON.stringify(body).includes(temporaryNipHash), false);
        const session = jwt.verify(body.data.token, process.env.JWT_SECRET, {
            issuer: 'banco-kike-counter-api',
            audience: 'banco-kike-counter'
        });
        assert.equal(session.sub, '11');

        const replay = await fetch(`${running.url}/api/contador/depositos/autenticar`, {
            method: 'POST',
            headers: deviceHeaders,
            body: JSON.stringify(payload)
        });
        assert.equal(replay.status, 401);
    } finally {
        await running.close();
    }
});

test('rechaza un NIP temporal incorrecto sin consumirlo', async () => {
    const temporaryNipHash = await bcrypt.hash('1234', 4);
    const cardHash = await bcrypt.hash('9999', 4);
    const rig = createCounterAuthDatabase({
        account: { id: 11, userId: 7, accountNumber: '1234567890', cardHashes: [cardHash] },
        temporaryNip: {
            userId: 7,
            nipHash: temporaryNipHash,
            expiresAt: new Date(Date.now() + 5 * 60_000),
            failedAttempts: 0,
            blockedUntil: null
        }
    });
    pool.connect = async () => rig.client;
    const running = await startServer();
    try {
        const response = await fetch(`${running.url}/api/contador/depositos/autenticar`, {
            method: 'POST',
            headers: deviceHeaders,
            body: JSON.stringify({
                dispositivo_id: 'CNT-001',
                numero_cuenta: '1234567890',
                nip: '1111'
            })
        });
        const body = await response.json();
        assert.equal(response.status, 401);
        assert.equal(rig.state.temporaryNip.nipHash, temporaryNipHash);
        assert.equal(rig.state.temporaryNip.failedAttempts, 1);
        assert.equal(JSON.stringify(body).includes(temporaryNipHash), false);
    } finally {
        await running.close();
    }
});

test('rechaza un NIP temporal vencido y no asocia NIP de otro usuario a la cuenta', async () => {
    const temporaryNipHash = await bcrypt.hash('1234', 4);
    const cardHash = await bcrypt.hash('9999', 4);
    const runAuthentication = async (userId, expiresAt) => {
        const rig = createCounterAuthDatabase({
            account: { id: 11, userId: 7, accountNumber: '1234567890', cardHashes: [cardHash] },
            temporaryNip: {
                userId,
                nipHash: temporaryNipHash,
                expiresAt,
                failedAttempts: 0,
                blockedUntil: null
            }
        });
        pool.connect = async () => rig.client;
        const running = await startServer();
        try {
            const response = await fetch(`${running.url}/api/contador/depositos/autenticar`, {
                method: 'POST',
                headers: deviceHeaders,
                body: JSON.stringify({
                    dispositivo_id: 'CNT-001',
                    numero_cuenta: '1234567890',
                    nip: '1234'
                })
            });
            return { response, rig };
        } finally {
            await running.close();
        }
    };

    const expired = await runAuthentication(7, new Date(Date.now() - 1));
    assert.equal(expired.response.status, 401);
    assert.equal(expired.rig.state.temporaryNip.nipHash, temporaryNipHash);

    const wrongOwner = await runAuthentication(8, new Date(Date.now() + 5 * 60_000));
    assert.equal(wrongOwner.response.status, 401);
    assert.deepEqual(wrongOwner.rig.state.ownerLookups, [7]);
    assert.equal(wrongOwner.rig.state.temporaryNip.nipHash, temporaryNipHash);
});

test('rechaza una cuenta inexistente y conserva el bloqueo de cinco intentos por quince minutos', async () => {
    const missingAccount = createCounterAuthDatabase({ account: null });
    pool.connect = async () => missingAccount.client;
    const running = await startServer();
    try {
        const response = await fetch(`${running.url}/api/contador/depositos/autenticar`, {
            method: 'POST',
            headers: deviceHeaders,
            body: JSON.stringify({
                dispositivo_id: 'CNT-001',
                numero_cuenta: '1234567890',
                nip: '1234'
            })
        });
        assert.equal(response.status, 401);
        assert.deepEqual(missingAccount.state.ownerLookups, []);
    } finally {
        await running.close();
    }

    const temporaryNipHash = await bcrypt.hash('1234', 4);
    const cardHash = await bcrypt.hash('9999', 4);
    const rig = createCounterAuthDatabase({
        account: { id: 11, userId: 7, accountNumber: '1234567890', cardHashes: [cardHash] },
        temporaryNip: {
            userId: 7,
            nipHash: temporaryNipHash,
            expiresAt: new Date(Date.now() + 5 * 60_000),
            failedAttempts: 0,
            blockedUntil: null
        }
    });
    pool.connect = async () => rig.client;
    const blockedRun = await startServer();
    try {
        for (let attempt = 0; attempt < 5; attempt += 1) {
            const response = await fetch(`${blockedRun.url}/api/contador/depositos/autenticar`, {
                method: 'POST',
                headers: deviceHeaders,
                body: JSON.stringify({
                    dispositivo_id: 'CNT-001',
                    numero_cuenta: '1234567890',
                    nip: '1111'
                })
            });
            assert.equal(response.status, 401);
        }
        assert.equal(rig.state.attempts, 5);
        assert.ok(rig.state.blockedUntil.getTime() - Date.now() >= 14 * 60_000);
        assert.equal(rig.state.temporaryNip.failedAttempts, 5);

        const blocked = await fetch(`${blockedRun.url}/api/contador/depositos/autenticar`, {
            method: 'POST',
            headers: deviceHeaders,
            body: JSON.stringify({
                dispositivo_id: 'CNT-001',
                numero_cuenta: '1234567890',
                nip: '1234'
            })
        });
        assert.equal(blocked.status, 429);
        assert.equal(rig.state.attempts, 5);
    } finally {
        await blockedRun.close();
    }
});

test('rechaza un token de dispositivo inválido antes de consultar la base de datos', async () => {
    let databaseAccessed = false;
    pool.connect = async () => {
        databaseAccessed = true;
        throw new Error('No se esperaba acceso a la base de datos');
    };
    const running = await startServer();
    try {
        const response = await fetch(`${running.url}/api/contador/depositos/autenticar`, {
            method: 'POST',
            headers: { ...deviceHeaders, 'x-device-token': 'invalid-token' },
            body: JSON.stringify({
                dispositivo_id: 'CNT-001',
                numero_cuenta: '1234567890',
                nip: '1234'
            })
        });
        assert.equal(response.status, 401);
        assert.equal(databaseAccessed, false);
    } finally {
        await running.close();
    }
});

test('revierte el consumo y no emite sesión ante fallos de validación, consumo o commit', async () => {
    const temporaryNipHash = await bcrypt.hash('1234', 4);
    const cardHash = await bcrypt.hash('9999', 4);
    const originalError = console.error;
    console.error = () => {};
    try {
        for (const failOnQuery of [
            'FROM temporary_nip_attempts',
            'SET nip_hash = NULL',
            'COMMIT'
        ]) {
            const rig = createCounterAuthDatabase({
                account: { id: 11, userId: 7, accountNumber: '1234567890', cardHashes: [cardHash] },
                temporaryNip: {
                    userId: 7,
                    nipHash: temporaryNipHash,
                    expiresAt: new Date(Date.now() + 5 * 60_000),
                    failedAttempts: 0,
                    blockedUntil: null
                },
                failOnQuery
            });
            pool.connect = async () => rig.client;
            const running = await startServer();
            try {
                const response = await fetch(`${running.url}/api/contador/depositos/autenticar`, {
                    method: 'POST',
                    headers: deviceHeaders,
                    body: JSON.stringify({
                        dispositivo_id: 'CNT-001',
                        numero_cuenta: '1234567890',
                        nip: '1234'
                    })
                });
                assert.equal(response.status, 500);
                assert.equal(rig.state.rolledBack, true);
                assert.equal(rig.state.temporaryNip.nipHash, temporaryNipHash);
                assert.equal((await response.text()).includes(temporaryNipHash), false);
            } finally {
                await running.close();
            }
        }
    } finally {
        console.error = originalError;
    }
});

test('no prepara depósitos cuando el conteo declarado no coincide con el detectado', async () => {
    let databaseAccessed = false;
    pool.connect = async () => {
        databaseAccessed = true;
        throw new Error('No se esperaba acceso a la base de datos');
    };
    const running = await startServer();
    try {
        const response = await fetch(`${running.url}/api/contador/depositos/preparar`, {
            method: 'POST',
            headers: { ...deviceHeaders, Authorization: `Bearer ${counterToken()}` },
            body: JSON.stringify({
                dispositivo_id: 'CNT-001',
                operacion_id: operationId(),
                denominacion: 100,
                cantidad_declarada: 20,
                cantidad_detectada: 19
            })
        });
        assert.equal(response.status, 422);
        assert.equal(databaseAccessed, false);
    } finally {
        await running.close();
    }
});

test('prepara el importe correcto y confirma el mismo depósito una sola vez', async () => {
    const id = operationId();
    let state = null;
    let balance = 500;
    let creditCount = 0;
    let movementCount = 0;
    const fakeDeposit = () => ({
        operacion_id: id,
        cuenta_id: 11,
        contador_id: 21,
        denominacion: 100,
        cantidad_billetes: 20,
        importe: '2000.00',
        estado: state,
        saldo_resultante: state === 'confirmado' ? String(balance) : null,
        dispositivo_id: 'CNT-001',
        numero_cuenta: '1234567890',
        conteo_creado: new Date().toISOString()
    });
    const client = {
        async query(sql) {
            const query = String(sql);
            if (query === 'BEGIN' || query === 'COMMIT' || query === 'ROLLBACK') return { rows: [] };
            if (query.includes('SELECT pg_advisory_xact_lock')) return { rows: [] };
            if (query.includes('FROM depositos d') && query.includes('FOR UPDATE OF d')) {
                return { rows: state ? [fakeDeposit()] : [] };
            }
            if (query.includes('FROM depositos d')) return { rows: state ? [fakeDeposit()] : [] };
            if (query.includes('SELECT id, numero_cuenta FROM cuentas')) {
                return { rows: [{ id: 11, numero_cuenta: '1234567890' }] };
            }
            if (query.includes('INSERT INTO contadores')) return { rows: [{ id: 21 }] };
            if (query.includes('INSERT INTO depositos')) {
                state = 'pendiente';
                return { rows: [] };
            }
            if (query.includes('UPDATE cuentas')) {
                creditCount += 1;
                balance += 2000;
                return { rows: [{ saldo: String(balance) }] };
            }
            if (query.includes('INSERT INTO movimientos')) {
                movementCount += 1;
                return { rows: [] };
            }
            if (query.includes("SET estado = 'confirmado'")) {
                state = 'confirmado';
                return { rows: [] };
            }
            throw new Error(`Unexpected query in test: ${query}`);
        },
        release() {}
    };
    pool.connect = async () => client;
    const running = await startServer();
    const headers = { ...deviceHeaders, Authorization: `Bearer ${counterToken()}` };
    const payload = {
        dispositivo_id: 'CNT-001',
        operacion_id: id,
        denominacion: 100,
        cantidad_declarada: 20,
        cantidad_detectada: 20
    };

    try {
        const prepared = await fetch(`${running.url}/api/contador/depositos/preparar`, {
            method: 'POST',
            headers,
            body: JSON.stringify(payload)
        });
        const preparedBody = await prepared.json();
        assert.equal(prepared.status, 201);
        assert.equal(preparedBody.data.importe, 2000);

        const retry = await fetch(`${running.url}/api/contador/depositos/preparar`, {
            method: 'POST',
            headers,
            body: JSON.stringify(payload)
        });
        assert.equal(retry.status, 200);
        assert.equal((await retry.json()).duplicate, true);

        for (let i = 0; i < 2; i += 1) {
            const confirmed = await fetch(`${running.url}/api/contador/depositos/confirmar`, {
                method: 'POST',
                headers,
                body: JSON.stringify({ dispositivo_id: 'CNT-001', operacion_id: id, confirmacion: 'A' })
            });
            assert.equal(confirmed.status, 200);
            assert.equal((await confirmed.json()).data.saldo, 2500);
        }
        assert.equal(creditCount, 1);
        assert.equal(movementCount, 1);
    } finally {
        await running.close();
    }
});
