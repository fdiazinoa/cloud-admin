begin;

alter table landlord.terminal_device_audit
  drop constraint if exists terminal_device_audit_action_check;

alter table landlord.terminal_device_audit
  add constraint terminal_device_audit_action_check check (
    action in (
      'TAKEOVER', 'ROTATE_TOKEN', 'REVOKE_DEVICE', 'SYNC_AUTHORIZED_DEVICE',
      'GENERATE_PAIRING_CODE', 'CLEAR_TERMINAL_DEVICES', 'TAKEOVER_AUTHORIZED',
      'DEVICE_REVOKED', 'DUPLICATE_PREVENTED', 'CLOUD_ADMIN_REPAIR_REQUESTED',
      'CLOUD_ADMIN_ERP_REPAIR_CONFIRMED', 'CLOUD_ADMIN_ERP_REPAIR_FAILED',
      'CLOUD_ADMIN_DEVICE_MISMATCH_DETECTED', 'CLOUD_ADMIN_CREDENTIALS_ROTATED',
      'TERMINAL_RECONCILIATION', 'TERMINAL_RECONCILIATION_ROLLBACK',
      'DEVICE_REQUEST_REJECTED'
    )
  );

update landlord.cloud_admin_profiles
set permissions = coalesce(permissions, '{}'::jsonb) || jsonb_build_object(
  'terminal_reauthorization', code in ('owner', 'admin')
),
updated_at = now();

commit;
