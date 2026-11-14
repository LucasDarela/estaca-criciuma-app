-- Shared trigger function for updated_at (reused by future tables).
create function public.set_updated_at() returns trigger
language plpgsql set search_path = public as $$
begin new.updated_at = now(); return new; end; $$;

create table public.units (
  id text primary key,
  kind text not null check (kind in ('stake', 'ward', 'branch')),
  name text not null,
  sort_order int not null unique
);

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (char_length(btrim(display_name)) between 2 and 60),
  home_unit_id text null references public.units (id),
  locale text not null default 'pt-BR' check (locale in ('pt-BR', 'en-US', 'es-MX')),
  organizations text[] not null default '{}'
    check (organizations <@ array['relief_society','elders_quorum','young_women','young_men','primary']::text[]),
  consented_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- The attended unit is a ward or branch, never the stake (spec 7.4).
  constraint home_unit_not_stake check (home_unit_id is null or home_unit_id <> 'estaca')
);
create trigger profiles_set_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  unit_id text not null references public.units (id),
  role text not null check (role in ('unit_leader', 'unit_publisher', 'stake_leader', 'admin')),
  leadership_group text null check (leadership_group in ('stake_presidency', 'bishops', 'presidents')),
  granted_by uuid null references public.profiles (id) on delete set null,
  granted_at timestamptz not null default now(),
  unique (user_id, unit_id, role),
  -- Stake-wide roles live on 'estaca'; unit roles on a ward/branch. The name is the error message (spec 7.4).
  constraint invalid_unit_for_role check ((role in ('stake_leader', 'admin')) = (unit_id = 'estaca'))
);

-- No foreign keys on purpose: the audit trail outlives deleted profiles (spec 7.4).
create table public.role_grants_log (
  id uuid primary key default gen_random_uuid(),
  action text not null check (action in ('granted', 'revoked')),
  user_id uuid not null,
  unit_id text not null,
  role text not null,
  leadership_group text null,
  actor_id uuid null,
  created_at timestamptz not null default now()
);
create index role_grants_log_created_at_idx on public.role_grants_log (created_at desc);

-- Permission functions: security definer (bypass RLS on memberships, avoiding policy recursion),
-- stable, fixed search_path (RNF-05).
create function public.has_role(p_unit text, p_roles text[]) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from memberships m
    where m.user_id = auth.uid() and m.unit_id = p_unit and m.role = any (p_roles)
  );
$$;

create function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from memberships m where m.user_id = auth.uid() and m.role = 'admin');
$$;

create function public.is_stake_leader() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from memberships m where m.user_id = auth.uid() and m.role = 'stake_leader');
$$;

create function public.can_publish(p_unit text) returns boolean
language sql stable security definer set search_path = public as $$
  select has_role(p_unit, array['unit_leader', 'unit_publisher']) or is_stake_leader() or is_admin();
$$;

-- admin is deliberately absent (RN-04).
create function public.can_lead(p_unit text) returns boolean
language sql stable security definer set search_path = public as $$
  select has_role(p_unit, array['unit_leader']) or is_stake_leader();
$$;

alter table public.units enable row level security;
alter table public.profiles enable row level security;
alter table public.memberships enable row level security;
alter table public.role_grants_log enable row level security;

-- units: public read, no write policy.
create policy units_select_all on public.units for select to anon, authenticated using (true);

-- profiles: each person reads and updates only their own row. Insert comes with auth-account.
create policy profiles_select_own on public.profiles for select to authenticated
  using (id = auth.uid());
create policy profiles_update_own on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- memberships: own rows; stake_leader and admin read all (they manage access, spec 7.2).
-- No insert/update/delete policy: writes come only from auth-account RPCs.
create policy memberships_select on public.memberships for select to authenticated
  using (user_id = auth.uid() or is_stake_leader() or is_admin());

-- role_grants_log: read by stake_leader and admin; insert only from security definer functions.
create policy role_grants_log_select on public.role_grants_log for select to authenticated
  using (is_stake_leader() or is_admin());
