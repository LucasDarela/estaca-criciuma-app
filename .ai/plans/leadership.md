# Plano: Liderança — organograma, acompanhamento e contatos

> **Spec:** `.ai/specs/leadership.md`
> **Criado em:** 2026-11-16
> **ADRs relacionados:** nenhum novo (segue `0002-stack-inicial.md` e `0004-supabase-cloud.md`)

## 1. Abordagem

O banco ganha uma migration (`<ts>_leadership.sql`) com 4 tabelas:
- `profile_phones`, com políticas só para o dono.
- 3 tabelas de vínculo sem política e com `revoke`.

Ganha também 5 RPCs. `org_chart_members()` não muda. `org_chart_links()` filtra pelo mesmo conjunto visível, então nada fica exposto além do que o organograma já mostra (RNF-03).

O app busca duas listas públicas (`members` e `links`) e monta as árvores numa função pura, `src/domain/orgChart.ts`. Assim, as regras de RF-09 a RF-13 têm teste unitário sem tela, e a aba faz só 2 chamadas (RNF-08). Telefones são uma terceira query, carregada sob demanda e com chave fora do prefixo `'public'`, por isso nunca vão para o disco (RNF-02).

As telas montam a árvore com `View`. As linhas da árvore são bordas de `View`, ocultas do leitor de tela, então não entra `react-native-svg` nem dependência nova. A única dependência nova é `expo-clipboard`, prevista na spec.

**Seed de demonstração em arquivo próprio.** Os testes pgTAP rodam sobre o banco já com o seed (`supabase test db` depois do `db reset`), e `callings.test.sql` e `account.test.sql` contam linhas das 5 contas base. Por isso:
- O organograma fictício vai para `supabase/seeds/org_chart_demo.sql`, carregado no `db reset` depois de `seed.sql` (`config.toml`, `sql_paths`).
- Usa só contas novas, `organograma.NN@exemplo.org`.
- Cada teste pgTAP existente ganha uma linha que apaga essas contas dentro da própria transação (que faz rollback no fim).
- O comportamento do QA é o mesmo de "alterar `seed.sql`" (spec, seção 10). Só muda o arquivo.

**IDs nos testes:** outras specs usam os mesmos números de CA. Por isso os testes desta spec levam o prefixo `[leadership]` no nome (ex.: `[leadership] CA-11: builds the stake tree`), como em `roles-of-leadership`.

**Nomes da spec × código:** onde a spec diz `gaivota` (CA-07), o id real é `ramoGaivota`. `unitOrder` é `unitOrder` de `src/theme/theme.ts`, na mesma ordem de `unitIds`.

## 2. Contratos

### 2.1 Banco: `supabase/migrations/<ts>_leadership.sql` (`supabase migration new leadership`)

```sql
-- RF-02, RNF-01, RNF-04
create table public.profile_phones (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  phone_e164 text not null check (phone_e164 ~ '^\+55[1-9][0-9][0-9]{8,9}$'),
  show_on_org_chart boolean not null default false,
  updated_at timestamptz not null default now()
);
alter table public.profile_phones enable row level security;
revoke all on public.profile_phones from anon;
-- 4 policies "profile_phones_<op>_own", to authenticated:
--   select using (user_id = auth.uid()); insert with check (user_id = auth.uid());
--   update using (user_id = auth.uid()) with check (user_id = auth.uid()); delete using (user_id = auth.uid()).
-- The app only reads it directly (Profile); writes go through set_my_phone.

-- RF-04. Shared columns: updated_by uuid null references profiles (id) on delete set null,
--        updated_at timestamptz not null default now().
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
    ('elders_quorum','relief_society','young_women','primary','sunday_school')),
  counselor_call_id uuid not null references public.member_calls (id) on delete cascade,
  updated_by uuid null references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (unit_id, organization)
);
create index unit_org_links_counselor_idx on public.unit_org_links (counselor_call_id);

-- RLS on for the 3 link tables, NO policies, and:
revoke all on public.high_council_links, public.high_council_units, public.unit_org_links
  from anon, authenticated;
```

Funções. Todas `security definer`, `set search_path = public`. As que exigem sessão começam com `if auth.uid() is null then raise exception 'not_authenticated' using errcode = 'P0001'`. Erros de negócio são `raise exception '<code>' using errcode = 'P0001'`, igual a `account_rpcs.sql`.

```sql
-- RF-02
create function public.set_my_phone(p_phone_e164 text, p_show boolean) returns void;  -- plpgsql
--   p_phone_e164 null                         → delete from profile_phones where user_id = auth.uid()
--   p_phone_e164 !~ '^\+55[1-9][0-9][0-9]{8,9}$' → 'invalid_phone'
--   else insert (auth.uid(), p_phone_e164, coalesce(p_show, false), now())
--        on conflict (user_id) do update set phone_e164, show_on_org_chart, updated_at = now()

-- RF-03, RNF-02. language sql stable.
create function public.org_chart_phones() returns table (member_call_id uuid, phone_e164 text);
--   select m.member_call_id, pp.phone_e164
--   from org_chart_members() m
--   join member_calls mc on mc.id = m.member_call_id
--   join profile_phones pp on pp.user_id = mc.user_id and pp.show_on_org_chart

-- Private helper (execute revoked from public, anon, authenticated). language sql stable.
-- Who holds the calling in the unit; with more than one, the oldest granted_at (then id).
create function public.org_chart_counselor_call(p_unit_id text, p_calling_id text) returns uuid;

-- RF-05. plpgsql. Checks in exactly this order:
create function public.set_high_councilor_links(
  p_high_councilor_call_id uuid, p_counselor_calling_id text, p_unit_ids text[]) returns void;
--   not is_stake_leader()                                                    → 'forbidden'
--   no member_calls row with that id, unit_id = 'estaca' and catalog
--     org_chart_section = 'high_council'                                     → 'not_found'
--   p_counselor_calling_id not null and not in
--     ('stake_first_counselor','stake_second_counselor')                     → 'invalid_counselor'
--   p_counselor_calling_id not null and
--     org_chart_counselor_call('estaca', p_counselor_calling_id) is null     → 'no_counselor'
--   any element of coalesce(p_unit_ids, '{}') that is not a units.id with
--     kind in ('ward','branch')                                              → 'invalid_unit'
--   effect: counselor null → delete the high_council_links row; else upsert it
--             (counselor_call_id, updated_by = auth.uid(), updated_at = now());
--           delete every high_council_units row of the high councilor, then insert
--             select distinct unnest(p_unit_ids) (updated_by = auth.uid()).

-- RF-06. plpgsql. Checks in exactly this order:
create function public.set_unit_org_counselor(
  p_unit_id text, p_organization text, p_counselor_calling_id text) returns void;
--   p_unit_id not a units.id with kind in ('ward','branch')                  → 'invalid_unit'
--   not can_lead(p_unit_id)                                                  → 'forbidden'
--   p_organization not in the RF-04 list                                     → 'invalid_organization'
--   p_counselor_calling_id not null and not in
--     ward:   ('bishopric_first_counselor','bishopric_second_counselor')
--     branch: ('branch_first_counselor','branch_second_counselor')           → 'invalid_counselor'
--   p_counselor_calling_id not null and
--     org_chart_counselor_call(p_unit_id, p_counselor_calling_id) is null    → 'no_counselor'
--   effect: counselor null → delete (p_unit_id, p_organization); else upsert
--           (counselor_call_id, updated_by = auth.uid(), updated_at = now()).

-- RF-07, RNF-03. language sql stable. Never returns the counselor's member_call_id.
create function public.org_chart_links()
returns table (kind text, unit_id text, member_call_id uuid, organization text,
               counselor_calling_id text, target_unit_id text);
--   with hc as (select member_call_id from org_chart_members() where section = 'high_council')
--   'high_council_counselor': ('estaca', hl.high_councilor_call_id, null, c.calling_id, null)
--       from high_council_links hl join hc on hc.member_call_id = hl.high_councilor_call_id
--       join member_calls c on c.id = hl.counselor_call_id
--   union all 'high_council_unit': ('estaca', hu.high_councilor_call_id, null, null, hu.unit_id)
--       from high_council_units hu join hc on hc.member_call_id = hu.high_councilor_call_id
--   union all 'unit_org_counselor': (ul.unit_id, null, ul.organization, c.calling_id, null)
--       from unit_org_links ul join member_calls c on c.id = ul.counselor_call_id

-- RF-08: create or replace export_my_data(), copying the current body
-- (20261116021430_push.sql:223) and adding:
--   'phone', (select jsonb_build_object('phone_e164', pp.phone_e164,
--             'show_on_org_chart', pp.show_on_org_chart, 'updated_at', pp.updated_at)
--             from profile_phones pp where pp.user_id = auth.uid())   -- null without a phone

-- Execute grants: revoke all from public, anon, authenticated, then:
--   set_my_phone, org_chart_phones, set_high_councilor_links, set_unit_org_counselor → authenticated
--   org_chart_links → anon, authenticated
--   org_chart_counselor_call → nobody
```

