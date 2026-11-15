# Plano: Chamados da liderança — catálogo, acesso por chamado e organograma automático

> **Spec:** `.ai/specs/roles-of-leadership.md`
> **Criado em:** 2026-11-15
> **ADRs relacionados:** nenhum novo (segue `0002-stack-inicial.md` e `0004-supabase-cloud.md`)

## 1. Abordagem

O acesso passa a ser decidido pelo banco. Duas migrations novas:

1. A primeira cria o catálogo (`calling_catalog` + `calling_catalog_log`), já com o seed do apêndice A, e a RPC de edição usada pelo admin.
2. A segunda cria `member_calls` e reescreve `has_role`, `can_publish`, `can_lead`, `is_stake_leader` e `is_admin` para derivar dos chamados. Nomes e assinaturas não mudam, então as políticas RLS que já existem continuam funcionando sem alteração.

`memberships` fica só com `admin`. O mapeamento dos papéis antigos para chamados fica numa função SQL pura (`legacy_role_to_calling`), que a migração usa e o pgTAP testa (CA-21). Depois da migração, o formato antigo de `memberships` deixa de existir.

As RPCs da `auth-account` que dependiam de papel (`grant_role`, `revoke_role`, `list_access`) são trocadas por `grant_calling`, `revoke_calling`, `grant_admin`, `revoke_admin` e por um `list_access` novo. O trigger `profiles_guard_home_unit` é reescrito sobre `member_calls`.

No app:
- O domínio ganha `src/domain/callings.ts`.
- `Membership` perde `leadershipGroup` e passa a ser derivada dos chamados.
- O viewer carrega os chamados da pessoa (`calls`).
- As telas de `features/account` passam a trabalhar com chamados.
- O catálogo é lido por uma query própria (`['callingCatalog']`).

**IDs nos testes:** esta spec repete IDs de CA que a `auth-account` também usa. Por isso, os testes desta spec levam o prefixo `[roles]` no nome (ex.: `[roles] CA-09: grants a calling`). Os testes adaptados da `auth-account` mantêm os IDs originais.

## 2. Contratos

### 2.1 Migration A: `supabase/migrations/<ts>_calling_catalog.sql`

```sql
create table public.calling_catalog (
  id text primary key,
  name_pt text not null check (char_length(btrim(name_pt)) between 2 and 80),
  name_en text null check (name_en is null or char_length(btrim(name_en)) between 1 and 80),
  name_es text null check (name_es is null or char_length(btrim(name_es)) between 1 and 80),
  level text not null check (level in ('stake','ward','branch','ward_branch')),
  access text not null default 'none'
    check (access in ('none','unit_publisher','unit_leader','stake_publisher','stake_leader')),
  notify_group text null check (notify_group in ('stake_presidency','high_council','bishoprics',
    'elders_quorum_presidency','relief_society_presidency','young_women_presidency',
    'primary_presidency','sunday_school_presidency','clerks','missionaries',
    'temple_family_history_workers','music','young_single_adult_leaders')),
  org_chart_section text null check (org_chart_section in ('stake_presidency','high_council',
    'stake_clerks','stake_organizations','bishopric','unit_clerks','unit_organizations')),
  sort_order int not null,
  active boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by uuid null,
  -- RF-02
  constraint calling_access_matches_level check (
    access = 'none'
    or (access in ('stake_publisher','stake_leader') and level = 'stake')
    or (access in ('unit_publisher','unit_leader') and level <> 'stake')),
  constraint calling_section_matches_level check (
    org_chart_section is null
    or (org_chart_section in ('stake_presidency','high_council','stake_clerks','stake_organizations'))
       = (level = 'stake'))
);
create unique index calling_catalog_level_name_key on public.calling_catalog (level, lower(name_pt));

create table public.calling_catalog_log (
  id uuid primary key default gen_random_uuid(),
  calling_id text not null,
  actor_id uuid null,
  before jsonb null,
  after jsonb not null,
  created_at timestamptz not null default now()
);

-- RLS: calling_catalog select to anon, authenticated using (active or is_admin());
--      calling_catalog_log select to authenticated using (is_admin()); no write policies.

-- RF-06, RF-07. p_id null = new (id = gen_random_uuid()::text; sort_order = max(sort_order) + 10).
create function public.save_calling(
  p_id text, p_name_pt text, p_name_en text, p_name_es text, p_level text, p_access text,
  p_notify_group text, p_org_chart_section text, p_active boolean) returns text;
--   not admin → 'not_authorized'; trims names, '' → null
--   name repeated in level → 'name_taken'; RF-02 → 'invalid_access' / 'invalid_section'
--   (checked explicitly before the write, so the error code is ours, not the constraint name)
--   level changed while someone holds it → 'level_locked'; active false while held → 'in_use'
--   section null → not null: holders with org_chart_consent null become 'pending'
--   writes calling_catalog_log (before = old row as jsonb or null, after = new row)
-- "Held" = rows in member_calls, created in migration B. Migration A creates save_calling without
-- the holder checks; migration B replaces it (`create or replace`) with them.

-- RF-21, RF-22: the {n} in the messages. Admin only (else 'not_authorized').
create function public.calling_holder_count(p_id text) returns int;
```

O seed do catálogo:
- é um `insert` com os 128 ids do apêndice A da spec, na ordem do apêndice (`sort_order` 10, 20, 30…);
- copia `access`, `notify_group` e `org_chart_section` da tabela do apêndice;
- preenche `name_en` e `name_es` com os nomes oficiais do *General Handbook* (inglês) e do *Manual General* (espanhol). Exemplos: `Bishop` / `Obispo`; `Relief Society President` / `Presidenta de la Sociedad de Socorro`; `Stake President` / `Presidente de estaca`.

### 2.2 Migration B: `supabase/migrations/<ts>_member_calls.sql`

