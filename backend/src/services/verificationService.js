const { createHmac, randomInt, timingSafeEqual } = require('node:crypto');
const pool = require('../database');

const CODE_TTL_MS = 5 * 60 * 1000;
const VERIFIED_TTL_MS = 10 * 60 * 1000;
const MAX_FAILED_ATTEMPTS = 5;
const AUTH_VERIFICATION_PURPOSE = 'auth';

class VerificationRateLimitError extends Error {
    constructor() {
        super('Espera un minuto antes de solicitar otro código.');
        this.name = 'VerificationRateLimitError';
        this.statusCode = 429;
    }
}

function generateVerificationCode() {
    return String(randomInt(100000, 1000000));
}

function normalizePhone(phone) {
    if (typeof phone !== 'string' && typeof phone !== 'number') {
        return '';
    }

    const value = String(phone).trim();
    if (!/^\+?[\d().\-\s]+$/.test(value)) {
        return '';
    }

    const digits = value.replace(/\D/g, '');
    if (/^\d{10}$/.test(digits)) {
        return digits;
    }
    if (/^52\d{10}$/.test(digits)) {
        return digits.slice(2);
    }
    return '';
}

function hashCode(code) {
    const secret = process.env.SMS_CODE_HMAC_SECRET;
    if (typeof secret !== 'string' || Buffer.byteLength(secret, 'utf8') < 32) {
        throw new Error('SMS_CODE_HMAC_SECRET debe contener al menos 32 bytes.');
    }
    return createHmac('sha256', secret).update(String(code)).digest('hex');
}

async function storeVerificationCode(phone, code) {
    const normalizedPhone = normalizePhone(phone);
    const normalizedCode = String(code || '').trim();
    if (!normalizedPhone || !/^\d{6}$/.test(normalizedCode)) {
        throw new Error('Teléfono o código de verificación inválido.');
    }

    const result = await pool.query(
        `INSERT INTO phone_verifications
            (phone, code_hash, expires_at, failed_attempts, last_sent_at, verified_until, verified_purpose)
         VALUES ($1, $2, NOW() + INTERVAL '5 minutes', 0, NOW(), NULL, NULL)
         ON CONFLICT (phone) DO UPDATE
         SET code_hash = EXCLUDED.code_hash,
             expires_at = EXCLUDED.expires_at,
             failed_attempts = 0,
             last_sent_at = NOW(),
             verified_until = NULL,
             verified_purpose = NULL
         WHERE phone_verifications.last_sent_at <= NOW() - INTERVAL '60 seconds'
         RETURNING phone`,
        [normalizedPhone, hashCode(normalizedCode)]
    );

    if (result.rows.length === 0) {
        throw new VerificationRateLimitError();
    }
    return true;
}

async function discardVerificationCode(phone, code) {
    const normalizedPhone = normalizePhone(phone);
    if (!normalizedPhone) {
        return false;
    }

    await pool.query(
        `UPDATE phone_verifications
         SET code_hash = NULL, expires_at = NULL, verified_until = NULL, verified_purpose = NULL
         WHERE phone = $1 AND code_hash = $2`,
        [normalizedPhone, hashCode(code)]
    );
    return true;
}

async function consumeVerificationCode(phone, code) {
    const normalizedPhone = normalizePhone(phone);
    const normalizedCode = String(code || '').trim();
    if (!normalizedPhone || !/^\d{6}$/.test(normalizedCode)) {
        return false;
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const result = await client.query(
            `SELECT code_hash, expires_at, failed_attempts
             FROM phone_verifications
             WHERE phone = $1
             FOR UPDATE`,
            [normalizedPhone]
        );
        const challenge = result.rows[0];

        if (!challenge || !challenge.code_hash || new Date(challenge.expires_at).getTime() <= Date.now()) {
            await client.query('COMMIT');
            return false;
        }

        if (Number(challenge.failed_attempts) >= MAX_FAILED_ATTEMPTS) {
            await client.query('COMMIT');
            return false;
        }

        const providedHash = Buffer.from(hashCode(normalizedCode), 'hex');
        const storedHash = Buffer.from(challenge.code_hash, 'hex');
        const matches = storedHash.length === providedHash.length
            && timingSafeEqual(storedHash, providedHash);

        if (!matches) {
            await client.query(
                `UPDATE phone_verifications
                 SET failed_attempts = failed_attempts + 1
                 WHERE phone = $1`,
                [normalizedPhone]
            );
            await client.query('COMMIT');
            return false;
        }

        await client.query(
            `UPDATE phone_verifications
             SET code_hash = NULL,
                 expires_at = NULL,
                 failed_attempts = 0,
                 verified_until = NOW() + INTERVAL '10 minutes',
                 verified_purpose = $2
             WHERE phone = $1`,
            [normalizedPhone, AUTH_VERIFICATION_PURPOSE]
        );
        await client.query('COMMIT');
        return true;
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
}

async function markPhoneVerified(phone, ttlMs = VERIFIED_TTL_MS, purpose = AUTH_VERIFICATION_PURPOSE) {
    const normalizedPhone = normalizePhone(phone);
    if (!normalizedPhone) {
        return false;
    }

    await pool.query(
        `UPDATE phone_verifications
         SET verified_until = NOW() + ($2 * INTERVAL '1 millisecond'),
             verified_purpose = $3
         WHERE phone = $1`,
        [normalizedPhone, ttlMs, purpose]
    );
    return true;
}

async function isPhoneVerified(phone, purpose = AUTH_VERIFICATION_PURPOSE) {
    const normalizedPhone = normalizePhone(phone);
    if (!normalizedPhone) {
        return false;
    }

    const result = await pool.query(
        'SELECT 1 FROM phone_verifications WHERE phone = $1 AND verified_until > NOW() AND verified_purpose = $2',
        [normalizedPhone, purpose]
    );
    return result.rows.length > 0;
}

async function consumePhoneVerification(phone, purpose = AUTH_VERIFICATION_PURPOSE) {
    const normalizedPhone = normalizePhone(phone);
    if (!normalizedPhone) {
        return false;
    }

    const result = await pool.query(
        `UPDATE phone_verifications
         SET verified_until = NULL, verified_purpose = NULL
         WHERE phone = $1 AND verified_until > NOW() AND verified_purpose = $2
         RETURNING phone`,
        [normalizedPhone, purpose]
    );
    return result.rows.length > 0;
}

module.exports = {
    CODE_TTL_MS,
    MAX_FAILED_ATTEMPTS,
    AUTH_VERIFICATION_PURPOSE,
    VerificationRateLimitError,
    generateVerificationCode,
    normalizePhone,
    storeVerificationCode,
    discardVerificationCode,
    consumeVerificationCode,
    markPhoneVerified,
    isPhoneVerified,
    consumePhoneVerification
};
