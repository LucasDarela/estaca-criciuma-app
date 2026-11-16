begin;
create extension if not exists pgtap with schema extensions;
select plan(59);

-- The org chart demo seed (supabase/seeds/org_chart_demo.sql) is not part of these fixtures.
delete from auth.users where email like 'organograma.%@exemplo.org';

-- Seed users (see supabase/seed.sql):
--   ...001 membro, ...002 publicador (icara, relief_society_president), ...003 bispo (criciuma1),
--   ...004 estaca (stake_first_counselor), ...005 admin
-- Extra accounts of this test:
--   ...201 high councilor (estaca), ...202 stake second counselor (estaca),
--   ...203 first counselor of criciuma1, ...204 plain member with a phone (export and delete)
insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
) values
  ('00000000-0000-4000-8000-000000000201', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'sumo.teste@exemplo.org', '', now(), '{}', '{}', now(), now(), '', '', '', ''),
  ('00000000-0000-4000-8000-000000000202', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'segundo.teste@exemplo.org', '', now(), '{}', '{}', now(), now(), '', '', '', ''),
  ('00000000-0000-4000-8000-000000000203', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'conselheiro.teste@exemplo.org', '', now(), '{}', '{}', now(), now(), '', '', '', ''),
  ('00000000-0000-4000-8000-000000000204', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'exporta.teste@exemplo.org', '', now(), '{}', '{}', now(), now(), '', '', '', '');
insert into public.profiles (id, display_name, home_unit_id, consented_at) values
  ('00000000-0000-4000-8000-000000000201', 'Sumo Teste', null, now()),
  ('00000000-0000-4000-8000-000000000202', 'Segundo Teste', null, now()),
  ('00000000-0000-4000-8000-000000000203', 'Conselheiro Teste', null, now()),
  ('00000000-0000-4000-8000-000000000204', 'Exporta Teste', null, now());

insert into public.member_calls (user_id, unit_id, calling_id, org_chart_consent) values
  ('00000000-0000-4000-8000-000000000201', 'estaca', 'high_councilor', 'accepted'),
  ('00000000-0000-4000-8000-000000000203', 'criciuma1', 'bishopric_first_counselor', 'accepted');
update public.member_calls set org_chart_consent = 'accepted'
where user_id = '00000000-0000-4000-8000-000000000004';

create temp table ids as
select
  (select id from public.member_calls where user_id = '00000000-0000-4000-8000-000000000201') as hc,
  (select id from public.member_calls where user_id = '00000000-0000-4000-8000-000000000004') as c1,
  (select id from public.member_calls where user_id = '00000000-0000-4000-8000-000000000203') as bf;
grant select on ids to anon, authenticated;

-- Phones: 004 shows hers, 201 does not.
insert into public.profile_phones (user_id, phone_e164, show_on_org_chart) values
  ('00000000-0000-4000-8000-000000000004', '+5548999990004', true),
  ('00000000-0000-4000-8000-000000000201', '+5548999990201', false);

-- [leadership] CA-01: RLS of profile_phones and the format of the number.
set local role anon;
set local request.jwt.claims to '{"role":"anon"}';
select throws_ok($$ select count(*) from public.profile_phones $$, '42501', null,
  '[leadership] CA-01: anon cannot read profile_phones');
select throws_ok($$ select public.set_my_phone('+5548999990001', true) $$, '42501', null,
  '[leadership] CA-01: anon cannot run set_my_phone');

set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}';
select lives_ok($$ select public.set_my_phone('+5548999990001', true) $$,
  '[leadership] CA-01: a member saves a phone');
select results_eq($$ select user_id::text, phone_e164 from public.profile_phones $$,
  $$ values ('00000000-0000-4000-8000-000000000001'::text, '+5548999990001'::text) $$,
  '[leadership] CA-01: a person reads only their own phone');
select throws_ok($$ select public.set_my_phone('+5548999', true) $$, 'P0001', 'invalid_phone',
  '[leadership] CA-01: a short number is invalid_phone');
select throws_ok($$ select public.set_my_phone('+5504999990001', true) $$, 'P0001', 'invalid_phone',
  '[leadership] CA-01: a DDD starting with 0 is invalid_phone');
select lives_ok($$ select public.set_my_phone('+554833330001', null) $$,
  '[leadership] CA-01: a landline is accepted and a null switch means hidden');
select is((select show_on_org_chart from public.profile_phones), false,
  '[leadership] CA-01: a null switch is stored as false');

