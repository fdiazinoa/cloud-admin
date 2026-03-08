-- =========================================================================
-- ESTRUCTURA MAESTRA CLIC-CLOUD-ADMIN (SAAS MULTI-TENANT CON ESQUEMAS AISLADOS)
-- Función: Aprovisionamiento de base de datos Postgres / Supabase
-- Autor: Antigravity - Senior DBA / Cloud Architect
-- =========================================================================

-- 1. CREACIÓN DEL ESPACIO ADMINISTRATIVO (LANDLORD)
-- -------------------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS landlord;

-- Aislar completamente el esquema del API anónimo/público (Pilar RLS/Seguridad)
REVOKE ALL ON SCHEMA landlord FROM PUBLIC;
GRANT USAGE ON SCHEMA landlord TO service_role; -- Exclusivo para el backend de tu interfaz de Admin que correrá usando SUPABASE_SERVICE_ROLE_KEY

-- Habilitar extensión para UUIDs
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Crear tipos fuertemente tipados
DO $$ BEGIN
    CREATE TYPE landlord.tenant_status AS ENUM ('ACTIVE', 'SUSPENDED', 'TRIAL');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE landlord.tenant_type AS ENUM ('full', 'pos_only', 'erp_only');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Tabla de distribuidores/canales
CREATE TABLE IF NOT EXISTS landlord.distributors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    code VARCHAR(80) UNIQUE,
    email VARCHAR(255),
    phone VARCHAR(50),
    city VARCHAR(120),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Tabla Central de Tenants
CREATE TABLE IF NOT EXISTS landlord.tenants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    -- slug: Usado param nombre del esquema (ej. 'supermercado_el_sol'). Debe cumplir reglas de identificadores de Postgres.
    slug VARCHAR(63) NOT NULL UNIQUE, 
    tax_id VARCHAR(50),
    email VARCHAR(255) NOT NULL,
    contact_name VARCHAR(255),
    contact_email VARCHAR(255),
    city VARCHAR(120),
    captured_by_distributor_id UUID REFERENCES landlord.distributors(id) ON DELETE SET NULL,
    serviced_by_distributor_id UUID REFERENCES landlord.distributors(id) ON DELETE SET NULL,
    type landlord.tenant_type DEFAULT 'full',
    cloud_sync BOOLEAN DEFAULT true,
    email_verified BOOLEAN DEFAULT false,
    status landlord.tenant_status DEFAULT 'TRIAL',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_tenants_captured_by_distributor ON landlord.tenants(captured_by_distributor_id);
CREATE INDEX IF NOT EXISTS idx_tenants_serviced_by_distributor ON landlord.tenants(serviced_by_distributor_id);

-- Tabla Relacional de Suscripciones
CREATE TABLE IF NOT EXISTS landlord.subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES landlord.tenants(id) ON DELETE CASCADE,
    plan_name VARCHAR(50) NOT NULL,
    end_date TIMESTAMP WITH TIME ZONE,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- =========================================================================
-- 2. SEGURIDAD DE ACCESO (POLÍTICAS RLS)
-- -------------------------------------------------------------------------
ALTER TABLE landlord.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE landlord.distributors ENABLE ROW LEVEL SECURITY;
ALTER TABLE landlord.subscriptions ENABLE ROW LEVEL SECURITY;

-- Permitir lectura pública de 'status' por id para validación de licencia (Kill Switch)
-- Se requiere que el POS consulte su propio status sin estar autenticado aún.
DROP POLICY IF EXISTS "Allow public read of status field" ON landlord.tenants;
CREATE POLICY "Allow public read of status field" ON landlord.tenants 
FOR SELECT TO PUBLIC 
USING (true); -- El POS usa anon key para consultar status=eq.UUID

DROP POLICY IF EXISTS "Deny all to public on subscriptions" ON landlord.subscriptions;
CREATE POLICY "Deny all to public on subscriptions" ON landlord.subscriptions FOR ALL TO PUBLIC USING (false);

DROP POLICY IF EXISTS "Deny all to public on distributors" ON landlord.distributors;
CREATE POLICY "Deny all to public on distributors" ON landlord.distributors FOR ALL TO PUBLIC USING (false) WITH CHECK (false);

-- =========================================================================
-- 2.5 REALTIME (PUBSUB)
-- -------------------------------------------------------------------------
-- Habilitar la difusión de cambios en tiempo real para el Kill Switch
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        CREATE PUBLICATION supabase_realtime;
    END IF;
END $$;

ALTER PUBLICATION supabase_realtime ADD TABLE landlord.tenants;

-- =========================================================================
-- 3. EL CLONADOR: FUNCIÓN DE APROVISIONAMIENTO (THE PROVISIONER)
-- -------------------------------------------------------------------------
-- Se asume la existencia de un esquema 'seed_template' con la estructura limpia del POS.
CREATE SCHEMA IF NOT EXISTS seed_template;

