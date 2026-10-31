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
JWT_ACCESS_SECRET=
JWT_REFRESH_SECRET=
JWT_ACCESS_EXPIRES_IN=10m
JWT_REFRESH_EXPIRES_IN=7d
COOKIE_SECURE=true
COOKIE_SAME_SITE=none
FRONTEND_URL=https://bancokike-45795.web.app
TEXTBEE_API_KEY=tu_api_key_de_textbee
SMS_CODE_HMAC_SECRET=configurar_como_secreto_privado_de_al_menos_32_bytes
COUNTER_DEVICE_TOKEN=token-secreto-para-dispositivos
COUNTER_DEVICE_IDS=CONTADOR_KIKE_01,CNT-001,contador-arduino-01
```

No guardes ni subas credenciales al repositorio. El archivo `.env` debe permanecer ignorado por Git.
En producción, configura las variables en el servicio privado del backend en Render. `JWT_ACCESS_SECRET` y `JWT_REFRESH_SECRET` deben ser distintos, aleatorios y tener al menos 32 caracteres; genera cada uno de forma independiente (por ejemplo, con `openssl rand -base64 48`). No pongas los secretos en Angular, Firebase Hosting ni GitHub. `JWT_SECRET` se conserva para compatibilidad con el flujo del contador; no se usa para firmar las nuevas sesiones web.

El frontend Firebase y la API Render son orígenes distintos: usa `COOKIE_SECURE=true`, `COOKIE_SAME_SITE=none` y configura `FRONTEND_URL` con el origen exacto del sitio (sin ruta). CORS habilita credenciales únicamente para los orígenes permitidos, y las mutaciones con cookies validan el encabezado `Origin`. Para desarrollo local usa `COOKIE_SECURE=false` y `COOKIE_SAME_SITE=lax`. El backend admite expiraciones de Access Token de 5 a 10 minutos y Refresh Token de hasta 7 días.

La autenticación web guarda los JWT únicamente en cookies `HttpOnly`; el Refresh Token se almacena como hash en `auth_sessions` y se rota en cada renovación. El servicio revoca la sesión si detecta la reutilización de un token anterior y elimina automáticamente las sesiones expiradas. El endpoint de envío de SMS admite hasta cinco solicitudes por IP cada 15 minutos y conserva el límite adicional de un envío por teléfono cada minuto.

---

## API principal

Rutas relevantes:

- `POST /api/auth` — registro e inicio de sesión
- `POST /api/auth/login` — inicio de sesión con número de cuenta y contraseña
- `POST /api/auth/refresh` — rotación del Refresh Token y emisión de un nuevo Access Token
- `POST /api/auth/logout` — cierre de la sesión actual
- `POST /api/auth/logout-all` — cierre de todas las sesiones de la cuenta
- `GET /api/auth/me` — información del usuario autenticado
- `GET /api/auth/sessions` — sesiones activas y dispositivo/navegador
- `DELETE /api/auth/sessions/:id` — revocación de una sesión propia
- `GET /api/admin/audit-events` — consulta de auditoría, solo rol `admin` (límite 1–100)
- `GET /health` — comprobación de disponibilidad de la API y PostgreSQL
- `GET /api/session` — sesión autenticada del usuario actual
- `GET /api/balance/:numeroCuenta` — consulta del saldo solo para la cuenta propia
- `POST /api/account/temporary-nip` — emite un NIP temporal tras verificar la contraseña
- `POST /api/account/temporary-nip/consume` — valida y consume el NIP temporal una sola vez
- `POST /api/contador` — registro del contador autorizado
- `GET /api/contador/pendientes` — conteos pendientes para validación
- `POST /api/depositos/contador/validar` — valida cuenta, contador y denominación
- `POST /api/depositos/contador/confirmar` — confirma deposito y actualiza saldo con movimiento
- `POST /api/contador/depositos/autenticar` — autentica cuenta y NIP desde el contador
- `POST /api/contador/depositos/preparar` — valida los conteos declarado/detectado y calcula el importe
- `POST /api/contador/depositos/confirmar` — acredita el depósito al recibir la confirmación `A`

---

## Depósito con contador

1. Arduino envía al puente Ubuntu la cuenta, el NIP y el `dispositivo_id` mediante `POST /depositos/autenticar`. El puente remite la solicitud al backend por HTTPS. El NIP se compara con `tarjetas.nip_hash` y nunca se almacena en texto plano.
2. La autenticación incorrecta se limita a cinco intentos por cuenta y dispositivo; después la cuenta se bloquea durante 15 minutos. Una autenticación exitosa devuelve un token temporal para continuar el depósito.
3. El contador genera un UUID `operacion_id` estable y envía al puente la denominación, la cantidad declarada y la detectada mediante `POST /depositos/preparar`, junto con el token temporal. El backend acepta denominaciones de $20, $50, $100, $200 o $500 y solo prepara el depósito si ambas cantidades coinciden.
4. El backend calcula `importe = denominacion * cantidad_detectada` y guarda el conteo y el depósito pendiente. El `operacion_id` debe conservarse si se reintenta la solicitud.
5. Al recibir la tecla A, Arduino envía `POST /depositos/confirmar` con el mismo UUID y `confirmacion: "A"`. El backend actualiza el saldo, registra el movimiento y marca el depósito confirmado en una transacción PostgreSQL. Repetir la confirmación devuelve el resultado existente sin volver a acreditar.
6. El puente devuelve la respuesta backend e incluye `accepted: true` o `accepted: false`. Las solicitudes de autenticación y confirmación se envían de forma síncrona y no se guardan en la cola persistente del puente.

Las tres rutas del puente requieren `x-bridge-token`, y el backend requiere además el token del dispositivo configurado y autorizado. Para iniciar el puente se deben configurar `BACKEND_URL` (HTTPS), `BRIDGE_INGEST_TOKEN`, `COUNTER_DEVICE_TOKEN` y `COUNTER_DEVICE_IDS`.

La antigua ruta `POST /api/deposit` fue retirada: el frontend no la utiliza. Los depósitos de cliente se realizan únicamente con el flujo autenticado del contador; el backend verifica la propiedad de la cuenta, el conteo autorizado, la idempotencia y registra el saldo y el movimiento dentro de una transacción PostgreSQL.

Ejemplos del cuerpo que Arduino envía al puente:

```json
{ "dispositivo_id": "CNT-001", "numero_cuenta": "1234567890", "nip": "1234" }
```

```json
{
  "dispositivo_id": "CNT-001",
  "operacion_id": "6ba7b810-9dad-41d1-80b4-00c04fd430c8",
  "denominacion": 100,
  "cantidad_declarada": 20,
  "cantidad_detectada": 20
}
```

```json
{ "dispositivo_id": "CNT-001", "operacion_id": "6ba7b810-9dad-41d1-80b4-00c04fd430c8", "confirmacion": "A" }
```

---

## Pruebas

```bash
cd BANCO/backend
npm test
```

Pruebas del puente Ubuntu:

```bash
cd BANCO/ubuntu-bridge
node --test bridge.test.js
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

