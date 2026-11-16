begin;
create extension if not exists pgtap with schema extensions;
select plan(87);

-- Seed users (see supabase/seed.sql):
--   ...001 membro, ...002 publicador (icara), ...003 bispo (criciuma1), ...004 estaca, ...005 admin
-- Tokens below are fictitious.

-- Fixtures, created as the table owner (past RLS).
insert into public.push_devices (token, user_id, platform, locale, units) values
  ('ExponentPushToken[aaaaaaaaaaaaaaaaaaaaaa]', null, 'ios', 'pt-BR', '{estaca}'),
  ('ExponentPushToken[bbbbbbbbbbbbbbbbbbbbbb]', null, 'android', 'pt-BR', '{estaca}');

insert into public.notifications (id, kind, item_id, unit_id, audience, title, body, event_starts_at, created_at) values
  ('10000000-0000-4000-8000-000000000001', 'event', gen_random_uuid(), 'estaca', '{all}', 'Para A', '', now(), now() - interval '1 day'),
  ('10000000-0000-4000-8000-000000000002', 'event', gen_random_uuid(), 'estaca', '{all}', 'Para B', '', now(), now() - interval '1 day'),
  ('10000000-0000-4000-8000-000000000003', 'event', gen_random_uuid(), 'estaca', '{all}', 'Para ambos', '', now(), now() - interval '2 days');
insert into public.notification_deliveries (notification_id, device_token, user_id) values
  ('10000000-0000-4000-8000-000000000001', 'ExponentPushToken[aaaaaaaaaaaaaaaaaaaaaa]', null),
  ('10000000-0000-4000-8000-000000000002', 'ExponentPushToken[bbbbbbbbbbbbbbbbbbbbbb]', null),
  ('10000000-0000-4000-8000-000000000003', 'ExponentPushToken[aaaaaaaaaaaaaaaaaaaaaa]', null),
  ('10000000-0000-4000-8000-000000000003', 'ExponentPushToken[bbbbbbbbbbbbbbbbbbbbbb]', null);

select ok(
  (select bool_and(relrowsecurity) from pg_class
    where oid in ('public.push_devices'::regclass, 'public.push_register_attempts'::regclass,
                  'public.notifications'::regclass, 'public.notification_deliveries'::regclass,
                  'public.notification_reads'::regclass)),
  'RLS enabled on the five push tables');

-- CA-01: visitor A reads only its own deliveries; direct reads are denied; no token comes back.
set local role anon;
set local request.jwt.claims to '{"role":"anon"}';
select results_eq(
  $$ select title from public.my_notifications('ExponentPushToken[aaaaaaaaaaaaaaaaaaaaaa]') order by title collate "C" $$,
  $$ values ('Para A'::text), ('Para ambos') $$,
  'CA-01: A receives only its own deliveries');
select results_eq(
  $$ select title from public.my_notifications('ExponentPushToken[bbbbbbbbbbbbbbbbbbbbbb]') order by title collate "C" $$,
  $$ values ('Para B'::text), ('Para ambos') $$,
  'CA-01: B receives only its own deliveries');
select is_empty(
  $$ select 1 from public.my_notifications('ExponentPushToken[cccccccccccccccccccccc]') $$,
  'CA-01: an unknown token has no history');
select is_empty(
  $$ select 1 from public.my_notifications(null) $$,
  'CA-01: a null token without account has no history');
select is(
  (select string_agg(to_jsonb(n)::text, '') like '%ExponentPushToken%'
     from public.my_notifications('ExponentPushToken[aaaaaaaaaaaaaaaaaaaaaa]') n),
  false, 'CA-01: no returned column contains a token');
select ok(
  (select array_agg(a.attname::text order by a.attnum) from pg_proc p
     join lateral unnest(p.proargnames) with ordinality as a(attname, attnum) on true
     where p.proname = 'my_notifications' and a.attname::text like '%token%') = array['p_device_token'],
  'CA-01: the only token-like name in my_notifications is its input');
