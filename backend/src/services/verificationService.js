const { randomInt } = require('node:crypto');

const verificationCodes = new Map();
const verifiedPhoneNumbers = new Map();

function normalizePhone(value) {
    return String(value || '').replace(/\D/g, '');
}

function generateVerificationCode() {
    return String(randomInt(100000, 1000000)).padStart(6, '0');
}

function storeVerificationCode(phone, code, ttlMs = 5 * 60 * 1000) {
    const key = normalizePhone(phone);
    const expiresAt = Date.now() + ttlMs;

    verificationCodes.set(key, { code: String(code), expiresAt });
    return { key, code: String(code), expiresAt };
}

function consumeVerificationCode(phone, code) {
    const key = normalizePhone(phone);
    const record = verificationCodes.get(key);

    if (!record) {
        return false;
    }

    const now = Date.now();
    if (now >= record.expiresAt) {
        verificationCodes.delete(key);
        return false;
    }

    if (String(record.code) !== String(code)) {
        return false;
    }

    verificationCodes.delete(key);
    return true;
}

function markPhoneVerified(phone, ttlMs = 10 * 60 * 1000) {
    const key = normalizePhone(phone);
    verifiedPhoneNumbers.set(key, Date.now() + ttlMs);
    return true;
}

function isPhoneVerified(phone) {
    const key = normalizePhone(phone);
    const expiresAt = verifiedPhoneNumbers.get(key);

    if (!expiresAt) {
        return false;
    }

    if (Date.now() > expiresAt) {
        verifiedPhoneNumbers.delete(key);
        return false;
    }

    return true;
}

module.exports = {
    generateVerificationCode,
    normalizePhone,
    storeVerificationCode,
    consumeVerificationCode,
    markPhoneVerified,
    isPhoneVerified,
    verificationCodes,
    verifiedPhoneNumbers
};
