CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    fullname TEXT,
    email TEXT UNIQUE,
    birthdate DATE,
    phone TEXT,
    password TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE users ADD COLUMN IF NOT EXISTS phone TEXT;

CREATE TABLE IF NOT EXISTS cuentas (
    id SERIAL PRIMARY KEY,
    usuario_id INTEGER NOT NULL,
    numero_cuenta VARCHAR(10) UNIQUE NOT NULL,
    saldo NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_usuario
        FOREIGN KEY (usuario_id)
        REFERENCES users(id)
        ON DELETE CASCADE
);

UPDATE cuentas SET saldo = 0 WHERE saldo IS NULL;
ALTER TABLE cuentas ALTER COLUMN saldo SET DEFAULT 0.00;
ALTER TABLE cuentas ALTER COLUMN saldo SET NOT NULL;

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

CREATE TABLE IF NOT EXISTS contadores (
    id SERIAL PRIMARY KEY,
    dispositivo_id VARCHAR(100) NOT NULL,
    cantidad_billetes INTEGER NOT NULL CHECK (cantidad_billetes >= 0),
    fecha_hora TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    lote_id UUID
);

ALTER TABLE contadores ADD COLUMN IF NOT EXISTS lote_id UUID;
UPDATE contadores SET lote_id = gen_random_uuid() WHERE lote_id IS NULL;
ALTER TABLE contadores ALTER COLUMN lote_id SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_contadores_dispositivo_lote
    ON contadores (dispositivo_id, lote_id)
    WHERE lote_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_contadores_pendientes
    ON contadores (dispositivo_id, created_at DESC)
    WHERE cantidad_billetes > 0;

CREATE TABLE IF NOT EXISTS depositos (
    id BIGSERIAL PRIMARY KEY,
    operacion_id UUID NOT NULL UNIQUE,
    cuenta_id INTEGER NOT NULL REFERENCES cuentas(id) ON DELETE RESTRICT,
    contador_id INTEGER NOT NULL REFERENCES contadores(id) ON DELETE RESTRICT,
    denominacion INTEGER NOT NULL CHECK (denominacion IN (20, 50, 100, 200, 500)),
    cantidad_billetes INTEGER NOT NULL CHECK (cantidad_billetes BETWEEN 1 AND 10000),
    importe NUMERIC(12,2) NOT NULL CHECK (importe > 0),
    estado VARCHAR(20) NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'confirmado', 'cancelado')),
    saldo_resultante NUMERIC(12,2),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    confirmado_at TIMESTAMPTZ,
    CONSTRAINT ck_deposito_importe CHECK (importe = denominacion * cantidad_billetes),
    CONSTRAINT ck_deposito_confirmacion CHECK (
        (estado = 'pendiente' AND confirmado_at IS NULL AND saldo_resultante IS NULL)
        OR (estado = 'confirmado' AND confirmado_at IS NOT NULL AND saldo_resultante IS NOT NULL)
        OR (estado = 'cancelado' AND confirmado_at IS NULL AND saldo_resultante IS NULL)
    )
);

ALTER TABLE depositos DROP CONSTRAINT IF EXISTS depositos_contador_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS uq_depositos_contador_activo
    ON depositos (contador_id)
    WHERE estado <> 'cancelado';
CREATE INDEX IF NOT EXISTS idx_depositos_cuenta_created_at
    ON depositos (cuenta_id, created_at DESC);

CREATE TABLE IF NOT EXISTS movimientos (
    id BIGSERIAL PRIMARY KEY,
    cuenta_id INTEGER NOT NULL REFERENCES cuentas(id) ON DELETE RESTRICT,
    tipo VARCHAR(40) NOT NULL,
    monto NUMERIC(12,2) NOT NULL CHECK (monto > 0),
    descripcion TEXT NOT NULL,
    referencia_id UUID NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_movimientos_cuenta_created_at
    ON movimientos (cuenta_id, created_at DESC);