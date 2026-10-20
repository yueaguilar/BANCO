# 🏦 Banco KIKE

Banco KIKE es una plataforma bancaria ficticia con arquitectura realista para un proyecto académico: Angular como frontend, Firebase Hosting para servir la app web, Node.js + Express para el backend desplegado en Render y Neon PostgreSQL como base de datos.

> ⚠️ El sistema es exclusivamente académico y usa datos ficticios. No debe usarse para dinero real ni información bancaria real.

---

## Arquitectura

- Frontend: Angular en `FRONTEND/`
- Hosting web: Firebase Hosting (`firebase.json`)
- Backend API: Node.js/Express en `backend/src/app.js`
- Base de datos: PostgreSQL en Neon (`DATABASE_URL`)
- Contador bancario: autenticado por token de dispositivo y validado por el backend antes de aceptar el depósito

---

## Estructura del repositorio

```text
BANCO/
├── FRONTEND/                 # Angular app
│   ├── src/
│   ├── angular.json
│   └── package.json
├── backend/                  # API REST y lógica de negocio
│   ├── src/
│   ├── tests/
│   ├── schema.sql
│   ├── package.json
│   └── .gitignore
├── .github/workflows/        # CI/CD para Firebase Hosting
├── firebase.json             # configuración del hosting
├── README.md
├── package.json              # raíz del proyecto (no contiene build; CI compila desde FRONTEND)
└── .gitignore
```

---

## Requisitos

- Node.js 18+
- npm
- Git
- Acceso a una base PostgreSQL en Neon o local

---

## Instalación y ejecución

### Frontend

```bash
cd BANCO/FRONTEND
npm install
npm run build
npm run start
```

### Backend

```bash
cd BANCO/backend
npm install
cp .env.example .env  # o crear tu propio .env
npm run start
```

---

## Variables de entorno

Crear un archivo `.env` en `backend/.env` con al menos:

```env
PORT=3000
DATABASE_URL=postgresql://usuario:password@host:5432/dbname?sslmode=require
JWT_SECRET=una_clave_segura_de_al_menos_32_caracteres
COUNTER_DEVICE_TOKEN=token-secreto-para-dispositivos
COUNTER_DEVICE_IDS=CONTADOR_KIKE_01,CNT-001,contador-arduino-01
```

No guardes ni subas credenciales al repositorio. El archivo `.env` debe permanecer ignorado por Git.

---

## API principal

Rutas relevantes:

- `POST /api/auth` — registro e inicio de sesión
- `GET /api/session` — sesión autenticada del usuario actual
- `GET /api/balance/:numeroCuenta` — consulta del saldo solo para la cuenta propia
- `POST /api/contador` — registro del contador autorizado
- `GET /api/contador/pendientes` — conteos pendientes para validación
- `POST /api/depositos/contador/validar` — valida cuenta, contador y denominación
- `POST /api/depositos/contador/confirmar` — confirma deposito y actualiza saldo con movimiento

---

## Depósito con contador

1. El Arduino o dispositivo envía el conteo al backend con un token autorizado.
2. El backend valida el `dispositivo_id`, la cantidad, la antigüedad del lote y la identidad del usuario.
3. El cliente selecciona la denominación y la cuenta de destino.
4. El backend calcula el importe como `cantidad_billetes * denominacion`.
5. Si la operación se confirma, se actualiza el saldo y se registra el movimiento dentro de la misma transacción PostgreSQL.

---

## Pruebas

```bash
cd BANCO/backend
node --test tests/contadorRoute.test.js tests/emailService.test.js
```

También se valida el build de Angular desde:

```bash
cd BANCO/FRONTEND
npm run build
```

---

## Firebase Hosting

La configuración actual apunta a la salida de Angular en `FRONTEND/dist/FRONTEND/browser`, que es el directorio válido para publicar con Firebase Hosting. El backend debe permanecer en Node.js/Render, no en Firebase Functions, y la API debe mantenerse fuera de las rutas de hosting.

Ejecutar:

```bash
node src/app.js
```

Si el servidor inicia correctamente aparecerá:

```text
Servidor ejecutándose en http://localhost:3000
```

Después se puede abrir:

```text
http://localhost:3000
```

---

## 🔑 Autenticación

El sistema utiliza autenticación para controlar el acceso de los usuarios.

Las contraseñas **no deben almacenarse directamente** en la base de datos.

Para protegerlas se utiliza `bcrypt`.

Ejemplo:

```javascript
const bcrypt = require('bcrypt');

const passwordHash = await bcrypt.hash(password, 10);
```

