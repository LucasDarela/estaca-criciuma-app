-- push-notifications: devices, notification history, per-person reads and the SQL that backs the
-- register-device and send-push Edge Functions (ADR 0006). The app never reads the device, notification
-- or delivery tables: the Expo token is the device credential (spec decision P1), so everything goes
-- through the functions below.

-- RF-21: the 6th organization.
alter table public.profiles drop constraint profiles_organizations_check;
alter table public.profiles add constraint profiles_organizations_check check (organizations <@
  array['relief_society','elders_quorum','young_women','young_men','primary','temple_family_history']::text[]);

create table public.push_devices (
  token text primary key check (token ~ '^Expo(nent)?PushToken\[[A-Za-z0-9_-]{10,200}\]$'),
  user_id uuid null references public.profiles (id) on delete set null,
  platform text not null check (platform in ('ios', 'android')),
  locale text not null check (locale in ('pt-BR', 'en-US', 'es-MX')),
  units text[] not null check (units <@ array['estaca','criciuma1','criciuma2','criciuma3','icara','ararangua','ramoGaivota']::text[]),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index push_devices_user_idx on public.push_devices (user_id);
create index push_devices_units_idx on public.push_devices using gin (units);

-- RNF-02: sha256 of the caller IP, deleted after one day by push_cleanup.
create table public.push_register_attempts (
  id bigint generated always as identity primary key,
  ip_hash text not null check (char_length(ip_hash) = 64),
  created_at timestamptz not null default now()
);
create index push_register_attempts_ip_idx on public.push_register_attempts (ip_hash, created_at);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('event', 'post')),
  item_id uuid not null,
  unit_id text not null references public.units (id),
  audience text[] not null check (cardinality(audience) between 1 and 25),
  title text not null check (char_length(title) between 1 and 120),
  -- post: first line of the text; event: '' (the app builds it in its own language, decision P2)
  body text not null default '' check (char_length(body) <= 120),
  event_starts_at timestamptz null,
  event_location text null check (char_length(event_location) <= 160),
  sent_by uuid null references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint notifications_event_fields check ((kind = 'event') = (event_starts_at is not null))
);
create index notifications_item_idx on public.notifications (kind, item_id, created_at desc);
create index notifications_created_idx on public.notifications (created_at);

create table public.notification_deliveries (
  notification_id uuid not null references public.notifications (id) on delete cascade,
  -- no FK: the history outlives the removal of the token
  device_token text not null,
  user_id uuid null references public.profiles (id) on delete set null,
  primary key (notification_id, device_token)
);
create index notification_deliveries_token_idx on public.notification_deliveries (device_token);
create index notification_deliveries_user_idx on public.notification_deliveries (user_id);

