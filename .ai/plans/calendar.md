# Plano: Agenda pública

> **Spec:** `.ai/specs/calendar.md`
> **Criado em:** 2026-11-15
> **ADRs relacionados:** `.ai/adrs/0005-fuso-sao-paulo-offset-fixo.md` (novo), `0002-stack-inicial.md`

## 1. Abordagem

Toda a lógica de datas fica em funções puras de domínio:
- `src/domain/time.ts`: data civil de Brasília, com offset fixo de UTC−3 (ADR 0005);
- `src/domain/calendar.ts`: grade, semana, janela do dia, eventos de vários dias, filtros e busca.

As telas só montam a interface.

A leitura dos eventos é feita por **mês civil** (RNF-03, RNF-05). Cada mês é uma query com a chave `['public', 'events', 'month', 'AAAA-MM']`, que traz os eventos que se sobrepõem a ele. A tela sempre pede o mês visível, o anterior e o seguinte com `useQueries`. Assim, ao trocar de período, o mês quase sempre já está no cache e não aparece spinner.

O cache offline usa o `PersistQueryClientProvider` sobre o AsyncStorage. Só são persistidas as queries cuja chave começa com `'public'` (RNF-01), e elas valem 7 dias (RNF-02). A conectividade vem do NetInfo, ligado ao `onlineManager` do TanStack.

As ações do detalhe usam o próprio sistema:
- mapa por `Linking`;
- calendário por `expo-calendar` (`createEventInCalendarAsync`, sem pedir permissão total);
- compartilhar por `Share`.

O filtro de unidade reutiliza o `UnitPickerSheet` do design system (`noneLabel` = `Todas`, com as 7 unidades), em vez de criar um `UnitFilterSheet`.

## 2. Contratos

### 2.1 Banco: `supabase/migrations/<ts>_events.sql`

```sql
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
create index events_period_idx on public.events (starts_at, ends_at);
create trigger events_set_updated_at before update on public.events
  for each row execute function public.set_updated_at();
alter table public.events enable row level security;
create policy events_select_all on public.events for select to anon, authenticated using (true);
-- No write policy: event-form adds it (RF-01). A3 of the spec: there are no drafts.
```

### 2.2 Domínio

```ts
// src/domain/time.ts (ADR 0005)
export const SAO_PAULO_OFFSET_MINUTES = -180;
export type CivilDate = { year: number; month: number; day: number }; // month 1–12
export type WallTime = CivilDate & { hour: number; minute: number };
export function toSaoPauloWallTime(instant: Date): WallTime;
export function civilDateOf(instant: Date): CivilDate;
export function startOfCivilDay(date: CivilDate): Date;          // instant of 00:00 in São Paulo
export function addDays(date: CivilDate, days: number): CivilDate;
export function addMonthsClamped(date: CivilDate, months: number): CivilDate; // 31/01 + 1 → 28 or 29/02
export function weekdayOf(date: CivilDate): number;              // 0 = Sunday
export function sameDate(a: CivilDate, b: CivilDate): boolean;
export function monthKey(date: CivilDate): string;               // 'YYYY-MM'
export function monthRange(key: string): { from: Date; to: Date }; // [day 1 00:00, next month day 1 00:00) in São Paulo
export function formatTime(instant: Date): string;               // 'HH:mm', 24 h in every locale
// Labels: Intl.DateTimeFormat(locale, { ...options, timeZone: 'UTC' }) over Date.UTC(civil date, 12:00)
export function formatCivil(date: CivilDate, locale: string, options: Intl.DateTimeFormatOptions): string;

// src/domain/eventTypes.ts (RF-02)
export type EventType = 'activity' | 'meeting' | 'training' | 'conference' | 'caravan';
export const eventTypes: readonly EventType[];
export const eventTypeIcon: Record<EventType, 'celebration' | 'forum' | 'school' | 'podium' | 'directions_bus'>;
export function isEventType(value: string): value is EventType;
// Labels come from i18n: calendar.types.<type>.one / .other

// src/domain/calendar.ts
export type CalendarEvent = {
  id: string; unitId: UnitId; type: EventType; title: string; startsAt: Date; endsAt: Date;
  location: string; notes: string; links: string[];
};
export type EventFilters = { unitId: UnitId | null; type: EventType | null; search: string };
export function normalizeText(text: string): string;  // lowercase, NFD without diacritics, trim
export function matchesFilters(event: CalendarEvent, filters: EventFilters,
  labels: { typeOne: string; typeOther: string; unitName: string }): boolean; // RF-04, RF-05, RF-06
export function eventsOnDate(events: readonly CalendarEvent[], date: CivilDate): CalendarEvent[]; // overlap; ends_at exclusive; ordered by start
export type DayPart = 'single' | 'first' | 'middle' | 'last';
export function dayPart(event: CalendarEvent, date: CivilDate): DayPart;                         // RF-11
export function monthGrid(month: CivilDate): CivilDate[];      // 35 or 42 cells, starting on Sunday (A4)
export function weekOf(date: CivilDate): CivilDate[];          // 7 days, Sunday to Saturday
export function unitDots(events: readonly CalendarEvent[]): UnitId[]; // distinct, in unitOrder, at most 3 (CA-09)
export const DAY_WINDOW = { startHour: 6, endHour: 22 } as const;      // A5
export function dayBlock(event: CalendarEvent, date: CivilDate): { topMinutes: number; heightMinutes: number } | null;
//   clamped to 06:00–22:00 (CA-11); null when the event does not touch the window
export function shareText(event: CalendarEvent, labels: { date: string; unitName: string }): string; // RF-15
```

