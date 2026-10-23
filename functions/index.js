const functions = require('firebase-functions');
const express = require('express');
const cors = require('cors');
const app = express();

app.use(cors({ origin: true }));
app.use(express.json());

app.get('/api', (req, res) => {
  res.json({ mensaje: 'API del Banco funcionando' });
});

exports.api = functions.https.onRequest(app);
