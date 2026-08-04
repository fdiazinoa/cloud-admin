begin;

alter table landlord.cloud_admin_users
  add column if not exists helpdesk_all_departments boolean not null default false;

insert into landlord.support_teams (code, name, description, is_active)
values
  ('support', 'Soporte', 'Atención técnica de POS, ERP, ClicPOS y Cloud-Admin.', true),
  ('administration', 'Administración (Gerencia)', 'Solicitudes administrativas, comerciales y de gerencia.', true),
  ('msmall', 'MSmall', 'Implementaciones, soporte y solicitudes del producto MSmall.', true)
on conflict (code) do update
set name = excluded.name,
    description = excluded.description,
    is_active = true,
    updated_at = timezone('utc'::text, now());

-- Preserve current operation: existing users and unclassified tickets start in
-- Soporte. Owners and administrators keep global visibility until explicitly changed.
insert into landlord.support_team_members (team_id, admin_user_id)
select team.id, admin_user.id
from landlord.support_teams team
cross join landlord.cloud_admin_users admin_user
where team.code = 'support'
  and admin_user.status = 'active'
on conflict (team_id, admin_user_id) do nothing;

update landlord.cloud_admin_users admin_user
set helpdesk_all_departments = true
from landlord.cloud_admin_profiles profile
where profile.id = admin_user.profile_id
  and (profile.code in ('owner', 'admin') or profile.level >= 80);

update landlord.support_tickets ticket
set team_id = team.id
from landlord.support_teams team
where ticket.team_id is null
  and team.code = 'support';

create or replace function landlord.assign_default_helpdesk_department()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.team_id is null then
    select team.id
    into new.team_id
    from landlord.support_teams team
    where team.code = 'support'
      and team.is_active
    limit 1;
  end if;
  return new;
end;
$$;

revoke all on function landlord.assign_default_helpdesk_department() from public;

drop trigger if exists assign_default_helpdesk_department_trigger on landlord.support_tickets;
create trigger assign_default_helpdesk_department_trigger
before insert on landlord.support_tickets
for each row
execute function landlord.assign_default_helpdesk_department();

create or replace function private.cloud_admin_can_access_support_ticket(requested_ticket_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from landlord.cloud_admin_users admin_user
    join landlord.cloud_admin_profiles profile on profile.id = admin_user.profile_id
    join landlord.support_tickets ticket on ticket.id = requested_ticket_id
    where admin_user.auth_user_id = auth.uid()
      and admin_user.status = 'active'
      and profile.is_active
      and coalesce((profile.permissions ->> 'support')::boolean, false)
      and (
        admin_user.helpdesk_all_departments
        or exists (
          select 1
          from landlord.support_team_members membership
          where membership.admin_user_id = admin_user.id
            and membership.team_id = ticket.team_id
        )
      )
  );
$$;

revoke all on function private.cloud_admin_can_access_support_ticket(uuid) from public;
grant execute on function private.cloud_admin_can_access_support_ticket(uuid) to authenticated;

drop policy if exists "Cloud admins can view support tickets" on landlord.support_tickets;
create policy "Cloud admins can view support tickets by department"
on landlord.support_tickets for select
to authenticated
using ((select private.cloud_admin_can_access_support_ticket(id)));

drop policy if exists "Cloud admins can view support messages" on landlord.ticket_messages;
create policy "Cloud admins can view support messages by department"
on landlord.ticket_messages for select
to authenticated
using ((select private.cloud_admin_can_access_support_ticket(ticket_id)));

drop policy if exists "Cloud admins can view support contacts" on landlord.support_contacts;
create policy "Cloud admins can view support contacts by department"
on landlord.support_contacts for select
to authenticated
using (
  exists (
    select 1
    from landlord.support_tickets ticket
    where ticket.contact_id = support_contacts.id
      and (select private.cloud_admin_can_access_support_ticket(ticket.id))
  )
);

drop policy if exists "Cloud admins can view ticket insights" on landlord.ai_ticket_insights;
create policy "Cloud admins can view ticket insights by department"
on landlord.ai_ticket_insights for select
to authenticated
using ((select private.cloud_admin_can_access_support_ticket(ticket_id)));

commit;
