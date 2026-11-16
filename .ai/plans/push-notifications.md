# Plano: Notificações push e histórico

> **Spec:** `.ai/specs/push-notifications.md`
> **Criado em:** 2026-11-15
> **ADRs relacionados:** `.ai/adrs/0006-edge-functions-nucleo-puro.md` (novo), `0005-fuso-sao-paulo-offset-fixo.md`, `0004-supabase-cloud.md`

## 1. Abordagem

**Servidor (ADR 0006).** As regras ficam no Postgres, em funções SQL `security definer` executáveis só pela `service_role`:
- destinatários (RF-10);
- público válido;
- permissão de quem envia;
- rate limit do envio (10 min) e do registro (10/IP/h);
- gravação do histórico.

As duas Edge Functions (`register-device`, `send-push`) são finas: verificam o chamador, chamam essas funções, montam as mensagens por idioma, enviam à Expo em lotes de 100 e registram logs. Toda a lógica delas fica em módulos puros de `supabase/functions/_shared/`, testados no Jest. O `index.ts` em Deno só liga HTTP, `supabase-js` e `fetch`.

**App.**
- `src/lib/push.ts`: permissão, token, registro (no máximo 1 por dia, e sempre ao entrar ou sair da conta), `sendPush` com erros tipados e o aviso pendente de "Receber avisos?" depois das Boas-vindas.
- `src/lib/notificationInbox.ts`: o histórico (RPC `my_notifications` + lembretes do `reminderLog`) e o estado de lido. Fica em `lib` porque a Agenda (ponto do sino) e a tela Notificações usam o mesmo dado, e uma feature não importa outra.
- `src/features/notifications/PushEffects.tsx`: montado no `_layout`, faz o registro, trata o toque na notificação e abre o sheet de RF-05.

**Duas decisões do usuário (2026-11-15) que mudam a spec:**
1. **Histórico de visitante:** o token Expo é a credencial do aparelho. Nenhuma tabela, RPC, resposta ou log devolve um token, e o CA-01 foi reescrito na spec nesses termos.
2. **Idioma do corpo:** `notifications` guarda também `event_starts_at` e `event_location`. A tela Notificações monta o corpo de evento no idioma atual do app, e o push sai no idioma do aparelho. Para aviso do mural, o corpo é a 1ª linha do texto, que não depende de idioma.

**Limite herdado:** a tabela `posts` ainda não existe (vem com `board`). `send-push` e a gravação aceitam `kind = 'post'` no contrato, mas `push_item` responde `unsupported_kind` para `post` até a `board` estender essa função. O núcleo TypeScript já monta o corpo de aviso (RF-11) e tem teste.

## 2. Contratos

### 2.1 Banco: `supabase/migrations/<ts>_push.sql` (`supabase migration new push`)

```sql
-- RF-21: a 6ª organização
alter table public.profiles drop constraint profiles_organizations_check;  -- nome real: conferir com \d profiles
alter table public.profiles add constraint profiles_organizations_check check (organizations <@
  array['relief_society','elders_quorum','young_women','young_men','primary','temple_family_history']::text[]);

create table public.push_devices (
  token text primary key check (token ~ '^Expo(nent)?PushToken\[[A-Za-z0-9_-]{10,200}\]$'),
  user_id uuid null references public.profiles (id) on delete set null,
  platform text not null check (platform in ('ios','android')),
  locale text not null check (locale in ('pt-BR','en-US','es-MX')),
  units text[] not null check (units <@ array['estaca','criciuma1','criciuma2','criciuma3','icara','ararangua','ramoGaivota']::text[]),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now());
create index push_devices_user_idx on public.push_devices (user_id);
create index push_devices_units_idx on public.push_devices using gin (units);

create table public.push_register_attempts (            -- RNF-02; sha256 do IP, apagado em 1 dia
  id bigint generated always as identity primary key,
  ip_hash text not null check (char_length(ip_hash) = 64),
  created_at timestamptz not null default now());
create index push_register_attempts_ip_idx on public.push_register_attempts (ip_hash, created_at);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('event','post')),
  item_id uuid not null,
  unit_id text not null references public.units (id),
  audience text[] not null check (cardinality(audience) between 1 and 25),
  title text not null check (char_length(title) between 1 and 120),
  body text not null default '' check (char_length(body) <= 120),   -- aviso: 1ª linha; evento: ''
  event_starts_at timestamptz null,                                  -- decisão do usuário (idioma do app)
  event_location text null check (char_length(event_location) <= 160),
  sent_by uuid null references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint notifications_event_fields check ((kind = 'event') = (event_starts_at is not null)));
create index notifications_item_idx on public.notifications (kind, item_id, created_at desc);
create index notifications_created_idx on public.notifications (created_at);

create table public.notification_deliveries (
  notification_id uuid not null references public.notifications (id) on delete cascade,
  device_token text not null,              -- sem FK: o histórico sobrevive à remoção do token
  user_id uuid null references public.profiles (id) on delete set null,
  primary key (notification_id, device_token));
create index notification_deliveries_token_idx on public.notification_deliveries (device_token);
create index notification_deliveries_user_idx on public.notification_deliveries (user_id);

create table public.notification_reads (
  notification_id uuid not null references public.notifications (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (notification_id, user_id));
```

RLS ligada nas cinco tabelas:
- `push_devices`, `push_register_attempts`, `notifications` e `notification_deliveries`: **sem política**, e com `revoke all ... from anon, authenticated`. O acesso é só pelas funções abaixo.
- `notification_reads`: políticas `select` e `insert` para `authenticated` com `user_id = auth.uid()`, e `grant select, insert` para `authenticated`. Sem `update`/`delete`: a exclusão vem por cascata.

Funções. Todas `security definer` e `set search_path = public`, com erros como códigos curtos em `message` e `errcode 'P0001'` (padrão de `account_rpcs.sql`):

