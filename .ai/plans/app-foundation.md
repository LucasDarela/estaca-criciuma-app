# Plano: Fundação do app (Supabase, dados base e permissões)

> **Spec:** `.ai/specs/app-foundation.md`
> **Criado em:** 2026-11-13
> **ADRs relacionados:** `.ai/adrs/0002-stack-inicial.md` (nenhum ADR novo)

## 1. Abordagem

O banco é a única barreira de autorização: uma migration cria `units`, `profiles`, `memberships` e `role_grants_log` com RLS, mais as funções `security definer` `has_role`, `can_publish`, `can_lead`, `is_admin` e `is_stake_leader`, usadas nas políticas. **Nenhuma** tabela recebe política de escrita para papéis: conceder e revogar papéis entra em `auth-account` por RPCs `security definer` que gravam `role_grants_log` na mesma transação (RNF-05 daquela spec). Por isso não há trigger de log aqui; o seed grava o log direto. Um único arquivo pgTAP testa cada política com acesso permitido e negado, simulando usuários com `set local role` + `request.jwt.claims`.

No app, as regras de papel ficam em funções puras em `src/domain/permissions.ts` (as mesmas regras do SQL), e o `ViewerProvider` só junta a sessão (por prop, `null` até `auth-account`) com os dados de `profiles` e `memberships` vindos do TanStack Query. A falha sem cache cai naturalmente em `viewerKind(session, []) = 'member'`, então nenhuma permissão é concedida por erro (CA-11). O cliente Supabase é criado sob demanda (`getSupabase()`): sem sessão nada é consultado, e o app abre mesmo sem `.env` (passo 5 do QA). Os tipos do banco são gerados pela CLI (`make db-types`), o que evita `any` nas consultas sem dependência nova.

`UnitId` passa de `src/theme/theme.ts` para `src/domain/units.ts`: `domain` não pode importar nada (`ARCHITECTURE.md` › Camadas). O `theme.ts` reexporta o tipo, então quem já importa de lá não muda.

## 2. Contratos

### 2.1 SQL (`supabase/migrations/<ts>_base_units_profiles_roles.sql`)

```sql
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
```

`units_select_all` usa `using (true)`, o que RNF-01 permite: `units` não tem dado pessoal. Os grants padrão do Supabase (`anon`/`authenticated` com ALL nas tabelas de `public`) ficam como estão: quem nega a escrita é a RLS, e é isso que CA-01, CA-04 e CA-07 testam (erro `42501`).

### 2.2 Seed (`supabase/seed.sql`)

| Conta (`@exemplo.org`) | `id` | `display_name` | `home_unit_id` | Membership (`unit_id`, `role`, `leadership_group`) |
| --- | --- | --- | --- | --- |
| `membro@` | `00000000-0000-4000-8000-000000000001` | Ana Exemplo | `criciuma2` | nenhuma |
| `publicador.icara@` | `00000000-0000-4000-8000-000000000002` | Bruno Exemplo | `icara` | `icara`, `unit_publisher`, `null` |
| `bispo.criciuma1@` | `00000000-0000-4000-8000-000000000003` | Carlos Exemplo | `criciuma1` | `criciuma1`, `unit_leader`, `bishops` |
| `estaca@` | `00000000-0000-4000-8000-000000000004` | Daniela Exemplo | `criciuma3` | `estaca`, `stake_leader`, `stake_presidency` |
| `admin@` | `00000000-0000-4000-8000-000000000005` | Eduardo Exemplo | `null` | `estaca`, `admin`, `null` |

Ordem do arquivo:

1. `units` com `sort_order` 1 a 7 na ordem de `unitOrder` (`estaca`, `criciuma1`, `criciuma2`, `criciuma3`, `icara`, `ararangua`, `ramoGaivota`) e os nomes de RF-01.
2. `auth.users` para as 5 contas: `instance_id = '00000000-0000-0000-0000-000000000000'`, `aud = 'authenticated'`, `role = 'authenticated'`, `email`, `encrypted_password = ''`, `email_confirmed_at = now()`, `raw_app_meta_data = '{"provider":"email","providers":["email"]}'`, `raw_user_meta_data = '{}'`, `created_at`/`updated_at = now()`, e `confirmation_token`, `recovery_token`, `email_change_token_new`, `email_change` = `''` (o GoTrue falha ao ler `NULL` nessas colunas).
3. `auth.identities` para cada conta: `provider = 'email'`, `provider_id = id::text`, `user_id = id`, `identity_data = jsonb_build_object('sub', id::text, 'email', email, 'email_verified', true)`, `last_sign_in_at`/`created_at`/`updated_at = now()`. Não informe a coluna `email` (é gerada). Isso deixa as contas prontas para o login por OTP em `auth-account`.
4. `profiles` conforme a tabela, com `consented_at = now()`.
5. `memberships` conforme a tabela (`granted_by = null`).
6. `role_grants_log`: uma linha `granted` para cada uma das 4 memberships, com `actor_id = null`.

