-- leadership: personal phone (RF-02, RF-03), supervision links of the org chart (RF-04 to RF-07)
-- and the phone in the data export (RF-08).

-- RF-02, RNF-01, RNF-04. Only the owner reads it; the app writes through set_my_phone.
create table public.profile_phones (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  phone_e164 text not null check (phone_e164 ~ '^\+55[1-9][0-9][0-9]{8,9}$'),
  show_on_org_chart boolean not null default false,
  updated_at timestamptz not null default now()
);
alter table public.profile_phones enable row level security;
revoke all on public.profile_phones from anon;

create policy profile_phones_select_own on public.profile_phones for select to authenticated
  using (user_id = auth.uid());
create policy profile_phones_insert_own on public.profile_phones for insert to authenticated
  with check (user_id = auth.uid());
create policy profile_phones_update_own on public.profile_phones for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy profile_phones_delete_own on public.profile_phones for delete to authenticated
  using (user_id = auth.uid());

-- RF-04. Supervision links: a high councilor follows one stake counselor and 0..n units; a ward or
-- branch counselor follows organizations. They point to member_calls, so they go away with the calling.
create table public.high_council_links (
  high_councilor_call_id uuid primary key references public.member_calls (id) on delete cascade,
  counselor_call_id uuid not null references public.member_calls (id) on delete cascade,
  updated_by uuid null references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now()
);
create index high_council_links_counselor_idx on public.high_council_links (counselor_call_id);

create table public.high_council_units (
  high_councilor_call_id uuid not null references public.member_calls (id) on delete cascade,
  unit_id text not null references public.units (id),
  updated_by uuid null references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (high_councilor_call_id, unit_id)
);

create table public.unit_org_links (
  unit_id text not null references public.units (id),
  organization text not null check (organization in
    ('elders_quorum', 'relief_society', 'young_women', 'primary', 'sunday_school')),
  counselor_call_id uuid not null references public.member_calls (id) on delete cascade,
  updated_by uuid null references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (unit_id, organization)
);
create index unit_org_links_counselor_idx on public.unit_org_links (counselor_call_id);

-- RNF-01. No policy on the link tables: only the security definer functions below reach them.
alter table public.high_council_links enable row level security;
alter table public.high_council_units enable row level security;
alter table public.unit_org_links enable row level security;
revoke all on public.high_council_links, public.high_council_units, public.unit_org_links
  from anon, authenticated;

