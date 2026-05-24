BEGIN;

ALTER TABLE landlord.tenant_server_registry
    ADD COLUMN IF NOT EXISTS last_rebuild_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS requires_full_bootstrap BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE landlord.terminal_takeover_audit
    DROP CONSTRAINT IF EXISTS terminal_takeover_audit_event_check;

ALTER TABLE landlord.terminal_takeover_audit
    ADD CONSTRAINT terminal_takeover_audit_event_check CHECK (
        event IN (
            'TERMINAL_TAKEOVER_REQUESTED',
            'TERMINAL_TAKEOVER_COMPLETED',
            'TERMINAL_REBUILD_REQUESTED',
            'TERMINAL_REBUILD_COMPLETED'
        )
    );

COMMIT;
