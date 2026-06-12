BEGIN;

DO $$
DECLARE
    v_tenant_id uuid := '03aa87fb-906a-46ca-a066-4c51bf080c4e'::uuid;
    v_canonical_terminal_id uuid := 'dfc69374-becc-4644-bad7-2808ddef2248'::uuid;
    v_ghost_terminal_id uuid := '62fd00ca-c204-4dd4-9eb4-c35c933affa8'::uuid;
    v_device_id text := 'DEV-XZ96929V';
    v_terminal_name text := 'Bar-001';
    v_config_cast text := 'jsonb';
BEGIN
    IF to_regclass('public.erp_terminals') IS NOT NULL THEN
        SELECT CASE WHEN udt_name = 'json' THEN 'json' ELSE 'jsonb' END
        INTO v_config_cast
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'erp_terminals'
          AND column_name = 'config';

        v_config_cast := COALESCE(v_config_cast, 'jsonb');

        EXECUTE format($sql$
            UPDATE public.erp_terminals AS terminal
            SET
                device_id = 'ARCHIVED-' || LEFT(terminal.id::text, 8),
                name = CASE
                    WHEN UPPER(BTRIM(COALESCE(terminal.name, ''))) LIKE 'ARCHIVED-%%' THEN terminal.name
                    ELSE 'ARCHIVED-' || COALESCE(NULLIF(BTRIM(terminal.name), ''), $3) || '-' || LEFT(terminal.id::text, 8)
                END,
                config = (
                    jsonb_set(
                        jsonb_set(
                            jsonb_set(
                                COALESCE(terminal.config::jsonb, '{}'::jsonb),
                                '{active}',
                                'false'::jsonb,
                                true
                            ),
                            '{is_active}',
                            'false'::jsonb,
                            true
                        ),
                        '{metadata}',
                        COALESCE(terminal.config::jsonb->'metadata', '{}'::jsonb) || jsonb_build_object(
                            'archived', true,
                            'archived_at', NOW(),
                            'archive_reason', 'POS_ERP_GHOST_TERMINAL_CANONICALIZED',
                            'canonical_erp_terminal_id', $1::text,
                            'ghost_erp_terminal_id', $2::text,
                            'authorized_device_id', $4,
                            'terminal_name', $3
                        ),
                        true
                    )
                )::%s
            WHERE terminal.id = $2
              AND terminal.id <> $1
        $sql$, v_config_cast)
        USING v_canonical_terminal_id, v_ghost_terminal_id, v_terminal_name, v_device_id;

        EXECUTE format($sql$
            UPDATE public.erp_terminals AS terminal
            SET
                device_id = $2,
                name = COALESCE(NULLIF(BTRIM(terminal.name), ''), $3),
                config = (
                    jsonb_set(
                        jsonb_set(
                            jsonb_set(
                                COALESCE(terminal.config::jsonb, '{}'::jsonb),
                                '{active}',
                                'true'::jsonb,
                                true
                            ),
                            '{is_active}',
                            'true'::jsonb,
                            true
                        ),
                        '{metadata}',
                        COALESCE(terminal.config::jsonb->'metadata', '{}'::jsonb) || jsonb_build_object(
                            'archived', false,
                            'canonical_erp_terminal_id', $1::text,
                            'authorized_device_id', $2,
                            'current_device_id', $2,
                            'terminal_name', $3,
                            'terminal_code', $3,
                            'ghost_erp_terminal_id_archived', $4::text,
                            'canonicalized_at', NOW()
                        ),
                        true
                    )
                )::%s,
                last_seen = COALESCE(terminal.last_seen, NOW())
            WHERE terminal.id = $1
        $sql$, v_config_cast)
        USING v_canonical_terminal_id, v_device_id, v_terminal_name, v_ghost_terminal_id;
    END IF;

    UPDATE landlord.tenant_server_registry AS registry
    SET
        terminal_id = v_canonical_terminal_id::text,
        terminal_name = v_terminal_name,
        updated_at = NOW()
    WHERE registry.tenant_id = v_tenant_id
      AND (
          registry.terminal_id IN (v_canonical_terminal_id::text, v_ghost_terminal_id::text)
          OR UPPER(BTRIM(COALESCE(registry.terminal_name, ''))) = UPPER(v_terminal_name)
          OR registry.device_id = v_device_id
          OR registry.current_device_id = v_device_id
          OR registry.authorized_device_id = v_device_id
      );

    WITH ranked_registry AS (
        SELECT
            registry.id,
            ROW_NUMBER() OVER (
                ORDER BY
                    CASE
                        WHEN registry.device_id = v_device_id
                          OR registry.current_device_id = v_device_id
                          OR registry.authorized_device_id = v_device_id
                        THEN 0 ELSE 1
                    END,
                    COALESCE(registry.last_seen_at, registry.updated_at, registry.created_at) DESC NULLS LAST,
                    registry.id
            ) AS row_rank
        FROM landlord.tenant_server_registry AS registry
        WHERE registry.tenant_id = v_tenant_id
          AND registry.terminal_id = v_canonical_terminal_id::text
          AND UPPER(BTRIM(COALESCE(registry.terminal_name, ''))) = UPPER(v_terminal_name)
    ), canonical_registry AS (
        UPDATE landlord.tenant_server_registry AS registry
        SET
            device_id = v_device_id,
            current_device_id = v_device_id,
            authorized_device_id = v_device_id,
            previous_device_id = CASE
                WHEN registry.previous_device_id IS NULL AND NULLIF(registry.device_id, v_device_id) IS NOT NULL THEN registry.device_id
                ELSE registry.previous_device_id
            END,
            last_rejected_device_id = NULL,
            status = 'ONLINE',
            auth_status = 'TAKEOVER_COMPLETED',
            is_revoked = FALSE,
            revocation_reason = NULL,
            requires_pos_reauth = TRUE,
            last_takeover_at = NOW(),
            last_auth_attempt_at = NOW(),
            updated_at = NOW()
        FROM ranked_registry
        WHERE registry.id = ranked_registry.id
          AND ranked_registry.row_rank = 1
        RETURNING registry.id
    )
    UPDATE landlord.tenant_server_registry AS registry
    SET
        status = 'OFFLINE',
        auth_status = 'OLD_DEVICE_REVOKED',
        is_revoked = TRUE,
        revocation_reason = 'POS_ERP_CANONICAL_TERMINAL_ENFORCED',
        requires_pos_reauth = TRUE,
        updated_at = NOW()
    FROM ranked_registry
    WHERE registry.id = ranked_registry.id
      AND ranked_registry.row_rank > 1;

    INSERT INTO landlord.terminal_device_audit (
        tenant_id,
        terminal_id,
        terminal_name,
        old_device_id,
        new_device_id,
        action,
        performed_by,
        reason,
        result,
        metadata
    )
    VALUES (
        v_tenant_id,
        v_canonical_terminal_id::text,
        v_terminal_name,
        v_ghost_terminal_id::text,
        v_device_id,
        'DUPLICATE_PREVENTED',
        'migration:202606121620_pos_erp_bar001_canonical_device',
        'Canonicalize Bar-001 POS+ERP terminal, authorize current POS device, and archive ghost ERP terminal.',
        'SUCCESS',
        jsonb_build_object(
            'canonical_erp_terminal_id', v_canonical_terminal_id::text,
            'ghost_erp_terminal_id', v_ghost_terminal_id::text,
            'authorized_device_id', v_device_id,
            'terminal_name', v_terminal_name
        )
    );
END $$;

COMMIT;