| Função | `execute` para | Contrato |
| ------ | -------------- | -------- |
| `push_audience_options(p_unit text) returns text[]` (`immutable`) | todos | Estaca: `all`, os 13 `notify_group` (ordem de RF-04 de `roles-of-leadership`), `leaders`, as 6 organizações. Unidade: `all`, os 11 grupos sem `stake_presidency` e `high_council`, `leaders`, as 6 organizações. |
| `push_register_device(p_token text, p_user_id uuid, p_platform text, p_locale text, p_ip_hash text) returns text` | `service_role` | Se há ≥ 10 tentativas desse `ip_hash` na última hora, devolve `'rate_limited'` sem gravar nada. Senão, grava a tentativa e faz upsert. No insert, `units` = `['estaca']`, ou `['estaca', home_unit_id]` quando há `p_user_id` com unidade. No conflito, atualiza `user_id`, `platform`, `locale` e `last_seen_at = now()`, **mantendo `units`**. Devolve `'registered'`. Erros: `invalid_token`, `invalid_platform`, `invalid_locale`. |
| `push_item(p_kind text, p_item_id uuid) returns table (unit_id text, title text, starts_at timestamptz, location text, text_body text)` | `service_role` | `event` → a linha de `events` (`text_body` nulo). `post` → `raise 'unsupported_kind'` (a `board` substitui). Inexistente → `raise 'item_not_found'`. |
| `push_prepare(p_actor uuid, p_kind text, p_item_id uuid, p_audience text[], p_title text, p_body text, p_event_starts_at timestamptz, p_event_location text) returns jsonb` | `service_role` | Faz `set_config('request.jwt.claims', …, true)` com `p_actor` (ADR 0006). Sem `can_publish(unit do item)` → `forbidden`. Público vazio ou fora de `push_audience_options` → `invalid_audience`. `pg_advisory_xact_lock(hashtext(p_kind \|\| p_item_id::text))`; se já há `notifications` do item nos últimos 10 min → `rate_limited`. Insere a notificação e uma entrega por destinatário de `push_recipients`. Devolve `{"notification_id": uuid, "recipients": [{"token": text, "locale": text}]}`. |
| `push_recipients(p_unit text, p_audience text[]) returns table (token text, user_id uuid, locale text)` (`stable`) | `service_role` | RF-10 com o ajuste de `roles-of-leadership`: aparelho com `p_unit = any(units)` **e** (`'all' = any(p_audience)` **ou**, só com `user_id`: `profiles.organizations && p_audience`; **ou** algum `member_calls` da pessoa cujo `calling_catalog.notify_group = any(p_audience)`, com `c.active` e, se `p_unit <> 'estaca'`, `mc.unit_id = p_unit`; **ou** `'leaders' = any(p_audience)` e algum `member_calls` da pessoa com `c.access <> 'none'` e `c.active`, na unidade do item ou, se `p_unit = 'estaca'`, em qualquer uma). Uma linha por token (cada aparelho no máximo 1 vez). |
| `push_discard(p_notification_id uuid) returns void` | `service_role` | Apaga a notificação (e as entregas, em cascata) quando nenhum lote chegou à Expo. Assim o rate limit não impede o "tente de novo em instantes" de 7.7. |
| `push_remove_devices(p_tokens text[]) returns void` | `service_role` | `delete from push_devices where token = any(p_tokens)` (RNF-04). |
| `my_notifications(p_device_token text) returns table (id uuid, kind text, item_id uuid, unit_id text, title text, body text, event_starts_at timestamptz, event_location text, created_at timestamptz, read boolean)` | `anon`, `authenticated` | Últimos 90 dias. Entra a notificação que tem entrega com `device_token = p_device_token` ou, se logado, com `user_id = auth.uid()`. `read` = existe `notification_reads` do `auth.uid()` (visitante: sempre `false`). Ordem: `created_at desc`. `p_device_token` pode ser nulo. Nunca devolve token. |
| `my_device_units(p_device_token text) returns text[]` | `anon`, `authenticated` | `units` do token, ou `null` se não está registrado. |
| `set_device_units(p_device_token text, p_units text[]) returns void` | `anon`, `authenticated` | `invalid_units` se algum valor não é unidade. `device_not_found` se o token não existe. Grava `units` deduplicado, na ordem de `units.sort_order`. |
| `mark_notifications_read(p_ids uuid[]) returns void` | `authenticated` | Exige `auth.uid()`. `p_ids` nulo = todas as do `my_notifications(null)` da pessoa. Faz `insert ... on conflict do nothing` só para ids que a pessoa recebeu. |
| `push_cleanup() returns void` | `service_role` | Apaga notificações com mais de 90 dias (RNF-05; entregas e leituras vão junto), aparelhos com `last_seen_at` de mais de 180 dias (RNF-04) e tentativas de registro com mais de 1 dia. |

Job: `create extension if not exists pg_cron;` e depois `select cron.schedule('push-cleanup', '0 6 * * *', $$select public.push_cleanup()$$);` (03:00 em Brasília).

`export_my_data()`: substituir pela versão de `20261115222648_member_calls.sql:433`, acrescentando `'push_devices'`: uma lista de `{platform, locale, units, last_seen_at, created_at}` dos aparelhos com `user_id = auth.uid()`, **sem o token**. A exclusão já cobre os dados pelo `on delete set null`/`cascade` (7.7).

### 2.2 Núcleo das Edge Functions: `supabase/functions/_shared/` (sem imports, ADR 0006)

```ts
// pushContent.ts
export type PushLocale = 'pt-BR' | 'en-US' | 'es-MX';
/** RF-11: "Sábado, 21 de novembro · 15:00 · Capela do Ramo Gaivota" (sem local, sem o último " · "). */
export function eventPushBody(startsAt: Date, location: string, locale: PushLocale): string;
/** RF-11: 1ª linha não vazia, `trim`, até 120 caracteres (corta com "…" no 120º). */
export function postPushBody(text: string): string;

// sendPush.ts
export type SendPushRequest = { kind: 'event' | 'post'; itemId: string; audience: string[] };
export type SendPushDeps = {
  verifyUser(jwt: string): Promise<string | null>;                // user id, ou null se inválido
  pushItem(kind: string, itemId: string): Promise<{ unitId: string; title: string; startsAt: Date | null; location: string | null; textBody: string | null }>;
  prepare(input: { actor: string; kind: string; itemId: string; audience: string[]; title: string; body: string; eventStartsAt: Date | null; eventLocation: string | null }): Promise<{ notificationId: string; recipients: { token: string; locale: string }[] }>;
  postToExpo(messages: ExpoMessage[]): Promise<{ ok: true; tickets: ExpoTicket[] } | { ok: false; status: number }>;
  removeDevices(tokens: string[]): Promise<void>;
  discard(notificationId: string): Promise<void>;
  log(entry: LogEntry): void;
  requestId: string;
  now(): Date;
};
export type ExpoMessage = { to: string; title: string; body: string; data: { kind: 'event' | 'post'; itemId: string }; sound: 'default'; channelId: 'default' };
export type ExpoTicket = { status: 'ok'; id: string } | { status: 'error'; message: string; details?: { error?: string } };
export type LogEntry = { timestamp: string; level: 'info' | 'warn' | 'error'; event: string; request_id: string; user_id?: string; [k: string]: string | number | undefined };
export type HandlerResult = { status: number; body: Record<string, unknown> };
/** Fluxo e mapeamento:
 *  - sem Bearer JWT, ou JWT inválido → 401 { error: 'unauthorized' }
 *  - corpo inválido (kind, itemId uuid, audience string[] 1..25) → 400 { error: 'invalid_request' }
 *  - erros SQL forbidden → 403; rate_limited → 429; invalid_audience / unsupported_kind → 400; item_not_found → 404; outro → 500 { error: 'internal' }
 *  - lotes de 100; ticket com details.error === 'DeviceNotRegistered' → removeDevices (RNF-04, CA-14)
 *  - todos os lotes falharam (ok:false) → discard + 502 { error: 'push_unavailable' } e log push_dispatch_failed
 *  - senão → 200 { recipients: <tickets ok> } e log push_dispatched { item_id, recipients }
 *  - o corpo pt-BR gravado em `notifications.body` é '' para evento e postPushBody para aviso */
export async function handleSendPush(authorization: string | null, rawBody: unknown, deps: SendPushDeps): Promise<HandlerResult>;
export function chunk<T>(items: T[], size: number): T[][];

// registerDevice.ts
export type BearerKind = { kind: 'visitor' } | { kind: 'jwt'; jwt: string };
/** Sem header, token sem 2 pontos (publishable key) ou JWT com role "anon" → visitor. Senão → jwt. */
export function classifyBearer(authorization: string | null): BearerKind;
/** O 1º IP de x-forwarded-for, `trim`; sem header → 'unknown'. */
export function clientIp(forwardedFor: string | null): string;
export type RegisterDeviceDeps = {
  verifyUser(jwt: string): Promise<string | null>;
  register(input: { token: string; userId: string | null; platform: string; locale: string; ipHash: string }): Promise<'registered' | 'rate_limited'>;
  hashIp(ip: string): Promise<string>;   // sha256 hex
  log(entry: LogEntry): void; requestId: string; now(): Date;
};
/** 200 { status: 'registered' } · 429 { error: 'rate_limited' } · 400 { error: 'invalid_request' } · 401 (JWT inválido).
 *  Log device_registered { with_account: 'yes' | 'no' }. */
export async function handleRegisterDevice(authorization: string | null, forwardedFor: string | null, rawBody: unknown, deps: RegisterDeviceDeps): Promise<HandlerResult>;
```

