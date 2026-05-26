BEGIN;

ALTER TABLE landlord.tenants
    ADD COLUMN IF NOT EXISTS pos_variant TEXT,
    ADD COLUMN IF NOT EXISTS offline_mode BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS explicit_offline BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS cloud_disabled_reason TEXT;

ALTER TABLE landlord.tenant_semantic_audit
    ADD COLUMN IF NOT EXISTS old_contracted_product TEXT,
    ADD COLUMN IF NOT EXISTS new_contracted_product TEXT,
    ADD COLUMN IF NOT EXISTS old_cloud_channel TEXT,
    ADD COLUMN IF NOT EXISTS new_cloud_channel TEXT,
    ADD COLUMN IF NOT EXISTS old_cloud_sync_enabled BOOLEAN,
    ADD COLUMN IF NOT EXISTS new_cloud_sync_enabled BOOLEAN,
    ADD COLUMN IF NOT EXISTS old_lifecycle_status TEXT,
    ADD COLUMN IF NOT EXISTS new_lifecycle_status TEXT,
    ADD COLUMN IF NOT EXISTS old_provisioning_status TEXT,
    ADD COLUMN IF NOT EXISTS new_provisioning_status TEXT,
    ADD COLUMN IF NOT EXISTS changed_by TEXT,
    ADD COLUMN IF NOT EXISTS changed_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    ADD COLUMN IF NOT EXISTS reason TEXT;

UPDATE landlord.tenants
SET
    pos_variant = COALESCE(
        pos_variant,
        CASE
            WHEN contracted_product = 'POS_ERP' THEN 'POS_ERP'
            WHEN contracted_product = 'POS_ONLY'
                 AND (offline_mode = true OR explicit_offline = true)
                THEN 'POS_ONLY_OFFLINE'
            ELSE 'POS_ONLY_STANDARD'
        END
    );

WITH candidates AS (
    SELECT
        id,
        contracted_product AS old_contracted_product,
        cloud_channel AS old_cloud_channel,
        cloud_sync_enabled AS old_cloud_sync_enabled,
        lifecycle_status AS old_lifecycle_status,
        provisioning_status AS old_provisioning_status,
        serviced_by_distributor_id
    FROM landlord.tenants
    WHERE contracted_product = 'POS_ONLY'
      AND cloud_channel = 'NONE'
      AND COALESCE(offline_mode, false) = false
      AND COALESCE(explicit_offline, false) = false
      AND COALESCE(pos_variant, 'POS_ONLY_STANDARD') <> 'POS_ONLY_OFFLINE'
),
updated AS (
    UPDATE landlord.tenants tenants
    SET
        pos_variant = 'POS_ONLY_STANDARD',
        offline_mode = false,
        explicit_offline = false,
        cloud_disabled_reason = NULL,
        cloud_channel = 'POS_CLOUD_STAGING',
        data_master = 'POS',
        cloud_sync = true,
        cloud_sync_enabled = true,
        erp_core_enabled = true,
        erp_ui_enabled = false,
        customer_erp_access = false,
        backup_enabled = true,
        lifecycle_status = 'CLOUD_STAGING',
        provisioning_status = 'CLOUD_STAGING_REQUIRED'
    FROM candidates
    WHERE tenants.id = candidates.id
    RETURNING
        tenants.id,
        candidates.old_contracted_product,
        tenants.contracted_product AS new_contracted_product,
        candidates.old_cloud_channel,
        tenants.cloud_channel AS new_cloud_channel,
        candidates.old_cloud_sync_enabled,
        tenants.cloud_sync_enabled AS new_cloud_sync_enabled,
        candidates.old_lifecycle_status,
        tenants.lifecycle_status AS new_lifecycle_status,
        candidates.old_provisioning_status,
        tenants.provisioning_status AS new_provisioning_status,
        candidates.serviced_by_distributor_id
)
INSERT INTO landlord.tenant_semantic_audit (
    tenant_id,
    changed_fields,
    previous_values,
    new_values,
    distributor_id,
    old_contracted_product,
    new_contracted_product,
    old_cloud_channel,
    new_cloud_channel,
    old_cloud_sync_enabled,
    new_cloud_sync_enabled,
    old_lifecycle_status,
    new_lifecycle_status,
    old_provisioning_status,
    new_provisioning_status,
    changed_by,
    changed_at,
    reason
)
SELECT
    id,
    ARRAY[
        'pos_variant',
        'offline_mode',
        'explicit_offline',
        'cloud_channel',
        'cloud_sync_enabled',
        'erp_core_enabled',
        'backup_enabled',
        'lifecycle_status',
        'provisioning_status'
    ],
    jsonb_build_object(
        'cloud_channel', old_cloud_channel,
        'cloud_sync_enabled', old_cloud_sync_enabled,
        'lifecycle_status', old_lifecycle_status,
        'provisioning_status', old_provisioning_status
    ),
    jsonb_build_object(
        'cloud_channel', new_cloud_channel,
        'cloud_sync_enabled', new_cloud_sync_enabled,
        'lifecycle_status', new_lifecycle_status,
        'provisioning_status', new_provisioning_status
    ),
    serviced_by_distributor_id,
    old_contracted_product,
    new_contracted_product,
    old_cloud_channel,
    new_cloud_channel,
    old_cloud_sync_enabled,
    new_cloud_sync_enabled,
    old_lifecycle_status,
    new_lifecycle_status,
    old_provisioning_status,
    new_provisioning_status,
    'system',
    timezone('utc'::text, now()),
    'POS_ONLY SaaS default changed to POS_CLOUD_STAGING'