select throws_ok($$ select * from public.push_devices $$, '42501', null, 'CA-01: anon cannot read push_devices');
select throws_ok($$ select * from public.notifications $$, '42501', null, 'CA-01: anon cannot read notifications');
select throws_ok($$ select * from public.notification_deliveries $$, '42501', null, 'CA-01: anon cannot read notification_deliveries');
select throws_ok($$ select * from public.push_register_attempts $$, '42501', null, 'anon cannot read push_register_attempts');

set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}';
select throws_ok($$ select * from public.push_devices $$, '42501', null, 'CA-01: authenticated cannot read push_devices');
select throws_ok($$ select * from public.notifications $$, '42501', null, 'CA-01: authenticated cannot read notifications');
select throws_ok($$ select * from public.notification_deliveries $$, '42501', null, 'CA-01: authenticated cannot read notification_deliveries');
select throws_ok(
  $$ select public.push_register_device('ExponentPushToken[dddddddddddddddddddddd]', null, 'ios', 'pt-BR', repeat('a', 64)) $$,
  '42501', null, 'anon and authenticated cannot execute push_register_device');
select throws_ok($$ select public.push_cleanup() $$, '42501', null, 'authenticated cannot execute push_cleanup');

-- CA-02: a visitor registers with units {estaca} and no account.
reset role;
select is(
  public.push_register_device('ExponentPushToken[eeeeeeeeeeeeeeeeeeeeee]', null, 'ios', 'pt-BR', repeat('1', 64)),
  'registered', 'CA-02: a visitor registers');
select results_eq(
  $$ select user_id, units from public.push_devices where token = 'ExponentPushToken[eeeeeeeeeeeeeeeeeeeeee]' $$,
  $$ values (null::uuid, '{estaca}'::text[]) $$,
  'CA-02: visitor device has units {estaca} and no user');

-- CA-03: the same token signs in (home unit icara), keeps units on a later call, and signs out.
select is(
  public.push_register_device('ExponentPushToken[eeeeeeeeeeeeeeeeeeeeee]', '00000000-0000-4000-8000-000000000002', 'ios', 'pt-BR', repeat('1', 64)),
  'registered', 'CA-03: the device registers again, now with an account');
select results_eq(
  $$ select user_id, units from public.push_devices where token = 'ExponentPushToken[eeeeeeeeeeeeeeeeeeeeee]' $$,
  $$ values ('00000000-0000-4000-8000-000000000002'::uuid, '{estaca}'::text[]) $$,
  'CA-03: the token gets user_id and keeps the units chosen as visitor');
select is(
  public.push_register_device('ExponentPushToken[ffffffffffffffffffffff]', '00000000-0000-4000-8000-000000000002', 'android', 'en-US', repeat('2', 64)),
  'registered', 'RF-03: a new device with account registers');
select results_eq(
  $$ select units from public.push_devices where token = 'ExponentPushToken[ffffffffffffffffffffff]' $$,
  $$ values ('{estaca,icara}'::text[]) $$,
  'RF-03: a new device of a person with home unit icara gets {estaca,icara}');
select public.push_register_device('ExponentPushToken[eeeeeeeeeeeeeeeeeeeeee]', null, 'ios', 'pt-BR', repeat('1', 64));
select results_eq(
  $$ select user_id, units from public.push_devices where token = 'ExponentPushToken[eeeeeeeeeeeeeeeeeeeeee]' $$,
  $$ values (null::uuid, '{estaca}'::text[]) $$,
  'CA-03: signing out sets user_id back to null and keeps units');
select is(
  public.push_register_device('ExponentPushToken[gggggggggggggggggggggg]', '00000000-0000-4000-8000-0000000000ff', 'ios', 'pt-BR', repeat('3', 64)),
  'registered', 'a user without profile registers as visitor');