### 2.3 Lib e api

```ts
// src/lib/queryPersistence.ts (RNF-01, RNF-02)
export const PERSIST_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
export const PUBLIC_STALE_TIME_MS = 5 * 60 * 1000;
export function isPublicQueryKey(key: readonly unknown[]): boolean; // key[0] === 'public'
export const queryPersister: Persister;   // createAsyncStoragePersister({ storage: AsyncStorage, key: 'estaca.query-cache' })
export const persistOptions: Omit<PersistQueryClientOptions, 'queryClient'>;
//   { persister, maxAge: PERSIST_MAX_AGE_MS, buster: '1',
//     dehydrateOptions: { shouldDehydrateQuery: (q) => isPublicQueryKey(q.queryKey) && q.state.status === 'success' } }

// src/lib/network.ts
export function useIsOnline(): boolean;          // NetInfo: isConnected !== false && isInternetReachable !== false
export function wireOnlineManager(): () => void;  // onlineManager.setEventListener with NetInfo; called once in _layout

// src/features/calendar/api.ts
export const eventsMonthQueryKey = (key: string) => ['public', 'events', 'month', key] as const;
export const eventQueryKey = (id: string) => ['public', 'event', id] as const;
export async function fetchEventsInMonth(key: string): Promise<CalendarEvent[]>;
//   select * where starts_at < to and ends_at > from (monthRange); rows with unknown unit or type are dropped
export function useEventsAround(visible: CivilDate): {
  events: CalendarEvent[]; status: 'loading' | 'error' | 'success'; refetch: () => void;
}; // useQueries over the visible month ±1, deduplicated by id; staleTime PUBLIC_STALE_TIME_MS; gcTime PERSIST_MAX_AGE_MS
export async function fetchEvent(id: string): Promise<CalendarEvent | null>;   // maybeSingle
export function useEvent(id: string): UseQueryResult<CalendarEvent | null>;
//   placeholderData: the event found in any cached month query
```

No `_layout.tsx`, o `QueryClientProvider` dá lugar ao `PersistQueryClientProvider client={queryClient} persistOptions={persistOptions}`, e `wireOnlineManager()` é chamado uma vez. As chaves de viewer, perfil e acessos não começam com `'public'` e por isso nunca vão para o disco.

### 2.4 Telas e rotas

