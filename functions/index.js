const functions = require('firebase-functions');
const express = require('express');
const cors = require('cors');
const app = express();

app.use(cors({ origin: true }));
app.use(express.json());

app.get('/api', (req, res) => {
  res.json({ mensaje: 'API del Banco funcionando' });
});

app.post('/api/verification/send', (req, res) => {
  const { email } = req.body || {};
  const normalizedEmail = String(email || '').trim().toLowerCase();

  if (!normalizedEmail) {
    return res.status(400).json({ success: false, message: 'Debes ingresar un correo electrónico válido.' });
  }

  return res.json({
    success: true,
    message: 'Código de verificación enviado al correo electrónico.'
  });
});

app.post('/api/verification/verify', (req, res) => {
  const { email, code } = req.body || {};
  if (!email || !code) {
    return res.status(400).json({ success: false, message: 'Correo y código requeridos' });
  }

  return res.json({ success: true, message: 'Código verificado correctamente.' });
});

app.post('/api/auth', (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ success: false, message: 'email y password requeridos' });
  }

  return res.json({
    success: true,
    message: 'Login exitoso',
    user: { id: 1, fullname: 'Usuario demo', email: String(email).trim().toLowerCase() },
    bankData: {
      cuentas: [],
      tarjetas: []
    }
  });
});

exports.api = functions.https.onRequest(app);
