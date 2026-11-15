begin;
create extension if not exists pgtap with schema extensions;
select plan(82);

-- Seed users (see supabase/seed.sql):
--   ...001 membro, ...002 publicador (icara), ...003 bispo (criciuma1), ...004 estaca, ...005 admin

-- [roles] CA-01: the catalog has the 128 callings of appendix A, all active, with 3 names.
select is((select count(*)::int from public.calling_catalog), 128, '[roles] CA-01: 128 callings');
select is((select count(*)::int from public.calling_catalog where not active), 0,
  '[roles] CA-01: all callings are active');
select is(
  (select count(*)::int from public.calling_catalog where name_en is null or name_es is null),
  0, '[roles] CA-01: every calling has name_en and name_es');
select results_eq(
  $$ select level, access, count(*)::int from public.calling_catalog group by 1, 2 order by 1, 2 $$,
  $$ values ('branch'::text, 'unit_leader'::text, 3), ('stake', 'none', 31),
            ('stake', 'stake_leader', 8), ('stake', 'stake_publisher', 10),
            ('ward', 'unit_leader', 3), ('ward_branch', 'none', 63),
            ('ward_branch', 'unit_leader', 4), ('ward_branch', 'unit_publisher', 6) $$,
  '[roles] CA-01: calling counts per level and access match appendix A');
select is((select count(*)::int from public.calling_catalog where org_chart_section is not null), 59,
  '[roles] CA-01: 59 callings have an org chart section');
select is((select count(*)::int from public.calling_catalog where notify_group is not null), 74,
  '[roles] CA-01: 74 callings have a notify group');
select results_eq(
  $$ select id, level, access, notify_group, org_chart_section from public.calling_catalog
     where id in ('bishop', 'relief_society_president', 'stake_relief_society_president',
                  'high_councilor', 'sunday_school_teacher') order by id $$,
  $$ values ('bishop'::text, 'ward'::text, 'unit_leader'::text, 'bishoprics'::text, 'bishopric'::text),
            ('high_councilor', 'stake', 'stake_leader', 'high_council', 'high_council'),
            ('relief_society_president', 'ward_branch', 'unit_publisher',
             'relief_society_presidency', 'unit_organizations'),
            ('stake_relief_society_president', 'stake', 'stake_publisher',
             'relief_society_presidency', 'stake_organizations'),
            ('sunday_school_teacher', 'ward_branch', 'none', null, null) $$,
  '[roles] CA-01: sample rows match appendix A');
select is((select name_en || ' / ' || name_es from public.calling_catalog where id = 'bishop'),
  'Bishop / Obispo', '[roles] CA-01: bishop has the official en and es names');
select is((select sort_order from public.calling_catalog where id = 'unit_ysa_leader'), 1280,
  '[roles] CA-01: sort_order follows the appendix order');

-- [roles] CA-03: anon reads only active callings and cannot write.
set local role anon;
set local request.jwt.claims to '{"role":"anon"}';
select is((select count(*)::int from public.calling_catalog), 128, '[roles] CA-03: anon reads the catalog');
select throws_ok(
  $$ insert into public.calling_catalog (id, name_pt, level, sort_order) values ('x', 'Teste', 'stake', 1) $$,
  '42501', null, '[roles] CA-03: anon cannot insert into the catalog');
select throws_ok(
  $$ update public.calling_catalog set access = 'stake_leader' where id = 'bishop' $$,
  '42501', null, '[roles] CA-03: anon cannot update the catalog');
select is((select count(*)::int from public.calling_catalog_log), 0, 'anon sees no catalog log');

-- membro (...001): same read, no write, and save_calling is denied.
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}';
select throws_ok(
  $$ update public.calling_catalog set access = 'stake_leader' where id = 'bishop' $$,
  '42501', null, '[roles] CA-03: member cannot update the catalog');
select throws_ok(
  $$ select public.save_calling(null, 'Teste', null, null, 'stake', 'none', null, null, true) $$,
  'P0001', 'not_authorized', '[roles] CA-03: member cannot save_calling');

-- estaca (...004): [roles] CA-04.
set local request.jwt.claims to '{"sub":"00000000-0000-4000-8000-000000000004","role":"authenticated"}';
select throws_ok(
  $$ select public.save_calling(null, 'Teste', null, null, 'stake', 'none', null, null, true) $$,
  'P0001', 'not_authorized', '[roles] CA-04: stake leader cannot save_calling');