| Arquivo | Conteúdo |
| --- | --- |
| `src/features/calendar/AgendaScreen.tsx` | Cabeçalho (RF-03), busca, filtro de unidade, chips de tipo, `Segmented`, barra de período e a visão ativa. Mostra o `OfflineBanner` quando `!useIsOnline()` e já há eventos, e os estados de RF-17 |
| `src/features/calendar/PeriodBar.tsx` | Setas, rótulo e `Hoje` (RF-07). O rótulo tem `accessibilityLiveRegion="polite"` (RNF-09) |
| `src/features/calendar/MonthView.tsx` | Grade (RF-08, RNF-07), resumo do dia e `EventCard`s |
| `src/features/calendar/WeekView.tsx` | Faixa dos 7 dias e grupos por dia (RF-09) |
| `src/features/calendar/DayView.tsx` | Faixa e linha do tempo de 44 px por hora, com os blocos (RF-10, RNF-10) e a linha do agora, que só aparece hoje e se recalcula a cada 60 s |
| `src/features/calendar/EventDetailScreen.tsx` | RF-12 a RF-16 |
| `src/features/calendar/eventActions.ts` | `openInMaps(location)`, `addToDeviceCalendar(event)`, `shareEvent(event, labels)` |
| `src/features/placeholder/screens.tsx` | Ganha `NotificationsPlaceholder`, com o título `notifications.title` (`Notificações`) |
| `src/app/(tabs)/agenda.tsx` | Re-export de `AgendaScreen` |
| `src/app/event/[id].tsx` | Re-export de `EventDetailScreen` |
| `src/app/notifications.tsx` | Re-export de `NotificationsPlaceholder` (provisória) |

**Rótulos de período.** Os nomes de mês e de dia da semana vêm de `formatCivil` no locale ativo:
- Mês: `{ month: 'long', year: 'numeric' }`, com a primeira letra maiúscula: `Novembro 2026`.
- Semana: `{ day: 'numeric', month: 'short' }`: `8 nov – 14 nov`.
- Dia: `{ weekday: 'short', day: 'numeric', month: 'short' }`: `Sex, 13 nov`.

A pontuação que o `Intl` acrescenta (o ponto de `nov.` e o "de") é removida para ficar igual à spec.

**`eventActions`:**
- `openInMaps` tenta `maps:?q=` no iOS e `geo:0,0?q=` no Android, com `encodeURIComponent`. Se falhar, abre `https://www.google.com/maps/search/?api=1&query=`.
- `addToDeviceCalendar` chama `Calendar.createEventInCalendarAsync({ title, startDate, endDate, location, notes: notes + links })` e devolve `'saved' | 'other'`. O toast só aparece em `'saved'`. Confira em `node_modules/expo-calendar` a assinatura e os valores de `action` desta versão. Se der erro, mostra o toast `Não foi possível abrir a agenda do celular.` (7.5).
- `shareEvent` chama `Share.share({ message })`.

### 2.5 Tokens novos (`theme.ts`, todos `// derived`)

```ts
size.monthCell: 41, size.dayCircle: 30, size.periodArrow: 32, size.typeChip: 32,
size.unitFilterMaxWidth: 142, size.dayHourHeight: 44, size.nowLine: 2
```

### 2.6 i18n (3 locales; pt-BR literal da spec)

