const { createHash, randomUUID } = require('node:crypto');
const jwt = require('jsonwebtoken');

const ACCESS_COOKIE = 'banco_access';
const REFRESH_COOKIE = 'banco_refresh';
const TOKEN_ISSUER = 'banco-kike-api';
const TOKEN_AUDIENCE = 'banco-kike-web';

function getTokenConfiguration() {
    const accessSecret = process.env.JWT_ACCESS_SECRET;
    const refreshSecret = process.env.JWT_REFRESH_SECRET;
    const accessMatch = /^(\d+)m$/.exec(process.env.JWT_ACCESS_EXPIRES_IN || '10m');
    const refreshMatch = /^(\d+)d$/.exec(process.env.JWT_REFRESH_EXPIRES_IN || '7d');

    if (!accessSecret || accessSecret.length < 32
        || !refreshSecret || refreshSecret.length < 32
        || accessSecret === refreshSecret
        || !accessMatch || Number(accessMatch[1]) < 5 || Number(accessMatch[1]) > 10
        || !refreshMatch || Number(refreshMatch[1]) < 1 || Number(refreshMatch[1]) > 7) {
        return null;
    }

    return {
        accessSecret,
        refreshSecret,
        accessSeconds: Number(accessMatch[1]) * 60,
        refreshSeconds: Number(refreshMatch[1]) * 24 * 60 * 60
    };
}

function getCookieOptions(maxAge) {
    const production = process.env.NODE_ENV === 'production' || process.env.RENDER === 'true';
    const secure = process.env.COOKIE_SECURE === undefined
        ? production
        : process.env.COOKIE_SECURE === 'true';
    const sameSite = String(process.env.COOKIE_SAME_SITE || (secure ? 'none' : 'lax')).toLowerCase();

    if (!['lax', 'strict', 'none'].includes(sameSite) || (sameSite === 'none' && !secure)) {
        throw new Error('COOKIE_SAME_SITE requiere una configuración de cookie válida y segura.');
    }

    return {
        httpOnly: true,
        secure,
        sameSite,
        path: '/',
        ...(maxAge === undefined ? {} : { maxAge })
    };
}

function readCookie(header, cookieName) {
    for (const part of String(header || '').split(';')) {
        const separator = part.indexOf('=');
        if (separator < 0 || part.slice(0, separator).trim() !== cookieName) continue;
        try {
            return decodeURIComponent(part.slice(separator + 1).trim());
        } catch {
            return null;
        }
    }
    return null;
}

function hashRefreshToken(token) {
    return createHash('sha256').update(token).digest('hex');
}

function deviceInformation(req) {
    const userAgent = String(req.get('user-agent') || '').slice(0, 512);
    const browser = /Edg\//.test(userAgent) ? 'Edge'
        : /Firefox\//.test(userAgent) ? 'Firefox'
            : /Chrome\//.test(userAgent) ? 'Chrome'
                : /Safari\//.test(userAgent) ? 'Safari'
                    : 'Unknown';
    const platform = /Android/i.test(userAgent) ? 'Android'
        : /iPhone|iPad|iPod/i.test(userAgent) ? 'iOS'
            : /Windows/i.test(userAgent) ? 'Windows'
                : /Macintosh|Mac OS/i.test(userAgent) ? 'macOS'
                    : /Linux/i.test(userAgent) ? 'Linux'
                        : 'Unknown';

    return { browser, platform, userAgent };
}

function createTokens(userId, sessionId, refreshSeconds) {
    const config = getTokenConfiguration();
    if (!config) {
        throw new Error('JWT_ACCESS_SECRET y JWT_REFRESH_SECRET deben ser secretos válidos e independientes.');
    }

    const common = {
        subject: String(userId),
        issuer: TOKEN_ISSUER,
        audience: TOKEN_AUDIENCE
    };
    const accessToken = jwt.sign(
        { sid: sessionId, tokenType: 'access', jti: randomUUID() },
        config.accessSecret,
        { ...common, expiresIn: config.accessSeconds }
    );
    const refreshToken = jwt.sign(
        { sid: sessionId, tokenType: 'refresh', jti: randomUUID() },
        config.refreshSecret,
        { ...common, expiresIn: refreshSeconds }
    );

    return { accessToken, refreshToken };
}

async function createSession(pool, userId, req) {
    const config = getTokenConfiguration();
    if (!config) {
        throw new Error('JWT_ACCESS_SECRET y JWT_REFRESH_SECRET deben ser secretos válidos e independientes.');
    }

    const sessionId = randomUUID();
    const expiresAt = new Date(Date.now() + config.refreshSeconds * 1000);
    const tokens = createTokens(userId, sessionId, config.refreshSeconds);

    await pool.query(
        `INSERT INTO auth_sessions
            (id, user_id, refresh_token_hash, created_at, expires_at, last_activity, status, device_info)
         VALUES ($1, $2, $3, NOW(), $4, NOW(), 'active', $5::jsonb)`,
        [sessionId, userId, hashRefreshToken(tokens.refreshToken), expiresAt, JSON.stringify(deviceInformation(req))]
    );

    return { sessionId, ...tokens, expiresAt };
}