El endpoint local del bridge es `POST http://<ubuntu-en-la-red-del-contador>:8080/batches` y requiere `x-bridge-token`. Para el enlace serial del conteo legado, Arduino Uno 1 emite `COUNT;<lote_id>;<cantidad>\n` y después `END;<lote_id>\n`; Arduino Uno 2 envía el JSON final cuando ambos mensajes coinciden y recibe `ACK;<lote_id>\n`. El bridge devuelve HTTP `202` una vez que ese lote se guardó en la cola local, no cuando ya llegó a Render.

El flujo nuevo de depósitos usa los endpoints HTTP locales `POST /depositos/autenticar`, `POST /depositos/preparar` y `POST /depositos/confirmar`, todos con `x-bridge-token`. La autenticación y confirmación se reenvían por HTTPS y de forma síncrona; no se guardan en la cola del conteo legado. El Arduino debe llamar estos endpoints en Ubuntu, conservar el `operacion_id` recibido/generado para reintentos y esperar `accepted` antes de indicar que el depósito fue aprobado. Este repositorio no incluye firmware Arduino, por lo que aún se necesita implementar en el firmware el envío de las solicitudes de autenticación, conteo y tecla A.

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

## Seguridad y recuperación operativa

Estos controles implementan medidas técnicas alineadas con NIST CSF 2.0 e ISO/IEC 27001:2022; no constituyen una certificación ni sustituyen el análisis de riesgos, la gestión de proveedores, la respuesta organizacional a incidentes o la validación independiente.

### Controles aplicados en el código