```
calendar.overline ("ESTACA CRICIÚMA"), .title ("Agenda"), .notifications ("Notificações"),
calendar.search ("Buscar evento"), .allUnits ("Todas"), .unitFilter ("Unidade"), .allTypes ("Todos os tipos")
calendar.types.<type>.one / .other (RF-02)
calendar.views.month ("Mês"), .week ("Semana"), .day ("Dia"), .today ("Hoje"), .previous ("Anterior"), .next ("Próximo")
calendar.weekdaysShort: pt-BR ["D","S","T","Q","Q","S","S"]; en-US ["S","M","T","W","T","F","S"]; es-MX ["D","L","M","M","J","V","S"]
calendar.month.summary ("{{weekday}}, {{day}} de {{month}}"), .count_one ("{{count}} evento"), .count_other ("{{count}} eventos")
calendar.empty.day ("Nenhum evento neste dia com os filtros atuais."), .week ("Nenhum evento nesta semana com os filtros atuais."),
               .dayView ("Nenhum evento neste dia"), .error ("Não foi possível carregar a agenda."), .retry ("Tentar de novo")
calendar.allDay ("Dia todo"), .until ("até {{time}}"), .todayTag ("Hoje")
calendar.a11y.day_one ("{{date}}, {{count}} evento"), .day_other ("{{date}}, {{count}} eventos"), .dayNone ("{{date}}, sem eventos"),
               .todayPrefix ("Hoje, "), .block ("{{title}}, {{start}} a {{end}}, {{unit}}")
calendar.detail.notes ("Notas"), .links ("Links"), .addToCalendar ("Adicionar à agenda"), .share ("Compartilhar"),
                .openMap ("Abrir no mapa"), .added ("Evento adicionado à sua agenda."),
                .calendarUnavailable ("Não foi possível abrir a agenda do celular."),
                .gone ("Este evento não está mais disponível."), .seeAgenda ("Ver agenda")
notifications.title ("Notificações")
```

## 3. Dependências novas

Estão previstas na seção 4 da spec. As nativas entram com `npx expo install` e as de JS com `npm i -E`:

| Pacote | Versão | Motivo |
| --- | --- | --- |
| `@tanstack/react-query-persist-client` | 5.107.1 | Cache persistido (RF-18) |
| `@tanstack/query-async-storage-persister` | 5.107.1 | Persister sobre o AsyncStorage (RF-18) |
| `@react-native-community/netinfo` | 12.0.1 | Detectar falta de conexão (RF-18) |
| `expo-calendar` | ~58.0.7 | Diálogo nativo "Adicionar à agenda" (RF-14, RNF-06) |

- O `@react-native-async-storage/async-storage` já está instalado.
- Se o `expo install` registrar o plugin do `expo-calendar` num `app.json`, mova-o para o `app.config.ts`. O plugin recebe só a mensagem de calendário em pt-BR: `"Permite adicionar eventos da estaca à sua agenda."`.
- Rode `npm audit --omit=dev`.

O Maestro, usado no E2E do DoD, é uma ferramenta de linha de comando, não um pacote npm, e não está instalado nesta máquina. A T-11 cria o fluxo, e a T-12 o executa com o usuário.

## 4. Tarefas

- [x] **T-01 — Tabela `events` e seed (RF-01)**
  - Arquivos: `criar supabase/migrations/<ts>_events.sql` (`supabase migration new events`) · `alterar supabase/seed.sql` · `criar supabase/tests/events_read.test.sql` · `alterar src/lib/database.types.ts` (`make db-types`)
  - O que fazer:
    - Implementar o contrato 2.1.
    - Popular o seed com 20 eventos fictícios distribuídos entre o mês anterior, o atual e o seguinte. As datas são relativas ao mês atual de São Paulo: `date_trunc('month', now() at time zone 'America/Sao_Paulo')` mais deslocamentos. O seed precisa ter:
      - as 7 unidades e os 5 tipos;
      - um evento de 3 dias;
      - um evento das 05:00 às 07:00;
      - um dia com eventos de 4 unidades;
      - uma `Conferência de Estaca` e uma `Noite de jogos`;
      - 2 eventos com local, notas e 2 links;
      - `created_by` da conta estaca em um dos eventos.
    - Testes pgTAP:
      - "CA-01": `anon` lê, e `insert` dá 42501;
      - "CA-02": `ends_at <= starts_at` viola `events_ends_after_starts`;
      - link `http://` é rejeitado;
      - 6 links são rejeitados;
      - título vazio é rejeitado.
  - Referência: `supabase/migrations/20261113220132_base_units_profiles_roles.sql` (tabela + RLS), `supabase/tests/base_rls.test.sql`
  - Cobre: CA-01, CA-02
  - Verificar: `supabase db reset && make test-db && make db-types`