`LogEntry` e `HandlerResult` são declarados nos dois arquivos que os usam (sem imports, ADR 0006).

### 2.3 Edge Functions (Deno)

- `supabase/functions/send-push/index.ts` e `supabase/functions/register-device/index.ts`:
  - `Deno.serve`: só `POST`; `OPTIONS` responde 204. Lê `Authorization` e `x-forwarded-for`.
  - Cria um cliente `createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)` (`npm:@supabase/supabase-js@2.119.0`).
  - `verifyUser = (jwt) => admin.auth.getUser(jwt)`.
  - Cada dependência vira um `admin.rpc(...)`. Erro de RPC → `throw new Error(error.message)`, e o núcleo mapeia o código.
  - `postToExpo`: `fetch('https://exp.host/--/api/v2/push/send')` com `Content-Type`, `Accept` e `Accept-Encoding: gzip`, mais `Authorization: Bearer ${EXPO_ACCESS_TOKEN}` quando a variável existe.
  - `log = (e) => console.log(JSON.stringify(e))`; `requestId = crypto.randomUUID()`; `hashIp` com `crypto.subtle.digest('SHA-256')`.
- `supabase/config.toml`: `[functions.register-device]` e `[functions.send-push]`, cada um com `verify_jwt = false`.

### 2.4 Domínio (`src/domain`)

```ts
// profile.ts (alterar)
export type Organization = 'relief_society' | 'elders_quorum' | 'young_women' | 'young_men' | 'primary' | 'temple_family_history';
export const organizations: readonly Organization[];  // essa ordem (RF-09)

// audience.ts (criar)
export type AudienceKey = 'all' | 'leaders' | NotifyGroup | Organization;
export function audienceOptions(unitId: UnitId): AudienceKey[];          // mesma lista e ordem de push_audience_options
export function toggleAudience(selected: readonly AudienceKey[], key: AudienceKey, unitId: UnitId): AudienceKey[];
//  RF-13: tocar em 'all' marca todas as opções (se 'all' estava desmarcado) ou desmarca todas;
//  tocar em outra alterna só ela e tira 'all'; se todas as outras ficam marcadas, 'all' entra.
export function isAudienceValid(selected: readonly AudienceKey[], unitId: UnitId): boolean;  // não vazio e contido nas opções
export type AudienceSummary = { kind: 'empty' } | { kind: 'everyone'; unitKind: UnitKind } | { kind: 'groups'; keys: AudienceKey[] };
export function audienceSummary(selected: readonly AudienceKey[], unitId: UnitId): AudienceSummary;  // 'groups' na ordem das opções
export type RecipientDevice = { units: UnitId[]; signedIn: boolean; organizations: Organization[]; calls: { unitId: UnitId; notifyGroup: NotifyGroup | null; access: CallingAccess }[] };
/** Espelho de push_recipients, para os testes de regra (o banco é a regra real). */
export function isRecipient(device: RecipientDevice, unitId: UnitId, audience: readonly AudienceKey[]): boolean;

// notifications.ts (criar)
export type InboxSection = 'today' | 'thisWeek' | 'earlier';
/** Datas civis de Brasília (time.ts): hoje → today; 1 a 6 dias antes → thisWeek; até 90 dias → earlier; além disso → null. */
export function inboxSection(at: Date, now: Date): InboxSection | null;
export function groupBySection<T extends { at: Date }>(items: readonly T[], now: Date): { section: InboxSection; items: T[] }[];  // ordem fixa, seções vazias omitidas, itens por `at` desc
export function eventPushBody(startsAt: Date, location: string, locale: string): string;  // mesma saída de _shared/pushContent.ts
export type ReminderEntry = { noteId: string; title: string; fireAt: string };  // ISO
export function dueReminders(entries: readonly ReminderEntry[], now: Date): ReminderEntry[];  // fireAt <= now e > now − 90 dias
export type PrefToggle = { key: 'estaca' | 'home' | 'others' | UnitId; units: UnitId[]; on: boolean };
/** RF-17: com homeUnitId → [estaca, home, others]; sem → [estaca, cada uma das 6 unidades]. `on` de others = todas as outras 5 dentro. */
export function prefToggles(units: readonly UnitId[], homeUnitId: UnitId | null): PrefToggle[];
export function applyToggle(units: readonly UnitId[], toggle: PrefToggle, on: boolean): UnitId[];  // na ordem de unitIds
```

### 2.5 Infra do app (`src/lib`)

```ts
// push.ts
export type PushPermission = 'granted' | 'undetermined' | 'denied' | 'unsupported';
/** unsupported: !Device.isDevice. denied só quando !canAskAgain; negado mas com canAskAgain → undetermined. */
export async function getPushPermission(): Promise<PushPermission>;
export async function requestPushPermission(): Promise<PushPermission>;
/** null sem permissão, fora de aparelho físico ou sem projectId (Constants.expoConfig?.extra?.eas?.projectId). */
export async function getDevicePushToken(): Promise<string | null>;
/** RF-07. Pula se já registrou nas últimas 24 h para a mesma chave (`user:<id>` ou `visitor`) em AsyncStorage
 *  'push.lastRegistration.v1' = { key, at }, a menos que `force`. Chama functions.invoke('register-device'). */
export async function registerDevice(options?: { force?: boolean; now?: Date }): Promise<'registered' | 'skipped' | 'no_token' | 'rate_limited' | 'failed'>;
export type PushErrorCode = 'forbidden' | 'rate_limited' | 'unavailable' | 'network' | 'unknown';
export class PushError extends Error { constructor(readonly code: PushErrorCode) }
/** RF-12. 403 → forbidden, 429 → rate_limited, 502 → unavailable, FunctionsFetchError → network, resto → unknown. */
export async function sendPush(input: { kind: 'event' | 'post'; itemId: string; audience: AudienceKey[] }): Promise<{ recipients: number }>;
export const pushErrorMessageKey: Record<PushErrorCode, string>;  // push.errors.* (unknown → common.genericError)
/** RF-05: Boas-vindas marca; PushEffects mostra o sheet. Em memória (useSyncExternalStore). */
export function requestEnablePushPrompt(): void;
export function useEnablePushPrompt(): { pending: boolean; dismiss: () => void };
/** RF-22: banner com o app aberto (setNotificationHandler) e canal Android 'default' (importância HIGH). */
export async function configurePushPresentation(): Promise<void>;

// reminderLog.ts (spec notes grava; esta spec lê). Cifrado com secureSessionStorage: o título da anotação é sensível.
export async function readReminderLog(): Promise<ReminderEntry[]>;   // chave 'reminderLog.v1', JSON; inválido → []
export async function addReminder(entry: ReminderEntry): Promise<void>;
export async function removeReminders(noteId: string): Promise<void>;

// notificationInbox.ts
export type InboxItem = {
  id: string;                         // uuid da notificação, ou `reminder:<noteId>:<fireAt>`
  kind: 'event' | 'post' | 'reminder';
  itemId: string;                     // evento, aviso ou anotação
  unitId: UnitId | null;              // null em lembrete
  title: string;
  body: string;                       // evento: eventPushBody no idioma do app
  at: Date;
  read: boolean;
};
export const inboxQueryKey = (userId: string | null) => ['inbox', userId ?? 'visitor'] as const;  // nunca 'public'
export function useInbox(): UseQueryResult<InboxItem[]>;  // my_notifications(token) + dueReminders; leitura local para visitante e lembretes
export function useHasUnread(): boolean;
/** Logado: notificações → mark_notifications_read; lembretes → local. Visitante: tudo local. `null` = todos. Invalida o inbox. */
export async function markRead(ids: string[] | null, items: readonly InboxItem[]): Promise<void>;
/** RF-16: item de evento apagado → false (lê `events` pelo id). post/reminder → true (as tabelas chegam com board/notes). */
export async function itemExists(kind: InboxItem['kind'], itemId: string): Promise<boolean>;
// lidos locais: AsyncStorage 'notifications.read.v1' = string[] (só ids; poda os de mais de 90 dias)
```

