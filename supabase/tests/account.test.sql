begin;
create extension if not exists pgtap with schema extensions;
select plan(37);

-- Seed users (see supabase/seed.sql):
--   ...001 membro, ...002 publicador (icara), ...003 bispo (criciuma1), ...004 estaca, ...005 admin

-- anon cannot execute any of the 6 RPCs.
set local role anon;
set local request.jwt.claims to '{"role":"anon"}';
select throws_ok($$ select public.complete_welcome('Ana', null, 'pt-BR') $$, '42501', null, 'anon cannot run complete_welcome');
select throws_ok($$ select public.export_my_data() $$, '42501', null, 'anon cannot run export_my_data');
select throws_ok($$ select public.delete_my_account() $$, '42501', null, 'anon cannot run delete_my_account');
select throws_ok($$ select * from public.list_access() $$, '42501', null, 'anon cannot run list_access');
select throws_ok($$ select public.grant_role('a@b.co', 'icara', 'unit_leader', null) $$, '42501', null, 'anon cannot run grant_role');
select throws_ok($$ select public.revoke_role(gen_random_uuid()) $$, '42501', null, 'anon cannot run revoke_role');

-- membro (...001)
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}';

select throws_ok($$ select public.complete_welcome('A', null, 'pt-BR') $$, 'P0001', 'invalid_display_name',
  'CA-09: complete_welcome rejects a 1-character name');
select throws_ok($$ select public.complete_welcome('Ana', 'estaca', 'pt-BR') $$, 'P0001', 'invalid_unit',
  'complete_welcome rejects the stake as home unit');
select throws_ok($$ select public.complete_welcome('Ana', null, 'fr-FR') $$, 'P0001', 'invalid_locale',
  'complete_welcome rejects an unknown locale');

update public.profiles set consented_at = null where id = '00000000-0000-4000-8000-000000000001';
select lives_ok($$ select public.complete_welcome('  Ana Nova  ', 'icara', 'es-MX') $$,
  'CA-09: complete_welcome succeeds');
select results_eq(
  $$ select display_name, home_unit_id, locale, consented_at is not null from public.profiles
     where id = '00000000-0000-4000-8000-000000000001' $$,
  $$ values ('Ana Nova'::text, 'icara'::text, 'es-MX'::text, true) $$,
  'CA-09: complete_welcome stores trimmed name, unit, locale and consented_at');

select is(public.export_my_data() -> 'account' ->> 'email', 'membro@exemplo.org',
  'CA-12: export has the caller e-mail');
select is(public.export_my_data() -> 'profile' ->> 'display_name', 'Ana Nova',
  'CA-12: export has the caller profile');
select is(jsonb_array_length(public.export_my_data() -> 'memberships'), 0,
  'CA-12: export has the caller memberships only (member has none)');

select throws_ok($$ select * from public.list_access() $$, 'P0001', 'not_authorized', 'member cannot list_access');
select throws_ok($$ select public.grant_role('a@b.co', 'icara', 'unit_leader', null) $$, 'P0001', 'not_authorized',
  'member cannot grant_role');

-- bispo (...003)
set local request.jwt.claims to '{"sub":"00000000-0000-4000-8000-000000000003","role":"authenticated"}';
select throws_ok($$ select * from public.list_access() $$, 'P0001', 'not_authorized', 'unit leader cannot list_access');
select throws_ok($$ select public.grant_role('membro@exemplo.org', 'criciuma1', 'unit_leader', null) $$,
  'P0001', 'not_authorized', 'unit leader cannot grant_role');
select is(jsonb_array_length(public.export_my_data() -> 'memberships'), 1,
  'CA-12: export lists the leader roles');

-- estaca (...004)
set local request.jwt.claims to '{"sub":"00000000-0000-4000-8000-000000000004","role":"authenticated"}';
select throws_ok($$ select public.grant_role('nobody@exemplo.org', 'icara', 'unit_leader', 'bishops') $$,
  'P0001', 'no_account', 'CA-16: e-mail without account is no_account');
