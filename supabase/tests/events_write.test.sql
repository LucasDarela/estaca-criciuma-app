begin;
create extension if not exists pgtap with schema extensions;
select plan(56);

-- The org chart demo seed (supabase/seeds/org_chart_demo.sql) is not part of these fixtures.
delete from auth.users where email like 'organograma.%@exemplo.org';

-- Seed users (see supabase/seed.sql):
--   ...001 membro, ...002 publicador (icara), ...003 bispo (criciuma1, unit_leader),
--   ...004 estaca (stake_leader), ...005 admin

select ok(
  (select relrowsecurity from pg_class where oid = 'public.meeting_items'::regclass),
  '[event-form] RNF-02: RLS enabled on meeting_items');

-- ---------------------------------------------------------------- publicador.icara (CA-06, CA-21)
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-4000-8000-000000000002","role":"authenticated"}';

select throws_ok(
  $$ insert into public.events (unit_id, type, title, starts_at, ends_at)
     values ('criciuma1', 'activity', 'X', now(), now() + interval '1 hour') $$,
  '42501', null, '[event-form] CA-06: publisher of icara cannot insert directly into criciuma1');
select lives_ok(
  $$ insert into public.events (unit_id, type, title, starts_at, ends_at)
     values ('icara', 'activity', 'Direct', now(), now() + interval '1 hour') $$,
  '[event-form] CA-06: publisher of icara can insert directly into icara');
select throws_ok(
  $$ select public.create_event('e0000000-0000-4000-8000-000000000001', 'criciuma1', 'activity', 'X',
       '2026-11-13T22:30:00Z', '2026-11-14T00:30:00Z', '', '', '{}', '[]') $$,
  'P0001', 'forbidden', '[event-form] CA-06: create_event for criciuma1 is forbidden');

select lives_ok(
  $$ select public.create_event('e0000000-0000-4000-8000-000000000002', 'icara', 'activity', '  Noite cultural ',
       '2026-11-13T22:30:00Z', '2026-11-14T00:30:00Z', ' Capela ', 'notes', array['https://a.org'], null) $$,
  '[event-form] CA-06: create_event for icara works');
select lives_ok(
  $$ select public.create_event('e0000000-0000-4000-8000-000000000002', 'icara', 'activity', 'Noite cultural',
       '2026-11-13T22:30:00Z', '2026-11-14T00:30:00Z', 'Capela', 'notes', array['https://a.org'], null) $$,
  '[event-form] CA-21: create_event retried with the same id does not fail');
reset role;
select is((select count(*)::int from public.events where id = 'e0000000-0000-4000-8000-000000000002'), 1,
  '[event-form] CA-21: the same id creates a single event');
select is((select title || '|' || location from public.events where id = 'e0000000-0000-4000-8000-000000000002'),
  'Noite cultural|Capela', '[event-form] create_event trims title and location');
select is((select starts_at from public.events where id = 'e0000000-0000-4000-8000-000000000002'),
  '2026-11-13T22:30:00Z'::timestamptz, '[event-form] CA-20: 22:30 UTC is stored as given');

set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-4000-8000-000000000002","role":"authenticated"}';
select throws_ok(
  $$ select public.update_event('e0000000-0000-4000-8000-000000000002', 'criciuma1', 'activity', 'N',
       '2026-11-13T22:30:00Z', '2026-11-14T00:30:00Z', '', '', '{}') $$,
  'P0001', 'forbidden', '[event-form] CA-06: update_event cannot move an event to criciuma1');
select throws_ok(
  $$ select public.update_event('e0000000-0000-4000-8000-0000000000ff', 'icara', 'activity', 'N',
       '2026-11-13T22:30:00Z', '2026-11-14T00:30:00Z', '', '', '{}') $$,
  'P0001', 'not_found', '[event-form] update_event of a missing id is not_found');
select throws_ok(
  $$ select public.create_event('e0000000-0000-4000-8000-000000000003', 'icara', 'activity', 'X',
       '2026-11-13T22:30:00Z', '2026-11-14T00:30:00Z', '', '', '{}', '[{"kind":"agenda","text":"A"}]') $$,
  'P0001', 'invalid_items', '[event-form] invalid_items: items on an activity');
select throws_ok(
  $$ select public.create_event('e0000000-0000-4000-8000-000000000003', 'icara', 'meeting', 'X',
       '2026-11-13T22:30:00Z', '2026-11-14T00:30:00Z', '', '', '{}', '[{"kind":"agenda","text":"A"}]') $$,
  'P0001', 'invalid_items', '[event-form] invalid_items: a publisher cannot add items to a meeting');
