-- ==========================================
-- Inicializacion de Base de Datos n8n Los Cafeteros
-- PostgreSQL = fuente de verdad
-- ==========================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE IF NOT EXISTS riders (
    phone TEXT PRIMARY KEY,
    name TEXT,
    active BOOLEAN DEFAULT true
);

CREATE TABLE IF NOT EXISTS conversation_state (
    phone TEXT PRIMARY KEY,
    state TEXT,
    name TEXT,
    product TEXT,
    quantity INTEGER,
    address TEXT,
    payment_type TEXT,
    draft_order JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS orders (
    id BIGSERIAL PRIMARY KEY,
    order_code TEXT UNIQUE,
    message_id TEXT UNIQUE,
    customer_phone TEXT,
    customer_name TEXT,
    product TEXT,
    quantity INTEGER,
    address TEXT,
    payment_type TEXT,
    status TEXT DEFAULT 'pending',
    rider_phone TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    delivered_at TIMESTAMPTZ
);

-- Migra columnas del esquema anterior si la tabla ya existia.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'conversation_state'
          AND column_name = 'phone_number'
    ) AND NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'conversation_state'
          AND column_name = 'phone'
    ) THEN
        ALTER TABLE conversation_state RENAME COLUMN phone_number TO phone;
    END IF;
END $$;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'conversation_state'
          AND column_name = 'step'
    ) AND NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'conversation_state'
          AND column_name = 'state'
    ) THEN
        ALTER TABLE conversation_state RENAME COLUMN step TO state;
    END IF;
END $$;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'conversation_state'
          AND column_name = 'nombre'
    ) AND NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'conversation_state'
          AND column_name = 'name'
    ) THEN
        ALTER TABLE conversation_state RENAME COLUMN nombre TO name;
    END IF;
END $$;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'conversation_state'
          AND column_name = 'direccion'
    ) AND NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'conversation_state'
          AND column_name = 'address'
    ) THEN
        ALTER TABLE conversation_state RENAME COLUMN direccion TO address;
    END IF;
END $$;

ALTER TABLE conversation_state
    ADD COLUMN IF NOT EXISTS phone TEXT,
    ADD COLUMN IF NOT EXISTS state TEXT,
    ADD COLUMN IF NOT EXISTS name TEXT,
    ADD COLUMN IF NOT EXISTS product TEXT,
    ADD COLUMN IF NOT EXISTS quantity INTEGER,
    ADD COLUMN IF NOT EXISTS address TEXT,
    ADD COLUMN IF NOT EXISTS payment_type TEXT,
    ADD COLUMN IF NOT EXISTS draft_order JSONB,
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW(),
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

UPDATE conversation_state
SET state = 'idle'
WHERE state IS NULL OR btrim(state) = '';

UPDATE conversation_state
SET draft_order = '{}'::jsonb
WHERE draft_order IS NULL;

ALTER TABLE conversation_state
    ALTER COLUMN phone SET NOT NULL,
    ALTER COLUMN state SET DEFAULT 'idle',
    ALTER COLUMN created_at TYPE TIMESTAMPTZ USING created_at AT TIME ZONE 'UTC',
    ALTER COLUMN updated_at TYPE TIMESTAMPTZ USING updated_at AT TIME ZONE 'UTC';

ALTER TABLE orders
    ALTER COLUMN created_at TYPE TIMESTAMPTZ USING created_at AT TIME ZONE 'UTC',
    ALTER COLUMN updated_at TYPE TIMESTAMPTZ USING updated_at AT TIME ZONE 'UTC';

CREATE INDEX IF NOT EXISTS idx_conversation_state_updated_at
    ON conversation_state(updated_at);

CREATE INDEX IF NOT EXISTS idx_orders_order_code
    ON orders(order_code);

CREATE INDEX IF NOT EXISTS idx_orders_customer_phone
    ON orders(customer_phone);

CREATE INDEX IF NOT EXISTS idx_orders_status
    ON orders(status);

DROP TRIGGER IF EXISTS update_conversation_state_modtime ON conversation_state;
CREATE TRIGGER update_conversation_state_modtime
BEFORE UPDATE ON conversation_state
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_orders_modtime ON orders;
CREATE TRIGGER update_orders_modtime
BEFORE UPDATE ON orders
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();