function setSessionCookies(res, tokens, refreshExpiresAt) {
    res.cookie(ACCESS_COOKIE, tokens.accessToken, getCookieOptions());
    res.cookie(
        REFRESH_COOKIE,
        tokens.refreshToken,
        getCookieOptions(Math.max(0, new Date(refreshExpiresAt).getTime() - Date.now()))
    );
}

function clearSessionCookies(res) {
    const options = getCookieOptions();
    res.clearCookie(ACCESS_COOKIE, options);
    res.clearCookie(REFRESH_COOKIE, options);
}

function getRefreshToken(req) {
    return readCookie(req.headers.cookie, REFRESH_COOKIE);
}

function getAccessToken(req) {
    return readCookie(req.headers.cookie, ACCESS_COOKIE);
}

function verifyRefreshToken(token) {
    const config = getTokenConfiguration();
    if (!config || !token) return null;
    try {
        const claims = jwt.verify(token, config.refreshSecret, {
            issuer: TOKEN_ISSUER,
            audience: TOKEN_AUDIENCE
        });
        const userId = Number(claims.sub);
        if (claims.tokenType !== 'refresh'
            || !Number.isSafeInteger(userId) || userId <= 0
            || typeof claims.sid !== 'string') {
            return null;
        }
        return { userId, sessionId: claims.sid };
    } catch {
        return null;
    }
}

function verifyAccessToken(token) {
    const config = getTokenConfiguration();
    if (!config || !token) return null;
    try {
        const claims = jwt.verify(token, config.accessSecret, {
            issuer: TOKEN_ISSUER,
            audience: TOKEN_AUDIENCE
        });
        const userId = Number(claims.sub);
        if (claims.tokenType !== 'access'
            || !Number.isSafeInteger(userId) || userId <= 0
            || typeof claims.sid !== 'string') {
            return null;
        }
        return { userId, sessionId: claims.sid };
    } catch {
        return null;
    }
}

async function rotateRefreshToken(pool, token) {
    const config = getTokenConfiguration();
    if (!config || !token) return { ok: false, status: 401 };

    const identity = verifyRefreshToken(token);
    if (!identity) return { ok: false, status: 401 };
    const { userId, sessionId } = identity;

    const client = await pool.connect();
    let transactionStarted = false;
    try {
        await client.query('BEGIN');
        transactionStarted = true;
        const { rows } = await client.query(
            `SELECT id, user_id, refresh_token_hash, expires_at, status
             FROM auth_sessions
             WHERE id = $1 AND user_id = $2
             FOR UPDATE`,
            [sessionId, userId]
        );
        const session = rows[0];
        if (!session || session.status !== 'active') {
            await client.query('COMMIT');
            transactionStarted = false;
            return { ok: false, status: 401 };
        }

        const expiresAt = new Date(session.expires_at);
        if (expiresAt.getTime() <= Date.now() + 1000) {
            await client.query(
                `UPDATE auth_sessions SET status = 'expired', revoked_at = NOW()
                 WHERE id = $1 AND status = 'active'`,
                [sessionId]
            );
            await client.query('COMMIT');
            transactionStarted = false;
            return { ok: false, status: 401 };
        }

        if (hashRefreshToken(token) !== session.refresh_token_hash) {
            await client.query(
                `UPDATE auth_sessions
                 SET status = 'suspicious', revoked_at = NOW()
                 WHERE id = $1 AND status = 'active'`,
                [sessionId]
            );
            await client.query('COMMIT');
            transactionStarted = false;
            return { ok: false, status: 401, reuseDetected: true, sessionId, userId };
        }

        const remainingSeconds = Math.floor((expiresAt.getTime() - Date.now()) / 1000);
        const tokens = createTokens(userId, sessionId, remainingSeconds);
        await client.query(
            `UPDATE auth_sessions
             SET refresh_token_hash = $2, last_activity = NOW()
             WHERE id = $1 AND status = 'active'`,
            [sessionId, hashRefreshToken(tokens.refreshToken)]
        );
        await client.query('COMMIT');
        transactionStarted = false;
        return { ok: true, ...tokens, sessionId, userId, expiresAt };
    } catch (error) {
        if (transactionStarted) await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
}

module.exports = {
    ACCESS_COOKIE,
    REFRESH_COOKIE,
    TOKEN_ISSUER,
    TOKEN_AUDIENCE,
    getTokenConfiguration,
    getCookieOptions,
    getAccessToken,
    getRefreshToken,
    verifyAccessToken,
    verifyRefreshToken,
    hashRefreshToken,
    createSession,
    createTokens,
    setSessionCookies,
    clearSessionCookies,
    rotateRefreshToken
};