### 2.2 Seed de demonstração: `supabase/seeds/org_chart_demo.sql`

`supabase/config.toml`: `sql_paths = ["./seed.sql", "./seeds/org_chart_demo.sql"]`.

O arquivo segue o padrão de `seed.sql:3-29` (`auth.users`, `auth.identities`, `profiles`, `consented_at = now()`):
- Contas `00000000-0000-4000-8000-0000000001NN`, e-mail `organograma.NN@exemplo.org`, nomes fictícios com o sobrenome `Demonstração`.
- `member_calls` com `org_chart_consent = 'accepted'`. Não grava `role_grants_log`.

| Unidade | Chamados (uma conta cada, salvo indicado) |
| ------- | ----------------------------------------- |
| `estaca` | `stake_president`, `stake_second_counselor`, 6 × `high_councilor`, `stake_executive_secretary`, `stake_clerk`, `stake_patriarch`, `stake_relief_society_president`, `stake_young_women_president`, `stake_primary_president`, `stake_young_men_president`, `stake_sunday_school_president` |
| `criciuma1` | `bishopric_first_counselor`, `bishopric_second_counselor`, `unit_executive_secretary`, `unit_clerk`, `elders_quorum_president`, `relief_society_president`, `young_women_president`, `primary_president`, `sunday_school_president`, `unit_mission_leader` |
| `ramoGaivota` | `branch_president`, `branch_first_counselor`, `branch_second_counselor` |

O `stake_first_counselor` continua sendo a conta base `estaca@exemplo.org`, com consentimento `pending`. A coluna dele mostra só o rótulo, como em 7.6 da spec. O `bishop` de Criciúma 1 continua sendo a conta base `bispo.criciuma1@exemplo.org`, também `pending`.

Vínculos:
- 3 sumos conselheiros apontam para o `member_calls.id` de `stake_first_counselor` e 3 para o de `stake_second_counselor`.
- Cada sumo conselheiro acompanha uma unidade: `criciuma1`, `criciuma2`, `criciuma3`, `icara`, `ararangua` e `ramoGaivota`.
- Em Criciúma 1, `elders_quorum` e `relief_society` → 1º conselheiro; `young_women` e `primary` → 2º conselheiro; `sunday_school` sem vínculo.

Telefones (`profile_phones`):
- presidente e 4 sumos conselheiros: `+55489999900NN` com `true`;
- 1 sumo conselheiro com fixo `+554833330001`, `true`;
- 1 sumo conselheiro com `+5548999990099`, `false`.

Isolamento: logo depois do `select plan(N)` de `account.test.sql`, `base_rls.test.sql`, `callings.test.sql`, `events_read.test.sql` e `push.test.sql`, entra:

```sql
-- The org chart demo seed (supabase/seeds/org_chart_demo.sql) is not part of these fixtures.
delete from auth.users where email like 'organograma.%@exemplo.org';
```

### 2.3 Domínio

```ts
// src/domain/phone.ts — digits = Brazilian national number without +55 (DDD + number)
export function phoneDigits(text: string): string;            // keeps [0-9], at most 11
export function maskPhone(digits: string): string;            // progressive: '4' → '(4'; '4899' → '(48) 99';
                                                              // 10 digits → '(48) 3333-0000'; 11 → '(48) 99999-0000'
export function isValidPhoneDigits(digits: string): boolean;  // /^[1-9][0-9][0-9]{8,9}$/ (RNF-04, RF-22)
export function toE164(digits: string): string;               // '+55' + digits
export function digitsFromE164(e164: string): string;         // drops '+55'
export function formatPhone(e164: string): string;            // maskPhone(digitsFromE164(e164))
export function phoneSpeech(e164: string): string;            // RNF-12: '4 8, 9 9 9 9 9, 0 0 0 0'
export function telUrl(e164: string): string;                 // 'tel:+5548999990000'
export function whatsappUrl(e164: string): string | null;     // 11 digits → 'https://wa.me/5548999990000'; else null
```

