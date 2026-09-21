CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    fullname TEXT,
    email TEXT UNIQUE,
    birthdate DATE,
    password TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS cuentas (
    id SERIAL PRIMARY KEY,
    usuario_id INTEGER NOT NULL,
    numero_cuenta VARCHAR(10) UNIQUE NOT NULL,
    saldo NUMERIC(12,2) DEFAULT 0.00,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_usuario
        FOREIGN KEY (usuario_id)
        REFERENCES users(id)
        ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS tarjetas (
    id SERIAL PRIMARY KEY,
    cuenta_id INTEGER NOT NULL,
    numero_tarjeta VARCHAR(19) UNIQUE NOT NULL,
    mes_expiracion INTEGER NOT NULL,
    anio_expiracion INTEGER NOT NULL,
    nip_hash TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_cuenta
        FOREIGN KEY (cuenta_id)
        REFERENCES cuentas(id)
        ON DELETE CASCADE
);