select is((select user_id from public.push_devices where token = 'ExponentPushToken[gggggggggggggggggggggg]'),
  null::uuid, 'a user without profile leaves user_id null');
select throws_ok(
  $$ select public.push_register_device('not-a-token', null, 'ios', 'pt-BR', repeat('4', 64)) $$,
  'P0001', 'invalid_token', 'an invalid token is rejected');
select throws_ok(
  $$ select public.push_register_device('ExponentPushToken[hhhhhhhhhhhhhhhhhhhhhh]', null, 'web', 'pt-BR', repeat('4', 64)) $$,
  'P0001', 'invalid_platform', 'an invalid platform is rejected');
select throws_ok(
  $$ select public.push_register_device('ExponentPushToken[hhhhhhhhhhhhhhhhhhhhhh]', null, 'ios', 'fr-FR', repeat('4', 64)) $$,
  'P0001', 'invalid_locale', 'an invalid locale is rejected');

-- Deliveries made as visitor become the person's when the device signs in.
insert into public.notification_deliveries (notification_id, device_token, user_id)
values ('10000000-0000-4000-8000-000000000001', 'ExponentPushToken[ffffffffffffffffffffff]', null);
select public.push_register_device('ExponentPushToken[ffffffffffffffffffffff]', '00000000-0000-4000-8000-000000000002', 'android', 'en-US', repeat('2', 64));
select is(
  (select user_id from public.notification_deliveries
    where notification_id = '10000000-0000-4000-8000-000000000001' and device_token = 'ExponentPushToken[ffffffffffffffffffffff]'),
  '00000000-0000-4000-8000-000000000002'::uuid, 'visitor deliveries pass to the account on sign-in');

-- CA-04: 10 registrations from one IP in an hour, the 11th is rate limited.
select is(
  (select count(*)::int from generate_series(1, 10) g
    where public.push_register_device('ExponentPushToken[iiiiiiiiiiiiiiii' || lpad(g::text, 6, '0') || ']', null, 'ios', 'pt-BR', repeat('9', 64)) = 'registered'),
  10, 'CA-04: ten registrations from one ip hash succeed');
select is(
  public.push_register_device('ExponentPushToken[jjjjjjjjjjjjjjjjjjjjjj]', null, 'ios', 'pt-BR', repeat('9', 64)),
  'rate_limited', 'CA-04: the eleventh registration is rate limited');
select is((select count(*)::int from public.push_devices where token = 'ExponentPushToken[jjjjjjjjjjjjjjjjjjjjjj]'),
  0, 'CA-04: a rate limited call stores nothing');

-- CA-18: set_device_units dedupes, orders by units.sort_order and rejects unknown units.
set local role anon;
set local request.jwt.claims to '{"role":"anon"}';
select lives_ok(
  $$ select public.set_device_units('ExponentPushToken[aaaaaaaaaaaaaaaaaaaaaa]', '{icara,estaca,icara}') $$,
  'CA-18: set_device_units accepts a valid list');
select is(public.my_device_units('ExponentPushToken[aaaaaaaaaaaaaaaaaaaaaa]'), '{estaca,icara}'::text[],
  'CA-18: units are stored deduplicated, in unit order');
select throws_ok(
  $$ select public.set_device_units('ExponentPushToken[aaaaaaaaaaaaaaaaaaaaaa]', '{estaca,foo}') $$,
  'P0001', 'invalid_units', 'CA-18: an invalid unit is rejected');
select throws_ok(
  $$ select public.set_device_units('ExponentPushToken[zzzzzzzzzzzzzzzzzzzzzz]', '{estaca}') $$,
  'P0001', 'device_not_found', 'set_device_units rejects an unknown token');
select is(public.my_device_units('ExponentPushToken[zzzzzzzzzzzzzzzzzzzzzz]'), null::text[],
  'my_device_units is null for an unknown token');

