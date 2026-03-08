-- Migracion para ampliar onboarding de tenants:
-- 1) Campos de contacto (persona, mail, ciudad)
-- 2) Esquema de distribuidores (captacion y servicio)

DO $$ BEGIN
    CREATE TYPE landlord.tenant_type AS ENUM ('full', 'pos_only', 'erp_only');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_type t
        JOIN pg_namespace n ON n.oid = t.typnamespace
        JOIN pg_enum e ON e.enumtypid = t.oid
        WHERE n.nspname = 'landlord'
          AND t.typname = 'tenant_type'
          AND e.enumlabel = 'erp_only'
    ) THEN
        ALTER TYPE landlord.tenant_type ADD VALUE 'erp_only';
    END IF;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

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

ALTER TABLE landlord.tenants ADD COLUMN IF NOT EXISTS type landlord.tenant_type DEFAULT 'full';
ALTER TABLE landlord.tenants ADD COLUMN IF NOT EXISTS cloud_sync BOOLEAN DEFAULT true;
ALTER TABLE landlord.tenants ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT false;
ALTER TABLE landlord.tenants ADD COLUMN IF NOT EXISTS contact_name VARCHAR(255);
ALTER TABLE landlord.tenants ADD COLUMN IF NOT EXISTS contact_email VARCHAR(255);
ALTER TABLE landlord.tenants ADD COLUMN IF NOT EXISTS city VARCHAR(120);
ALTER TABLE landlord.tenants ADD COLUMN IF NOT EXISTS captured_by_distributor_id UUID REFERENCES landlord.distributors(id) ON DELETE SET NULL;
ALTER TABLE landlord.tenants ADD COLUMN IF NOT EXISTS serviced_by_distributor_id UUID REFERENCES landlord.distributors(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tenants_captured_by_distributor ON landlord.tenants(captured_by_distributor_id);
CREATE INDEX IF NOT EXISTS idx_tenants_serviced_by_distributor ON landlord.tenants(serviced_by_distributor_id);

ALTER TABLE landlord.distributors ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Deny all to public on distributors" ON landlord.distributors;
CREATE POLICY "Deny all to public on distributors"
ON landlord.distributors
FOR ALL
TO PUBLIC
USING (false)
WITH CHECK (false);

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
SECURITY DEFINER
AS $$
DECLARE
    v_tenant_id UUID;
    v_clean_slug TEXT;
BEGIN
    v_clean_slug := lower(regexp_replace(p_slug, '[^a-zA-Z0-9_]', '_', 'g'));

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

    EXECUTE format('CREATE SCHEMA IF NOT EXISTS %I;', v_clean_slug);
    EXECUTE format('GRANT ALL ON SCHEMA %I TO service_role;', v_clean_slug);
    EXECUTE format('GRANT USAGE ON SCHEMA %I TO authenticator;', v_clean_slug);
    EXECUTE format('
        CREATE TABLE IF NOT EXISTS %I.transactions (LIKE seed_template.transactions INCLUDING ALL);
    ', v_clean_slug);
    EXECUTE format('GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA %I TO service_role;', v_clean_slug);

    RETURN v_tenant_id;
EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'Fallo al aprovisionar tenant %: %', v_clean_slug, SQLERRM;
END;
$$;

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