-- RF-02. The only way the app writes a phone.
create function public.set_my_phone(p_phone_e164 text, p_show boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = 'P0001'; end if;

  if p_phone_e164 is null then
    delete from profile_phones where user_id = auth.uid();
    return;
  end if;
  if p_phone_e164 !~ '^\+55[1-9][0-9][0-9]{8,9}$' then
    raise exception 'invalid_phone' using errcode = 'P0001';
  end if;

  insert into profile_phones (user_id, phone_e164, show_on_org_chart, updated_at)
  values (auth.uid(), p_phone_e164, coalesce(p_show, false), now())
  on conflict (user_id) do update set
    phone_e164 = excluded.phone_e164,
    show_on_org_chart = excluded.show_on_org_chart,
    updated_at = now();
end;
$$;

-- RF-03, RNF-02. Only people with an account; only phones the owner chose to show, and only for
-- callings that are visible in the org chart.
create function public.org_chart_phones() returns table (member_call_id uuid, phone_e164 text)
language sql stable security definer set search_path = public as $$
  select m.member_call_id, pp.phone_e164
  from org_chart_members() m
  join member_calls mc on mc.id = m.member_call_id
  join profile_phones pp on pp.user_id = mc.user_id and pp.show_on_org_chart;
$$;

-- Private helper. Who holds the calling in the unit; with more than one, the oldest granted_at.
create function public.org_chart_counselor_call(p_unit_id text, p_calling_id text) returns uuid
language sql stable security definer set search_path = public as $$
  select mc.id from member_calls mc
  where mc.unit_id = p_unit_id and mc.calling_id = p_calling_id
  order by mc.granted_at, mc.id
  limit 1;
$$;

-- RF-05, RNF-05.
create function public.set_high_councilor_links(
  p_high_councilor_call_id uuid, p_counselor_calling_id text, p_unit_ids text[]) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_counselor uuid;
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = 'P0001'; end if;
  if not is_stake_leader() then raise exception 'forbidden' using errcode = 'P0001'; end if;

  if not exists (
    select 1 from member_calls mc join calling_catalog c on c.id = mc.calling_id
    where mc.id = p_high_councilor_call_id and mc.unit_id = 'estaca'
      and c.org_chart_section = 'high_council'
  ) then raise exception 'not_found' using errcode = 'P0001'; end if;

  if p_counselor_calling_id is not null then
    if p_counselor_calling_id not in ('stake_first_counselor', 'stake_second_counselor') then
      raise exception 'invalid_counselor' using errcode = 'P0001';
    end if;
    v_counselor := org_chart_counselor_call('estaca', p_counselor_calling_id);
    if v_counselor is null then raise exception 'no_counselor' using errcode = 'P0001'; end if;
  end if;

  if exists (
    select 1 from unnest(coalesce(p_unit_ids, '{}'::text[])) as x(id)
    where not exists (select 1 from units u where u.id = x.id and u.kind in ('ward', 'branch'))
  ) then raise exception 'invalid_unit' using errcode = 'P0001'; end if;

  if p_counselor_calling_id is null then
    delete from high_council_links where high_councilor_call_id = p_high_councilor_call_id;
  else
    insert into high_council_links (high_councilor_call_id, counselor_call_id, updated_by, updated_at)
    values (p_high_councilor_call_id, v_counselor, auth.uid(), now())
    on conflict (high_councilor_call_id) do update set
      counselor_call_id = excluded.counselor_call_id,
      updated_by = excluded.updated_by,
      updated_at = excluded.updated_at;
  end if;

  delete from high_council_units where high_councilor_call_id = p_high_councilor_call_id;
  insert into high_council_units (high_councilor_call_id, unit_id, updated_by)
  select distinct p_high_councilor_call_id, x.id, auth.uid()
  from unnest(coalesce(p_unit_ids, '{}'::text[])) as x(id);
end;
$$;

-- RF-06, RNF-05.
create function public.set_unit_org_counselor(
  p_unit_id text, p_organization text, p_counselor_calling_id text) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_kind text;
  v_counselor uuid;
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = 'P0001'; end if;

  select u.kind into v_kind from units u where u.id = p_unit_id and u.kind in ('ward', 'branch');
  if v_kind is null then raise exception 'invalid_unit' using errcode = 'P0001'; end if;
  if not can_lead(p_unit_id) then raise exception 'forbidden' using errcode = 'P0001'; end if;

  if p_organization is null or p_organization not in
    ('elders_quorum', 'relief_society', 'young_women', 'primary', 'sunday_school') then
    raise exception 'invalid_organization' using errcode = 'P0001';
  end if;

  if p_counselor_calling_id is not null then
    if p_counselor_calling_id <> all (case v_kind
         when 'ward' then array['bishopric_first_counselor', 'bishopric_second_counselor']
         else array['branch_first_counselor', 'branch_second_counselor'] end) then
      raise exception 'invalid_counselor' using errcode = 'P0001';
    end if;
    v_counselor := org_chart_counselor_call(p_unit_id, p_counselor_calling_id);
    if v_counselor is null then raise exception 'no_counselor' using errcode = 'P0001'; end if;
  end if;

  if p_counselor_calling_id is null then
    delete from unit_org_links where unit_id = p_unit_id and organization = p_organization;
  else
    insert into unit_org_links (unit_id, organization, counselor_call_id, updated_by, updated_at)
    values (p_unit_id, p_organization, v_counselor, auth.uid(), now())
    on conflict (unit_id, organization) do update set
      counselor_call_id = excluded.counselor_call_id,
      updated_by = excluded.updated_by,
      updated_at = excluded.updated_at;
  end if;
end;
$$;

-- RF-07, RNF-03. Public. Never returns the counselor's member_call_id, user_id, e-mail or phone.
-- A high councilor appears only while visible in the org chart.
create function public.org_chart_links()
returns table (kind text, unit_id text, member_call_id uuid, organization text,
               counselor_calling_id text, target_unit_id text)
language sql stable security definer set search_path = public as $$
  with hc as (select m.member_call_id from org_chart_members() m where m.section = 'high_council')
  select 'high_council_counselor'::text, 'estaca'::text, hl.high_councilor_call_id, null::text,
         c.calling_id, null::text
  from high_council_links hl
  join hc on hc.member_call_id = hl.high_councilor_call_id
  join member_calls c on c.id = hl.counselor_call_id
  union all
  select 'high_council_unit', 'estaca', hu.high_councilor_call_id, null, null, hu.unit_id
  from high_council_units hu
  join hc on hc.member_call_id = hu.high_councilor_call_id
  union all
  select 'unit_org_counselor', ul.unit_id, null, ul.organization, c.calling_id, null
  from unit_org_links ul
  join member_calls c on c.id = ul.counselor_call_id;
$$;

-- RF-08: the export carries the phone (null without one).
create or replace function public.export_my_data() returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  result jsonb;
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = 'P0001'; end if;

  select jsonb_build_object(
    'exported_at', now(),
    'account', jsonb_build_object(
      'email', (select au.email::text from auth.users au where au.id = auth.uid())),
    'profile', (
      select jsonb_build_object(
        'display_name', p.display_name,
        'home_unit_id', p.home_unit_id,
        'locale', p.locale,
        'organizations', to_jsonb(p.organizations),
        'consented_at', p.consented_at,
        'created_at', p.created_at,
        'updated_at', p.updated_at)
      from profiles p where p.id = auth.uid()),
    'memberships', coalesce((
      select jsonb_agg(jsonb_build_object(
        'unit_id', m.unit_id,
        'role', m.role,
        'granted_at', m.granted_at) order by u.sort_order, m.role)
      from memberships m join units u on u.id = m.unit_id
      where m.user_id = auth.uid()), '[]'::jsonb),
    'calls', coalesce((
      select jsonb_agg(jsonb_build_object(
        'unit_id', mc.unit_id,
        'calling_id', mc.calling_id,
        'calling_name', c.name_pt,
        'org_chart_consent', mc.org_chart_consent,
        'granted_at', mc.granted_at) order by u.sort_order, c.sort_order)
      from member_calls mc
      join calling_catalog c on c.id = mc.calling_id
      join units u on u.id = mc.unit_id
      where mc.user_id = auth.uid()), '[]'::jsonb),
    'push_devices', coalesce((
      select jsonb_agg(jsonb_build_object(
        'platform', d.platform,
        'locale', d.locale,
        'units', to_jsonb(d.units),
        'last_seen_at', d.last_seen_at,
        'created_at', d.created_at) order by d.created_at)
      from push_devices d
      where d.user_id = auth.uid()), '[]'::jsonb),
    'phone', (
      select jsonb_build_object(
        'phone_e164', pp.phone_e164,
        'show_on_org_chart', pp.show_on_org_chart,
        'updated_at', pp.updated_at)
      from profile_phones pp where pp.user_id = auth.uid())
  ) into result;
  return result;
end;
$$;

-- Execute grants. Postgres grants execute to public by default: revoke, then grant on purpose.
revoke all on function public.set_my_phone(text, boolean) from public, anon, authenticated;
revoke all on function public.org_chart_phones() from public, anon, authenticated;
revoke all on function public.org_chart_counselor_call(text, text) from public, anon, authenticated;
revoke all on function public.set_high_councilor_links(uuid, text, text[]) from public, anon, authenticated;
revoke all on function public.set_unit_org_counselor(text, text, text) from public, anon, authenticated;
revoke all on function public.org_chart_links() from public, anon, authenticated;

grant execute on function public.set_my_phone(text, boolean) to authenticated;
grant execute on function public.org_chart_phones() to authenticated;
grant execute on function public.set_high_councilor_links(uuid, text, text[]) to authenticated;
grant execute on function public.set_unit_org_counselor(text, text, text) to authenticated;
grant execute on function public.org_chart_links() to anon, authenticated;