### 2.3 TypeScript

```ts
// src/domain/units.ts
/** A stake unit id; same values as `units.id` in the database. Order = display order. */
export type UnitId =
  'estaca' | 'criciuma1' | 'criciuma2' | 'criciuma3' | 'icara' | 'ararangua' | 'ramoGaivota';
export const STAKE_UNIT_ID = 'estaca' satisfies UnitId;
export const unitIds: readonly UnitId[] = [
  'estaca', 'criciuma1', 'criciuma2', 'criciuma3', 'icara', 'ararangua', 'ramoGaivota',
];
export function isUnitId(value: string): value is UnitId;

// src/domain/profile.ts
export type Locale = 'pt-BR' | 'en-US' | 'es-MX';
export type Organization = 'relief_society' | 'elders_quorum' | 'young_women' | 'young_men' | 'primary';
export type Profile = {
  id: string;
  displayName: string;
  homeUnitId: UnitId | null;
  locale: Locale;
  organizations: Organization[];
  consentedAt: string | null; // ISO timestamp
};

// src/domain/permissions.ts  (pure: no React, no Supabase)
export type Role = 'unit_leader' | 'unit_publisher' | 'stake_leader' | 'admin';
export type LeadershipGroup = 'stake_presidency' | 'bishops' | 'presidents';
export type Membership = { unitId: UnitId; role: Role; leadershipGroup: LeadershipGroup | null };
export type ViewerSession = { userId: string };
export type ViewerKind = 'visitor' | 'member' | 'leader';

export function isRole(value: string): value is Role;
export function isLeadershipGroup(value: string): value is LeadershipGroup;
export function isAdmin(memberships: readonly Membership[]): boolean;
export function isStakeLeader(memberships: readonly Membership[]): boolean;
/** 'visitor' without session; 'leader' with any unit_leader or stake_leader; otherwise 'member'. */
export function viewerKind(session: ViewerSession | null, memberships: readonly Membership[]): ViewerKind;
/** Same rule as SQL can_publish (RF-06). */
export function canPublish(memberships: readonly Membership[], unitId: UnitId): boolean;
/** Same rule as SQL can_lead (RF-07): never true for admin or unit_publisher alone. */
export function canLead(memberships: readonly Membership[], unitId: UnitId): boolean;
/** Units in `unitIds` order where canPublish is true. */
export function publishableUnits(memberships: readonly Membership[]): UnitId[];
/** Units in `unitIds` order where canLead is true. */
export function leadableUnits(memberships: readonly Membership[]): UnitId[];

// src/lib/supabase.ts
import type { Database } from './database.types';
/** Lazily creates the app client (anon key, no session persistence until auth-account).
 *  Throws `Error('Supabase is not configured: ...')` when the EXPO_PUBLIC_ variables are missing. */
export function getSupabase(): SupabaseClient<Database>;

// src/features/viewer/api.ts
export type ViewerData = { profile: Profile | null; memberships: Membership[] };
export const viewerQueryKey = (userId: string) => ['viewer', userId] as const;
/** Loads the user's profile and memberships. Rows with unknown role/unit are dropped (never grant
 *  on unexpected data). Throws on any Supabase error. */
export async function fetchViewerData(userId: string): Promise<ViewerData>;

// src/features/viewer/ViewerProvider.tsx
export type Viewer = {
  kind: ViewerKind;
  userId: string | null;
  profile: Profile | null;
  memberships: readonly Membership[];
  canPublish: (unitId: UnitId) => boolean;
  canLead: (unitId: UnitId) => boolean;
  publishableUnits: UnitId[];
  leadableUnits: UnitId[];
  isAdmin: boolean;
  isStakeLeader: boolean;
};
export function ViewerProvider(props: { session: ViewerSession | null; children: React.ReactNode }): React.JSX.Element;
/** Throws Error('useViewer must be used inside ViewerProvider') outside the provider. */
export function useViewer(): Viewer;
```

