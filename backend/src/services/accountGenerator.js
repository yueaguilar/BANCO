const crypto = require('crypto');
const pool = require('../database');

const generatedAccountNumbers = new Set();

async function isAccountNumberUnique(numero) {
    try {
        const resultado = await pool.query(
            'SELECT id FROM cuentas WHERE numero_cuenta = $1',
            [numero]
        );

        return resultado.rows.length === 0 && !generatedAccountNumbers.has(numero);
    } catch (error) {
        return !generatedAccountNumbers.has(numero);
    }
}

async function generateAccountNumber() {
    for (let attempt = 0; attempt < 50; attempt += 1) {
        const numero = crypto.randomInt(1000000000, 9999999999).toString();

        const isUnique = await isAccountNumberUnique(numero);
        if (isUnique) {
            generatedAccountNumbers.add(numero);
            return numero;
        }
    }

    throw new Error('No se pudo generar un número de cuenta único.');
}

module.exports = generateAccountNumber;
module.exports.generateAccountNumber = generateAccountNumber;