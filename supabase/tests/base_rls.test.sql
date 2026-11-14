begin;
create extension if not exists pgtap with schema extensions;
select plan(59);

-- Seed users (see supabase/seed.sql):
--   ...001 membro, ...002 publicador (icara), ...003 bispo (criciuma1), ...004 estaca, ...005 admin

-- RNF-01: RLS on in every table.
select ok(
  (select relrowsecurity from pg_class where oid = 'public.units'::regclass),
  'RNF-01: RLS enabled on units');
select ok(
  (select relrowsecurity from pg_class where oid = 'public.profiles'::regclass),
  'RNF-01: RLS enabled on profiles');
select ok(
  (select relrowsecurity from pg_class where oid = 'public.memberships'::regclass),
  'RNF-01: RLS enabled on memberships');
select ok(
  (select relrowsecurity from pg_class where oid = 'public.role_grants_log'::regclass),
  'RNF-01: RLS enabled on role_grants_log');

-- RNF-05: permission functions are security definer, stable, with a fixed search_path.
select is(
  (select count(*)::int from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and p.proname in ('has_role', 'is_admin', 'is_stake_leader', 'can_publish', 'can_lead')
      and p.prosecdef and p.provolatile = 's'
      and p.proconfig @> array['search_path=public']),
  5,
  'RNF-05: five permission functions are security definer, stable, search_path fixed');

-- CA-01: anon reads units in sort_order; writes are denied.
set local role anon;
set local request.jwt.claims to '{"role":"anon"}';
select results_eq(
  $$ select id from public.units order by sort_order $$,
  $$ values ('estaca'), ('criciuma1'), ('criciuma2'), ('criciuma3'), ('icara'), ('ararangua'), ('ramoGaivota') $$,
  'CA-01: anon reads the 7 units in sort_order');
select throws_ok(
  $$ insert into public.units (id, kind, name, sort_order) values ('x', 'ward', 'X', 99) $$,
  '42501', null, 'CA-01: anon cannot insert into units');

-- CA-02: anon sees no profiles.
select is((select count(*)::int from public.profiles), 0, 'CA-02: anon sees 0 profiles');
select is((select count(*)::int from public.memberships), 0, 'CA-04: anon sees 0 memberships');
select is((select count(*)::int from public.role_grants_log), 0, 'CA-07: anon sees 0 role_grants_log rows');
select is(public.can_publish('estaca'), false, 'CA-05: anon cannot publish to estaca');
select is(public.can_lead('icara'), false, 'CA-06: anon cannot lead icara');

-- membro (...001)
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}';
select throws_ok(
  $$ insert into public.units (id, kind, name, sort_order) values ('x', 'ward', 'X', 99) $$,
  '42501', null, 'CA-01: member cannot insert into units');
select is((select count(*)::int from public.profiles), 1, 'CA-02: member sees only own profile');
select is(
  (select count(*)::int from public.profiles where id = '00000000-0000-4000-8000-000000000002'),
  0, 'CA-02: member cannot read another profile');
select results_eq(
  $$ with u as (update public.profiles set display_name = 'Ana Nova'
       where id = '00000000-0000-4000-8000-000000000001' returning 1) select count(*)::int from u $$,
  $$ values (1) $$,
  'CA-02: member updates own profile');
select results_eq(
  $$ with u as (update public.profiles set display_name = 'Hack Hack'
       where id = '00000000-0000-4000-8000-000000000002' returning 1) select count(*)::int from u $$,
  $$ values (0) $$,
  'CA-02: member cannot update another profile');
select throws_ok(
  $$ insert into public.memberships (user_id, unit_id, role)
     values ('00000000-0000-4000-8000-000000000001', 'icara', 'unit_leader') $$,
  '42501', null, 'CA-04: member cannot insert into memberships');
select is((select count(*)::int from public.memberships), 0, 'CA-04: member sees 0 memberships');
select is((select count(*)::int from public.role_grants_log), 0, 'CA-07: member sees 0 role_grants_log rows');
select is(public.can_publish('estaca'), false, 'CA-05: member cannot publish to estaca');
select is(public.can_publish('icara'), false, 'CA-05: member cannot publish to icara');
select is(public.can_lead('icara'), false, 'CA-06: member cannot lead icara');
select is(public.is_admin(), false, 'RF-08: member is not admin');
select is(public.is_stake_leader(), false, 'RF-08: member is not stake leader');

-- publicador (...002)
set local request.jwt.claims to '{"sub":"00000000-0000-4000-8000-000000000002","role":"authenticated"}';
select is(public.can_publish('icara'), true, 'CA-05: publisher can publish to own unit');
select is(public.can_publish('criciuma1'), false, 'CA-05: publisher cannot publish to another unit');
select is(public.can_lead('icara'), false, 'CA-06: publisher cannot lead own unit');
select is((select count(*)::int from public.memberships), 1, 'CA-04: publisher sees only own membership');

