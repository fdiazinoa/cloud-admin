begin;

update landlord.cloud_admin_profiles
set
  permissions = permissions || jsonb_build_object(
    'observability',
    case
      when code in ('owner', 'admin', 'support', 'operations', 'viewer') then true
      else coalesce((permissions ->> 'observability')::boolean, false)
    end
  ),
  updated_at = timezone('utc'::text, now())
where not (permissions ? 'observability')
   or permissions ->> 'observability' is null;

commit;
