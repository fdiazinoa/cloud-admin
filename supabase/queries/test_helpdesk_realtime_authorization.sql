-- Run after the migration. All probe rows and session settings are rolled back.
begin;
do $$
declare
  actor record;
  ticket record;
  expected boolean;
  checked integer := 0;
begin
  for actor in
    select u.*, p.is_active as profile_active, p.permissions
    from landlord.cloud_admin_users u join landlord.cloud_admin_profiles p on p.id = u.profile_id
    where u.auth_user_id is not null
  loop
    perform set_config('request.jwt.claims', jsonb_build_object('sub', actor.auth_user_id, 'role', 'authenticated')::text, true);
    expected := actor.status = 'active' and actor.profile_active
      and coalesce(coalesce(actor.permissions->'support_view', actor.permissions->'support') = 'true'::jsonb, false);
    assert private.cloud_admin_can_receive_helpdesk_topic('cloud-admin:helpdesk') = expected, 'Admin eligibility mismatch';
    assert not private.cloud_admin_can_receive_helpdesk_topic('cloud-admin:helpdesk:ticket:invalid'), 'Malformed ticket allowed';
    assert not private.cloud_admin_can_receive_helpdesk_topic('cloud-admin:helpdesk:other'), 'Unknown topic allowed';
    assert not private.cloud_admin_can_receive_helpdesk_topic('sync:unrelated'), 'Sync topic allowed';
    for ticket in select id, team_id from landlord.support_tickets limit 30 loop
      assert private.cloud_admin_can_receive_helpdesk_topic('cloud-admin:helpdesk:ticket:' || ticket.id) =
        (expected and (actor.helpdesk_all_departments or exists (
          select 1 from landlord.support_team_members m where m.admin_user_id = actor.id and m.team_id = ticket.team_id
        ))), 'Ticket department authorization mismatch';
    end loop;
    checked := checked + 1;
  end loop;
  assert checked > 0, 'No admin fixtures available';
  perform set_config('request.jwt.claims', '{"role":"authenticated","sub":"00000000-0000-0000-0000-000000000000"}', true);
  assert not private.cloud_admin_can_receive_helpdesk_topic('cloud-admin:helpdesk'), 'Non-admin allowed';
  perform set_config('request.jwt.claims', '{}', true);
  assert not private.cloud_admin_can_receive_helpdesk_topic('cloud-admin:helpdesk'), 'Missing session allowed';
end;
$$;

-- Exercise the actual RLS policy as authenticated, including extension filtering.
select set_config('request.jwt.claims', jsonb_build_object('role', 'authenticated', 'sub', (
  select u.auth_user_id from landlord.cloud_admin_users u
  join landlord.cloud_admin_profiles p on p.id = u.profile_id
  where u.status = 'active' and p.is_active and u.auth_user_id is not null
    and coalesce(p.permissions->'support_view', p.permissions->'support') = 'true'::jsonb
  limit 1
))::text, true);
select set_config('realtime.topic', 'cloud-admin:helpdesk', true);
insert into realtime.messages(topic, extension, event, private, skip_broadcast)
values ('cloud-admin:helpdesk', 'broadcast', 'cloud_admin_rls_probe', true, true),
       ('cloud-admin:helpdesk', 'presence', 'cloud_admin_rls_probe', true, true);
set local role authenticated;
do $$
begin
  assert (select count(*) from realtime.messages where event = 'cloud_admin_rls_probe') = 1, 'Broadcast RLS failed';
end;
$$;
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"00000000-0000-0000-0000-000000000000"}', true);
do $$
begin
  assert (select count(*) from realtime.messages where event = 'cloud_admin_rls_probe') = 0, 'Non-admin RLS failed';
end;
$$;
reset role;
rollback;