-- CA-20: a person updates their own organizations, including the 6th one.
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}';
select lives_ok(
  $$ update public.profiles set organizations = '{primary,temple_family_history}' where id = '00000000-0000-4000-8000-000000000001' $$,
  'CA-20: organizations accept primary and temple_family_history');
select throws_ok(
  $$ update public.profiles set organizations = '{foo}' where id = '00000000-0000-4000-8000-000000000001' $$,
  '23514', null, 'CA-20: an unknown organization violates the constraint');

-- notification_reads: own rows only. 001 receives a notification through its user_id.
reset role;
insert into public.notification_deliveries (notification_id, device_token, user_id)
values ('10000000-0000-4000-8000-000000000001', 'ExponentPushToken[eeeeeeeeeeeeeeeeeeeeee]', '00000000-0000-4000-8000-000000000001');
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}';
select lives_ok(
  $$ insert into public.notification_reads (notification_id, user_id)
     values ('10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001') $$,
  'a person inserts their own read');
select throws_ok(
  $$ insert into public.notification_reads (notification_id, user_id)
     values ('10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002') $$,
  '42501', null, 'a person cannot insert a read for someone else');
select throws_ok(
  $$ update public.notification_reads set read_at = now() $$,
  '42501', null, 'reads have no update');
select is((select count(*)::int from public.notification_reads), 1, 'a person reads only their own reads');

-- mark_notifications_read(null) marks only what the person received.
select is(
  (select count(*)::int from public.my_notifications(null) where not read), 0,
  'the notification of 001 is already read');
set local request.jwt.claims to '{"sub":"00000000-0000-4000-8000-000000000004","role":"authenticated"}';
select is((select count(*)::int from public.my_notifications(null)), 0, 'another person receives nothing');
select lives_ok($$ select public.mark_notifications_read(null) $$, 'mark_notifications_read(null) runs');
select is((select count(*)::int from public.notification_reads), 0,
  'mark_notifications_read(null) marks only what the person received');
set local role anon;
set local request.jwt.claims to '{"role":"anon"}';
select throws_ok($$ select public.mark_notifications_read(null) $$, '42501', null,
  'anon cannot execute mark_notifications_read');

-- export_my_data carries the devices without the token.
reset role;
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-4000-8000-000000000002","role":"authenticated"}';
select is(
  (select jsonb_array_length(public.export_my_data() -> 'push_devices')), 1,
  'export_my_data lists the person devices');
select is(
  (select public.export_my_data()::text like '%ExponentPushToken%'), false,
  'export_my_data never contains a token');

-- CA-21: the daily job.
reset role;
insert into public.notifications (id, kind, item_id, unit_id, audience, title, event_starts_at, created_at) values
  ('20000000-0000-4000-8000-000000000091', 'event', gen_random_uuid(), 'estaca', '{all}', 'Velha', now(), now() - interval '91 days'),
  ('20000000-0000-4000-8000-000000000089', 'event', gen_random_uuid(), 'estaca', '{all}', 'Recente', now(), now() - interval '89 days');
insert into public.notification_deliveries (notification_id, device_token) values
  ('20000000-0000-4000-8000-000000000091', 'ExponentPushToken[aaaaaaaaaaaaaaaaaaaaaa]'),
  ('20000000-0000-4000-8000-000000000089', 'ExponentPushToken[aaaaaaaaaaaaaaaaaaaaaa]');
insert into public.notification_reads (notification_id, user_id)
values ('20000000-0000-4000-8000-000000000091', '00000000-0000-4000-8000-000000000001');
insert into public.push_devices (token, platform, locale, units, last_seen_at)
values ('ExponentPushToken[kkkkkkkkkkkkkkkkkkkkkk]', 'ios', 'pt-BR', '{estaca}', now() - interval '181 days');
select public.push_cleanup();
select is(
  (select count(*)::int from public.notifications where id = '20000000-0000-4000-8000-000000000091'), 0,
  'CA-21: the 91 day notification is deleted');