create table public.notification_reads (
  notification_id uuid not null references public.notifications (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (notification_id, user_id)
);

alter table public.push_devices enable row level security;
alter table public.push_register_attempts enable row level security;
alter table public.notifications enable row level security;
alter table public.notification_deliveries enable row level security;
alter table public.notification_reads enable row level security;

-- No policy on the first four: only the security definer functions below reach them.
revoke all on public.push_devices from anon, authenticated;
revoke all on public.push_register_attempts from anon, authenticated;
revoke all on public.notifications from anon, authenticated;
revoke all on public.notification_deliveries from anon, authenticated;
revoke all on public.notification_reads from anon, authenticated;

-- Own reads only. No update or delete: removal comes by cascade.
create policy notification_reads_select on public.notification_reads for select to authenticated
  using (user_id = auth.uid());
create policy notification_reads_insert on public.notification_reads for insert to authenticated
  with check (user_id = auth.uid());
grant select, insert on public.notification_reads to authenticated;

-- RF-09 + roles-of-leadership RF-04: the audience keys a unit accepts, in display order.
create function public.push_audience_options(p_unit text) returns text[]
language sql immutable set search_path = public as $$
  select case when p_unit = 'estaca' then
    array['all', 'stake_presidency', 'high_council', 'bishoprics', 'elders_quorum_presidency',
          'relief_society_presidency', 'young_women_presidency', 'primary_presidency',
          'sunday_school_presidency', 'clerks', 'missionaries', 'temple_family_history_workers',
          'music', 'young_single_adult_leaders', 'leaders',
          'relief_society', 'elders_quorum', 'young_women', 'young_men', 'primary', 'temple_family_history']
  else
    array['all', 'bishoprics', 'elders_quorum_presidency',
          'relief_society_presidency', 'young_women_presidency', 'primary_presidency',
          'sunday_school_presidency', 'clerks', 'missionaries', 'temple_family_history_workers',
          'music', 'young_single_adult_leaders', 'leaders',
          'relief_society', 'elders_quorum', 'young_women', 'young_men', 'primary', 'temple_family_history']
  end;
$$;

-- RF-03, RF-07, RNF-02. Called by register-device only (service_role). Keeps `units` on conflict.
-- A p_user_id without a profile yet (signed in, before /welcome) is stored as a visitor device.
create function public.push_register_device(
  p_token text, p_user_id uuid, p_platform text, p_locale text, p_ip_hash text)
returns text
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := p_user_id;
  v_home text;
begin
  if p_token is null or p_token !~ '^Expo(nent)?PushToken\[[A-Za-z0-9_-]{10,200}\]$' then
    raise exception 'invalid_token' using errcode = 'P0001';
  end if;
  if p_platform is null or p_platform not in ('ios', 'android') then
    raise exception 'invalid_platform' using errcode = 'P0001';
  end if;
  if p_locale is null or p_locale not in ('pt-BR', 'en-US', 'es-MX') then
    raise exception 'invalid_locale' using errcode = 'P0001';
  end if;

  if (select count(*) from push_register_attempts a
      where a.ip_hash = p_ip_hash and a.created_at > now() - interval '1 hour') >= 10 then
    return 'rate_limited';
  end if;
  insert into push_register_attempts (ip_hash) values (p_ip_hash);

  if v_user is not null then
    select p.home_unit_id into v_home from profiles p where p.id = v_user;
    if not found then v_user := null; end if;
  end if;

  insert into push_devices (token, user_id, platform, locale, units)
  values (p_token, v_user, p_platform, p_locale,
          case when v_home is null then array['estaca'] else array['estaca', v_home] end)
  on conflict (token) do update set
    user_id = excluded.user_id, platform = excluded.platform, locale = excluded.locale,
    last_seen_at = now();

  -- Deliveries made while the device was a visitor now belong to the person, so that reading them
  -- (mark_notifications_read) works after signing in.
  if v_user is not null then
    update notification_deliveries d set user_id = v_user
    where d.device_token = p_token and d.user_id is null;
  end if;
  return 'registered';
end;
$$;

-- RF-04. The last 90 days delivered to this token or to any device of the signed-in person.
-- Never returns a token. p_device_token may be null (signed in on a device without a token).
create function public.my_notifications(p_device_token text)
returns table (id uuid, kind text, item_id uuid, unit_id text, title text, body text,
               event_starts_at timestamptz, event_location text, created_at timestamptz, read boolean)
language sql stable security definer set search_path = public as $$
  select n.id, n.kind, n.item_id, n.unit_id, n.title, n.body, n.event_starts_at, n.event_location,
         n.created_at,
         (auth.uid() is not null and exists (
            select 1 from notification_reads r
            where r.notification_id = n.id and r.user_id = auth.uid())) as read
  from notifications n
  where n.created_at > now() - interval '90 days'
    and exists (
      select 1 from notification_deliveries d
      where d.notification_id = n.id
        and ((p_device_token is not null and d.device_token = p_device_token)
             or (auth.uid() is not null and d.user_id = auth.uid())))
  order by n.created_at desc;
$$;

-- The device's subscribed units, or null when the token is not registered.
create function public.my_device_units(p_device_token text) returns text[]
language sql stable security definer set search_path = public as $$
  select d.units from push_devices d where d.token = p_device_token;
$$;

-- RF-17. The token is the credential (decision P1). Stored deduplicated, in units.sort_order.
create function public.set_device_units(p_device_token text, p_units text[]) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_units text[];
begin
  if p_units is null or exists (
       select 1 from unnest(p_units) x where not exists (select 1 from units u where u.id = x)) then
    raise exception 'invalid_units' using errcode = 'P0001';
  end if;
  select coalesce(array_agg(u.id order by u.sort_order), '{}') into v_units
  from units u where u.id = any(p_units);

  update push_devices set units = v_units where token = p_device_token;
  if not found then raise exception 'device_not_found' using errcode = 'P0001'; end if;
end;
$$;

-- RF-14. Null marks everything the person received. Only ids they received are accepted.
create function public.mark_notifications_read(p_ids uuid[]) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = 'P0001'; end if;
  insert into notification_reads (notification_id, user_id)
  select n.id, auth.uid() from my_notifications(null) n
  where p_ids is null or n.id = any(p_ids)
  on conflict do nothing;
end;
$$;

-- RNF-04, RNF-05. Daily job: 90 days of notifications (deliveries and reads go by cascade),
-- devices unseen for 180 days, register attempts older than a day.
create function public.push_cleanup() returns void
language sql security definer set search_path = public as $$
  delete from notifications where created_at < now() - interval '90 days';
  delete from push_devices where last_seen_at < now() - interval '180 days';
  delete from push_register_attempts where created_at < now() - interval '1 day';
$$;

create extension if not exists pg_cron with schema pg_catalog;
-- 06:00 UTC = 03:00 in Brasilia
select cron.schedule('push-cleanup', '0 6 * * *', $$select public.push_cleanup()$$);

-- decision 16 of auth-account: the export now carries the person's devices, without the token.
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
      where d.user_id = auth.uid()), '[]'::jsonb)
  ) into result;
  return result;