set local request.jwt.claims to '{"sub":"00000000-0000-4000-8000-000000000005","role":"authenticated"}';
select throws_ok(
  $$ insert into public.profile_phones (user_id, phone_e164)
     values ('00000000-0000-4000-8000-000000000005', '48999') $$,
  '23514', null, '[leadership] CA-01: a direct insert with 48999 fails the check constraint');
select throws_ok(
  $$ insert into public.profile_phones (user_id, phone_e164)
     values ('00000000-0000-4000-8000-000000000001', '+5548999990005') $$,
  '42501', null, '[leadership] CA-01: nobody inserts a phone for another person');

set local request.jwt.claims to '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}';
select lives_ok($$ select public.set_my_phone(null, false) $$,
  '[leadership] CA-01: a null number removes the phone');
select is((select count(*)::int from public.profile_phones), 0,
  '[leadership] CA-01: the row is gone after removing');

-- [leadership] CA-02: org_chart_phones.
set local role anon;
set local request.jwt.claims to '{"role":"anon"}';
select throws_ok($$ select * from public.org_chart_phones() $$, '42501', null,
  '[leadership] CA-02: anon cannot run org_chart_phones');

set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}';
select results_eq($$ select member_call_id, phone_e164 from public.org_chart_phones() $$,
  $$ select c1, '+5548999990004'::text from ids $$,
  '[leadership] CA-02: a member gets only the phone with the switch on');

-- [leadership] CA-03: the link tables are closed.
set local role anon;
set local request.jwt.claims to '{"role":"anon"}';
select throws_ok($$ select * from public.high_council_links $$, '42501', null,
  '[leadership] CA-03: anon cannot read high_council_links');
select throws_ok($$ select * from public.high_council_units $$, '42501', null,
  '[leadership] CA-03: anon cannot read high_council_units');
select throws_ok($$ select * from public.unit_org_links $$, '42501', null,
  '[leadership] CA-03: anon cannot read unit_org_links');
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-4000-8000-000000000004","role":"authenticated"}';
select throws_ok($$ select * from public.high_council_links $$, '42501', null,
  '[leadership] CA-03: even a stake leader cannot read high_council_links');
select throws_ok($$ select * from public.high_council_units $$, '42501', null,
  '[leadership] CA-03: even a stake leader cannot read high_council_units');
select throws_ok($$ select * from public.unit_org_links $$, '42501', null,
  '[leadership] CA-03: even a stake leader cannot read unit_org_links');

-- [leadership] CA-04: only a stake leader links high councilors.
select lives_ok(
  $$ select public.set_high_councilor_links((select hc from ids), 'stake_first_counselor', array['icara']) $$,
  '[leadership] CA-04: a stake leader saves the links');
reset role;
select results_eq(
  $$ select (select count(*)::int from public.high_council_links),
            (select count(*)::int from public.high_council_units where unit_id = 'icara') $$,
  $$ values (1, 1) $$, '[leadership] CA-04: the counselor link and the unit are stored');
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-4000-8000-000000000003","role":"authenticated"}';
select throws_ok(
  $$ select public.set_high_councilor_links((select hc from ids), 'stake_first_counselor', array['icara']) $$,
  'P0001', 'forbidden', '[leadership] CA-04: a bishop cannot link high councilors');

-- [leadership] CA-05: validations, in order.
set local request.jwt.claims to '{"sub":"00000000-0000-4000-8000-000000000004","role":"authenticated"}';
select throws_ok(
  $$ select public.set_high_councilor_links((select hc from ids), 'bishop', '{}') $$,
  'P0001', 'invalid_counselor', '[leadership] CA-05: bishop is not a stake counselor');
select throws_ok(
  $$ select public.set_high_councilor_links((select hc from ids), 'stake_second_counselor', '{}') $$,
  'P0001', 'no_counselor', '[leadership] CA-05: nobody holds stake_second_counselor');
select throws_ok(
  $$ select public.set_high_councilor_links((select hc from ids), null, array['estaca']) $$,
  'P0001', 'invalid_unit', '[leadership] CA-05: the stake is not a followed unit');
select throws_ok(
  $$ select public.set_high_councilor_links((select hc from ids), null, array['xyz']) $$,
  'P0001', 'invalid_unit', '[leadership] CA-05: an unknown unit is invalid_unit');
select throws_ok(
  $$ select public.set_high_councilor_links(gen_random_uuid(), null, '{}') $$,
  'P0001', 'not_found', '[leadership] CA-05: an unknown calling is not_found');
