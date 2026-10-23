const TEXTBEE_SEND_SMS_URL = 'https://api.textbee.dev/api/v1/gateway/send-sms';

async function sendSms(phone, message) {
    const apiKey = process.env.TEXTBEE_API_KEY;
    if (!apiKey) {
        throw new Error('TEXTBEE_API_KEY no está configurada.');
    }
    if (typeof phone !== 'string' || !/^\+\d{10,15}$/.test(phone)) {
        throw new Error('El destinatario SMS no está en formato E.164.');
    }
    if (typeof message !== 'string' || !message.trim()) {
        throw new Error('El mensaje SMS está vacío.');
    }
    if (typeof fetch !== 'function') {
        throw new Error('La petición a TextBee no está disponible en esta versión de Node.js.');
    }

    let response;
    try {
        response = await fetch(TEXTBEE_SEND_SMS_URL, {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                'x-api-key': apiKey
            },
            body: JSON.stringify({
                recipients: [phone],
                message
            })
        });
    } catch {
        throw new Error('No se pudo contactar al servicio de SMS.');
    }

    let body;
    try {
        body = await response.json();
    } catch {
        body = null;
    }

    if (!response.ok || body?.success !== true) {
        throw new Error(`TextBee rechazó el envío de SMS (HTTP ${response.status}).`);
    }

    return {
        smsBatchId: body.smsBatchId
    };
}

module.exports = { sendSms };
