BEGIN;

ALTER TABLE landlord.tenants
    ADD COLUMN IF NOT EXISTS contracted_product TEXT,
    ADD COLUMN IF NOT EXISTS pos_runtime TEXT,
    ADD COLUMN IF NOT EXISTS cloud_channel TEXT,
    ADD COLUMN IF NOT EXISTS data_master TEXT,
    ADD COLUMN IF NOT EXISTS cloud_sync_enabled BOOLEAN,
    ADD COLUMN IF NOT EXISTS erp_core_enabled BOOLEAN,
    ADD COLUMN IF NOT EXISTS erp_ui_enabled BOOLEAN,
    ADD COLUMN IF NOT EXISTS customer_erp_access BOOLEAN,
    ADD COLUMN IF NOT EXISTS backup_enabled BOOLEAN,
    ADD COLUMN IF NOT EXISTS lifecycle_status TEXT,
    ADD COLUMN IF NOT EXISTS provisioning_status TEXT,
    ADD COLUMN IF NOT EXISTS last_sync_received_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS last_backup_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS ready_for_erp_activation BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS pending_events_count INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS blocked_events_count INTEGER NOT NULL DEFAULT 0;

UPDATE landlord.tenants
SET
    contracted_product = COALESCE(
        contracted_product,
        CASE
            WHEN type IN ('full', 'erp_only') THEN 'POS_ERP'
            ELSE 'POS_ONLY'
        END
    ),
    pos_runtime = COALESCE(pos_runtime, 'LOCAL_SQLITE');

UPDATE landlord.tenants
SET
    cloud_channel = COALESCE(
        cloud_channel,
        CASE
            WHEN contracted_product = 'POS_ERP' THEN 'ERP_ACTIVE'
            WHEN COALESCE(cloud_sync, false) THEN 'POS_CLOUD_STAGING'
            ELSE 'NONE'
        END
    ),
    data_master = COALESCE(
        data_master,
        CASE
            WHEN contracted_product = 'POS_ERP' THEN 'ERP'
            ELSE 'POS'
        END
    ),
    cloud_sync_enabled = COALESCE(
        cloud_sync_enabled,
        CASE
            WHEN contracted_product = 'POS_ERP' THEN true
            ELSE COALESCE(cloud_sync, false)
        END
    ),
    erp_core_enabled = COALESCE(
        erp_core_enabled,
        contracted_product = 'POS_ERP' OR COALESCE(cloud_sync, false)
    ),
    erp_ui_enabled = COALESCE(erp_ui_enabled, contracted_product = 'POS_ERP'),
    customer_erp_access = COALESCE(customer_erp_access, contracted_product = 'POS_ERP'),
    backup_enabled = COALESCE(
        backup_enabled,
        contracted_product = 'POS_ERP' OR COALESCE(cloud_sync, false)
    ),
    lifecycle_status = COALESCE(
        lifecycle_status,
        CASE
            WHEN contracted_product = 'POS_ERP' THEN 'ERP_ACTIVE'
            WHEN COALESCE(cloud_sync, false) THEN 'CLOUD_STAGING'
            ELSE 'CLOUD_DISABLED'
        END
    ),
    provisioning_status = COALESCE(
        provisioning_status,
        CASE
            WHEN contracted_product = 'POS_ERP' THEN 'ERP_ACTIVE_REQUIRED'
            WHEN COALESCE(cloud_sync, false) THEN 'CLOUD_STAGING_REQUIRED'
            ELSE 'PENDING'
        END
    );

UPDATE landlord.tenants
SET
    cloud_channel = 'POS_MASTER',
    data_master = 'POS_MASTER',
    erp_ui_enabled = false,
    provisioning_status = 'SLAVE_WAITING_MASTER'
WHERE pos_runtime = 'SLAVE';