```ts
// src/domain/orgChart.ts
import type { Calling, OrgChartSection } from './callings';
import type { Locale } from './profile';
import type { UnitId } from './units';

export type OrgChartMember = {
  memberCallId: string;
  unitId: UnitId;
  section: OrgChartSection;
  calling: Pick<Calling, 'id' | 'namePt' | 'nameEn' | 'nameEs'>;
  displayName: string;
  sortOrder: number;
};

export type StakeCounselorCallingId = 'stake_first_counselor' | 'stake_second_counselor';
export type UnitCounselorCallingId =
  | 'bishopric_first_counselor' | 'bishopric_second_counselor'
  | 'branch_first_counselor' | 'branch_second_counselor';
export type LinkOrganization =
  'elders_quorum' | 'relief_society' | 'young_women' | 'primary' | 'sunday_school';
export type OrgBlockId = LinkOrganization | 'young_men' | 'other';

export type OrgChartLink =
  | { kind: 'high_council_counselor'; memberCallId: string; counselorCallingId: StakeCounselorCallingId }
  | { kind: 'high_council_unit'; memberCallId: string; targetUnitId: UnitId }
  | { kind: 'unit_org_counselor'; unitId: UnitId; organization: LinkOrganization;
      counselorCallingId: UnitCounselorCallingId };

/** RF-04 order. */
export const linkOrganizations: readonly LinkOrganization[];
/** RF-10 block order. */
export const unitBlockOrder: readonly OrgBlockId[];   // EQ, RS, YW, Primary, SS, other
export const stakeBlockOrder: readonly OrgBlockId[];  // RS, YW, Primary, YM, SS, other

/** i18n key suffix of the short label (leadership.slot.*). */
export type SlotLabel =
  'stakePresident' | 'bishop' | 'branchPresident' | 'firstCounselor' | 'secondCounselor';
export type Slot = { callingId: string; label: SlotLabel; people: OrgChartMember[] };
export type OrgBlock = { organization: OrgBlockId; people: OrgChartMember[] };

export type StakeTree = {
  president: Slot;
  columns: [StakeColumn, StakeColumn];
  unassigned: OrgChartMember[];          // RF-11.3: high councilors with no counselor link
  clerks: OrgChartMember[];              // section stake_clerks
  otherPresidency: OrgChartMember[];     // stake_presidency minus the 3 fixed slots (patriarch)
  organizations: OrgBlock[];             // stake_organizations, stakeBlockOrder, non-empty only
};
export type StakeColumn = { slot: Slot; highCouncilors: OrgChartMember[] };

export type UnitTree = {
  kind: 'ward' | 'branch';
  supervisedBy: OrgChartMember[];        // RF-12.1
  top: Slot;
  columns: [UnitColumn, UnitColumn];
  unassigned: OrgBlock[];                // RF-12.4 (with editing: every unlinked block, even empty)
  clerks: OrgChartMember[];              // unit_clerks
  others: OrgChartMember[];              // block 'other' + bishopric minus the 3 fixed slots
  isEmpty: boolean;                      // RF-12.7: no visible person in the unit
};
export type UnitColumn = { slot: Slot; blocks: OrgBlock[] };

/** RF-10. null when the section is not an organizations section. */
export function organizationOf(callingId: string, section: OrgChartSection): OrgBlockId | null;
/** RF-13: sortOrder, then displayName with normalizeSearch (callings.ts) as the comparison key. */
export function compareMembers(a: OrgChartMember, b: OrgChartMember): number;
export function buildStakeTree(members: readonly OrgChartMember[], links: readonly OrgChartLink[]): StakeTree;
/** unitId must be a ward or branch. With `editing`, the 5 link blocks always exist (RF-25). */
export function buildUnitTree(unitId: UnitId, members: readonly OrgChartMember[],
  links: readonly OrgChartLink[], options?: { editing?: boolean }): UnitTree;
/** RF-15: visible people with section 'bishopric' in the unit. */
export function bishopricCount(members: readonly OrgChartMember[], unitId: UnitId): number;
/** RF-17: [] when the trimmed term has < 2 characters; matches displayName or callingName(locale). */
export function searchMembers(members: readonly OrgChartMember[], term: string, locale: Locale): OrgChartMember[];
/** RF-18: units a high councilor supervises, in unitIds order. */
export function supervisedUnits(memberCallId: string, links: readonly OrgChartLink[]): UnitId[];
/** RF-18: organizations linked to a unit counselor calling, in linkOrganizations order. */
export function supervisedOrganizations(unitId: UnitId, callingId: string,
  links: readonly OrgChartLink[]): LinkOrganization[];
/** RF-24: current counselor of a high councilor (null = Nenhum). */
export function counselorOf(memberCallId: string, links: readonly OrgChartLink[]): StakeCounselorCallingId | null;
/** RF-25: current counselor of an organization in a unit. */
export function orgCounselorOf(unitId: UnitId, organization: LinkOrganization,
  links: readonly OrgChartLink[]): UnitCounselorCallingId | null;
/** The two counselor calling ids of a unit kind, 1st then 2nd. */
export function counselorCallings(kind: 'stake' | 'ward' | 'branch'): [string, string];
```

### 2.4 Infra do app

```ts
// src/lib/telemetry.ts — add
export type TelemetryEvent = <existing 9 events> | 'org_chart_link_saved' | 'profile_phone_saved';
export type TelemetryProps = {
  method?, user_id?, membership_id?, calling_id?: unchanged;
  kind?: 'high_council' | 'unit_org';   // org_chart_link_saved
  unit_id?: string;                     // org_chart_link_saved ('estaca' for high_council)
  shown?: boolean;                      // profile_phone_saved
};

// src/components/ScreenHeader.tsx — HeaderAction gains:
  /** Shown with surfaceDisabled/textDisabled; onPress is not called; accessibilityState.disabled. */
  disabled?: boolean;
```

Ícone `content_copy`:
- acrescentar a `names` em `scripts/generate-icons.mjs` e à lista de `Icon.test.tsx`;
- rodar `npm run icons`.

### 2.5 API do app

```ts
// src/features/leadership/api.ts
export const leadershipMembersQueryKey = ['public', 'leadership', 'members'] as const;
export const leadershipLinksQueryKey = ['public', 'leadership', 'links'] as const;
/** RNF-02: never 'public'. The userId keeps one account's cache away from another. */
export const leadershipPhonesQueryKey = (userId: string) => ['leadership', 'phones', userId] as const;

export type LeadershipErrorCode = 'forbidden' | 'not_found' | 'invalid_counselor' | 'no_counselor'
  | 'invalid_unit' | 'invalid_organization' | 'network' | 'unknown';
export class LeadershipError extends Error { constructor(readonly code: LeadershipErrorCode) }
// toLeadershipError: same rules as toAccountError (account/api.ts:57).

/** Drops rows with an unknown unit or section (never render unexpected data). */
export async function fetchOrgChartMembers(): Promise<OrgChartMember[]>;   // rpc('org_chart_members')
/** Drops rows with an unknown kind, unit, organization or counselor calling. */
export async function fetchOrgChartLinks(): Promise<OrgChartLink[]>;       // rpc('org_chart_links')
/** memberCallId → phone_e164. */
export async function fetchOrgChartPhones(): Promise<Record<string, string>>; // rpc('org_chart_phones')

export type OrgChartData = {
  members: OrgChartMember[];
  links: OrgChartLink[];
  /** 'offline' = no data and cannot fetch (paused); 'error' = no data and the fetch failed. */
  status: 'loading' | 'error' | 'offline' | 'success';
  refetch: () => void;
  refetchLinks: () => Promise<void>;
};
/** Both public queries: staleTime PUBLIC_STALE_TIME_MS, gcTime PERSIST_MAX_AGE_MS (calendar/api.ts:118). */
export function useOrgChart(): OrgChartData;
/** RF-19, RNF-08: enabled only with a session and once a sheet is opened; staleTime 5 min. */
export function useOrgChartPhones(userId: string | null, enabled: boolean): UseQueryResult<Record<string, string>>;

export async function setHighCouncilorLinks(input: {
  highCouncilorCallId: string;
  counselorCallingId: StakeCounselorCallingId | null;
  unitIds: readonly UnitId[];
}): Promise<void>;   // then track('org_chart_link_saved', { kind: 'high_council', unit_id: 'estaca' })
export async function setUnitOrgCounselor(input: {
  unitId: UnitId;
  organization: LinkOrganization;
  counselorCallingId: UnitCounselorCallingId | null;
}): Promise<void>;   // then track('org_chart_link_saved', { kind: 'unit_org', unit_id })
```

```ts
// src/features/account/api.ts — add
// AccountErrorCode and knownCodes gain 'invalid_phone'.
export type MyPhone = { phoneE164: string; showOnOrgChart: boolean };
export const myPhoneQueryKey = (userId: string) => ['myPhone', userId] as const;
/** select phone_e164, show_on_org_chart from profile_phones (own row, RLS); null without a phone. */
export async function fetchMyPhone(userId: string): Promise<MyPhone | null>;
/** rpc('set_my_phone'); then track('profile_phone_saved', { shown: phoneE164 !== null && show }). */
export async function setMyPhone(phoneE164: string | null, show: boolean): Promise<void>;
```

Depois de `setMyPhone`, o chamador invalida `myPhoneQueryKey(userId)` e `['leadership', 'phones']`.

### 2.6 Componentes e telas (`src/features/leadership/`)