-- A publisher may create a meeting without items.
select lives_ok(
  $$ select public.create_event('e0000000-0000-4000-8000-000000000004', 'icara', 'meeting', 'Reuniao pub',
       '2026-11-13T22:30:00Z', '2026-11-14T00:30:00Z', '', '', '{}', '[]') $$,
  '[event-form] a publisher creates a meeting without items');

-- ---------------------------------------------------------------- member (RNF-01)
set local request.jwt.claims to '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}';
select lives_ok($$ update public.events set title = 'Hacked' where id = 'e0000000-0000-4000-8000-000000000002' $$,
  '[event-form] RNF-01: a member update matches no rows');
select lives_ok($$ delete from public.events where id = 'e0000000-0000-4000-8000-000000000002' $$,
  '[event-form] RNF-01: a member delete matches no rows');
select throws_ok(
  $$ select public.create_event('e0000000-0000-4000-8000-000000000005', 'icara', 'activity', 'X',
       '2026-11-13T22:30:00Z', '2026-11-14T00:30:00Z', '', '', '{}', '[]') $$,
  'P0001', 'forbidden', '[event-form] RNF-01: a member cannot create_event');
reset role;
select is((select title from public.events where id = 'e0000000-0000-4000-8000-000000000002'),
  'Noite cultural', '[event-form] RNF-01: the event is untouched after the member attempts');

-- CA-21: another user with an existing id.
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-4000-8000-000000000003","role":"authenticated"}';
select throws_ok(
  $$ select public.create_event('e0000000-0000-4000-8000-000000000002', 'criciuma1', 'activity', 'X',
       '2026-11-13T22:30:00Z', '2026-11-14T00:30:00Z', '', '', '{}', '[]') $$,
  'P0001', 'forbidden', '[event-form] CA-21: another user reusing the id is forbidden');

-- ---------------------------------------------------------------- stake leader: icara meeting with items
set local request.jwt.claims to '{"sub":"00000000-0000-4000-8000-000000000004","role":"authenticated"}';
select lives_ok(
  $$ select public.create_event('e0000000-0000-4000-8000-000000000010', 'icara', 'meeting', 'Reuniao icara',
       '2026-10-15T22:30:00Z', '2026-10-16T00:30:00Z', '', '', '{}',
       '[{"kind":"agenda","text":"Oração"},{"kind":"pending","text":"Definir recepção"}]') $$,
  '[event-form] the stake leader creates an icara meeting with items');
select is((select count(*)::int from public.meeting_items), 2, '[event-form] CA-14: the stake leader reads the items');

-- CA-14 / RNF-02: who cannot read.
set local request.jwt.claims to '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}';
select is((select count(*)::int from public.meeting_items), 0, '[event-form] CA-14: a member reads 0 items');
set local request.jwt.claims to '{"sub":"00000000-0000-4000-8000-000000000002","role":"authenticated"}';
select is((select count(*)::int from public.meeting_items), 0, '[event-form] CA-14: the icara publisher reads 0 items');
set local request.jwt.claims to '{"sub":"00000000-0000-4000-8000-000000000005","role":"authenticated"}';
select is((select count(*)::int from public.meeting_items), 0, '[event-form] RNF-02: admin reads 0 items');
set local request.jwt.claims to '{"sub":"00000000-0000-4000-8000-000000000003","role":"authenticated"}';
select is((select count(*)::int from public.meeting_items), 0, '[event-form] CA-14: the criciuma1 leader reads 0 icara items');

-- Writes on items.
set local request.jwt.claims to '{"sub":"00000000-0000-4000-8000-000000000002","role":"authenticated"}';
select throws_ok(
  $$ insert into public.meeting_items (event_id, kind, text)
     values ('e0000000-0000-4000-8000-000000000010', 'agenda', 'X') $$,
  '42501', null, '[event-form] RNF-02: the publisher cannot insert items');
set local request.jwt.claims to '{"sub":"00000000-0000-4000-8000-000000000004","role":"authenticated"}';
select throws_ok(
  $$ update public.meeting_items set text = 'Y' where event_id = 'e0000000-0000-4000-8000-000000000010' $$,
  '42501', null, '[event-form] RNF-02: items cannot be updated, not even by a leader');
