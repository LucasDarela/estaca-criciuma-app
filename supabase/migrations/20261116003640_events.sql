-- Public calendar events (spec calendar RF-01). Read for anon and authenticated; writes come with event-form.

-- Up to 5 links, each https:// and at most 500 chars. A function because CHECK cannot hold a subquery.
create function public.valid_event_links(p_links text[]) returns boolean
language sql immutable as $$
  select cardinality(p_links) <= 5
    and not exists (select 1 from unnest(p_links) l where l not like 'https://%' or char_length(l) > 500);
$$;

create table public.events (
  id uuid primary key default gen_random_uuid(),
  unit_id text not null references public.units (id),
  type text not null check (type in ('activity','meeting','training','conference','caravan')),
  title text not null check (char_length(btrim(title)) between 1 and 80),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  location text not null default '' check (char_length(location) <= 160),
  notes text not null default '' check (char_length(notes) <= 1000),
  links text[] not null default '{}' check (public.valid_event_links(links)),
  created_by uuid null references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint events_ends_after_starts check (ends_at > starts_at)
);

-- Period reads overlap-filter on (starts_at, ends_at) (RNF-03).
create index events_period_idx on public.events (starts_at, ends_at);

create trigger events_set_updated_at before update on public.events
  for each row execute function public.set_updated_at();

alter table public.events enable row level security;

-- No write policy: event-form adds it. There are no drafts (spec A3): every saved event is public.
create policy events_select_all on public.events for select to anon, authenticated using (true);