- Las cookies de autenticación son `HttpOnly`; las mutaciones con cookie requieren un `Origin` permitido. El backend limita el cuerpo JSON y registra eventos de autenticación, revocación y depósitos confirmados sin guardar contraseñas, NIP ni tokens.
- El middleware existente limita intentos de login/NIP/SMS y revoca sesiones si se reutiliza un refresh token invalidado. Los eventos sospechosos `refresh_reuse` y `login_blocked` quedan en `auth_audit_log`.
- La tabla `users.role` asigna `customer` por defecto. El middleware consulta el rol vigente en PostgreSQL —no confía en claims del JWT— y deniega el acceso por defecto. `GET /api/admin/audit-events` solo permite el rol `admin`, devuelve como máximo 100 eventos y no expone secretos de autenticación.
- Las respuestas de API se marcan `Cache-Control: no-store`; el backend añade cabeceras anti-sniffing, anti-framing, política de referer y HSTS cuando Render confirma HTTPS. Firebase Hosting publica CSP, HSTS y cabeceras de seguridad para la SPA.
- Las conexiones del backend a PostgreSQL validan el certificado TLS y requieren TLS 1.2 o posterior. `DATABASE_URL` debe usar `sslmode=require`.

Para conceder auditoría administrativa, verificar la identidad del operador y ejecutar manualmente en Neon:

```sql
UPDATE users SET role = 'admin' WHERE id = <ID_VERIFICADO>;
```

Para retirar el permiso:

```sql
UPDATE users SET role = 'customer' WHERE id = <ID_VERIFICADO>;
```

No existe una ruta pública para asignar roles. Limitar esta operación a personal autorizado y proteger el acceso a Neon con MFA y mínimo privilegio. El backend de este proyecto ejecuta cambios de esquema al iniciar; antes de restringir permisos DDL de su rol de conexión, las migraciones deberán separarse de la cuenta de ejecución.

### TLS y endurecimiento de proveedores

Firebase Hosting y Render terminan TLS en sus plataformas. Mantener el tráfico público exclusivamente por HTTPS; verificar en los paneles de ambos proveedores que los certificados estén vigentes y que TLS 1.2/1.3 esté habilitado. El proceso Node no controla la versión TLS del terminador Render. No habilitar contenido mixto ni publicar secretos en Angular, Firebase Hosting o GitHub. Revisar la CSP después de agregar orígenes, scripts o servicios externos.

En Neon, habilitar la protección de red disponible para el proyecto, no exponer credenciales de base de datos en el frontend, usar una contraseña exclusiva y rotarla ante sospecha. La conexión del servidor valida certificados; no desactivar la validación TLS. Limitar las credenciales de Neon al servicio backend y custodiar su acceso con MFA.

### Respaldos y recuperación

La aplicación no puede activar respaldos administrados de Neon ni elegir un destino externo sin acceso al proyecto y a sus credenciales. En el panel de Neon, habilitar PITR/retención de respaldos según el plan y los objetivos de recuperación aprobados; comprobar que la retención cubra la ventana requerida. Para una copia independiente, configurar un trabajo programado de exportación cifrada a almacenamiento fuera de Neon, con acceso separado, retención definida y alertas ante fallos. No almacenar volcados en GitHub ni en Firebase Hosting.

Probar periódicamente la restauración en una rama/base aislada, validar cuentas, saldos, movimientos, depósitos y restricciones antes de cambiar Render a la base restaurada. Registrar el tiempo de recuperación y el punto de datos recuperado; nunca ensayar sobre producción.

### Guía inicial de respuesta a incidentes

1. Contener: restringir temporalmente el servicio afectado en Render/Neon, preservar logs y revisar `auth_audit_log` desde una sesión administrativa segura.
2. Revocar: cerrar las sesiones del usuario afectado; ante compromiso amplio, rotar los secretos JWT, credenciales Neon, tokens de dispositivo/bridge y claves SMS comprometidos. La rotación de secretos invalida tokens firmados con los valores anteriores.
3. Recuperar: si hubo alteración o pérdida de datos, restaurar a una rama aislada desde el punto aprobado; validar integridad e idempotencia de depósitos antes de cambiar `DATABASE_URL`.
4. Volver al servicio: revisar accesos, CORS, cookies, logs y conectividad HTTPS; reabrir el tráfico gradualmente y documentar cronología, alcance, decisiones y acciones correctivas.

La notificación a usuarios, los plazos regulatorios, los responsables de guardia y los objetivos RTO/RPO deben definirse por los responsables del proyecto; este repositorio no puede activarlos por sí solo.

---

## 📄 Licencia

Este proyecto es de uso académico y educativo.