- [x] **T-02 — Tempo e tipos no domínio (RNF-04, RF-02)**
  - Arquivos: `criar src/domain/time.ts` (+ teste) · `criar src/domain/eventTypes.ts` (+ teste) · `alterar jest.config.js` (`process.env.TZ = 'Europe/Lisbon'` na primeira linha, com comentário citando o ADR 0005) · `alterar .ai/docs/RULES.md` ("Datas e fuso" cita o ADR 0005)
  - O que fazer:
    - Implementar o contrato 2.2 de `time.ts` e `eventTypes.ts`.
    - Testes:
      - "CA-20": `toSaoPauloWallTime(new Date('2026-11-13T22:30:00Z'))` dá 13/11 às 19:30, e `formatTime` dá `19:30`, com a suíte em `TZ=Europe/Lisbon`;
      - `addMonthsClamped`: 31/01 vira 28/02 em 2027 e 29/02 em 2028;
      - `monthRange('2026-11')` vai de `2026-11-01T03:00Z` a `2026-12-01T03:00Z`;
      - `weekdayOf`.
    - Rodar a suíte inteira com o `TZ` novo e corrigir o que depender do fuso da máquina.
  - Referência: `src/domain/initials.ts` (função pura com teste)
  - Cobre: CA-20 (domínio); base para CA-06
  - Verificar: `make test`

- [x] **T-03 — Regras da agenda (RF-04 a RF-11, 7.5)**
  - Arquivos: `criar src/domain/calendar.ts` (+ `calendar.test.ts`)
  - O que fazer:
    - Implementar o contrato 2.2 de `calendar.ts`.
    - Testes:
      - "CA-04": a busca `conferencia` acha `Conferência de Estaca` e não acha `Noite de jogos`;
      - "CA-05": filtro de unidade;
      - "CA-06": filtro de tipo;
      - "CA-07": `addMonthsClamped`;
      - "CA-09": com 4 unidades, `unitDots` devolve 3, na ordem de `unitOrder`;
      - "CA-11": `dayBlock` de um evento das 05:00 às 07:00 começa às 06:00 (`topMinutes` 0) com 60 min de altura;
      - "CA-12": `dayPart` dá `first`, `middle` e `last` em 14, 15 e 16/11;
      - um evento que termina às 00:00 não aparece no dia seguinte;
      - `monthGrid` de novembro de 2026 começa no domingo 01/11;
      - `weekOf`;
      - "CA-16": `shareText` sai no formato de RF-15.
  - Referência: `src/domain/permissions.test.ts`
  - Cobre: CA-04, CA-05, CA-06, CA-07, CA-09, CA-11, CA-12 e CA-16 (domínio)
  - Verificar: `make test`

- [x] **T-04 — Cache persistido e rede (RF-18, RNF-01, RNF-02)**
  - Arquivos: `alterar package.json`/`package-lock.json` (seção 3) · `criar src/lib/queryPersistence.ts` (+ teste) · `criar src/lib/network.ts` (+ teste) · `alterar src/app/_layout.tsx` · `alterar jest.setup.ts` (mock do NetInfo: `@react-native-community/netinfo/jest/netinfo-mock`)
  - O que fazer:
    - Implementar o contrato 2.3 da lib.
    - Testes:
      - "CA-19": `shouldDehydrateQuery` aceita `['public','events','month','2026-11']` e recusa `['viewer', id]` e `['access']`;
      - o `maxAge` é de 7 dias;
      - `useIsOnline` reage aos eventos do mock.
  - Referência: `src/lib/authSession.tsx` (lib com provider), `src/app/_layout.tsx`
  - Cobre: CA-19 (regras)
  - Verificar: `make check`

- [ ] **T-05 — API dos eventos**
  - Arquivos: `criar src/features/calendar/api.ts` (+ `api.test.ts`)
  - O que fazer:
    - Implementar o contrato 2.3 da api, com o cliente Supabase mockado.
    - Testes:
      - o filtro de sobreposição usa `lt('starts_at', to)` e `gt('ends_at', from)`;
      - linhas com tipo ou unidade desconhecidos são descartadas;
      - `fetchEvent` devolve `null` para um id inexistente;
      - as chaves começam com `'public'`.
  - Referência: `src/features/viewer/api.ts`, `src/features/viewer/api.test.ts`
  - Cobre: base para CA-03 e CA-17 a CA-19
  - Verificar: `make test`