```sql
create table public.member_calls (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  unit_id text not null references public.units (id),
  calling_id text not null references public.calling_catalog (id),
  granted_by uuid null references public.profiles (id) on delete set null,
  granted_at timestamptz not null default now(),
  org_chart_consent text null check (org_chart_consent in ('pending','accepted','declined')),
  org_chart_consent_at timestamptz null,
  unique (user_id, unit_id, calling_id)
);
-- RLS: select to authenticated using (user_id = auth.uid() or is_stake_leader() or is_admin()); no writes.

alter table public.role_grants_log add column calling_id text null;

-- Pure mapping (RF-23), tested by pgTAP. Kept after the migration; execute revoked from
-- public, anon and authenticated.
create function public.legacy_role_to_calling(p_role text, p_group text, p_unit_kind text)
returns text language sql immutable;
--   ('stake_leader','stake_presidency',any)  → 'stake_first_counselor'
--   ('stake_leader', null, any)              → 'high_councilor'
--   ('unit_leader','bishops','ward')         → 'bishop'
--   ('unit_leader','bishops','branch')       → 'branch_president'
--   ('unit_leader', null, any)               → 'unit_clerk'
--   ('unit_publisher', any, any)             → 'unit_activities_committee_chair'
--   anything else                            → null

-- Conversion, in this order:
--   insert into member_calls (user_id, unit_id, calling_id, granted_by, granted_at, org_chart_consent)
--     from memberships where role <> 'admin', calling = legacy_role_to_calling(role, leadership_group,
--     units.kind), consent = 'pending' when the calling has a section, else null;
--   role_grants_log ('granted', user_id, unit_id, role, calling_id, actor_id null) for each one;
--   delete those rows from memberships;
--   alter table memberships drop column leadership_group;
--   alter table memberships add constraint memberships_admin_only check (role = 'admin').

-- Permission functions: same names and signatures; security definer, stable, search_path = public.
--   my_accesses() returns table(unit_id text, access text): active callings of auth.uid() (private helper)
--   has_role(p_unit, p_roles): ('admin' = any(p_roles) and is_admin())
--                              or exists my_accesses with access = any(p_roles) and unit_id = p_unit
--   is_admin():            memberships with role 'admin'
--   is_stake_leader():     exists my_accesses with access = 'stake_leader'
--   is_stake_publisher():  exists my_accesses with access = 'stake_publisher'   (new)
--   can_publish(p_unit):   has_role(p_unit, {unit_leader, unit_publisher}) or is_stake_leader()
--                          or (p_unit = 'estaca' and is_stake_publisher()) or is_admin()
--   can_lead(p_unit):      same rule as today

-- RPCs: security definer, search_path = public, 'not_authenticated' check first,
-- execute granted only to authenticated (except org_chart_members).
create function public.grant_calling(p_email text, p_unit_id text, p_calling_id text) returns uuid;
--   not stake_leader nor admin                               → 'not_authorized'
--   no account (profiles join auth.users on lower(email))   → 'no_account'
--   calling missing or inactive                              → 'invalid_calling'
--   home_unit_id null                                        → 'no_home_unit'
--   level does not fit the unit kind (stake ↔ 'estaca'; ward ↔ ward; branch ↔ branch;
--     ward_branch ↔ ward or branch)                          → 'invalid_unit_for_calling'
--   level <> 'stake' and p_unit_id <> home_unit_id           → 'wrong_unit'
--   same (user, unit, calling) already there                 → 'already_granted'
--   insert (consent 'pending' if the calling has a section, else null)
--   + role_grants_log ('granted', user, unit, role = access, calling_id, actor)
create function public.revoke_calling(p_member_call_id uuid) returns void;
--   checks, in this order: authorization ('not_authorized'), 'not_found', 'cannot_revoke_self';
--   delete + role_grants_log ('revoked', ..., role = current access, calling_id)
create function public.grant_admin(p_email text) returns void;     -- admin only; no_account, no_home_unit, already_granted
create function public.revoke_admin(p_user_id uuid) returns void;  -- admin only; cannot_revoke_self, not_found
drop function public.grant_role(text, text, text, text);
drop function public.revoke_role(uuid);
drop function public.list_access();
create function public.list_access()
returns table (entry_id uuid, kind text, user_id uuid, display_name text, email text, unit_id text,
               calling_id text, calling_name_pt text, calling_name_en text, calling_name_es text);
--   kind 'calling' (entry_id = member_calls.id) union kind 'admin' (entry_id = memberships.id,
--   unit 'estaca', calling_* null); order by units.sort_order, display_name, kind

create function public.set_org_chart_consent(p_member_call_id uuid, p_accepted boolean) returns void;
--   not the owner → 'not_found'; calling without section → 'invalid_calling';
--   sets 'accepted' or 'declined' and org_chart_consent_at = now()

create function public.org_chart_members()
returns table (member_call_id uuid, unit_id text, section text, calling_id text,
               calling_name_pt text, calling_name_en text, calling_name_es text,
               display_name text, sort_order int);
--   execute to anon, authenticated (RF-18); only active callings with a section and consent 'accepted'

-- export_my_data(): create or replace, adding
--   'calls': [{unit_id, calling_id, calling_name (name_pt), org_chart_consent, granted_at}] (RNF-06).
--   'memberships' stays (now only admin rows, without leadership_group).

-- profiles_guard_home_unit(): create or replace —
--   new home null and (any member_calls row or is admin)   → 'home_unit_locked'
--   any member_calls row whose calling level <> 'stake'     → 'home_unit_locked'

-- save_calling: create or replace with the holder checks (2.1).
```

### 2.3 `src/domain`