select is(
  (select (select count(*) from public.notification_deliveries where notification_id = '20000000-0000-4000-8000-000000000091')
        + (select count(*) from public.notification_reads where notification_id = '20000000-0000-4000-8000-000000000091'))::int,
  0, 'CA-21: its deliveries and reads go with it');
select is(
  (select count(*)::int from public.notifications where id = '20000000-0000-4000-8000-000000000089'), 1,
  'CA-21: the 89 day notification stays');
select is(
  (select count(*)::int from public.push_devices where token = 'ExponentPushToken[kkkkkkkkkkkkkkkkkkkkkk]'), 0,
  'RNF-04: a device unseen for 181 days is removed');
select ok(exists (select 1 from cron.job where jobname = 'push-cleanup'),
  'CA-21: the push-cleanup job is scheduled');

-- T-02: recipients and sending. Clean slate for devices; events are created here.
reset role;
truncate public.push_devices cascade;
truncate public.notifications cascade;
insert into public.events (id, unit_id, type, title, starts_at, ends_at, location) values
  ('30000000-0000-4000-8000-000000000001', 'icara', 'activity', 'Evento de Icara', '2026-11-21T18:00Z', '2026-11-21T19:00Z', 'Capela de Icara'),
  ('30000000-0000-4000-8000-000000000002', 'criciuma1', 'activity', 'Evento de Criciuma 1', '2026-11-21T18:00Z', '2026-11-21T19:00Z', 'Capela 1'),
  ('30000000-0000-4000-8000-000000000003', 'estaca', 'activity', 'Evento da Estaca', '2026-11-21T18:00Z', '2026-11-21T19:00Z', 'Centro de Estaca');

-- CA-09: visitor, member with primary, bishop with a bishoprics calling, member of criciuma1 only.
update public.profiles set organizations = '{primary}' where id in
  ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000005');
insert into public.push_devices (token, user_id, platform, locale, units) values
  ('ExponentPushToken[visitor0000000000000000]', null, 'ios', 'pt-BR', '{estaca}'),
  ('ExponentPushToken[member00000000000000000]', '00000000-0000-4000-8000-000000000001', 'ios', 'pt-BR', '{estaca}'),
  ('ExponentPushToken[bishop000000000000000000]', '00000000-0000-4000-8000-000000000003', 'android', 'en-US', '{estaca}'),
  ('ExponentPushToken[ward1only00000000000000]', '00000000-0000-4000-8000-000000000005', 'ios', 'pt-BR', '{criciuma1}');
select results_eq(
  $$ select token from public.push_recipients('estaca', '{primary,bishoprics}') order by token $$,
  $$ values ('ExponentPushToken[bishop000000000000000000]'::text), ('ExponentPushToken[member00000000000000000]') $$,
  'CA-09: the member with primary and the bishop receive; the visitor and the criciuma1-only member do not');

-- CA-10: a visitor subscribed to icara receives 'all' of icara.
insert into public.push_devices (token, user_id, platform, locale, units) values
  ('ExponentPushToken[visitoricara00000000000]', null, 'android', 'es-MX', '{icara}');
select results_eq(
  $$ select token from public.push_recipients('icara', '{all}') order by token $$,
  $$ values ('ExponentPushToken[visitoricara00000000000]'::text) $$,
  'CA-10: the visitor subscribed to icara receives all');
select is_empty(
  $$ select 1 from public.push_recipients('icara', '{primary}') $$,
  'a visitor never receives a targeted audience');

-- leaders: 002 (publisher of icara) and 003 (bishop of criciuma1), both subscribed to all three.
insert into public.push_devices (token, user_id, platform, locale, units) values
  ('ExponentPushToken[leadericara0000000000000]', '00000000-0000-4000-8000-000000000002', 'ios', 'pt-BR', '{estaca,criciuma1,icara}'),
  ('ExponentPushToken[leaderward10000000000000]', '00000000-0000-4000-8000-000000000003', 'ios', 'pt-BR', '{estaca,criciuma1,icara}');
