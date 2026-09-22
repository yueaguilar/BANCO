const https = require('https');
const dns = require('dns');

async function enviarCorreoVerificacion(email, codigo) {
    const normalizedEmail = String(email || '').trim().toLowerCase();
    const code = String(codigo || '').trim();

    if (!normalizedEmail) {
        throw new Error('No se proporcionó un correo electrónico válido.');
    }

    if (!code) {
        throw new Error('No se proporcionó un código de verificación válido.');
    }

    const apiKey = process.env.BREVO_API_KEY;
    const senderEmail = process.env.BREVO_SENDER_EMAIL;
    const senderName = process.env.BREVO_SENDER_NAME || 'Banco Ficticio';

    if (!apiKey) {
        throw new Error('BREVO_API_KEY no está configurada.');
    }

    if (!senderEmail) {
        throw new Error('BREVO_SENDER_EMAIL no está configurado.');
    }

    const payload = {
        sender: {
            email: senderEmail,
            name: senderName
        },
        to: [
            {
                email: normalizedEmail,
                name: normalizedEmail
            }
        ],
        subject: 'Código de verificación de Banco Ficticio',
        htmlContent: `
            <html>
                <body>
                    <h2>Verificación de identidad</h2>
                    <p>Tu código de verificación es:</p>
                    <h3 style="letter-spacing: 4px; font-size: 28px;">${code}</h3>
                    <p>Este código expira en 5 minutos.</p>
                </body>
            </html>
        `,
        textContent: `Tu código de verificación es ${code}. Expira en 5 minutos.`
    };

    let response;

    if (typeof fetch === 'function') {
        response = await fetch('https://api.brevo.com/v3/smtp/email', {
            method: 'POST',
            headers: {
                accept: 'application/json',
                'api-key': apiKey,
                'content-type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        const bodyText = await response.text();
        if (!response.ok) {
            throw new Error(`Brevo error ${response.status}: ${bodyText}`);
        }

        return {
            email: normalizedEmail,
            message: 'Correo de verificación enviado correctamente.'
        };
    }

    response = await new Promise((resolve, reject) => {
        const req = https.request('https://api.brevo.com:443/v3/smtp/email', {
            method: 'POST',
            headers: {
                accept: 'application/json',
                'api-key': apiKey,
                'content-type': 'application/json',
                'user-agent': 'BancoFicticio/1.0'
            },
            timeout: 30000,
            family: 4,
            lookup: (hostname, options, callback) => {
                dns.lookup(hostname, { family: 4, hints: dns.ADDRCONFIG }, callback);
            }
        }, (res) => {
            let rawData = '';

            res.on('data', (chunk) => {
                rawData += chunk;
            });

            res.on('end', () => {
                resolve({
                    statusCode: res.statusCode || 0,
                    body: rawData
                });
            });
        });

        req.on('timeout', () => {
            req.destroy(new Error('Timeout al contactar Brevo.'));
        });

        req.on('error', (error) => {
            reject(error);
        });

        req.write(JSON.stringify(payload));
        req.end();
    });

    if (response.statusCode >= 400) {
        throw new Error(`Brevo error ${response.statusCode}: ${response.body}`);
    }

    return {
        email: normalizedEmail,
        message: 'Correo de verificación enviado correctamente.'
    };
}

module.exports = {
    enviarCorreoVerificacion
};
