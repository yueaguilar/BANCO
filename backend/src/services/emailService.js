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

    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
            accept: 'application/json',
            'api-key': apiKey,
            'content-type': 'application/json'
        },
        body: JSON.stringify({
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
        })
    });

    if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`Brevo error ${response.status}: ${errorBody}`);
    }

    return {
        simulated: false,
        email: normalizedEmail,
        message: 'Correo de verificación enviado correctamente.'
    };
}

module.exports = {
    enviarCorreoVerificacion
};
