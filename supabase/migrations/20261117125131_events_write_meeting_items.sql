-- Event writes and meeting agenda (spec event-form).

-- RNF-01. Writes on events. USING checks the old row, WITH CHECK the new one, so changing
-- unit_id needs can_publish on both units.
alter table public.events alter column created_by set default auth.uid();

create policy events_insert_publisher on public.events for insert to authenticated
  with check (public.can_publish(unit_id) and created_by = auth.uid());
create policy events_update_publisher on public.events for update to authenticated
  using (public.can_publish(unit_id)) with check (public.can_publish(unit_id));
create policy events_delete_publisher on public.events for delete to authenticated
  using (public.can_publish(unit_id));
revoke insert, update, delete on public.events from anon;

-- RF-16
create table public.meeting_items (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  kind text not null check (kind in ('agenda', 'decision', 'pending')),
  text text not null check (char_length(btrim(text)) between 1 and 300),
  position int not null default -1, -- -1 = not set: the trigger below moves it to the end
  carried_from_event_id uuid null references public.events (id) on delete set null,
  carried_from_date date null,
  created_by uuid null default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index meeting_items_event_idx on public.meeting_items (event_id, position);

-- True when the event exists, is a meeting and the caller can_lead its unit.
create function public.meeting_event_leadable(p_event_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select e.type = 'meeting' and can_lead(e.unit_id)
                   from events e where e.id = p_event_id), false);
$$;

alter table public.meeting_items enable row level security;
revoke all on public.meeting_items from anon;
revoke update on public.meeting_items from authenticated; -- items are added or removed, never edited

create policy meeting_items_select_leader on public.meeting_items for select to authenticated
  using (public.meeting_event_leadable(event_id));
create policy meeting_items_insert_leader on public.meeting_items for insert to authenticated
  with check (public.meeting_event_leadable(event_id) and created_by = auth.uid()
              and carried_from_event_id is null and carried_from_date is null);
create policy meeting_items_delete_leader on public.meeting_items for delete to authenticated
  using (public.meeting_event_leadable(event_id));
-- No policy for admin (RN-04): admin is not can_lead.

-- When the insert does not set position (-1 default), it goes to the end of the event's list.
create function public.meeting_items_set_position() returns trigger
language plpgsql as $$
begin
  if new.position is null or new.position < 0 then
    new.position := coalesce((select max(position) + 1 from public.meeting_items
                              where event_id = new.event_id), 0);
  end if;
  return new;
end;
$$;
create trigger meeting_items_set_position before insert on public.meeting_items
  for each row execute function public.meeting_items_set_position();

-- RF-21. lower, no diacritics (pt/es set), collapsed spaces, trimmed.
create function public.event_series_key(p_title text) returns text
language sql immutable as $$
  select btrim(regexp_replace(
    translate(lower(p_title), 'áàâãäåéèêëíìîïóòôõöúùûüçñ', 'aaaaaaeeeeiiiiooooouuuucn'),
    '\s+', ' ', 'g'));
$$;

-- RF-21, RNF-03. security definer: the creator may be a unit_publisher, who cannot read the
-- items, and the carry must still happen.
create function public.carry_pending_items(p_event_id uuid) returns int
language plpgsql security definer set search_path = public as $$
declare
  v_new events%rowtype;
  v_prev_id uuid;
  v_prev_starts timestamptz;
  v_count int;
begin
  select * into v_new from events where id = p_event_id;
  if not found or v_new.type <> 'meeting' then return 0; end if;

  select e.id, e.starts_at into v_prev_id, v_prev_starts
  from events e
  where e.unit_id = v_new.unit_id and e.type = 'meeting' and e.id <> v_new.id
    and e.starts_at < v_new.starts_at
    and event_series_key(e.title) = event_series_key(v_new.title)
  order by e.starts_at desc, e.created_at desc
  limit 1;
  if v_prev_id is null then return 0; end if;

  insert into meeting_items (event_id, kind, text, position, carried_from_event_id,
                             carried_from_date, created_by)
  select v_new.id, 'agenda', mi.text,
         (row_number() over (order by mi.position, mi.created_at, mi.id)) - 1,
         v_prev_id, (v_prev_starts at time zone 'America/Sao_Paulo')::date, v_new.created_by
  from meeting_items mi where mi.event_id = v_prev_id and mi.kind = 'pending';
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create function public.events_carry_pending() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform carry_pending_items(new.id);
  return null;
end;
$$;
-- Only on INSERT: renaming later never copies again (RF-21).
create trigger events_carry_pending after insert on public.events
  for each row when (new.type = 'meeting') execute function public.events_carry_pending();