| Arquivo | Props / papel |
| ------- | ------------- |
| `TreeSlot.tsx` | `{ slot: Slot; size: 'large' \| 'default'; onPersonPress(m: OrgChartMember) }`. Cartão da seção 8 da spec. Sem pessoa: círculo `surfaceDisabled` do tamanho do `Avatar`, sem iniciais, e o texto `{rótulo}, sem nome no organograma` para o leitor de tela (RNF-09). |
| `TreeLines.tsx` | `TreeConnector` (topo → 2 colunas) e `ColumnRail` (linha vertical à esquerda): `View`s com borda `stroke.strong` `borderStrong`, `accessibilityElementsHidden` e `importantForAccessibility="no-hide-descendants"` (RNF-10). |
| `OrgBlockView.tsx` | `{ block: OrgBlock; editing?: boolean; onPersonPress; onEdit? }`. Título com `accessibilityRole="header"`. Vazio em edição: `leadership.empty.org`. Botão `Editar` `ghost` `compact`. |
| `PersonRow.tsx` | `ListItem` compacto (`leading: avatar`) com `accessibilityLabel` `{nome}, {chamado}`. Com `onEdit`: ícone `edit` à direita, com alvo de 44 pt (`minTouchSlop`) e rótulo `leadership.edit.personLabel` (`Editar acompanhamento de {nome}`). |
| `StakeTree.tsx` | `{ tree: StakeTree; editing: boolean; onPersonPress; onEditHighCouncilor(m) }` |
| `UnitTree.tsx` | `{ tree: UnitTree; editing: boolean; onPersonPress; onEditOrganization(o: LinkOrganization) }` |
| `TreeSkeleton.tsx` | `Skeleton` do topo + 2 colunas (RF-20) |
| `PersonSheet.tsx` | `{ person: OrgChartMember \| null; links; onClose }` (RF-18, RF-19) |
| `HighCouncilorLinkSheet.tsx` | `{ person: OrgChartMember \| null; links; onSaved(); onClose }` (RF-24, RF-26) |
| `OrgCounselorSheet.tsx` | `{ unitId; organization: LinkOrganization \| null; links; onSaved(); onClose }` (RF-25, RF-26) |
| `LeadershipScreen.tsx` | Aba (RF-14, RF-15, RF-17, RF-20, RF-23) |
| `UnitLeadershipScreen.tsx` | `/leadership/unit/[id]` (RF-16, RF-12, RF-23) |
| `useStackedColumns.ts` | `useWindowDimensions().fontScale >= 1.3` (RNF-11) |

Rotas:
- `src/app/(tabs)/leadership.tsx` → `export { LeadershipScreen as default } from '@/features/leadership/LeadershipScreen';`
- `src/app/leadership/unit/[id].tsx` → re-export de `UnitLeadershipScreen`, como `src/app/event/[id].tsx`.

Perfil: `src/features/account/PhoneSheet.tsx`, com props `{ visible; current: MyPhone | null; userId; onClose }`. Usa o padrão `EditNameSheet` (formulário montado só enquanto o sheet está aberto).

### 2.7 Textos

A spec traz chaves sugeridas que colidem, porque `leadership.search` não pode ser texto e objeto ao mesmo tempo. As chaves finais estão abaixo, e o texto é o literal da seção 8 da spec. en-US e es-MX recebem as mesmas chaves, com tradução (paridade de `locales.test.ts`).

```
leadership.title, leadership.search.placeholder, leadership.search.empty ("Ninguém encontrado para \"{{term}}\".")
leadership.segment.stake | units
leadership.slot.stakePresident | bishop | branchPresident | firstCounselor | secondCounselor
leadership.slot.empty ("{{label}}, sem nome no organograma")
leadership.section.stakeClerks | clerks | stakeOrganizations | others | unassigned | supervisedBy
leadership.org.elders_quorum | relief_society | young_women | young_men | primary | sunday_school | other
leadership.units.main.ward | branch, leadership.units.subtitle ("{{group}} · {{count}}")
leadership.supervisedBy ("{{name}} (Sumo Conselheiro)")
leadership.empty.unit | org
leadership.unit.notFound | back
leadership.person.label ("{{name}}, {{calling}}"), leadership.person.subtitle ("{{calling}} · {{unit}}"),
leadership.person.supervises ("Acompanha: {{list}}")
leadership.contact.signIn | signInButton | call | whatsapp | copy | copied | offline | error
leadership.contact.callLabel ("Ligar para {{name}}") | whatsappLabel ("Chamar {{name}} no WhatsApp")
  | copyLabel ("Copiar telefone de {{name}}")
leadership.error | offlineEmpty            (retry = common.retry)
leadership.edit.button | offline | banner | done | personLabel
leadership.edit.sheetTitle | counselor | none | units | save | saved
leadership.edit.error.noCounselor | forbidden | notFound | generic
account.profile.phone | phoneNone
account.phone.title | label | placeholder | show | help | save | remove | saved | removed | invalid | required
(network error = auth.errors.network)
```

## 3. Dependências novas

| Pacote | Versão | Motivo |
| ------ | ------ | ------ |
| `expo-clipboard` | `~58.0.4` (a do `expo/bundledNativeModules.json` do SDK 58; instalar com `npx expo install expo-clipboard`) | `Copiar` e toque longo no telefone (RF-19). Previsto na spec, seção 4 e decisão 23 |

## 4. Tarefas

- [ ] **T-01 — Banco: telefone, vínculos, RPCs e export**
  - Arquivos: `criar supabase/migrations/<ts>_leadership.sql` · `criar supabase/tests/leadership.test.sql` · `alterar src/lib/database.types.ts` (`make db-types`)
  - O que fazer:
    - Escrever tudo de 2.1, com grants e revokes no fim do arquivo, como em `push.sql:276-291`.
    - `leadership.test.sql`:
      - Começa com a linha de isolamento de 2.2.
      - Cria no próprio teste 3 contas extras (`00000000-0000-4000-8000-000000000201` a `-000000000203`, padrão de `seed.sql:3-29`) e os `member_calls` (`accepted`) de que precisa: um `high_councilor`, um `stake_second_counselor` e um `bishopric_first_counselor` em `criciuma1`. As 5 contas base fazem os papéis de `estaca`, `bispo.criciuma1`, `publicador.icara`, `admin` e `membro`.
    - Casos, todos com o prefixo `[leadership]`:
      - "CA-01": A lê só a própria linha; `anon` em `profile_phones` leva `42501`; `set_my_phone('+5548999', true)` → `invalid_phone`; `set_my_phone(null, false)` apaga; insert direto com `48999` falha na constraint (`23514`).
      - "CA-02": `anon` em `org_chart_phones()` → `42501`; um membro recebe só o telefone com `show_on_org_chart = true`.
      - "CA-03": `select` nas 3 tabelas de vínculo como `anon` e como `authenticated` → `42501`.
      - "CA-04": `estaca` grava o vínculo e `{icara}`; `bispo.criciuma1` → `forbidden`.
      - "CA-05": `bishop` → `invalid_counselor`; `stake_second_counselor` sem ninguém → `no_counselor`; `{estaca}` → `invalid_unit`. Mais: id inexistente → `not_found`; `p_unit_ids` repetido grava uma vez; `'{}'` apaga as unidades; com dois `stake_second_counselor`, vale o `granted_at` mais antigo.
      - "CA-06": bispo grava; `publicador.icara` e `admin` → `forbidden`.
      - "CA-07": `ramoGaivota` com `bishopric_first_counselor` → `invalid_counselor`; `young_men` → `invalid_organization`; `estaca` como unidade → `invalid_unit`.
      - "CA-08": o conselheiro passa para `declined` e `org_chart_links()` ainda devolve `counselor_calling_id = 'stake_first_counselor'`. Nenhuma linha devolvida tem um `member_call_id` igual ao `member_calls.id` de um conselheiro. Depois de `delete from member_calls` do conselheiro, a linha de `high_council_links` some (o mesmo vale para `unit_org_links`).
      - "CA-09": o sumo conselheiro passa para `declined` e nenhuma linha de `org_chart_links()` como `anon` tem o `member_call_id` dele.
      - "CA-10": `export_my_data() -> 'phone'` tem `phone_e164` e `show_on_org_chart`, e é `null` sem telefone. `delete from auth.users` da pessoa → 0 linhas em `profile_phones`.
      - RLS ligada nas 4 tabelas (`pg_class.relrowsecurity`). `anon` não executa `set_my_phone`, `set_high_councilor_links` nem `set_unit_org_counselor`; ninguém executa `org_chart_counselor_call`. `org_chart_links()` não tem coluna `user_id`, `email` ou `phone` (padrão de `callings.test.sql:219-223`).
  - Referência: `supabase/migrations/20261115030703_account_rpcs.sql:71` (RPC com erro), `supabase/migrations/20261116021430_push.sql:66-77` (RLS + revoke), `:223` (`export_my_data` atual), `supabase/migrations/20261115222648_member_calls.sql:418` (`org_chart_members`), `supabase/tests/callings.test.sql:209-223` (papéis e checagem de colunas no pgTAP)
  - Cobre: CA-01 a CA-10 (banco), RNF-01, RNF-02, RNF-03, RNF-04, RNF-05, RNF-07
  - Verificar: `supabase db reset && make test-db` · `make db-types` · `make lint`