end;
$$;

-- Execute grants. Postgres grants execute to public by default: revoke, then grant on purpose.
revoke all on function public.push_audience_options(text) from public, anon, authenticated;
revoke all on function public.push_register_device(text, uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.my_notifications(text) from public, anon, authenticated;
revoke all on function public.my_device_units(text) from public, anon, authenticated;
revoke all on function public.set_device_units(text, text[]) from public, anon, authenticated;
revoke all on function public.mark_notifications_read(uuid[]) from public, anon, authenticated;
revoke all on function public.push_cleanup() from public, anon, authenticated;

grant execute on function public.push_audience_options(text) to anon, authenticated, service_role;
grant execute on function public.push_register_device(text, uuid, text, text, text) to service_role;
grant execute on function public.my_notifications(text) to anon, authenticated;
grant execute on function public.my_device_units(text) to anon, authenticated;
grant execute on function public.set_device_units(text, text[]) to anon, authenticated;
grant execute on function public.mark_notifications_read(uuid[]) to authenticated;
grant execute on function public.push_cleanup() to service_role;

-- RF-10 with the roles-of-leadership adjustment. One row per device. Devices without an account
-- only match 'all'. 'leaders' matches a person with a calling that gives access in the item's unit
-- (any unit for a stake item); a notify group matches in the same unit (any unit for a stake item).
create function public.push_recipients(p_unit text, p_audience text[])
returns table (token text, user_id uuid, locale text)
language sql stable security definer set search_path = public as $$
  select d.token, d.user_id, d.locale
  from push_devices d
  where p_unit = any(d.units)
    and ('all' = any(p_audience)
      or (d.user_id is not null and (
            exists (select 1 from profiles p
                    where p.id = d.user_id and p.organizations && p_audience)
         or exists (select 1 from member_calls mc join calling_catalog c on c.id = mc.calling_id
                    where mc.user_id = d.user_id and c.active
                      and c.notify_group = any(p_audience)
                      and (p_unit = 'estaca' or mc.unit_id = p_unit))
         or ('leaders' = any(p_audience) and exists (
                    select 1 from member_calls mc join calling_catalog c on c.id = mc.calling_id
                    where mc.user_id = d.user_id and c.active and c.access <> 'none'
                      and (p_unit = 'estaca' or mc.unit_id = p_unit))))));
$$;

-- The item a push is about. 'post' arrives with the board spec, which replaces this function.
create function public.push_item(p_kind text, p_item_id uuid)
returns table (unit_id text, title text, starts_at timestamptz, location text, text_body text)
language plpgsql stable security definer set search_path = public as $$
begin
  if p_kind = 'event' then
    return query
      select e.unit_id, e.title, e.starts_at, e.location, null::text
      from events e where e.id = p_item_id;
    if not found then raise exception 'item_not_found' using errcode = 'P0001'; end if;
  else
    raise exception 'unsupported_kind' using errcode = 'P0001';
  end if;
end;
$$;

-- RNF-03 and RF-10. The server decides: the actor must publish for the item's unit, the audience
-- must be valid for that unit and an item is notified once every 10 minutes. Stores the
-- notification and one delivery per recipient. p_actor goes into the JWT claims (transaction local)
-- so can_publish, which reads auth.uid(), evaluates for that person (ADR 0006).
create function public.push_prepare(
  p_actor uuid, p_kind text, p_item_id uuid, p_audience text[], p_title text, p_body text,
  p_event_starts_at timestamptz, p_event_location text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_unit text;
  v_id uuid;
  v_recipients jsonb;
begin
  select i.unit_id into v_unit from push_item(p_kind, p_item_id) i;

  perform set_config('request.jwt.claims',
    json_build_object('sub', p_actor, 'role', 'authenticated')::text, true);
  if p_actor is null or not can_publish(v_unit) then
    raise exception 'forbidden' using errcode = 'P0001';
  end if;

  if p_audience is null or cardinality(p_audience) = 0
     or not (p_audience <@ push_audience_options(v_unit)) then
    raise exception 'invalid_audience' using errcode = 'P0001';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_kind || p_item_id::text));
  if exists (select 1 from notifications n
             where n.kind = p_kind and n.item_id = p_item_id
               and n.created_at > now() - interval '10 minutes') then
    raise exception 'rate_limited' using errcode = 'P0001';
  end if;

  insert into notifications (kind, item_id, unit_id, audience, title, body,
                             event_starts_at, event_location, sent_by)
  values (p_kind, p_item_id, v_unit, p_audience, p_title, coalesce(p_body, ''),
          p_event_starts_at, p_event_location, p_actor)
  returning id into v_id;

  insert into notification_deliveries (notification_id, device_token, user_id)
  select v_id, r.token, r.user_id from push_recipients(v_unit, p_audience) r;

  select coalesce(jsonb_agg(jsonb_build_object('token', r.token, 'locale', r.locale)), '[]'::jsonb)
  into v_recipients from push_recipients(v_unit, p_audience) r;

  return jsonb_build_object('notification_id', v_id, 'recipients', v_recipients);