```ts
// src/domain/units.ts — add
export type UnitKind = 'stake' | 'ward' | 'branch';
export function unitKind(id: UnitId): UnitKind; // estaca → stake; ramoGaivota → branch; the others → ward

// src/domain/callings.ts
export type CallingLevel = 'stake' | 'ward' | 'branch' | 'ward_branch';
export type CallingAccess = 'none' | 'unit_publisher' | 'unit_leader' | 'stake_publisher' | 'stake_leader';
export type NotifyGroup =
  | 'stake_presidency' | 'high_council' | 'bishoprics' | 'elders_quorum_presidency'
  | 'relief_society_presidency' | 'young_women_presidency' | 'primary_presidency'
  | 'sunday_school_presidency' | 'clerks' | 'missionaries' | 'temple_family_history_workers'
  | 'music' | 'young_single_adult_leaders';
export type OrgChartSection =
  | 'stake_presidency' | 'high_council' | 'stake_clerks' | 'stake_organizations'
  | 'bishopric' | 'unit_clerks' | 'unit_organizations';
export type OrgChartConsent = 'pending' | 'accepted' | 'declined';
export type Calling = {
  id: string; namePt: string; nameEn: string | null; nameEs: string | null;
  level: CallingLevel; access: CallingAccess; notifyGroup: NotifyGroup | null;
  orgChartSection: OrgChartSection | null; sortOrder: number; active: boolean;
};
export type MemberCall = { id: string; unitId: UnitId; calling: Calling; orgChartConsent: OrgChartConsent | null };
export const notifyGroups: readonly NotifyGroup[]; // RF-04 order
export function callingName(calling: Pick<Calling, 'namePt' | 'nameEn' | 'nameEs'>, locale: Locale): string; // RF-03
export function levelFitsUnit(level: CallingLevel, unitId: UnitId): boolean;
export function callingsForUnit(catalog: readonly Calling[], unitId: UnitId): Calling[]; // active, fits, by sortOrder
export function accessesForLevel(level: CallingLevel): CallingAccess[];   // RF-21
export function sectionsForLevel(level: CallingLevel): OrgChartSection[]; // RF-05
export function normalizeSearch(text: string): string; // trim, lowercase, NFD without diacritics
export function matchesCalling(calling: Calling, term: string): boolean; // term ≥ 2 chars, any of the 3 names
export function membershipsFromCalls(calls: readonly MemberCall[]): Membership[];
//   only active callings with access <> 'none' → { unitId, role: access }

// src/domain/permissions.ts — alter
export type Role = 'unit_leader' | 'unit_publisher' | 'stake_publisher' | 'stake_leader' | 'admin';
export type Membership = { unitId: UnitId; role: Role }; // leadershipGroup removed
// canPublish: add (unitId === 'estaca' && memberships.some((m) => m.role === 'stake_publisher'))
// remove LeadershipGroup and isLeadershipGroup; viewerKind unchanged
```

`src/domain/access.ts` mantém `canManageAccess`. `grantableRoles` e `groupsFor` saem, porque deixam de ser usados.

### 2.4 App

```ts
// src/features/viewer/api.ts
export type ViewerData = { profile: Profile | null; memberships: Membership[]; calls: MemberCall[] };
//   member_calls: select 'id, unit_id, org_chart_consent, calling_catalog(id, name_pt, name_en, name_es,
//     level, access, notify_group, org_chart_section, sort_order, active)', eq user_id
//   memberships: select 'unit_id, role' (admin only), eq user_id
//   memberships = membershipsFromCalls(calls) + the admin rows; rows with unknown values are dropped
// The Viewer (ViewerProvider) gains `calls: readonly MemberCall[]`.

// src/features/account/api.ts — replaces grantRole, revokeRole and AccessEntry
export type AccountErrorCode = /* existing codes */ | 'invalid_calling' | 'invalid_unit_for_calling'
  | 'name_taken' | 'level_locked' | 'in_use' | 'invalid_access' | 'invalid_section';
export type AccessEntry = {
  entryId: string; kind: 'calling' | 'admin'; userId: string; displayName: string; email: string;
  unitId: UnitId; calling: Pick<Calling, 'id' | 'namePt' | 'nameEn' | 'nameEs'> | null;
};
export async function listAccess(): Promise<AccessEntry[]>;
export async function grantCalling(input: { email: string; unitId: UnitId; callingId: string }): Promise<void>;
//   track('calling_granted', { membership_id, calling_id })
export async function revokeCalling(memberCallId: string): Promise<void>; // track('calling_revoked', { membership_id })
export async function grantAdmin(email: string): Promise<void>;           // track('role_granted')
export async function revokeAdmin(userId: string): Promise<void>;         // track('role_revoked')
export const callingCatalogQueryKey = ['callingCatalog'] as const;
export async function fetchCallingCatalog(): Promise<Calling[]>; // order by level, sort_order
export async function saveCalling(input: Omit<Calling, 'id' | 'sortOrder'> & { id: string | null }): Promise<string>;
//   track('calling_catalog_saved', { calling_id })
export async function callingHolderCount(id: string): Promise<number>;
export async function setOrgChartConsent(memberCallId: string, accepted: boolean): Promise<void>;
//   track('org_chart_consent_changed', { membership_id })

// src/lib/telemetry.ts
//   TelemetryEvent gains 'calling_granted' | 'calling_revoked' | 'calling_catalog_saved' | 'org_chart_consent_changed';
//   TelemetryProps gains calling_id?: string.
```

### 2.5 Telas e rotas

| Arquivo | Conteúdo |
| --- | --- |
| `src/features/account/CallingPickerSheet.tsx` | `Sheet` com `SearchField` `Buscar chamado` e uma `FlatList` de `ListItem`. Cada item tem o nome como título e, se o acesso não for `none`, o rótulo do acesso como subtítulo. Props: `visible`, `unitId`, `catalog`, `includeAdmin`, `onSelect(callingId \| 'admin')`, `onClose` |
| `src/features/account/MyCallingsSection.tsx` | Seção `MEUS CHAMADOS` do Perfil (RF-16) |
| `src/features/account/OrgChartConsentCard.tsx` | Cartão de RF-17; mostra o primeiro chamado em `pending`, na ordem de `granted_at` |
| `src/features/account/CallingsCatalogScreen.tsx` | RF-20 |
| `src/features/account/CallingFormScreen.tsx` | RF-21 e RF-22; com `id = 'new'`, cria um chamado |
| `src/app/profile/callings-catalog/index.tsx` | Re-export de `CallingsCatalogScreen` |
| `src/app/profile/callings-catalog/[id].tsx` | Re-export de `CallingFormScreen` |