select is((select count(*)::int from public.calling_catalog_log), 0,
  'stake leader cannot read the catalog log');

-- admin (...005)
set local request.jwt.claims to '{"sub":"00000000-0000-4000-8000-000000000005","role":"authenticated"}';
select throws_ok(
  $$ select public.save_calling(null, 'Teste', null, null, 'stake', 'unit_publisher', null, null, true) $$,
  'P0001', 'invalid_access', '[roles] CA-02: a stake calling with unit_publisher is invalid_access');
select throws_ok(
  $$ select public.save_calling(null, 'Teste', null, null, 'ward', 'stake_leader', null, null, true) $$,
  'P0001', 'invalid_access', '[roles] CA-02: a ward calling with stake_leader is invalid_access');
select throws_ok(
  $$ select public.save_calling(null, 'Teste', null, null, 'stake', 'none', null, 'bishopric', true) $$,
  'P0001', 'invalid_section', 'a stake calling in a unit section is invalid_section');
select throws_ok(
  $$ select public.save_calling(null, 'Teste', null, null, 'ward', 'none', null, 'high_council', true) $$,
  'P0001', 'invalid_section', 'a ward calling in a stake section is invalid_section');
select is((select count(*)::int from public.calling_catalog), 128, '[roles] CA-02: nothing changed');
select throws_ok(
  $$ select public.save_calling(null, '  presidente da estaca ', null, null, 'stake', 'none', null, null, true) $$,
  'P0001', 'name_taken', 'a repeated name in the same level is name_taken (case-insensitive)');

select lives_ok(
  $$ select public.save_calling(null, '  Coordenador de Caravanas ', ' ', 'Coordinador', 'stake', 'none',
       'temple_family_history_workers', null, true) $$,
  'admin creates a calling');
select results_eq(
  $$ select name_pt, name_en, name_es, sort_order, updated_by from public.calling_catalog
     where name_pt = 'Coordenador de Caravanas' $$,
  $$ values ('Coordenador de Caravanas'::text, null::text, 'Coordinador'::text, 1290,
             '00000000-0000-4000-8000-000000000005'::uuid) $$,
  'the new calling is trimmed, empty names become null and sort_order is max + 10');
select results_eq(
  $$ select before is null, after ->> 'name_pt', actor_id from public.calling_catalog_log $$,
  $$ values (true, 'Coordenador de Caravanas'::text, '00000000-0000-4000-8000-000000000005'::uuid) $$,
  'creating a calling writes calling_catalog_log with before null');

-- ---------------------------------------------------------------------------------------------
-- Callings of people (member_calls) and the permissions derived from them.
-- Seed callings: 002 relief_society_president/icara, 003 bishop/criciuma1,
-- 004 stake_first_counselor/estaca. Home units: 001 none, 002 icara, 003 criciuma1, 005 criciuma1.
-- ---------------------------------------------------------------------------------------------
reset role;
insert into public.member_calls (user_id, unit_id, calling_id)
values ('00000000-0000-4000-8000-000000000001', 'estaca', 'stake_relief_society_president');
-- ids that a member cannot see through RLS, for the "not the owner" test
create temp table seed_calls as select id, calling_id from public.member_calls;
grant select on seed_calls to authenticated;

-- membro (...001) with stake_relief_society_president
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}';
select is(public.can_publish('estaca'), true, '[roles] CA-06: stake_publisher can publish to estaca');
select is(public.can_publish('icara'), false, '[roles] CA-06: stake_publisher cannot publish to a ward');
select is(public.can_lead('estaca'), false, '[roles] CA-06: stake_publisher cannot lead');
select is(public.is_stake_leader(), false, '[roles] CA-06: stake_publisher is not a stake leader');
select is((select count(*)::int from public.member_calls), 1,
  '[roles] CA-03: a member reads only their own member_calls rows');
select throws_ok(
  $$ insert into public.member_calls (user_id, unit_id, calling_id)
     values ('00000000-0000-4000-8000-000000000001', 'icara', 'bishop') $$,
  '42501', null, '[roles] CA-03: a member cannot insert into member_calls');
select throws_ok(
  $$ update public.member_calls set calling_id = 'bishop' $$,
  '42501', null, '[roles] CA-03: a member cannot update member_calls');