select results_eq(
  $$ select token from public.push_recipients('icara', '{leaders}') order by token $$,
  $$ values ('ExponentPushToken[leadericara0000000000000]'::text) $$,
  'leaders: a unit item reaches only leaders of that unit');
select results_eq(
  $$ select token from public.push_recipients('estaca', '{leaders}') order by token $$,
  $$ values ('ExponentPushToken[bishop000000000000000000]'::text), ('ExponentPushToken[leadericara0000000000000]'),
            ('ExponentPushToken[leaderward10000000000000]') $$,
  'leaders: a stake item reaches leaders of any unit');
select results_eq(
  $$ select token from public.push_recipients('icara', '{bishoprics,relief_society_presidency}') order by token $$,
  $$ values ('ExponentPushToken[leadericara0000000000000]'::text) $$,
  'a notify group in a unit item only counts in the same unit');
select results_eq(
  $$ select token from public.push_recipients('estaca', '{bishoprics}') order by token $$,
  $$ values ('ExponentPushToken[bishop000000000000000000]'::text), ('ExponentPushToken[leaderward10000000000000]') $$,
  'a notify group in a stake item counts in any unit');
update public.profiles set organizations = '{relief_society}' where id = '00000000-0000-4000-8000-000000000002';
select is(
  (select count(*)::int from public.push_recipients('icara', '{relief_society,relief_society_presidency,leaders,all}')
    where token = 'ExponentPushToken[leadericara0000000000000]'),
  1, 'a device matching several criteria appears once');

-- Permissions and validation of push_prepare.
select throws_ok(
  $$ select public.push_prepare('00000000-0000-4000-8000-000000000002', 'event', '30000000-0000-4000-8000-000000000002',
       '{all}', 'T', '', now(), 'L') $$,
  'P0001', 'forbidden', 'CA-12: a publisher of icara cannot notify for criciuma1');
select throws_ok(
  $$ select public.push_prepare(null, 'event', '30000000-0000-4000-8000-000000000001', '{all}', 'T', '', now(), 'L') $$,
  'P0001', 'forbidden', 'no actor is forbidden');
select throws_ok(
  $$ select public.push_prepare('00000000-0000-4000-8000-000000000002', 'event', '30000000-0000-4000-8000-000000000001',
       '{}', 'T', '', now(), 'L') $$,
  'P0001', 'invalid_audience', 'an empty audience is invalid');
select throws_ok(
  $$ select public.push_prepare('00000000-0000-4000-8000-000000000002', 'event', '30000000-0000-4000-8000-000000000001',
       '{stake_presidency}', 'T', '', now(), 'L') $$,
  'P0001', 'invalid_audience', 'stake_presidency is invalid for a unit item');
select throws_ok(
  $$ select public.push_prepare('00000000-0000-4000-8000-000000000002', 'event', '30000000-0000-4000-8000-000000000001',
       '{foo}', 'T', '', now(), 'L') $$,
  'P0001', 'invalid_audience', 'an unknown audience key is invalid');
select throws_ok(
  $$ select public.push_prepare('00000000-0000-4000-8000-000000000002', 'post', gen_random_uuid(), '{all}', 'T', 'b', null, null) $$,
  'P0001', 'unsupported_kind', 'a post is unsupported until the board spec');
select throws_ok(
  $$ select public.push_prepare('00000000-0000-4000-8000-000000000002', 'event', gen_random_uuid(), '{all}', 'T', '', now(), 'L') $$,
  'P0001', 'item_not_found', 'an unknown event is not found');
select throws_ok($$ select public.push_item('post', gen_random_uuid()) $$, 'P0001', 'unsupported_kind',
  'push_item rejects post');