FROM updated;

UPDATE landlord.tenants
SET
    pos_variant = 'POS_ONLY_OFFLINE',
    offline_mode = true,
    explicit_offline = true,
    cloud_disabled_reason = COALESCE(cloud_disabled_reason, 'POS_ONLY_OFFLINE'),
    cloud_channel = 'NONE',
    data_master = 'POS',
    cloud_sync = false,
    cloud_sync_enabled = false,
    erp_core_enabled = false,
    erp_ui_enabled = false,
    customer_erp_access = false,
    backup_enabled = false,
    lifecycle_status = 'CLOUD_DISABLED',
    provisioning_status = CASE
        WHEN provisioning_status = 'BLOCKED' THEN 'BLOCKED'
        ELSE 'PENDING'
    END
WHERE contracted_product = 'POS_ONLY'
  AND (
    COALESCE(offline_mode, false) = true
    OR COALESCE(explicit_offline, false) = true
    OR pos_variant = 'POS_ONLY_OFFLINE'
  );

UPDATE landlord.tenants
SET
    pos_variant = 'POS_ERP',
    offline_mode = false,
    explicit_offline = false,
    cloud_disabled_reason = NULL,
    cloud_channel = 'ERP_ACTIVE',
    data_master = 'ERP',
    cloud_sync = true,
    cloud_sync_enabled = true,
    erp_core_enabled = true,
    erp_ui_enabled = true,
    customer_erp_access = true,
    backup_enabled = true,
    lifecycle_status = 'ERP_ACTIVE'
WHERE contracted_product = 'POS_ERP';

