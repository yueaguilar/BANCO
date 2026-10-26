const readline = require('node:readline');
const crypto = require('node:crypto');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const preguntar = texto => new Promise(resolve =>
  rl.question(texto, respuesta => resolve(respuesta.trim()))
);

async function main() {
  const base = 'http://127.0.0.1:8080';
  const bridgeToken = process.env.BRIDGE_INGEST_TOKEN;

  if (!bridgeToken) {
    throw new Error('Falta BRIDGE_INGEST_TOKEN en backend/.env');
  }

  const dispositivo_id = 'CONTADOR_KIKE_01';

  const numero_cuenta = await preguntar('Número de cuenta (10 dígitos): ');
  const nip = await preguntar('NIP (4 dígitos): ');

  if (!/^\d{10}$/.test(numero_cuenta) || !/^\d{4}$/.test(nip)) {
    throw new Error('Formato de cuenta o NIP incorrecto.');
  }

  const headers = {
    'Content-Type': 'application/json',
    'x-bridge-token': bridgeToken
  };

  async function post(ruta, datos, bearer) {
    const h = { ...headers };
    if (bearer) h.Authorization = `Bearer ${bearer}`;

    const r = await fetch(base + ruta, {
      method: 'POST',
      headers: h,
      body: JSON.stringify(datos),
      signal: AbortSignal.timeout(15000)
    });

    const respuesta = await r.json();
    console.log(`HTTP ${r.status}: ${ruta}`);

    if (!r.ok || respuesta.success !== true ||
        respuesta.accepted === false) {
      throw new Error(respuesta.message || 'Solicitud rechazada');
    }
    return respuesta;
  }

  console.log('\n1. Probando autenticación a través del puente...');

  const auth = await post('/depositos/autenticar', {
    numero_cuenta,
    nip,
    dispositivo_id
  });

  const token = auth.data?.token;
  if (!token) throw new Error('No se recibió el token temporal de sesión.');

  console.log('Autenticación correcta.');

  const denominacion = Number(
    await preguntar('Denominación (20, 50, 100, 200 o 500): ')
  );
  const cantidad = Number(await preguntar('Cantidad de billetes: '));

  if (![20, 50, 100, 200, 500].includes(denominacion) ||
      !Number.isSafeInteger(cantidad) || cantidad < 1 || cantidad > 10000) {
    throw new Error('Denominación o cantidad inválida.');
  }

  const operacion_id = crypto.randomUUID();

  console.log('\n2. Preparando depósito de $' +
    (denominacion * cantidad).toFixed(2));

  const preparado = await post('/depositos/preparar', {
    dispositivo_id,
    operacion_id,
    denominacion,
    cantidad_declarada: cantidad,
    cantidad_detectada: cantidad
  }, token);

  console.log('Depósito preparado.');
  console.log('ID de operación:', operacion_id);

  const decision = await preguntar(
    'Para intentar acreditar el depósito REAL, escribe A; otra respuesta cancela: '
  );

  if (decision !== 'A') {
    console.log('Confirmación no enviada. Verifica el estado antes de repetir.');
    return;
  }

  console.log('\n3. Confirmando depósito...');

  const confirmado = await post('/depositos/confirmar', {
    dispositivo_id,
    operacion_id,
    confirmacion: 'A'
  }, token);

  console.log('Resultado:', confirmado.message || 'Solicitud aceptada.');
  if (confirmado.data?.estado) console.log('Estado:', confirmado.data.estado);
  if (confirmado.data?.saldo !== undefined) {
    console.log('Saldo informado: $' + Number(confirmado.data.saldo).toFixed(2));
  }
}

main()
  .catch(error => console.error('\nERROR:', error.message))
  .finally(() => rl.close());
