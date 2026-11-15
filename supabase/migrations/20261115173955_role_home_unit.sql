-- auth-account (QA, decisions 19 and 20): who may receive a role, and when the home unit is locked.
--
-- RF-16a: every role needs the person's home unit to be informed; unit_leader and unit_publisher
-- can only be granted in that unit. stake_leader and admin accept any home unit.
create or replace function public.grant_role(
  p_email text, p_unit_id text, p_role text, p_leadership_group text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  target_id uuid;
  target_home text;
  new_id uuid;
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = 'P0001'; end if;
  if not (is_stake_leader() or is_admin()) then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;
  if p_role = 'admin' and not is_admin() then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;
  if p_role is null
     or p_role not in ('unit_leader', 'unit_publisher', 'stake_leader', 'admin')
     or p_unit_id is null
     or not exists (select 1 from units u where u.id = p_unit_id)
     or (p_role in ('stake_leader', 'admin')) <> (p_unit_id = 'estaca') then
    raise exception 'invalid_unit_for_role' using errcode = 'P0001';
  end if;
  if p_leadership_group is not null and not (
       (p_leadership_group = 'stake_presidency' and p_unit_id = 'estaca')
       or (p_leadership_group in ('bishops', 'presidents') and p_unit_id <> 'estaca')) then
    raise exception 'invalid_group' using errcode = 'P0001';
  end if;

  select p.id, p.home_unit_id into target_id, target_home
  from profiles p join auth.users au on au.id = p.id
  where lower(au.email) = lower(btrim(coalesce(p_email, '')));
  if target_id is null then
    raise exception 'no_account' using errcode = 'P0001';
  end if;
  if target_home is null then
    raise exception 'no_home_unit' using errcode = 'P0001';
  end if;
  if p_role in ('unit_leader', 'unit_publisher') and p_unit_id <> target_home then
    raise exception 'wrong_unit' using errcode = 'P0001';
  end if;

  if exists (
    select 1 from memberships m
    where m.user_id = target_id and m.unit_id = p_unit_id and m.role = p_role) then
    raise exception 'already_granted' using errcode = 'P0001';
  end if;

  insert into memberships (user_id, unit_id, role, leadership_group, granted_by)
  values (target_id, p_unit_id, p_role, p_leadership_group, auth.uid())
  returning id into new_id;

  insert into role_grants_log (action, user_id, unit_id, role, leadership_group, actor_id)
  values ('granted', target_id, p_unit_id, p_role, p_leadership_group, auth.uid());

  return new_id;
end;
$$;

-- Decision 20: while a person has access, the home unit cannot become "none", and with a unit
-- role it cannot move to another unit. The leadership removes the access first. It is a trigger
-- so it also covers the `on conflict do update` of complete_welcome and direct API updates.
create function public.profiles_guard_home_unit() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.home_unit_id is distinct from old.home_unit_id then
    if (new.home_unit_id is null
        and exists (select 1 from memberships m where m.user_id = old.id))
       or exists (
         select 1 from memberships m
         where m.user_id = old.id and m.role in ('unit_leader', 'unit_publisher')) then
      raise exception 'home_unit_locked' using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;

create trigger profiles_guard_home_unit before update of home_unit_id on public.profiles
  for each row execute function public.profiles_guard_home_unit();