Se quem abre as telas do catálogo não for `admin`, elas mostram `ScreenHeader` e `EmptyState` com a chave já existente `account.access.restricted` (`Acesso restrito`).

### 2.6 i18n (3 locales; o pt-BR copia a spec ao pé da letra)

```
callings.access.none ("Nenhum"), .unit_publisher, .unit_leader, .stake_publisher, .stake_leader
callings.levels.stake ("Estaca"), .ward ("Ala"), .branch ("Ramo"), .ward_branch ("Ala e ramo")
callings.groups.<13 keys> (RF-04), callings.groups.none ("Nenhum")
callings.sections.<7 keys> (RF-05), .bishopric_branch ("Presidência do ramo"), .none ("Não aparece")
callings.mine.title ("MEUS CHAMADOS"), .showInOrgChart ("Mostrar no organograma"),
               .showInOrgChartA11y ("Mostrar {{calling}} no organograma")
callings.consent.message (RF-17, {{calling}}, {{unit}}), .show ("Mostrar"), .notNow ("Agora não"),
                .shown ("Seu nome aparece no organograma.")
callings.catalog.title ("Catálogo de chamados"), .new ("Novo chamado"), .search ("Buscar chamado"),
                .tabStake ("Estaca"), .tabUnits ("Alas e ramo"), .inactive ("Inativo"), .empty ({{term}})
callings.form.namePt ("Nome (português)"), .nameEn ("Nome (inglês)"), .nameEs ("Nome (espanhol)"),
             .level ("Nível"), .access ("Acesso"), .group ("Grupo de aviso"), .section ("Seção do organograma"),
             .active ("Ativo"), .save ("Salvar"), .saved ("Chamado salvo"),
             .errors.nameRequired, .errors.nameLength, .errors.nameTaken, .errors.levelLocked,
             .errors.inUse ({{count}}), .confirmAccess.title ("Mudar o acesso?"),
             .confirmAccess.message ({{count}}, {{access}}), .confirmAccess.confirm ("Mudar")
account.access.calling ("Chamado"), .callingPlaceholder ("Selecione"), .admin ("Administração"),
  .granted → "Chamado concedido", .alreadyGranted → "Esta pessoa já tem este chamado nesta unidade.",
  .revokeTitle → "Remover chamado?", .revokeMessage → "{{name}} deixa de ter o chamado \"{{calling}}\" em {{unit}}.",
  .revoked ("Chamado removido")
```

Remover as chaves que deixam de ser usadas: `account.roles.*`, `account.groups.*`, `account.access.role` e `account.access.group`.

## 3. Dependências novas

Nenhuma.

## 4. Tarefas

- [x] **T-01 — Catálogo no banco (RF-01 a RF-07)**
  - Arquivos: `criar supabase/migrations/<ts>_calling_catalog.sql` (`supabase migration new calling_catalog`) · `criar supabase/tests/callings.test.sql`
  - O que fazer:
    - Criar a tabela, a RLS, o log, a `save_calling` (sem a checagem de quem tem o chamado) e a `calling_holder_count`, conforme 2.1.
    - Fazer o seed dos 128 chamados com os 3 nomes. Conferir a contagem e as colunas `access`, `notify_group` e `org_chart_section` linha a linha contra o apêndice A da spec.
    - Testes pgTAP, com prefixo `[roles]`:
      - "CA-01": a contagem bate com o apêndice, nenhum `name_en`/`name_es` é nulo, e as linhas de `bishop`, `relief_society_president`, `stake_relief_society_president`, `high_councilor` e `sunday_school_teacher` estão como no apêndice;
      - "CA-02": `save_calling` de um chamado de estaca com `unit_publisher` devolve `invalid_access`;
      - "CA-03": `anon` lê só os ativos; `insert` e `update` diretos falham;
      - "CA-04": `stake_leader` chamando `save_calling` devolve `not_authorized`;
      - `name_taken`;
      - criar um chamado grava em `calling_catalog_log`.
  - Referência: `supabase/migrations/20261115030703_account_rpcs.sql:1-40`, `supabase/tests/account.test.sql:1-30`
  - Cobre: CA-01, CA-02, CA-03, CA-04
  - Verificar: `supabase db reset && make test-db`

- [x] **T-02 — Chamados das pessoas e permissões (RF-08 a RF-11, RF-23, RF-24)**
  - Arquivos: `criar supabase/migrations/<ts>_member_calls.sql` (schema, funções de permissão, mapeamento, conversão, trigger e `save_calling` com a checagem de quem tem o chamado) · `alterar supabase/seed.sql` · `alterar supabase/tests/callings.test.sql` · `alterar supabase/tests/base_rls.test.sql` · `alterar supabase/tests/account.test.sql`
  - O que fazer:
    - Implementar 2.2 até o trigger. As RPCs de concessão ficam para a T-03; até lá, `grant_role` e `revoke_role` podem continuar existindo.
    - Seed (RF-24):
      - `member_calls` para o bispo (`bishop`, `criciuma1`), o publicador (`relief_society_president`, `icara`) e a conta estaca (`stake_first_counselor`, `estaca`), todos com `org_chart_consent = 'pending'`;
      - `memberships` fica só com o admin;
      - atualizar o `insert` de `role_grants_log`.
    - Testes pgTAP:
      - "CA-05": com `relief_society_president` em `icara`, `can_publish('icara')` é `true`, `can_lead('icara')` é `false` e `can_publish('criciuma1')` é `false`;
      - "CA-06": com `stake_relief_society_president`, `can_publish('estaca')` é `true`, `can_publish('icara')` é `false` e `can_lead('estaca')` é `false`;
      - "CA-03" (`member_calls`): o membro só vê as próprias linhas, e a escrita direta falha;
      - "CA-21": `legacy_role_to_calling` com as 6 combinações, e `memberships` só aceita `admin`;
      - `leadership_group` não existe mais em `memberships`;
      - "CA-22": o bispo trocar a própria unidade devolve `home_unit_locked`.
    - Em `base_rls.test.sql` e `account.test.sql`, ajustar os casos que dependem de papéis de unidade em `memberships` ou de `leadership_group`, mantendo os IDs originais.
  - Referência: `supabase/migrations/20261113220132_base_units_profiles_roles.sql:56-86` (funções de permissão), `supabase/migrations/20261115173955_role_home_unit.sql:60-84` (trigger)
  - Cobre: CA-03, CA-05, CA-06, CA-21, CA-22 (banco)
  - Verificar: `supabase db reset && make test-db`

