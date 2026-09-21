# 🏦 Sistema Bancario Web

Sistema web bancario ficticio desarrollado como proyecto académico.
El sistema busca simular las funciones principales de una plataforma bancaria moderna, incluyendo autenticación de usuarios, administración de cuentas, protección de información y verificación mediante código SMS.

> ⚠️ **Aviso:** Este proyecto es exclusivamente académico y utiliza datos ficticios. No está diseñado para manejar dinero real ni información bancaria real.

---

## 📋 Descripción

El proyecto consiste en una plataforma bancaria web que permite a los usuarios:

* Crear y administrar una cuenta.
* Iniciar sesión de forma segura.
* Consultar información de su cuenta.
* Administrar datos personales.
* Consultar información de tarjetas.
* Generar códigos QR para compartir información de transferencia.
* Utilizar verificación en dos pasos mediante SMS.
* Proteger las contraseñas mediante hashing.
* Almacenar información en una base de datos PostgreSQL.
* Administrar el sistema mediante diferentes niveles de acceso.

---

## 🛠️ Tecnologías utilizadas

### Backend

* Node.js
* Express.js
* PostgreSQL
* Neon PostgreSQL
* bcrypt
* dotenv
* CORS

### Frontend

* HTML5
* CSS3
* JavaScript

### Servicios externos

* Twilio — verificación mediante SMS.
* QuickChart — generación de códigos QR.

---

## 📁 Estructura del proyecto

```text
BANCO/
│
├── backend/
│   │
│   ├── src/
│   │   ├── app.js
│   │   └── database.js
│   │
│   ├── tests/
│   │   └── generators.test.js
│   │
│   ├── .env
│   ├── .gitignore
│   ├── package.json
│   ├── schema.sql
│   ├── insert_test.js
│   └── query_db.js
│
├── app/
│   └── public/
│       ├── pages/
│       ├── css/
│       ├── js/
│       └── assets/
│
└── README.md
```

---

## 💻 Requisitos

Antes de ejecutar el proyecto se necesita tener instalado:

* Node.js
* npm
* PostgreSQL o una base de datos PostgreSQL mediante Neon
* Git

Para comprobar Node.js:

```bash
node --version
```

Para comprobar npm:

```bash
npm --version
```

---

## 📦 Instalación

Clonar el proyecto:

```bash
git clone <URL_DEL_REPOSITORIO>
```

Entrar al proyecto:

```bash
cd BANCO
```

Entrar al backend:

```bash
cd backend
```

Instalar las dependencias:

```bash
npm install
```

---

## 🔐 Variables de entorno

Crear un archivo `.env` dentro de:

```text
BANCO/backend/.env
```

Ejemplo:

```env
PORT=3000

DATABASE_URL=postgresql://usuario:contraseña@host/base_de_datos?sslmode=require

TWILIO_ACCOUNT_SID=tu_account_sid
TWILIO_AUTH_TOKEN=tu_auth_token
TWILIO_PHONE_NUMBER=tu_numero_twilio
```

### Importante

El archivo `.env` contiene información privada y **no debe subirse al repositorio**.

El archivo `.gitignore` debe contener:

```gitignore
node_modules/
.env
```

---

## 🗄️ Base de datos

El proyecto utiliza PostgreSQL para almacenar la información necesaria del sistema.

El esquema inicial se encuentra en:

```text
backend/schema.sql
```

La conexión con la base de datos se realiza mediante:

```text
backend/src/database.js
```

La variable utilizada para la conexión es:

```env
DATABASE_URL=
```

---

## 🚀 Ejecutar el servidor

Desde la carpeta `backend`:

```bash
cd ~/BANCO/backend
```

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

## 📄 Licencia

Este proyecto es de uso académico y educativo.