select throws_ok(
  $$ insert into public.meeting_items (event_id, kind, text, carried_from_event_id)
     values ('e0000000-0000-4000-8000-000000000010', 'agenda', 'X', 'e0000000-0000-4000-8000-000000000010') $$,
  '42501', null, '[event-form] RNF-02: a client cannot forge carried_from_event_id');
select lives_ok(
  $$ insert into public.meeting_items (event_id, kind, text)
     values ('e0000000-0000-4000-8000-000000000010', 'decision', 'Aprovado') $$,
  '[event-form] CA-16: a leader adds an item directly');
select is(
  (select position from public.meeting_items where text = 'Aprovado'), 2,
  '[event-form] CA-16: the new item goes to the end of the list');
select lives_ok($$ delete from public.meeting_items where text = 'Aprovado' $$,
  '[event-form] CA-16: a leader removes an item');
select is((select count(*)::int from public.meeting_items where text = 'Aprovado'), 0,
  '[event-form] CA-16: the removed item is gone');

-- ---------------------------------------------------------------- bispo criciuma1 (CA-17, CA-18)
set local request.jwt.claims to '{"sub":"00000000-0000-4000-8000-000000000003","role":"authenticated"}';
select lives_ok(
  $$ select public.create_event('e0000000-0000-4000-8000-000000000020', 'criciuma1', 'meeting', 'Conselho da ala',
       '2026-10-15T22:30:00Z', '2026-10-16T00:30:00Z', '', '', '{}',
       '[{"kind":"pending","text":"Definir recepção"},{"kind":"decision","text":"Aprovado"}]') $$,
  '[event-form] CA-17: criciuma1 meeting of 15/10 with a pending item');
select lives_ok(
  $$ select public.create_event('e0000000-0000-4000-8000-000000000021', 'criciuma1', 'meeting', 'conselho da  ALA',
       '2026-11-12T22:30:00Z', '2026-11-13T00:30:00Z', '', '', '{}', '[{"kind":"agenda","text":"Nova"}]') $$,
  '[event-form] CA-17: criciuma1 meeting of 12/11, same series');
select results_eq(
  $$ select kind, text, carried_from_date::text, carried_from_event_id = 'e0000000-0000-4000-8000-000000000020'
     from public.meeting_items where event_id = 'e0000000-0000-4000-8000-000000000021'
     order by position, created_at, id $$,
  $$ values ('agenda'::text, 'Definir recepção'::text, '2026-10-15'::text, true),
            ('agenda'::text, 'Nova'::text, null::text, null::boolean) $$,
  '[event-form] CA-17: carried item first, with its date and origin; form items come after');

-- CA-18: the same name in icara (created by the stake leader) copies nothing from criciuma1.
set local request.jwt.claims to '{"sub":"00000000-0000-4000-8000-000000000004","role":"authenticated"}';
select lives_ok(
  $$ select public.create_event('e0000000-0000-4000-8000-000000000022', 'icara', 'meeting', 'Conselho da ala',
       '2026-11-12T22:30:00Z', '2026-11-13T00:30:00Z', '', '', '{}', '[]') $$,
  '[event-form] CA-18: the same series name in icara');
select is((select count(*)::int from public.meeting_items where event_id = 'e0000000-0000-4000-8000-000000000022'), 0,
  '[event-form] CA-18: nothing is copied from another unit');
set local request.jwt.claims to '{"sub":"00000000-0000-4000-8000-000000000003","role":"authenticated"}';

-- Previous meeting without pending items.
select lives_ok(
  $$ select public.create_event('e0000000-0000-4000-8000-000000000030', 'criciuma1', 'meeting', 'Sem pendencia',
       '2026-10-01T22:30:00Z', '2026-10-02T00:30:00Z', '', '', '{}', '[{"kind":"agenda","text":"Pauta"}]') $$,
  '[event-form] 7.5: previous meeting without pending items');
select lives_ok(
  $$ select public.create_event('e0000000-0000-4000-8000-000000000031', 'criciuma1', 'meeting', 'Sem pendencia',
       '2026-11-01T22:30:00Z', '2026-11-02T00:30:00Z', '', '', '{}', '[]') $$,
  '[event-form] 7.5: next meeting of the series');
select is((select count(*)::int from public.meeting_items where event_id = 'e0000000-0000-4000-8000-000000000031'), 0,
  '[event-form] 7.5: nothing is carried when the previous meeting has no pending items');

-- Two future meetings created in sequence.
select lives_ok(
  $$ select public.create_event('e0000000-0000-4000-8000-000000000040', 'criciuma1', 'meeting', 'Serie X',
       '2026-12-01T22:30:00Z', '2026-12-02T00:30:00Z', '', '', '{}', '[{"kind":"pending","text":"a"}]') $$,
  '[event-form] 7.5: series X, first meeting');
