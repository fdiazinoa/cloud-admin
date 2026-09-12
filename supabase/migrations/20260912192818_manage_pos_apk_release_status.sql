begin;

set local lock_timeout = '5s';
set local statement_timeout = '2min';

alter table landlord.pos_apk_releases
  add column if not exists status_changed_at timestamp with time zone,
  add column if not exists status_changed_by uuid,
  add column if not exists status_change_notes text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'pos_apk_releases_status_changed_by_fkey'
      and conrelid = 'landlord.pos_apk_releases'::regclass
  ) then
    alter table landlord.pos_apk_releases
      add constraint pos_apk_releases_status_changed_by_fkey
      foreign key (status_changed_by)
      references landlord.cloud_admin_users(id)
      on delete set null;
  end if;
end
$$;

create index if not exists pos_apk_releases_status_changed_by_idx
  on landlord.pos_apk_releases (status_changed_by);

update landlord.pos_apk_releases
set is_latest = false
where is_latest;

update landlord.pos_apk_releases
set is_latest = true
where id = (
  select id
  from landlord.pos_apk_releases
  where release_status = 'available'
  order by version_code desc, published_at desc
  limit 1
);

alter table landlord.pos_apk_releases
  drop constraint if exists pos_apk_releases_latest_available_check;
alter table landlord.pos_apk_releases
  add constraint pos_apk_releases_latest_available_check
  check (not is_latest or release_status = 'available');

create or replace function landlord.set_pos_apk_release_status(
  p_release_id uuid,
  p_status text,
  p_actor_id uuid,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current_id uuid;
begin
  if p_status not in ('draft', 'internal_testing', 'beta', 'available', 'retired') then
    raise exception 'Invalid APK release status';
  end if;

  lock table landlord.pos_apk_releases in share row exclusive mode;

  if not exists (
    select 1
    from landlord.pos_apk_releases
    where id = p_release_id
  ) then
    raise exception 'APK release not found';
  end if;

  update landlord.pos_apk_releases
  set
    release_status = p_status,
    is_latest = false,
    status_changed_at = timezone('utc'::text, now()),
    status_changed_by = p_actor_id,
    status_change_notes = nullif(left(trim(coalesce(p_notes, '')), 2000), ''),
    updated_at = timezone('utc'::text, now())
  where id = p_release_id;

  select id into v_current_id
  from landlord.pos_apk_releases
  where release_status = 'available'
  order by version_code desc, published_at desc
  limit 1;

  update landlord.pos_apk_releases
  set is_latest = false
  where is_latest;

  if v_current_id is not null then
    update landlord.pos_apk_releases
    set is_latest = true
    where id = v_current_id;
  end if;

  return p_release_id;
end;
$$;

revoke all on function landlord.set_pos_apk_release_status(uuid, text, uuid, text) from public;
revoke all on function landlord.set_pos_apk_release_status(uuid, text, uuid, text) from anon;
revoke all on function landlord.set_pos_apk_release_status(uuid, text, uuid, text) from authenticated;
grant execute on function landlord.set_pos_apk_release_status(uuid, text, uuid, text) to service_role;

update landlord.support_knowledge_base
set
  title = 'Registrar probar y publicar un APK',
  content = 'Los APK nuevos se registran en Prueba interna. Borrador, Prueba interna y Beta solo se descargan mediante su enlace tecnico directo. Unicamente Disponible participa en /api/pos-apk/latest y en la comparacion de versiones de terminales; entre los disponibles se selecciona el mayor version_code. Cambiar a Disponible solo despues de aprobar QA y verificar el enlace estable.',
  tags = array['cloud-admin', 'apk', 'prueba interna', 'beta', 'disponible', 'version_code', 'qa'],
  source_path = 'Cloud-Admin/docs/helpdesk/clic-suite-copilot-manual.md',
  updated_at = timezone('utc'::text, now())
where module = 'Cloud Admin APK'
  and title = 'Nueva version registrada no aparece como APK actual';

commit;