- [ ] **T-02 — Seed de demonstração e isolamento dos testes existentes**
  - Arquivos: `criar supabase/seeds/org_chart_demo.sql` · `alterar supabase/config.toml` (`sql_paths`) · `alterar supabase/tests/account.test.sql`, `base_rls.test.sql`, `callings.test.sql`, `events_read.test.sql`, `push.test.sql` (uma linha cada)
  - O que fazer: seguir 2.2. Os ids de `member_calls` usados nos vínculos são resolvidos por `select id from member_calls where user_id = <conta> and calling_id = <chamado>` dentro do próprio `insert into <tabela> select`, sem uuid fixo.
  - Referência: `supabase/seed.sql:3-38`
  - Cobre: QA 1 a 9 (dados); mantém os testes existentes verdes
  - Verificar: `supabase db reset && make test-db` (as 5 suítes antigas e `leadership.test.sql` passam). Também `select count(*) from org_chart_members()` > 20 e `select * from org_chart_links()` com 6 linhas `high_council_counselor`, 6 `high_council_unit` e 4 `unit_org_counselor`.

- [ ] **T-03 — Domínio: telefone**
  - Arquivos: `criar src/domain/phone.ts` · `criar src/domain/phone.test.ts`
  - O que fazer: as funções de 2.3, todas puras. Testes:
    - `maskPhone` progressivo, com 10 e 11 dígitos;
    - `isValidPhoneDigits` com 9, 10, 11 e 12 dígitos e com DDD `0x`;
    - `formatPhone('+5548999990000')` = `(48) 99999-0000` e `formatPhone('+554833330000')` = `(48) 3333-0000`;
    - `phoneSpeech` = `4 8, 9 9 9 9 9, 0 0 0 0`;
    - `telUrl`; `whatsappUrl` nulo para 10 dígitos.
  - Referência: `src/domain/email.ts` (normalização e validação puras) e `src/domain/email.test.ts`
  - Cobre: CA-22 (regra do WhatsApp), CA-25 (regra de validação), RNF-04, RNF-12 (texto falado)
  - Verificar: `make test`

- [ ] **T-04 — Domínio: montagem do organograma**
  - Arquivos: `criar src/domain/orgChart.ts` · `criar src/domain/orgChart.test.ts` · `criar src/domain/orgChartFixtures.ts` (factory `makeMember(overrides)`, padrão de `src/test/factories.ts`)
  - O que fazer:
    - Implementar 2.3. `organizationOf` segue RF-10 à risca: `elders_quorum` só pelos 4 ids listados; os demais pelo prefixo; qualquer outro id de `unit_organizations` ou `stake_organizations` vira `other`; outras seções devolvem `null`.
    - Os slots usam `counselorCallings(kind)`. Uma pessoa com 2 chamados aparece nos 2 lugares, porque cada linha é um chamado.
    - Na estaca, `unassigned` = sumos conselheiros sem `high_council_counselor`.
    - Na unidade, `columns[i].blocks` = blocos de `linkOrganizations` cujo `orgCounselorOf` é o chamado da coluna. Fora de edição, só os que têm pessoas; em edição, todos. `unassigned` = os sem vínculo, pela mesma regra.
  - Testes (`[leadership]`):
    - "CA-11": o cenário exato do CA.
    - "CA-12": com e sem sumo conselheiro sem vínculo.
    - "CA-13": Criciúma 1 do CA, com a ordem `Moças`, `Primária`.
    - "CA-14": `supervisedBy` de `icara`.
    - "CA-15": `ramoGaivota` vazio dá `isEmpty`, rótulos `branchPresident`/`firstCounselor`/`secondCounselor` e slots sem pessoas.
    - "CA-18": `searchMembers` com `secretario`, `zzz` e `s`.
    - Mais: empate de `sortOrder` ordenado pelo nome sem acento; `bishopricCount`; `supervisedUnits` na ordem de `unitIds`; `supervisedOrganizations`; edição mostra os 5 blocos; `young_men` só na estaca; o patriarca vai para `otherPresidency`.
  - Referência: `src/domain/callings.ts:60` (`normalizeSearch`), `:104` (`callingName`), `src/domain/notifications.ts` (agrupamento puro)
  - Cobre: CA-11, CA-12, CA-13, CA-14, CA-15, CA-18 (regras); RF-01, RF-09 a RF-13, RF-17
  - Verificar: `make test`

- [ ] **T-05 — Infra: clipboard, ícone, ação desabilitada no cabeçalho, telemetria e textos**
  - Arquivos:
    - `alterar package.json` / `package-lock.json` (`npx expo install expo-clipboard`)
    - `alterar scripts/generate-icons.mjs`, `src/components/icons/glyphs.ts` (`npm run icons`), `src/components/icons/Icon.test.tsx`
    - `alterar src/components/ScreenHeader.tsx`, `src/components/ScreenHeader.test.tsx`
    - `alterar src/lib/telemetry.ts`, `src/lib/telemetry.test.ts`
    - `alterar src/i18n/locales/pt-BR.json`, `en-US.json`, `es-MX.json`
  - O que fazer:
    - 2.4 e 2.7.
    - `HeaderAction.disabled`: fundo `surfaceDisabled`, ícone `textDisabled`, `accessibilityState={{ disabled: true }}` e `onPress` ignorado. Teste no `ScreenHeader.test.tsx`.
    - No `jest.setup.ts`, mock global de `expo-clipboard` (`setStringAsync: jest.fn().mockResolvedValue(true)`), como os mocks que já estão lá.
  - Referência: `jest.setup.ts:11` (mock de módulo nativo), `src/components/ScreenHeader.tsx:79` (render das ações), `src/lib/telemetry.ts:1`
  - Cobre: suporte a RF-19, RF-23, RNF-06
  - Verificar: `make check`

