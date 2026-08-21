begin;

alter table landlord.support_integration_settings
  add column if not exists assignment_copilot_mode text not null default 'suggest',
  add column if not exists assignment_copilot_min_confidence numeric(5,4) not null default 0.6800;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'support_integration_settings_assignment_mode_check'
      and conrelid = 'landlord.support_integration_settings'::regclass
  ) then
    alter table landlord.support_integration_settings
      add constraint support_integration_settings_assignment_mode_check
      check (assignment_copilot_mode in ('off', 'suggest', 'auto')) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'support_integration_settings_assignment_confidence_check'
      and conrelid = 'landlord.support_integration_settings'::regclass
  ) then
    alter table landlord.support_integration_settings
      add constraint support_integration_settings_assignment_confidence_check
      check (assignment_copilot_min_confidence between 0 and 1) not valid;
  end if;
end $$;

create table if not exists landlord.support_sla_policies (
  level text primary key,
  name text not null,
  first_response_minutes integer not null check (first_response_minutes > 0),
  resolution_minutes integer not null check (resolution_minutes > 0),
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

insert into landlord.support_sla_policies (level, name, first_response_minutes, resolution_minutes)
values
  ('standard', 'Estándar', 120, 1440),
  ('priority', 'Prioritario', 30, 480),
  ('critical', 'Crítico', 15, 240)
on conflict (level) do nothing;

create table if not exists landlord.support_agent_routing_profiles (
  admin_user_id uuid primary key references landlord.cloud_admin_users(id) on delete cascade,
  is_available boolean not null default true,
  auto_assign_enabled boolean not null default true,
  max_active_tickets integer not null default 20 check (max_active_tickets between 1 and 500),
  skills text[] not null default '{}'::text[],
  last_auto_assigned_at timestamptz,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

alter table landlord.support_tickets
  add column if not exists assigned_at timestamptz,
  add column if not exists assigned_by uuid references landlord.cloud_admin_users(id) on delete set null,
  add column if not exists assignment_source text,
  add column if not exists assignment_confidence numeric(5,4),
  add column if not exists assignment_reason text,
  add column if not exists sla_level text,
  add column if not exists first_response_due_at timestamptz,
  add column if not exists resolution_due_at timestamptz,
  add column if not exists resolved_by uuid references landlord.cloud_admin_users(id) on delete set null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'support_tickets_assignment_source_check'
      and conrelid = 'landlord.support_tickets'::regclass
  ) then
    alter table landlord.support_tickets
      add constraint support_tickets_assignment_source_check
      check (assignment_source is null or assignment_source in ('manual', 'copilot_auto', 'copilot_manual', 'migration', 'system')) not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'support_tickets_assignment_confidence_check'
      and conrelid = 'landlord.support_tickets'::regclass
  ) then
    alter table landlord.support_tickets
      add constraint support_tickets_assignment_confidence_check
      check (assignment_confidence is null or assignment_confidence between 0 and 1) not valid;
  end if;
end $$;

create table if not exists landlord.support_ticket_assignment_events (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references landlord.support_tickets(id) on delete cascade,
  from_assignee_id uuid references landlord.cloud_admin_users(id) on delete set null,
  to_assignee_id uuid references landlord.cloud_admin_users(id) on delete set null,
  team_id uuid references landlord.support_teams(id) on delete set null,
  source text not null,
  confidence numeric(5,4),
  reason text,
  assigned_by uuid references landlord.cloud_admin_users(id) on delete set null,
  created_at timestamptz not null default timezone('utc'::text, now()),
  constraint support_ticket_assignment_events_source_check
    check (source in ('manual', 'copilot_auto', 'copilot_manual', 'migration', 'system')),
  constraint support_ticket_assignment_events_confidence_check
    check (confidence is null or confidence between 0 and 1)
);

create index if not exists support_ticket_assignment_events_ticket_created_idx
  on landlord.support_ticket_assignment_events (ticket_id, created_at desc);
create index if not exists support_ticket_assignment_events_agent_created_idx
  on landlord.support_ticket_assignment_events (to_assignee_id, created_at desc)
  where to_assignee_id is not null;
create index if not exists support_ticket_assignment_events_team_idx
  on landlord.support_ticket_assignment_events (team_id)
  where team_id is not null;
create index if not exists support_tickets_resolved_by_at_idx
  on landlord.support_tickets (resolved_by, resolved_at desc)
  where resolved_at is not null;
create index if not exists support_tickets_first_response_overdue_idx
  on landlord.support_tickets (first_response_due_at, assignee_id)
  where first_response_at is null
    and merged_into_ticket_id is null
    and assignment_status <> 'spam';
