begin;
create extension if not exists pgtap with schema extensions;
select plan(49);

-- The org chart demo seed (supabase/seeds/org_chart_demo.sql) is not part of these fixtures.
delete from auth.users where email like 'organograma.%@exemplo.org';

-- Seed users (see supabase/seed.sql):
--   ...001 membro, ...002 publicador (icara), ...003 bispo (criciuma1), ...004 estaca, ...005 admin

-- Extra user without a home unit (...006), for the RF-16a tests.
insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
) values (
  '00000000-0000-4000-8000-000000000006', '00000000-0000-0000-0000-000000000000', 'authenticated',
  'authenticated', 'sem.unidade@exemplo.org', '', now(), '{}', '{}', now(), now(), '', '', '', '');
insert into public.profiles (id, display_name, home_unit_id, consented_at)
values ('00000000-0000-4000-8000-000000000006', 'Fulana Sem Unidade', null, now());

-- anon cannot execute any of the 6 RPCs.
set local role anon;
set local request.jwt.claims to '{"role":"anon"}';
select throws_ok($$ select public.complete_welcome('Ana', null, 'pt-BR') $$, '42501', null, 'anon cannot run complete_welcome');
select throws_ok($$ select public.export_my_data() $$, '42501', null, 'anon cannot run export_my_data');
select throws_ok($$ select public.delete_my_account() $$, '42501', null, 'anon cannot run delete_my_account');
select throws_ok($$ select * from public.list_access() $$, '42501', null, 'anon cannot run list_access');
select throws_ok($$ select public.grant_calling('a@b.co', 'icara', 'bishop') $$, '42501', null, 'anon cannot run grant_calling');
select throws_ok($$ select public.revoke_calling(gen_random_uuid()) $$, '42501', null, 'anon cannot run revoke_calling');

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
select is(jsonb_array_length(public.export_my_data() -> 'calls'), 0,
  'CA-12: export has the caller callings only (member has none)');

select throws_ok($$ select * from public.list_access() $$, 'P0001', 'not_authorized', 'member cannot list_access');
select throws_ok($$ select public.grant_calling('a@b.co', 'icara', 'bishop') $$, 'P0001', 'not_authorized',
  'member cannot grant_calling');

-- bispo (...003)
set local request.jwt.claims to '{"sub":"00000000-0000-4000-8000-000000000003","role":"authenticated"}';
select throws_ok($$ select * from public.list_access() $$, 'P0001', 'not_authorized', 'unit leader cannot list_access');
select throws_ok($$ select public.grant_calling('membro@exemplo.org', 'criciuma1', 'unit_clerk') $$,
  'P0001', 'not_authorized', 'unit leader cannot grant_calling');
select is(jsonb_array_length(public.export_my_data() -> 'calls'), 1,
  'CA-12: export lists the leader callings');

-- estaca (...004)
set local request.jwt.claims to '{"sub":"00000000-0000-4000-8000-000000000004","role":"authenticated"}';
select throws_ok($$ select public.grant_calling('nobody@exemplo.org', 'icara', 'bishop') $$,
  'P0001', 'no_account', 'CA-16: e-mail without account is no_account');
select throws_ok($$ select public.grant_admin('membro@exemplo.org') $$,
  'P0001', 'not_authorized', 'CA-19: stake leader cannot grant admin');
select throws_ok($$ select public.grant_calling('membro@exemplo.org', 'icara', 'no_such_calling') $$,
  'P0001', 'invalid_calling', 'an unknown calling is invalid_calling');
select throws_ok($$ select public.grant_calling('membro@exemplo.org', 'estaca', 'bishop') $$,
  'P0001', 'invalid_unit_for_calling', 'a ward calling on the stake is invalid_unit_for_calling');
select throws_ok($$ select public.grant_calling('sem.unidade@exemplo.org', 'icara', 'bishop') $$,
  'P0001', 'no_home_unit', 'CA-25: a person without a home unit cannot receive a unit calling');
select throws_ok($$ select public.grant_calling('sem.unidade@exemplo.org', 'estaca', 'high_councilor') $$,
  'P0001', 'no_home_unit', 'CA-25: a person without a home unit cannot receive a stake calling');
select throws_ok($$ select public.grant_calling('membro@exemplo.org', 'criciuma2', 'bishop') $$,
  'P0001', 'wrong_unit', 'CA-24: a unit calling in another unit than the home unit is wrong_unit');
select throws_ok($$ select public.grant_calling('membro@exemplo.org', 'criciuma2', 'unit_activities_committee_chair') $$,
  'P0001', 'wrong_unit', 'CA-24: a publisher calling in another unit than the home unit is wrong_unit');
select lives_ok($$ select public.grant_calling(' Membro@Exemplo.org ', 'icara', 'bishop') $$,
  'CA-15: stake leader grants bishop in icara');
select results_eq(
  $$ select calling_id, unit_id, granted_by, org_chart_consent from public.member_calls
     where user_id = '00000000-0000-4000-8000-000000000001' $$,
  $$ values ('bishop'::text, 'icara'::text, '00000000-0000-4000-8000-000000000004'::uuid, 'pending'::text) $$,
  'CA-15: the calling exists, pending the org chart consent');
