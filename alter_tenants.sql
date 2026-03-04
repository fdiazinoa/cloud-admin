-- Migración para añadir soporte de verificación de email y tipos de tenant en Clic-Cloud Admin

-- 1. Crear el nuevo tipo de tenant (ENUM) si no existe
DO $$ BEGIN
    CREATE TYPE landlord.tenant_type AS ENUM ('full', 'pos_only');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 2. Añadir las nuevas columnas a la tabla landlord.tenants
ALTER TABLE landlord.tenants ADD COLUMN IF NOT EXISTS type landlord.tenant_type DEFAULT 'full';
ALTER TABLE landlord.tenants ADD COLUMN IF NOT EXISTS cloud_sync BOOLEAN DEFAULT true;
ALTER TABLE landlord.tenants ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT false;

-- 3. Actualizar la función aprovisionadora para recibir los nuevos parámetros
CREATE OR REPLACE FUNCTION landlord.create_new_tenant(p_name TEXT, p_slug TEXT, p_email TEXT, p_type TEXT DEFAULT 'full', p_cloud_sync BOOLEAN DEFAULT true)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_tenant_id UUID;
    v_clean_slug TEXT;
BEGIN
    -- Validar que el slug sea un identificador válido (letras minúsculas y guión bajo)
    v_clean_slug := lower(regexp_replace(p_slug, '[^a-zA-Z0-9_]', '_', 'g'));

    -- 1. Insertar el tenant en Landlord con los nuevos campos
    INSERT INTO landlord.tenants (name, slug, email, status, type, cloud_sync)
    VALUES (p_name, v_clean_slug, p_email, 'TRIAL', p_type::landlord.tenant_type, p_cloud_sync)
    RETURNING id INTO v_tenant_id;

    -- 2. Crear el Esquema Aislado Físicamente en PostgreSQL
    EXECUTE format('CREATE SCHEMA IF NOT EXISTS %I;', v_clean_slug);

    -- Permitir que el panel acceda al nuevo esquema
    EXECUTE format('GRANT ALL ON SCHEMA %I TO service_role;', v_clean_slug);
    
    -- Restringir uso por defecto, permitir solo a `authenticator` que Supabase una vez validado pase claims en jwt
    EXECUTE format('GRANT USAGE ON SCHEMA %I TO authenticator;', v_clean_slug);

    -- 3. Procedimiento de Clonación: Duplicar la estructura vacía desde seed_template
    EXECUTE format('
        CREATE TABLE IF NOT EXISTS %I.transactions (LIKE seed_template.transactions INCLUDING ALL);
    ', v_clean_slug);

    -- Setear privilegios para que el RLS y las API funcionen en la nueva tabla
    EXECUTE format('GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA %I TO service_role;', v_clean_slug);
    
    RETURN v_tenant_id;
EXCEPTION WHEN OTHERS THEN
    -- Rollback manejado automáticamente por Postgres
    RAISE EXCEPTION 'Fallo al aprovisionar tenant %: %', v_clean_slug, SQLERRM;
END;
$$;

-- 4. Crear funciones para verificación de email y activación posterior
CREATE OR REPLACE FUNCTION landlord.verify_tenant_email(p_token TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    UPDATE landlord.tenants SET email_verified = true WHERE email = p_token;
    RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION landlord.activate_tenant_erp(p_tenant_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    UPDATE landlord.tenants SET type = 'full' WHERE id = p_tenant_id;
    RETURN FOUND;
END;
$$;
