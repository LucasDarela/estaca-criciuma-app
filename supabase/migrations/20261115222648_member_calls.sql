-- roles-of-leadership: callings held by people (RF-08), permissions derived from them (RF-09),
-- the RPCs that replace the role-based ones (RF-12 to RF-19), the data migration (RF-23)
-- and the public org chart function (RF-18). Same names and signatures for the permission
-- functions, so every existing RLS policy keeps working.

create table public.member_calls (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  unit_id text not null references public.units (id),
  calling_id text not null references public.calling_catalog (id),
  granted_by uuid null references public.profiles (id) on delete set null,
  granted_at timestamptz not null default now(),
  -- null when the calling has no org chart section (RF-08)
  org_chart_consent text null check (org_chart_consent in ('pending', 'accepted', 'declined')),
  org_chart_consent_at timestamptz null,
  unique (user_id, unit_id, calling_id)
);
create index member_calls_calling_idx on public.member_calls (calling_id);

alter table public.member_calls enable row level security;
-- Own rows; stake_leader and admin read all (they manage access). No write policy.
create policy member_calls_select on public.member_calls for select to authenticated
  using (user_id = auth.uid() or is_stake_leader() or is_admin());
revoke insert, update, delete, truncate on public.member_calls from anon, authenticated;
revoke select on public.member_calls from anon;

alter table public.role_grants_log add column calling_id text null;

-- RF-23: pure mapping from the old "role + group" to a calling. Kept after the migration and
-- tested by pgTAP; not callable by the app. A unit_leader whose group is not "bishops" (the old
-- "presidents" group, which the spec does not map) also becomes unit_clerk, so the access survives.
create function public.legacy_role_to_calling(p_role text, p_group text, p_unit_kind text)
returns text
language sql immutable set search_path = public as $$
  select case
    when p_role = 'stake_leader' and p_group = 'stake_presidency' then 'stake_first_counselor'
    when p_role = 'stake_leader' then 'high_councilor'
    when p_role = 'unit_leader' and p_group = 'bishops' and p_unit_kind = 'ward' then 'bishop'
    when p_role = 'unit_leader' and p_group = 'bishops' and p_unit_kind = 'branch' then 'branch_president'
    when p_role = 'unit_leader' then 'unit_clerk'
    when p_role = 'unit_publisher' then 'unit_activities_committee_chair'
    else null
  end;
$$;
revoke all on function public.legacy_role_to_calling(text, text, text) from public, anon, authenticated;

-- RF-23: convert the old memberships. Everything except the admin becomes a calling.
insert into public.member_calls
  (user_id, unit_id, calling_id, granted_by, granted_at, org_chart_consent)
select m.user_id, m.unit_id, c.id, m.granted_by, m.granted_at,
       case when c.org_chart_section is not null then 'pending' end
from public.memberships m
join public.units u on u.id = m.unit_id
join public.calling_catalog c
  on c.id = public.legacy_role_to_calling(m.role, m.leadership_group, u.kind)
where m.role <> 'admin';

insert into public.role_grants_log (action, user_id, unit_id, role, calling_id, actor_id)
select 'granted', mc.user_id, mc.unit_id, c.access, mc.calling_id, null
from public.member_calls mc join public.calling_catalog c on c.id = mc.calling_id;

-- Only the rows that were converted are deleted: an unmapped row would make the constraint
-- below fail, loudly, instead of silently losing somebody's access.
delete from public.memberships m
using public.units u
where u.id = m.unit_id and m.role <> 'admin'
  and public.legacy_role_to_calling(m.role, m.leadership_group, u.kind) is not null;

alter table public.memberships drop column leadership_group;
alter table public.memberships add constraint memberships_admin_only check (role = 'admin');

-- RF-09: permission functions. security definer (bypass RLS, no policy recursion), stable,
-- fixed search_path. my_accesses is a private helper (execute revoked from the API roles).
create function public.my_accesses() returns table (unit_id text, access text)
language sql stable security definer set search_path = public as $$
  select mc.unit_id, c.access
  from member_calls mc join calling_catalog c on c.id = mc.calling_id
  where mc.user_id = auth.uid() and c.active and c.access <> 'none';
