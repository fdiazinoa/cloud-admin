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
      'TERMINAL_RECONCILIATION', 'TERMINAL_RECONCILIATION_ROLLBACK'
    )
  );

update landlord.cloud_admin_profiles
set permissions = permissions || jsonb_build_object(
  'terminal_reconciliation', code in ('owner', 'admin', 'supervisor')
),
updated_at = timezone('utc'::text, now());

create unique index if not exists terminal_device_audit_reconciliation_correlation_uidx
  on landlord.terminal_device_audit ((metadata ->> 'correlation_id'))
  where action = 'TERMINAL_RECONCILIATION' and result = 'SUCCESS';

create or replace function landlord.reconcile_terminal_identity(
  p_tenant_id uuid,
  p_source_registry_id uuid,
  p_target_erp_terminal_id uuid,
  p_target_store_id uuid,
  p_authorized_device_id text,
  p_reason text,
  p_actor_admin_user_id uuid,
  p_actor_auth_user_id uuid,
  p_actor_email text,
  p_correlation_id uuid,
  p_expected_plan_hash text default null,
  p_dry_run boolean default true
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_source landlord.tenant_server_registry%rowtype;
  v_target public.erp_terminals%rowtype;
  v_store_tenant_id uuid;
  v_terminal_code text;
  v_device_id text := upper(nullif(btrim(p_authorized_device_id), ''));
  v_reason text := nullif(btrim(p_reason), '');
  v_registry_before jsonb;
  v_registry_after jsonb;
  v_catalog_before jsonb;
  v_catalog_after jsonb;
  v_affected_ids uuid[];
  v_orphan_ids uuid[];
  v_historical_devices text[];
  v_plan jsonb;
  v_plan_hash text;
  v_before_state jsonb;
  v_after_state jsonb;
  v_existing_audit landlord.terminal_device_audit%rowtype;
  v_now timestamptz := timezone('utc'::text, now());
begin
  if p_tenant_id is null or p_source_registry_id is null
     or p_target_erp_terminal_id is null or p_target_store_id is null then
    raise exception using errcode = '22023', message = 'TENANT_SOURCE_TARGET_STORE_REQUIRED';
  end if;
  if v_device_id is null then
    raise exception using errcode = '22023', message = 'DEVICE_ID_REQUIRED';
  end if;
  if v_reason is null then
    raise exception using errcode = '22023', message = 'RECONCILIATION_REASON_REQUIRED';
  end if;
  if p_actor_admin_user_id is null or p_actor_auth_user_id is null or nullif(btrim(p_actor_email), '') is null then
    raise exception using errcode = '42501', message = 'AUTHORIZED_ADMIN_REQUIRED';
  end if;
  if p_correlation_id is null then
    raise exception using errcode = '22023', message = 'CORRELATION_ID_REQUIRED';
  end if;

  select audit.* into v_existing_audit
  from landlord.terminal_device_audit as audit
  where audit.tenant_id = p_tenant_id
    and audit.action = 'TERMINAL_RECONCILIATION'
    and audit.result = 'SUCCESS'
    and audit.metadata ->> 'correlation_id' = p_correlation_id::text
  limit 1;
  if v_existing_audit.id is not null then
    return jsonb_build_object(
      'status', 'success', 'idempotent_replay', true,
      'correlation_id', p_correlation_id,
      'plan_hash', v_existing_audit.metadata ->> 'plan_hash',
      'plan', v_existing_audit.metadata -> 'plan'
    );
  end if;

  select registry.* into v_source
  from landlord.tenant_server_registry as registry
  where registry.id = p_source_registry_id
    and registry.tenant_id = p_tenant_id
  for update;
  if v_source.id is null then
    raise exception using errcode = 'P0002', message = 'SOURCE_REGISTRY_NOT_FOUND_FOR_TENANT';
  end if;

  select terminal.* into v_target
  from public.erp_terminals as terminal
  where terminal.id = p_target_erp_terminal_id
    and terminal.store_id = p_target_store_id
  for update;
  if v_target.id is null then
    raise exception using errcode = 'P0002', message = 'ERP_TERMINAL_OR_STORE_INVALID';
  end if;

  select store.tenant_id into v_store_tenant_id
  from public.erp_stores as store
  where store.id = p_target_store_id;
  if v_store_tenant_id is null then
    raise exception using errcode = 'P0002', message = 'ERP_TERMINAL_OR_STORE_INVALID';
  end if;

  if not exists (
    select 1
    from public.erp_tenants as erp_tenant
    where erp_tenant.id = v_store_tenant_id
      and (
        erp_tenant.id::text = p_tenant_id::text
        or erp_tenant.config ->> 'cloudAdminTenantId' = p_tenant_id::text
        or erp_tenant.config ->> 'cloud_admin_tenant_id' = p_tenant_id::text
        or erp_tenant.config ->> 'cloudTenantId' = p_tenant_id::text
        or erp_tenant.config ->> 'cloud_tenant_id' = p_tenant_id::text
      )
  ) then
    raise exception using errcode = '42501', message = 'ERP_TERMINAL_TENANT_MISMATCH';
  end if;

  if coalesce(v_source.erp_readiness ->> 'terminalId', v_source.erp_readiness ->> 'terminal_id') is not null
     and coalesce(v_source.erp_readiness ->> 'terminalId', v_source.erp_readiness ->> 'terminal_id') <> p_target_erp_terminal_id::text then
    raise exception using errcode = '23514', message = 'SOURCE_ALREADY_BOUND_TO_ANOTHER_ERP_TERMINAL';
  end if;

  perform 1
  from landlord.tenant_server_registry as registry
  where registry.tenant_id = p_tenant_id
    and (
      registry.id = p_source_registry_id
      or upper(btrim(registry.terminal_id)) = upper(btrim(v_source.terminal_id))
      or (
        nullif(btrim(v_source.terminal_name), '') is not null
        and upper(btrim(registry.terminal_name)) = upper(btrim(v_source.terminal_name))
      )
    )
    and coalesce(
      registry.erp_readiness ->> 'terminalId',
      registry.erp_readiness ->> 'terminal_id',
      p_target_erp_terminal_id::text
    ) = p_target_erp_terminal_id::text
  for update;

  select
    jsonb_agg(jsonb_build_object(
      'id', registry.id,
      'terminal_id', registry.terminal_id,
      'terminal_name', registry.terminal_name,
      'device_id', registry.device_id,
      'current_device_id', registry.current_device_id,
      'authorized_device_id', registry.authorized_device_id,
      'previous_device_id', registry.previous_device_id,
      'auth_status', registry.auth_status,
      'is_revoked', registry.is_revoked,
      'revocation_reason', registry.revocation_reason,
      'requires_pos_reauth', registry.requires_pos_reauth,
      'erp_readiness', registry.erp_readiness,
      'status', registry.status
    ) order by registry.id),
    array_agg(registry.id order by registry.id),
    array_agg(registry.id order by registry.id) filter (
      where coalesce(registry.erp_readiness ->> 'terminalId', registry.erp_readiness ->> 'terminal_id') is null
    )
  into v_registry_before, v_affected_ids, v_orphan_ids
  from landlord.tenant_server_registry as registry
  where registry.tenant_id = p_tenant_id
    and (
      registry.id = p_source_registry_id
      or upper(btrim(registry.terminal_id)) = upper(btrim(v_source.terminal_id))
      or (
        nullif(btrim(v_source.terminal_name), '') is not null
        and upper(btrim(registry.terminal_name)) = upper(btrim(v_source.terminal_name))
      )
    )
    and coalesce(
      registry.erp_readiness ->> 'terminalId',
      registry.erp_readiness ->> 'terminal_id',
      p_target_erp_terminal_id::text
    ) = p_target_erp_terminal_id::text;

  if v_affected_ids is null or not exists (
    select 1
    from landlord.tenant_server_registry as registry
    where registry.id = any(v_affected_ids)
      and upper(coalesce(nullif(btrim(registry.current_device_id), ''), btrim(registry.device_id))) = v_device_id
  ) then
    raise exception using errcode = '23514', message = 'AUTHORIZED_DEVICE_NOT_IN_RECONCILIATION_SCOPE';
  end if;

  v_terminal_code := coalesce(
    nullif(btrim(v_target.config -> 'metadata' ->> 'terminal_code'), ''),
    nullif(btrim(v_target.config -> 'metadata' ->> 'terminalCode'), ''),
    nullif(btrim(v_target.name), ''),
    p_target_erp_terminal_id::text
  );

  select coalesce(array_agg(device_id order by device_id), array[]::text[])
  into v_historical_devices
  from (
    select distinct upper(device_id) as device_id
    from (
      select nullif(btrim(v_target.device_id), '') as device_id
      union all
      select nullif(btrim(registry.device_id), '')
      from landlord.tenant_server_registry as registry where registry.id = any(v_affected_ids)
      union all
      select nullif(btrim(registry.current_device_id), '')
      from landlord.tenant_server_registry as registry where registry.id = any(v_affected_ids)
      union all
      select nullif(btrim(registry.authorized_device_id), '')
      from landlord.tenant_server_registry as registry where registry.id = any(v_affected_ids)
    ) as devices
    where device_id is not null and upper(device_id) <> v_device_id
  ) as historical;

  select to_jsonb(catalog) into v_catalog_before
  from public.terminals as catalog
  where catalog.id = p_target_erp_terminal_id
    and catalog.tenant_id = p_tenant_id
  for update;

  v_before_state := jsonb_build_object(
    'erp_terminal', jsonb_build_object('id', v_target.id, 'device_id', v_target.device_id, 'config', v_target.config),
    'catalog_terminal', v_catalog_before,
    'registries', coalesce(v_registry_before, '[]'::jsonb)
  );
  v_plan := jsonb_build_object(
    'tenant_id', p_tenant_id,
    'source_registry_id', p_source_registry_id,
    'target_erp_terminal_id', p_target_erp_terminal_id,
    'target_store_id', p_target_store_id,
    'terminal_code', v_terminal_code,
    'authorized_device_id', v_device_id,
    'previous_authorized_device_id', nullif(btrim(v_target.device_id), ''),
    'historical_device_ids', to_jsonb(v_historical_devices),
    'affected_registry_ids', to_jsonb(v_affected_ids),
    'orphan_registry_ids', to_jsonb(coalesce(v_orphan_ids, array[]::uuid[])),
    'writes', jsonb_build_array(
      'Actualizar device autorizado y metadata de public.erp_terminals.',
      'Crear vínculo explícito de registros huérfanos a la terminal ERP canónica.',
      'Marcar devices anteriores como históricos/superseded sin borrar registros.',
      'Registrar before/after y correlación en landlord.terminal_device_audit.'
    ),
    'rollback', jsonb_build_array(
      'Restaurar exclusivamente el vínculo explícito de cada registry.',
      'Restaurar estados de autorización y clasificación histórica.',
      'Restaurar device/config de la terminal ERP y metadata del catálogo.'
    ),
    'destructive_operations', '[]'::jsonb,
    'preserves', jsonb_build_array('ventas', 'documentos_fiscales', 'secuencias', 'auditorias', 'devices_historicos')
  );
  v_plan_hash := md5(v_plan::text);

  if p_dry_run then
    return jsonb_build_object(
      'status', 'dry_run', 'dry_run', true, 'writes_performed', false,
      'executable', true, 'plan_hash', v_plan_hash, 'correlation_id', p_correlation_id,
      'plan', v_plan
    );
  end if;

  if nullif(btrim(p_expected_plan_hash), '') is null or p_expected_plan_hash <> v_plan_hash then
    raise exception using errcode = '40001', message = 'RECONCILIATION_PLAN_CHANGED';
  end if;

  if upper(coalesce(v_target.device_id, '')) = v_device_id
     and coalesce(array_length(v_orphan_ids, 1), 0) = 0 then
    return jsonb_build_object(
      'status', 'success', 'idempotent_replay', true,
      'correlation_id', p_correlation_id, 'plan_hash', v_plan_hash,
      'plan', v_plan, 'rollback_available', false
    );
  end if;

  update public.erp_terminals as terminal
  set device_id = v_device_id,
      config = jsonb_set(
        jsonb_set(
          coalesce(terminal.config, '{}'::jsonb),
          '{metadata}',
          coalesce(terminal.config -> 'metadata', '{}'::jsonb) || jsonb_build_object(
            'authorizedDeviceId', v_device_id,
            'authorized_device_id', v_device_id,
            'currentDeviceId', v_device_id,
            'current_device_id', v_device_id,
            'canonicalDeviceId', v_device_id,
            'canonical_device_id', v_device_id,
            'canonical_erp_terminal_id', p_target_erp_terminal_id,
            'historical_device_ids', to_jsonb(v_historical_devices),
            'superseded_device_ids', to_jsonb(v_historical_devices),
            'binding_status', 'BOUND',
            'reconciliation_correlation_id', p_correlation_id,
            'reconciled_at', v_now
          ), true
        ),
        '{pairing,status}', '"NOT_REQUIRED"'::jsonb, true
      )
  where terminal.id = p_target_erp_terminal_id;

  update public.terminals as catalog
  set code = v_terminal_code,
      store_id = p_target_store_id,
      is_active = true,
      config = jsonb_set(
        coalesce(catalog.config, '{}'::jsonb),
        '{metadata}',
        coalesce(catalog.config -> 'metadata', '{}'::jsonb) || jsonb_build_object(
          'erp_terminal_id', p_target_erp_terminal_id,
          'canonical_erp_terminal_id', p_target_erp_terminal_id,
          'identity_binding_source', 'explicit_mapping',
          'reconciliation_correlation_id', p_correlation_id
        ), true
      )
  where catalog.id = p_target_erp_terminal_id
    and catalog.tenant_id = p_tenant_id;

  update landlord.tenant_server_registry as registry
  set terminal_id = p_target_erp_terminal_id::text,
      terminal_name = v_terminal_code,
      authorized_device_id = v_device_id,
      previous_device_id = case
        when upper(coalesce(nullif(btrim(registry.current_device_id), ''), btrim(registry.device_id))) <> v_device_id
          then coalesce(nullif(btrim(registry.current_device_id), ''), nullif(btrim(registry.device_id), ''), registry.previous_device_id)
        else coalesce(nullif(btrim(v_target.device_id), ''), registry.previous_device_id)
      end,
      auth_status = case
        when upper(coalesce(nullif(btrim(registry.current_device_id), ''), btrim(registry.device_id))) = v_device_id then 'AUTHORIZED'
        else 'OLD_DEVICE_REVOKED'
      end,
      is_revoked = upper(coalesce(nullif(btrim(registry.current_device_id), ''), btrim(registry.device_id))) <> v_device_id,
      revocation_reason = case
        when upper(coalesce(nullif(btrim(registry.current_device_id), ''), btrim(registry.device_id))) = v_device_id then null
        else 'TERMINAL_RECONCILIATION_SUPERSEDED'
      end,
      requires_pos_reauth = upper(coalesce(nullif(btrim(registry.current_device_id), ''), btrim(registry.device_id))) <> v_device_id,
      erp_readiness = coalesce(registry.erp_readiness, '{}'::jsonb) || jsonb_build_object(
        'terminalId', p_target_erp_terminal_id,
        'terminal_id', p_target_erp_terminal_id,
        'storeId', p_target_store_id,
        'store_id', p_target_store_id,
        'identityBindingSource', 'explicit_mapping',
        'reconciliationCorrelationId', p_correlation_id
      ),
      last_auth_error = null,
      last_auth_attempt_at = v_now,
      updated_at = v_now
  where registry.id = any(v_affected_ids);

  select jsonb_agg(to_jsonb(registry) order by registry.id) into v_registry_after
  from landlord.tenant_server_registry as registry where registry.id = any(v_affected_ids);
  select to_jsonb(catalog) into v_catalog_after
  from public.terminals as catalog where catalog.id = p_target_erp_terminal_id and catalog.tenant_id = p_tenant_id;
  v_after_state := jsonb_build_object(
    'erp_terminal', (select to_jsonb(terminal) from public.erp_terminals as terminal where terminal.id = p_target_erp_terminal_id),
    'catalog_terminal', v_catalog_after,
    'registries', coalesce(v_registry_after, '[]'::jsonb)
  );

  insert into landlord.terminal_device_audit (
    tenant_id, terminal_id, terminal_name, old_device_id, new_device_id,
    action, performed_by, reason, result, metadata
  ) values (
    p_tenant_id, p_target_erp_terminal_id::text, v_terminal_code,
    nullif(btrim(v_target.device_id), ''), v_device_id,
    'TERMINAL_RECONCILIATION', p_actor_email, v_reason, 'SUCCESS',
    jsonb_build_object(
      'correlation_id', p_correlation_id,
      'administrator', jsonb_build_object(
        'admin_user_id', p_actor_admin_user_id,
        'auth_user_id', p_actor_auth_user_id,
        'email', p_actor_email
      ),
      'source_registry_id', p_source_registry_id,
      'target_erp_terminal_id', p_target_erp_terminal_id,
      'tenant_id', p_tenant_id,
      'performed_at', v_now,
      'plan_hash', v_plan_hash,
      'plan', v_plan,
      'before_state', v_before_state,
      'after_state', v_after_state,
      'rollback_status', 'AVAILABLE'
    )
  );

  return jsonb_build_object(
    'status', 'success', 'dry_run', false, 'writes_performed', true,
    'idempotent_replay', false, 'correlation_id', p_correlation_id,
    'plan_hash', v_plan_hash, 'plan', v_plan, 'before_state', v_before_state,
    'after_state', v_after_state, 'rollback_available', true
  );
end;
$$;

create or replace function landlord.rollback_terminal_identity_reconciliation(
  p_tenant_id uuid,
  p_correlation_id uuid,
  p_reason text,
  p_actor_admin_user_id uuid,
  p_actor_auth_user_id uuid,
  p_actor_email text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_audit landlord.terminal_device_audit%rowtype;
  v_registry jsonb;
  v_before jsonb;
  v_now timestamptz := timezone('utc'::text, now());
begin
  if nullif(btrim(p_reason), '') is null then
    raise exception using errcode = '22023', message = 'ROLLBACK_REASON_REQUIRED';
  end if;
  if p_actor_admin_user_id is null or p_actor_auth_user_id is null or nullif(btrim(p_actor_email), '') is null then
    raise exception using errcode = '42501', message = 'AUTHORIZED_ADMIN_REQUIRED';
  end if;

  select audit.* into v_audit
  from landlord.terminal_device_audit as audit
  where audit.tenant_id = p_tenant_id
    and audit.action = 'TERMINAL_RECONCILIATION'
    and audit.result = 'SUCCESS'
    and audit.metadata ->> 'correlation_id' = p_correlation_id::text
  for update;
  if v_audit.id is null then
    raise exception using errcode = 'P0002', message = 'RECONCILIATION_AUDIT_NOT_FOUND';
  end if;
  if coalesce(v_audit.metadata ->> 'rollback_status', 'AVAILABLE') = 'COMPLETED' then
    return jsonb_build_object('status', 'success', 'idempotent_replay', true, 'correlation_id', p_correlation_id);
  end if;

  v_before := v_audit.metadata -> 'before_state';
  update public.erp_terminals as terminal
  set device_id = v_before -> 'erp_terminal' ->> 'device_id',
      config = v_before -> 'erp_terminal' -> 'config'
  where terminal.id = (v_before -> 'erp_terminal' ->> 'id')::uuid;

  if jsonb_typeof(v_before -> 'catalog_terminal') = 'object' then
    update public.terminals as catalog
    set code = v_before -> 'catalog_terminal' ->> 'code',
        store_id = nullif(v_before -> 'catalog_terminal' ->> 'store_id', '')::uuid,
        config = v_before -> 'catalog_terminal' -> 'config'
    where catalog.id = (v_before -> 'catalog_terminal' ->> 'id')::uuid
      and catalog.tenant_id = p_tenant_id;
  end if;

  for v_registry in select value from jsonb_array_elements(v_before -> 'registries')
  loop
    update landlord.tenant_server_registry as registry
    set terminal_id = v_registry ->> 'terminal_id',
        terminal_name = v_registry ->> 'terminal_name',
        authorized_device_id = v_registry ->> 'authorized_device_id',
        previous_device_id = v_registry ->> 'previous_device_id',
        auth_status = v_registry ->> 'auth_status',
        is_revoked = coalesce((v_registry ->> 'is_revoked')::boolean, false),
        revocation_reason = v_registry ->> 'revocation_reason',
        requires_pos_reauth = coalesce((v_registry ->> 'requires_pos_reauth')::boolean, false),
        erp_readiness = v_registry -> 'erp_readiness',
        status = v_registry ->> 'status',
        updated_at = v_now
    where registry.id = (v_registry ->> 'id')::uuid
      and registry.tenant_id = p_tenant_id;
  end loop;

  update landlord.terminal_device_audit
  set metadata = metadata || jsonb_build_object(
    'rollback_status', 'COMPLETED',
    'rolled_back_at', v_now,
    'rolled_back_by', p_actor_email
  )
  where id = v_audit.id;

  insert into landlord.terminal_device_audit (
    tenant_id, terminal_id, terminal_name, old_device_id, new_device_id,
    action, performed_by, reason, result, metadata
  ) values (
    p_tenant_id, v_audit.terminal_id, v_audit.terminal_name,
    v_audit.new_device_id, v_audit.old_device_id,
    'TERMINAL_RECONCILIATION_ROLLBACK', p_actor_email, btrim(p_reason), 'SUCCESS',
    jsonb_build_object(
      'correlation_id', p_correlation_id,
      'reconciliation_audit_id', v_audit.id,
      'administrator', jsonb_build_object(
        'admin_user_id', p_actor_admin_user_id,
        'auth_user_id', p_actor_auth_user_id,
        'email', p_actor_email
      ),
      'restored_scope', jsonb_build_array(
        'explicit_binding', 'authorization_statuses', 'historical_device_classification'
      )
    )
  );

  return jsonb_build_object('status', 'success', 'idempotent_replay', false, 'correlation_id', p_correlation_id);
end;
$$;

revoke all on function landlord.reconcile_terminal_identity(uuid, uuid, uuid, uuid, text, text, uuid, uuid, text, uuid, text, boolean) from public, anon, authenticated;
revoke all on function landlord.rollback_terminal_identity_reconciliation(uuid, uuid, text, uuid, uuid, text) from public, anon, authenticated;
grant execute on function landlord.reconcile_terminal_identity(uuid, uuid, uuid, uuid, text, text, uuid, uuid, text, uuid, text, boolean) to service_role;
grant execute on function landlord.rollback_terminal_identity_reconciliation(uuid, uuid, text, uuid, uuid, text) to service_role;

commit;
