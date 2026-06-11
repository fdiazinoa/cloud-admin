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
        ARRAY[
            '1b0f53cc-f031-405e-a03f-e5de44b2a629'::uuid
        ] AS duplicate_terminal_ids
), archived AS (
    UPDATE public.terminals AS terminal
    SET
        is_active = FALSE,
        config = COALESCE(terminal.config, '{}'::jsonb)
            || jsonb_build_object(
                'is_active', FALSE,
                'archived', TRUE,
                'archived_reason', 'POS_ERP_DUPLICATE_TERMINAL_PREVENTED',
                'canonical_erp_terminal_id', target.keep_terminal_id::text,
                'archived_at', NOW()
            ),
        updated_at = NOW()
    FROM target
    WHERE terminal.tenant_id = target.tenant_id
      AND terminal.id = ANY(target.duplicate_terminal_ids)
    RETURNING terminal.id, terminal.tenant_id, terminal.code, terminal.name
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

CREATE UNIQUE INDEX IF NOT EXISTS terminals_active_tenant_config_erp_terminal_uidx
    ON public.terminals (tenant_id, (config ->> 'erp_terminal_id'))
    WHERE COALESCE(is_active, TRUE) = TRUE
      AND NULLIF(BTRIM(config ->> 'erp_terminal_id'), '') IS NOT NULL;

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