- [x] **T-03 — RPCs de concessão, consentimento, organograma e exportação (RF-12 a RF-19, RNF-06)**
  - Arquivos: `alterar supabase/migrations/<ts>_member_calls.sql` (o mesmo arquivo da T-02, ainda não aplicado em nenhum ambiente remoto) · `alterar supabase/tests/callings.test.sql` · `alterar supabase/tests/account.test.sql` · `alterar src/lib/database.types.ts` (`make db-types`)
  - O que fazer:
    - Criar `grant_calling`, `revoke_calling`, `grant_admin`, `revoke_admin`, o novo `list_access`, `set_org_chart_consent`, `org_chart_members` e o `export_my_data` com `calls`. Remover `grant_role` e `revoke_role`.
    - Migrar para `grant_calling` os testes da `auth-account` que usavam `grant_role` (os CA-15, CA-16, CA-18, CA-19, CA-24 e CA-25 dela). O CA-19 passa a ser: a conta estaca chamando `grant_admin` devolve `not_authorized`.
    - Testes pgTAP `[roles]`:
      - "CA-08": `bishop` em `criciuma2` para quem é de `criciuma1` devolve `wrong_unit`; em `criciuma1` funciona; `branch_president` em `criciuma1` devolve `invalid_unit_for_calling`; `high_councilor` em `estaca` funciona;
      - "CA-09": cria a linha, e o log tem `calling_id`;
      - "CA-12": `revoke_calling` remove a linha, e o `can_publish` muda;
      - `cannot_revoke_self`;
      - "CA-13": com `accepted`, a pessoa aparece em `org_chart_members()`;
      - "CA-14": com `declined`, não aparece;
      - "CA-15": `anon` executa `org_chart_members()`, e o resultado não tem as colunas `email` nem `user_id`;
      - "CA-18": desativar um chamado em uso devolve `in_use`, e `calling_holder_count` devolve 1;
      - "CA-19": mudar o `access` de `relief_society_counselor_1` (1 pessoa) faz o `can_publish` dela virar `true`, e o log tem `before` e `after`;
      - mudar o nível de um chamado em uso devolve `level_locked`;
      - "CA-23": o `export_my_data` de quem tem 2 chamados traz `calls` com 2 itens;
      - quando um chamado sem seção ganha uma, quem já o tem passa para `pending`.
  - Referência: `supabase/migrations/20261115173955_role_home_unit.sql:5-58` (`grant_role` com a regra de unidade), `supabase/migrations/20261115030703_account_rpcs.sql:35-103`
  - Cobre: CA-08, CA-09, CA-12, CA-13, CA-14, CA-15, CA-18, CA-19, CA-23 (banco)
  - Verificar: `supabase db reset && make test-db && make db-types && make lint`

- [x] **T-04 — Domínio (RF-03, RF-09, RF-13, RF-20, RF-21)**
  - Arquivos: `criar src/domain/callings.ts` (+ `callings.test.ts`) · `alterar src/domain/units.ts` (+ teste) · `alterar src/domain/permissions.ts` (+ teste) · `alterar src/domain/access.ts` (+ teste)
  - O que fazer:
    - Implementar o contrato 2.3.
    - A mudança de tipo em `Membership` quebra o `tsc` no viewer e em `account` até a T-05. Faça a T-04 e a T-05 em sequência e só faça commit com o `make check` verde. Se precisar, junte as duas num commit só.
    - Testes `[roles]`:
      - "CA-05" e "CA-06": o espelho de `canPublish` e `canLead`;
      - "CA-10": `callingsForUnit(catalog, 'ramoGaivota')` inclui `branch_president` e os `ward_branch`, e não inclui `bishop`;
      - "CA-17": `matchesCalling` com `primaria` encontra `Presidente da Primária`;
      - "CA-24": `callingName` em `en-US`, e a volta ao pt-BR quando `nameEn` é nulo;
      - `accessesForLevel`, `sectionsForLevel`, e `membershipsFromCalls`, que ignora chamados `none` e inativos.
  - Referência: `src/domain/permissions.ts`, `src/domain/permissions.test.ts`
  - Cobre: CA-05, CA-06, CA-10, CA-17, CA-24 (domínio)
  - Verificar: `make test`

- [x] **T-05 — Viewer com chamados (RF-09)**
  - Arquivos: `alterar src/features/viewer/api.ts` (+ teste) · `alterar src/features/viewer/ViewerProvider.tsx` (+ teste) · `alterar src/lib/telemetry.ts` (+ teste) · `alterar` os usos de `leadershipGroup` em `src/features/account/*`, só o necessário para compilar (a interface muda nas T-07 a T-09)
  - O que fazer:
    - Implementar o contrato 2.4 (`ViewerData` e `Viewer.calls`) e os eventos novos de telemetria.
    - Teste "[roles] CA-07": com `high_councilor` e `sunday_school_teacher`, o `kind` é `leader` e `tabsFor` inclui `callings`.
  - Referência: `src/features/viewer/api.ts:22-63`
  - Cobre: CA-07
  - Verificar: `make check`

- [x] **T-06 — API da conta e i18n**
  - Arquivos: `alterar src/features/account/api.ts` (+ `api.test.ts`) · `alterar src/i18n/locales/*.json` (seção 2.6)
  - O que fazer:
    - Implementar o contrato 2.4: chamar as RPCs e traduzir o `message` de erro para `AccountErrorCode`.
    - Testes:
      - o mapeamento de cada código de erro;
      - `grantCalling` envia o `p_email` normalizado;
      - `fetchCallingCatalog` converte as colunas para `Calling`;
      - `saveCalling` com `id: null`.
  - Referência: `src/features/account/api.ts:1-145`
  - Cobre: base para CA-09 a CA-20
  - Verificar: `make test`