select throws_ok(
  $$ select public.set_high_councilor_links((select c1 from ids), null, '{}') $$,
  'P0001', 'not_found', '[leadership] CA-05: a calling outside the high council is not_found');
select lives_ok(
  $$ select public.set_high_councilor_links((select hc from ids), 'stake_first_counselor', array['icara', 'icara', 'ararangua']) $$,
  '[leadership] CA-05: repeated units are accepted');
reset role;
select is((select count(*)::int from public.high_council_units), 2,
  '[leadership] CA-05: repeated units are stored once');
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-4000-8000-000000000004","role":"authenticated"}';
select lives_ok(
  $$ select public.set_high_councilor_links((select hc from ids), 'stake_first_counselor', '{}') $$,
  '[leadership] CA-05: an empty list is accepted');
reset role;
select is((select count(*)::int from public.high_council_units), 0,
  '[leadership] CA-05: an empty list removes every unit');

-- With two holders of the same calling, the oldest granted_at wins.
insert into public.member_calls (user_id, unit_id, calling_id, org_chart_consent, granted_at) values
  ('00000000-0000-4000-8000-000000000202', 'estaca', 'stake_second_counselor', 'accepted', now() - interval '2 days'),
  ('00000000-0000-4000-8000-000000000203', 'estaca', 'stake_second_counselor', 'accepted', now() - interval '1 day');
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-4000-8000-000000000004","role":"authenticated"}';
select lives_ok(
  $$ select public.set_high_councilor_links((select hc from ids), 'stake_second_counselor', '{}') $$,
  '[leadership] CA-05: the link to a calling with two holders is saved');
reset role;
select is(
  (select counselor_call_id from public.high_council_links),
  (select id from public.member_calls
   where user_id = '00000000-0000-4000-8000-000000000202' and calling_id = 'stake_second_counselor'),
  '[leadership] CA-05: the oldest granted_at holder gets the link');
delete from public.member_calls
where calling_id = 'stake_second_counselor' and unit_id = 'estaca';
select is((select count(*)::int from public.high_council_links), 0,
  '[leadership] CA-05: removing the counselor calling drops the link');

-- [leadership] CA-06: a unit leader links organizations of their unit.
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-4000-8000-000000000003","role":"authenticated"}';
select lives_ok(
  $$ select public.set_unit_org_counselor('criciuma1', 'primary', 'bishopric_first_counselor') $$,
  '[leadership] CA-06: the bishop links an organization');
set local request.jwt.claims to '{"sub":"00000000-0000-4000-8000-000000000002","role":"authenticated"}';
select throws_ok(
  $$ select public.set_unit_org_counselor('criciuma1', 'primary', 'bishopric_first_counselor') $$,
  'P0001', 'forbidden', '[leadership] CA-06: a publisher cannot link');
set local request.jwt.claims to '{"sub":"00000000-0000-4000-8000-000000000005","role":"authenticated"}';
select throws_ok(
  $$ select public.set_unit_org_counselor('criciuma1', 'primary', 'bishopric_first_counselor') $$,
  'P0001', 'forbidden', '[leadership] CA-06: admin cannot link');

-- [leadership] CA-07
set local request.jwt.claims to '{"sub":"00000000-0000-4000-8000-000000000004","role":"authenticated"}';
select throws_ok(
  $$ select public.set_unit_org_counselor('ramoGaivota', 'primary', 'bishopric_first_counselor') $$,
  'P0001', 'invalid_counselor', '[leadership] CA-07: a branch has no bishopric counselor');
select throws_ok(
  $$ select public.set_unit_org_counselor('criciuma1', 'young_men', null) $$,
  'P0001', 'invalid_organization', '[leadership] CA-07: young_men is not linkable');
select throws_ok(
  $$ select public.set_unit_org_counselor('estaca', 'primary', null) $$,
  'P0001', 'invalid_unit', '[leadership] CA-07: the stake is not a unit with organizations');
select throws_ok(
  $$ select public.set_unit_org_counselor('criciuma2', 'primary', 'bishopric_first_counselor') $$,
  'P0001', 'no_counselor', '[leadership] CA-07: nobody holds the counselor calling in the unit');

-- [leadership] CA-08: the link survives the counselor hiding from the org chart, and cascades.
select lives_ok(
  $$ select public.set_high_councilor_links((select hc from ids), 'stake_first_counselor', array['icara']) $$,
  'setup: link the high councilor to the first counselor again');