-- publicador (...002) with relief_society_president in icara
set local request.jwt.claims to '{"sub":"00000000-0000-4000-8000-000000000002","role":"authenticated"}';
select is(public.can_publish('icara'), true, '[roles] CA-05: relief_society_president can publish to own unit');
select is(public.can_lead('icara'), false, '[roles] CA-05: relief_society_president cannot lead');
select is(public.can_publish('criciuma1'), false, '[roles] CA-05: relief_society_president cannot publish elsewhere');

-- bispo (...003)
set local request.jwt.claims to '{"sub":"00000000-0000-4000-8000-000000000003","role":"authenticated"}';
select is((select count(*)::int from public.member_calls), 1, '[roles] CA-03: a bishop reads only their own calling');
select is(public.can_lead('criciuma1'), true, '[roles] CA-05: bishop leads the unit');
select throws_ok($$ select public.calling_holder_count('bishop') $$, 'P0001', 'not_authorized',
  'a bishop cannot read calling_holder_count');

set local role anon;
set local request.jwt.claims to '{"role":"anon"}';
select throws_ok($$ select count(*) from public.member_calls $$, '42501', null,
  '[roles] CA-03: anon cannot read member_calls');

-- estaca (...004): grants and revokes
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-4000-8000-000000000004","role":"authenticated"}';
select is((select count(*)::int from public.member_calls), 4, 'stake leader reads every member_calls row');
select throws_ok($$ select public.grant_calling('admin@exemplo.org', 'criciuma2', 'bishop') $$,
  'P0001', 'wrong_unit', '[roles] CA-08: bishop in another unit than the home unit is wrong_unit');
select lives_ok($$ select public.grant_calling('admin@exemplo.org', 'criciuma1', 'bishop') $$,
  '[roles] CA-08: bishop in the home unit works');
select throws_ok($$ select public.grant_calling('admin@exemplo.org', 'criciuma1', 'branch_president') $$,
  'P0001', 'invalid_unit_for_calling', '[roles] CA-08: a branch calling in a ward is invalid_unit_for_calling');
select lives_ok($$ select public.grant_calling('admin@exemplo.org', 'estaca', 'high_councilor') $$,
  '[roles] CA-08: a stake calling on the stake works');

select lives_ok($$ select public.grant_calling('publicador.icara@exemplo.org', 'icara', 'primary_president') $$,
  '[roles] CA-09: grants Presidente da Primária in Içara');
select results_eq(
  $$ select action, role, calling_id, actor_id from public.role_grants_log
     where user_id = '00000000-0000-4000-8000-000000000002' and calling_id = 'primary_president' $$,
  $$ values ('granted'::text, 'unit_publisher'::text, 'primary_president'::text,
             '00000000-0000-4000-8000-000000000004'::uuid) $$,
  '[roles] CA-09: role_grants_log has calling_id and the access at that moment');
select throws_ok(
  $$ select public.revoke_calling(id) from public.member_calls
     where user_id = '00000000-0000-4000-8000-000000000004' $$,
  'P0001', 'cannot_revoke_self', '[roles] cannot revoke the own calling');
select lives_ok(
  $$ select public.revoke_calling(id) from public.member_calls
     where user_id = '00000000-0000-4000-8000-000000000001' and calling_id = 'stake_relief_society_president' $$,
  '[roles] CA-12: revoke_calling removes the calling');
select results_eq(
  $$ select action, role, calling_id from public.role_grants_log
     where user_id = '00000000-0000-4000-8000-000000000001' $$,
  $$ values ('revoked'::text, 'stake_publisher'::text, 'stake_relief_society_president'::text) $$,
  '[roles] CA-12: the revoke is logged with calling_id');
select throws_ok($$ select public.revoke_calling(gen_random_uuid()) $$, 'P0001', 'not_found',
  'revoking an unknown calling is not_found');

set local request.jwt.claims to '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}';
select is(public.can_publish('estaca'), false, '[roles] CA-12: after the revoke the access is gone');

-- Consent (RF-17, RF-19) and the public org chart (RF-18).
set local request.jwt.claims to '{"sub":"00000000-0000-4000-8000-000000000002","role":"authenticated"}';
select lives_ok(
  $$ select public.set_org_chart_consent(id, true) from public.member_calls
     where user_id = '00000000-0000-4000-8000-000000000002' and calling_id = 'relief_society_president' $$,
  '[roles] CA-13: the owner accepts the org chart');