create index if not exists support_tickets_resolution_overdue_idx
  on landlord.support_tickets (resolution_due_at, assignee_id)
  where resolved_at is null
    and merged_into_ticket_id is null
    and assignment_status <> 'spam';
create index if not exists support_agent_routing_profiles_available_idx
  on landlord.support_agent_routing_profiles (last_auto_assigned_at, admin_user_id)
  where is_available and auto_assign_enabled;

create or replace function landlord.prepare_helpdesk_ticket_operations()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_sla_level text;
  v_first_response_minutes integer;
  v_resolution_minutes integer;
begin
  if tg_op = 'INSERT' or new.sla_level is null then
    if new.contact_id is not null then
      select nullif(contact.metadata->>'sla', '')
      into v_sla_level
      from landlord.support_contacts as contact
      where contact.id = new.contact_id;
    end if;
    new.sla_level := coalesce(v_sla_level, new.sla_level, case when new.priority = 'Critica' then 'critical' else 'standard' end);
  end if;

  if tg_op = 'INSERT'
     or new.sla_level is distinct from old.sla_level
     or new.created_at is distinct from old.created_at then
    select policy.first_response_minutes, policy.resolution_minutes
    into v_first_response_minutes, v_resolution_minutes
    from landlord.support_sla_policies as policy
    where policy.level = new.sla_level and policy.is_active;

    if v_first_response_minutes is null then
      select policy.first_response_minutes, policy.resolution_minutes
      into v_first_response_minutes, v_resolution_minutes
      from landlord.support_sla_policies as policy
      where policy.level = 'standard';
      new.sla_level := 'standard';
    end if;

    new.first_response_due_at := new.created_at + make_interval(mins => v_first_response_minutes);
    new.resolution_due_at := new.created_at + make_interval(mins => v_resolution_minutes);
  end if;

  if tg_op = 'INSERT' or new.assignee_id is distinct from old.assignee_id then
    if new.assignee_id is null then
      new.assigned_at := null;
      if new.assignment_status <> 'spam' then
        new.assignment_status := 'needs_assignment';
      end if;
    else
      new.assigned_at := timezone('utc'::text, now());
      if new.assignment_status <> 'spam' then
        new.assignment_status := 'assigned';
      end if;
    end if;
  end if;

  if new.status in ('Resuelto', 'Cerrado')
     and (tg_op = 'INSERT' or new.status is distinct from old.status) then
    new.resolved_at := coalesce(new.resolved_at, timezone('utc'::text, now()));
    new.resolved_by := coalesce(new.resolved_by, new.assignee_id);
  end if;

  return new;
end;
$$;

drop trigger if exists prepare_helpdesk_ticket_operations_trigger on landlord.support_tickets;
create trigger prepare_helpdesk_ticket_operations_trigger
before insert or update of assignee_id, status, sla_level, created_at, priority
on landlord.support_tickets
for each row execute function landlord.prepare_helpdesk_ticket_operations();

create or replace function landlord.audit_helpdesk_ticket_assignment()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (tg_op = 'INSERT' and new.assignee_id is not null)
     or (tg_op = 'UPDATE' and new.assignee_id is distinct from old.assignee_id) then
    insert into landlord.support_ticket_assignment_events (
      ticket_id,
      from_assignee_id,
      to_assignee_id,
      team_id,
      source,
      confidence,
      reason,
      assigned_by
    ) values (
      new.id,
      case when tg_op = 'UPDATE' then old.assignee_id else null end,
      new.assignee_id,
      new.team_id,
      coalesce(new.assignment_source, 'system'),
      new.assignment_confidence,
      new.assignment_reason,
      new.assigned_by
    );
  end if;
  return new;
end;
$$;

drop trigger if exists audit_helpdesk_ticket_assignment_trigger on landlord.support_tickets;
create trigger audit_helpdesk_ticket_assignment_trigger
after insert or update of assignee_id
on landlord.support_tickets
for each row execute function landlord.audit_helpdesk_ticket_assignment();

