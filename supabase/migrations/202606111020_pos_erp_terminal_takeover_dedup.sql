BEGIN;

ALTER TABLE landlord.terminal_device_audit
    DROP CONSTRAINT IF EXISTS terminal_device_audit_action_check;

ALTER TABLE landlord.terminal_device_audit
    ADD CONSTRAINT terminal_device_audit_action_check CHECK (
        action IN (
            'TAKEOVER',
            'ROTATE_TOKEN',
            'REVOKE_DEVICE',
            'SYNC_AUTHORIZED_DEVICE',
            'GENERATE_PAIRING_CODE',
            'CLEAR_TERMINAL_DEVICES',
            'TAKEOVER_AUTHORIZED',
            'DEVICE_REVOKED',
            'DUPLICATE_PREVENTED'
        )
    );

WITH target AS (
    SELECT
        '03aa87fb-906a-46ca-a066-4c51bf080c4e'::uuid AS tenant_id,
        'dfc69374-becc-4644-bad7-2808ddef2248'::uuid AS keep_terminal_id,
        'DEV-E03WD8OI'::text AS previous_device_id,
        'DEV-CQQ1Z7YN'::text AS new_device_id,
        ARRAY[
            '1b0f53cc-f031-405e-a03f-e5de44b2a629'::uuid
        ] AS duplicate_terminal_ids
), archived AS (
    UPDATE public.terminals AS terminal
    SET
        is_active = FALSE
    FROM target
    WHERE terminal.tenant_id = target.tenant_id
      AND terminal.id = ANY(target.duplicate_terminal_ids)
    RETURNING terminal.id, terminal.tenant_id, terminal.code
), normalized_registry AS (
    UPDATE landlord.tenant_server_registry AS registry
    SET
        terminal_id = target.keep_terminal_id::text,
        terminal_name = COALESCE(NULLIF(BTRIM(registry.terminal_name), ''), 'Bar-001'),
        updated_at = NOW()
    FROM target
    WHERE registry.tenant_id = target.tenant_id
      AND (
          registry.terminal_id = ANY(ARRAY(SELECT duplicate_id::text FROM unnest(target.duplicate_terminal_ids) AS duplicate_id))
          OR UPPER(BTRIM(COALESCE(registry.terminal_name, ''))) = 'BAR-001'
      )
    RETURNING registry.id, registry.device_id, registry.previous_device_id, registry.authorized_device_id
)
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
SELECT
    target.tenant_id,
    target.keep_terminal_id::text,
    'Bar-001',
    NULL,
    NULL,
    'DUPLICATE_PREVENTED',
    'migration:202606111020_pos_erp_terminal_takeover_dedup',
    'Archive historical POS+ERP duplicate terminal and normalize registry to canonical ERP terminal.',
    'SUCCESS',
    jsonb_build_object(
        'archived_terminal_ids', COALESCE((SELECT jsonb_agg(id::text) FROM archived), '[]'::jsonb),
        'normalized_registry_ids', COALESCE((SELECT jsonb_agg(id::text) FROM normalized_registry), '[]'::jsonb),
        'canonical_erp_terminal_id', target.keep_terminal_id::text,
        'terminal_name', 'Bar-001'
    )
FROM target
WHERE EXISTS (SELECT 1 FROM archived)
   OR EXISTS (SELECT 1 FROM normalized_registry);

WITH target AS (
    SELECT
        '03aa87fb-906a-46ca-a066-4c51bf080c4e'::uuid AS tenant_id,
        'dfc69374-becc-4644-bad7-2808ddef2248'::uuid AS keep_terminal_id,
        'DEV-E03WD8OI'::text AS previous_device_id,
        'DEV-CQQ1Z7YN'::text AS new_device_id
), ranked_registry AS (
    SELECT
        registry.id,
        ROW_NUMBER() OVER (
            ORDER BY
                CASE
                    WHEN registry.device_id = target.new_device_id
                      OR registry.current_device_id = target.new_device_id
                      OR registry.authorized_device_id = target.new_device_id
                    THEN 0 ELSE 1
                END,
                COALESCE(registry.last_seen_at, registry.updated_at, registry.created_at) DESC NULLS LAST,
                registry.id
        ) AS row_rank
    FROM landlord.tenant_server_registry AS registry
    JOIN target ON target.tenant_id = registry.tenant_id
    WHERE registry.tenant_id = target.tenant_id
      AND registry.terminal_id = target.keep_terminal_id::text
      AND UPPER(BTRIM(COALESCE(registry.terminal_name, ''))) = 'BAR-001'
), canonical_registry AS (
    UPDATE landlord.tenant_server_registry AS registry
    SET
        device_id = target.new_device_id,
        current_device_id = target.new_device_id,
        authorized_device_id = target.new_device_id,
        previous_device_id = target.previous_device_id,
        last_rejected_device_id = NULL,
        status = 'ONLINE',
        auth_status = 'TAKEOVER_COMPLETED',
        is_revoked = FALSE,
        revocation_reason = NULL,
        requires_pos_reauth = TRUE,
        last_takeover_at = NOW(),
        last_auth_attempt_at = NOW(),
        updated_at = NOW()
    FROM target, ranked_registry
    WHERE registry.id = ranked_registry.id
      AND ranked_registry.row_rank = 1
    RETURNING registry.id
)
UPDATE landlord.tenant_server_registry AS registry
SET
    status = 'OFFLINE',
    auth_status = 'OLD_DEVICE_REVOKED',
    is_revoked = TRUE,
    revocation_reason = 'POS_ERP_DUPLICATE_REGISTRY_ARCHIVED',
    requires_pos_reauth = TRUE,
    previous_device_id = target.previous_device_id,
    updated_at = NOW()
FROM target, ranked_registry
WHERE registry.id = ranked_registry.id
  AND ranked_registry.row_rank > 1;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM public.terminals AS terminal
        WHERE COALESCE(terminal.is_active, TRUE) = TRUE
          AND NULLIF(BTRIM(terminal.code), '') IS NOT NULL
        GROUP BY terminal.tenant_id, UPPER(BTRIM(terminal.code))
        HAVING COUNT(*) > 1
    ) THEN
        CREATE UNIQUE INDEX IF NOT EXISTS terminals_active_tenant_code_uidx
            ON public.terminals (tenant_id, UPPER(BTRIM(code)))
            WHERE COALESCE(is_active, TRUE) = TRUE
              AND NULLIF(BTRIM(code), '') IS NOT NULL;
    END IF;
END $$;

COMMIT;