Detalhes do `ViewerProvider`:

- `useQuery({ queryKey: viewerQueryKey(userId), queryFn: () => fetchViewerData(userId), enabled: session !== null })`. Sem sessão a query não roda.
- `const data = query.data ?? { profile: null, memberships: [] }`. Com cache, o TanStack mantém `data` quando o refetch falha (7.4). Sem cache, a falha deixa `memberships = []` e `viewerKind` dá `'member'`. Enquanto carrega, o comportamento é o mesmo (nenhuma permissão).
- Sem sessão: `userId = null`, `profile = null`, `memberships = []`, `kind = 'visitor'`.
- O valor do contexto é memoizado (`useMemo`) por `session?.userId` e `query.data`.

Consultas em `fetchViewerData`:

```ts
getSupabase().from('profiles')
  .select('id, display_name, home_unit_id, locale, organizations, consented_at')
  .eq('id', userId).maybeSingle();
getSupabase().from('memberships')
  .select('unit_id, role, leadership_group').eq('user_id', userId);
```

As duas rodam em `Promise.all`. Mapeie `snake_case` para `camelCase` com os guards `isUnitId`, `isRole` e `isLeadershipGroup`. Em `profile`, `locale` e `organizations` desconhecidos caem para `'pt-BR'` e são filtrados, respectivamente.

## 3. Dependências novas

| Pacote | Versão | Motivo |
| --- | --- | --- |
| `@supabase/supabase-js` | `^2.119.0` (última 2.x estável em 2026-11-13) | Cliente do app; previsto na spec (seção 4) e no ADR 0002. Instalar com `npx expo install @supabase/supabase-js`. |

Sem `react-native-url-polyfill`: o RN 0.88 já implementa `URL.searchParams` e `URLSearchParams` (`node_modules/react-native/Libraries/Blob/URL.js:199`). Sem `AsyncStorage`/`expo-secure-store`: a sessão persistida entra em `auth-account`.

## 4. Tarefas

- [x] **T-01 — Migration base com RLS**
  - Arquivos: `criar supabase/migrations/<ts>_base_units_profiles_roles.sql` (via `supabase migration new base_units_profiles_roles`) · `alterar supabase/config.toml` (`project_id = "estaca-criciuma"`)
  - O que fazer: escrever exatamente o SQL da seção 2.1.
  - Referência: nenhuma migration existe ainda; esta vira o padrão (atualizar `ARCHITECTURE.md` em T-09). Siga `ecc:postgres-patterns`.
  - Cobre: base para CA-01 a CA-07
  - Verificar: `supabase start && supabase db reset` aplica sem erro

- [x] **T-02 — Seed**
  - Arquivos: `criar supabase/seed.sql`
  - O que fazer: conteúdo e ordem da seção 2.2. Use os UUIDs fixos (os testes dependem deles).
  - Referência: seção 2.2
  - Cobre: RF-11, RNF-06 (base para CA-12)
  - Verificar: `supabase db reset`; no Studio, `units` com 7 linhas e `role_grants_log` com 4