ALTER TABLE landlord.tenants
    ALTER COLUMN contracted_product SET DEFAULT 'POS_ERP',
    ALTER COLUMN pos_runtime SET DEFAULT 'LOCAL_SQLITE',
    ALTER COLUMN cloud_channel SET DEFAULT 'ERP_ACTIVE',
    ALTER COLUMN data_master SET DEFAULT 'ERP',
    ALTER COLUMN cloud_sync_enabled SET DEFAULT true,
    ALTER COLUMN erp_core_enabled SET DEFAULT true,
    ALTER COLUMN erp_ui_enabled SET DEFAULT true,
    ALTER COLUMN customer_erp_access SET DEFAULT true,
    ALTER COLUMN backup_enabled SET DEFAULT true,
    ALTER COLUMN lifecycle_status SET DEFAULT 'ERP_ACTIVE',
    ALTER COLUMN provisioning_status SET DEFAULT 'ERP_ACTIVE_REQUIRED',
    ALTER COLUMN contracted_product SET NOT NULL,
    ALTER COLUMN pos_runtime SET NOT NULL,
    ALTER COLUMN cloud_channel SET NOT NULL,
    ALTER COLUMN data_master SET NOT NULL,
    ALTER COLUMN cloud_sync_enabled SET NOT NULL,
    ALTER COLUMN erp_core_enabled SET NOT NULL,
    ALTER COLUMN erp_ui_enabled SET NOT NULL,
    ALTER COLUMN customer_erp_access SET NOT NULL,
    ALTER COLUMN backup_enabled SET NOT NULL,
    ALTER COLUMN lifecycle_status SET NOT NULL,
    ALTER COLUMN provisioning_status SET NOT NULL;

ALTER TABLE landlord.tenants
    DROP CONSTRAINT IF EXISTS tenants_contracted_product_check,
    DROP CONSTRAINT IF EXISTS tenants_pos_runtime_check,
    DROP CONSTRAINT IF EXISTS tenants_cloud_channel_check,
    DROP CONSTRAINT IF EXISTS tenants_data_master_check,
    DROP CONSTRAINT IF EXISTS tenants_lifecycle_status_check,
    DROP CONSTRAINT IF EXISTS tenants_provisioning_status_check,
    DROP CONSTRAINT IF EXISTS tenants_pos_only_no_erp_access_check,
    DROP CONSTRAINT IF EXISTS tenants_pos_erp_requires_erp_active_check,
    DROP CONSTRAINT IF EXISTS tenants_slave_routes_to_master_check;

ALTER TABLE landlord.tenants
    ADD CONSTRAINT tenants_contracted_product_check
        CHECK (contracted_product IN ('POS_ONLY', 'POS_ERP')) NOT VALID,
    ADD CONSTRAINT tenants_pos_runtime_check
        CHECK (pos_runtime IN ('LOCAL_SQLITE', 'MASTER', 'SLAVE')) NOT VALID,
    ADD CONSTRAINT tenants_cloud_channel_check
        CHECK (cloud_channel IN ('NONE', 'POS_CLOUD_STAGING', 'ERP_ACTIVE', 'POS_MASTER')) NOT VALID,
    ADD CONSTRAINT tenants_data_master_check
        CHECK (data_master IN ('POS', 'ERP', 'POS_MASTER')) NOT VALID,
    ADD CONSTRAINT tenants_lifecycle_status_check
        CHECK (lifecycle_status IN (
            'CLOUD_DISABLED',
            'CLOUD_STAGING',
            'CLOUD_SYNCING',
            'CLOUD_READY',
            'READY_FOR_ERP_ACTIVATION',
            'ERP_ACTIVE',
            'BLOCKED'
        )) NOT VALID,
    ADD CONSTRAINT tenants_provisioning_status_check
        CHECK (provisioning_status IN (
            'PENDING',
            'CLOUD_STAGING_REQUIRED',
            'CLOUD_STAGING_READY',
            'ERP_ACTIVE_REQUIRED',
            'ERP_ACTIVE_READY',
            'SLAVE_WAITING_MASTER',
            'BLOCKED'
        )) NOT VALID,
    ADD CONSTRAINT tenants_pos_only_no_erp_access_check
        CHECK (
            contracted_product <> 'POS_ONLY'
            OR (customer_erp_access = false AND erp_ui_enabled = false)
        ) NOT VALID,
    ADD CONSTRAINT tenants_pos_erp_requires_erp_active_check
        CHECK (
            contracted_product <> 'POS_ERP'
            OR (customer_erp_access = true AND erp_ui_enabled = true AND cloud_channel = 'ERP_ACTIVE')
        ) NOT VALID,
    ADD CONSTRAINT tenants_slave_routes_to_master_check
        CHECK (
            pos_runtime <> 'SLAVE'
            OR (cloud_channel = 'POS_MASTER' AND data_master = 'POS_MASTER' AND erp_ui_enabled = false)
        ) NOT VALID;

