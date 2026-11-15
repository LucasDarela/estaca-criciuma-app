begin;
create extension if not exists pgtap with schema extensions;
select plan(26);

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

select * from finish();
rollback;