- [x] **T-07 — Acessos por chamado (RF-12 a RF-15)**
  - Arquivos: `alterar src/features/account/AccessScreen.tsx` (+ teste) · `alterar src/features/account/GrantAccessSheet.tsx` (+ teste) · `criar src/features/account/CallingPickerSheet.tsx` (+ teste)
  - O que fazer:
    - Cada item da lista tem o subtítulo `{e-mail} · {chamado}` (`Administração` para `admin`) e o `accessibilityLabel` `{nome}, {chamado}, {unidade}` (RNF-07).
    - O sheet de concessão tem:
      - o campo de e-mail;
      - os chips de unidade; trocar a unidade limpa o chamado escolhido;
      - um `ListItem` `Chamado` com o chamado escolhido (ou `Selecione`), que abre o `CallingPickerSheet`. Escolher `admin` chama `grantAdmin`.
    - Remover usa os textos de RF-14. No item `admin`, chama `revokeAdmin`. No item da própria pessoa, mostra a mensagem de RF-14.
    - Testes `[roles]`:
      - "CA-09": conceder `Presidente da Primária` em `Ala Içara` chama `grantCalling` e mostra o toast `Chamado concedido`;
      - "CA-10": no Ramo Gaivota, o picker mostra `Presidente do Ramo` e não mostra `Bispo`;
      - "CA-11": `Administração` só aparece para `admin`, em primeiro lugar;
      - "CA-12": remover, com confirmação, chama `revokeCalling` e mostra o toast `Chamado removido`;
      - os erros `already_granted`, `no_home_unit` e `wrong_unit`.
  - Referência: `src/features/account/AccessScreen.tsx`, `src/features/account/GrantAccessSheet.tsx`, `src/components/SearchField.tsx`
  - Cobre: CA-09, CA-10, CA-11, CA-12 (app), RNF-07
  - Verificar: `make test`

- [x] **T-08 — Meus chamados e consentimento (RF-16, RF-17)**
  - Arquivos: `criar src/features/account/MyCallingsSection.tsx` (+ teste) · `criar src/features/account/OrgChartConsentCard.tsx` (+ teste) · `alterar src/features/account/ProfileScreen.tsx` (+ teste)
  - O que fazer:
    - O cartão fica no topo do Perfil; a seção fica depois de `Idioma`.
    - O switch e os botões chamam `setOrgChartConsent` e invalidam `['viewer']`. Ao aceitar, aparece o toast de RF-17.
    - O switch tem o rótulo de acessibilidade de RNF-08.
    - Testes `[roles]`:
      - "CA-13": `Mostrar` chama `setOrgChartConsent(id, true)` e mostra o toast;
      - "CA-14": `Agora não` chama `setOrgChartConsent(id, false)`, e o cartão some;
      - "CA-16": um chamado sem seção aparece sem switch e sem cartão;
      - "CA-24": em `en-US`, aparece `Bishop`;
      - "CA-22": a mensagem `home_unit_locked` continua aparecendo (ajustar o teste existente para chamados);
      - um Perfil sem chamados não mostra a seção.
  - Referência: `src/features/account/ProfileScreen.tsx`, `src/components/ListItem.tsx` (`trailing` `switch`)
  - Cobre: CA-13, CA-14, CA-16, CA-22, CA-24 (app), RNF-08
  - Verificar: `make test`

- [x] **T-09 — Catálogo de chamados para o admin (RF-20 a RF-22)**
  - Arquivos: `criar src/features/account/CallingsCatalogScreen.tsx` (+ teste) · `criar src/features/account/CallingFormScreen.tsx` (+ teste) · `criar src/app/profile/callings-catalog/index.tsx` · `criar src/app/profile/callings-catalog/[id].tsx` · `alterar src/features/account/ProfileScreen.tsx` (item `Catálogo de chamados`, só para `admin`)
  - O que fazer:
    - Seguir o contrato 2.5. Os chips de acesso e de seção vêm de `accessesForLevel` e `sectionsForLevel`. Trocar o nível limpa as escolhas que deixam de valer.
    - Cada linha de chips é um `View` com `accessibilityRole="radiogroup"` e `accessibilityLabel` com o nome do campo (RNF-09).
    - Ao salvar um chamado que já existe com outro `access`, chamar `callingHolderCount`. Se o resultado for maior que 0, mostrar o `ConfirmSheet` de RF-22 antes do `saveCalling`.
    - `in_use` e `level_locked` mostram as mensagens de RF-21, com a contagem de `callingHolderCount`.
    - Testes `[roles]`:
      - "CA-17": a busca `primaria` filtra a lista;
      - "CA-18": `in_use` mostra a mensagem com a contagem;
      - "CA-19": mudar o acesso de um chamado com 1 pessoa pede confirmação e só salva depois dela;
      - "CA-20": `stake_leader` não vê o item no Perfil, e a rota mostra `Acesso restrito`;
      - criar um chamado volta para a lista e mostra o toast `Chamado salvo`;
      - a validação dos nomes.
  - Referência: `src/features/account/AccessScreen.tsx` (lista com acesso restrito), `src/components/Segmented.tsx`, `src/components/FilterChip.tsx`
  - Cobre: CA-17, CA-18, CA-19, CA-20 (app), RNF-09
  - Verificar: `make check`

