const verificationCodes = new Map();
const verifiedEmails = new Map();
const verifiedPhones = new Map();

function generateVerificationCode() {
    return String(Math.floor(100000 + Math.random() * 900000));
}

function normalizePhone(phone) {
    const digits = String(phone || '').replace(/\D/g, '');
    return digits.length >= 10 ? digits.slice(-10) : '';
}

function normalizeIdentifier(identifier) {
    if (typeof identifier === 'string') {
        const trimmed = identifier.trim();
        return trimmed ? trimmed.toLowerCase() : '';
    }

    return String(identifier || '').trim().toLowerCase();
}

function getExpirationTimestamp(ttlMs) {
    return Date.now() + ttlMs;
}

function storeVerificationCode(identifier, code, ttlMs) {
    const key = normalizeIdentifier(identifier);
    if (!key || !code) {
        return false;
    }

    verificationCodes.set(key, {
        code: String(code).trim(),
        expiresAt: getExpirationTimestamp(ttlMs)
    });

    return true;
}

function consumeVerificationCode(identifier, code) {
    const key = normalizeIdentifier(identifier);
    const providedCode = String(code || '').trim();

    if (!key || !providedCode) {
        return false;
    }

    const record = verificationCodes.get(key);
    if (!record) {
        return false;
    }

    if (Date.now() > record.expiresAt) {
        verificationCodes.delete(key);
        return false;
    }

    if (record.code !== providedCode) {
        return false;
    }

    verificationCodes.delete(key);
    return true;
}

function markEmailVerified(email, ttlMs) {
    const key = normalizeIdentifier(email);
    if (!key) {
        return false;
    }

    verifiedEmails.set(key, getExpirationTimestamp(ttlMs));
    return true;
}

function isEmailVerified(email) {
    const key = normalizeIdentifier(email);
    if (!key) {
        return false;
    }

    const expiresAt = verifiedEmails.get(key);
    if (!expiresAt || Date.now() > expiresAt) {
        verifiedEmails.delete(key);
        return false;
    }

    return true;
}

function markPhoneVerified(phone, ttlMs) {
    const key = normalizePhone(phone);
    if (!key) {
        return false;
    }

    verifiedPhones.set(key, getExpirationTimestamp(ttlMs));
    return true;
}

function isPhoneVerified(phone) {
    const key = normalizePhone(phone);
    if (!key) {
        return false;
    }

    const expiresAt = verifiedPhones.get(key);
    if (!expiresAt || Date.now() > expiresAt) {
        verifiedPhones.delete(key);
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
    markEmailVerified,
    isEmailVerified
};