create function public.create_event(
  p_id uuid, p_unit_id text, p_type text, p_title text, p_starts_at timestamptz,
  p_ends_at timestamptz, p_location text, p_notes text, p_links text[], p_items jsonb)
returns public.events
language plpgsql security definer set search_path = public as $$
declare
  v_existing events%rowtype;
  v_event events%rowtype;
  v_items jsonb;
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = 'P0001'; end if;

  select * into v_existing from events where id = p_id;
  if found then
    if v_existing.created_by = auth.uid() then return v_existing; end if;
    raise exception 'forbidden' using errcode = 'P0001';
  end if;

  if not can_publish(p_unit_id) then raise exception 'forbidden' using errcode = 'P0001'; end if;

  v_items := coalesce(p_items, '[]'::jsonb);
  if jsonb_array_length(v_items) > 0 and (p_type <> 'meeting' or not can_lead(p_unit_id)) then
    raise exception 'invalid_items' using errcode = 'P0001';
  end if;

  insert into events (id, unit_id, type, title, starts_at, ends_at, location, notes, links, created_by)
  values (p_id, p_unit_id, p_type, btrim(p_title), p_starts_at, p_ends_at,
          btrim(coalesce(p_location, '')), coalesce(p_notes, ''), coalesce(p_links, '{}'),
          auth.uid())
  returning * into v_event;

  -- The AFTER INSERT trigger has already carried the pending items: they take the first positions.
  insert into meeting_items (event_id, kind, text, created_by)
  select v_event.id, x.e ->> 'kind', btrim(x.e ->> 'text'), auth.uid()
  from jsonb_array_elements(v_items) with ordinality as x(e, ord)
  order by x.ord;

  return v_event;
end;
$$;

create function public.update_event(
  p_id uuid, p_unit_id text, p_type text, p_title text, p_starts_at timestamptz,
  p_ends_at timestamptz, p_location text, p_notes text, p_links text[])
returns public.events
language plpgsql security definer set search_path = public as $$
declare
  v_old events%rowtype;
  v_event events%rowtype;
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = 'P0001'; end if;

  select * into v_old from events where id = p_id for update;
  if not found then raise exception 'not_found' using errcode = 'P0001'; end if;
  if not can_publish(v_old.unit_id) or not can_publish(p_unit_id) then
    raise exception 'forbidden' using errcode = 'P0001';
  end if;

  if p_type <> 'meeting' then delete from meeting_items where event_id = p_id; end if;

  update events set
    unit_id = p_unit_id, type = p_type, title = btrim(p_title),
    starts_at = p_starts_at, ends_at = p_ends_at,
    location = btrim(coalesce(p_location, '')), notes = coalesce(p_notes, ''),
    links = coalesce(p_links, '{}')
  where id = p_id
  returning * into v_event;
  return v_event;
end;
$$;

create function public.delete_event(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_unit text;
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = 'P0001'; end if;

  select unit_id into v_unit from events where id = p_id for update;
  if not found then raise exception 'not_found' using errcode = 'P0001'; end if;
  if not can_publish(v_unit) then raise exception 'forbidden' using errcode = 'P0001'; end if;

  delete from events where id = p_id; -- meeting_items go by cascade
end;
$$;

-- Execute grants. Postgres grants execute to public by default: revoke, then grant on purpose.
revoke all on function public.meeting_event_leadable(uuid) from public, anon, authenticated;
revoke all on function public.carry_pending_items(uuid) from public, anon, authenticated;
revoke all on function public.events_carry_pending() from public, anon, authenticated;
revoke all on function public.event_series_key(text) from public, anon, authenticated;
revoke all on function public.create_event(uuid, text, text, text, timestamptz, timestamptz, text, text, text[], jsonb)
  from public, anon, authenticated;
revoke all on function public.update_event(uuid, text, text, text, timestamptz, timestamptz, text, text, text[])
  from public, anon, authenticated;
revoke all on function public.delete_event(uuid) from public, anon, authenticated;

-- RLS policies run meeting_event_leadable with the caller's privileges, so authenticated needs
-- execute. It only returns a boolean about the caller's own rights, so exposing it leaks nothing.
grant execute on function public.meeting_event_leadable(uuid) to authenticated;
grant execute on function public.event_series_key(text) to authenticated;
grant execute on function public.create_event(uuid, text, text, text, timestamptz, timestamptz, text, text, text[], jsonb)
  to authenticated;
grant execute on function public.update_event(uuid, text, text, text, timestamptz, timestamptz, text, text, text[])
  to authenticated;
grant execute on function public.delete_event(uuid) to authenticated;