- [x] **T-10 — Documentação**
  - Arquivos: `alterar .ai/docs/SECURITY.md` · `alterar .ai/docs/BUSINESS.md` · `alterar .ai/docs/ARCHITECTURE.md` · `alterar supabase/snippets/grant_admin.sql` (só o comentário, se citar `leadership_group`)
  - O que fazer:
    - `SECURITY.md`:
      - descrever o modelo de permissão por chamado, com a tabela de níveis, inclusive `stake_publisher`;
      - registrar que `memberships` guarda só `admin`;
      - incluir as RPCs novas;
      - em "Dados tratados", incluir `member_calls` como dado sensível, com consentimento para o organograma.
    - `BUSINESS.md`: entradas no glossário para `Catálogo de chamados` e `Publicação da estaca`, e uma nota em RN-02 sobre `stake_publisher`.
    - `ARCHITECTURE.md`: o padrão "Acesso derivado de chamado".
  - Referência: as seções atuais desses arquivos
  - Cobre: DoD
  - Verificar: `make check && make test-db`

- [ ] **T-11 — Roteiro de QA (sessão principal, com o usuário)**
  - Arquivos: nenhum (o resultado vai para o Registro de implementação)
  - O que fazer:
    - Executar os passos 1 a 10 do roteiro da spec em iOS e Android, contra o Supabase local.
    - Fazer o CA-25 com VoiceOver e TalkBack.
    - Revisar com o usuário uma amostra dos nomes em en-US e es-MX.
    - Esta tarefa não é feita pelo `implementer`.
  - Cobre: CA-25 e o roteiro de QA
  - Verificar: roteiro de QA

## 5. Matriz de cobertura

| CA | Tarefa | Tipo de teste | Arquivo de teste |
| -- | ------ | ------------- | ---------------- |
| CA-01 | T-01 | banco | `supabase/tests/callings.test.sql` |
| CA-02 | T-01 | banco | `callings.test.sql` |
| CA-03 | T-01, T-02 | banco | `callings.test.sql` |
| CA-04 | T-01 | banco | `callings.test.sql` |
| CA-05 | T-02, T-04 | banco + unitário | `callings.test.sql`, `src/domain/permissions.test.ts` |
| CA-06 | T-02, T-04 | banco + unitário | `callings.test.sql`, `permissions.test.ts` |
| CA-07 | T-05 | integração (viewer) | `src/features/viewer/ViewerProvider.test.tsx` |
| CA-08 | T-03 | banco | `callings.test.sql` |
| CA-09 | T-03, T-07 | banco + componente | `callings.test.sql`, `GrantAccessSheet.test.tsx` |
| CA-10 | T-04, T-07 | unitário + componente | `src/domain/callings.test.ts`, `CallingPickerSheet.test.tsx` |
| CA-11 | T-07 | componente | `GrantAccessSheet.test.tsx` |
| CA-12 | T-03, T-07 | banco + componente | `callings.test.sql`, `AccessScreen.test.tsx` |
| CA-13 | T-03, T-08 | banco + componente | `callings.test.sql`, `OrgChartConsentCard.test.tsx` |
| CA-14 | T-03, T-08 | banco + componente | `callings.test.sql`, `OrgChartConsentCard.test.tsx` |
| CA-15 | T-03 | banco | `callings.test.sql` |
| CA-16 | T-08 | componente | `MyCallingsSection.test.tsx` |
| CA-17 | T-04, T-09 | unitário + componente | `callings.test.ts`, `CallingsCatalogScreen.test.tsx` |
| CA-18 | T-03, T-09 | banco + componente | `callings.test.sql`, `CallingFormScreen.test.tsx` |
| CA-19 | T-03, T-09 | banco + componente | `callings.test.sql`, `CallingFormScreen.test.tsx` |
| CA-20 | T-09 | componente | `CallingsCatalogScreen.test.tsx` |
| CA-21 | T-02 | banco (função de mapeamento) | `callings.test.sql` |
| CA-22 | T-02, T-08 | banco + componente | `callings.test.sql`, `ProfileScreen.test.tsx` |
| CA-23 | T-03 | banco | `callings.test.sql` |
| CA-24 | T-04, T-08 | unitário + componente | `callings.test.ts`, `MyCallingsSection.test.tsx` |
| CA-25 | T-11 | manual (VoiceOver/TalkBack) | roteiro de QA |

## 6. Riscos e mitigação

| Risco | Mitigação |
| ----- | --------- |
| Reescrever `has_role` e `can_publish` quebra políticas que já existem | Nomes e assinaturas não mudam, e `base_rls.test.sql` e `account.test.sql` continuam rodando (T-02 e T-03). |
| Traduções em en-US e es-MX erradas no seed | O admin corrige pelo catálogo (RF-21), e a T-11 revisa uma amostra com o usuário. |
| A migração chega à produção depois do passo 10 da `auth-account`, com o admin já criado | A conversão só mexe em linhas que não são `admin`; o `admin` continua em `memberships`. |
| A migração B falha no meio | Cada migration roda numa transação no `db push`, e o `deploy.yml` faz o dump antes. |
| O `tsc` quebra entre a T-04 e a T-05 | As duas tarefas são feitas em sequência, e só entra commit com o `make check` verde. |
| IDs de CA iguais aos da `auth-account` | Os testes desta spec usam o prefixo `[roles]` (seção 1). |

## 7. Registro de implementação

### Arquivos criados e alterados

Banco:
- criados: `supabase/migrations/20261115222647_calling_catalog.sql`, `supabase/migrations/20261115222648_member_calls.sql`, `supabase/tests/callings.test.sql`.
- alterados: `supabase/seed.sql`, `supabase/tests/account.test.sql`, `supabase/tests/base_rls.test.sql`, `src/lib/database.types.ts` (`make db-types`).

Domínio e viewer:
- criados: `src/domain/callings.ts` (+ teste), `src/i18n/useLocale.ts`.
- alterados: `src/domain/permissions.ts`, `access.ts`, `units.ts` (+ testes), `src/features/viewer/api.ts`, `ViewerProvider.tsx` (+ testes), `src/lib/telemetry.ts` (+ teste).

