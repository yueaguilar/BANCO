const crypto = require('crypto');
const pool = require('../database');

const generatedCardNumbers = new Set();

function calculateLuhnCheckDigit(partialDigits) {
    let sum = 0;
    let shouldDouble = true;

    for (let i = partialDigits.length - 1; i >= 0; i -= 1) {
        let digit = Number(partialDigits[i]);
        if (shouldDouble) {
            digit *= 2;
            if (digit > 9) {
                digit -= 9;
            }
        }
        sum += digit;
        shouldDouble = !shouldDouble;
    }

    const remainder = sum % 10;
    return (10 - remainder) % 10;
}

function generateNip() {
    return String(crypto.randomInt(1000, 10000)).padStart(4, '0');
}

function generateExpirationDate() {
    const year = new Date().getFullYear() + 5;
    const month = crypto.randomInt(1, 13);

    return {
        month: String(month).padStart(2, '0'),
        year: String(year).slice(-2)
    };
}

async function isCardNumberUnique(numero) {
    try {
        const resultado = await pool.query(
            'SELECT id FROM tarjetas WHERE numero_tarjeta = $1',
            [numero]
        );

        return resultado.rows.length === 0 && !generatedCardNumbers.has(numero);
    } catch (error) {
        return !generatedCardNumbers.has(numero);
    }
}

async function generateCardNumber() {
    for (let attempt = 0; attempt < 50; attempt += 1) {
        const body = Array.from({ length: 14 }, () => crypto.randomInt(0, 10)).join('');
        const partial = `4${body}`;
        const checkDigit = calculateLuhnCheckDigit(partial);
        const numero = `${partial}${checkDigit}`;

        const isUnique = await isCardNumberUnique(numero);
        if (isUnique) {
            generatedCardNumbers.add(numero);
            return numero;
        }
    }

    throw new Error('No se pudo generar un número de tarjeta único.');
}

function generateCvv(cardNumber, expirationMonth = '12', expirationYear = '30', windowOffset = 0) {
    if (!cardNumber || !/^\d{16}$/.test(cardNumber)) {
        throw new Error('El número de tarjeta es inválido para generar el CVV.');
    }

    const secret = process.env.CVV_SECRET || 'dev-secret-change-me';
    const month = String(expirationMonth).padStart(2, '0');
    const year = String(expirationYear).padStart(2, '0');

    const timeStep = 30; // segundos
    const counter = Math.floor(Date.now() / 1000 / timeStep) + Number(windowOffset || 0);

    const hmac = crypto.createHmac('sha256', secret)
        .update(`${cardNumber}${month}${year}${counter}`)
        .digest();

    // Use first 4 bytes as integer, then reduce to 3 digits
    const num = hmac.readUInt32BE(0) % 1000;
    return String(num).padStart(3, '0');
}

module.exports = {
    generateNip,
    generateExpirationDate,
    generateCardNumber,
    generateCvv,
    calculateLuhnCheckDigit
};

module.exports.generateNip = generateNip;
module.exports.generateExpirationDate = generateExpirationDate;
module.exports.generateCardNumber = generateCardNumber;
module.exports.generateCvv = generateCvv;
module.exports.calculateLuhnCheckDigit = calculateLuhnCheckDigit;