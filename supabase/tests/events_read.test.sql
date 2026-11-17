begin;
create extension if not exists pgtap with schema extensions;
select plan(10);

-- The org chart demo seed (supabase/seeds/org_chart_demo.sql) is not part of these fixtures.
delete from auth.users where email like 'organograma.%@exemplo.org';

select ok(
  (select relrowsecurity from pg_class where oid = 'public.events'::regclass),
  'RNF-01: RLS enabled on events');

-- CA-01: anon reads the seed and cannot write.
set local role anon;
set local request.jwt.claims to '{"role":"anon"}';
select cmp_ok((select count(*)::int from public.events), '>=', 20, 'CA-01: anon reads the seeded events');
select throws_ok(
  $$ insert into public.events (unit_id, type, title, starts_at, ends_at)
     values ('icara', 'activity', 'X', now(), now() + interval '1 hour') $$,
  '42501', null, 'CA-01: anon cannot insert into events');

-- authenticated reads too and has no write policy either.
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}';
select cmp_ok((select count(*)::int from public.events), '>=', 20, 'CA-01: member reads the seeded events');
select throws_ok(
  $$ insert into public.events (unit_id, type, title, starts_at, ends_at)
     values ('icara', 'activity', 'X', now(), now() + interval '1 hour') $$,
  '42501', null, 'CA-01: member cannot insert into events');

-- Constraints (checked as the table owner, past RLS).
reset role;
select throws_ok(
  $$ insert into public.events (unit_id, type, title, starts_at, ends_at)
     values ('icara', 'activity', 'X', '2026-11-13T12:00Z', '2026-11-13T12:00Z') $$,
  '23514', 'new row for relation "events" violates check constraint "events_ends_after_starts"',
  'CA-02: ends_at <= starts_at violates events_ends_after_starts');
select throws_ok(
  $$ insert into public.events (unit_id, type, title, starts_at, ends_at, links)
     values ('icara', 'activity', 'X', now(), now() + interval '1 hour', array['http://example.org']) $$,
  '23514', null, 'RF-01: an http:// link is rejected');
select throws_ok(
  $$ insert into public.events (unit_id, type, title, starts_at, ends_at, links)
     values ('icara', 'activity', 'X', now(), now() + interval '1 hour',
       array['https://a.org','https://b.org','https://c.org','https://d.org','https://e.org','https://f.org']) $$,
  '23514', null, 'RF-01: six links are rejected');
select throws_ok(
  $$ insert into public.events (unit_id, type, title, starts_at, ends_at)
     values ('icara', 'activity', '   ', now(), now() + interval '1 hour') $$,
  '23514', null, 'RF-01: a blank title is rejected');
select lives_ok(
  $$ insert into public.events (unit_id, type, title, starts_at, ends_at, links)
     values ('icara', 'activity', 'Ok', now(), now() + interval '1 hour', array['https://example.org']) $$,
  'RF-01: a valid event with an https link is accepted');

select * from finish();
rollback;