### 2.6 Componentes e telas

```ts
// src/components/AudiencePicker.tsx
export type AudiencePickerProps = { unitId: UnitId; value: readonly AudienceKey[]; onChange: (next: AudienceKey[]) => void };
// src/components/ScreenHeader.tsx (alterar): HeaderAction ganha `badge?: boolean` (ponto theme.danger, size.unitDot)
// src/features/notifications/NotificationsScreen.tsx · NotificationPrefsCard.tsx · EnablePushSheet.tsx · PushEffects.tsx · api.ts
// src/features/notifications/api.ts: fetchDeviceUnits(token) → my_device_units; setDeviceUnits(token, units) → set_device_units
// src/features/account/NoticesSection.tsx (Perfil › Avisos) · account/api.ts updateProfile aceita `organizations`
```

### 2.7 Textos (pt-BR; en-US e es-MX com a mesma estrutura)

- `push.audience.title`: `ENVIAR PARA · {{unit}}` (`unit` = `ESTACA` ou o nome da unidade em maiúsculas)
- `push.audience.all.stake|ward|branch`: `Toda a estaca` · `Todos da ala` · `Todos do ramo`
- `push.audience.leaders.stake|unit`: `Líderes` · `Todos os líderes`
- `push.audience.organizations.*`: `Sociedade de Socorro`, `Quórum de Élderes`, `Moças`, `Rapazes`, `Primária`, `Templo e História da Família`. Os 13 grupos reutilizam `callings.groups.*`.
- `push.audience.summary.empty|everyone.stake|everyone.ward|everyone.branch|groups`: textos de RF-13 (`groups`: `Push para: {{groups}}.`)
- `push.errors.forbidden|rateLimited|unavailable|network`: RF-12, RNF-03 e 7.7
- `push.enable.title|body|confirm|later`: RF-05
- `notifications.readAll`, `notifications.sections.today|thisWeek|earlier` (`HOJE`, `ESTA SEMANA`, `ANTERIORES`), `notifications.empty`, `notifications.unread` (`Não lida`), `notifications.myNotes` (`Minhas anotações`), `notifications.itemGone` (`Este item não está mais disponível.`)
- `notifications.card.enable|enableButton|disabled|openSettings|deviceOnly`: RF-06, RF-08 e 7.7
- `notifications.prefs.title` (`Receber avisos de`), `notifications.prefs.myWard|myBranch` (`Minha ala · {{unit}}` / `Meu ramo · {{unit}}`), `notifications.prefs.others` (`Outras unidades`), `notifications.prefs.switchLabel` (`Receber avisos da {{unit}}`)
- `calendar.notificationsUnread`: `Notificações, há não lidas`
- `account.profile.notices` (`Avisos`), `account.profile.noticesHistory` (`Notificações`), `account.profile.groups` (`Grupos que acompanho`), `account.profile.groupsHint` (RF-21)

## 3. Dependências novas

| Pacote | Versão | Motivo |
| ------ | ------ | ------ |
| `expo-notifications` | a do SDK 58, via `npx expo install` (fica `~58.x`) | Permissão, token, recebimento e toque (spec seção 4) |
| `expo-device` | a do SDK 58, via `npx expo install` | `Device.isDevice` (7.7) |
| `pg_cron` | extensão do Supabase | Limpeza diária (spec seção 4) |

Nenhuma dependência npm além dessas. As Edge Functions importam `npm:@supabase/supabase-js@2.119.0`, a mesma versão do app, que não entra no `package.json`. O Deno não é instalado (ADR 0006).

## 4. Tarefas

- [x] **T-01 — Banco: tabelas, registro, histórico e limpeza**
  - Arquivos: `criar supabase/migrations/<ts>_push.sql` · `criar supabase/tests/push.test.sql` · `alterar src/lib/database.types.ts` (`make db-types`)
  - O que fazer:
    - Escrever de 2.1: a troca da constraint de `profiles.organizations`, as cinco tabelas com RLS e `revoke`, e as funções `push_audience_options`, `push_register_device`, `my_notifications`, `my_device_units`, `set_device_units`, `mark_notifications_read` e `push_cleanup`, mais o `cron.schedule` e o novo `export_my_data`.
    - `revoke all on function ... from public, anon, authenticated`, depois os `grant` da tabela 2.1 (`service_role` explícito).
    - pgTAP (`push.test.sql`), com usuários e dados criados no próprio teste:
      - "CA-01": dois tokens com entregas diferentes. `my_notifications(token_A)` como `anon` traz só as de A. Nenhuma coluna devolvida contém token. `anon` e `authenticated` levam erro de permissão ao ler `push_devices`, `notifications` e `notification_deliveries`.
      - "CA-02": `push_register_device` de visitante grava `units = {estaca}` e `user_id` nulo.
      - "CA-03": o mesmo token com `p_user_id` de quem tem `home_unit_id = 'icara'` passa a ter `user_id` e mantém `units`. De novo sem usuário, `user_id` volta a nulo e `units` fica igual.
      - "CA-04": 10 chamadas com o mesmo `ip_hash` dão `registered`; a 11ª dá `rate_limited`.
      - "CA-18": `set_device_units(token, '{icara,estaca}')` grava `{estaca,icara}`; com um valor inválido → `invalid_units`.
      - "CA-20": `authenticated` atualiza o próprio `profiles.organizations` para `{primary,temple_family_history}`; `{foo}` falha na constraint.
      - "CA-21": notificação de 91 dias com entrega e leitura → `push_cleanup()` apaga as três; a de 89 dias fica; aparelho com `last_seen_at` de 181 dias some. `cron.job` tem `push-cleanup`.
      - `notification_reads`: a pessoa lê e insere só as próprias, e não insere em nome de outra.
      - `mark_notifications_read(null)` marca só o que a pessoa recebeu.
      - `export_my_data` traz `push_devices` sem token.
      - `anon` e `authenticated` não executam `push_register_device` nem `push_cleanup`.
  - Referência: `supabase/migrations/20261115030703_account_rpcs.sql:7` (RPC), `supabase/migrations/20261116003640_events.sql:32` (RLS), `supabase/tests/base_rls.test.sql:42` (papéis no pgTAP), `supabase/migrations/20261115222648_member_calls.sql:433` (`export_my_data` atual)
  - Cobre: CA-01, CA-02, CA-03, CA-04, CA-18, CA-20 e CA-21 (banco), RNF-02, RNF-04, RNF-05, RNF-08
  - Verificar: `supabase db reset && make test-db` · `make db-types` · `make lint`