-- Ejemplo ficticio para el clonador (en un caso real, estarán todas tus tablas de CLIC-POS: tickets, productos, etc)
CREATE TABLE IF NOT EXISTS seed_template.transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    total NUMERIC(15,2),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE OR REPLACE FUNCTION landlord.create_new_tenant(
    p_name TEXT,
    p_slug TEXT,
    p_email TEXT,
    p_type TEXT DEFAULT 'full',
    p_cloud_sync BOOLEAN DEFAULT true,
    p_contact_name TEXT DEFAULT NULL,
    p_contact_email TEXT DEFAULT NULL,
    p_city TEXT DEFAULT NULL,
    p_captured_by_distributor_id UUID DEFAULT NULL,
    p_serviced_by_distributor_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER -- Se ejecuta con privilegios elevados (quien creó la función, ideal superuser)
AS $$
DECLARE
    v_tenant_id UUID;
    v_clean_slug TEXT;
BEGIN
    -- Validar que el slug sea un identificador válido (letras minúsculas y guión bajo)
    v_clean_slug := lower(regexp_replace(p_slug, '[^a-zA-Z0-9_]', '_', 'g'));

    -- 1. Insertar el tenant en Landlord
    INSERT INTO landlord.tenants (
        name,
        slug,
        email,
        status,
        type,
        cloud_sync,
        contact_name,
        contact_email,
        city,
        captured_by_distributor_id,
        serviced_by_distributor_id
    )
    VALUES (
        p_name,
        v_clean_slug,
        p_email,
        'TRIAL',
        p_type::landlord.tenant_type,
        p_cloud_sync,
        p_contact_name,
        p_contact_email,
        p_city,
        p_captured_by_distributor_id,
        p_serviced_by_distributor_id
    )
    RETURNING id INTO v_tenant_id;

    -- 2. Crear el Esquema Aislado Físicamente en PostgreSQL
    EXECUTE format('CREATE SCHEMA IF NOT EXISTS %I;', v_clean_slug);

    -- Permitir que el panel acceda al nuevo esquema
    EXECUTE format('GRANT ALL ON SCHEMA %I TO service_role;', v_clean_slug);
    
    -- Restringir uso por defecto, permitir solo a `authenticator` que Supabase una vez validado pase claims en jwt
    EXECUTE format('GRANT USAGE ON SCHEMA %I TO authenticator;', v_clean_slug);

    -- 3. Procedimiento de Clonación: Duplicar la estructura vacía desde seed_template
    -- (Nota real: requerirás iterar sobre pg_class/pg_namespace si tienes muchas tablas en el seed, 
    -- o usar una extensión pg_dump)
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

-- =========================================================================
-- 3.5 VERIFICACIÓN DE EMAIL Y ACTIVACIÓN
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION landlord.verify_tenant_email(p_token TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Por simplicidad en este MVP, asumiremos que p_token transporta el email.
    -- En producción de nivel superior, p_token es un UUID JWT real.
    UPDATE landlord.tenants SET email_verified = true WHERE email = p_token;
    RETURN FOUND;
END;
$$;

-- Funcion para cambiar de pos_only a full
CREATE OR REPLACE FUNCTION landlord.activate_tenant_erp(p_tenant_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    UPDATE landlord.tenants SET type = 'full' WHERE id = p_tenant_id;
    -- Aquí iría la lógica adicional de aprovisionamiento ERP.
    RETURN FOUND;
END;
$$;

-- =========================================================================
-- 4. CRUCE DE DATOS TRANSVERSAL (CONSOLIDATION QUERY)
-- -------------------------------------------------------------------------
-- Función que iterará automáticamente por todos los esquemas Activos calculando las ventas
-- dinámicamente. Esto le da poder sumamente analítico a CLIC-CLOUD-ADMIN.

CREATE OR REPLACE FUNCTION landlord.get_global_sales_summary()
RETURNS TABLE (
    tenant_name TEXT,
    schema_name TEXT,
    total_sales NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER 
AS $$
DECLARE
    v_tenant RECORD;
    v_sql TEXT;
BEGIN
    -- Crear una tabla temporal para almacenar resultados
    CREATE TEMP TABLE IF NOT EXISTS tmp_global_sales (
        t_name TEXT,
        s_name TEXT,
        t_sales NUMERIC
    ) ON COMMIT DROP;

    TRUNCATE tmp_global_sales;

    -- Buscar iterativamente todos los Tenants activos en landlord.tenants
    FOR v_tenant IN SELECT name, slug FROM landlord.tenants WHERE status = 'ACTIVE' LOOP
        
        -- Ejecución Dinámica conectando sumatorias desde los sub-esquemas
        v_sql := format('
            INSERT INTO tmp_global_sales (t_name, s_name, t_sales)
            SELECT %L, %L, COALESCE(SUM(total), 0)
            FROM %I.transactions;
        ', v_tenant.name, v_tenant.slug, v_tenant.slug);
        
        BEGIN
            EXECUTE v_sql;
        EXCEPTION WHEN OTHERS THEN
            -- Manejo de tolerancia a errores: si un esquema está dañado, lo registramos pero continuamos el FOR LOOP.
            RAISE WARNING 'Omitiendo tenant % por error en origen de esquema: %', v_tenant.slug, SQLERRM;
        END;

    END LOOP;

    RETURN QUERY SELECT * FROM tmp_global_sales;
END;
$$;