create or replace function landlord.helpdesk_copilot_route_ticket(
  p_ticket_id uuid,
  p_apply boolean default false,
  p_actor_id uuid default null,
  p_source text default 'copilot_manual'
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_ticket landlord.support_tickets%rowtype;
  v_mode text := 'suggest';
  v_min_confidence numeric := 0.6800;
  v_agent_id uuid;
  v_agent_name text;
  v_active_count integer;
  v_capacity integer;
  v_score numeric;
  v_confidence numeric;
  v_reason text;
  v_applied boolean := false;
begin
  if p_source not in ('copilot_auto', 'copilot_manual') then
    raise exception 'Invalid Copilot assignment source';
  end if;

  select * into v_ticket
  from landlord.support_tickets
  where id = p_ticket_id
    and merged_into_ticket_id is null
    and assignment_status <> 'spam'
  for update;

  if not found then
    return jsonb_build_object('ticket_id', p_ticket_id, 'recommended', false, 'reason', 'Ticket no disponible para asignación.');
  end if;

  select
    coalesce(settings.assignment_copilot_mode, 'suggest'),
    coalesce(settings.assignment_copilot_min_confidence, 0.6800)
  into v_mode, v_min_confidence
  from landlord.support_integration_settings as settings
  where settings.id = 'helpdesk';

  v_mode := coalesce(v_mode, 'suggest');
  v_min_confidence := coalesce(v_min_confidence, 0.6800);

  with workloads as (
    select
      ticket.assignee_id,
      count(*)::integer as active_count
    from landlord.support_tickets as ticket
    where ticket.assignee_id is not null
      and ticket.merged_into_ticket_id is null
      and ticket.assignment_status <> 'spam'
      and ticket.status not in ('Resuelto', 'Cerrado')
    group by ticket.assignee_id
  ), candidates as (
    select
      admin_user.id,
      admin_user.full_name,
      coalesce(profile.max_active_tickets, 20) as capacity,
      coalesce(workload.active_count, 0) as active_count,
      coalesce(profile.skills, '{}'::text[]) as skills,
      profile.last_auto_assigned_at,
      admin_user.helpdesk_all_departments,
      exists (
        select 1
        from landlord.support_team_members as membership
        where membership.admin_user_id = admin_user.id
          and membership.team_id = v_ticket.team_id
      ) as team_member
    from landlord.cloud_admin_users as admin_user
    join landlord.cloud_admin_profiles as admin_profile
      on admin_profile.id = admin_user.profile_id
    left join landlord.support_agent_routing_profiles as profile
      on profile.admin_user_id = admin_user.id
    left join workloads as workload
      on workload.assignee_id = admin_user.id
    where admin_user.status = 'active'
      and admin_profile.is_active
      and coalesce((admin_profile.permissions->>'support')::boolean, false)
      and coalesce(profile.is_available, true)
      and coalesce(profile.auto_assign_enabled, true)
      and coalesce(workload.active_count, 0) < coalesce(profile.max_active_tickets, 20)
      and (
        v_ticket.team_id is null
        or admin_user.helpdesk_all_departments
        or exists (
          select 1
          from landlord.support_team_members as membership
          where membership.admin_user_id = admin_user.id
            and membership.team_id = v_ticket.team_id
        )
      )
  ), ranked as (
    select
      candidate.*,
      (
        case
          when v_ticket.team_id is null then 15
          when candidate.team_member then 28
          when candidate.helpdesk_all_departments then 22
          else 0
        end
        + case
            when cardinality(candidate.skills) = 0 then 8
            when exists (
              select 1 from unnest(candidate.skills) as skill
              where lower(skill) = lower(coalesce(v_ticket.category::text, ''))
                 or lower(coalesce(v_ticket.subject, '')) like '%' || lower(skill) || '%'
            ) then 22
            else 0
          end
        + greatest(0, 40 * (1 - candidate.active_count::numeric / candidate.capacity::numeric))
        + case when v_ticket.priority in ('Critica', 'Alta') and candidate.active_count = 0 then 7 else 3 end
        + case when candidate.last_auto_assigned_at is null then 5 else least(5, extract(epoch from (now() - candidate.last_auto_assigned_at)) / 86400) end
      )::numeric as score
    from candidates as candidate
  )
  select
    ranked.id,
    ranked.full_name,
    ranked.active_count,
    ranked.capacity,
    ranked.score
  into v_agent_id, v_agent_name, v_active_count, v_capacity, v_score
  from ranked
  order by ranked.score desc, ranked.last_auto_assigned_at asc nulls first, ranked.id
  limit 1;

  if v_agent_id is null then
    return jsonb_build_object(
      'ticket_id', p_ticket_id,
      'recommended', false,
      'assigned', false,
      'mode', v_mode,
      'reason', 'No hay agentes disponibles con capacidad para este ticket.'
    );
  end if;

  v_confidence := least(0.9900, greatest(0, round(v_score / 100, 4)));
  v_reason := format(
    'Copilot recomienda a %s: carga %s/%s, categoría %s, prioridad %s.',
    v_agent_name,
    v_active_count,
    v_capacity,
    coalesce(v_ticket.category::text, 'Otros'),
    coalesce(v_ticket.priority::text, 'Media')
  );

  if p_apply and v_confidence >= v_min_confidence then
    update landlord.support_tickets
    set
      assignee_id = v_agent_id,
      assignment_source = p_source,
      assignment_confidence = v_confidence,
      assignment_reason = v_reason,
      assigned_by = p_actor_id
    where id = p_ticket_id;

    insert into landlord.support_agent_routing_profiles (admin_user_id, last_auto_assigned_at)
    values (v_agent_id, timezone('utc'::text, now()))
    on conflict (admin_user_id) do update
    set last_auto_assigned_at = excluded.last_auto_assigned_at,
        updated_at = timezone('utc'::text, now());
    v_applied := true;
  end if;

  return jsonb_build_object(
    'ticket_id', p_ticket_id,
    'recommended', true,
    'assigned', v_applied,
    'mode', v_mode,
    'min_confidence', v_min_confidence,
    'agent_id', v_agent_id,
    'agent_name', v_agent_name,
    'active_tickets', v_active_count,
    'capacity', v_capacity,
    'confidence', v_confidence,
    'reason', v_reason
  );
end;
$$;

revoke all on function landlord.helpdesk_copilot_route_ticket(uuid, boolean, uuid, text) from public, anon, authenticated;
grant execute on function landlord.helpdesk_copilot_route_ticket(uuid, boolean, uuid, text) to service_role;

insert into landlord.support_agent_routing_profiles (admin_user_id)
select admin_user.id
from landlord.cloud_admin_users as admin_user
join landlord.cloud_admin_profiles as profile on profile.id = admin_user.profile_id
where admin_user.status = 'active'
  and profile.is_active
  and coalesce((profile.permissions->>'support')::boolean, false)
on conflict (admin_user_id) do nothing;

update landlord.support_tickets as ticket
set
  sla_level = coalesce(nullif(contact.metadata->>'sla', ''), case when ticket.priority = 'Critica' then 'critical' else 'standard' end),
  assigned_at = case when ticket.assignee_id is not null then coalesce(ticket.assigned_at, ticket.updated_at, ticket.created_at) else null end,
  assignment_source = case when ticket.assignee_id is not null then coalesce(ticket.assignment_source, 'migration') else ticket.assignment_source end,
  resolved_by = case when ticket.resolved_at is not null then coalesce(ticket.resolved_by, ticket.assignee_id) else ticket.resolved_by end
from landlord.support_contacts as contact
where contact.id = ticket.contact_id
  and (ticket.sla_level is null or ticket.assignee_id is not null or ticket.resolved_at is not null);

update landlord.support_tickets as ticket
set
  sla_level = coalesce(ticket.sla_level, case when ticket.priority = 'Critica' then 'critical' else 'standard' end),
  assigned_at = case when ticket.assignee_id is not null then coalesce(ticket.assigned_at, ticket.updated_at, ticket.created_at) else null end,
  assignment_source = case when ticket.assignee_id is not null then coalesce(ticket.assignment_source, 'migration') else ticket.assignment_source end,
  resolved_by = case when ticket.resolved_at is not null then coalesce(ticket.resolved_by, ticket.assignee_id) else ticket.resolved_by end
where ticket.sla_level is null
   or (ticket.assignee_id is not null and ticket.assigned_at is null)
   or (ticket.resolved_at is not null and ticket.resolved_by is null);

update landlord.support_tickets as ticket
set
  first_response_due_at = ticket.created_at + make_interval(mins => policy.first_response_minutes),
  resolution_due_at = ticket.created_at + make_interval(mins => policy.resolution_minutes)
from landlord.support_sla_policies as policy
where policy.level = ticket.sla_level
  and (ticket.first_response_due_at is null or ticket.resolution_due_at is null);

insert into landlord.support_ticket_assignment_events (
  ticket_id,
  to_assignee_id,
  team_id,
  source,
  reason,
  created_at
)
select
  ticket.id,
  ticket.assignee_id,
  ticket.team_id,
  'migration',
  'Asignación existente al habilitar auditoría de HelpDesk.',
  coalesce(ticket.assigned_at, ticket.updated_at, ticket.created_at)
from landlord.support_tickets as ticket
where ticket.assignee_id is not null
  and not exists (
    select 1
    from landlord.support_ticket_assignment_events as event
    where event.ticket_id = ticket.id
      and event.to_assignee_id = ticket.assignee_id
      and event.source = 'migration'
  );

alter table landlord.support_sla_policies enable row level security;
alter table landlord.support_agent_routing_profiles enable row level security;
alter table landlord.support_ticket_assignment_events enable row level security;

revoke all on landlord.support_sla_policies from anon, authenticated;
revoke all on landlord.support_agent_routing_profiles from anon, authenticated;
revoke all on landlord.support_ticket_assignment_events from anon, authenticated;

grant all on landlord.support_sla_policies to service_role;
grant all on landlord.support_agent_routing_profiles to service_role;
grant all on landlord.support_ticket_assignment_events to service_role;

commit;
