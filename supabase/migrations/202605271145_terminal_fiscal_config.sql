BEGIN;

ALTER TABLE landlord.tenant_server_registry
    ADD COLUMN IF NOT EXISTS fiscal_readiness JSONB,
    ADD COLUMN IF NOT EXISTS last_fiscal_readiness_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_tenant_server_registry_fiscal_readiness
    ON landlord.tenant_server_registry(tenant_id, terminal_id, last_fiscal_readiness_at DESC);

CREATE TABLE IF NOT EXISTS landlord.terminal_fiscal_config_audit (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES landlord.tenants(id) ON DELETE CASCADE,
    terminal_id TEXT NOT NULL,
    terminal_name TEXT,
    action TEXT NOT NULL,
    performed_by TEXT,
    performed_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    mode TEXT NOT NULL,
    result TEXT,
    erp_response_status INTEGER,
    erp_error_code TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
    CONSTRAINT terminal_fiscal_config_audit_action_check CHECK (
        action IN ('FISCAL_CONFIG_CREATED', 'FISCAL_CONFIG_UPDATED')
    ),
    CONSTRAINT terminal_fiscal_config_audit_mode_check CHECK (
        mode IN ('QA_DEMO', 'PRODUCTION')
    )
);

CREATE INDEX IF NOT EXISTS idx_terminal_fiscal_config_audit_tenant_performed
    ON landlord.terminal_fiscal_config_audit(tenant_id, performed_at DESC);

CREATE INDEX IF NOT EXISTS idx_terminal_fiscal_config_audit_terminal
    ON landlord.terminal_fiscal_config_audit(tenant_id, terminal_id, performed_at DESC);

ALTER TABLE landlord.terminal_fiscal_config_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Deny all to public on terminal_fiscal_config_audit" ON landlord.terminal_fiscal_config_audit;
CREATE POLICY "Deny all to public on terminal_fiscal_config_audit"
ON landlord.terminal_fiscal_config_audit
FOR ALL
TO PUBLIC
USING (false)
WITH CHECK (false);

COMMIT;
