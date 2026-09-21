const twilio = require('twilio');

function getTwilioClient() {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;

    if (!accountSid || !authToken) {
        return null;
    }

    return twilio(accountSid, authToken);
}

async function enviarSMS(numero, codigo) {
    const client = getTwilioClient();
    const normalizedPhone = String(numero || '').replace(/\D/g, '');

    if (!normalizedPhone || !client || !process.env.TWILIO_PHONE_NUMBER) {
        console.log(`SIMULACIÓN SMS -> número: ${normalizedPhone || 'sin número'}, código: ${codigo}`);
        return { simulated: true, codigo };
    }

    const mensaje = await client.messages.create({
        body: `Banco Ficticio: tu código de verificación es ${codigo}. Expira en 5 minutos.`,
        from: process.env.TWILIO_PHONE_NUMBER,
        to: `+${normalizedPhone}`
    });

    return { simulated: false, sid: mensaje.sid };
}

module.exports = {
    enviarSMS
};