-- bispo (...003)
set local request.jwt.claims to '{"sub":"00000000-0000-4000-8000-000000000003","role":"authenticated"}';
select throws_ok(
  $$ insert into public.memberships (user_id, unit_id, role)
     values ('00000000-0000-4000-8000-000000000003', 'icara', 'unit_leader') $$,
  '42501', null, 'CA-04: unit leader cannot insert into memberships');
select is((select count(*)::int from public.memberships), 1, 'CA-04: unit leader sees only own membership');
select is(public.can_publish('criciuma1'), true, 'CA-05: unit leader can publish to own unit');
select is(public.can_publish('icara'), false, 'CA-05: unit leader cannot publish to another unit');
select is(public.can_lead('criciuma1'), true, 'CA-06: unit leader can lead own unit');
select is(public.can_lead('icara'), false, 'CA-06: unit leader cannot lead another unit');
select is((select count(*)::int from public.role_grants_log), 0, 'CA-07: unit leader sees 0 role_grants_log rows');

-- estaca (...004)
set local request.jwt.claims to '{"sub":"00000000-0000-4000-8000-000000000004","role":"authenticated"}';
select is((select count(*)::int from public.memberships), 4, 'CA-04: stake leader sees all 4 memberships');
select is((select count(*)::int from public.role_grants_log), 4, 'CA-07: stake leader sees 4 role_grants_log rows');
select throws_ok(
  $$ insert into public.role_grants_log (action, user_id, unit_id, role)
     values ('granted', '00000000-0000-4000-8000-000000000001', 'icara', 'unit_leader') $$,
  '42501', null, 'CA-07: stake leader cannot insert into role_grants_log');
select throws_ok(
  $$ insert into public.memberships (user_id, unit_id, role)
     values ('00000000-0000-4000-8000-000000000001', 'icara', 'unit_leader') $$,
  '42501', null, 'CA-04: stake leader cannot insert into memberships directly');
select is(public.can_publish('icara'), true, 'CA-05: stake leader can publish to any unit');
select is(public.can_lead('icara'), true, 'CA-06: stake leader can lead any unit');
select is(public.is_stake_leader(), true, 'RF-08: stake leader is stake leader');
select is(public.is_admin(), false, 'RF-08: stake leader is not admin');

-- admin (...005)
set local request.jwt.claims to '{"sub":"00000000-0000-4000-8000-000000000005","role":"authenticated"}';
select is((select count(*)::int from public.memberships), 4, 'CA-04: admin sees all 4 memberships');
select is((select count(*)::int from public.role_grants_log), 4, 'CA-07: admin sees 4 role_grants_log rows');
select is(public.can_publish('icara'), true, 'CA-05: admin can publish to any unit');
select is(public.can_lead('icara'), false, 'CA-06: admin cannot lead (RN-04)');
select is(public.is_admin(), true, 'RF-08: admin is admin');
select is(public.is_stake_leader(), false, 'RF-08: admin is not stake leader');

-- Constraints, as the owner.
reset role;
select throws_ok(
  $$ insert into public.memberships (user_id, unit_id, role)
     values ('00000000-0000-4000-8000-000000000001', 'icara', 'stake_leader') $$,
  '23514', null, 'CA-03: stake_leader in a ward is rejected');
select throws_ok(
  $$ insert into public.memberships (user_id, unit_id, role)
     values ('00000000-0000-4000-8000-000000000001', 'estaca', 'unit_leader') $$,
  '23514', null, 'CA-03: unit_leader on the stake is rejected');
select throws_ok(
  $$ insert into public.memberships (user_id, unit_id, role)
     values ('00000000-0000-4000-8000-000000000001', 'estaca', 'unit_publisher') $$,
  '23514', null, 'CA-03: unit_publisher on the stake is rejected');
select throws_ok(
  $$ insert into public.memberships (user_id, unit_id, role)
     values ('00000000-0000-4000-8000-000000000001', 'icara', 'admin') $$,
  '23514', null, 'CA-03: admin in a ward is rejected');
select throws_ok(
  $$ update public.profiles set home_unit_id = 'estaca' where id = '00000000-0000-4000-8000-000000000001' $$,
  '23514', null, '7.4: home_unit_id = estaca is rejected');
select throws_ok(
  $$ update public.profiles set display_name = 'A' where id = '00000000-0000-4000-8000-000000000001' $$,
  '23514', null, 'RF-02: display_name shorter than 2 is rejected');

-- 7.4 (last): deleting a user cascades memberships and profile; the audit trail stays.
delete from auth.users where id = '00000000-0000-4000-8000-000000000002';
select is(
  (select count(*)::int from public.memberships where user_id = '00000000-0000-4000-8000-000000000002'),
  0, '7.4: memberships removed with the user');
select is(
  (select count(*)::int from public.profiles where id = '00000000-0000-4000-8000-000000000002'),
  0, '7.4: profile removed with the user');
select is(
  (select count(*)::int from public.role_grants_log where user_id = '00000000-0000-4000-8000-000000000002'),
  1, '7.4: role_grants_log row survives the deletion');

select * from finish();
rollback;