$$;
revoke all on function public.my_accesses() from public, anon, authenticated;

create or replace function public.has_role(p_unit text, p_roles text[]) returns boolean
language sql stable security definer set search_path = public as $$
  select (p_unit = 'estaca' and 'admin' = any (p_roles) and is_admin())
      or exists (
        select 1 from my_accesses() a where a.unit_id = p_unit and a.access = any (p_roles));
$$;

create or replace function public.is_stake_leader() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from my_accesses() a where a.access = 'stake_leader');
$$;

create function public.is_stake_publisher() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from my_accesses() a where a.access = 'stake_publisher');
$$;

create or replace function public.can_publish(p_unit text) returns boolean
language sql stable security definer set search_path = public as $$
  select has_role(p_unit, array['unit_leader', 'unit_publisher'])
      or is_stake_leader()
      or (p_unit = 'estaca' and is_stake_publisher())
      or is_admin();
$$;

-- is_admin and can_lead keep their bodies (admin is still in memberships; RN-04 still holds).

-- Decision 20 of auth-account, now on callings (RF-11): the home unit cannot become "none"
-- while the person has any calling or is admin, and it cannot change while they hold a calling
-- of a unit. A trigger, so it also covers complete_welcome and direct API updates.
create or replace function public.profiles_guard_home_unit() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.home_unit_id is distinct from old.home_unit_id then
    if (new.home_unit_id is null and (
          exists (select 1 from member_calls mc where mc.user_id = old.id)
          or exists (select 1 from memberships m where m.user_id = old.id)))
       or exists (
         select 1 from member_calls mc join calling_catalog c on c.id = mc.calling_id
         where mc.user_id = old.id and c.level <> 'stake') then
      raise exception 'home_unit_locked' using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;

-- RF-21, RF-22: the {n} in the messages. Admin only.
create function public.calling_holder_count(p_id text) returns int
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = 'P0001'; end if;
  if not is_admin() then raise exception 'not_authorized' using errcode = 'P0001'; end if;
  return (select count(*)::int from member_calls mc where mc.calling_id = p_id);
end;
$$;

-- RF-06, RF-07: save_calling, now with the checks that depend on who holds the calling.
create or replace function public.save_calling(
  p_id text, p_name_pt text, p_name_en text, p_name_es text, p_level text, p_access text,
  p_notify_group text, p_org_chart_section text, p_active boolean)