end;
$$;

-- Used when no batch reached the Expo Push API, so the 10 minute limit does not block a retry.
create function public.push_discard(p_notification_id uuid) returns void
language sql security definer set search_path = public as $$
  delete from notifications where id = p_notification_id;
$$;

-- RNF-04: tokens the Expo Push API reported as DeviceNotRegistered.
create function public.push_remove_devices(p_tokens text[]) returns void
language sql security definer set search_path = public as $$
  delete from push_devices where token = any(p_tokens);
$$;

revoke all on function public.push_recipients(text, text[]) from public, anon, authenticated;
revoke all on function public.push_item(text, uuid) from public, anon, authenticated;
revoke all on function public.push_prepare(uuid, text, uuid, text[], text, text, timestamptz, text) from public, anon, authenticated;
revoke all on function public.push_discard(uuid) from public, anon, authenticated;
revoke all on function public.push_remove_devices(text[]) from public, anon, authenticated;

grant execute on function public.push_recipients(text, text[]) to service_role;
grant execute on function public.push_item(text, uuid) to service_role;
grant execute on function public.push_prepare(uuid, text, uuid, text[], text, text, timestamptz, text) to service_role;
grant execute on function public.push_discard(uuid) to service_role;
grant execute on function public.push_remove_devices(text[]) to service_role;
