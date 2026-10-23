const test = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = 'test-jwt-secret-with-more-than-32-characters';

const app = require('../src/app');
const pool = require('../src/database');

async function createRig() {
    const originalQuery = pool.query;
    const originalConnect = pool.connect;
    const users = new Map([
        [7, { password: await bcrypt.hash('valid-password', 4) }],
        [8, { password: await bcrypt.hash('other-password', 4) }]
    ]);
    const attempts = new Map();

    pool.query = async (sql, params = []) => {
        if (String(sql).includes('SELECT password FROM users')) {
            const user = users.get(Number(params[0]));
            return { rows: user ? [{ password: user.password }] : [] };
        }
        throw new Error(`Unexpected pool query: ${sql}`);
    };

    pool.connect = async () => ({
        async query(sql, params = []) {
            const query = String(sql);
            const userId = Number(params[0]);

            if (query === 'BEGIN' || query === 'COMMIT' || query === 'ROLLBACK') {
                return { rows: [] };
            }
            if (query.includes('INSERT INTO temporary_nip_attempts')) {
                if (!attempts.has(userId)) {
                    attempts.set(userId, {
                        failed_attempts: 0,
                        blocked_until: null,
                        last_success_at: null,
                        nip_hash: null,
                        expires_at: null
                    });
                }
                return { rows: [] };
            }
            if (query.includes('SELECT failed_attempts, blocked_until, last_success_at')) {
                return { rows: [attempts.get(userId)] };
            }
            if (query.includes('SELECT failed_attempts, blocked_until, nip_hash, expires_at')) {
                return { rows: [attempts.get(userId)] };
            }
            if (query.includes('SET failed_attempts = CASE')) {
                const state = attempts.get(userId);
                const expired = state.blocked_until && state.blocked_until.getTime() <= Date.now();
                state.failed_attempts = expired ? 1 : state.failed_attempts + 1;
                state.blocked_until = state.failed_attempts >= params[1]
                    ? new Date(Date.now() + params[2])
                    : null;
                return { rows: [{ blocked_until: state.blocked_until }] };
            }
            if (query.includes('SET failed_attempts = 0, blocked_until = NULL, updated_at = NOW()')) {
                const state = attempts.get(userId);
                state.failed_attempts = 0;
                state.blocked_until = null;
                return { rows: [] };
            }
            if (query.includes('last_success_at = NOW()')) {
                const state = attempts.get(userId);
                state.failed_attempts = 0;
                state.blocked_until = null;
                state.last_success_at = new Date();
                state.nip_hash = params[1];
                state.expires_at = new Date(Date.now() + 5 * 60_000);
                return { rows: [] };
            }
            if (query.includes('SET nip_hash = NULL, expires_at = NULL, failed_attempts = 0')) {
                const state = attempts.get(userId);
                state.nip_hash = null;
                state.expires_at = null;
                state.failed_attempts = 0;
                state.blocked_until = null;
                return { rows: [] };
            }
            if (query.includes('SET nip_hash = NULL, expires_at = NULL, updated_at = NOW()')) {
                const state = attempts.get(userId);
                state.nip_hash = null;
                state.expires_at = null;
                return { rows: [] };
            }
            throw new Error(`Unexpected client query: ${query}`);
        },
        release() {}
    });

    const server = app.listen(0);
    await new Promise((resolve) => server.once('listening', resolve));

    return {
        url: `http://127.0.0.1:${server.address().port}`,
        attempts,
        async close() {
            await new Promise((resolve) => server.close(resolve));
            pool.query = originalQuery;
            pool.connect = originalConnect;
        }
    };
}

function userToken(userId) {
    return jwt.sign({}, process.env.JWT_SECRET, {
        subject: String(userId),
        issuer: 'banco-kike-api',
        audience: 'banco-kike-web',
        expiresIn: '1h'
    });
}

async function requestTemporaryNip(rig, userId, password, extra = {}) {
    const headers = { 'Content-Type': 'application/json', ...extra.headers };
    if (userId) headers.Authorization = `Bearer ${userToken(userId)}`;
    return fetch(`${rig.url}/api/account/temporary-nip`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ password, ...extra.body })
    });
}