- [ ] **T-06 — API: organograma, telefones, vínculos e telefone próprio**
  - Arquivos: `criar src/features/leadership/api.ts` · `criar src/features/leadership/api.test.ts` · `alterar src/features/account/api.ts` · `alterar src/features/account/api.test.ts`
  - O que fazer:
    - 2.5. `useOrgChart` usa `useQueries` com as 2 chaves públicas. Regra de `status`, igual a `combineMonths` (`calendar/api.ts:92`):
      - `success` quando as duas têm dados;
      - `offline` quando falta dado e alguma está `paused`;
      - `error` quando falta dado e alguma falhou;
      - `loading` no resto.
    - `refetchLinks` = `refetchQueries(leadershipLinksQueryKey)`.
    - `useOrgChartPhones`: `enabled: userId !== null && enabled`, `staleTime: PUBLIC_STALE_TIME_MS` (5 min), sem `gcTime` longo.
  - Testes:
    - mapeamento das linhas, descartando unidade, seção ou tipo desconhecidos;
    - erros `P0001` → `LeadershipError`, e `TypeError` → `network`;
    - "CA-31": `track` chamado com `{ kind, unit_id }` e `{ shown }`, sem nenhuma chave ou valor com número, nome ou `user_id` (inspecionar o objeto passado);
    - `fetchMyPhone` e `setMyPhone` (`invalid_phone`);
    - "CA-23" (parte de chave): `isPublicQueryKey(leadershipPhonesQueryKey('u'))` é `false` e as chaves de membros e vínculos são públicas.
  - Referência: `src/features/calendar/api.ts:92-127` (queries públicas e `status`), `src/features/account/api.ts:57` (`toAccountError`), `src/features/account/api.test.ts` (mock do Supabase)
  - Cobre: CA-23 (chaves), CA-31; RNF-02, RNF-06, RNF-08
  - Verificar: `make test`

- [ ] **T-07 — Árvores (componentes)**
  - Arquivos: `criar src/features/leadership/TreeSlot.tsx`, `TreeLines.tsx`, `OrgBlockView.tsx`, `PersonRow.tsx`, `StakeTree.tsx`, `UnitTree.tsx`, `TreeSkeleton.tsx`, `useStackedColumns.ts` · `criar src/features/leadership/StakeTree.test.tsx`, `UnitTree.test.tsx`
  - O que fazer:
    - 2.6 e a seção 8 da spec. Ordem dos filhos no JSX = ordem de leitura de RNF-10. Overlines e títulos com `accessibilityRole="header"`. Duas colunas em `flexDirection: 'row'` com `flex: 1` cada; com `useStackedColumns()`, uma embaixo da outra, cada uma com `ColumnRail`.
    - `UnitTree`: `isEmpty` mostra os slots e `leadership.empty.unit`. Em `supervisedBy`, cada linha é um `PersonRow` com o título `leadership.supervisedBy`.
  - Testes (`[leadership]`):
    - "CA-11" e "CA-13" renderizados (nomes e overlines na ordem esperada);
    - "CA-14": `ACOMPANHADA POR` com `{nome} (Sumo Conselheiro)`;
    - "CA-15": rótulos e mensagem de vazio;
    - rótulo `{nome}, {chamado}` e `{rótulo}, sem nome no organograma` (RNF-09);
    - linhas da árvore ocultas do leitor de tela;
    - com `fontScale` 1.6 (mock de `useWindowDimensions`), colunas empilhadas (RNF-11);
    - modo de edição: ícone `edit` nos sumos conselheiros e botão `Editar` nos 5 blocos.
  - Referência: `src/features/calendar/DayView.tsx` (layout em colunas com tokens), `src/components/ListItem.tsx:35`, `src/features/account/MyCallingsSection.tsx` (overline + lista)
  - Cobre: CA-11, CA-13, CA-14, CA-15 (tela); RNF-09, RNF-10, RNF-11, RNF-14
  - Verificar: `make test`

- [ ] **T-08 — Ficha da pessoa**
  - Arquivos: `criar src/features/leadership/PersonSheet.tsx` · `criar src/features/leadership/PersonSheet.test.tsx`
  - O que fazer:
    - RF-18 e RF-19. O chamado vem de `callingName(person.calling, useLocale())` e a unidade de `units[unitId].label`. `Acompanha:`:
      - section `high_council` → `supervisedUnits`, nomes separados por `, `;
      - chamado de conselheiro de ala ou ramo → `supervisedOrganizations`, com os nomes de `leadership.org.*`.
    - Contato:
      - sem sessão (`useAuthSession().status !== 'signedIn'`): texto e `Entrar` → `router.push({ pathname: '/sign-in', params: { returnTo: pathname } })`, com `usePathname()`;
      - com sessão: `useOrgChartPhones(userId, visible)`. `isPending` com `fetchStatus === 'paused'` → offline; `isPending` → `Skeleton`; `isError` → erro e `Tentar de novo` (`refetch`); telefone ausente no mapa → nada.
    - Botões: `Linking.openURL(telUrl)`; `Linking.openURL(whatsappUrl)` só quando não for nulo; `Clipboard.setStringAsync(formatPhone)` + toast `leadership.contact.copied` (`tone: 'success'`). `Text` do número com `onLongPress` igual ao `Copiar` e `accessibilityLabel = phoneSpeech`.
  - Testes (`[leadership]`):
    - "CA-19": visitante; `Entrar` com `returnTo`;
    - "CA-20": `Ligar` e `WhatsApp` com as URLs exatas (`jest.spyOn(Linking, 'openURL')`); fechar e abrir outra ficha chama `fetchOrgChartPhones` uma vez só (QueryClient real com a API mockada);
    - "CA-21": `Copiar` e toque longo chamam `setStringAsync('(48) 99999-0000')` e mostram o toast;
    - "CA-22": fixo sem `WhatsApp`; pessoa fora do mapa sem área de contato;
    - "CA-23": offline sem telefones → `Telefone disponível com conexão.`;
    - erro → mensagem e `Tentar de novo`;
    - rótulos `Ligar para {nome}`, `Chamar {nome} no WhatsApp`, `Copiar telefone de {nome}` (RNF-12).
  - Referência: `src/features/calendar/EventDetailScreen.tsx` (uso de `Linking`) e `EventDetailScreen.test.tsx:4,57`, `src/features/account/EditNameSheet.tsx` (Sheet), `src/features/auth/SignInScreen.tsx:41` (`returnTo`)
  - Cobre: CA-19, CA-20, CA-21, CA-22, CA-23 (ficha); RNF-08, RNF-12
  - Verificar: `make test`