ALTER TABLE landlord.tenants
    ALTER COLUMN pos_variant SET DEFAULT 'POS_ONLY_STANDARD',
    ALTER COLUMN pos_variant SET NOT NULL,
    DROP CONSTRAINT IF EXISTS tenants_pos_variant_check,
    DROP CONSTRAINT IF EXISTS tenants_pos_only_offline_explicit_check,
    DROP CONSTRAINT IF EXISTS tenants_pos_only_staging_requires_cloud_check,
    DROP CONSTRAINT IF EXISTS tenants_pos_erp_semantics_strict_check,
    ADD CONSTRAINT tenants_pos_variant_check
        CHECK (pos_variant IN ('POS_ONLY_STANDARD', 'POS_ONLY_OFFLINE', 'POS_ERP')) NOT VALID,
    ADD CONSTRAINT tenants_pos_only_offline_explicit_check
        CHECK (
            contracted_product <> 'POS_ONLY'
            OR cloud_channel <> 'NONE'
            OR offline_mode = true
            OR explicit_offline = true
            OR pos_variant = 'POS_ONLY_OFFLINE'
        ) NOT VALID,
    ADD CONSTRAINT tenants_pos_only_staging_requires_cloud_check
        CHECK (
            contracted_product <> 'POS_ONLY'
            OR cloud_channel <> 'POS_CLOUD_STAGING'
            OR (
                pos_variant = 'POS_ONLY_STANDARD'
                AND offline_mode = false
                AND explicit_offline = false
                AND data_master = 'POS'
                AND cloud_sync_enabled = true
                AND erp_core_enabled = true
                AND backup_enabled = true
                AND customer_erp_access = false
                AND erp_ui_enabled = false
            )
        ) NOT VALID,
    ADD CONSTRAINT tenants_pos_erp_semantics_strict_check
        CHECK (
            contracted_product <> 'POS_ERP'
            OR (
                pos_variant = 'POS_ERP'
                AND cloud_channel = 'ERP_ACTIVE'
                AND data_master = 'ERP'
                AND cloud_sync_enabled = true
                AND erp_core_enabled = true
                AND backup_enabled = true
                AND customer_erp_access = true
                AND erp_ui_enabled = true
            )
        ) NOT VALID;

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
        'pos_variant',
        'offline_mode',
        'explicit_offline',
        'cloud_disabled_reason',
        'pos_runtime',
        'cloud_channel',
        'data_master',
        'cloud_sync_enabled',
        'erp_core_enabled',
        'backup_enabled',
        'customer_erp_access',
        'erp_ui_enabled',
        'lifecycle_status',
        'provisioning_status'
    ];
    v_old JSONB := to_jsonb(OLD);
    v_new_row JSONB := to_jsonb(NEW);
    v_actor_user_id TEXT := NULLIF(current_setting('request.jwt.claim.sub', true), '');
    v_actor_email TEXT := NULLIF(current_setting('request.jwt.claim.email', true), '');
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
            distributor_id,
            old_contracted_product,
            new_contracted_product,
            old_cloud_channel,
            new_cloud_channel,
            old_cloud_sync_enabled,
            new_cloud_sync_enabled,
            old_lifecycle_status,
            new_lifecycle_status,
            old_provisioning_status,
            new_provisioning_status,
            changed_by,
            changed_at,
            reason
        )
        VALUES (
            NEW.id,
            v_changed_fields,
            v_previous,
            v_new,
            v_actor_user_id,
            v_actor_email,
            NEW.serviced_by_distributor_id,
            OLD.contracted_product,
            NEW.contracted_product,
            OLD.cloud_channel,
            NEW.cloud_channel,
            OLD.cloud_sync_enabled,
            NEW.cloud_sync_enabled,
            OLD.lifecycle_status,
            NEW.lifecycle_status,
            OLD.provisioning_status,
            NEW.provisioning_status,
            COALESCE(v_actor_email, v_actor_user_id, 'system'),
            timezone('utc'::text, now()),
            NULLIF(current_setting('app.semantic_audit_reason', true), '')
        );
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_tenant_semantic_changes ON landlord.tenants;
CREATE TRIGGER trg_audit_tenant_semantic_changes
AFTER UPDATE OF
    contracted_product,
    pos_variant,
    offline_mode,
    explicit_offline,
    cloud_disabled_reason,
    pos_runtime,
    cloud_channel,
    data_master,
    cloud_sync_enabled,
    erp_core_enabled,
    backup_enabled,
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
    UUID,
    TEXT,
    TEXT,
    TEXT,
    TEXT,
    BOOLEAN,
    BOOLEAN,
    BOOLEAN,
    BOOLEAN,
    BOOLEAN,
    TEXT,
    TEXT
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
    p_pos_variant TEXT DEFAULT NULL,
    p_offline_mode BOOLEAN DEFAULT NULL,
    p_explicit_offline BOOLEAN DEFAULT NULL,
    p_cloud_disabled_reason TEXT DEFAULT NULL,
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
    v_pos_variant TEXT;
    v_offline_mode BOOLEAN;
    v_explicit_offline BOOLEAN;
    v_cloud_disabled_reason TEXT;
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
    v_explicit_offline := COALESCE(p_explicit_offline, false)
        OR COALESCE(p_offline_mode, false)
        OR COALESCE(p_pos_variant = 'POS_ONLY_OFFLINE', false)
        OR COALESCE(p_cloud_channel = 'NONE', false)
        OR p_cloud_sync_enabled IS FALSE
        OR p_cloud_sync IS FALSE;

    IF v_pos_runtime = 'SLAVE' THEN
        v_pos_variant := CASE WHEN v_contracted_product = 'POS_ERP' THEN 'POS_ERP' ELSE 'POS_ONLY_STANDARD' END;
        v_offline_mode := false;
        v_cloud_disabled_reason := NULL;
        v_cloud_channel := 'POS_MASTER';
        v_data_master := 'POS_MASTER';
        v_cloud_sync_enabled := false;
        v_erp_core_enabled := COALESCE(p_erp_core_enabled, v_contracted_product = 'POS_ERP');
        v_customer_erp_access := COALESCE(p_customer_erp_access, v_contracted_product = 'POS_ERP');
        v_erp_ui_enabled := false;
        v_backup_enabled := false;
        v_lifecycle_status := COALESCE(p_lifecycle_status, 'CLOUD_STAGING');
        v_provisioning_status := 'SLAVE_WAITING_MASTER';
    ELSIF v_contracted_product = 'POS_ERP' THEN
        v_pos_variant := 'POS_ERP';
        v_offline_mode := false;
        v_explicit_offline := false;
        v_cloud_disabled_reason := NULL;
        v_cloud_channel := 'ERP_ACTIVE';
        v_data_master := 'ERP';
        v_cloud_sync_enabled := true;
        v_erp_core_enabled := true;
        v_customer_erp_access := true;
        v_erp_ui_enabled := true;
        v_backup_enabled := true;
        v_lifecycle_status := COALESCE(p_lifecycle_status, 'ERP_ACTIVE');
        v_provisioning_status := COALESCE(p_provisioning_status, 'ERP_ACTIVE_REQUIRED');
    ELSIF v_explicit_offline THEN
        v_pos_variant := 'POS_ONLY_OFFLINE';
        v_offline_mode := true;
        v_cloud_disabled_reason := COALESCE(p_cloud_disabled_reason, 'POS_ONLY_OFFLINE');
        v_cloud_channel := 'NONE';
        v_data_master := 'POS';
        v_cloud_sync_enabled := false;
        v_erp_core_enabled := false;
        v_customer_erp_access := false;
        v_erp_ui_enabled := false;
        v_backup_enabled := false;
        v_lifecycle_status := 'CLOUD_DISABLED';
        v_provisioning_status := COALESCE(p_provisioning_status, 'PENDING');
    ELSE
        v_pos_variant := 'POS_ONLY_STANDARD';
        v_offline_mode := false;
        v_explicit_offline := false;
        v_cloud_disabled_reason := NULL;
        v_cloud_channel := 'POS_CLOUD_STAGING';
        v_data_master := 'POS';
        v_cloud_sync_enabled := true;
        v_erp_core_enabled := true;
        v_customer_erp_access := false;
        v_erp_ui_enabled := false;
        v_backup_enabled := true;
        v_lifecycle_status := COALESCE(p_lifecycle_status, 'CLOUD_STAGING');
        v_provisioning_status := COALESCE(p_provisioning_status, 'CLOUD_STAGING_REQUIRED');
    END IF;

    IF v_contracted_product = 'POS_ONLY' AND (v_customer_erp_access OR v_erp_ui_enabled) THEN
        RAISE EXCEPTION 'POS_ONLY no puede tener ERP visible para el cliente';
    END IF;

    IF v_contracted_product = 'POS_ONLY'
       AND v_cloud_channel = 'NONE'
       AND NOT (v_offline_mode OR v_explicit_offline OR v_pos_variant = 'POS_ONLY_OFFLINE') THEN
        RAISE EXCEPTION 'POS_ONLY solo puede quedar sin nube cuando offline es explicito';
    END IF;

    IF v_contracted_product = 'POS_ONLY'
       AND v_cloud_channel = 'POS_CLOUD_STAGING'
       AND (NOT v_cloud_sync_enabled OR NOT v_erp_core_enabled OR NOT v_backup_enabled) THEN
        RAISE EXCEPTION 'POS_ONLY con Cloud Staging requiere cloud sync, ERP core y backup activos';
    END IF;

    IF v_contracted_product = 'POS_ERP'
       AND (NOT v_customer_erp_access OR NOT v_erp_ui_enabled OR v_cloud_channel <> 'ERP_ACTIVE' OR v_data_master <> 'ERP') THEN
        RAISE EXCEPTION 'POS_ERP requiere customer_erp_access=true, erp_ui_enabled=true, data_master=ERP y cloud_channel=ERP_ACTIVE';
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
        pos_variant,
        offline_mode,
        explicit_offline,
        cloud_disabled_reason,
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
        v_cloud_sync_enabled,
        v_contracted_product,
        v_pos_variant,
        v_offline_mode,
        v_explicit_offline,
        v_cloud_disabled_reason,
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
        pos_variant = 'POS_ERP',
        offline_mode = false,
        explicit_offline = false,
        cloud_disabled_reason = NULL,
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
