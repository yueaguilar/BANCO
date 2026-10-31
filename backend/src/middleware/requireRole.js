const pool = require('../database');

function requireRole(...allowedRoles) {
    if (allowedRoles.length === 0 || allowedRoles.some((role) => !['customer', 'admin'].includes(role))) {
        throw new TypeError('requireRole needs one or more recognized roles.');
    }

    return async function roleAuthorization(req, res, next) {
        if (!req.user?.id) {
            return res.status(401).json({ success: false, message: 'Se requiere una sesión autenticada.' });
        }

        try {
            const { rows } = await pool.query(
                'SELECT role FROM users WHERE id = $1',
                [req.user.id]
            );
            const role = rows[0]?.role;
            if (!allowedRoles.includes(role)) {
                return res.status(403).json({ success: false, message: 'No tienes permiso para realizar esta operación.' });
            }
            req.user.role = role;
            return next();
        } catch (error) {
            console.error('Role authorization lookup failed:', error?.code || error?.name || 'unknown');
            return res.status(503).json({ success: false, message: 'No se pudo validar el permiso.' });
        }
    };
}

module.exports = requireRole;