- [x] **T-02 — Banco: destinatários e envio**
  - Arquivos: `alterar supabase/migrations/<ts>_push.sql` · `alterar supabase/tests/push.test.sql`
  - O que fazer:
    - Acrescentar `push_recipients`, `push_item`, `push_prepare`, `push_discard` e `push_remove_devices` (2.1), só para `service_role`.
    - pgTAP:
      - "CA-09": aparelhos visitante `{estaca}`; membro `{estaca}` com `organizations = {primary}`; bispo `{estaca}` com um chamado de `notify_group = 'bishoprics'` em `criciuma1`; membro `{criciuma1}` com `{primary}`. `push_recipients('estaca', '{primary,bishoprics}')` = membro com `primary` + bispo.
      - "CA-10": visitante `{icara}` e `push_recipients('icara', '{all}')` → recebe.
      - `leaders`: pessoa com chamado `access <> 'none'` em `icara` recebe aviso de `icara`, e a de `criciuma1` não; no item da Estaca, as duas recebem.
      - `notify_group` no item de unidade só vale na mesma unidade.
      - Um aparelho aparece só 1 vez, mesmo batendo em mais de um critério.
      - "CA-12": `push_prepare` com ator `unit_publisher` de `icara` num evento de `criciuma1` → `forbidden`.
      - "CA-13": dois `push_prepare` do mesmo evento → o 2º dá `rate_limited`. Depois de `push_discard` do 1º, um novo passa.
      - "CA-14": `push_remove_devices('{t1}')` apaga `t1` e mantém `t2`.
      - `invalid_audience` com público vazio e com `stake_presidency` em item de unidade.
      - `push_item('post', …)` → `unsupported_kind`.
      - `push_prepare` grava `event_starts_at`, `event_location` e uma entrega por destinatário.
  - Referência: `supabase/migrations/20261115222648_member_calls.sql:22` (`member_calls`, `my_accesses`), T-01
  - Cobre: CA-09, CA-10, CA-12, CA-13 e CA-14 (banco), RF-10, RNF-03
  - Verificar: `supabase db reset && make test-db`

- [x] **T-03 — Domínio: público, histórico e preferências**
  - Arquivos: `alterar src/domain/profile.ts` · `criar src/domain/audience.ts` (+ teste) · `criar src/domain/notifications.ts` (+ teste) · `alterar src/features/viewer/api.ts` (lista de organizações de `profile.ts`)
  - O que fazer:
    - Implementar 2.4.
    - Testes:
      - "CA-07": `toggleAudience([], 'all', 'icara')` marca todas as opções; `audienceSummary` = `everyone`/`ward`.
      - "CA-08": vazio → `empty`; `isAudienceValid([])` é false.
      - Desmarcar uma opção tira `all`; marcar todas as outras traz `all`.
      - `audienceOptions('estaca')` tem 21 itens e `audienceOptions('icara')` tem 19, nas ordens de 2.1.
      - "CA-09" e "CA-10" (espelho): os mesmos cenários de T-02 com `isRecipient`.
      - "CA-11": `eventPushBody(2026-11-21T18:00Z, 'Capela do Ramo Gaivota', 'pt-BR')` = `Sábado, 21 de novembro · 15:00 · Capela do Ramo Gaivota`; sem local, termina em `15:00`; en-US e es-MX começam com maiúscula.
      - "CA-15": com `now` fixo, hoje → `today`; 3 dias → `thisWeek`; 20 dias → `earlier`; 100 dias → `null`.
      - "CA-18": `prefToggles(['estaca','criciuma1','criciuma2','criciuma3','icara','ararangua','ramoGaivota'], 'icara')` → 3 toggles; `applyToggle(..., others, false)` = `['estaca','icara']`.
      - "CA-19": `dueReminders` inclui o lembrete que já passou e exclui o futuro e o de 91 dias.
  - Referência: `src/domain/calendar.ts:31` (domínio puro), `src/domain/time.ts:80` (datas de Brasília), `src/domain/callings.ts:56` (lista ordenada), `src/i18n/resolveLanguage.test.ts`
  - Cobre: CA-07, CA-08, CA-09, CA-10, CA-11, CA-15, CA-18 e CA-19 (regra)
  - Verificar: `make test` (≥ 80% em `src/domain`)

- [x] **T-04 — Núcleo das Edge Functions**
  - Arquivos: `criar .ai/adrs/0006-edge-functions-nucleo-puro.md` (já criado com o plano) · `criar supabase/functions/_shared/pushContent.ts` (+ teste) · `criar supabase/functions/_shared/sendPush.ts` (+ teste) · `criar supabase/functions/_shared/registerDevice.ts` (+ teste) · `alterar tsconfig.json` (`exclude` + `"supabase/functions/*/index.ts"`) · `alterar eslint.config.js` (`ignores`: `'supabase/functions/*/index.ts'` no lugar de `'supabase/functions/*'`)
  - O que fazer:
    - Implementar 2.2 sem nenhum import. `eventPushBody` usa a mesma conta de `time.ts` (offset −180 min e `Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })`, com a 1ª letra maiúscula) e a hora `HH:mm`.
    - Testes com dependências falsas:
      - "CA-11": vetores iguais aos de T-03, e `handleSendPush` monta `{ to, title: 'Batismo', body, data: { kind: 'event', itemId } }` no idioma de cada aparelho.
      - 250 destinatários viram lotes de 100, 100 e 50.
      - "CA-12": `prepare` lança `forbidden` → 403.
      - "CA-13": `rate_limited` → 429.
      - "CA-14": ticket `DeviceNotRegistered` → `removeDevices(['ExponentPushToken[x]'])`.
      - "CA-23": todos os lotes `ok: false` → `discard` chamado e 502 `push_unavailable`.
      - Sucesso parcial → 200 com a contagem de tickets `ok`.
      - Sem JWT → 401; corpo inválido → 400.
      - "CA-04": `register` devolve `rate_limited` → 429.
      - `classifyBearer`: sem header, `sb_publishable_x` e JWT com `role: 'anon'` são visitante; JWT `authenticated` é `jwt`.
      - `clientIp('1.2.3.4, 10.0.0.1')` = `1.2.3.4`.
      - "CA-22": em todos os cenários, o JSON de todas as chamadas a `log` não contém nenhum token, e-mail nem nome usado no teste, e todo log tem `timestamp`, `level`, `event` e `request_id`.
  - Referência: `src/features/calendar/eventActions.test.ts:8` (mocks), ADR 0006
  - Cobre: CA-04, CA-11, CA-12, CA-13, CA-14, CA-22 e CA-23 (função), RF-11, RNF-01, RNF-06
  - Verificar: `make test` · `make lint`