set local request.jwt.claims to '{"sub":"00000000-0000-4000-8000-000000000003","role":"authenticated"}';
select throws_ok(
  $$ select public.set_org_chart_consent(id, false) from seed_calls
     where calling_id = 'relief_society_president' $$,
  'P0001', 'not_found', '[roles] only the owner can set the consent (others get not_found)');
select throws_ok(
  $$ select public.set_org_chart_consent(gen_random_uuid(), true) $$,
  'P0001', 'not_found', 'an unknown calling is not_found');

set local role anon;
set local request.jwt.claims to '{"role":"anon"}';
select results_eq(
  $$ select display_name, calling_id, section, unit_id from public.org_chart_members() $$,
  $$ values ('Bruno Exemplo'::text, 'relief_society_president'::text, 'unit_organizations'::text, 'icara'::text) $$,
  '[roles] CA-13: only the accepted calling appears (anon)');
select ok(
  (select bool_and(not (to_jsonb(m) ? 'email') and not (to_jsonb(m) ? 'user_id') and not (to_jsonb(m) ? 'phone'))
     from public.org_chart_members() m),
  '[roles] CA-15: org_chart_members has no e-mail, user_id or phone');
select ok(
  not exists (
    select 1 from pg_proc p, unnest(p.proargnames) n
    where p.oid = 'public.org_chart_members()'::regprocedure and n in ('email', 'user_id', 'phone')),
  '[roles] CA-15: the function signature has no e-mail, user_id or phone');

set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-4000-8000-000000000002","role":"authenticated"}';
select lives_ok(
  $$ select public.set_org_chart_consent(id, false) from public.member_calls
     where user_id = '00000000-0000-4000-8000-000000000002' and calling_id = 'relief_society_president' $$,
  '[roles] CA-14: the owner declines');
set local role anon;
set local request.jwt.claims to '{"role":"anon"}';
select is((select count(*)::int from public.org_chart_members()), 0,
  '[roles] CA-14: a declined calling does not appear');

-- Two callings for membro: one with an org chart section, one without.
reset role;
insert into public.member_calls (user_id, unit_id, calling_id, org_chart_consent) values
  ('00000000-0000-4000-8000-000000000001', 'icara', 'relief_society_counselor_1', 'pending'),
  ('00000000-0000-4000-8000-000000000001', 'icara', 'sunday_school_teacher', null);

set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}';
select is(public.can_publish('icara'), false, 'a calling with access none and one without it grant nothing');
select throws_ok(
  $$ select public.set_org_chart_consent(id, true) from public.member_calls
     where calling_id = 'sunday_school_teacher' $$,
  'P0001', 'invalid_calling', 'a calling without a section has no consent to set');
select is(jsonb_array_length(public.export_my_data() -> 'calls'), 2,
  '[roles] CA-23: the export has the 2 callings');
select is(
  (select public.export_my_data() -> 'calls' -> 0 ->> 'calling_name'),
  'Primeira Conselheira na Presidência da Sociedade de Socorro',
  '[roles] CA-23: the export names the calling (pt-BR) in unit order');

-- Catalog edits that depend on who holds the calling (admin).
set local request.jwt.claims to '{"sub":"00000000-0000-4000-8000-000000000005","role":"authenticated"}';
select is(public.calling_holder_count('relief_society_counselor_1'), 1,
  '[roles] CA-18: calling_holder_count counts the people who have it');
select throws_ok(
  $$ select public.save_calling(c.id, c.name_pt, c.name_en, c.name_es, c.level, c.access,
       c.notify_group, c.org_chart_section, false)
     from public.calling_catalog c where c.id = 'relief_society_counselor_1' $$,
  'P0001', 'in_use', '[roles] CA-18: deactivating a calling somebody has is in_use');
select is((select active from public.calling_catalog where id = 'relief_society_counselor_1'), true,
  '[roles] CA-18: the calling stays active');
select throws_ok(
  $$ select public.save_calling(c.id, c.name_pt, c.name_en, c.name_es, 'ward', c.access,
       c.notify_group, c.org_chart_section, true)
     from public.calling_catalog c where c.id = 'relief_society_counselor_1' $$,
  'P0001', 'level_locked', '[roles] changing the level of a calling somebody has is level_locked');