select throws_ok($$ select public.grant_role('membro@exemplo.org', 'icara', 'admin', null) $$,
  'P0001', 'not_authorized', 'CA-19: stake leader cannot grant admin');
select throws_ok($$ select public.grant_role('membro@exemplo.org', 'icara', 'unit_leader', 'stake_presidency') $$,
  'P0001', 'invalid_group', 'stake_presidency outside the stake is invalid_group');
select throws_ok($$ select public.grant_role('membro@exemplo.org', 'estaca', 'unit_leader', null) $$,
  'P0001', 'invalid_unit_for_role', 'unit_leader on the stake is invalid_unit_for_role');
select lives_ok($$ select public.grant_role(' Membro@Exemplo.org ', 'icara', 'unit_leader', 'bishops') $$,
  'CA-15: stake leader grants unit_leader/icara/bishops');
select results_eq(
  $$ select role, unit_id, leadership_group, granted_by from public.memberships
     where user_id = '00000000-0000-4000-8000-000000000001' $$,
  $$ values ('unit_leader'::text, 'icara'::text, 'bishops'::text, '00000000-0000-4000-8000-000000000004'::uuid) $$,
  'CA-15: the membership exists');
select results_eq(
  $$ select action, role, unit_id, actor_id from public.role_grants_log
     where user_id = '00000000-0000-4000-8000-000000000001' and unit_id = 'icara' $$,
  $$ values ('granted'::text, 'unit_leader'::text, 'icara'::text, '00000000-0000-4000-8000-000000000004'::uuid) $$,
  'CA-15: role_grants_log has the grant with actor_id');
select throws_ok($$ select public.grant_role('membro@exemplo.org', 'icara', 'unit_leader', 'bishops') $$,
  'P0001', 'already_granted', 'granting the same role again is already_granted');
select is((select count(*)::int from public.list_access()), 5, 'list_access returns all memberships');

select throws_ok(
  $$ select public.revoke_role(id) from public.memberships
     where user_id = '00000000-0000-4000-8000-000000000004' $$,
  'P0001', 'cannot_revoke_self', 'CA-18: cannot revoke own membership');
select throws_ok(
  $$ select public.revoke_role(id) from public.memberships where role = 'admin' $$,
  'P0001', 'not_authorized', 'stake leader cannot revoke admin');
select lives_ok(
  $$ select public.revoke_role(id) from public.memberships
     where user_id = '00000000-0000-4000-8000-000000000001' and role = 'unit_leader' $$,
  'stake leader revokes a unit_leader');
select is(
  (select count(*)::int from public.role_grants_log
    where action = 'revoked' and user_id = '00000000-0000-4000-8000-000000000001'),
  1, 'revoking writes revoked to role_grants_log');

-- admin (...005): grants admin; last admin cannot delete the account.
set local request.jwt.claims to '{"sub":"00000000-0000-4000-8000-000000000005","role":"authenticated"}';
select lives_ok($$ select public.grant_role('membro@exemplo.org', 'estaca', 'admin', null) $$,
  'admin grants admin');
select public.revoke_role(id) from public.memberships
  where user_id = '00000000-0000-4000-8000-000000000001' and role = 'admin';
select throws_ok($$ select public.delete_my_account() $$, 'P0001', 'last_admin',
  'CA-20: the only admin cannot delete the account');

-- membro deletes the account: auth.users, profile and memberships go; the audit trail stays.
set local request.jwt.claims to '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}';
select lives_ok($$ select public.delete_my_account() $$, 'CA-13: member deletes the account');
reset role;
select is(
  (select (select count(*) from auth.users where id = '00000000-0000-4000-8000-000000000001')
        + (select count(*) from public.profiles where id = '00000000-0000-4000-8000-000000000001')
        + (select count(*) from public.memberships where user_id = '00000000-0000-4000-8000-000000000001'))::int,
  0, 'CA-13: auth.users, profiles and memberships of the member are gone');
select ok(
  (select count(*) from public.role_grants_log where user_id = '00000000-0000-4000-8000-000000000001') >= 2,
  'CA-13: role_grants_log survives the deletion');

select * from finish();
rollback;