returns text
language plpgsql security definer set search_path = public as $$
declare
  v_id text := p_id;
  v_name_pt text := nullif(btrim(coalesce(p_name_pt, '')), '');
  v_name_en text := nullif(btrim(coalesce(p_name_en, '')), '');
  v_name_es text := nullif(btrim(coalesce(p_name_es, '')), '');
  v_active boolean := coalesce(p_active, true);
  v_holders int := 0;
  v_old public.calling_catalog%rowtype;
  v_new public.calling_catalog%rowtype;
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = 'P0001'; end if;
  if not is_admin() then raise exception 'not_authorized' using errcode = 'P0001'; end if;

  if v_name_pt is null or char_length(v_name_pt) not between 2 and 80
     or char_length(coalesce(v_name_en, '')) > 80 or char_length(coalesce(v_name_es, '')) > 80 then
    raise exception 'invalid_name' using errcode = 'P0001';
  end if;
  if p_level is null or p_level not in ('stake', 'ward', 'branch', 'ward_branch') then
    raise exception 'invalid_level' using errcode = 'P0001';
  end if;
  if p_access is null or p_access not in
       ('none', 'unit_publisher', 'unit_leader', 'stake_publisher', 'stake_leader')
     or (p_access in ('stake_publisher', 'stake_leader') and p_level <> 'stake')
     or (p_access in ('unit_publisher', 'unit_leader') and p_level = 'stake') then
    raise exception 'invalid_access' using errcode = 'P0001';
  end if;
  if p_org_chart_section is not null and (
       p_org_chart_section not in ('stake_presidency', 'high_council', 'stake_clerks',
         'stake_organizations', 'bishopric', 'unit_clerks', 'unit_organizations')
       or (p_org_chart_section in ('stake_presidency', 'high_council', 'stake_clerks',
         'stake_organizations')) <> (p_level = 'stake')) then
    raise exception 'invalid_section' using errcode = 'P0001';
  end if;
  if p_notify_group is not null and p_notify_group not in ('stake_presidency', 'high_council',
       'bishoprics', 'elders_quorum_presidency', 'relief_society_presidency',
       'young_women_presidency', 'primary_presidency', 'sunday_school_presidency', 'clerks',
       'missionaries', 'temple_family_history_workers', 'music', 'young_single_adult_leaders') then
    raise exception 'invalid_notify_group' using errcode = 'P0001';
  end if;

  if exists (
    select 1 from calling_catalog c
    where c.level = p_level and lower(c.name_pt) = lower(v_name_pt) and c.id <> coalesce(v_id, '')) then
    raise exception 'name_taken' using errcode = 'P0001';
  end if;

  if v_id is not null then
    select * into v_old from calling_catalog c where c.id = v_id for update;
    if not found then raise exception 'not_found' using errcode = 'P0001'; end if;

    select count(*)::int into v_holders from member_calls mc where mc.calling_id = v_id;
    if v_holders > 0 and v_old.level <> p_level then
      raise exception 'level_locked' using errcode = 'P0001';
    end if;
    if v_holders > 0 and not v_active then
      raise exception 'in_use' using errcode = 'P0001';
    end if;

    update calling_catalog c set
      name_pt = v_name_pt, name_en = v_name_en, name_es = v_name_es, level = p_level,
      access = p_access, notify_group = p_notify_group, org_chart_section = p_org_chart_section,
      active = v_active, updated_by = auth.uid()
    where c.id = v_id
    returning * into v_new;

    -- A section appearing never publishes anybody: holders who were never asked become pending.
    if v_old.org_chart_section is null and p_org_chart_section is not null then
      update member_calls mc set org_chart_consent = 'pending'
      where mc.calling_id = v_id and mc.org_chart_consent is null;
    end if;
  else
    v_id := gen_random_uuid()::text;
    insert into calling_catalog (id, name_pt, name_en, name_es, level, access, notify_group,
      org_chart_section, sort_order, active, updated_by)
    values (v_id, v_name_pt, v_name_en, v_name_es, p_level, p_access, p_notify_group,
      p_org_chart_section, (select coalesce(max(c.sort_order), 0) + 10 from calling_catalog c),
      v_active, auth.uid())
    returning * into v_new;
  end if;

  insert into calling_catalog_log (calling_id, actor_id, before, after)
  values (v_id, auth.uid(),
          case when v_old.id is null then null else to_jsonb(v_old) end, to_jsonb(v_new));
  return v_id;
end;
$$;

