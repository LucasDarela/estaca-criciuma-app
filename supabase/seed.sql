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