- [x] **T-03 — Testes pgTAP de RLS e funções**
  - Arquivos: `criar supabase/tests/base_rls.test.sql`
  - O que fazer: um arquivo `begin; create extension if not exists pgtap with schema extensions; select plan(N); ... select * from finish(); rollback;`. Toda descrição de asserção começa com o ID do CA (`'CA-05: publisher can publish to own unit'`). Para simular usuários:
    ```sql
    -- as an authenticated user
    set local role authenticated;
    set local request.jwt.claims to '{"sub":"00000000-0000-4000-8000-000000000002","role":"authenticated"}';
    -- as a visitor
    set local role anon;
    set local request.jwt.claims to '{"role":"anon"}';
    -- back to the owner (constraints and cascade)
    reset role;
    ```
    Para contar linhas afetadas por `update`, use `results_eq($$ with u as (update ... returning 1) select count(*)::int from u $$, $$ values (0) $$, 'CA-02: ...')`. Erros de RLS com `throws_ok(sql, '42501', null, 'CA-..')` e de constraint com `throws_ok(sql, '23514', null, 'CA-..')`. Asserções obrigatórias:
    - **RNF-01:** `relrowsecurity` verdadeiro nas 4 tabelas (`pg_class`).
    - **CA-01:** `anon` lê os 7 ids na ordem de `sort_order` (`results_eq`); `insert` em `units` como `anon` e como `membro` → `42501`.
    - **CA-02:** como `membro` (A): `count(*)` de `profiles` = 1; `select` da linha do `publicador` (B) = 0; `update` da própria linha = 1; `update` de B = 0. Como `anon`: `profiles` = 0 linhas.
    - **CA-03 e 7.4:** como owner: `stake_leader` em `icara` → `23514`; `unit_leader` em `estaca` → `23514`; `profiles.home_unit_id = 'estaca'` → `23514`.
    - **CA-04:** `insert` em `memberships` como `membro` e como `bispo` → `42501`. `select` de `memberships`: `membro` = 0, `bispo` = 1 (só a própria), `estaca` = 4, `admin` = 4.
    - **CA-05:** `publicador`: `can_publish('icara')` true, `can_publish('criciuma1')` false. `bispo`: `criciuma1` true, `icara` false. `estaca` e `admin`: `icara` true. `membro` e `anon`: `estaca` false.
    - **CA-06:** `can_lead('icara')`: `publicador` false, `admin` false, `estaca` true. `bispo`: `can_lead('criciuma1')` true, `can_lead('icara')` false. `anon`: false.
    - **CA-07 e RF-08:** `role_grants_log`: `membro` = 0, `bispo` = 0, `estaca` = 4, `admin` = 4; `insert` como `estaca` → `42501`. `is_admin()`: `admin` true, `estaca` false. `is_stake_leader()`: `estaca` true, `admin` false.
    - **7.4 (por último):** como owner, `delete from auth.users` do `publicador` → 0 memberships e 0 profile dele, e as linhas de `role_grants_log` com o `user_id` dele continuam (1).
  - Referência: seção 2.1; skill `ecc:postgres-patterns`
  - Cobre: CA-01, CA-02, CA-03, CA-04, CA-05, CA-06, CA-07, RNF-01, RNF-02, RNF-05
  - Verificar: `supabase test db`

- [x] **T-04 — `make test-db`, `make db-types` e job `db` na CI**
  - Arquivos: `alterar Makefile` · `alterar .github/workflows/ci.yml`
  - O que fazer: no `Makefile`, crie o prefixo `REQUIRE_SUPABASE = if ! command -v supabase >/dev/null 2>&1; then echo "[make $@] supabase CLI não encontrada: nada a fazer"; exit 0; fi;`, no mesmo estilo de `REQUIRE_APP`, e acrescente à `.PHONY`:
    ```make
    test-db: ## Testes de banco (pgTAP/RLS); precisa de Docker e `supabase start`
    	@$(REQUIRE_SUPABASE) supabase test db

    db-types: ## Gera src/lib/database.types.ts a partir do banco local
    	@$(REQUIRE_SUPABASE) supabase gen types typescript --local > src/lib/database.types.ts && npx prettier --write src/lib/database.types.ts
    ```
    `test-db` **não** entra em `check`, porque precisa de Docker. Na CI, adicione um job ao lado de `check`:
    ```yaml
      db:
        runs-on: ubuntu-latest
        timeout-minutes: 20
        steps:
          - uses: actions/checkout@v4
          - uses: supabase/setup-cli@v1
            with:
              version: 2.84.2
          - name: Subir Supabase local (migrations + seed)
            run: supabase start
          - name: Testes de banco (RLS)
            run: make test-db
    ```
  - Referência: `Makefile:14` (`REQUIRE_APP`), `.github/workflows/ci.yml:16-31`
  - Cobre: RF-12, CA-12
  - Verificar: `make test-db` local passa; `make help` lista `test-db` e `db-types`; renomeie o `supabase` do PATH temporariamente (ou rode com `PATH=/usr/bin:/bin`) e confirme que `make test-db` avisa e sai com 0