test('genera un NIP temporal de cuatro dígitos con vigencia de cinco minutos', async () => {
    const rig = await createRig();
    try {
        const response = await requestTemporaryNip(rig, 7, 'valid-password');
        const body = await response.json();

        assert.equal(response.status, 200);
        assert.equal(body.success, true);
        assert.match(body.code, /^\d{4}$/);
        assert.equal(body.expiresInSeconds, 300);
        assert.equal(response.headers.get('cache-control'), 'no-store');
        assert.equal(response.headers.get('pragma'), 'no-cache');
        assert.equal(rig.attempts.get(7).failed_attempts, 0);
        assert.notEqual(rig.attempts.get(7).nip_hash, body.code);
        assert.equal(await bcrypt.compare(body.code, rig.attempts.get(7).nip_hash), true);
    } finally {
        await rig.close();
    }
});

async function consumeTemporaryNip(rig, userId, code) {
    return fetch(`${rig.url}/api/account/temporary-nip/consume`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${userToken(userId)}`
        },
        body: JSON.stringify({ code })
    });
}

test('consume el NIP temporal de forma transaccional y no permite reutilizarlo', async () => {
    const rig = await createRig();
    try {
        const generated = await requestTemporaryNip(rig, 7, 'valid-password');
        const { code } = await generated.json();

        const firstUse = await consumeTemporaryNip(rig, 7, code);
        assert.equal(firstUse.status, 200);

        const replay = await consumeTemporaryNip(rig, 7, code);
        assert.equal(replay.status, 401);
        assert.equal(rig.attempts.get(7).nip_hash, null);
    } finally {
        await rig.close();
    }
});

test('limita los NIP incorrectos y bloquea temporalmente tras cinco intentos', async () => {
    const rig = await createRig();
    try {
        await requestTemporaryNip(rig, 7, 'valid-password');
        for (let index = 0; index < 4; index += 1) {
            assert.equal((await consumeTemporaryNip(rig, 7, '0000')).status, 401);
        }
        const fifthAttempt = await consumeTemporaryNip(rig, 7, '0000');
        assert.equal(fifthAttempt.status, 429);
        assert.ok(Number(fifthAttempt.headers.get('retry-after')) > 0);
        assert.equal((await consumeTemporaryNip(rig, 7, '0000')).status, 429);
    } finally {
        await rig.close();
    }
});

test('rechaza un NIP temporal vencido', async () => {
    const rig = await createRig();
    try {
        await requestTemporaryNip(rig, 7, 'valid-password');
        rig.attempts.get(7).expires_at = new Date(Date.now() - 1);
        assert.equal((await consumeTemporaryNip(rig, 7, '0000')).status, 401);
        assert.equal(rig.attempts.get(7).nip_hash, null);
    } finally {
        await rig.close();
    }
});

test('rechaza contraseñas incorrectas y bloquea al quinto intento durante quince minutos', async () => {
    const rig = await createRig();
    try {
        for (let index = 0; index < 4; index += 1) {
            const response = await requestTemporaryNip(rig, 7, 'wrong-password');
            assert.equal(response.status, 401);
            assert.equal((await response.json()).code, undefined);
        }

        const fifthAttempt = await requestTemporaryNip(rig, 7, 'wrong-password');
        assert.equal(fifthAttempt.status, 429);
        assert.ok(Number(fifthAttempt.headers.get('retry-after')) > 0);
        assert.equal(rig.attempts.get(7).failed_attempts, 5);

        const lockedRequest = await requestTemporaryNip(rig, 7, 'valid-password');
        assert.equal(lockedRequest.status, 429);
        assert.equal(rig.attempts.get(7).failed_attempts, 5);
    } finally {
        await rig.close();
    }
});

test('requiere sesión, limita consultas exitosas y valida la contraseña de la cuenta autenticada', async () => {
    const rig = await createRig();
    try {
        const unauthenticated = await requestTemporaryNip(rig, null, 'valid-password');
        assert.equal(unauthenticated.status, 401);

        const first = await requestTemporaryNip(rig, 7, 'valid-password', {
            body: { userId: 8 }
        });
        const firstBody = await first.json();
        assert.equal(first.status, 200);
        assert.match(firstBody.code, /^\d{4}$/);

        const crossAccountPassword = await requestTemporaryNip(rig, 8, 'valid-password');
        assert.equal(crossAccountPassword.status, 401);

        const tooSoon = await requestTemporaryNip(rig, 7, 'valid-password');
        assert.equal(tooSoon.status, 429);
        assert.match((await tooSoon.json()).message, /recientemente/i);
    } finally {
        await rig.close();
    }
});