-- CA-13 and the stored data. The actor 002 publishes for icara; the stake admin 004 for the stake item.
create temp table prepared as
  select public.push_prepare('00000000-0000-4000-8000-000000000002', 'event', '30000000-0000-4000-8000-000000000001',
    '{all}', 'Evento de Icara', '', '2026-11-21T18:00Z', 'Capela de Icara') as j;
select is(
  (select count(*)::int from public.notification_deliveries
    where notification_id = ((select j from prepared) ->> 'notification_id')::uuid),
  jsonb_array_length((select j from prepared) -> 'recipients'),
  'push_prepare stores one delivery per recipient');
select is(jsonb_array_length((select j from prepared) -> 'recipients'), 3,
  'push_prepare returns the recipients (icara subscribers)');
select results_eq(
  $$ select unit_id, kind, event_starts_at, event_location, sent_by, audience from public.notifications
     where id = ((select j from prepared) ->> 'notification_id')::uuid $$,
  $$ values ('icara'::text, 'event'::text, '2026-11-21T18:00Z'::timestamptz, 'Capela de Icara'::text,
             '00000000-0000-4000-8000-000000000002'::uuid, '{all}'::text[]) $$,
  'push_prepare stores the event time, location, sender and audience');
select ok(not ((select j from prepared)::text like '%"user_id"%'), 'push_prepare returns only token and locale');
select throws_ok(
  $$ select public.push_prepare('00000000-0000-4000-8000-000000000002', 'event', '30000000-0000-4000-8000-000000000001',
       '{all}', 'Evento de Icara', '', '2026-11-21T18:00Z', 'Capela de Icara') $$,
  'P0001', 'rate_limited', 'CA-13: a second send of the same item is rate limited');
select lives_ok(
  $$ select public.push_prepare('00000000-0000-4000-8000-000000000004', 'event', '30000000-0000-4000-8000-000000000003',
       '{all}', 'Evento da Estaca', '', '2026-11-21T18:00Z', 'Centro de Estaca') $$,
  'CA-13: another item is not limited');
select lives_ok(
  $$ select public.push_discard(((select j from prepared) ->> 'notification_id')::uuid) $$,
  'push_discard runs');
select is(
  (select count(*)::int from public.notification_deliveries
    where notification_id = ((select j from prepared) ->> 'notification_id')::uuid), 0,
  'push_discard removes the deliveries too');
select lives_ok(
  $$ select public.push_prepare('00000000-0000-4000-8000-000000000002', 'event', '30000000-0000-4000-8000-000000000001',
       '{all}', 'Evento de Icara', '', '2026-11-21T18:00Z', 'Capela de Icara') $$,
  'CA-13: after push_discard the item can be sent again');

-- CA-14: removing reported tokens.
select lives_ok(
  $$ select public.push_remove_devices('{"ExponentPushToken[visitor0000000000000000]"}') $$, 'push_remove_devices runs');
select is((select count(*)::int from public.push_devices where token = 'ExponentPushToken[visitor0000000000000000]'), 0,
  'CA-14: the reported token is removed');
select is((select count(*)::int from public.push_devices where token = 'ExponentPushToken[member00000000000000000]'), 1,
  'CA-14: other tokens stay');

-- Only the service role runs the send functions.
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-4000-8000-000000000002","role":"authenticated"}';
select throws_ok(
  $$ select public.push_prepare('00000000-0000-4000-8000-000000000002', 'event', '30000000-0000-4000-8000-000000000001',
       '{all}', 'T', '', now(), 'L') $$,
  '42501', null, 'authenticated cannot execute push_prepare');
select throws_ok($$ select * from public.push_recipients('icara', '{all}') $$, '42501', null,
  'authenticated cannot execute push_recipients');
select throws_ok($$ select public.push_remove_devices('{x}') $$, '42501', null,
  'authenticated cannot execute push_remove_devices');
select throws_ok($$ select public.push_discard(gen_random_uuid()) $$, '42501', null,
  'authenticated cannot execute push_discard');
reset role;

select * from finish();
rollback;