- [x] **T-05 — Domínio: unidades, perfil e permissões**
  - Arquivos: `criar src/domain/units.ts` · `criar src/domain/profile.ts` · `criar src/domain/permissions.ts` · `criar src/domain/permissions.test.ts` · `criar src/domain/units.test.ts` · `alterar src/theme/theme.ts` (troque a declaração de `UnitId` por `import type { UnitId } from '@/domain/units';` + `export type { UnitId };`)
  - O que fazer: contratos da seção 2.3. Em `permissions.test.ts`, escreva um teste por linha da tabela da seção 7.2 da spec, e mais estas combinações: sem sessão; sessão sem papéis; só `unit_publisher`; só `unit_leader`; só `stake_leader`; só `admin` (→ `'member'`, publica em tudo, não lidera nada); `unit_leader` em `criciuma1` + `unit_publisher` em `icara` (somas por unidade, `'leader'`); `admin` + `unit_leader` (→ `'leader'`). Verifique também a ordem de `publishableUnits` e `leadableUnits` (`stake_leader` → os 7 ids na ordem de `unitIds`). Em `units.test.ts`, verifique que `unitIds` bate com `unitOrder` de `theme.ts` e teste `isUnitId`.
  - Referência: `src/i18n/resolveLanguage.test.ts:1-30` (teste de função pura)
  - Cobre: CA-08, RF-09, RNF-04
  - Verificar: `make test` (cobertura de `src/domain` ≥ 80%) e `make lint`

- [x] **T-06 — Cliente Supabase e tipos do banco**
  - Arquivos: `alterar package.json` / `package-lock.json` (via `npx expo install @supabase/supabase-js`) · `criar src/lib/database.types.ts` (via `make db-types`, com o banco local rodando) · `criar src/lib/supabase.ts` · `criar src/lib/supabase.test.ts`
  - O que fazer: implemente `getSupabase()` (seção 2.3) com `createClient<Database>(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } })`. Leia as variáveis com acesso direto `process.env.EXPO_PUBLIC_SUPABASE_URL` / `process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY` (o Expo só embute acesso direto, sem desestruturar). O cliente é criado uma vez e reaproveitado. Testes, com `jest.isolateModules` e `process.env` restaurado no `afterEach`: lança erro quando falta a URL ou a chave; cria o cliente com `persistSession: false` (`jest.mock('@supabase/supabase-js')` e verificar os argumentos de `createClient`); a segunda chamada devolve a mesma instância.
  - Referência: `src/i18n/index.ts:17-25` (instância explícita com comentário do porquê)
  - Cobre: RNF-03 (parte), base para RF-10
  - Verificar: `make test` (cobertura de `src/lib` ≥ 80%; `database.types.ts` só tem tipos e não conta linhas) e `make lint`

- [x] **T-07 — Teste de ausência da service role**
  - Arquivos: `criar src/lib/secrets.test.ts`
  - O que fazer: um teste `CA-13: no service role key in src or public env vars` que percorre recursivamente `src/` com `fs` e falha se algum arquivo, exceto o próprio teste, contiver `service_role` ou `SERVICE_ROLE` (case-insensitive). Ele também lê `.env.example` e falha se alguma variável `EXPO_PUBLIC_*` tiver `SERVICE` no nome. Monte o padrão por concatenação (`'service' + '_role'`) para o arquivo não casar consigo mesmo.
  - Referência: `src/i18n/locales.test.ts` (teste que lê arquivos do projeto)
  - Cobre: CA-13, RNF-03
  - Verificar: `make test`

- [x] **T-08 — API do viewer, provider e layout**
  - Arquivos: `criar src/features/viewer/api.ts` · `criar src/features/viewer/api.test.ts` · `criar src/features/viewer/ViewerProvider.tsx` · `criar src/features/viewer/ViewerProvider.test.tsx` · `alterar src/app/_layout.tsx`
  - O que fazer:
    - `api.ts` conforme a seção 2.3. Em `api.test.ts`, faça `jest.mock('@/lib/supabase')` com um `from()` encadeável falso e cubra três casos: mapeia linhas para `Profile`/`Membership`; descarta membership com `role` desconhecido; lança erro quando o Supabase devolve `error`.
    - `ViewerProvider.tsx` conforme a seção 2.3.
    - Em `ViewerProvider.test.tsx`, use `jest.mock('./api', () => ({ ...jest.requireActual('./api'), fetchViewerData: jest.fn() }))`. Crie um `QueryClient` novo por teste com `defaultOptions: { queries: { retry: false, gcTime: Infinity } }` e um wrapper com `QueryClientProvider` + `ViewerProvider`. Use `await renderHook(() => useViewer(), { wrapper })` e `waitFor`. Testes:
      - `CA-09`: sem sessão → `kind = 'visitor'`, `canPublish('estaca') = false` e `fetchViewerData` não é chamado.
      - `CA-10`: sessão do `bispo.criciuma1` com resposta mockada (`unit_leader` em `criciuma1`) → `kind = 'leader'`, `canLead('criciuma1') = true`, `canLead('icara') = false`.
      - `CA-11`: sessão com `fetchViewerData` rejeitando e sem cache → `kind = 'member'`, `canPublish('estaca') = false`, `publishableUnits = []` e `leadableUnits = []`.
      - Teste de 7.4, sem CA: `queryClient.setQueryData(viewerQueryKey(id), dadosDeLíder)` antes de renderizar, refetch rejeitando → continua `'leader'`.
      - `useViewer` fora do provider lança o erro do contrato.
    - `_layout.tsx`: envolva o `<Stack>` (dentro do `QueryClientProvider`) com `<ViewerProvider session={null}>`, com o comentário `// auth-account replaces null with the Supabase session.`
  - Referência: `src/features/home/HomeScreen.test.tsx:1-18` (`await render` do RNTL 14, import de `@/i18n`), `src/app/_layout.tsx:43-48`
  - Cobre: CA-09, CA-10, CA-11, RF-10
  - Verificar: `make test` e `make check`