Conta:
- criados: `CallingPickerSheet`, `MyCallingsSection`, `OrgChartConsentCard`, `CallingsCatalogScreen`, `CallingFormScreen` (todos com teste), `callingFixtures.ts` (catálogo pequeno para os testes), `src/app/profile/callings-catalog/index.tsx` e `[id].tsx`.
- alterados: `api.ts`, `AccessScreen`, `GrantAccessSheet`, `ProfileScreen` (+ testes), `src/i18n/locales/*.json` (chaves `callings.*`; `account.roles`, `account.groups`, `account.access.role` e `.group` removidas).
- `src/components/ListItem.tsx`: props opcionais `accessibilityLabel` e `status` (ver desvios).

Docs: `.ai/docs/SECURITY.md`, `BUSINESS.md`, `ARCHITECTURE.md`. `supabase/snippets/grant_admin.sql` não citava `leadership_group`; ficou como estava.

### Desvios do plano

1. **T-02 e T-03 num commit só.** Com `memberships_admin_only`, o `grant_role` antigo deixa de funcionar na T-02, então as RPCs novas e a migração dos testes da `auth-account` entraram junto.
2. **`calling_holder_count` ficou na migration B**, não na A: ela precisa de `member_calls`, que só existe na B.
3. **`database.types.ts` e T-04 a T-07 num commit só.** Os tipos regenerados quebram o `tsc` em `features/account/api.ts` e no viewer até as telas passarem para chamados; o `make check` precisava ficar verde em cada commit.
4. **`legacy_role_to_calling`:** além das 6 combinações do plano, `unit_leader` com qualquer grupo diferente de `bishops` (o antigo `presidents`, que a spec não mapeia) também vira `unit_clerk`, para não perder o acesso. A conversão só apaga de `memberships` as linhas que converteu; se sobrar uma, a constraint `memberships_admin_only` falha a migração em vez de perder acesso em silêncio.
5. **`has_role(unit, {'admin'})`** só vale para `unit = 'estaca'` (o plano não cita a unidade). Preserva o comportamento anterior: o admin só existe na Estaca.
6. **`ListItem` (design system) ganhou duas props opcionais:** `accessibilityLabel` (RNF-07: `{nome}, {chamado}, {unidade}`) e `status` (o `StatusTag` `Inativo` do RF-20). Mudança aditiva; nada que já existia mudou.
7. **`useLocale`** (`src/i18n/useLocale.ts`) e **`callingFromRow`** (em `domain/callings.ts`, usado pelo viewer e pelo account, que não podem se importar entre si).
8. **Códigos extras de `save_calling`:** `invalid_name`, `invalid_level`, `invalid_notify_group` e `not_found`, além dos da spec; o app só mostra a mensagem genérica para eles.
9. **`matchesCalling`** devolve `true` para termo com menos de 2 caracteres (a busca só filtra a partir de 2, RF-20); vale também para o picker de Acessos.
10. **Revogar mostra o toast `Chamado removido`** também para `Administração` (a spec define o toast para chamados; reaproveitei).
11. `anon` não tem `select` em `member_calls` (a spec diz que quem lê é cada pessoa, `stake_leader` e `admin`); o teste espera `42501`.

### Decisões durante a implementação

- Privilégios de escrita (`insert/update/delete/truncate`) revogados de `anon` e `authenticated` em `calling_catalog`, `calling_catalog_log` e `member_calls`, além da falta de política: assim um `update` direto falha com `42501` em vez de afetar 0 linhas em silêncio.
- `my_accesses()` (helper privado) concentra a soma dos níveis; `execute` revogado da API. `is_stake_publisher()` é pública como as demais.
- O switch de "Meus chamados" mostra o texto `Mostrar no organograma` no subtítulo da linha (o `ListItem` só aceita o rótulo de acessibilidade no switch), e o rótulo de acessibilidade é `Mostrar {chamado} no organograma` (RNF-08).
- O cartão de consentimento esconde na hora o chamado respondido (estado local) e depois o viewer recarrega; com mais de um pendente, mostra o próximo.
- Migração de dados verificada à mão, além do teste da função de mapeamento: banco em `20261115173955` com o seed antigo (mais uma linha `unit_leader`/`presidents`) e `supabase migration up`; as linhas viraram `bishop`, `stake_first_counselor`, `unit_clerk` e `unit_activities_committee_chair`, o `admin` ficou, `leadership_group` sumiu e `role_grants_log` recebeu as concessões.
- Os nomes en-US e es-MX do seed foram escritos de memória do General Handbook e do Manual General, sem acesso à fonte. **Revisar na T-11**, em especial (todos os 128 estão preenchidos): `unit_mission_leader` (Mission Leader / Líder misional), `unit_missionary` (Unit Missionary / Misionero de la unidad), `stake_seminary_institute_supervisor`, `stake_activities_coordinator` (Stake Sports and Activities Coordinator), os de Templo e História da Família (`*_temple_fh_*`; em es-MX usei "obra del templo e historia familiar"), `stake_assistant_communication_director`, `stake_justserve_coordinator`, `aaronic_priesthood_adviser`, `nursery_leader` (Líder de la guardería), `primary_music_leader`, `unit_building_representative` e `stake_building_representative` (Representante de edificios), `stake_technology_specialist` e `unit_technology_specialist`, e as formas feminina e masculina do es-MX (ex.: "Directora de música de la Primaria").
- Grupos e seções (`callings.groups.*` e `callings.sections.*`) em en-US e es-MX também são tradução minha; o pt-BR segue a spec ao pé da letra.

### CA sem teste automatizado

- **CA-25** (VoiceOver/TalkBack): manual, na T-11. Os rótulos de acessibilidade (RNF-07 a RNF-09) têm teste de componente (`AccessScreen`, `MyCallingsSection`, `CallingFormScreen`), mas o anúncio real é do roteiro.
- **T-11 (roteiro de QA em iOS e Android, passos 1 a 10, e revisão dos nomes en-US/es-MX com o usuário): pendente.** É da sessão principal.
- Os demais CA (01 a 24) têm teste automatizado: pgTAP (`callings.test.sql`, `account.test.sql`, `base_rls.test.sql`) e Jest, com prefixo `[roles]` onde o ID se repete com a `auth-account`.
