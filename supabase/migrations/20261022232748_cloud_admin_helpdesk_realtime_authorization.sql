-- Private lookup: authenticated clients cannot read the admin registry directly.
-- No caller-supplied identity or user_metadata is trusted.
create or replace function private.cloud_admin_can_receive_helpdesk_topic(requested_topic text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor_id uuid;
  all_departments boolean;
  requested_ticket_id uuid;
begin
  if auth.uid() is null then return false; end if;

  select admin_user.id, admin_user.helpdesk_all_departments
  into actor_id, all_departments
  from landlord.cloud_admin_users admin_user
  join landlord.cloud_admin_profiles profile on profile.id = admin_user.profile_id
  where admin_user.auth_user_id = auth.uid()
    and admin_user.status = 'active'
    and profile.is_active
    and coalesce(profile.permissions -> 'support_view', profile.permissions -> 'support') = 'true'::jsonb;

  if actor_id is null then return false; end if;
  -- The list channel carries invalidation metadata; ticket content is fetched by
  -- the existing authenticated Helpdesk API with department authorization.
  if requested_topic = 'cloud-admin:helpdesk' then return true; end if;
  if requested_topic is null or requested_topic !~ '^cloud-admin:helpdesk:ticket:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then
    return false;
  end if;
  requested_ticket_id := substring(requested_topic from 29)::uuid;
  return exists (
    select 1 from landlord.support_tickets ticket
    where ticket.id = requested_ticket_id
      and (all_departments or exists (
        select 1 from landlord.support_team_members membership
        where membership.admin_user_id = actor_id and membership.team_id = ticket.team_id
      ))
  );
end;
$$;

revoke all on function private.cloud_admin_can_receive_helpdesk_topic(text) from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.cloud_admin_can_receive_helpdesk_topic(text) to authenticated;

create policy cloud_admin_helpdesk_broadcast_receive
on realtime.messages for select to authenticated
using (
  extension = 'broadcast'
  and (select private.cloud_admin_can_receive_helpdesk_topic((select realtime.topic())))
);