- [x] **T-09 — Documentação**
  - Arquivos: `alterar .ai/docs/SECURITY.md` · `alterar .ai/docs/BUSINESS.md` · `alterar .ai/docs/ARCHITECTURE.md` · `alterar .ai/docs/QA.md` · `alterar AGENTS.md`
  - O que fazer:
    - `SECURITY.md` › Autenticação e autorização: troque o "Modelo de permissão" pela tabela de papéis da seção 7.2 da spec. Descreva as funções `has_role`, `can_publish`, `can_lead`, `is_admin` e `is_stake_leader`. Registre que membro = conta autenticada sem linha em `memberships`, que `memberships` e `role_grants_log` não têm política de escrita (só RPCs `security definer`), e que `calling_processes`/`meeting_items` usam `can_lead`.
    - `BUSINESS.md`: em Entidades › Membership, use os papéis `unit_leader`, `unit_publisher`, `stake_leader`, `admin` (sem `member`) e `leadership_group`. Remova o "A definir" sobre presidentes de organizações: eles são `unit_publisher` e só publicam. No Glossário, acrescente `unit_publisher`.
    - `ARCHITECTURE.md`: tire `@supabase/supabase-js` da lista de "ainda não instalados". Na tabela de padrões, preencha "Migration com RLS" (a migration de T-01), "Teste de RLS" (`supabase/tests/base_rls.test.sql`) e "Acesso a dados" (`src/features/viewer/api.ts`). Cite `make db-types` em "Arquivos de configuração relevantes".
    - `QA.md` e `AGENTS.md`: acrescente `make test-db` (e `make db-types` no `AGENTS.md`) às tabelas de comandos.
  - Referência: seção 7.2 da spec
  - Cobre: DoD (docs)
  - Verificar: revisão manual; `make lint` (Markdown fica fora do Prettier)

## 5. Matriz de cobertura

| CA | Tarefa | Tipo de teste | Arquivo de teste |
| -- | ------ | ------------- | ---------------- |
| CA-01 | T-01, T-03 | banco (pgTAP) | `supabase/tests/base_rls.test.sql` |
| CA-02 | T-01, T-03 | banco (pgTAP) | `supabase/tests/base_rls.test.sql` |
| CA-03 | T-01, T-03 | banco (pgTAP) | `supabase/tests/base_rls.test.sql` |
| CA-04 | T-01, T-03 | banco (pgTAP) | `supabase/tests/base_rls.test.sql` |
| CA-05 | T-01, T-03 | banco (pgTAP) | `supabase/tests/base_rls.test.sql` |
| CA-06 | T-01, T-03 | banco (pgTAP) | `supabase/tests/base_rls.test.sql` |
| CA-07 | T-01, T-02, T-03 | banco (pgTAP) | `supabase/tests/base_rls.test.sql` |
| CA-08 | T-05 | unitário | `src/domain/permissions.test.ts` |
| CA-09 | T-08 | componente (hook com provider) | `src/features/viewer/ViewerProvider.test.tsx` |
| CA-10 | T-08 | componente (hook com provider) | `src/features/viewer/ViewerProvider.test.tsx` |
| CA-11 | T-08 | componente (hook com provider) | `src/features/viewer/ViewerProvider.test.tsx` |
| CA-12 | T-02, T-03, T-04 | banco (pgTAP) via `make test-db`, local e no job `db` da CI | `supabase/tests/base_rls.test.sql` |
| CA-13 | T-07 | unitário (varredura de arquivos) | `src/lib/secrets.test.ts` |

