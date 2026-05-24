BEGIN;

ALTER TABLE landlord.tenant_server_registry
    ADD COLUMN IF NOT EXISTS last_takeover_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS previous_device_id TEXT,
    ADD COLUMN IF NOT EXISTS current_device_id TEXT,
    ADD COLUMN IF NOT EXISTS revocation_reason TEXT,
    ADD COLUMN IF NOT EXISTS requires_pos_reauth BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS landlord.terminal_takeover_audit (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event TEXT NOT NULL,
    tenant_id UUID NOT NULL REFERENCES landlord.tenants(id) ON DELETE CASCADE,
    terminal_id TEXT NOT NULL,
    previous_device_id TEXT,
    new_device_id TEXT,
    actor_user_id TEXT,
    actor_email TEXT,
    reason TEXT,
    erp_response_status INTEGER,
    erp_error_code TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    CONSTRAINT terminal_takeover_audit_event_check CHECK (
        event IN ('TERMINAL_TAKEOVER_REQUESTED', 'TERMINAL_TAKEOVER_COMPLETED')
    )
);

CREATE INDEX IF NOT EXISTS idx_terminal_takeover_audit_tenant_created
    ON landlord.terminal_takeover_audit(tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_terminal_takeover_audit_terminal
    ON landlord.terminal_takeover_audit(tenant_id, terminal_id, created_at DESC);

ALTER TABLE landlord.terminal_takeover_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Deny all to public on terminal_takeover_audit" ON landlord.terminal_takeover_audit;
CREATE POLICY "Deny all to public on terminal_takeover_audit"
ON landlord.terminal_takeover_audit
FOR ALL
TO PUBLIC
USING (false)
WITH CHECK (false);

COMMIT;
