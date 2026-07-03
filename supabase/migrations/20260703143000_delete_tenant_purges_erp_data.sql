CREATE OR REPLACE FUNCTION landlord.delete_tenant(
    p_tenant_id UUID,
    p_confirm_name TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = landlord, public
AS $$
DECLARE
    v_tenant landlord.tenants%ROWTYPE;
    v_schema_name TEXT;
    v_erp_tenant_ids UUID[] := ARRAY[]::UUID[];
    v_erp_tenant_id_texts TEXT[] := ARRAY[]::TEXT[];
    v_public_tenant_ids UUID[] := ARRAY[]::UUID[];
    v_table RECORD;
BEGIN
    SELECT *
    INTO v_tenant
    FROM landlord.tenants
    WHERE id = p_tenant_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Tenant no encontrado'
            USING ERRCODE = 'P0002';
    END IF;

    IF COALESCE(p_confirm_name, '') <> v_tenant.name THEN
        RAISE EXCEPTION 'Confirmacion de tenant invalida'
            USING ERRCODE = '22023';
    END IF;

    v_schema_name := v_tenant.slug;

    SELECT COALESCE(array_agg(id), ARRAY[]::UUID[])
    INTO v_erp_tenant_ids
    FROM public.erp_tenants
    WHERE config->>'cloudAdminTenantId' = p_tenant_id::TEXT
       OR config->>'cloud_admin_tenant_id' = p_tenant_id::TEXT
       OR config->>'cloudAdminCompanyId' = v_tenant.slug
       OR config#>>'{infrastructure,dbName}' = v_tenant.slug;

    SELECT COALESCE(array_agg(id), ARRAY[]::UUID[])
    INTO v_public_tenant_ids
    FROM public.tenants
    WHERE id = p_tenant_id
       OR code = p_tenant_id::TEXT
       OR code = v_tenant.slug
       OR (
            lower(name) = lower(v_tenant.name)
            AND NOT EXISTS (
                SELECT 1
                FROM landlord.tenants AS other
                WHERE other.id <> p_tenant_id
                  AND lower(other.name) = lower(v_tenant.name)
            )
       );

    v_erp_tenant_id_texts := ARRAY(SELECT unnest(v_erp_tenant_ids)::TEXT);

    IF COALESCE(array_length(v_erp_tenant_ids, 1), 0) > 0 THEN
        DELETE FROM public.erp_sync_dead_letter
        WHERE inbox_id IN (
            SELECT id
            FROM public.erp_sync_inbox
            WHERE tenant_id = ANY(v_erp_tenant_ids)
        );

        DELETE FROM public.erp_sync_outbox
        WHERE terminal_id IN (
            SELECT terminal.id
            FROM public.erp_terminals AS terminal
            JOIN public.erp_stores AS store
              ON store.id = terminal.store_id
            WHERE store.tenant_id = ANY(v_erp_tenant_ids)
        );

        DELETE FROM public.erp_sync_inbox
        WHERE tenant_id = ANY(v_erp_tenant_ids)
           OR store_id IN (
                SELECT id
                FROM public.erp_stores
                WHERE tenant_id = ANY(v_erp_tenant_ids)
           )
           OR terminal_id IN (
                SELECT terminal.id
                FROM public.erp_terminals AS terminal
                JOIN public.erp_stores AS store
                  ON store.id = terminal.store_id
                WHERE store.tenant_id = ANY(v_erp_tenant_ids)
           );

        DELETE FROM public.terminal_auth_attempts
        WHERE tenant_id = ANY(v_erp_tenant_ids)
           OR store_id IN (
                SELECT id
                FROM public.erp_stores
                WHERE tenant_id = ANY(v_erp_tenant_ids)
           )
           OR terminal_id IN (
                SELECT terminal.id
                FROM public.erp_terminals AS terminal
                JOIN public.erp_stores AS store
                  ON store.id = terminal.store_id
                WHERE store.tenant_id = ANY(v_erp_tenant_ids)
           )
           OR company_id IN (
                SELECT id
                FROM public.erp_companies
                WHERE tenant_id = ANY(v_erp_tenant_ids)
           );

        FOR v_table IN
            SELECT namespace.nspname AS schema_name,
                   class.relname AS table_name
            FROM pg_attribute AS attribute
            JOIN pg_class AS class
              ON class.oid = attribute.attrelid
            JOIN pg_namespace AS namespace
              ON namespace.oid = class.relnamespace
            WHERE namespace.nspname = 'public'
              AND class.relkind IN ('r', 'p')
              AND attribute.attname = 'tenant_id'
              AND NOT attribute.attisdropped
              AND class.relname NOT IN (
                    'erp_tenants',
                    'tenants',
                    'stores',
                    'terminals',
                    'sync_dead_letter',
                    'sync_inbox',
                    'sync_outbox',
                    'erp_sync_dead_letter',
                    'erp_sync_inbox',
                    'erp_sync_outbox',
                    'terminal_auth_attempts'
              )
              AND NOT EXISTS (
                    SELECT 1
                    FROM pg_constraint AS constraint_row
                    JOIN pg_attribute AS fk_attribute
                      ON fk_attribute.attrelid = constraint_row.conrelid
                     AND fk_attribute.attnum = ANY(constraint_row.conkey)
                    WHERE constraint_row.contype = 'f'
                      AND constraint_row.conrelid = class.oid
                      AND fk_attribute.attname = 'tenant_id'
                      AND constraint_row.confrelid = 'public.erp_tenants'::REGCLASS
              )
            ORDER BY class.relname ASC
        LOOP
            EXECUTE format(
                'DELETE FROM %I.%I WHERE tenant_id::TEXT = ANY($1)',
                v_table.schema_name,
                v_table.table_name
            )
            USING v_erp_tenant_id_texts;
        END LOOP;

        DELETE FROM public.erp_tenants
        WHERE id = ANY(v_erp_tenant_ids);
    END IF;

    IF COALESCE(array_length(v_public_tenant_ids, 1), 0) > 0 THEN
        DELETE FROM public.sync_dead_letter
        WHERE tenant_id = ANY(v_public_tenant_ids)
           OR tenant_id = p_tenant_id;

        DELETE FROM public.tenants
        WHERE id = ANY(v_public_tenant_ids);
    ELSE
        DELETE FROM public.sync_dead_letter
        WHERE tenant_id = p_tenant_id;
    END IF;

    DELETE FROM landlord.tenants
    WHERE id = p_tenant_id;

    IF v_schema_name IS NOT NULL
        AND v_schema_name <> ''
        AND v_schema_name NOT IN (
            'auth',
            'extensions',
            'graphql',
            'graphql_public',
            'landlord',
            'public',
            'realtime',
            'seed_template',
            'storage',
            'supabase_functions',
            'vault'
        )
    THEN
        EXECUTE format('DROP SCHEMA IF EXISTS %I CASCADE', v_schema_name);
    END IF;

    RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION landlord.delete_tenant(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION landlord.delete_tenant(UUID, TEXT) FROM anon;
REVOKE ALL ON FUNCTION landlord.delete_tenant(UUID, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION landlord.delete_tenant(UUID, TEXT) TO service_role;
