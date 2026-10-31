const jwt = require('jsonwebtoken');
const pool = require('../database');
const {
    TOKEN_ISSUER,
    TOKEN_AUDIENCE,
    getAccessToken,
    getTokenConfiguration
} = require('../services/sessionService');

async function authenticateUser(req, res, next) {
    const cookieToken = getAccessToken(req);
    const authorization = req.get('authorization') || '';
    const bearerMatch = authorization.match(/^Bearer\s+(.+)$/i);
    const token = cookieToken || bearerMatch?.[1];

    if (!cookieToken && (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32)) {
        return res.status(503).json({ success: false, message: 'La autenticación no está configurada.' });
    }

    if (!token) {
        return res.status(401).json({ success: false, message: 'Se requiere una sesión autenticada.' });
    }

    if (cookieToken) {
        const config = getTokenConfiguration();
        if (!config) {
            return res.status(503).json({ success: false, message: 'La autenticación no está configurada.' });
        }

        try {
            const payload = jwt.verify(cookieToken, config.accessSecret, {
                issuer: TOKEN_ISSUER,
                audience: TOKEN_AUDIENCE
            });
            const userId = Number(payload.sub);
            const sessionId = payload.sid;
            if (payload.tokenType !== 'access'
                || !Number.isSafeInteger(userId) || userId <= 0
                || typeof sessionId !== 'string') {
                return res.status(401).json({ success: false, message: 'La sesión no es válida.' });
            }

            const { rows } = await pool.query(
                `UPDATE auth_sessions
                 SET last_activity = NOW()
                 WHERE id = $1 AND user_id = $2 AND status = 'active' AND expires_at > NOW()
                 RETURNING id`,
                [sessionId, userId]
            );
            if (rows.length === 0) {
                return res.status(401).json({ success: false, message: 'La sesión no es válida o expiró.' });
            }

            req.user = { id: userId, sessionId };
            return next();
        } catch (error) {
            if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
                return res.status(401).json({ success: false, message: 'La sesión no es válida o expiró.' });
            }
            console.error('Authenticated session lookup failed:', error?.code || error?.name || 'unknown');
            return res.status(503).json({ success: false, message: 'No se pudo validar la sesión.' });
        }
    }

    const legacySecret = process.env.JWT_SECRET;
    if (!legacySecret || legacySecret.length < 32) {
        return res.status(503).json({ success: false, message: 'La autenticación no está configurada.' });
    }

    try {
        const payload = jwt.verify(token, legacySecret, {
            issuer: TOKEN_ISSUER,
            audience: TOKEN_AUDIENCE
        });
        const userId = Number(payload.sub);
        if (!Number.isSafeInteger(userId) || userId <= 0) {
            return res.status(401).json({ success: false, message: 'La sesión no es válida.' });
        }

        req.user = { id: userId, sessionId: null };
        return next();
    } catch (error) {
        return res.status(401).json({ success: false, message: 'La sesión no es válida o expiró.' });
    }
}

module.exports = authenticateUser;
