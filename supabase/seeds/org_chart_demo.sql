-- Local seed: a fictitious, complete org chart (spec leadership, section 10). Loaded after seed.sql.
-- It only uses new accounts (organograma.NN@exemplo.org), so the five base accounts and the
-- pgTAP fixtures keep their numbers; every pgTAP file removes these accounts inside its own
-- transaction. The base stake_first_counselor (estaca@exemplo.org) and the bishop of criciuma1
-- (bispo.criciuma1@exemplo.org) stay `pending`, so the org chart shows only their labels.

-- One DO block: `supabase db reset` sends each statement on its own, so a temp table would be gone.
do $seed$
begin
create temp table demo_people (nn int primary key, first_name text, unit_id text, calling_id text)
  on commit drop;
insert into demo_people (nn, first_name, unit_id, calling_id) values
  (1, 'Antônio', 'estaca', 'stake_president'),
  (2, 'Bernardo', 'estaca', 'stake_second_counselor'),
  (3, 'Caetano', 'estaca', 'high_councilor'),
  (4, 'Dionísio', 'estaca', 'high_councilor'),
  (5, 'Evaristo', 'estaca', 'high_councilor'),
  (6, 'Floriano', 'estaca', 'high_councilor'),
  (7, 'Gumercindo', 'estaca', 'high_councilor'),
  (8, 'Heitor', 'estaca', 'high_councilor'),
  (9, 'Ildefonso', 'estaca', 'stake_executive_secretary'),
  (10, 'Josué', 'estaca', 'stake_clerk'),
  (11, 'Leopoldo', 'estaca', 'stake_patriarch'),
  (12, 'Marta', 'estaca', 'stake_relief_society_president'),
  (13, 'Noemi', 'estaca', 'stake_young_women_president'),
  (14, 'Odete', 'estaca', 'stake_primary_president'),
  (15, 'Plínio', 'estaca', 'stake_young_men_president'),
  (16, 'Quirino', 'estaca', 'stake_sunday_school_president'),
  (17, 'Raimundo', 'criciuma1', 'bishopric_first_counselor'),
  (18, 'Sebastião', 'criciuma1', 'bishopric_second_counselor'),
  (19, 'Tobias', 'criciuma1', 'unit_executive_secretary'),
  (20, 'Ubirajara', 'criciuma1', 'unit_clerk'),
  (21, 'Valdemar', 'criciuma1', 'elders_quorum_president'),
  (22, 'Wanda', 'criciuma1', 'relief_society_president'),
  (23, 'Ximena', 'criciuma1', 'young_women_president'),
  (24, 'Yolanda', 'criciuma1', 'primary_president'),
  (25, 'Zélia', 'criciuma1', 'sunday_school_president'),
  (26, 'Abílio', 'criciuma1', 'unit_mission_leader'),
  (27, 'Belmiro', 'ramoGaivota', 'branch_president'),
  (28, 'Cirilo', 'ramoGaivota', 'branch_first_counselor'),
  (29, 'Davi', 'ramoGaivota', 'branch_second_counselor');

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
)
select
  ('00000000-0000-4000-8000-0000000001' || lpad(d.nn::text, 2, '0'))::uuid,
  '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  'organograma.' || lpad(d.nn::text, 2, '0') || '@exemplo.org', '', now(),
  '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''
from demo_people d;

insert into auth.identities (
  id, provider, provider_id, user_id, identity_data, last_sign_in_at, created_at, updated_at
)
select
  gen_random_uuid(), 'email', u.id::text, u.id,
  jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
  now(), now(), now()
from auth.users u
where u.email like 'organograma.%@exemplo.org';

insert into public.profiles (id, display_name, home_unit_id, consented_at)
select
  ('00000000-0000-4000-8000-0000000001' || lpad(d.nn::text, 2, '0'))::uuid,
  d.first_name || ' Demonstração', null, now()
from demo_people d;

insert into public.member_calls (user_id, unit_id, calling_id, granted_by, org_chart_consent)
select
  ('00000000-0000-4000-8000-0000000001' || lpad(d.nn::text, 2, '0'))::uuid,
  d.unit_id, d.calling_id, null, 'accepted'
from demo_people d;

-- Phones: the president and 4 high councilors show a mobile; one shows a landline; one hides it.
insert into public.profile_phones (user_id, phone_e164, show_on_org_chart)
select ('00000000-0000-4000-8000-0000000001' || lpad(p.nn::text, 2, '0'))::uuid, p.phone, p.shown
from (values
  (1, '+5548999990001', true),
  (3, '+5548999990003', true),
  (4, '+5548999990004', true),
  (5, '+5548999990005', true),
  (6, '+5548999990006', true),
  (7, '+554833330001', true),
  (8, '+5548999990099', false)
) as p(nn, phone, shown);

-- Links. 3 high councilors follow the base first counselor and 3 follow the second counselor;
-- each one follows one unit. In Criciuma 1, Elders Quorum and Relief Society go to the first
-- counselor, Young Women and Primary to the second; Sunday School has no link.
insert into public.high_council_links (high_councilor_call_id, counselor_call_id)
select hc.id, c.id
from (values
  (3, '00000000-0000-4000-8000-000000000004'::uuid, 'stake_first_counselor'),
  (4, '00000000-0000-4000-8000-000000000004'::uuid, 'stake_first_counselor'),
  (5, '00000000-0000-4000-8000-000000000004'::uuid, 'stake_first_counselor'),
  (6, '00000000-0000-4000-8000-000000000102'::uuid, 'stake_second_counselor'),
  (7, '00000000-0000-4000-8000-000000000102'::uuid, 'stake_second_counselor'),
  (8, '00000000-0000-4000-8000-000000000102'::uuid, 'stake_second_counselor')
) as l(nn, counselor_user, counselor_calling)
join public.member_calls hc
  on hc.user_id = ('00000000-0000-4000-8000-0000000001' || lpad(l.nn::text, 2, '0'))::uuid
 and hc.calling_id = 'high_councilor'
join public.member_calls c on c.user_id = l.counselor_user and c.calling_id = l.counselor_calling;

insert into public.high_council_units (high_councilor_call_id, unit_id)
select hc.id, l.unit_id
from (values
  (3, 'criciuma1'), (4, 'criciuma2'), (5, 'criciuma3'),
  (6, 'icara'), (7, 'ararangua'), (8, 'ramoGaivota')
) as l(nn, unit_id)
join public.member_calls hc
  on hc.user_id = ('00000000-0000-4000-8000-0000000001' || lpad(l.nn::text, 2, '0'))::uuid
 and hc.calling_id = 'high_councilor';

insert into public.unit_org_links (unit_id, organization, counselor_call_id)
select 'criciuma1', l.organization, c.id
from (values
  ('elders_quorum', 17), ('relief_society', 17), ('young_women', 18), ('primary', 18)
) as l(organization, nn)
join public.member_calls c
  on c.user_id = ('00000000-0000-4000-8000-0000000001' || lpad(l.nn::text, 2, '0'))::uuid;
end
$seed$;
