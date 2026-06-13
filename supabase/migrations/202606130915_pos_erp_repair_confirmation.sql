BEGIN;

ALTER TABLE landlord.tenant_server_registry
    DROP CONSTRAINT IF EXISTS tenant_server_registry_auth_status_check;

ALTER TABLE landlord.tenant_server_registry
    ADD CONSTRAINT tenant_server_registry_auth_status_check CHECK (
        auth_status IN (
            'AUTHORIZED',
            'DEVICE_MISMATCH',
            'TAKEOVER_PENDING',
            'TAKEOVER_COMPLETED',
            'REAUTH_COMPLETED',
            'OLD_DEVICE_REVOKED',
            'TOKEN_ROTATION_REQUIRED',
            'ERP_AUTH_ERROR',
            'ERP_REPAIR_PENDING',
            'ERP_REPAIR_FAILED',
            'WAITING_ERP_CONFIRMATION',
            'BOUND_AUTH_MISMATCH',
            'LICENSE_EXCEEDED'
        )
    );

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
            'DUPLICATE_PREVENTED',
            'CLOUD_ADMIN_REPAIR_REQUESTED',
            'CLOUD_ADMIN_ERP_REPAIR_CONFIRMED',
            'CLOUD_ADMIN_ERP_REPAIR_FAILED',
            'CLOUD_ADMIN_DEVICE_MISMATCH_DETECTED',
            'CLOUD_ADMIN_CREDENTIALS_ROTATED'
        )
    );

COMMIT;
