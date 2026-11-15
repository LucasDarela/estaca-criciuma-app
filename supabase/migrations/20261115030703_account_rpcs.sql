-- auth-account: RPCs for the first access, data export, account deletion and access management.
-- All are security definer, check the caller first and return short error codes in `message`
-- (errcode P0001) that the app translates. Role changes write role_grants_log in the same
-- transaction (RNF-05). memberships keeps no write policy: the RPCs are the only way in.

-- RF-10. Creates or updates the caller's own profile and records consent with the server clock.
create function public.complete_welcome(p_display_name text, p_home_unit_id text, p_locale text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = 'P0001'; end if;
  if p_display_name is null or char_length(btrim(p_display_name)) not between 2 and 60 then
    raise exception 'invalid_display_name' using errcode = 'P0001';
  end if;
  if p_home_unit_id is not null and (
       p_home_unit_id = 'estaca'
       or not exists (select 1 from units u where u.id = p_home_unit_id)) then
    raise exception 'invalid_unit' using errcode = 'P0001';
  end if;
  if p_locale is null or p_locale not in ('pt-BR', 'en-US', 'es-MX') then
    raise exception 'invalid_locale' using errcode = 'P0001';
  end if;

  insert into profiles (id, display_name, home_unit_id, locale, consented_at)
  values (auth.uid(), btrim(p_display_name), p_home_unit_id, p_locale, now())
  on conflict (id) do update set
    display_name = excluded.display_name,
    home_unit_id = excluded.home_unit_id,
    locale = excluded.locale,
    consented_at = now();
end;
$$;

-- RF-13 (decision 16: notes and push-notifications add keys to this object).
create function public.export_my_data() returns jsonb
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
        'leadership_group', m.leadership_group,
        'granted_at', m.granted_at) order by u.sort_order, m.role)
      from memberships m join units u on u.id = m.unit_id
      where m.user_id = auth.uid()), '[]'::jsonb)
  ) into result;
  return result;
end;
$$;

-- RF-14, RNF-06, 7.6. Deletes auth.users; cascades to profiles and memberships (and to future
-- notes and push_tokens). role_grants_log has no foreign keys, so the audit trail stays.
create function public.delete_my_account() returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = 'P0001'; end if;
  if is_admin() and (select count(*) from memberships m where m.role = 'admin') = 1 then
    raise exception 'last_admin' using errcode = 'P0001';
  end if;
  delete from auth.users where id = auth.uid();
end;
$$;

-- RF-15. Only stake_leader and admin.
create function public.list_access()
returns table (membership_id uuid, user_id uuid, display_name text, email text,
               unit_id text, role text, leadership_group text)
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = 'P0001'; end if;
  if not (is_stake_leader() or is_admin()) then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;

  return query
    select m.id, m.user_id, p.display_name, au.email::text, m.unit_id, m.role, m.leadership_group
    from memberships m
    join profiles p on p.id = m.user_id
    join auth.users au on au.id = m.user_id
    join units u on u.id = m.unit_id
    order by u.sort_order, p.display_name;
end;
$$;

-- RF-16, RF-18, RNF-05. Returns the id of the new membership.
create function public.grant_role(
  p_email text, p_unit_id text, p_role text, p_leadership_group text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  target_id uuid;
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

  select p.id into target_id
  from profiles p join auth.users au on au.id = p.id
  where lower(au.email) = lower(btrim(coalesce(p_email, '')));
  if target_id is null then
    raise exception 'no_account' using errcode = 'P0001';
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

-- RF-17, RF-18, RNF-05. The caller is checked before the membership is looked up, so a person
-- without permission cannot probe which membership ids exist.
create function public.revoke_role(p_membership_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  target memberships%rowtype;
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = 'P0001'; end if;
  if not (is_stake_leader() or is_admin()) then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;

  select * into target from memberships m where m.id = p_membership_id;
  if not found then raise exception 'not_found' using errcode = 'P0001'; end if;
  if target.user_id = auth.uid() then
    raise exception 'cannot_revoke_self' using errcode = 'P0001';
  end if;
  if target.role = 'admin' and not is_admin() then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;

  delete from memberships m where m.id = target.id;
  insert into role_grants_log (action, user_id, unit_id, role, leadership_group, actor_id)
  values ('revoked', target.user_id, target.unit_id, target.role, target.leadership_group,
          auth.uid());
end;
$$;

revoke all on function public.complete_welcome(text, text, text) from public, anon;
revoke all on function public.export_my_data() from public, anon;
revoke all on function public.delete_my_account() from public, anon;
revoke all on function public.list_access() from public, anon;
revoke all on function public.grant_role(text, text, text, text) from public, anon;
revoke all on function public.revoke_role(uuid) from public, anon;

grant execute on function public.complete_welcome(text, text, text) to authenticated;
grant execute on function public.export_my_data() to authenticated;
grant execute on function public.delete_my_account() to authenticated;
grant execute on function public.list_access() to authenticated;
grant execute on function public.grant_role(text, text, text, text) to authenticated;
grant execute on function public.revoke_role(uuid) to authenticated;
