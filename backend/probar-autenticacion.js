require('dotenv').config({ quiet: true });
const readline = require('readline');
const fs = require('fs');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function preguntar(texto) {
  return new Promise(resolve => rl.question(texto, resolve));
}

async function main() {
  const token = process.env.COUNTER_DEVICE_TOKEN;

  if (!token || token.length < 32) {
    console.log('Error: revisa COUNTER_DEVICE_TOKEN en .env');
    return;
  }

  console.log('\n=== BANCO KIKE ===');

  const cuenta = (await preguntar('Número de cuenta: ')).trim();
  const nip = (await preguntar('NIP (entrada oculta): ')).trim();
  const dispositivo = (
    await preguntar('Dispositivo [CONTADOR_KIKE_01]: ')
  ).trim() || 'CONTADOR_KIKE_01';

  if (!cuenta || !nip) {
    console.log('Debes introducir la cuenta y el NIP.');
    return;
  }

  const respuesta = await fetch(
    'https://banco-vl95.onrender.com/api/contador/depositos/autenticar',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-device-token': token
      },
      body: JSON.stringify({
        numero_cuenta: cuenta,
        nip,
        dispositivo_id: dispositivo
      })
    }
  );

  console.log('\nHTTP:', respuesta.status);
  console.log('Respuesta:', await respuesta.text());
}

main()
  .catch(error => console.log('Error:', error.message))
  .finally(() => rl.close());