CREATE TABLE IF NOT EXISTS landlord.tenant_semantic_audit (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES landlord.tenants(id) ON DELETE CASCADE,
    event TEXT NOT NULL DEFAULT 'TENANT_SEMANTICS_CHANGED',
    changed_fields TEXT[] NOT NULL DEFAULT '{}',
    previous_values JSONB NOT NULL DEFAULT '{}'::JSONB,
    new_values JSONB NOT NULL DEFAULT '{}'::JSONB,
    actor_user_id TEXT,
    actor_email TEXT,
    distributor_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS tenant_semantic_audit_tenant_created_idx
ON landlord.tenant_semantic_audit (tenant_id, created_at DESC);

ALTER TABLE landlord.tenant_semantic_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Deny all to public on tenant_semantic_audit" ON landlord.tenant_semantic_audit;
CREATE POLICY "Deny all to public on tenant_semantic_audit"
ON landlord.tenant_semantic_audit
FOR ALL TO PUBLIC
USING (false)
WITH CHECK (false);

CREATE OR REPLACE FUNCTION landlord.audit_tenant_semantic_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_changed_fields TEXT[] := '{}';
    v_previous JSONB := '{}'::JSONB;
    v_new JSONB := '{}'::JSONB;
    v_field TEXT;
    v_fields CONSTANT TEXT[] := ARRAY[
        'contracted_product',
        'pos_runtime',
        'cloud_channel',
        'data_master',
        'customer_erp_access',
        'erp_ui_enabled',
        'lifecycle_status',
        'provisioning_status'
    ];
    v_old JSONB := to_jsonb(OLD);
    v_new_row JSONB := to_jsonb(NEW);
BEGIN
    FOREACH v_field IN ARRAY v_fields LOOP
        IF v_old -> v_field IS DISTINCT FROM v_new_row -> v_field THEN
            v_changed_fields := array_append(v_changed_fields, v_field);
            v_previous := jsonb_set(v_previous, ARRAY[v_field], COALESCE(v_old -> v_field, 'null'::JSONB), true);
            v_new := jsonb_set(v_new, ARRAY[v_field], COALESCE(v_new_row -> v_field, 'null'::JSONB), true);
        END IF;
    END LOOP;

    IF array_length(v_changed_fields, 1) IS NOT NULL THEN
        INSERT INTO landlord.tenant_semantic_audit (
            tenant_id,
            changed_fields,
            previous_values,
            new_values,
            actor_user_id,
            actor_email,
            distributor_id
        )
        VALUES (
            NEW.id,
            v_changed_fields,
            v_previous,
            v_new,
            NULLIF(current_setting('request.jwt.claim.sub', true), ''),
            NULLIF(current_setting('request.jwt.claim.email', true), ''),
            NEW.serviced_by_distributor_id
        );
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_tenant_semantic_changes ON landlord.tenants;
CREATE TRIGGER trg_audit_tenant_semantic_changes
AFTER UPDATE OF
    contracted_product,
    pos_runtime,
    cloud_channel,
    data_master,
    customer_erp_access,
    erp_ui_enabled,
    lifecycle_status,
    provisioning_status
ON landlord.tenants
FOR EACH ROW
EXECUTE FUNCTION landlord.audit_tenant_semantic_changes();

DROP FUNCTION IF EXISTS landlord.create_new_tenant(
    TEXT,
    TEXT,
    TEXT,
    TEXT,
    BOOLEAN,
    TEXT,
    TEXT,
    TEXT,
    UUID,
    UUID
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
    p_serviced_by_distributor_id UUID DEFAULT NULL,
    p_contracted_product TEXT DEFAULT NULL,
    p_pos_runtime TEXT DEFAULT NULL,
    p_cloud_channel TEXT DEFAULT NULL,
    p_data_master TEXT DEFAULT NULL,
    p_cloud_sync_enabled BOOLEAN DEFAULT NULL,
    p_erp_core_enabled BOOLEAN DEFAULT NULL,
    p_erp_ui_enabled BOOLEAN DEFAULT NULL,
    p_customer_erp_access BOOLEAN DEFAULT NULL,
    p_backup_enabled BOOLEAN DEFAULT NULL,
    p_lifecycle_status TEXT DEFAULT NULL,
    p_provisioning_status TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_tenant_id UUID;
    v_clean_slug TEXT;
    v_contracted_product TEXT;
    v_pos_runtime TEXT;
    v_cloud_channel TEXT;
    v_data_master TEXT;
    v_cloud_sync_enabled BOOLEAN;
    v_erp_core_enabled BOOLEAN;
    v_erp_ui_enabled BOOLEAN;
    v_customer_erp_access BOOLEAN;
    v_backup_enabled BOOLEAN;
    v_lifecycle_status TEXT;
    v_provisioning_status TEXT;
BEGIN
    v_clean_slug := lower(regexp_replace(p_slug, '[^a-zA-Z0-9_]', '_', 'g'));
    v_contracted_product := COALESCE(
        p_contracted_product,
        CASE WHEN p_type IN ('full', 'erp_only') THEN 'POS_ERP' ELSE 'POS_ONLY' END
    );
    v_pos_runtime := COALESCE(p_pos_runtime, 'LOCAL_SQLITE');

    IF v_pos_runtime = 'SLAVE' THEN
        v_cloud_channel := 'POS_MASTER';
        v_data_master := 'POS_MASTER';
        v_cloud_sync_enabled := COALESCE(p_cloud_sync_enabled, false);
        v_erp_core_enabled := COALESCE(p_erp_core_enabled, v_contracted_product = 'POS_ERP');
        v_customer_erp_access := COALESCE(p_customer_erp_access, v_contracted_product = 'POS_ERP');
        v_erp_ui_enabled := false;
        v_backup_enabled := COALESCE(p_backup_enabled, false);
        v_lifecycle_status := COALESCE(p_lifecycle_status, 'CLOUD_STAGING');
        v_provisioning_status := 'SLAVE_WAITING_MASTER';
    ELSIF v_contracted_product = 'POS_ERP' THEN
        v_cloud_channel := COALESCE(p_cloud_channel, 'ERP_ACTIVE');
        v_data_master := COALESCE(p_data_master, 'ERP');
        v_cloud_sync_enabled := COALESCE(p_cloud_sync_enabled, true);
        v_erp_core_enabled := COALESCE(p_erp_core_enabled, true);
        v_customer_erp_access := COALESCE(p_customer_erp_access, true);
        v_erp_ui_enabled := COALESCE(p_erp_ui_enabled, true);
        v_backup_enabled := COALESCE(p_backup_enabled, true);
        v_lifecycle_status := COALESCE(p_lifecycle_status, 'ERP_ACTIVE');
        v_provisioning_status := COALESCE(p_provisioning_status, 'ERP_ACTIVE_REQUIRED');
    ELSIF COALESCE(p_cloud_sync_enabled, p_cloud_sync, false) THEN
        v_cloud_channel := COALESCE(p_cloud_channel, 'POS_CLOUD_STAGING');
        v_data_master := COALESCE(p_data_master, 'POS');
        v_cloud_sync_enabled := true;
        v_erp_core_enabled := COALESCE(p_erp_core_enabled, true);
        v_customer_erp_access := false;
        v_erp_ui_enabled := false;
        v_backup_enabled := COALESCE(p_backup_enabled, true);
        v_lifecycle_status := COALESCE(p_lifecycle_status, 'CLOUD_STAGING');
        v_provisioning_status := COALESCE(p_provisioning_status, 'CLOUD_STAGING_REQUIRED');
    ELSE
        v_cloud_channel := COALESCE(p_cloud_channel, 'NONE');
        v_data_master := COALESCE(p_data_master, 'POS');
        v_cloud_sync_enabled := false;
        v_erp_core_enabled := COALESCE(p_erp_core_enabled, false);
        v_customer_erp_access := false;
        v_erp_ui_enabled := false;
        v_backup_enabled := COALESCE(p_backup_enabled, false);
        v_lifecycle_status := COALESCE(p_lifecycle_status, 'CLOUD_DISABLED');
        v_provisioning_status := COALESCE(p_provisioning_status, 'PENDING');
    END IF;

    IF v_contracted_product = 'POS_ONLY' AND (v_customer_erp_access OR v_erp_ui_enabled) THEN
        RAISE EXCEPTION 'POS_ONLY no puede tener ERP visible para el cliente';
    END IF;

    IF v_contracted_product = 'POS_ERP' AND (NOT v_customer_erp_access OR v_cloud_channel <> 'ERP_ACTIVE') THEN
        RAISE EXCEPTION 'POS_ERP requiere customer_erp_access=true y cloud_channel=ERP_ACTIVE';
    END IF;

    IF v_pos_runtime = 'SLAVE' AND (v_cloud_channel <> 'POS_MASTER' OR v_data_master <> 'POS_MASTER') THEN
        RAISE EXCEPTION 'POS_SLAVE debe depender de POS_MASTER';
    END IF;

    INSERT INTO landlord.tenants (
        name,
        slug,
        email,
        status,
        type,
        cloud_sync,
        contracted_product,
        pos_runtime,
        cloud_channel,
        data_master,
        cloud_sync_enabled,
        erp_core_enabled,
        erp_ui_enabled,
        customer_erp_access,
        backup_enabled,
        lifecycle_status,
        provisioning_status,
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
        v_contracted_product,
        v_pos_runtime,
        v_cloud_channel,
        v_data_master,
        v_cloud_sync_enabled,
        v_erp_core_enabled,
        v_erp_ui_enabled,
        v_customer_erp_access,
        v_backup_enabled,
        v_lifecycle_status,
        v_provisioning_status,
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

CREATE OR REPLACE FUNCTION landlord.activate_tenant_erp(p_tenant_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    UPDATE landlord.tenants
    SET
        type = 'full',
        cloud_sync = true,
        contracted_product = 'POS_ERP',
        cloud_channel = 'ERP_ACTIVE',
        data_master = 'ERP',
        cloud_sync_enabled = true,
        erp_core_enabled = true,
        erp_ui_enabled = true,
        customer_erp_access = true,
        backup_enabled = true,
        lifecycle_status = 'ERP_ACTIVE',
        provisioning_status = 'ERP_ACTIVE_REQUIRED'
    WHERE id = p_tenant_id
      AND cloud_channel = 'POS_CLOUD_STAGING'
      AND ready_for_erp_activation = true
      AND blocked_events_count = 0;

    RETURN FOUND;
END;
$$;

COMMIT;