-- CA-19: the access changes for everybody who has the calling, at once.
select lives_ok(
  $$ select public.save_calling(c.id, c.name_pt, c.name_en, c.name_es, c.level, 'unit_publisher',
       c.notify_group, c.org_chart_section, true)
     from public.calling_catalog c where c.id = 'relief_society_counselor_1' $$,
  '[roles] CA-19: the admin changes the access of a calling in use');
set local request.jwt.claims to '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}';
select is(public.can_publish('icara'), true, '[roles] CA-19: the holder can publish right away');

-- A section appearing never publishes anybody: the holder becomes pending.
set local request.jwt.claims to '{"sub":"00000000-0000-4000-8000-000000000005","role":"authenticated"}';
select lives_ok(
  $$ select public.save_calling(c.id, c.name_pt, c.name_en, c.name_es, c.level, c.access,
       c.notify_group, 'unit_organizations', true)
     from public.calling_catalog c where c.id = 'sunday_school_teacher' $$,
  'the admin gives a section to a calling without one');
reset role;
select is(
  (select org_chart_consent from public.member_calls
    where user_id = '00000000-0000-4000-8000-000000000001' and calling_id = 'sunday_school_teacher'),
  'pending', '[roles] a calling that gains a section turns its holders pending');
select results_eq(
  $$ select before ->> 'access', after ->> 'access', actor_id
     from public.calling_catalog_log where calling_id = 'relief_society_counselor_1' $$,
  $$ values ('none'::text, 'unit_publisher'::text, '00000000-0000-4000-8000-000000000005'::uuid) $$,
  '[roles] CA-19: calling_catalog_log has before and after');

-- RF-09: an inactive calling grants nothing.
update public.calling_catalog set active = false where id = 'relief_society_counselor_1';
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}';
select is(public.can_publish('icara'), false, 'an inactive calling grants no access');

-- CA-21: the legacy mapping and the new shape of memberships.
reset role;
select results_eq(
  $$ select public.legacy_role_to_calling(r, g, k)
     from (values ('stake_leader', 'stake_presidency', 'stake'), ('stake_leader', null, 'stake'),
                  ('unit_leader', 'bishops', 'ward'), ('unit_leader', 'bishops', 'branch'),
                  ('unit_leader', null, 'ward'), ('unit_publisher', null, 'ward')) as t(r, g, k) $$,
  $$ values ('stake_first_counselor'::text), ('high_councilor'), ('bishop'), ('branch_president'),
            ('unit_clerk'), ('unit_activities_committee_chair') $$,
  '[roles] CA-21: legacy_role_to_calling maps the 6 combinations');
select is(public.legacy_role_to_calling('unit_leader', 'presidents', 'ward'), 'unit_clerk',
  'the old presidents group keeps the unit_leader access as unit_clerk');
select is(public.legacy_role_to_calling('admin', null, 'stake'), null::text,
  'admin is not a calling');
select is((select count(*)::int from public.memberships where role <> 'admin'), 0,
  '[roles] CA-21: memberships holds only the admin');
select throws_ok(
  $$ insert into public.memberships (user_id, unit_id, role)
     values ('00000000-0000-4000-8000-000000000001', 'icara', 'unit_leader') $$,
  '23514', null, '[roles] CA-21: memberships accepts only role admin');
select is(
  (select count(*)::int from information_schema.columns
    where table_schema = 'public' and table_name = 'memberships' and column_name = 'leadership_group'),
  0, '[roles] CA-21: memberships has no leadership_group column');
select is(
  (select count(*)::int from public.member_calls mc
    join public.profiles p on p.id = mc.user_id
   where (p.id, mc.calling_id) in (
     ('00000000-0000-4000-8000-000000000002'::uuid, 'relief_society_president'),
     ('00000000-0000-4000-8000-000000000003'::uuid, 'bishop'),
     ('00000000-0000-4000-8000-000000000004'::uuid, 'stake_first_counselor'))),
  3, '[roles] CA-21: the seed accounts have the callings of RF-24');

-- CA-22: a person with a unit calling cannot change the home unit.
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-4000-8000-000000000003","role":"authenticated"}';
select throws_ok(
  $$ update public.profiles set home_unit_id = 'criciuma2' where id = '00000000-0000-4000-8000-000000000003' $$,
  'P0001', 'home_unit_locked', '[roles] CA-22: a bishop cannot change the home unit');

select * from finish();
rollback;