- [x] **T-05 — Edge Functions em Deno**
  - Arquivos: `criar supabase/functions/send-push/index.ts` · `criar supabase/functions/register-device/index.ts` · `alterar supabase/config.toml` (`verify_jwt = false` nas duas)
  - O que fazer:
    - Implementar 2.3.
    - Smoke manual com `supabase start` + `supabase functions serve`: `curl -X POST .../functions/v1/register-device` com um token fictício (`ExponentPushToken[aaaaaaaaaaaaaaaaaaaaaa]`) responde 200, e a linha aparece em `push_devices`.
    - `send-push` sem `Authorization` responde 401.
    - Registrar as duas saídas no Registro de implementação.
  - Referência: ADR 0006, `.github/workflows/deploy.yml` (deploy das funções)
  - Cobre: RF-01, RF-12 (servidor), RNF-07
  - Verificar: o smoke acima · `make lint` (o `index.ts` fica fora do `tsc` e do ESLint)

- [x] **T-06 — `src/lib/push.ts`**
  - Arquivos: `alterar package.json` (`npx expo install expo-notifications expo-device`) · `alterar app.config.ts` (plugin `['expo-notifications', { color: BRAND_BLUE }]`; `android.googleServicesFile: process.env.GOOGLE_SERVICES_JSON ?? './google-services.json'`) · `alterar .gitignore` (`google-services.json`) · `alterar .env.example` (`GOOGLE_SERVICES_JSON`, com comentário: arquivo do Firebase, variável de arquivo da EAS) · `criar src/lib/push.ts` (+ teste)
  - O que fazer:
    - Implementar 2.5 (`push.ts`). O `projectId` vem de `Constants.expoConfig?.extra?.eas?.projectId` (preenchido na T-14).
    - Testes com `expo-notifications`, `expo-device`, `expo-constants` e o cliente Supabase mockados:
      - `unsupported` fora de aparelho físico;
      - `denied` só sem `canAskAgain`;
      - "CA-02": visitante com permissão chama `register-device` com `{ token, platform, locale }`;
      - 2ª chamada no mesmo dia → `skipped`; com `force` → chama;
      - "CA-03": a chave muda de `visitor` para `user:<id>` → registra de novo;
      - "CA-12", "CA-13" e "CA-23": status 403, 429 e 502 viram `PushError` com o código certo, e `pushErrorMessageKey` aponta para os textos de RF-12, RNF-03 e 7.7;
      - erro de rede → `network`;
      - `requestEnablePushPrompt` + `useEnablePushPrompt` (`pending`, `dismiss`).
  - Referência: `src/lib/network.ts` (infra com hook), `src/features/account/api.ts:60` (mapeamento de erro), `app.config.ts:31` (plugin)
  - Cobre: CA-02, CA-03, CA-12, CA-13 e CA-23 (app), RF-07, RF-12
  - Verificar: `make test` · `make lint` · `make build`

- [x] **T-07 — `reminderLog` e inbox**
  - Arquivos: `criar src/lib/reminderLog.ts` (+ teste) · `criar src/lib/notificationInbox.ts` (+ teste)
  - O que fazer:
    - Implementar 2.5. O inbox usa `getDevicePushToken()` (pode ser nulo), `my_notifications`, `readReminderLog` + `dueReminders`, os lidos locais e o idioma de `i18n.language` para `eventPushBody`. `staleTime` de 1 min; refaz ao voltar ao app (`focusManager`, já ligado).
    - Testes:
      - o log é gravado cifrado (o valor bruto no AsyncStorage não contém o título);
      - JSON inválido → `[]`;
      - "CA-19": um lembrete que já passou vira `kind: 'reminder'`, título da nota, e o futuro não entra;
      - "CA-16": `markRead(null)` logado chama `mark_notifications_read` com `p_ids: null`, grava os lembretes nos lidos locais e `useHasUnread` vira false;
      - visitante marca só localmente;
      - `itemExists('event', id)` false quando `events` não tem a linha;
      - a chave do inbox nunca começa com `'public'`.
  - Referência: `src/lib/secureSessionStorage.ts:31`, `src/features/calendar/api.ts:130` (query), `src/lib/queryPersistence.ts` (prefixo `public`)
  - Cobre: CA-16 e CA-19 (dados), RF-19, RF-20
  - Verificar: `make test` (≥ 80% em `src/lib`)

- [x] **T-08 — `AudiencePicker`**
  - Arquivos: `criar src/components/AudiencePicker.tsx` (+ teste) · `alterar src/i18n/locales/*.json` (`push.audience.*`) · `alterar src/features/dev/ComponentCatalogScreen.tsx` (exemplo)
  - O que fazer:
    - Título (overline), chips de 32 de altura (`size.typeChip`). Selecionado: fundo `primarySubtle`, borda e texto `primary`. Ícone `groups` no 1º; `add` ou `check` nos demais. Resumo abaixo.
    - Cada chip tem `accessibilityRole="checkbox"` e `accessibilityState={{ checked }}`. O resumo tem `accessibilityLiveRegion="polite"` e, ao mudar, chama `AccessibilityInfo.announceForAccessibility` (o live region não funciona no iOS; lição do assessment de `calendar`).
    - Testes:
      - "CA-07": em `icara`, tocar em `Todos da ala` marca todos e o resumo é `Todos os membros da ala com o app receberão o aviso.`;
      - "CA-08": desmarcar tudo mostra `Selecione ao menos um grupo para enviar a notificação.`;
      - grupos: `Push para: Primária, Bispados.` na ordem das opções;
      - `Todos do ramo` em `ramoGaivota`;
      - título `ENVIAR PARA · ESTACA`;
      - RNF-11: os chips têm papel `checkbox` e `checked`.
  - Referência: `src/components/FilterChip.tsx:19`, `src/components/Button.test.tsx`
  - Cobre: CA-07, CA-08, RF-13, RNF-11
  - Verificar: `make test`

- [x] **T-09 — Ponto no sino**
  - Arquivos: `alterar src/components/ScreenHeader.tsx` (+ teste) · `alterar src/features/calendar/AgendaScreen.tsx` (+ teste) · `alterar src/i18n/locales/*.json` (`calendar.notificationsUnread`)
  - O que fazer:
    - `HeaderAction.badge` desenha um ponto `theme.danger` de `size.unitDot` no canto superior direito do botão.
    - A Agenda passa `badge: useHasUnread()` e troca o rótulo para `calendar.notificationsUnread` quando há não lidas.
    - Testes:
      - ScreenHeader com `badge` mostra o ponto;
      - "CA-16": a Agenda, com `useHasUnread` mockado true/false, mostra ou esconde o ponto e o rótulo `Notificações, há não lidas` (RNF-12).
  - Referência: `src/components/ScreenHeader.tsx:12`, `src/features/calendar/AgendaScreen.tsx:83`
  - Cobre: CA-16 (sino), RF-19, RNF-12
  - Verificar: `make test`