- [ ] **T-09 — Aba Liderança**
  - Arquivos:
    - `criar src/features/leadership/LeadershipScreen.tsx` e `LeadershipScreen.test.tsx`
    - `alterar src/app/(tabs)/leadership.tsx`
    - `alterar src/features/placeholder/screens.tsx` (remove `LeadershipPlaceholder`)
    - `alterar src/features/navigation/TabsLayout.test.tsx` (troca `LeadershipPlaceholder` por um componente local `() => null` no mapa de rotas)
  - O que fazer:
    - RF-14, RF-15, RF-17, RF-20. Estado: `segment` (`'stake'`), `term`, `person` e `editing`.
    - Com termo válido (`searchMembers(members, term, locale)`), o resultado substitui o conteúdo abaixo do `Segmented`. Cada resultado é um `ListItem` (`leading: avatar`, subtítulo `leadership.person.subtitle`).
    - `Unidades`: `unitOrder` sem `estaca`, `ListItem` com `leading: unitDot`, subtítulo `leadership.units.subtitle` e `router.push('/leadership/unit/' + id)`.
    - Estados de RF-20, a partir de `useOrgChart().status`. Com dados e `!useIsOnline()`, mostra `OfflineBanner`.
    - O botão `Editar` e o modo de edição da estaca ficam para T-11. Aqui, `ScreenHeader` com `showAvatar` e sem ações.
  - Testes (`[leadership]`):
    - "CA-16": 6 unidades na ordem, subtítulos `Bispado · n` e `Presidência do ramo · n`, toque navega;
    - "CA-18": busca na tela, com resultados, vazio e 1 caractere;
    - "CA-20": a aba chama só `fetchOrgChartMembers` e `fetchOrgChartLinks` (nenhuma chamada de telefones antes de abrir uma ficha);
    - "CA-23": dados em cache com offline mostram árvore e `OfflineBanner`;
    - "CA-30": erro sem cache, e depois offline sem cache.
  - Referência: `src/features/calendar/AgendaScreen.tsx:43,97-99` (header com avatar, offline), `src/components/Segmented.tsx:24`
  - Cobre: CA-16, CA-18, CA-20 (chamadas), CA-23, CA-30; RNF-08
  - Verificar: `make test` · `make build`

- [ ] **T-10 — Tela da unidade**
  - Arquivos: `criar src/features/leadership/UnitLeadershipScreen.tsx` e `UnitLeadershipScreen.test.tsx` · `criar src/app/leadership/unit/[id].tsx`
  - O que fazer:
    - RF-16. `useLocalSearchParams<{ id: string }>()`. Com `!isUnitId(id) || unitKind(id) === 'stake'`, mostra `EmptyState` `leadership.unit.notFound` com a ação `leadership.unit.back` → `router.replace('/leadership')`.
    - `ScreenHeader` com `onBack={router.back}` e o título `units[id].label`.
    - `buildUnitTree`, `PersonSheet` e os estados de RF-20, como em T-09.
  - Testes (`[leadership]`): "CA-17" (`estaca` e `xyz`); "CA-14" e "CA-15" na tela; tocar em `Acompanhada por` abre a ficha.
  - Referência: `src/features/calendar/EventDetailScreen.tsx` (rota com `[id]` e não encontrado), `src/app/event/[id].tsx`
  - Cobre: CA-14, CA-15, CA-17
  - Verificar: `make test` · `make build`

- [ ] **T-11 — Modo de edição e sheets de acompanhamento**
  - Arquivos:
    - `criar src/features/leadership/HighCouncilorLinkSheet.tsx`, `OrgCounselorSheet.tsx` e os 2 testes
    - `alterar LeadershipScreen.tsx`, `UnitLeadershipScreen.tsx` e os testes deles
  - O que fazer:
    - RF-23:
      - ação `{ icon: 'edit', accessibilityLabel: online ? t('leadership.edit.button') : t('leadership.edit.offline'), disabled: !online }`;
      - na aba, só com `segment === 'stake' && isStakeLeader(viewer.memberships)`; na unidade, só com `canLead(viewer.memberships, id)`;
      - em edição, a faixa `primarySubtle` com `leadership.edit.banner` e `Concluir` (`ghost`), sem `SearchField`;
      - `Concluir` sai do modo e chama `refetchLinks()`.
    - RF-24: chips `Conselheiro` de seleção única, com `counselorOf` como valor inicial; chips `Unidades que acompanha` múltiplos, com `dotColor` e as unidades de `supervisedUnits` como valor inicial.
    - RF-25: chips `Conselheiro` com `orgCounselorOf` como valor inicial. As opções 1º e 2º são `counselorCallings(unitKind(id))`.
    - Cada grupo de chips fica num `View` com `accessibilityRole="radiogroup"` (único) ou `"list"` (múltiplo) e `accessibilityLabel` com o nome do grupo. Cada chip tem `accessibilityState.selected` (RNF-13). Se o `FilterChip` não expuser `selected` ao leitor de tela, acrescentar isso a ele, com teste em `Selection.test.tsx`.
    - `Salvar` com `loading`, sem duplo envio. No sucesso: toast `leadership.edit.saved`, `onSaved()` (o pai chama `refetchLinks()`) e fecha.
    - Erros de RF-26:
      - `not_found` mostra o toast, fecha e recarrega;
      - `no_counselor`, `forbidden` e `network` (`auth.errors.network`) mostram o toast e mantêm o sheet aberto;
      - qualquer outro código mostra `leadership.edit.error.generic`.
  - Testes (`[leadership]`):
    - "CA-26": matriz `estaca` / `bispo.criciuma1` / `publicador.icara` / membro × estaca / Criciúma 1, com memberships mockadas no `useViewer`; offline, desabilitado;
    - "CA-27": salvar chama `setHighCouncilorLinks({ counselorCallingId: 'stake_second_counselor', unitIds: ['icara','ararangua'] })`, mostra o toast e recarrega;
    - "CA-28": 5 blocos visíveis em edição, salvar `sunday_school`, depois `no_counselor`;
    - "CA-29": `forbidden` e depois `network`, com o sheet aberto.
  - Referência: `src/features/account/GrantAccessSheet.tsx` (sheet com chips e envio), `src/features/account/NoticesSection.tsx:42` (`FilterChip`), `src/components/AudiencePicker.tsx` (grupo acessível de seleção)
  - Cobre: CA-26, CA-27, CA-28, CA-29; RNF-05 (no app), RNF-13
  - Verificar: `make test`

- [ ] **T-12 — Telefone no Perfil**
  - Arquivos: `criar src/features/account/PhoneSheet.tsx` e `PhoneSheet.test.tsx` · `alterar src/features/account/ProfileScreen.tsx` e `ProfileScreen.test.tsx`
  - O que fazer:
    - `ProfileScreen`: `useQuery({ queryKey: myPhoneQueryKey(userId), queryFn: () => fetchMyPhone(userId) })`. `ListItem` `account.profile.phone` logo depois de `Idioma`, com o subtítulo `formatPhone` ou `account.profile.phoneNone`, e um `Open` novo, `'phone'`.
    - `PhoneSheet` (RF-21, RF-22):
      - `TextField` com `keyboardType="phone-pad"`, `value = maskPhone(digits)` e `onChangeText = d => setDigits(phoneDigits(d))`;
      - `Switch` com `label = account.phone.show` e o texto de apoio;
      - validação na ordem: switch ligado com campo vazio → `required`; campo preenchido e `!isValidPhoneDigits` → `invalid`; campo vazio e switch desligado com telefone salvo → igual a `Remover`;
      - `Salvar` → `setMyPhone(toE164(digits), show)`, toast `saved`, invalida `myPhoneQueryKey(userId)` e `['leadership','phones']`, fecha;
      - `Remover telefone` (só com `current`) → `setMyPhone(null, false)`, toast `removed`;
      - `network` → toast `auth.errors.network` com o sheet aberto e o texto mantido; outro erro → `common.genericError`;
      - `Salvar` com `loading` durante o envio.
  - Testes (`[leadership]`):
    - "CA-24": subtítulo antes e depois, chamada exata `setMyPhone('+5548999990000', true)`, toast;
    - "CA-25": `4899999` → `Informe um telefone com DDD.`; vazio com switch → `Informe o telefone para mostrá-lo no organograma.`; remover → toast e `Não informado`;
    - rede mantém o sheet;
    - `Switch` anunciado com o rótulo (RNF-13).
  - Referência: `src/features/account/EditNameSheet.tsx`, `src/features/account/ProfileScreen.tsx:63` (`save` com toast e invalidação), `src/features/account/ProfileScreen.test.tsx:30` (mock do viewer)
  - Cobre: CA-24, CA-25; RNF-13
  - Verificar: `make check`

