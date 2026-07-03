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
            'GENERATE_PAIRING_CODE'
        )
    );

COMMIT;