-- RF-13, RF-15, RF-10, RNF-05. Returns the id of the new member_calls row.
create function public.grant_calling(p_email text, p_unit_id text, p_calling_id text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_target uuid;
  v_home text;
  v_calling public.calling_catalog%rowtype;
  v_kind text;
  v_new uuid;
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = 'P0001'; end if;
  if not (is_stake_leader() or is_admin()) then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;

  select p.id, p.home_unit_id into v_target, v_home
  from profiles p join auth.users au on au.id = p.id
  where lower(au.email) = lower(btrim(coalesce(p_email, '')));
  if v_target is null then raise exception 'no_account' using errcode = 'P0001'; end if;

  select * into v_calling from calling_catalog c where c.id = p_calling_id and c.active;
  if not found then raise exception 'invalid_calling' using errcode = 'P0001'; end if;

  if v_home is null then raise exception 'no_home_unit' using errcode = 'P0001'; end if;

  select u.kind into v_kind from units u where u.id = p_unit_id;
  if v_kind is null or not (
       (v_calling.level = 'stake' and v_kind = 'stake')
       or (v_calling.level = 'ward' and v_kind = 'ward')
       or (v_calling.level = 'branch' and v_kind = 'branch')
       or (v_calling.level = 'ward_branch' and v_kind in ('ward', 'branch'))) then
    raise exception 'invalid_unit_for_calling' using errcode = 'P0001';
  end if;
  if v_calling.level <> 'stake' and p_unit_id <> v_home then
    raise exception 'wrong_unit' using errcode = 'P0001';
  end if;

  begin
    insert into member_calls (user_id, unit_id, calling_id, granted_by, org_chart_consent)
    values (v_target, p_unit_id, p_calling_id, auth.uid(),
            case when v_calling.org_chart_section is not null then 'pending' end)
    returning id into v_new;
  exception when unique_violation then
    raise exception 'already_granted' using errcode = 'P0001';
  end;

  insert into role_grants_log (action, user_id, unit_id, role, calling_id, actor_id)
  values ('granted', v_target, p_unit_id, v_calling.access, v_calling.id, auth.uid());
  return v_new;
end;
$$;

-- RF-14, RF-15. The caller is checked before the row is looked up, so a person without
-- permission cannot probe which ids exist.
create function public.revoke_calling(p_member_call_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_target public.member_calls%rowtype;
  v_access text;
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = 'P0001'; end if;
  if not (is_stake_leader() or is_admin()) then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;

  select * into v_target from member_calls mc where mc.id = p_member_call_id;
  if not found then raise exception 'not_found' using errcode = 'P0001'; end if;
  if v_target.user_id = auth.uid() then
    raise exception 'cannot_revoke_self' using errcode = 'P0001';
  end if;

  select c.access into v_access from calling_catalog c where c.id = v_target.calling_id;
  delete from member_calls mc where mc.id = v_target.id;
  insert into role_grants_log (action, user_id, unit_id, role, calling_id, actor_id)
  values ('revoked', v_target.user_id, v_target.unit_id, v_access, v_target.calling_id, auth.uid());
end;
$$;

-- RF-15: "Administração" is separate from callings and only the admin gives or takes it.
create function public.grant_admin(p_email text) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_target uuid;
  v_home text;
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = 'P0001'; end if;
  if not is_admin() then raise exception 'not_authorized' using errcode = 'P0001'; end if;

  select p.id, p.home_unit_id into v_target, v_home
  from profiles p join auth.users au on au.id = p.id
  where lower(au.email) = lower(btrim(coalesce(p_email, '')));
  if v_target is null then raise exception 'no_account' using errcode = 'P0001'; end if;
  if v_home is null then raise exception 'no_home_unit' using errcode = 'P0001'; end if;
  if exists (select 1 from memberships m where m.user_id = v_target and m.role = 'admin') then
    raise exception 'already_granted' using errcode = 'P0001';
  end if;

  insert into memberships (user_id, unit_id, role, granted_by)
  values (v_target, 'estaca', 'admin', auth.uid());
  insert into role_grants_log (action, user_id, unit_id, role, actor_id)
  values ('granted', v_target, 'estaca', 'admin', auth.uid());
end;
$$;

create function public.revoke_admin(p_user_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = 'P0001'; end if;
  if not is_admin() then raise exception 'not_authorized' using errcode = 'P0001'; end if;
  if p_user_id = auth.uid() then raise exception 'cannot_revoke_self' using errcode = 'P0001'; end if;

  if not exists (select 1 from memberships m where m.user_id = p_user_id and m.role = 'admin') then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  delete from memberships m where m.user_id = p_user_id and m.role = 'admin';
  insert into role_grants_log (action, user_id, unit_id, role, actor_id)
  values ('revoked', p_user_id, 'estaca', 'admin', auth.uid());
end;
$$;

drop function public.grant_role(text, text, text, text);
drop function public.revoke_role(uuid);
drop function public.list_access();

-- RF-12: callings and admins, by unit order. Only stake_leader and admin.
create function public.list_access()
returns table (entry_id uuid, kind text, user_id uuid, display_name text, email text, unit_id text,
               calling_id text, calling_name_pt text, calling_name_en text, calling_name_es text)
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = 'P0001'; end if;
  if not (is_stake_leader() or is_admin()) then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;

  return query
    select s.s_entry_id, s.s_kind, s.s_user_id, s.s_display_name, s.s_email, s.s_unit_id,
           s.s_calling_id, s.s_name_pt, s.s_name_en, s.s_name_es
    from (
      select mc.id as s_entry_id, 'calling'::text as s_kind, mc.user_id as s_user_id,
             p.display_name as s_display_name, au.email::text as s_email, mc.unit_id as s_unit_id,
             c.id as s_calling_id, c.name_pt as s_name_pt, c.name_en as s_name_en,
             c.name_es as s_name_es, u.sort_order as s_unit_order
      from member_calls mc
      join profiles p on p.id = mc.user_id
      join auth.users au on au.id = mc.user_id
      join calling_catalog c on c.id = mc.calling_id
      join units u on u.id = mc.unit_id
      union all
      select m.id, 'admin'::text, m.user_id, p.display_name, au.email::text, m.unit_id,
             null::text, null::text, null::text, null::text, u.sort_order
      from memberships m
      join profiles p on p.id = m.user_id
      join auth.users au on au.id = m.user_id
      join units u on u.id = m.unit_id
      where m.role = 'admin'
    ) s
    order by s.s_unit_order, s.s_display_name, s.s_kind;
end;
$$;

-- RF-19. Only the owner of the calling.
create function public.set_org_chart_consent(p_member_call_id uuid, p_accepted boolean)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_section text;
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = 'P0001'; end if;
  if p_accepted is null then raise exception 'invalid_consent' using errcode = 'P0001'; end if;

  select c.org_chart_section into v_section
  from member_calls mc join calling_catalog c on c.id = mc.calling_id
  where mc.id = p_member_call_id and mc.user_id = auth.uid();
  if not found then raise exception 'not_found' using errcode = 'P0001'; end if;
  if v_section is null then raise exception 'invalid_calling' using errcode = 'P0001'; end if;

  update member_calls mc set
    org_chart_consent = case when p_accepted then 'accepted' else 'declined' end,
    org_chart_consent_at = now()
  where mc.id = p_member_call_id;
end;
$$;

-- RF-18, RNF-03. Public. Never returns e-mail, user_id or phone.
create function public.org_chart_members()
returns table (member_call_id uuid, unit_id text, section text, calling_id text,
               calling_name_pt text, calling_name_en text, calling_name_es text,
               display_name text, sort_order int)
language sql stable security definer set search_path = public as $$
  select mc.id, mc.unit_id, c.org_chart_section, c.id, c.name_pt, c.name_en, c.name_es,
         p.display_name, c.sort_order
  from member_calls mc
  join calling_catalog c on c.id = mc.calling_id
  join profiles p on p.id = mc.user_id
  where c.active and c.org_chart_section is not null and mc.org_chart_consent = 'accepted'
  order by c.sort_order, p.display_name;
$$;

-- RNF-06: export gains `calls`; `memberships` now holds only the admin row.
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
      where mc.user_id = auth.uid()), '[]'::jsonb)
  ) into result;
  return result;
end;
$$;

revoke all on function public.is_stake_publisher() from public, anon;
revoke all on function public.calling_holder_count(text) from public, anon;
revoke all on function public.grant_calling(text, text, text) from public, anon;
revoke all on function public.revoke_calling(uuid) from public, anon;
revoke all on function public.grant_admin(text) from public, anon;
revoke all on function public.revoke_admin(uuid) from public, anon;
revoke all on function public.list_access() from public, anon;
revoke all on function public.set_org_chart_consent(uuid, boolean) from public, anon;
revoke all on function public.org_chart_members() from public;

grant execute on function public.is_stake_publisher() to anon, authenticated;
grant execute on function public.calling_holder_count(text) to authenticated;
grant execute on function public.grant_calling(text, text, text) to authenticated;
grant execute on function public.revoke_calling(uuid) to authenticated;
grant execute on function public.grant_admin(text) to authenticated;
grant execute on function public.revoke_admin(uuid) to authenticated;
grant execute on function public.list_access() to authenticated;
grant execute on function public.set_org_chart_consent(uuid, boolean) to authenticated;
grant execute on function public.org_chart_members() to anon, authenticated;
