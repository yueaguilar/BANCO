const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const {
    TOKEN_ISSUER,
    TOKEN_AUDIENCE,
    getTokenConfiguration,
    createSession,
    hashRefreshToken,
    rotateRefreshToken,
    getCookieOptions
} = require('../src/services/sessionService');

const originalEnvironment = {
    accessSecret: process.env.JWT_ACCESS_SECRET,
    refreshSecret: process.env.JWT_REFRESH_SECRET,
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN,
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN,
    cookieSecure: process.env.COOKIE_SECURE,
    cookieSameSite: process.env.COOKIE_SAME_SITE,
    nodeEnv: process.env.NODE_ENV
};

process.env.JWT_ACCESS_SECRET = 'session-test-access-secret-with-more-than-32-bytes';
process.env.JWT_REFRESH_SECRET = 'session-test-refresh-secret-with-more-than-32-bytes';
process.env.JWT_ACCESS_EXPIRES_IN = '10m';
process.env.JWT_REFRESH_EXPIRES_IN = '7d';
process.env.COOKIE_SECURE = 'true';
process.env.COOKIE_SAME_SITE = 'none';
process.env.NODE_ENV = 'production';

test.after(() => {
    for (const [name, value] of [
        ['JWT_ACCESS_SECRET', originalEnvironment.accessSecret],
        ['JWT_REFRESH_SECRET', originalEnvironment.refreshSecret],
        ['JWT_ACCESS_EXPIRES_IN', originalEnvironment.accessExpiresIn],
        ['JWT_REFRESH_EXPIRES_IN', originalEnvironment.refreshExpiresIn],
        ['COOKIE_SECURE', originalEnvironment.cookieSecure],
        ['COOKIE_SAME_SITE', originalEnvironment.cookieSameSite],
        ['NODE_ENV', originalEnvironment.nodeEnv]
    ]) {
        if (value === undefined) delete process.env[name];
        else process.env[name] = value;
    }
});

function createPool() {
    const sessions = new Map();
    return {
        sessions,
        async query(sql, params) {
            assert.match(String(sql), /INSERT INTO auth_sessions/);
            const [id, userId, tokenHash, expiresAt, deviceInfo] = params;
            sessions.set(id, {
                id,
                user_id: userId,
                refresh_token_hash: tokenHash,
                expires_at: expiresAt,
                status: 'active',
                device_info: JSON.parse(deviceInfo)
            });
            return { rows: [] };
        },
        async connect() {
            return {
                async query(sql, params = []) {
                    const query = String(sql);
                    if (['BEGIN', 'COMMIT', 'ROLLBACK'].includes(query)) return { rows: [] };

                    if (query.includes('SELECT id, user_id, refresh_token_hash, expires_at, status')) {
                        const session = sessions.get(params[0]);
                        return {
                            rows: session && session.user_id === params[1] ? [{ ...session }] : []
                        };
                    }
                    if (query.includes("SET status = 'expired'")) {
                        const session = sessions.get(params[0]);
                        if (session) {
                            session.status = 'expired';
                            session.revoked_at = new Date();
                        }
                        return { rows: [] };
                    }
                    if (query.includes("SET status = 'suspicious'")) {
                        const session = sessions.get(params[0]);
                        if (session) {
                            session.status = 'suspicious';
                            session.revoked_at = new Date();
                        }
                        return { rows: [] };
                    }
                    if (query.includes('SET refresh_token_hash = $2')) {
                        const session = sessions.get(params[0]);
                        session.refresh_token_hash = params[1];
                        session.last_activity = new Date();
                        return { rows: [] };
                    }
                    throw new Error(`Unexpected session query: ${query}`);
                },
                release() {}
            };
        }
    };
}

function request(userAgent = 'Mozilla/5.0 Chrome/125.0.0.0') {
    return {
        ip: '127.0.0.1',
        get(name) {
            return name.toLowerCase() === 'user-agent' ? userAgent : undefined;
        }
    };
}

test('creates cookie-only JWTs and stores a hash plus device metadata', async () => {
    const pool = createPool();
    const session = await createSession(pool, 42, request());
    const record = pool.sessions.get(session.sessionId);
    const accessClaims = jwt.verify(session.accessToken, process.env.JWT_ACCESS_SECRET, {
        issuer: TOKEN_ISSUER,
        audience: TOKEN_AUDIENCE
    });
    const refreshClaims = jwt.verify(session.refreshToken, process.env.JWT_REFRESH_SECRET, {
        issuer: TOKEN_ISSUER,
        audience: TOKEN_AUDIENCE
    });

    assert.equal(accessClaims.sub, '42');
    assert.equal(accessClaims.tokenType, 'access');
    assert.equal(refreshClaims.tokenType, 'refresh');
    assert.deepEqual(Object.keys(accessClaims).sort(), ['aud', 'exp', 'iat', 'iss', 'jti', 'sid', 'sub', 'tokenType'].sort());
    assert.equal(record.refresh_token_hash, hashRefreshToken(session.refreshToken));
    assert.equal(record.device_info.browser, 'Chrome');
    assert.equal(record.device_info.platform, 'Unknown');
    assert.equal(getCookieOptions().httpOnly, true);
    assert.equal(getCookieOptions().secure, true);
    assert.equal(getCookieOptions().sameSite, 'none');
    assert.ok(refreshClaims.exp - refreshClaims.iat <= 7 * 24 * 60 * 60);
    assert.ok(accessClaims.exp - accessClaims.iat >= 5 * 60);
    assert.ok(accessClaims.exp - accessClaims.iat <= 10 * 60);
});

test('rotates refresh tokens and marks reuse of the invalidated token as suspicious', async () => {
    const pool = createPool();
    const original = await createSession(pool, 17, request());

    const renewed = await rotateRefreshToken(pool, original.refreshToken);
    assert.equal(renewed.ok, true);
    assert.notEqual(renewed.refreshToken, original.refreshToken);
    assert.equal(pool.sessions.get(original.sessionId).refresh_token_hash, hashRefreshToken(renewed.refreshToken));

    const replay = await rotateRefreshToken(pool, original.refreshToken);
    assert.equal(replay.ok, false);
    assert.equal(replay.reuseDetected, true);
    assert.equal(pool.sessions.get(original.sessionId).status, 'suspicious');
});

test('expires sessions and rejects refresh after revocation', async () => {
    const expiredPool = createPool();
    const expired = await createSession(expiredPool, 29, request());
    expiredPool.sessions.get(expired.sessionId).expires_at = new Date(Date.now() - 1);
    const expiration = await rotateRefreshToken(expiredPool, expired.refreshToken);
    assert.equal(expiration.ok, false);
    assert.equal(expiredPool.sessions.get(expired.sessionId).status, 'expired');

    const revokedPool = createPool();
    const revoked = await createSession(revokedPool, 30, request());
    revokedPool.sessions.get(revoked.sessionId).status = 'revoked';
    const revocation = await rotateRefreshToken(revokedPool, revoked.refreshToken);
    assert.equal(revocation.ok, false);
    assert.equal(revocation.status, 401);
});

test('rejects unsafe access-token lifetimes and cross-site cookies without Secure', () => {
    process.env.JWT_ACCESS_EXPIRES_IN = '4m';
    assert.equal(getTokenConfiguration(), null);
    process.env.JWT_ACCESS_EXPIRES_IN = '11m';
    assert.equal(getTokenConfiguration(), null);
    process.env.JWT_ACCESS_EXPIRES_IN = '10m';
    process.env.COOKIE_SECURE = 'false';
    assert.throws(() => getCookieOptions(), /COOKIE_SAME_SITE/);
});