- [x] **T-10 — Tela Notificações**
  - Arquivos: `criar src/features/notifications/api.ts` (+ teste) · `criar src/features/notifications/NotificationsScreen.tsx` (+ teste) · `criar src/features/notifications/NotificationPrefsCard.tsx` (+ teste) · `alterar src/app/notifications.tsx` (re-export) · `alterar src/features/placeholder/screens.tsx` (remover `NotificationsPlaceholder`) · `alterar src/i18n/locales/*.json` (`notifications.*`)
  - O que fazer:
    - Cabeçalho: voltar, `Notificações` e a ação `Ler todas` só com não lidas.
    - `SectionList` com `HOJE`, `ESTA SEMANA` e `ANTERIORES` (`groupBySection`).
    - Itens:
      - círculo de 40 com o ícone de RF-15, título, corpo em 2 linhas e `{unidade} · {HH:mm}` (lembrete: `Minhas anotações · {dia abreviado}` por `formatCivil`);
      - não lida: fundo `primarySubtle`, ponto `primary` e `accessibilityLabel` começando por `Não lida, ` (RNF-09);
      - ao tocar: `markRead([id])`; se `itemExists` for false → toast `Este item não está mais disponível.`; senão, `router.push` para `/event/{id}`, `/board/{id}` ou `/notes/{id}`.
    - Vazio: RF-18.
    - No fim da lista, o card conforme a permissão:
      - `unsupported` → `Avisos só funcionam em um celular.`;
      - `undetermined` → texto de RF-06 + `Ativar avisos` (pede a permissão e chama `registerDevice({ force: true })`);
      - `denied` → RF-08 + `Abrir configurações` (`Linking.openSettings()`);
      - `granted` → `NotificationPrefsCard`.
    - O card de preferências usa `prefToggles`, com `Switch` rotulado `Receber avisos da {unidade}` (RNF-10). Cada mudança chama `setDeviceUnits` com `applyToggle` e atualiza o otimista; em erro, desfaz e mostra o toast `common.genericError`.
    - Testes:
      - "CA-15": 3 itens nas 3 seções; o de 100 dias não vem do inbox mockado nem aparece;
      - "CA-16": `Ler todas` chama `markRead(null)` e some;
      - "CA-17": tocar num evento chama `markRead` e `router.push('/event/e1')`;
      - item apagado → toast;
      - "CA-06": permissão `denied` mostra o texto e `Abrir configurações`;
      - "CA-18": com `home = icara`, desligar `Outras unidades` chama `setDeviceUnits(token, ['estaca','icara'])`;
      - RF-18 (vazio);
      - "CA-19": o lembrete aparece com `Minhas anotações · …` e o ícone `alarm`;
      - RNF-09 e RNF-10 (rótulos).
  - Referência: `src/features/calendar/AgendaScreen.tsx` (tela + query + toast), `src/components/Switch.tsx:7`, `src/components/ListItem.tsx:35`
  - Cobre: CA-06, CA-15, CA-16, CA-17 (lista), CA-18, CA-19, RF-14 a RF-18, RNF-09, RNF-10
  - Verificar: `make test`

- [ ] **T-11 — Registro automático, toque e "Receber avisos?"**
  - Arquivos: `criar src/features/notifications/EnablePushSheet.tsx` (+ teste) · `criar src/features/notifications/PushEffects.tsx` (+ teste) · `alterar src/app/_layout.tsx` (montar `<PushEffects />` ao lado de `<SessionEffects />`) · `alterar src/features/auth/WelcomeScreen.tsx` (+ teste: `requestEnablePushPrompt()` antes de `router.replace('/agenda')`) · `alterar src/i18n/locales/*.json` (`push.enable.*`)
  - O que fazer:
    - `PushEffects`:
      1. no 1º render, `configurePushPresentation()`;
      2. com permissão `granted`, `registerDevice()` ao abrir e ao voltar ao app;
      3. quando o `userId` da sessão muda (entrar, sair ou trocar de conta), `registerDevice({ force: true })` (RF-07);
      4. `addNotificationResponseReceivedListener` + `getLastNotificationResponseAsync()` (app fechado; ignora um `identifier` já tratado): lê `data.kind`/`data.itemId`, marca lido pelo item (`markRead` dos ids do inbox com esse `itemId`) e faz `router.push('/event/{id}')` ou `/board/{id}`;
      5. com `useEnablePushPrompt().pending`, abre o `EnablePushSheet`.
    - `EnablePushSheet`: textos de RF-05. `Ativar avisos` → `requestPushPermission()` e, concedida, `registerDevice({ force: true })`. `Agora não` → `dismiss`.
    - Testes:
      - "CA-05": com o prompt pendente, o sheet aparece; `Ativar avisos` pede a permissão e registra;
      - `Agora não` fecha sem pedir;
      - "CA-17": uma resposta com `{kind:'event', itemId:'e1'}` navega para `/event/e1` e marca lido;
      - a mesma resposta 2 vezes navega só 1 vez;
      - "CA-03": trocar o `userId` chama `registerDevice({ force: true })`;
      - Boas-vindas concluída chama `requestEnablePushPrompt`.
  - Referência: `src/features/auth/SessionEffects.tsx:20` (efeitos sem UI), `src/features/account/DeleteAccountSheet.tsx` (sheet), `src/app/_layout.tsx:69`
  - Cobre: CA-03 (app), CA-05, CA-17 (banner), RF-05, RF-07, RF-22
  - Verificar: `make test`

- [ ] **T-12 — Perfil › Avisos e tela de teste**
  - Arquivos: `alterar src/features/account/api.ts` (+ teste: `updateProfile` com `organizations`) · `criar src/features/account/NoticesSection.tsx` (+ teste) · `alterar src/features/account/ProfileScreen.tsx` (seção depois de `MyCallingsSection`) · `criar src/features/dev/DevPushScreen.tsx` · `criar src/app/dev/push.tsx` · `alterar src/i18n/locales/*.json` (`account.profile.notices*`, `account.profile.groups*`)
  - O que fazer:
    - `NoticesSection`: overline `Avisos`, `ListItem` `Notificações` → `/notifications`, `Grupos que acompanho` com os 6 `FilterChip` (multi) e o texto de RF-21.
    - Cada toque grava `updateProfile(userId, { organizations })` e invalida `['viewer']`; em erro, toast `common.genericError` e volta ao estado anterior.
    - `DevPushScreen` (só `__DEV__`, como `DevComponentsRoute`): campo do id do evento, `UnitPickerSheet`, `AudiencePicker` e um botão que chama `sendPush`, com toast do resultado (`recipients`) ou da mensagem de erro (roteiro de QA, passo 3).
    - Testes:
      - "CA-20": marcar `Primária` chama `updateProfile` com `organizations` contendo `primary`;
      - o chip `Templo e História da Família` existe;
      - `Notificações` navega.
  - Referência: `src/features/account/MyCallingsSection.tsx`, `src/features/account/api.ts:70`, `src/features/dev/DevComponentsRoute.tsx:5`
  - Cobre: CA-20 (app), RF-21
  - Verificar: `make check`

