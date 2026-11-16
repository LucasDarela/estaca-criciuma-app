-- Local seed: fictitious accounts only (no real member data). Units come from a migration.

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
) values
  ('00000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'membro@exemplo.org', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''),
  ('00000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'publicador.icara@exemplo.org', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''),
  ('00000000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'bispo.criciuma1@exemplo.org', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''),
  ('00000000-0000-4000-8000-000000000004', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'estaca@exemplo.org', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''),
  ('00000000-0000-4000-8000-000000000005', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin@exemplo.org', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '');

insert into auth.identities (
  id, provider, provider_id, user_id, identity_data, last_sign_in_at, created_at, updated_at
)
select
  gen_random_uuid(), 'email', u.id::text, u.id,
  jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
  now(), now(), now()
from auth.users u
where u.email like '%@exemplo.org';

insert into public.profiles (id, display_name, home_unit_id, consented_at) values
  ('00000000-0000-4000-8000-000000000001', 'Ana Exemplo', null, now()),
  ('00000000-0000-4000-8000-000000000002', 'Bruno Exemplo', 'icara', now()),
  ('00000000-0000-4000-8000-000000000003', 'Carlos Exemplo', 'criciuma1', now()),
  ('00000000-0000-4000-8000-000000000004', 'Daniela Exemplo', 'criciuma3', now()),
  ('00000000-0000-4000-8000-000000000005', 'Eduardo Exemplo', 'criciuma1', now());

-- memberships keeps only the admin; every other access is a calling (RF-24).
insert into public.memberships (user_id, unit_id, role, granted_by) values
  ('00000000-0000-4000-8000-000000000005', 'estaca', 'admin', null);

insert into public.member_calls (user_id, unit_id, calling_id, granted_by, org_chart_consent) values
  ('00000000-0000-4000-8000-000000000002', 'icara', 'relief_society_president', null, 'pending'),
  ('00000000-0000-4000-8000-000000000003', 'criciuma1', 'bishop', null, 'pending'),
  ('00000000-0000-4000-8000-000000000004', 'estaca', 'stake_first_counselor', null, 'pending');

insert into public.role_grants_log (action, user_id, unit_id, role, calling_id, actor_id)
select 'granted', user_id, unit_id, role, null::text, null::uuid from public.memberships
union all
select 'granted', mc.user_id, mc.unit_id, c.access, mc.calling_id, null::uuid
from public.member_calls mc join public.calling_catalog c on c.id = mc.calling_id;

-- Fictitious events around the current month in Sao Paulo (spec calendar). Offsets are relative so the
-- seed stays useful whenever the database is reset: mo = month offset, d = day of month (1-28),
-- ed = end day (same as d for single-day events).
insert into public.events (unit_id, type, title, starts_at, ends_at, location, notes, links, created_by)
select
  v.unit_id, v.type, v.title,
  (b.m + make_interval(months => v.mo, days => v.d - 1) + v.st) at time zone 'America/Sao_Paulo',
  (b.m + make_interval(months => v.mo, days => v.ed - 1) + v.et) at time zone 'America/Sao_Paulo',
  v.location, v.notes, v.links, v.created_by
from (select date_trunc('month', now() at time zone 'America/Sao_Paulo') as m) b,
(values
  (-1, 10, 10, time '19:00', time '21:30', 'criciuma1', 'activity', 'Jantar de confraternização', 'Salão da Ala Criciúma 1', '', '{}'::text[], null::uuid),
  (-1, 14, 14, time '20:00', time '21:30', 'icara', 'meeting', 'Reunião do conselho de ala', 'Capela de Içara', '', '{}', null),
  (-1, 20, 20, time '09:00', time '12:00', 'ararangua', 'training', 'Treinamento de líderes', 'Capela de Araranguá', '', '{}', null),
  (-1, 24, 24, time '12:00', time '14:00', 'ramoGaivota', 'activity', 'Almoço do ramo', '', '', '{}', null),
  (0, 12, 12, time '05:00', time '07:00', 'criciuma1', 'meeting', 'Reunião matinal dos presidentes', 'Capela Criciúma 1', '', '{}', null),
  (0, 13, 13, time '15:00', time '17:00', 'icara', 'activity', 'Serviço comunitario', 'Praça central de Içara', '', '{}', null),
  (0, 14, 16, time '18:00', time '12:00', 'criciuma3', 'caravan', 'Caravana ao Templo', 'Saída da Capela Criciúma 3',
    'Levar recomendação do templo em vigor, documento com foto e lanche. Retorno na segunda-feira, por volta do meio-dia.',
    array['https://example.org/caravana', 'https://example.org/templo'], null),
  (0, 15, 15, time '09:00', time '12:00', 'estaca', 'conference', 'Conferência de Estaca', 'Centro de Estaca Criciúma',
    'Sessão única para toda a estaca. Chegue com 15 minutos de antecedência.',
    array['https://example.org/conferencia', 'https://example.org/transmissao'], '00000000-0000-4000-8000-000000000004'),
  (0, 18, 18, time '18:00', time '19:00', 'estaca', 'meeting', 'Reunião da presidência da estaca', 'Centro de Estaca Criciúma', '', '{}', null),
  (0, 18, 18, time '19:00', time '20:30', 'criciuma2', 'activity', 'Noite familiar', 'Capela Criciúma 2', '', '{}', null),
  (0, 18, 18, time '19:30', time '21:00', 'ararangua', 'training', 'Treinamento de professores', 'Capela de Araranguá', '', '{}', null),
  (0, 18, 18, time '20:00', time '21:30', 'icara', 'meeting', 'Conselho da Ala Içara', 'Capela de Içara', '', '{}', null),
  (0, 22, 22, time '19:00', time '21:30', 'criciuma2', 'activity', 'Noite de jogos', 'Salão da Ala Criciúma 2', '', '{}', null),
  (0, 25, 25, time '09:00', time '11:30', 'criciuma1', 'training', 'Treinamento de secretários', 'Capela Criciúma 1', '', '{}', null),
  (0, 27, 27, time '10:00', time '11:00', 'ramoGaivota', 'meeting', 'Reunião do ramo', '', '', '{}', null),
  (1, 6, 6, time '19:00', time '20:30', 'estaca', 'activity', 'Devocional da estaca', 'Centro de Estaca Criciúma', '', '{}', null),
  (1, 9, 9, time '10:00', time '12:00', 'criciuma1', 'conference', 'Conferência de ala', 'Capela Criciúma 1', '', '{}', null),
  (1, 13, 13, time '06:00', time '20:00', 'icara', 'caravan', 'Caravana ao templo', 'Saída da Capela de Içara', '', '{}', null),
  (1, 16, 16, time '20:00', time '21:00', 'ararangua', 'meeting', 'Reunião de liderança', '', '', '{}', null),
  (1, 20, 20, time '14:00', time '17:00', 'ramoGaivota', 'activity', 'Gincana do ramo', 'Praia da Gaivota', '', '{}', null)
) as v(mo, d, ed, st, et, unit_id, type, title, location, notes, links, created_by);