select lives_ok(
  $$ select public.create_event('e0000000-0000-4000-8000-000000000041', 'criciuma1', 'meeting', 'Serie X',
       '2026-12-08T22:30:00Z', '2026-12-09T00:30:00Z', '', '', '{}', '[{"kind":"pending","text":"b"}]') $$,
  '[event-form] 7.5: series X, second meeting');
select lives_ok(
  $$ select public.create_event('e0000000-0000-4000-8000-000000000042', 'criciuma1', 'meeting', 'Serie X',
       '2026-12-15T22:30:00Z', '2026-12-16T00:30:00Z', '', '', '{}', '[]') $$,
  '[event-form] 7.5: series X, third meeting');
select results_eq(
  $$ select text from public.meeting_items where event_id = 'e0000000-0000-4000-8000-000000000042' $$,
  $$ values ('b'::text) $$,
  '[event-form] 7.5: each meeting carries from the most recent previous one');

-- RF-21: renaming never carries again.
select lives_ok(
  $$ select public.update_event('e0000000-0000-4000-8000-000000000042', 'criciuma1', 'meeting', 'Conselho da ala',
       '2026-12-15T22:30:00Z', '2026-12-16T00:30:00Z', '', '', '{}') $$,
  '[event-form] RF-21: renaming a meeting');
select is((select count(*)::int from public.meeting_items where event_id = 'e0000000-0000-4000-8000-000000000042'), 1,
  '[event-form] RF-21: renaming does not copy items again');

-- CA-19: meeting to activity drops the items.
select lives_ok(
  $$ select public.update_event('e0000000-0000-4000-8000-000000000020', 'criciuma1', 'activity', 'Conselho da ala',
       '2026-10-15T22:30:00Z', '2026-10-16T00:30:00Z', '', '', '{}') $$,
  '[event-form] CA-19: a meeting becomes an activity');
reset role;
select is((select count(*)::int from public.meeting_items where event_id = 'e0000000-0000-4000-8000-000000000020'), 0,
  '[event-form] CA-19: its items are gone');

-- CA-13: delete.
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-4000-8000-000000000003","role":"authenticated"}';
select lives_ok($$ select public.delete_event('e0000000-0000-4000-8000-000000000041') $$,
  '[event-form] CA-13: delete_event');
reset role;
select is((select count(*)::int from public.events where id = 'e0000000-0000-4000-8000-000000000041')
        + (select count(*)::int from public.meeting_items where event_id = 'e0000000-0000-4000-8000-000000000041'), 0,
  '[event-form] CA-13: the event and its items are gone');
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-4000-8000-000000000003","role":"authenticated"}';
select throws_ok($$ select public.delete_event('e0000000-0000-4000-8000-0000000000ff') $$,
  'P0001', 'not_found', '[event-form] CA-13: delete of a missing id is not_found');
select throws_ok($$ select public.delete_event('e0000000-0000-4000-8000-000000000002') $$,
  'P0001', 'forbidden', '[event-form] CA-13: delete in another unit is forbidden');

-- ---------------------------------------------------------------- not authenticated
set local request.jwt.claims to '{"role":"authenticated"}';
select throws_ok(
  $$ select public.create_event('e0000000-0000-4000-8000-000000000050', 'icara', 'activity', 'X',
       '2026-11-13T22:30:00Z', '2026-11-14T00:30:00Z', '', '', '{}', '[]') $$,
  'P0001', 'not_authenticated', '[event-form] create_event without a user is not_authenticated');
reset role;
set local role anon;
set local request.jwt.claims to '{"role":"anon"}';
select throws_ok($$ select public.delete_event('e0000000-0000-4000-8000-000000000002') $$, '42501', null,
  '[event-form] anon has no execute on delete_event');
select throws_ok(
  $$ select public.update_event('e0000000-0000-4000-8000-000000000002', 'icara', 'activity', 'X',
       now(), now() + interval '1 hour', '', '', '{}') $$,
  '42501', null, '[event-form] anon has no execute on update_event');
select throws_ok(
  $$ select public.create_event('e0000000-0000-4000-8000-000000000050', 'icara', 'activity', 'X',
       now(), now() + interval '1 hour', '', '', '{}', '[]') $$,
  '42501', null, '[event-form] anon has no execute on create_event');

select * from finish();
rollback;