- [ ] **T-13 — Docs**
  - Arquivos: `alterar .ai/docs/SECURITY.md` · `alterar .ai/docs/ARCHITECTURE.md` · `alterar .ai/docs/O11Y.md`
  - O que fazer:
    - SECURITY:
      - em "Dados tratados", trocar `push_tokens`/`notification_preferences` por `push_devices` (token, unidades, idioma, aparelho de visitante), `notifications` + `notification_deliveries` + `notification_reads` (histórico de 90 dias) e `push_register_attempts` (hash do IP, 1 dia);
      - lembretes no aparelho, cifrados;
      - nas regras de RLS, as tabelas novas sem política e o token como credencial do histórico (decisão do usuário);
      - exportação com `push_devices` sem token.
    - ARCHITECTURE:
      - padrão "Edge Function" (ADR 0006);
      - `src/lib/notificationInbox.ts` compartilhado pela Agenda e pela tela;
      - `reminderLog`;
      - `expo-notifications` e `expo-device` instalados.
    - O11Y: os eventos `device_registered`, `push_dispatched` e `push_dispatch_failed`.
  - Referência: seções atuais dos três arquivos
  - Cobre: DoD (SECURITY.md)
  - Verificar: leitura

- [ ] **T-14 — Credenciais, deploy local e QA em aparelho (sessão principal, com o usuário)**
  - O que fazer:
    1. `eas init` e colocar `extra.eas.projectId` no `app.config.ts`. O id não é segredo.
    2. Criar o projeto Firebase do app Android e subir a chave FCM V1 com `eas credentials`. O `google-services.json` vai como variável de arquivo `GOOGLE_SERVICES_JSON` na EAS e fica fora do git. Configurar a chave APNs com `eas credentials`.
    3. `supabase secrets set EXPO_ACCESS_TOKEN=...` (local: `supabase/functions/.env`, fora do git).
    4. Gerar o build de desenvolvimento (`eas build --profile development`): push não funciona no Expo Go.
    5. Roteiro de QA da spec, passos 1 a 8, em iOS e Android, usando `/dev/push` no passo 3.
    6. Registrar os resultados e CA-05, CA-17 (app fechado) e CA-24 no Registro de implementação.
  - Cobre: CA-05, CA-17 e CA-24 (manuais), DoD (`eas init`, credenciais, roteiro)
  - Verificar: roteiro sem divergências

## 5. Matriz de cobertura

| CA | Tarefa | Tipo de teste | Arquivo de teste |
| -- | ------ | ------------- | ---------------- |
| CA-01 | T-01 | banco | `supabase/tests/push.test.sql` |
| CA-02 | T-01, T-06 | banco + unitário | `push.test.sql`, `src/lib/push.test.ts` |
| CA-03 | T-01, T-06, T-11 | banco + unitário + componente | `push.test.sql`, `push.test.ts`, `PushEffects.test.tsx` |
| CA-04 | T-01, T-04 | banco + unitário | `push.test.sql`, `_shared/registerDevice.test.ts` |
| CA-05 | T-11, T-14 | componente + manual | `PushEffects.test.tsx`, `EnablePushSheet.test.tsx` |
| CA-06 | T-10 | componente | `NotificationsScreen.test.tsx` |
| CA-07 | T-03, T-08 | unitário + componente | `audience.test.ts`, `AudiencePicker.test.tsx` |
| CA-08 | T-03, T-08 | unitário + componente | `audience.test.ts`, `AudiencePicker.test.tsx` |
| CA-09 | T-02, T-03 | banco + unitário (espelho) | `push.test.sql`, `audience.test.ts` |
| CA-10 | T-02, T-03 | banco + unitário (espelho) | `push.test.sql`, `audience.test.ts` |
| CA-11 | T-03, T-04 | unitário | `notifications.test.ts`, `_shared/pushContent.test.ts`, `_shared/sendPush.test.ts` |
| CA-12 | T-02, T-04, T-06 | banco + unitário | `push.test.sql`, `_shared/sendPush.test.ts`, `push.test.ts` |
| CA-13 | T-02, T-04, T-06 | banco + unitário | idem |
| CA-14 | T-02, T-04 | banco + unitário | `push.test.sql`, `_shared/sendPush.test.ts` |
| CA-15 | T-03, T-10 | unitário + componente | `notifications.test.ts`, `NotificationsScreen.test.tsx` |
| CA-16 | T-07, T-09, T-10 | unitário + componente | `notificationInbox.test.ts`, `AgendaScreen.test.tsx`, `NotificationsScreen.test.tsx` |
| CA-17 | T-10, T-11, T-14 | componente + manual (app fechado) | `NotificationsScreen.test.tsx`, `PushEffects.test.tsx` |
| CA-18 | T-01, T-03, T-10 | banco + unitário + componente | `push.test.sql`, `notifications.test.ts`, `NotificationsScreen.test.tsx` |
| CA-19 | T-03, T-07, T-10 | unitário + componente | `notifications.test.ts`, `notificationInbox.test.ts`, `NotificationsScreen.test.tsx` |
| CA-20 | T-01, T-12 | banco + componente | `push.test.sql`, `NoticesSection.test.tsx` |
| CA-21 | T-01 | banco | `push.test.sql` |
| CA-22 | T-04 | unitário | `_shared/sendPush.test.ts`, `_shared/registerDevice.test.ts` |
| CA-23 | T-04, T-06 | unitário | `_shared/sendPush.test.ts`, `push.test.ts` |
| CA-24 | T-08, T-09, T-10, T-14 | componente (rótulos) + manual | `AudiencePicker.test.tsx`, `AgendaScreen.test.tsx`, `NotificationsScreen.test.tsx` |

## 6. Riscos e mitigação

| Risco | Mitigação |
| ----- | --------- |
| Push não funciona no Expo Go nem no simulador | T-14 usa build de desenvolvimento em aparelho físico. Os testes automatizados mockam `expo-notifications`. |
| `DeviceNotRegistered` às vezes só aparece nos recibos, e não no ticket | O ticket já cobre o caso comum (CA-14). Tokens que escaparem saem pelos 180 dias sem `last_seen_at` (RNF-04). Ler recibos fica fora desta entrega. |
| O `index.ts` em Deno não tem teste automatizado | Fino por desenho (ADR 0006). Smoke na T-05 e roteiro na T-14. |
| `eventPushBody` existe duas vezes (app e função) | Os mesmos vetores de teste nos dois lados (T-03 e T-04). |
| `set_config('request.jwt.claims')` dentro de `push_prepare` | É `is_local = true` (só a transação), e a função não é executável pelo app. O pgTAP prova o `forbidden`. |
| O nome real da constraint de `profiles.organizations` pode ser outro | A T-01 confere com `\d public.profiles` antes do `drop`. |
| `send-push` com `post` antes da `board` | Responde 400 `unsupported_kind`. A `board` substitui `push_item`. |
| Rotas `/board/{id}` e `/notes/{id}` ainda não existem | Só são alcançadas quando existirem avisos ou lembretes, que chegam com `board` e `notes`. |
| Sem `projectId`, o token é nulo | `getDevicePushToken` devolve `null` e o card mostra o estado sem registro. A T-14 preenche o `projectId`. |

## 7. Registro de implementação

### Arquivos criados e alterados

### Desvios do plano

### Decisões durante a implementação

### CA sem teste automatizado