## 6. Riscos e mitigação

| Risco | Mitigação |
| ----- | --------- |
| Política de `memberships` chamando função que lê `memberships` entra em recursão | Funções `security definer` com owner `postgres` ignoram a RLS da tabela; o teste de `select` de `memberships` em T-03 pega a regressão |
| Regras de permissão divergem entre SQL e `domain/permissions.ts` | Mesmos cenários nos dois testes (T-03 e T-05) a partir da tabela 7.2; o banco continua sendo a barreira real |
| Seed de `auth.users` incompatível com a versão do GoTrue | Colunas de token preenchidas com `''` e `auth.identities` criada; o login por OTP com essas contas é verificado em `auth-account` |
| `supabase start` lento ou instável na CI | Job `db` separado com `timeout-minutes: 20`, sem bloquear o `check` |
| `database.types.ts` desatualizado depois de nova migration | `make db-types` documentado no `ARCHITECTURE.md`/`AGENTS.md`; o `tsc` quebra quando o código usa coluna inexistente |
| App sem `.env` quebra ao abrir | Cliente criado sob demanda; sem sessão, nenhuma consulta é feita (passo 5 do QA) |

## 7. Registro de implementação

<!-- Preenchido pelo implementer ao final. Não preencha ao criar o plano. -->

### Arquivos criados e alterados

Criados: `supabase/migrations/20261113220132_base_units_profiles_roles.sql`, `supabase/seed.sql`, `supabase/tests/base_rls.test.sql`, `src/domain/{units,profile,permissions}.ts`, `src/domain/{units,permissions}.test.ts`, `src/lib/{supabase,database.types}.ts`, `src/lib/{supabase,secrets}.test.ts`, `src/features/viewer/{api,ViewerProvider}.ts(x)`, `src/features/viewer/{api.test.ts,ViewerProvider.test.tsx}`.
Alterados: `supabase/config.toml` (`project_id`), `Makefile` (`test-db`, `db-types`, `REQUIRE_SUPABASE`), `.github/workflows/ci.yml` (job `db`), `src/theme/theme.ts` (`UnitId` reexportado de `@/domain/units`), `src/app/_layout.tsx`, `jest.config.js`, `package.json`/`package-lock.json` (`@supabase/supabase-js ^2.119.0`), `.ai/docs/{SECURITY,BUSINESS,ARCHITECTURE,QA}.md`, `AGENTS.md`.

### Desvios do plano

- `jest.config.js`: `database.types.ts` excluído da cobertura (o plano dizia que "não conta linhas", mas sem a exclusão ele contava).
- `src/lib/secrets.test.ts`: `/// <reference types="node" />` no topo, porque o `tsconfig` só carrega os tipos do `jest` (`@types/node` já existe transitivamente; nenhuma dependência nova).
- `src/lib/supabase.test.ts`: `jest.doMock` + `jest.requireActual` dentro de `isolateModules` (em vez de `jest.mock` + `require`), por causa da regra `no-require-imports` do lint.
- `src/theme/theme.ts`: o `import type` ficou no topo do arquivo (regra `import/first`), não no ponto exato da declaração antiga.
- Plano previa 63 asserções no pgTAP; o arquivo final tem 59 (contagem corrigida em `plan()`), sem asserção do plano faltando.

### Decisões durante a implementação

- Além das asserções obrigatórias, o pgTAP cobre RNF-05 (propriedades das 5 funções via `pg_proc`), `unit_publisher` na estaca, `admin` em ala e `display_name` curto.
- `ViewerProvider` usa `viewerQueryKey(userId ?? '')` com `enabled: userId !== null`; sem sessão ignora `query.data`.
- Primeira execução de `supabase start` falhou com o container de storage "unhealthy"; a segunda subiu normalmente (instabilidade local, sem mudança de configuração).

### CA sem teste automatizado

Nenhum. CA-01 a CA-07 e CA-12 pelo pgTAP (`make test-db`); CA-08 a CA-11 e CA-13 pelo Jest. O job `db` da CI não foi executado localmente (só o equivalente `make test-db`). O passo 5 do QA (abrir o app com `make dev`) não foi executado manualmente.