Para comprobar una contraseña:

```javascript
const passwordCorrecta = await bcrypt.compare(
    password,
    passwordHash
);
```

---

## 📱 Verificación en dos pasos mediante SMS

El sistema puede utilizar Twilio para enviar un código temporal al teléfono del usuario.

El flujo general es:

```text
Usuario
   │
   ▼
Inicia sesión
   │
   ▼
Usuario + contraseña correctos
   │
   ▼
Generar código temporal
   │
   ▼
Twilio
   │
   ▼
SMS con código
   │
   ▼
Usuario introduce código
   │
   ▼
Código correcto
   │
   ▼
Acceso al sistema
```

El código de verificación debe tener una duración limitada y no debe almacenarse de forma permanente.

---

## 📲 Código de verificación

Ejemplo de generación de un código de seis dígitos:

```javascript
const codigo = Math.floor(
    100000 + Math.random() * 900000
).toString();
```

El código puede enviarse mediante Twilio.

La lógica del sistema debe comprobar:

1. Que el código pertenece al usuario.
2. Que el código todavía es válido.
3. Que no haya expirado.
4. Que el código coincida.
5. Que el código solamente pueda utilizarse según las reglas establecidas por el sistema.

---

## 📷 Código QR

El proyecto puede utilizar códigos QR para facilitar el intercambio de información necesaria para realizar transferencias.

El QR no debe contener información sensible como:

* Contraseñas.
* CVV.
* Claves privadas.
* Tokens de autenticación.
* Credenciales.

En su lugar, puede contener un identificador o información limitada necesaria para iniciar una transferencia.

Ejemplo:

```text
https://quickchart.io/qr?text=IDENTIFICADOR_DE_CUENTA
```

---

## 🔒 Seguridad

El proyecto contempla diferentes mecanismos de seguridad:

### Contraseñas

Las contraseñas se protegen utilizando `bcrypt`.

### Variables de entorno

Las credenciales y claves privadas se almacenan mediante `.env`.

### Base de datos

La información se almacena en PostgreSQL.

### Autenticación

El sistema verifica las credenciales antes de permitir el acceso.

### Verificación en dos pasos

Se utiliza un código temporal enviado mediante SMS.

### Datos sensibles

La información sensible debe minimizarse y protegerse tanto durante el almacenamiento como durante la transmisión.

---

## 👥 Roles de usuario

El sistema puede implementar diferentes niveles de acceso.

Ejemplo:

```text
USUARIO
   │
   ├── Consultar cuenta
   ├── Consultar saldo
   ├── Consultar movimientos
   └── Realizar transferencias

ADMINISTRADOR
   │
   ├── Administrar usuarios
   ├── Consultar información administrativa
   ├── Gestionar cuentas
   └── Supervisar el sistema
```

Cada usuario solamente debe poder acceder a las funciones correspondientes a su rol.

---

## 🌐 API

El backend proporciona endpoints para comunicarse con el frontend.

Ejemplo:

```http
GET /api
```

Respuesta:

```json
{
    "mensaje": "API del Banco funcionando"
}
```

Los endpoints pueden ampliarse para implementar:

```text
POST   /api/auth/register
POST   /api/auth/login
POST   /api/auth/verify
GET    /api/account
GET    /api/movements
POST   /api/transfers
GET    /api/cards
POST   /api/qr
```

---

## 🧪 Pruebas

Las pruebas del proyecto se encuentran en:

```text
backend/tests/
```

Para ejecutar las pruebas, si el proyecto tiene configurado Jest:

```bash
npm test
```

---

## 📌 Estado actual del proyecto

### Backend

* [x] Node.js
* [x] Express
* [x] Conexión con PostgreSQL
* [x] Variables de entorno
* [x] Hashing de contraseñas
* [ ] Sistema completo de autenticación
* [ ] Verificación SMS
* [ ] Sistema de roles
* [ ] API de transferencias

### Frontend

* [x] Estructura inicial
* [x] Página de inicio de sesión
* [ ] Integración completa con API
* [ ] Panel de usuario
* [ ] Panel administrativo

### Seguridad

* [x] `.env`
* [x] bcrypt
* [ ] Autenticación completa
* [ ] Verificación en dos pasos
* [ ] Control de sesiones
* [ ] Protección completa de endpoints

---

## 👨‍💻 Desarrollo

El proyecto está desarrollado con fines académicos para demostrar la implementación de una plataforma bancaria ficticia utilizando tecnologías web modernas.

---

## ⚠️ Aviso de seguridad

