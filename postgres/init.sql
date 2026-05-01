-- ==========================================
-- Inicializacion de Base de Datos n8n Los Cafeteros
-- ==========================================

-- Crea la tabla base si no existe.
CREATE TABLE IF NOT EXISTS conversation_state (
    phone VARCHAR(20) PRIMARY KEY,
    state VARCHAR(50) NOT NULL DEFAULT 'idle',
    name TEXT,
    product TEXT,
    address TEXT,
    last_message TEXT,
    draft_order JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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
    ADD COLUMN IF NOT EXISTS phone VARCHAR(20),
    ADD COLUMN IF NOT EXISTS state VARCHAR(50),
    ADD COLUMN IF NOT EXISTS name TEXT,
    ADD COLUMN IF NOT EXISTS product TEXT,
    ADD COLUMN IF NOT EXISTS address TEXT,
    ADD COLUMN IF NOT EXISTS last_message TEXT,
    ADD COLUMN IF NOT EXISTS draft_order JSONB DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

UPDATE conversation_state
SET state = 'idle'
WHERE state IS NULL OR btrim(state) = '';

ALTER TABLE conversation_state
    ALTER COLUMN phone SET NOT NULL,
    ALTER COLUMN state SET NOT NULL,
    ALTER COLUMN state SET DEFAULT 'idle';

CREATE INDEX IF NOT EXISTS idx_conversation_state_updated_at
    ON conversation_state(updated_at);

-- Funcion para actualizar el timestamp updated_at automaticamente en PostgreSQL
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_conversation_state_modtime ON conversation_state;
CREATE TRIGGER update_conversation_state_modtime
BEFORE UPDATE ON conversation_state
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();