- [ ] **T-13 — Docs**
  - Arquivos: `alterar .ai/docs/BUSINESS.md`, `.ai/docs/SECURITY.md`, `.ai/docs/ARCHITECTURE.md`
  - O que fazer:
    - Os 3 itens do DoD da spec, seção 13.
    - Em `BUSINESS.md`:
      - a entidade `LeadershipPosition` passa a ser "**OrgChartLink**: vínculos de acompanhamento (`high_council_links`, `high_council_units`, `unit_org_links`)";
      - o glossário `Liderança` passa a apontar para `org_chart_members()`;
      - a linha `Organizações` ganha `sunday_school` (Escola Dominical, só no organograma);
      - RN-02 perde "liderança".
    - Em `ARCHITECTURE.md`, o padrão "Organograma" (domínio puro, 2 chaves públicas, telefones fora do cache) e o seed de demonstração em `supabase/seeds/`.
  - Referência: seção "Padrões" de `.ai/docs/ARCHITECTURE.md` e a tabela de dados de `.ai/docs/SECURITY.md`
  - Cobre: DoD (docs)
  - Verificar: leitura; `make lint`

- [ ] **T-14 — QA em aparelho (sessão principal, com o usuário)**
  - O que fazer: `supabase db reset`, `make dev` num build de desenvolvimento. Rodar os passos 1 a 11 do roteiro de QA em iOS e Android, incluindo VoiceOver, TalkBack e fonte em 1.6×. Registrar o resultado no Registro de implementação.
  - Cobre: CA-32 (manual) e confirmação visual dos demais
  - Verificar: roteiro sem divergências

## 5. Matriz de cobertura

| CA | Tarefa | Tipo de teste | Arquivo de teste |
| -- | ------ | ------------- | ---------------- |
| CA-01 | T-01 | integração (pgTAP) | `supabase/tests/leadership.test.sql` |
| CA-02 | T-01 | integração (pgTAP) | `supabase/tests/leadership.test.sql` |
| CA-03 | T-01 | integração (pgTAP) | `supabase/tests/leadership.test.sql` |
| CA-04 | T-01 | integração (pgTAP) | `supabase/tests/leadership.test.sql` |
| CA-05 | T-01 | integração (pgTAP) | `supabase/tests/leadership.test.sql` |
| CA-06 | T-01 | integração (pgTAP) | `supabase/tests/leadership.test.sql` |
| CA-07 | T-01 | integração (pgTAP) | `supabase/tests/leadership.test.sql` |
| CA-08 | T-01 | integração (pgTAP) | `supabase/tests/leadership.test.sql` |
| CA-09 | T-01 | integração (pgTAP) | `supabase/tests/leadership.test.sql` |
| CA-10 | T-01 | integração (pgTAP) | `supabase/tests/leadership.test.sql` |
| CA-11 | T-04, T-07 | unitário + componente | `src/domain/orgChart.test.ts`, `src/features/leadership/StakeTree.test.tsx` |
| CA-12 | T-04 | unitário | `src/domain/orgChart.test.ts` |
| CA-13 | T-04, T-07 | unitário + componente | `src/domain/orgChart.test.ts`, `src/features/leadership/UnitTree.test.tsx` |
| CA-14 | T-04, T-07, T-10 | unitário + componente | `orgChart.test.ts`, `UnitTree.test.tsx`, `UnitLeadershipScreen.test.tsx` |
| CA-15 | T-04, T-07, T-10 | unitário + componente | `orgChart.test.ts`, `UnitTree.test.tsx`, `UnitLeadershipScreen.test.tsx` |
| CA-16 | T-09 | componente | `src/features/leadership/LeadershipScreen.test.tsx` |
| CA-17 | T-10 | componente | `src/features/leadership/UnitLeadershipScreen.test.tsx` |
| CA-18 | T-04, T-09 | unitário + componente | `orgChart.test.ts`, `LeadershipScreen.test.tsx` |
| CA-19 | T-08 | componente | `src/features/leadership/PersonSheet.test.tsx` |
| CA-20 | T-08, T-09 | componente (`Linking` simulado) | `PersonSheet.test.tsx`, `LeadershipScreen.test.tsx` |
| CA-21 | T-08 | componente (clipboard simulado) | `PersonSheet.test.tsx` |
| CA-22 | T-03, T-08 | unitário + componente | `src/domain/phone.test.ts`, `PersonSheet.test.tsx` |
| CA-23 | T-06, T-08, T-09 | unitário + componente | `leadership/api.test.ts`, `PersonSheet.test.tsx`, `LeadershipScreen.test.tsx` |
| CA-24 | T-12 | componente | `src/features/account/PhoneSheet.test.tsx`, `ProfileScreen.test.tsx` |
| CA-25 | T-03, T-12 | unitário + componente | `phone.test.ts`, `PhoneSheet.test.tsx` |
| CA-26 | T-11 | componente | `LeadershipScreen.test.tsx`, `UnitLeadershipScreen.test.tsx` |
| CA-27 | T-11 | componente | `src/features/leadership/HighCouncilorLinkSheet.test.tsx` |
| CA-28 | T-11 | componente | `src/features/leadership/OrgCounselorSheet.test.tsx`, `UnitLeadershipScreen.test.tsx` |
| CA-29 | T-11 | componente | `HighCouncilorLinkSheet.test.tsx`, `OrgCounselorSheet.test.tsx` |
| CA-30 | T-09 | componente | `LeadershipScreen.test.tsx` |
| CA-31 | T-06 | unitário | `src/features/leadership/api.test.ts`, `src/features/account/api.test.ts` |
| CA-32 | T-07, T-11, T-12, T-14 | componente (rótulos, papéis, empilhamento) + **manual** (VoiceOver/TalkBack e 1.6× em aparelho) | `StakeTree.test.tsx`, `UnitTree.test.tsx`, `PersonSheet.test.tsx`, `PhoneSheet.test.tsx`; roteiro passo 11 |

## 6. Riscos e mitigação

| Risco | Mitigação |
| ----- | --------- |
| O seed de demonstração quebra contagens dos testes pgTAP existentes | Arquivo separado, só com contas `organograma.*`, apagadas no início de cada teste dentro da transação (2.2). T-02 roda `make test-db` completo |
| `org_chart_links()` vazar o `member_call_id` de um conselheiro ou de um sumo conselheiro que recusou | Filtro pelo `org_chart_members()` no SQL e asserções explícitas em CA-08 e CA-09 |
| Telefone parar no disco por engano de chave | Chave `['leadership','phones',userId]`; teste de `isPublicQueryKey` em T-06 |
| `FilterChip` sem estado de selecionado para o leitor de tela | T-11 verifica e, se faltar, acrescenta ao componente com teste |
| Árvore em duas colunas apertada em tela pequena ou fonte ampliada | Empilhamento a partir de `fontScale` 1.3 (RNF-11) e verificação manual em 1.6× (T-14) |
| Dois líderes salvando ao mesmo tempo | Último salvamento vale (upsert); `Concluir` e `onSaved` recarregam os vínculos |
| `expo-clipboard` fora da versão do SDK | Instalar só com `npx expo install`; `make build` em T-05 |

## 7. Registro de implementação

### Arquivos criados e alterados

### Desvios do plano

### Decisões durante a implementação

### CA sem teste automatizado