select results_eq(
  $$ select action, role, unit_id, calling_id, actor_id from public.role_grants_log
     where user_id = '00000000-0000-4000-8000-000000000001' and unit_id = 'icara' $$,
  $$ values ('granted'::text, 'unit_leader'::text, 'icara'::text, 'bishop'::text,
             '00000000-0000-4000-8000-000000000004'::uuid) $$,
  'CA-15: role_grants_log has the grant with actor_id and calling_id');
select throws_ok($$ select public.grant_calling('membro@exemplo.org', 'icara', 'bishop') $$,
  'P0001', 'already_granted', 'granting the same calling again is already_granted');
-- membro now leads icara: the home unit is locked (CA-26, decision 20).
set local request.jwt.claims to '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}';
select throws_ok(
  $$ update public.profiles set home_unit_id = 'criciuma2' where id = '00000000-0000-4000-8000-000000000001' $$,
  'P0001', 'home_unit_locked', 'CA-26: a unit leader cannot move to another unit');
select throws_ok(
  $$ update public.profiles set home_unit_id = null where id = '00000000-0000-4000-8000-000000000001' $$,
  'P0001', 'home_unit_locked', 'CA-26: a unit leader cannot clear the unit');
set local request.jwt.claims to '{"sub":"00000000-0000-4000-8000-000000000004","role":"authenticated"}';

select is((select count(*)::int from public.list_access()), 5, 'list_access returns all callings and the admin');

select throws_ok(
  $$ select public.revoke_calling(id) from public.member_calls
     where user_id = '00000000-0000-4000-8000-000000000004' $$,
  'P0001', 'cannot_revoke_self', 'CA-18: cannot revoke own calling');
select throws_ok(
  $$ select public.revoke_admin('00000000-0000-4000-8000-000000000005') $$,
  'P0001', 'not_authorized', 'stake leader cannot revoke admin');
select lives_ok(
  $$ select public.revoke_calling(id) from public.member_calls
     where user_id = '00000000-0000-4000-8000-000000000001' and calling_id = 'bishop' $$,
  'stake leader revokes a bishop calling');
select is(
  (select count(*)::int from public.role_grants_log
    where action = 'revoked' and user_id = '00000000-0000-4000-8000-000000000001'),
  1, 'revoking writes revoked to role_grants_log');

-- a stake calling accepts any home unit (CA-24) and only blocks clearing the unit (CA-26).
select lives_ok($$ select public.grant_calling('membro@exemplo.org', 'estaca', 'stake_first_counselor') $$,
  'CA-24: a stake calling is granted to a person of any unit');
set local request.jwt.claims to '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}';
select lives_ok(
  $$ update public.profiles set home_unit_id = 'criciuma2' where id = '00000000-0000-4000-8000-000000000001' $$,
  'CA-26: with only stake_leader the unit can change to another unit');
select is((select home_unit_id from public.profiles where id = '00000000-0000-4000-8000-000000000001'),
  'criciuma2', 'CA-26: the new unit was saved');
select throws_ok(
  $$ update public.profiles set home_unit_id = null where id = '00000000-0000-4000-8000-000000000001' $$,
  'P0001', 'home_unit_locked', 'CA-26: with stake_leader the unit cannot be cleared');
select throws_ok($$ select public.complete_welcome('Ana Nova', null, 'pt-BR') $$,
  'P0001', 'home_unit_locked', 'CA-26: complete_welcome cannot clear the unit either');

-- admin (...005): grants admin; last admin cannot delete the account.
set local request.jwt.claims to '{"sub":"00000000-0000-4000-8000-000000000005","role":"authenticated"}';
select lives_ok($$ select public.grant_admin('membro@exemplo.org') $$,
  'admin grants admin');
select public.revoke_admin('00000000-0000-4000-8000-000000000001');
select throws_ok($$ select public.delete_my_account() $$, 'P0001', 'last_admin',
  'CA-20: the only admin cannot delete the account');

-- membro deletes the account: auth.users, profile and memberships go; the audit trail stays.
set local request.jwt.claims to '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}';
select lives_ok($$ select public.delete_my_account() $$, 'CA-13: member deletes the account');
reset role;
select is(
  (select (select count(*) from auth.users where id = '00000000-0000-4000-8000-000000000001')
        + (select count(*) from public.profiles where id = '00000000-0000-4000-8000-000000000001')
        + (select count(*) from public.memberships where user_id = '00000000-0000-4000-8000-000000000001')
        + (select count(*) from public.member_calls where user_id = '00000000-0000-4000-8000-000000000001'))::int,
  0, 'CA-13: auth.users, profiles, memberships and callings of the member are gone');
select ok(
  (select count(*) from public.role_grants_log where user_id = '00000000-0000-4000-8000-000000000001') >= 2,
  'CA-13: role_grants_log survives the deletion');

select * from finish();
rollback;