- [ ] **T-06 — Aba Agenda: cabeçalho, filtros e período (RF-03 a RF-07, RF-17, RF-18)**
  - Arquivos: `criar src/features/calendar/AgendaScreen.tsx` (+ teste) · `criar src/features/calendar/PeriodBar.tsx` · `alterar src/app/(tabs)/agenda.tsx` · `criar src/app/notifications.tsx` · `alterar src/features/placeholder/screens.tsx` · `alterar src/theme/theme.ts` (2.5) · `alterar src/i18n/locales/*.json` (2.6)
  - O que fazer:
    - Montar a tela conforme 2.4. O `now` vem de um `useNow()` local, que o teste controla com `jest.useFakeTimers` e `setSystemTime`.
    - O filtro de unidade abre o `UnitPickerSheet` com `noneLabel` = `Todas` e `units` = `unitOrder`.
    - Os chips de tipo ficam num `ScrollView` horizontal.
    - Testes, com `setSystemTime(2026-11-13T15:00Z)` e eventos mockados:
      - "CA-03": aparecem `Agenda`, `Novembro 2026`, o dia 13 selecionado e os eventos dele;
      - "CA-08": depois de navegar, `Hoje` volta para 13/11;
      - "CA-18": sem cache e com erro, aparecem a mensagem e `Tentar de novo`, que chama `refetch`;
      - "CA-19": offline com dados, aparece o `OfflineBanner`;
      - "CA-21": o sino navega para `/notifications`;
      - o `Skeleton` aparece na primeira carga;
      - o rótulo do período tem `accessibilityLiveRegion`.
  - Referência: `src/features/account/AccessScreen.tsx` (tela com query e estados), `src/features/navigation/TabsLayout.test.tsx` (render com router)
  - Cobre: CA-03, CA-08, CA-18, CA-19 (tela), CA-21, RNF-09
  - Verificar: `make test`

- [ ] **T-07 — Visão Mês (RF-08, RNF-07, RNF-08)**
  - Arquivos: `criar src/features/calendar/MonthView.tsx` (+ teste)
  - O que fazer:
    - Grade com células de `size.monthCell` e círculo de `size.dayCircle`:
      - dias de fora do mês em `textDisabled`;
      - hoje com contorno `primary`;
      - dia selecionado com fundo `primary`.
    - Cada dia é um botão com o rótulo de RNF-07 e `accessibilityState.selected`.
    - Abaixo da grade, o resumo e os `EventCard`s, com o `timeLabel` conforme `dayPart` (RF-11) e o ícone do tipo.
    - Testes:
      - "CA-05": com `Ala Içara`, só aparecem pontos e cards de Içara;
      - "CA-06": com `Reuniões`, só eventos `meeting`;
      - "CA-09": um dia com 4 unidades mostra 3 pontos;
      - "CA-12": os rótulos `18:00 · …`, `Dia todo` e `até 12:00`;
      - o rótulo de acessibilidade do dia;
      - o vazio de RF-08.
  - Referência: `src/components/EventCard.tsx`, `src/components/Segmented.tsx`
  - Cobre: CA-05, CA-06, CA-09 e CA-12 (tela), RNF-07, RNF-08
  - Verificar: `make test`

- [ ] **T-08 — Visões Semana e Dia (RF-09, RF-10, RNF-10)**
  - Arquivos: `criar src/features/calendar/WeekView.tsx` (+ teste) · `criar src/features/calendar/DayView.tsx` (+ teste)
  - O que fazer:
    - Semana: faixa de 7 dias e os grupos por dia, com a etiqueta `Hoje`.
    - Dia: linha do tempo das 06:00 às 22:00, com `size.dayHourHeight` por hora.
      - Os blocos usam `position: 'absolute'`, com top e altura de `dayBlock`, fundo `tint` e borda esquerda `dot`. Cada bloco é um botão (RNF-10).
      - A linha do agora usa `theme.danger` e `size.nowLine`, e só aparece no dia de hoje.
    - Testes:
      - "CA-10": uma semana sem eventos mostra a mensagem;
      - "CA-11": o bloco das 05:00 às 07:00 tem `top` 0;
      - o rótulo de RNF-10;
      - a linha do agora só aparece hoje;
      - o vazio da visão Dia;
      - tocar num bloco navega para `/event/[id]`.
  - Referência: `MonthView.tsx` (T-07)
  - Cobre: CA-10 e CA-11 (tela), RNF-10
  - Verificar: `make test`

