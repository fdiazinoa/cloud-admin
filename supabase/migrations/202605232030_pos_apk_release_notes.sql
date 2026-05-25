-- Structured release notes for POS APK publication and support traceability.

alter table landlord.pos_apk_releases
  add column if not exists release_type text,
  add column if not exists release_status text not null default 'available',
  add column if not exists summary text,
  add column if not exists bugs_fixed jsonb not null default '[]'::jsonb,
  add column if not exists new_features jsonb not null default '[]'::jsonb,
  add column if not exists internal_changes jsonb not null default '[]'::jsonb,
  add column if not exists validation_checklist jsonb not null default '[]'::jsonb,
  add column if not exists install_notes text,
  add column if not exists rollout_scope text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'pos_apk_releases_release_type_check'
      and conrelid = 'landlord.pos_apk_releases'::regclass
  ) then
    alter table landlord.pos_apk_releases
      add constraint pos_apk_releases_release_type_check
      check (
        release_type is null
        or release_type in ('bugfix', 'feature', 'improvement', 'hotfix', 'beta')
      ) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'pos_apk_releases_release_status_check'
      and conrelid = 'landlord.pos_apk_releases'::regclass
  ) then
    alter table landlord.pos_apk_releases
      add constraint pos_apk_releases_release_status_check
      check (release_status in ('draft', 'internal_testing', 'beta', 'available', 'retired')) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'pos_apk_releases_bugs_fixed_array_check'
      and conrelid = 'landlord.pos_apk_releases'::regclass
  ) then
    alter table landlord.pos_apk_releases
      add constraint pos_apk_releases_bugs_fixed_array_check
      check (jsonb_typeof(bugs_fixed) = 'array') not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'pos_apk_releases_new_features_array_check'
      and conrelid = 'landlord.pos_apk_releases'::regclass
  ) then
    alter table landlord.pos_apk_releases
      add constraint pos_apk_releases_new_features_array_check
      check (jsonb_typeof(new_features) = 'array') not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'pos_apk_releases_internal_changes_array_check'
      and conrelid = 'landlord.pos_apk_releases'::regclass
  ) then
    alter table landlord.pos_apk_releases
      add constraint pos_apk_releases_internal_changes_array_check
      check (jsonb_typeof(internal_changes) = 'array') not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'pos_apk_releases_validation_checklist_array_check'
      and conrelid = 'landlord.pos_apk_releases'::regclass
  ) then
    alter table landlord.pos_apk_releases
      add constraint pos_apk_releases_validation_checklist_array_check
      check (jsonb_typeof(validation_checklist) = 'array') not valid;
  end if;
end $$;

create index if not exists pos_apk_releases_release_type_idx
  on landlord.pos_apk_releases (release_type);

create index if not exists pos_apk_releases_release_status_idx
  on landlord.pos_apk_releases (release_status);