Este sistema es un proyecto académico y **no debe utilizarse para almacenar dinero real, números reales de tarjetas, CVV, contraseñas reales o información financiera real**.

Las funcionalidades de autenticación, transferencias, SMS y almacenamiento de datos deben considerarse parte de una simulación.

---

## Despliegue y depósito con contador

La aplicación Angular vive en `FRONTEND/` y Firebase Hosting publica `FRONTEND/dist/FRONTEND/browser`. Los workflows de Firebase instalan y compilan desde `FRONTEND/`. El backend es una API Node.js/Express en `backend/`; se ejecuta por separado en Render y usa Neon PostgreSQL mediante `DATABASE_URL`. El backend no sirve los archivos Angular.

Configura estas variables como secretos del entorno de Render (y nunca en el código):

```env
DATABASE_URL=...
JWT_SECRET=...                 # mínimo 32 caracteres aleatorios
COUNTER_DEVICE_TOKEN=...       # mínimo 32 caracteres aleatorios
COUNTER_DEVICE_IDS=CONTADOR_01 # IDs autorizados separados por coma
```

Render debe iniciar desde `backend/` con `npm start`. Para desarrollo local, crea `backend/.env` con las mismas variables y usa:

```bash
cd backend
npm ci
npm start
npm test
```

En Ubuntu, inicia el intermediario con Node.js:

```bash
BACKEND_URL=https://<servicio-render> \
BRIDGE_INGEST_TOKEN=<secreto-local-de-32-caracteres-o-mas> \
COUNTER_DEVICE_TOKEN=<mismo-secreto-configurado-en-render> \
COUNTER_DEVICE_IDS=CONTADOR_01 \
node ubuntu-bridge/bridge.js
```

Configura también `COUNTER_QUEUE_DIR` en un disco persistente y limita el puerto local del bridge a la red aislada del contador. El token local protege la recepción desde el Arduino; el bridge solo envía al backend por HTTPS. El directorio de cola conserva el lote ante una caída de Internet y lo elimina tras una respuesta 2xx.

El contador solo acepta un lote finalizado en `POST /api/contador`, con el encabezado `x-device-token` y este cuerpo:

```json
{
  "dispositivo_id": "CONTADOR_01",
  "lote_id": "6ba7b810-9dad-41d1-80b4-00c04fd430c8",
  "cantidad_billetes": 20,
  "fecha_hora": "2026-10-20T12:00:00.000Z",
  "estado": "completado"
}
```

El intermediario Ubuntu debe generar un UUID por lote y conservarlo junto con el contenido hasta recibir confirmación del backend. Los reintentos deben reenviar el mismo UUID y cantidad; el backend devuelve el registro original en lugar de crear otro. La antigüedad se calcula con la hora de recepción del servidor, no con la hora del dispositivo.

El endpoint local del bridge es `POST http://<ubuntu-en-la-red-del-contador>:8080/batches` y requiere `x-bridge-token`. Para el enlace serial, Arduino Uno 1 debe emitir `COUNT;<lote_id>;<cantidad>\n` y después `END;<lote_id>\n`; Arduino Uno 2 solo envía el JSON final cuando ambos mensajes coinciden y contesta `ACK;<lote_id>\n` al recibirlos. El bridge devuelve HTTP `202` una vez que el lote se guardó en la cola local, no cuando ya llegó a Render.

El usuario autenticado selecciona un conteo disponible y confirma el depósito. Endpoints de este flujo:

- `GET /api/contador/pendientes`
- `POST /api/depositos/contador/validar`
- `POST /api/depositos/contador/confirmar`
- `POST /api/depositos/contador/cancelar`
- `GET /api/depositos/contador/:id`
- `GET /api/movimientos`

La validación del depósito exige que la cuenta pertenezca al usuario. El servidor calcula el importe. Confirmación actualiza saldo, depósito y movimiento en una única transacción; repetir la misma confirmación devuelve el resultado existente. Las solicitudes de depósito se guardan localmente en el navegador para reintentar con el mismo ID de operación tras perder conexión.

El repositorio incluye el bridge Ubuntu y pruebas de su cola/reintentos, pero aún no contiene firmware de Arduino. La implementación serial entre placas y las pruebas físicas de sensores/servos/W5100 requieren el hardware y su asignación real de pines; no se debe conectar el W5100 directamente a Render con HTTP sin cifrar.

Firebase Hosting reescribe rutas de la SPA a `index.html`; el frontend usa la URL HTTPS de Render para las llamadas API. No hay un proxy de API de Firebase ni una Firebase Function para este backend.

---

## 📄 Licencia

Este proyecto es de uso académico y educativo.