- [ ] **T-09 — Detalhe do evento (RF-12 a RF-16)**
  - Arquivos: `alterar package.json` (`expo-calendar`, se não entrou na T-04) · `criar src/features/calendar/eventActions.ts` (+ teste) · `criar src/features/calendar/EventDetailScreen.tsx` (+ teste) · `criar src/app/event/[id].tsx` · `alterar app.config.ts` (plugin `expo-calendar`)
  - O que fazer:
    - Implementar 2.4.
    - O voltar do `ScreenHeader` faz `router.back()`; sem histórico, `router.replace('/agenda')`.
    - Os links abrem com `Linking.openURL`.
    - Testes, com `Linking`, `expo-calendar` e `Share` mockados:
      - "CA-13": aparecem todos os campos e os 3 botões;
      - "CA-14": `openInMaps` usa `maps:?q=` no iOS e `geo:0,0?q=` no Android; quando `openURL` rejeita, cai na URL do Google;
      - "CA-15": `createEventInCalendarAsync` é chamado com os dados, sem `requestCalendarPermissionsAsync`, e `saved` mostra o toast;
      - "CA-16": `Share.share` recebe o texto de RF-15;
      - "CA-17": `null` mostra `Este evento não está mais disponível.` e `Ver agenda`;
      - um erro do calendário mostra o toast de 7.5;
      - um evento sem local não mostra `Abrir no mapa`.
  - Referência: `src/features/account/api.ts` (`exportMyData` com `Sharing` mockado)
  - Cobre: CA-13, CA-14, CA-15, CA-16, CA-17 (automatizado; o diálogo real fica na T-12)
  - Verificar: `make check`

- [ ] **T-10 — Documentação**
  - Arquivos: `alterar .ai/docs/ARCHITECTURE.md` · `alterar .ai/docs/SECURITY.md`
  - O que fazer:
    - `ARCHITECTURE.md`:
      - acrescentar os padrões "Cache público persistido" (`queryPersistence.ts`, chave `['public', ...]`) e "Datas" (ADR 0005);
      - tirar "persistência offline do TanStack Query" da lista de pacotes não instalados;
      - acrescentar `features/calendar`.
    - `SECURITY.md`: registrar que só dados públicos são persistidos no aparelho (RNF-01).
  - Cobre: DoD
  - Verificar: `make check`

- [ ] **T-11 — Fluxo Maestro (DoD)**
  - Arquivos: `criar .maestro/agenda-publica.yaml`
  - O que fazer:
    - Criar o fluxo com `appId: host.exp.Exponent` (Expo Go), abrindo pelo deep link do Metro (`exp://127.0.0.1:8081`).
    - Passos:
      1. espera `Agenda`;
      2. toca no filtro `Todas` e depois em `Ala Içara`;
      3. confere que um evento de Içara do seed aparece;
      4. abre o evento e confere `Adicionar à agenda`.
    - No topo do arquivo, comentar como rodar: Maestro instalado, simulador aberto e `make dev`.
  - Referência: nenhuma no repositório (é o primeiro fluxo); documentação do Maestro (`launchApp`, `openLink`, `tapOn`, `assertVisible`)
  - Cobre: DoD (Maestro), CA-03 e CA-05 de ponta a ponta
  - Verificar: `make lint` (o YAML fica fora do lint); a execução é na T-12

