const jwt = require('jsonwebtoken');

function authenticateUser(req, res, next) {
    const secret = process.env.JWT_SECRET;
    if (!secret || secret.length < 32) {
        return res.status(503).json({ success: false, message: 'La autenticación no está configurada.' });
    }

    const authorization = req.get('authorization') || '';
    const match = authorization.match(/^Bearer\s+(.+)$/i);
    if (!match) {
        return res.status(401).json({ success: false, message: 'Se requiere una sesión autenticada.' });
    }

    try {
        const payload = jwt.verify(match[1], secret, {
            issuer: 'banco-kike-api',
            audience: 'banco-kike-web'
        });

        if (!payload.sub || !/^\d+$/.test(String(payload.sub))) {
            return res.status(401).json({ success: false, message: 'La sesión no es válida.' });
        }

        req.user = { id: Number(payload.sub) };
        return next();
    } catch (error) {
        return res.status(401).json({ success: false, message: 'La sesión no es válida o expiró.' });
    }
}

module.exports = authenticateUser;
