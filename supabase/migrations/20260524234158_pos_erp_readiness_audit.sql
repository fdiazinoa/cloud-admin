BEGIN;

ALTER TABLE landlord.tenant_server_registry
    ADD COLUMN IF NOT EXISTS erp_readiness JSONB NOT NULL DEFAULT '{}'::JSONB,
    ADD COLUMN IF NOT EXISTS last_erp_readiness_at TIMESTAMPTZ;

ALTER TABLE landlord.terminal_takeover_audit
    DROP CONSTRAINT IF EXISTS terminal_takeover_audit_event_check;

ALTER TABLE landlord.terminal_takeover_audit
    ADD CONSTRAINT terminal_takeover_audit_event_check CHECK (
        event IN (
            'TERMINAL_TAKEOVER_REQUESTED',
            'TERMINAL_TAKEOVER_COMPLETED',
            'TERMINAL_REBUILD_REQUESTED',
            'TERMINAL_REBUILD_COMPLETED',
            'POS_REGISTERED',
            'ERP_CONTEXT_PROVISION_REQUESTED',
            'ERP_CONTEXT_READY',
            'ERP_CONTEXT_MISSING',
            'CATALOG_MISSING'
        )
    );

COMMIT;
