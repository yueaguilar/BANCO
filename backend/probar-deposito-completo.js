require('dotenv').config({ quiet: true });

const readline = require('readline');
const crypto = require('crypto');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function preguntar(texto) {
  return new Promise(resolve => rl.question(texto, respuesta => {
    resolve(respuesta.trim());
  }));
}

function preguntarNip() {
  return preguntar('NIP de prueba (se mostrará al escribirlo): ');
}

async function main() {
  const base = 'https://banco-vl95.onrender.com';
  const dispositivo_id = 'CONTADOR_KIKE_01';
  const deviceToken = process.env.COUNTER_DEVICE_TOKEN;

  if (!deviceToken || deviceToken.length < 32) {
    throw new Error('COUNTER_DEVICE_TOKEN no está configurado en .env');
  }

  console.log('\n=== BANCO KIKE: DEPÓSITO COMPLETO ===\n');

  const numero_cuenta = (await preguntar('Número de cuenta de prueba: ')).trim();
  const nip = await preguntarNip();

  if (!/^\d{10}$/.test(numero_cuenta) || !/^\d{4}$/.test(nip)) {
    throw new Error('La cuenta debe tener 10 dígitos y el NIP 4.');
  }

  const denominacion = Number(
    await preguntar('Denominación del billete (20, 50, 100, 200 o 500): ')
  );

  if (![20, 50, 100, 200, 500].includes(denominacion)) {
    throw new Error('Denominación no válida.');
  }

  const cantidad = Number(
    await preguntar('Cantidad de billetes: ')
  );

  if (!Number.isSafeInteger(cantidad) || cantidad < 1 || cantidad > 10000) {
    throw new Error('La cantidad debe ser un entero entre 1 y 10000.');
  }

  const importe = denominacion * cantidad;
  const operacion_id = crypto.randomUUID();

  console.log('\nImporte calculado: $' + importe.toFixed(2));
  console.log('Operación:', operacion_id);

  // 1. Autenticar cuenta
  console.log('\n1. Autenticando cuenta...');

  const authResponse = await fetch(
    `${base}/api/contador/depositos/autenticar`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-device-token': deviceToken
      },
      body: JSON.stringify({
        numero_cuenta,
        nip,
        dispositivo_id
      })
    }
  );

  const auth = await authResponse.json();

  if (!authResponse.ok || auth.success !== true || !auth.data?.token) {
    console.log('Autenticación rechazada:', authResponse.status, auth.message);
    return;
  }

  const sessionToken = auth.data.token;
  console.log('OK: cuenta autenticada.');

  const headers = {
    'Content-Type': 'application/json',
    'x-device-token': deviceToken,
    'Authorization': `Bearer ${sessionToken}`
  };

  // 2. Preparar depósito
  console.log('\n2. Preparando depósito...');

  const prepareResponse = await fetch(
    `${base}/api/contador/depositos/preparar`,
    {
      method: 'POST',
      headers,
      body: JSON.stringify({
        dispositivo_id,
        operacion_id,
        denominacion,
        cantidad_declarada: cantidad,
        cantidad_detectada: cantidad
      })
    }
  );

  const prepared = await prepareResponse.json();

  if (!prepareResponse.ok || prepared.success !== true) {
    console.log('Preparación rechazada:', prepareResponse.status, prepared.message);
    return;
  }

  console.log('OK: depósito preparado.');
  console.log('Importe validado: $' + Number(prepared.data.importe).toFixed(2));
  console.log('Estado:', prepared.data.estado);

  // 3. Confirmación explícita
  console.log('\n3. CONFIRMACIÓN');
  console.log('Si continúas, se abonarán $' + importe.toFixed(2));
  const decision = (await preguntar(
    'Escribe CONFIRMAR para acreditar el depósito: '
  )).trim();

  if (decision !== 'CONFIRMAR') {
    console.log('No se confirmó. El depósito queda pendiente temporalmente.');
    console.log('Conserva el ID de operación para poder identificarlo.');
    return;
  }

  const confirmResponse = await fetch(
    `${base}/api/contador/depositos/confirmar`,
    {
      method: 'POST',
      headers,
      body: JSON.stringify({
        dispositivo_id,
        operacion_id,
        confirmacion: 'A'
      })
    }
  );

  const confirmed = await confirmResponse.json();

  console.log('\n4. Resultado de la confirmación');
  console.log('HTTP:', confirmResponse.status);
  console.log('Respuesta:', confirmed.message || 'Sin mensaje');

  if (!confirmResponse.ok || confirmed.success !== true) {
    console.log('No se pudo confirmar. Conserva el ID de operación.');
    return;
  }

  console.log('Estado:', confirmed.data.estado);
  console.log('Importe abonado: $' + Number(confirmed.data.importe).toFixed(2));
  console.log('Saldo devuelto por el backend: $' +
    Number(confirmed.data.saldo).toFixed(2));

  // 5. Verificar depósito y movimiento directamente en Neon
  console.log('\n5. Verificando registro en la base de datos...');

  const pool = require('./src/database');

  try {
    const result = await pool.query(
      `SELECT d.operacion_id, d.denominacion, d.cantidad_billetes,
              d.importe, d.estado, d.saldo_resultante,
              m.id AS movimiento_id, m.tipo, m.monto
       FROM depositos d
       LEFT JOIN movimientos m
         ON m.referencia_id = d.operacion_id
        AND m.cuenta_id = d.cuenta_id
       WHERE d.operacion_id = $1`,
      [operacion_id]
    );

    if (result.rows.length === 0) {
      console.log('No se encontró el depósito en la consulta de verificación.');
    } else {
      const row = result.rows[0];
      console.log('Operación:', row.operacion_id);
      console.log('Denominación:', row.denominacion);
      console.log('Cantidad:', row.cantidad_billetes);
      console.log('Importe:', row.importe);
      console.log('Estado en base de datos:', row.estado);
      console.log('ID del movimiento:', row.movimiento_id ?? 'No encontrado');
      console.log('Tipo de movimiento:', row.tipo ?? 'No encontrado');
      console.log('Importe del movimiento:', row.monto ?? 'No encontrado');

      if (row.estado === 'confirmado' && row.movimiento_id != null) {
        console.log('\nÉXITO: depósito confirmado y movimiento encontrado.');
      } else {
        console.log('\nATENCIÓN: revisa el estado y el movimiento.');
      }
    }
  } finally {
    await pool.end();
  }
}

main()
  .catch(error => console.log('\nError:', error.message))
  .finally(() => rl.close());