reset role;
update public.member_calls set org_chart_consent = 'declined'
where user_id = '00000000-0000-4000-8000-000000000004';
set local role anon;
set local request.jwt.claims to '{"role":"anon"}';
select ok(
  exists (select 1 from public.org_chart_links()
          where kind = 'high_council_counselor' and counselor_calling_id = 'stake_first_counselor'),
  '[leadership] CA-08: the link still names the hidden counselor calling');
select ok(
  not exists (select 1 from public.org_chart_links() l
              where l.member_call_id in (select c1 from ids union select bf from ids)),
  '[leadership] CA-08: no row carries a counselor member_call_id');
reset role;
delete from public.member_calls where id = (select c1 from ids);
delete from public.member_calls where id = (select bf from ids);
select results_eq(
  $$ select (select count(*)::int from public.high_council_links),
            (select count(*)::int from public.unit_org_links) $$,
  $$ values (0, 0) $$,
  '[leadership] CA-08: removing the counselor callings drops the links');

-- [leadership] CA-09: a hidden high councilor leaves org_chart_links.
-- The link table is reached directly: the counselor calling is gone by now.
insert into public.high_council_units (high_councilor_call_id, unit_id)
select hc, 'icara' from ids on conflict do nothing;
set local role anon;
set local request.jwt.claims to '{"role":"anon"}';
select is((select count(*)::int from public.org_chart_links() where member_call_id = (select hc from ids)), 1,
  '[leadership] CA-09: a visible high councilor shows in org_chart_links');
reset role;
update public.member_calls set org_chart_consent = 'declined' where id = (select hc from ids);
set local role anon;
set local request.jwt.claims to '{"role":"anon"}';
select is((select count(*)::int from public.org_chart_links() where member_call_id = (select hc from ids)), 0,
  '[leadership] CA-09: a hidden high councilor has no row in org_chart_links');

-- [leadership] CA-10: export and account deletion.
reset role;
insert into public.profile_phones (user_id, phone_e164, show_on_org_chart)
values ('00000000-0000-4000-8000-000000000204', '+5548999990204', true);
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-4000-8000-000000000204","role":"authenticated"}';
select is((select public.export_my_data() -> 'phone' ->> 'phone_e164'), '+5548999990204',
  '[leadership] CA-10: the export has the phone');
select is((select (public.export_my_data() -> 'phone' ->> 'show_on_org_chart')::boolean), true,
  '[leadership] CA-10: the export has the switch');
set local request.jwt.claims to '{"sub":"00000000-0000-4000-8000-000000000005","role":"authenticated"}';
select is((select jsonb_typeof(public.export_my_data() -> 'phone')), 'null',
  '[leadership] CA-10: the export phone is null without a phone');
reset role;
delete from auth.users where id = '00000000-0000-4000-8000-000000000204';
select is((select count(*)::int from public.profile_phones
           where user_id = '00000000-0000-4000-8000-000000000204'), 0,
  '[leadership] CA-10: deleting the account deletes the phone');

-- RLS on, grants and signature checks.
select ok(
  (select bool_and(relrowsecurity) from pg_class
   where oid in ('public.profile_phones'::regclass, 'public.high_council_links'::regclass,
                 'public.high_council_units'::regclass, 'public.unit_org_links'::regclass)),
  '[leadership] RNF-01: RLS is on in the four tables');
set local role anon;
set local request.jwt.claims to '{"role":"anon"}';
select throws_ok($$ select public.set_high_councilor_links(gen_random_uuid(), null, '{}') $$, '42501', null,
  '[leadership] RNF-05: anon cannot run set_high_councilor_links');
select throws_ok($$ select public.set_unit_org_counselor('criciuma1', 'primary', null) $$, '42501', null,
  '[leadership] RNF-05: anon cannot run set_unit_org_counselor');
select throws_ok($$ select public.org_chart_counselor_call('estaca', 'stake_first_counselor') $$, '42501', null,
  '[leadership] RNF-05: anon cannot run org_chart_counselor_call');
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-4000-8000-000000000004","role":"authenticated"}';
select throws_ok($$ select public.org_chart_counselor_call('estaca', 'stake_first_counselor') $$, '42501', null,
  '[leadership] RNF-05: nobody runs org_chart_counselor_call');
reset role;
select ok(
  not exists (
    select 1 from pg_proc p, unnest(p.proargnames) n
    where p.oid = 'public.org_chart_links()'::regprocedure and n in ('email', 'user_id', 'phone')),
  '[leadership] RNF-03: org_chart_links has no e-mail, user_id or phone');

select * from finish();
rollback;