- [ ] **T-12 — QA em aparelho (sessão principal, com o usuário)**
  - Arquivos: nenhum; o resultado vai para o Registro de implementação
  - O que fazer:
    - Passos 1 a 8 do roteiro da spec, em iOS e Android, contra o Supabase local com o seed.
    - CA-14, CA-15 e CA-22 nos apps reais.
    - Instalar o Maestro e rodar `make test-e2e`.
  - Cobre: CA-14, CA-15 e CA-22 (manuais), DoD
  - Verificar: roteiro de QA

## 5. Matriz de cobertura

| CA | Tarefa | Tipo de teste | Arquivo de teste |
| -- | ------ | ------------- | ---------------- |
| CA-01 | T-01 | banco | `supabase/tests/events_read.test.sql` |
| CA-02 | T-01 | banco | `events_read.test.sql` |
| CA-03 | T-06, T-11 | componente + e2e | `AgendaScreen.test.tsx`, `.maestro/agenda-publica.yaml` |
| CA-04 | T-03 | unitário | `src/domain/calendar.test.ts` |
| CA-05 | T-03, T-07, T-11 | unitário + componente + e2e | `calendar.test.ts`, `MonthView.test.tsx`, `agenda-publica.yaml` |
| CA-06 | T-03, T-07 | unitário + componente | `calendar.test.ts`, `MonthView.test.tsx` |
| CA-07 | T-03 | unitário | `calendar.test.ts` (`addMonthsClamped`) |
| CA-08 | T-06 | componente | `AgendaScreen.test.tsx` |
| CA-09 | T-03, T-07 | unitário + componente | `calendar.test.ts`, `MonthView.test.tsx` |
| CA-10 | T-08 | componente | `WeekView.test.tsx` |
| CA-11 | T-03, T-08 | unitário + componente | `calendar.test.ts`, `DayView.test.tsx` |
| CA-12 | T-03, T-07 | unitário + componente | `calendar.test.ts`, `MonthView.test.tsx` |
| CA-13 | T-09 | componente | `EventDetailScreen.test.tsx` |
| CA-14 | T-09, T-12 | unitário (mock de `Linking`) + manual | `eventActions.test.ts` |
| CA-15 | T-09, T-12 | unitário (mock de `expo-calendar`) + manual | `eventActions.test.ts`, `EventDetailScreen.test.tsx` |
| CA-16 | T-03, T-09 | unitário + componente | `calendar.test.ts`, `EventDetailScreen.test.tsx` |
| CA-17 | T-09 | componente | `EventDetailScreen.test.tsx` |
| CA-18 | T-06 | componente | `AgendaScreen.test.tsx` |
| CA-19 | T-04, T-06 | unitário + componente | `queryPersistence.test.ts`, `AgendaScreen.test.tsx` |
| CA-20 | T-02 | unitário (suíte em `TZ=Europe/Lisbon`) | `src/domain/time.test.ts` |
| CA-21 | T-06 | componente | `AgendaScreen.test.tsx` |
| CA-22 | T-12 | manual (VoiceOver/TalkBack) | roteiro de QA |

## 6. Riscos e mitigação

| Risco | Mitigação |
| ----- | --------- |
| O Brasil volta a ter horário de verão | Toda a regra de fuso está em `src/domain/time.ts` (ADR 0005). |
| `TZ=Europe/Lisbon` quebra testes antigos | A T-02 roda a suíte inteira e corrige o que dependia do fuso da máquina. |
| No Android, `createEventInCalendarAsync` pode não informar que o evento foi salvo | O toast só aparece com `saved`. Se o Android não devolver `saved`, não há toast; registrar no Registro de implementação e conferir na T-12. |
| O cache persistido cresce | São 3 meses por vez com validade de 7 dias, e o `buster` invalida o cache se o formato mudar. |
| Dado sensível persistido por engano | `shouldDehydrateQuery` só aceita a chave `'public'`, e o teste do CA-19 recusa `viewer` e `access`. |
| Maestro sem Expo Go no CI | O fluxo roda só localmente (`make test-e2e`, fora do `check`), na T-12. |

## 7. Registro de implementação

### Arquivos criados e alterados

### Desvios do plano

### Decisões durante a implementação

### CA sem teste automatizado
