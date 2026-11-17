# Plano: Criar, editar e excluir eventos, com pauta de reunião

> **Spec:** `.ai/specs/event-form.md`
> **Criado em:** 2026-11-17
> **ADRs relacionados:** nenhum novo (segue `0002-stack-inicial.md`, `0004-supabase-cloud.md` e `0005-fuso-sao-paulo-offset-fixo.md`)

## 1. Abordagem

**Banco.** Uma migration (`<ts>_events_write_meeting_items.sql`) faz quatro coisas:
- Liga as políticas de escrita em `events` (`can_publish`), para que uma chamada direta à API também seja barrada (RNF-01, CA-06).
- Cria `meeting_items`, com RLS por `can_lead` da unidade do evento (RNF-02).
- Cria o gatilho que, ao inserir uma Reunião, chama `carry_pending_items` na mesma transação (RNF-03, RF-21).
- Cria 3 RPCs `security definer` (`create_event`, `update_event`, `delete_event`) que devolvem códigos curtos de erro em `message`, como as RPCs de `leadership`.

As RPCs existem porque só a RLS não basta para dar ao usuário a mensagem certa. Com RLS, um `update` que deixa de passar no `using` devolve 0 linhas, e o app não consegue diferenciar "evento excluído" (`not_found`) de "papel revogado" (`forbidden`), duas situações com mensagens diferentes na seção 7.5. Fazer a criação numa RPC também resolve outros dois pontos:
- O evento novo, as pendências copiadas e os itens digitados no formulário (RF-20) entram numa única transação.
- O id gerado no aparelho (`expo-crypto`, já instalado) torna a criação idempotente. Um toque duplo (CA-21) ou uma nova tentativa depois de perder a resposta não duplica o evento.

**Onde mora o código do app.** A spec (seção 10) sugere `src/features/events/`. Só que o detalhe do evento (`EventDetailScreen`) e a Agenda ficam em `src/features/calendar/`, e `ARCHITECTURE.md` proíbe que uma feature importe outra. Por isso tudo vai para `src/features/calendar/`: formulário, sheet da pauta, mutações e o card. Muda só a pasta, não o comportamento.

As regras puras ficam no domínio, com teste unitário sem tela:
- `src/domain/eventForm.ts`: padrões, validação, rascunho ↔ evento e "tem alterações".
- `src/domain/meetingItems.ts`: contagens, ordem e etiqueta `dd/mm`.

A conversão de horário de Brasília para instante entra em `src/domain/time.ts` (ADR 0005).

**Normalização do nome da série.** Ela existe **só no banco** (`event_series_key`). O app nunca decide a série (RNF-03), e um espelho em TypeScript seria código morto. Por isso `eventForm.ts` não tem essa função, embora a seção 10 da spec a cite.

**Itens da pauta** são lidos pela chave `['meeting', eventId]`, fora do prefixo `public`. Assim nunca vão para o disco (RNF-02). Em evento existente, cada item é gravado direto em `meeting_items` (PostgREST + RLS), na hora (RF-20).

**Design system.** Entram:
- o `Checkbox` (22, raio 6);
- `role="radio"` opcional no `FilterChip` (RNF-07);
- o `ChipGroup`, que sobe de `features/leadership` para `components` porque agora são duas features usando;
- `heightRatio` opcional no `Sheet`, para os 82% de RF-17.

**Seletores nativos de data e hora.** Usam `@react-native-community/datetimepicker` 9.2.1, a versão do SDK 58 (`node_modules/expo/bundledNativeModules.json`), prevista na spec. O picker recebe `timeZoneOffsetInMinutes={SAO_PAULO_OFFSET_MINUTES}`, então mostra e devolve o horário de Brasília em qualquer fuso do aparelho (RNF-05, CA-20), sem usar os getters locais de `Date`.

**IDs nos testes.** Outras specs usam os mesmos números de CA. Os testes desta levam o prefixo `[event-form]` (ex.: `[event-form] CA-03: ...`), como em `leadership`.

**Nomes da spec × código:**
- Onde a spec diz `Ala Içara` ou `Ala Criciúma 1` (CA-06, QA 1), o chip mostra `units[id].label` (`Içara`, `Criciúma 1`), como o filtro da Agenda e o `UnitPickerSheet`. Não existe rótulo "Ala X" no app, e os testes procuram `Içara`.
- `unitOrder` (RF-06) tem a mesma ordem de `unitIds`, que é a usada por `publishableUnits`.

**RF-11 × RNF-10.** O `Salvar` fica com aparência e `accessibilityState.disabled` de desabilitado enquanto o formulário é inválido (RF-11, CA-03, CA-08). Um toque nele nesse estado não envia nada. Ele é a "tentativa de salvar" de RNF-10: marca todos os campos como tocados (os erros aparecem), anuncia o primeiro erro e põe o foco no primeiro campo inválido. Assim as duas regras valem ao mesmo tempo.

**O arquivo `EventFormScreen.dc.html` não está no repositório** (o design mora no claude.ai/design). As medidas vêm da seção 8 da spec e dos tokens.

## 2. Contratos

### 2.1 Banco: `supabase/migrations/<ts>_events_write_meeting_items.sql` (`supabase migration new events_write_meeting_items`)

```sql
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
  position int not null,
  carried_from_event_id uuid null references public.events (id) on delete set null,
  carried_from_date date null,
  created_by uuid null default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index meeting_items_event_idx on public.meeting_items (event_id, position);

-- Private helper (execute revoked from public, anon, authenticated). language sql stable,
-- security definer, set search_path = public.
-- True when the event exists, is a meeting and the caller can_lead its unit.
create function public.meeting_event_leadable(p_event_id uuid) returns boolean;
--   select coalesce((select e.type = 'meeting' and can_lead(e.unit_id)
--                    from events e where e.id = p_event_id), false)

alter table public.meeting_items enable row level security;
revoke all on public.meeting_items from anon;
revoke update on public.meeting_items from authenticated;  -- items are added or removed, never edited
create policy meeting_items_select_leader on public.meeting_items for select to authenticated
  using (public.meeting_event_leadable(event_id));
create policy meeting_items_insert_leader on public.meeting_items for insert to authenticated
  with check (public.meeting_event_leadable(event_id) and created_by = auth.uid()
              and carried_from_event_id is null and carried_from_date is null);
create policy meeting_items_delete_leader on public.meeting_items for delete to authenticated
  using (public.meeting_event_leadable(event_id));
-- No policy for admin (RN-04): admin is not can_lead.

-- position: when the insert does not set it, it goes to the end of the event's list.
-- BEFORE INSERT trigger meeting_items_set_position (plpgsql):
--   if new.position is null then
--     new.position := coalesce((select max(position) + 1 from meeting_items
--                               where event_id = new.event_id), 0);
--   end if;
-- (A tie between two leaders adding at the same instant is harmless: reads also order by
--  created_at, id.)

-- RF-21. immutable. lower → no diacritics (pt/es set) → collapsed spaces → trimmed.
create function public.event_series_key(p_title text) returns text language sql immutable as $$
  select btrim(regexp_replace(
    translate(lower(p_title), 'áàâãäåéèêëíìîïóòôõöúùûüçñ', 'aaaaaaeeeeiiiiooooouuuucn'),
    '\s+', ' ', 'g'));
$$;

-- RF-21, RNF-03. security definer (the creator may be a unit_publisher, who cannot read the
-- items, and the carry must still happen). Execute revoked from public, anon, authenticated.
create function public.carry_pending_items(p_event_id uuid) returns int;  -- plpgsql
--   v_new := the event p_event_id; return 0 if it is not a meeting.
--   v_prev := select id, starts_at from events
--             where unit_id = v_new.unit_id and type = 'meeting' and id <> v_new.id
--               and starts_at < v_new.starts_at
--               and event_series_key(title) = event_series_key(v_new.title)
--             order by starts_at desc, created_at desc limit 1;
--   return 0 if none.
--   insert into meeting_items (event_id, kind, text, position, carried_from_event_id,
--                              carried_from_date, created_by)
--   select v_new.id, 'agenda', mi.text,
--          (row_number() over (order by mi.position, mi.created_at, mi.id)) - 1,
--          v_prev.id, (v_prev.starts_at at time zone 'America/Sao_Paulo')::date, v_new.created_by
--   from meeting_items mi where mi.event_id = v_prev.id and mi.kind = 'pending';
--   return the row count.
-- AFTER INSERT trigger events_carry_pending on events, for each row
--   when (new.type = 'meeting') → perform carry_pending_items(new.id).
-- Only on INSERT: renaming later never copies again (RF-21).

-- All 3 RPCs: plpgsql, security definer, set search_path = public, returns as listed; first line
-- `if auth.uid() is null then raise exception 'not_authenticated' using errcode = 'P0001'`;
-- errors `raise exception '<code>' using errcode = 'P0001'`. Constraint violations (title,
-- location, notes, links, ends_at > starts_at) propagate as 23514; the app shows the generic error.

create function public.create_event(
  p_id uuid, p_unit_id text, p_type text, p_title text, p_starts_at timestamptz,
  p_ends_at timestamptz, p_location text, p_notes text, p_links text[], p_items jsonb)
returns public.events;
--   1. existing := events where id = p_id.
--      found and created_by = auth.uid() → return it unchanged (idempotent retry, CA-21)
--      found otherwise                    → 'forbidden'
--   2. not can_publish(p_unit_id)                                            → 'forbidden'
--   3. v_items := coalesce(p_items, '[]'::jsonb). jsonb_array_length(v_items) > 0 and
--      (p_type <> 'meeting' or not can_lead(p_unit_id))                      → 'invalid_items'
--   4. insert into events (id, unit_id, type, title, starts_at, ends_at, location, notes, links,
--        created_by) values (p_id, p_unit_id, p_type, btrim(p_title), p_starts_at, p_ends_at,
--        btrim(coalesce(p_location, '')), coalesce(p_notes, ''), coalesce(p_links, '{}'),
--        auth.uid()) returning * into v_event;
--      (the AFTER INSERT trigger has already carried the pending items: they take the first
--       positions)
--   5. insert into meeting_items (event_id, kind, text, created_by)
--      select v_event.id, x.kind, btrim(x.text), auth.uid()
--      from jsonb_to_recordset(v_items) with ordinality as x(kind text, text text, ord int)
--      order by x.ord;   -- position from the trigger: after the carried items, in array order
--   6. return v_event.

create function public.update_event(
  p_id uuid, p_unit_id text, p_type text, p_title text, p_starts_at timestamptz,
  p_ends_at timestamptz, p_location text, p_notes text, p_links text[])
returns public.events;
--   1. select * into v_old from events where id = p_id for update; not found → 'not_found'
--   2. not can_publish(v_old.unit_id) or not can_publish(p_unit_id)          → 'forbidden'
--   3. p_type <> 'meeting' → delete from meeting_items where event_id = p_id (CA-19)
--   4. update events set unit_id, type, title = btrim(p_title), starts_at, ends_at,
--        location = btrim(coalesce(p_location,'')), notes = coalesce(p_notes,''),
--        links = coalesce(p_links,'{}') where id = p_id returning * → return it.

create function public.delete_event(p_id uuid) returns void;
--   1. select unit_id into v_unit from events where id = p_id for update; not found → 'not_found'
--   2. not can_publish(v_unit)                                               → 'forbidden'
--   3. delete from events where id = p_id (meeting_items go by cascade, CA-13).

-- revoke all on function <each of the 6 functions above> from public, anon, authenticated;
-- grant execute on function create_event(uuid, text, text, text, timestamptz, timestamptz,
--   text, text, text[], jsonb), update_event(uuid, text, text, text, timestamptz, timestamptz,
--   text, text, text[]), delete_event(uuid) to authenticated;
-- event_series_key: grant execute to authenticated (used inside the definer functions only; no
--   data, harmless). meeting_event_leadable and carry_pending_items: no grant (the policies run
--   meeting_event_leadable as its definer).
```

> As políticas de `meeting_items` chamam `meeting_event_leadable`, e o `execute` dela fica revogado. Funções chamadas dentro de uma política são executadas com os privilégios de quem consulta. Se o pgTAP mostrar `permission denied for function meeting_event_leadable`, conceda `execute ... to authenticated`. A função só devolve um booleano sobre o próprio chamador, então expô-la não vaza nada. Registre a escolha no Registro de implementação.

### 2.2 Domínio

```ts
// src/domain/time.ts (add)
export type ClockTime = { hour: number; minute: number };
/** The instant of a Sao Paulo wall time (inverse of toSaoPauloWallTime). */
export function instantOf(wall: WallTime): Date;
//   new Date(Date.UTC(year, month - 1, day, hour, minute) - SAO_PAULO_OFFSET_MINUTES * 60_000)

// src/domain/eventForm.ts
import type { AudienceKey } from './audience';
import type { CalendarEvent } from './calendar';
import type { EventType } from './eventTypes';
import type { CivilDate, ClockTime } from './time';
import type { UnitId } from './units';

export const EVENT_LIMITS = { title: 80, location: 160, notes: 1000, links: 5, link: 500 } as const;

export type EventDraft = {
  title: string;
  type: EventType;
  unitId: UnitId;
  singleDay: boolean;
  startDate: CivilDate;
  startTime: ClockTime;
  endDate: CivilDate;      // ignored (= startDate) while singleDay
  endTime: ClockTime;
  location: string;
  notes: string;
  links: string[];
  notify: boolean;
  audience: AudienceKey[];
};

/** RF-04, RF-05, RF-06, RF-10. start = whole hour of `now` (Sao Paulo) + 2 h (the next whole
 * hour + 1 h); end = start + 2 h; singleDay true, unless end falls on the next day (start 22:00
 * or later), then false with endDate = that day. type 'activity'; unit = units[0]; notify true;
 * audience = toggleAudience([], 'all', unit) (every option). `units` = publishableUnits, never
 * empty here. */
export function newEventDraft(now: Date, units: readonly UnitId[]): EventDraft;

/** Edit: the saved event; singleDay = same civil date for start and end; notify false, audience []. */
export function draftFromEvent(event: CalendarEvent): EventDraft;

export type DraftField = 'title' | 'end' | 'location' | 'notes' | 'audience';
export type DraftErrors = Partial<Record<DraftField,
  'required' | 'tooLong' | 'endBeforeStart' | 'emptyAudience'>>;

/** RF-03, RF-04, RF-07, RF-08, RF-10. title: trim empty → 'required', trim > 80 → 'tooLong';
 * end: endsAt <= startsAt → 'endBeforeStart'; location: trim > 160 → 'tooLong';
 * notes: length > 1000 → 'tooLong'; audience: notify and !isAudienceValid → 'emptyAudience'.
 * Order of keys in the result = order of the fields on the screen (title, end, location,
 * notes, audience): the first key is the first invalid field (RNF-10). */
export function validateDraft(draft: EventDraft): DraftErrors;

/** RF-09. The text of the link field before adding it. null = ok. */
export function validateLink(text: string, current: readonly string[]):
  'notHttps' | 'tooMany' | null;
//   current.length >= 5 → 'tooMany'; !text.trim().startsWith('https://') → 'notHttps'.
//   (500 is enforced by the field's maxLength.)

/** The instants of the draft (instantOf), endDate = startDate when singleDay. */
export function draftInstants(draft: EventDraft): { startsAt: Date; endsAt: Date };

export type EventInput = {
  unitId: UnitId; type: EventType; title: string; startsAt: Date; endsAt: Date;
  location: string; notes: string; links: string[];
};
/** title and location trimmed; notes as typed. */
export function toEventInput(draft: EventDraft): EventInput;

/** RF-13. Compares the fields that are saved (toEventInput) plus notify and audience. */
export function isDraftDirty(initial: EventDraft, current: EventDraft): boolean;

// src/domain/meetingItems.ts
import type { CivilDate } from './time';
export type MeetingItemKind = 'agenda' | 'decision' | 'pending';
export const meetingItemKinds: readonly MeetingItemKind[] = ['agenda', 'decision', 'pending'];
export const MEETING_ITEM_MAX = 300;
export type MeetingItem = {
  id: string;                       // a local id ('local-<n>') for a new event's items
  kind: MeetingItemKind;
  text: string;
  carriedFromDate: CivilDate | null;
};
export function countByKind(items: readonly MeetingItem[]): Record<MeetingItemKind, number>;
/** Items of one kind, keeping the given order (already position order from the API). */
export function itemsOfKind(items: readonly MeetingItem[], kind: MeetingItemKind): MeetingItem[];
/** 'dd/mm' (RF-19 tag). */
export function shortDate(date: CivilDate): string;
```

### 2.3 App: API (`src/features/calendar/api.ts`, acrescentar)

```ts
export type EventWriteErrorCode = 'forbidden' | 'not_found' | 'invalid_items' | 'network' | 'unknown';
export class EventWriteError extends Error { constructor(readonly code: EventWriteErrorCode) }
// toEventWriteError(error) = rpcErrorCode(error, ['forbidden','not_found','invalid_items'])

export type NewMeetingItem = { kind: MeetingItemKind; text: string };

/** RF-20, RF-21. Returns the saved event. `id` comes from Crypto.randomUUID(), created once per
 * form opening, so a retry does not duplicate. Throws EventWriteError. Tracks 'event_created'. */
export async function createEvent(id: string, input: EventInput, items: readonly NewMeetingItem[]):
  Promise<StoredEvent>;
//   rpc('create_event', { p_id, p_unit_id, p_type, p_title, p_starts_at: startsAt.toISOString(),
//     p_ends_at, p_location, p_notes, p_links, p_items: items }).single()  → storedFromRow

export async function updateEvent(id: string, input: EventInput): Promise<StoredEvent>; // 'event_updated'
export async function deleteEvent(id: string): Promise<void>;                          // 'event_deleted'

/** After a save: writes the event query and refetches every month query. After a delete:
 * removes the event query and refetches the months. */
export function useEventCache(): { saved: (stored: StoredEvent) => void; deleted: (id: string) => void };
//   saved:   client.setQueryData(eventQueryKey(id), stored);
//            void client.invalidateQueries({ queryKey: ['public', 'events', 'month'] })
//   deleted: client.removeQueries({ queryKey: eventQueryKey(id) }); same invalidate

// src/features/calendar/meetingApi.ts (new). Key outside 'public' (RNF-02).
export const meetingItemsQueryKey = (eventId: string) => ['meeting', eventId] as const;
export async function fetchMeetingItems(eventId: string): Promise<MeetingItem[]>;
//   from('meeting_items').select('id, kind, text, carried_from_date')
//   .eq('event_id', eventId).order('position').order('created_at').order('id')
//   carried_from_date 'YYYY-MM-DD' → CivilDate; unknown kind → dropped
export function useMeetingItems(eventId: string | null, enabled: boolean): UseQueryResult<MeetingItem[]>;
export async function addMeetingItem(eventId: string, kind: MeetingItemKind, text: string): Promise<void>;
//   insert({ event_id, kind, text: text.trim() })  (position, created_by: database defaults)
export async function removeMeetingItem(id: string): Promise<void>;
// Errors: toEventWriteError (RLS denial → 42501 → 'unknown' → generic message).
```

`src/lib/telemetry.ts`: acrescentar `'event_created' | 'event_updated' | 'event_deleted'` a `TelemetryEvent` e `event_id?: string` a `TelemetryProps`. O `track` recebe `{ event_id, unit_id }`, só ids (RNF-04).

### 2.4 Rotas e telas

```
src/app/event/new.tsx        → export { EventFormRoute as default } (mode 'new')
src/app/event/[id]/edit.tsx  → export { EventEditRoute as default } (mode 'edit', id from params)
```

- `EventFormRoute`:
  - Com `viewer.loaded` false, mostra um `Skeleton`.
  - Com `publishableUnits` vazio, faz `<Redirect href="/agenda" />`.
  - Caso contrário, mostra `<EventFormScreen mode="new" />`.
- `EventEditRoute`:
  - `useEvent(id)`. Enquanto carrega, mostra skeleton.
  - Com `null`, mostra o `EmptyState` de `calendar.detail.gone` com `Ver agenda`, igual ao detalhe.
  - Sem `canPublish(event.unitId)`, faz `<Redirect>` para `/event/[id]`.
  - Caso contrário, mostra `<EventFormScreen mode="edit" event={event} />`.

Componentes novos em `src/features/calendar/`:

```ts
FormHeader({ title, onCancel, onSave, saveLabel, valid, saving, onInvalidSave })
  // Cancelar (text, left) · title (center, type.headline) · Salvar (compact primary pill, right).
  // !valid: looks disabled, accessibilityState.disabled = true, onPress → onInvalidSave (RNF-10).
  // saving: label 'Salvando...', disabled, no press.
DateTimeField({ label, date, time, showDate, showTime, onChangeDate, onChangeTime, error })
  // Two pressables (date, time). a11y: `${label}, ${formatCivil(date, locale,
  // { weekday:'long', day:'numeric', month:'long' })}` and `${label}, ${HH:mm}` (RNF-08).
useDateTimePicker(): { open: (mode: 'date'|'time', value: Date, onPick: (d: Date) => void) => void;
                       element: ReactNode }
  // Android: DateTimePickerAndroid.open({ value, mode, is24Hour: true,
  //   timeZoneOffsetInMinutes: SAO_PAULO_OFFSET_MINUTES, onChange: (e, d) => e.type === 'set' && onPick(d) })
  // iOS: element = <Sheet> with <DateTimePicker display="spinner" mode value locale
  //   timeZoneOffsetInMinutes={SAO_PAULO_OFFSET_MINUTES} onChange> + Button 'Concluir'
  //   (events.meeting.done); onPick on Concluir.
EventFormScreen({ mode: 'new' } | { mode: 'edit'; event: CalendarEvent })
MeetingAgendaCard({ counts, onPress })           // RF-17
MeetingAgendaSheet({ visible, title, items, busy, onAdd, onRemove, onClose })  // RF-18, RF-19
useMeetingAgenda(...)                             // local list (new) or remote (existing), see T-07
```

### 2.5 Textos (`src/i18n/locales/*.json`, chave nova `events`; pt-BR literal da spec)

| Chave | pt-BR |
| ----- | ----- |
| `events.fab` | `Novo evento` |
| `events.form.newTitle` / `editTitle` | `Novo evento` / `Editar evento` |
| `events.form.save` / `saving` | `Salvar` / `Salvando...` |
| `events.form.name.label` / `placeholder` | `Nome do evento` / `Ex.: Noite cultural da ala` |
| `events.form.name.required` / `tooLong` | `Informe o nome do evento.` / `Use até 80 caracteres.` |
| `events.form.singleDay` | `Somente nesta data` |
| `events.form.start` / `end` | `Início` / `Fim` |
| `events.form.endBeforeStart` | `O fim precisa ser depois do início.` |
| `events.form.type` / `unit` | `Tipo` / `Unidade` |
| `events.form.location.label` / `placeholder` / `tooLong` | `Local` / `Capela, endereço ou link` / `Use até 160 caracteres.` |
| `events.form.notes.label` / `placeholder` / `tooLong` | `Notas` / `Informações para os participantes` / `Use até 1000 caracteres.` |
| `events.form.links.label` / `placeholder` / `add` | `Links` / `https://` / `Adicionar` |
| `events.form.links.remove` | `Remover {{link}}` |
| `events.form.links.notHttps` / `tooMany` | `Informe um link que comece com https://.` / `Use até 5 links.` |
| `events.form.notify.label` / `hint` | `Notificar` / `Envia push ao salvar o evento` |
| `events.form.saved` / `savedAndNotified` | `Evento salvo` / `Evento salvo e aviso enviado` |
| `events.form.discard.title` / `message` / `confirm` / `keep` | `Descartar alterações?` / `Você tem alterações não salvas.` / `Descartar` / `Continuar editando` |
| `events.form.removeAgenda.title` / `message` / `confirm` | `Remover a pauta?` / `Os itens da pauta, decisões e pendências serão apagados.` / `Remover` |
| `events.errors.forbidden` | `Você não tem mais permissão para publicar nesta unidade.` |
| `events.detail.edit` / `delete` | `Editar` / `Excluir` |
| `events.delete.title` / `message` / `confirm` / `done` | `Excluir evento?` / `"{{title}}" será removido da agenda. Não dá para desfazer.` / `Excluir` / `Evento excluído.` |
| `events.meeting.card` | `Pauta da reunião` |
| `events.meeting.summary.agenda_one` / `_other` | `{{count}} na pauta` / `{{count}} na pauta` |
| `events.meeting.summary.decisions_one` / `_other` | `{{count}} decisão` / `{{count}} decisões` |
| `events.meeting.summary.pending_one` / `_other` | `{{count}} pendente` / `{{count}} pendentes` |
| `events.meeting.overline` / `fallbackTitle` / `done` | `REUNIÃO` / `Reunião` / `Concluir` |
| `events.meeting.tabs.agenda` / `decisions` / `pending` | `Pauta` / `Decisões` / `Pendências` |
| `events.meeting.hint.agenda` | `Assuntos a tratar. Pendências da reunião anterior entram aqui automaticamente.` |
| `events.meeting.hint.decisions` | `O que foi decidido. Preencha durante ou depois da reunião.` |
| `events.meeting.hint.pending` | `O que fica para a próxima reunião — será levado para a pauta dela.` |
| `events.meeting.placeholder.agenda` / `decisions` / `pending` | `Novo assunto da pauta` / `Registrar decisão` / `Nova pendência` |
| `events.meeting.add` | `Adicionar` |
| `events.meeting.nextMeeting` | `Vai para a próxima reunião` |
| `events.meeting.carried` | `Pendente da reunião de {{date}}` |
| `events.meeting.remove` | `Remover "{{text}}"` |
| `events.meeting.itemLabel` | `{{text}}, {{tag}}` |

Textos que já existem e são reaproveitados:
- `common.cancel` (`Cancelar`);
- `calendar.types.<type>.one` (rótulos dos tipos);
- `calendar.detail.gone` e `calendar.detail.seeAgenda`;
- `push.audience.summary.empty`, que é o próprio texto de RF-10 (`Selecione ao menos um grupo para enviar a notificação.`);
- `push.errors.*` e `pushErrorMessageKey` (falha do push, RF-12);
- `auth.errors.network` (`Sem conexão. Verifique a internet e tente de novo.`);
- `common.genericError`, para erros que a spec não nomeia (ex.: 23514 vindo do servidor).

Para en-US e es-MX, quem implementa traduz no mesmo tom dos textos vizinhos. A paridade é verificada por `src/i18n/locales.test.ts`.

## 3. Dependências novas

| Pacote | Versão | Motivo |
| ------ | ------ | ------ |
| `@react-native-community/datetimepicker` | 9.2.1 (`npx expo install @react-native-community/datetimepicker`) | Seletores nativos de data e hora (spec, seção 4). Se o `expo install` registrar plugin num `app.json`, mova para `app.config.ts` e apague o `app.json` (`ARCHITECTURE.md`). |

## 4. Tarefas

- [x] **T-01 — Migration e testes de banco**
  - Arquivos:
    - criar `supabase/migrations/<ts>_events_write_meeting_items.sql`;
    - criar `supabase/tests/events_write.test.sql`;
    - alterar `src/lib/database.types.ts`, gerado por `make db-types`.
  - O que fazer:
    - Escrever a migration exatamente como na seção 2.1.
    - Nos testes pgTAP, comece com a mesma linha que apaga `organograma.%@exemplo.org`, como em `events_read.test.sql`.
    - Use as contas do seed:
      - `...0001` = membro;
      - `...0002` = `publicador.icara` (`unit_publisher` de Içara);
      - `...0003` = `bispo.criciuma1` (`unit_leader`);
      - `...0004` = estaca (`stake_leader`);
      - `...0005` = admin.
    - Confira os chamados delas em `supabase/seed.sql` antes de escrever as asserções.
    - Asserções, no mínimo:
      - RLS ligada em `meeting_items`.
      - CA-06:
        - `publicador.icara` faz `insert` direto em `events` com `criciuma1` e recebe `42501`. Com `icara`, o insert passa.
        - `create_event` com `criciuma1` dá `forbidden`.
        - `update_event` que move um evento de Içara para `criciuma1` dá `forbidden`.
      - RNF-01: o membro não consegue `update` nem `delete` direto em evento de Içara (0 linhas afetadas, e o evento continua lá).
      - CA-21: `create_event` chamado 2 vezes com o mesmo `p_id` cria 1 evento só. Outro usuário com o mesmo `p_id` recebe `forbidden`.
      - CA-14 e RNF-02:
        - Numa Reunião de Içara com itens, o membro lê 0 itens, `publicador.icara` lê 0 e o admin lê 0.
        - `bispo.criciuma1` lê os itens da Reunião de Criciúma 1; `estaca` lê ambas.
        - O `insert` de item pelo publicador dá `42501`.
        - `update` em item dá `42501` para quem é `can_lead`.
        - O `insert` com `carried_from_event_id` preenchido dá `42501`.
      - CA-17:
        - Como `bispo.criciuma1`, crie `Conselho da ala` em Criciúma 1, em 15/10 às 19:30 em Brasília, com o item `pending` `Definir recepção` (via `create_event` com `p_items`).
        - Depois crie `conselho da  ALA` em 12/11.
        - Os itens da nova são: 1º `agenda` `Definir recepção`, com `carried_from_date = '<ano>-10-15'` e `carried_from_event_id` = a de 15/10.
        - Os itens do formulário passados em `p_items` vêm depois.
      - CA-18: o mesmo nome em `icara`, criado por `estaca`, não copia nada.
      - Seção 7.5: uma reunião anterior sem pendências não copia nada. Duas reuniões futuras criadas em sequência copiam, cada uma, da anterior mais recente no momento da criação.
      - RF-21: `update_event` que renomeia para o nome de outra série não copia.
      - `invalid_items`:
        - `create_event` com `p_items` não vazio e tipo `activity`;
        - `create_event` pelo publicador com itens numa Reunião.
      - CA-19: `update_event` de `meeting` para `activity` apaga os itens.
      - CA-13: `delete_event` apaga o evento e os itens (cascata). `delete_event` de id inexistente dá `not_found`, e `delete_event` em outra unidade dá `forbidden`.
      - `update_event` de id inexistente dá `not_found`.
      - `not_authenticated` para `anon` nas 3 RPCs, que também não têm `execute` para `anon`.
      - CA-20: `create_event` com `p_starts_at = '<data>T22:30:00Z'` grava esse mesmo instante.
    - `events_read.test.sql` continua passando: o membro ainda recebe `42501` ao inserir.
    - Depois, rode `make db-types`.
  - Referência:
    - `supabase/migrations/20261116202618_leadership.sql:149` (RPC com códigos e grants, linhas 273-284);
    - `supabase/tests/leadership.test.sql` (troca de papel com `set local role` e `request.jwt.claims`);
    - `supabase/tests/events_read.test.sql`.
  - Cobre: CA-06 (servidor), CA-13 (servidor), CA-14 (servidor), CA-17, CA-18, CA-19 (servidor), CA-20 (servidor), CA-21 (servidor), RNF-01, RNF-02, RNF-03
  - Verificar: `supabase start`, `make test-db` (todos os arquivos passam) e `make lint`

- [x] **T-02 — Domínio: horário, rascunho e itens de pauta**
  - Arquivos:
    - alterar `src/domain/time.ts` e `src/domain/time.test.ts`;
    - criar `src/domain/eventForm.ts` e `src/domain/eventForm.test.ts`;
    - criar `src/domain/meetingItems.ts` e `src/domain/meetingItems.test.ts`.
  - O que fazer:
    - Implementar a seção 2.2.
    - Testes com `now` injetado. A suíte já roda com `TZ=Europe/Lisbon`.
    - Casos:
      - `instantOf(19:30 de 12/11)` = `22:30Z`, e `toSaoPauloWallTime(instantOf(x))` = `x` (CA-20).
      - `newEventDraft`:
        - às 18:20, início 20:00 e fim 22:00;
        - às 18:00, início 20:00;
        - às 22:10, início 00:00 do dia seguinte, com `singleDay` true;
        - às 21:30, início 23:00 e fim 01:00 do dia seguinte, com `singleDay` false;
        - unidade = a 1ª da lista, tipo `activity`, `notify` true, e `audience` = todas as opções da unidade (RF-04, RF-05, RF-06, RF-10).
      - `validateDraft`:
        - nome vazio ou só com espaços → `required`;
        - nome com 81 caracteres → `tooLong`;
        - fim 19:00 com início 19:30 → `endBeforeStart` (CA-04);
        - fim em outro dia com `singleDay` false → válido (CA-05);
        - local com 160 caracteres → válido;
        - notas com 1001 → `tooLong`, com 1000 → válido (CA-23);
        - `notify` com `audience` [] → `emptyAudience` (CA-08);
        - a ordem das chaves segue a dos campos.
      - `validateLink`: `http://x.org` → `notHttps` (CA-07); com 5 links → `tooMany`.
      - `draftFromEvent`: um evento de 2 dias tem `singleDay` false.
      - `isDraftDirty`: false para o mesmo rascunho e true depois de trocar o nome.
      - `countByKind`, `itemsOfKind`, e `shortDate({…10, 15})` = `15/10`.
  - Referência: `src/domain/calendar.ts` (regras puras e o `normalizeText`); `src/domain/time.test.ts`.
  - Cobre: CA-04, CA-05, CA-07, CA-08, CA-20, CA-23 (regras)
  - Verificar: `npx jest src/domain` e cobertura ≥ 80% em `src/domain`

- [x] **T-03 — Design system: Checkbox, chip de rádio, ChipGroup, altura do Sheet**
  - Arquivos:
    - criar `src/components/Checkbox.tsx`;
    - mover `src/features/leadership/ChipGroup.tsx` para `src/components/ChipGroup.tsx`, atualizando os imports em `HighCouncilorLinkSheet.tsx` e `OrgCounselorSheet.tsx`;
    - alterar `src/components/FilterChip.tsx`, `src/components/Sheet.tsx` e `src/theme/theme.ts`;
    - testes em `src/components/Selection.test.tsx` (FilterChip, Checkbox, ChipGroup) e `src/components/Sheet.test.tsx`;
    - alterar `src/features/dev/ComponentCatalogScreen.tsx` (Checkbox) e `.ai/docs/DESIGN_SYSTEM.md`.
  - O que fazer:
    - Tokens novos:
      - `size.fab: 56 // derived · agenda new-event button`;
      - `size.checkboxForm: 22 // derived · form checkbox`;
      - `radius.fab: 18 // derived`;
      - `radius.checkbox: 6 // derived`.
    - `Checkbox({ label, hint?, checked, onChange, disabled? })`:
      - caixa de 22, raio 6, borda 1.5 `borderStrong`; marcada, fica com fundo `primary` e `check` branco;
      - rótulo `type.listTitle` e dica `type.caption` `textMuted` abaixo;
      - `accessibilityRole="checkbox"`, `accessibilityState={{ checked, disabled }}`, `accessibilityLabel={label}` e `accessibilityHint={hint}` (RNF-06).
    - `FilterChip`: nova prop `role?: 'button' | 'radio'` (padrão `'button'`). Com `'radio'`, o chip usa `accessibilityRole="radio"` e `accessibilityState={{ checked: selected }}`. Os usos atuais não mudam.
    - `ChipGroup`: o código não muda, só o local.
    - `Sheet`: nova prop `heightRatio?: number`. Quando passada, o sheet usa `height: useWindowDimensions().height * heightRatio`.
    - Atualizar a tabela de componentes do `DESIGN_SYSTEM.md` e a lista de tokens derivados.
  - Referência: `src/features/auth/components/ConsentCheckbox.tsx` (caixa e papel); `src/components/FilterChip.tsx:19`; `src/components/designRules.test.ts` (sem cor nem texto literal).
  - Cobre: RNF-06, RNF-07 (componentes)
  - Verificar: `npx jest src/components src/features/leadership` e `make lint`

- [x] **T-04 — Textos, telemetria e API de escrita**
  - Arquivos:
    - alterar `src/i18n/locales/pt-BR.json`, `en-US.json` e `es-MX.json`;
    - alterar `src/lib/telemetry.ts` e `src/lib/telemetry.test.ts`;
    - alterar `src/features/calendar/api.ts` e `src/features/calendar/api.test.ts`;
    - criar `src/features/calendar/meetingApi.ts` e `src/features/calendar/meetingApi.test.ts`.
  - O que fazer:
    - Todas as chaves da seção 2.5, nos 3 idiomas.
    - Telemetria (seção 2.3).
    - `createEvent`, `updateEvent`, `deleteEvent`, `EventWriteError` e `useEventCache`, mais as funções de `meetingApi.ts` (seção 2.3). `storedFromRow` passa a ser exportada.
    - Testes com `getSupabase` mockado:
      - parâmetros exatos de `create_event`, com datas ISO e `p_items`;
      - mapeamento de `forbidden`, `not_found` e `invalid_items` a partir do `message`, e de `TypeError` para `network`;
      - `track('event_created', { event_id, unit_id })` sem título;
      - `fetchMeetingItems` converte `carried_from_date` e ordena por `position`, `created_at` e `id`;
      - a chave de `useMeetingItems` não começa com `'public'` (RNF-02).
  - Referência:
    - `src/features/leadership/api.ts:44` (códigos com `rpcErrorCode`) e `src/features/leadership/api.test.ts:17` (mocks);
    - `src/features/calendar/api.ts` (`storedFromRow`, chaves).
  - Cobre: RNF-02 (chave), RNF-04
  - Verificar: `npx jest src/features/calendar src/lib src/i18n` e `make lint`

- [x] **T-05 — Seletor de data e hora**
  - Arquivos:
    - `package.json` e `package-lock.json`, via `npx expo install @react-native-community/datetimepicker`;
    - criar `src/features/calendar/useDateTimePicker.tsx`;
    - criar `src/features/calendar/DateTimeField.tsx` e `src/features/calendar/DateTimeField.test.tsx`;
    - `jest.setup.ts`, só se o pacote não funcionar no Jest sem mock.
  - O que fazer:
    - Seguir a seção 2.4.
    - O `DateTimeField` recebe `date` e `time` como `CivilDate` e `ClockTime`, e devolve os mesmos tipos. Ele converte para `Date` com `instantOf` e de volta com `toSaoPauloWallTime`, nunca com getters locais.
    - Botões:
      - altura `size.input`, fundo `surfaceMuted`, raio `radius.input`;
      - a data aparece como `formatCivil(..., { weekday: 'short', day: 'numeric', month: 'short' })` e a hora como `HH:mm`;
      - `accessibilityRole="button"`, com os rótulos de RNF-08.
    - A mensagem de `error` aparece abaixo, em `type.fieldError`.
    - Testes (mock de `./useDateTimePicker`):
      - RNF-08: o rótulo do botão de data é `Início, sexta-feira, 13 de novembro`, ou o texto exato que o `Intl` do Hermes/Node gerar; o teste compara com `formatCivil` para não depender do ICU;
      - o rótulo da hora é `Início, 19:30`;
      - escolher uma data chama `onChangeDate` com a data civil de Brasília, mesmo com `TZ=Europe/Lisbon` (CA-20).
  - Referência: `src/domain/time.ts` (`formatCivil`); `src/components/Sheet.tsx` (sheet do iOS).
  - Cobre: RNF-05, RNF-08, CA-20 (exibição)
  - Verificar: `npx jest src/features/calendar/DateTimeField.test.tsx` e `make lint`

- [x] **T-06 — Card e sheet da pauta**
  - Arquivos:
    - criar `src/features/calendar/MeetingAgendaCard.tsx`;
    - criar `src/features/calendar/MeetingAgendaSheet.tsx` e `src/features/calendar/MeetingAgendaSheet.test.tsx`.
  - O que fazer:
    - `MeetingAgendaCard` (RF-17): `Pressable`, `accessibilityRole="button"`.
      - Fundo `primary`, raio `radius.card`, padding `space.lg`.
      - Ícone `checklist` em `onPrimary`, o título `events.meeting.card` (`type.listTitle`, `onPrimary`) e o resumo `{agenda} · {decisions} · {pending}` (com plural, `type.caption`, `onPrimary`).
      - Rótulo acessível: `Pauta da reunião, <resumo>`.
    - `MeetingAgendaSheet` (RF-18, RF-19), com `Sheet heightRatio={0.82}`:
      - Topo: overline `REUNIÃO`, o título (o nome do evento ou `Reunião`, `type.headline`, `accessibilityRole="header"`) e `Button` `Concluir` (`ghost`, `compact`), que chama `onClose`.
      - Abas: `Segmented<MeetingItemKind>` com `count` por aba e a dica da aba ativa (`type.caption`, `textMuted`).
      - Lista em `ScrollView`:
        - Pauta numerada `1`, `2`... (círculo `primarySubtle`, número `primary`);
        - Decisões com `check` sobre `successSubtle`;
        - Pendências com `arrow_forward` sobre `warningSubtle` e a etiqueta `Vai para a próxima reunião` (`StatusTag` `warning`);
        - item trazido com a etiqueta `Pendente da reunião de {dd/mm}` (`StatusTag` `info`).
      - Cada item é uma linha com `accessibilityLabel` = `{{text}}, {{tag}}` quando tem etiqueta (RNF-09), mais um botão `close` com rótulo `Remover "{texto}"`, que chama `onRemove(item)`.
      - Rodapé: `TextInput` (placeholder da aba, `maxLength` 300, `returnKeyType="done"`, `submitBehavior="submit"`) e um botão `+` (`add`, rótulo `Adicionar`).
        - Tocar no `+` ou dar `Enter` chama `onAdd(kind, text.trim())` e limpa o campo.
        - Texto vazio depois do `trim` não faz nada.
        - Com `busy`, o campo e os botões ficam desabilitados.
    - Testes:
      - CA-15: as 3 abas com as contagens, a dica de cada aba e o título.
      - CA-16 (UI): adicionar `Oração` pelo `+` chama `onAdd('agenda', 'Oração')`, e `Enter` também; remover chama `onRemove`; `   ` não chama nada.
      - A Pauta mostra `1` antes de `Oração`.
      - RNF-09: rótulos de item trazido, de pendência e do botão remover.
  - Referência: `src/features/leadership/HighCouncilorLinkSheet.tsx` (sheet com conteúdo montado só aberto) e `HighCouncilorLinkSheet.test.tsx`; `src/components/Segmented.tsx` (`count`).
  - Cobre: CA-15, CA-16 (UI), RNF-09
  - Verificar: `npx jest src/features/calendar/MeetingAgendaSheet.test.tsx`

- [x] **T-07 — Formulário de evento (novo e edição) e rotas**
  - Arquivos:
    - criar `src/features/calendar/FormHeader.tsx`;
    - criar `src/features/calendar/EventFormScreen.tsx` e `src/features/calendar/EventFormScreen.test.tsx`;
    - criar `src/features/calendar/EventFormRoute.tsx` (`EventFormRoute` e `EventEditRoute`);
    - criar `src/app/event/new.tsx` e `src/app/event/[id]/edit.tsx`.
  - O que fazer:
    - Estado do formulário:
      - `useState<EventDraft>(mode === 'new' ? newEventDraft(new Date(), viewer.publishableUnits) : draftFromEvent(event))`;
      - `initial` guardado num `useRef`;
      - `touched: Set<DraftField>`;
      - `id = useRef(Crypto.randomUUID())` (só no modo novo).
      - O `new Date()` fica na tela, nunca no domínio (`RULES.md`).
    - Layout: fundo `bg`, `ScrollView` com blocos brancos (`surface`, raio `radius.card`, padding `space.lg`, gap `space.md`), em 4 blocos:
      1. Nome.
      2. Datas: `Checkbox` `Somente nesta data`, `DateTimeField` `Início` (data e hora) e `DateTimeField` `Fim`. O `Fim` mostra só a hora com `singleDay`, e data e hora sem ele.
      3. `ChipGroup` `Tipo` (`radiogroup`) com `FilterChip role="radio" compact icon={eventTypeIcon[type]}` para os 5 tipos, e `ChipGroup` `Unidade` (`radiogroup`) com uma linha horizontal rolável de `FilterChip role="radio" dotColor` para cada `publishableUnits`.
      4. Local, Notas (`multiline`), Links e Notificar:
         - **Links:** um `TextField` com `autoCapitalize="none"`, `keyboardType="url"`, `maxLength` 500 e um botão `Adicionar` ao lado. A lista de links fica abaixo, cada um com um botão `close` rotulado `Remover {link}`.
         - **Notificar:** `Checkbox` `Notificar` com a dica `Envia push ao salvar o evento`. Marcado, mostra o `AudiencePicker` da unidade.
    - Erros:
      - Cada `TextField` chama `onBlur`, que marca o campo como tocado (RF-11). O erro só aparece num campo tocado.
      - O fim é marcado como tocado ao escolher qualquer data ou hora.
      - O público é marcado como tocado ao mexer nos chips. O texto do `AudiencePicker` já mostra a mensagem com a seleção vazia.
      - O erro de link aparece ao tocar em `Adicionar`, e o campo é limpo quando o link entra.
    - Regras:
      - Desmarcar `Somente nesta data` faz `endDate = startDate`.
      - Mudar o início não move o fim. A validação acusa se o fim ficar antes do início.
      - Trocar a unidade faz `audience = []` (RF-14, CA-12). Se a nova unidade não permitir `canLead`, os itens locais da pauta também são limpos.
      - Trocar de `meeting` para outro tipo com itens (locais ou remotos, `counts` > 0) abre o `ConfirmSheet` `Remover a pauta?`:
        - `Remover` troca o tipo e limpa os itens locais. Os remotos o servidor apaga ao salvar (CA-19).
        - `Cancelar` mantém `meeting`.
    - Card da pauta: aparece com `type === 'meeting' && viewer.canLead(unitId)`. No modo novo, os itens são locais. No modo de edição, vêm de `useMeetingItems(event.id)` e são gravados na hora (`addMeetingItem`/`removeMeetingItem` + `invalidateQueries(meetingItemsQueryKey)`, RF-20). Os dois modos ficam num hook local, `useMeetingAgenda`, no mesmo arquivo ou em `useMeetingAgenda.ts`.
    - `FormHeader`:
      - `valid = Object.keys(validateDraft(draft)).length === 0`.
      - `onInvalidSave`:
        - marca como tocados todos os campos com erro;
        - chama `AccessibilityInfo.announceForAccessibility(<mensagem do 1º erro>)`;
        - dá `focus()` no 1º campo inválido (os `TextField` têm `ref`). Para fim e público, usa `AccessibilityInfo.setAccessibilityFocus(findNodeHandle(ref))` (RNF-10).
    - Salvar:
      - Um `inFlight` em `useRef` impede o segundo envio (CA-21), e `saving` desabilita todos os campos (RF-11).
      - Novo: `createEvent(id, toEventInput(draft), localItems.map(({kind,text})=>({kind,text})))`. Edição: `updateEvent(event.id, toEventInput(draft))`.
      - Depois do sucesso: `cache.saved(stored)`.
        - Se `notify`: `await sendPush({ kind: 'event', itemId: stored.id, audience: draft.audience })`. Com sucesso, toast `Evento salvo e aviso enviado` (`success`). Com `PushError`, toast `t(pushErrorMessageKey[code])` (o evento continua salvo, CA-10).
        - Sem `notify`: toast `Evento salvo` (`success`).
        - Em seguida, a navegação. Novo: `router.replace({ pathname: '/event/[id]', params: { id } })`. Edição: `router.canGoBack() ? router.back() : router.replace(detalhe)`.
      - Erros de `EventWriteError`:
        - `network`: toast `auth.errors.network`, e o formulário fica como está;
        - `forbidden`: toast `events.errors.forbidden`, depois `router.back()` (seção 7.5);
        - `not_found`: toast `calendar.detail.gone` e `router.replace('/agenda')`;
        - os outros códigos: toast `common.genericError`.
    - Cancelar: sem alterações (`!isDraftDirty(initial, draft)` e nenhum item local), `router.back()`. Com alterações, abre o `ConfirmSheet` de RF-13: `Descartar` faz `router.back()`, e `Continuar editando` fecha o sheet e mantém o que foi digitado.
    - Rotas: seção 2.4.
    - Testes. Mocks de `./api`, `./meetingApi`, `@/lib/push`, `./useDateTimePicker`, `expo-router`, `expo-crypto` e `../viewer/ViewerProvider` (como `LeadershipScreen.test.tsx:23`).
      - CA-03: nome vazio + blur mostra `Informe o nome do evento.`, e `Salvar` fica com `disabled`.
      - CA-04: com fim antes do início, `O fim precisa ser depois do início.`.
      - CA-05: desmarcar mostra o campo de data do fim, e salvar chama `createEvent` com `endsAt` em outro dia.
      - CA-06 (UI): `publicador.icara` vê só o chip `Içara`.
      - CA-07: `http://x.org` + `Adicionar` mostra a mensagem.
      - CA-08: desmarcar todos os públicos mostra a mensagem, e `Salvar` fica `disabled`.
      - CA-09: salvar com `Notificar` chama `sendPush({ kind: 'event', itemId, audience })`, mostra o toast `Evento salvo e aviso enviado` e faz `replace` para o detalhe.
      - CA-10: `sendPush` rejeita `PushError('unavailable')`, `createEvent` foi chamado, e aparece `O item foi salvo, mas o aviso não foi enviado...`.
      - CA-11: alterar e tocar `Cancelar` abre `Descartar alterações?`, e `Continuar editando` mantém o nome digitado.
      - CA-12: um `stake_leader` com público em Içara troca para `Estaca`. O público fica vazio e as opções viram as da Estaca (`Toda a estaca`).
      - CA-19: numa Reunião com 1 item local, trocar para `Atividade` abre `Remover a pauta?`. Ao confirmar, o card some e `createEvent` recebe `[]`. No modo de edição, `updateEvent` é chamado com `type: 'activity'`.
      - CA-20: aparelho com `TZ=Europe/Lisbon` e início 19:30 → `createEvent` recebe `startsAt.toISOString()` com `T22:30:00.000Z`.
      - CA-21: dois toques em `Salvar` com `createEvent` pendente → 1 chamada.
      - CA-23: `Treinamento`, local com 160 caracteres e notas com 1001 mostram `Use até 1000 caracteres.`. Com 1000, salvar chama `createEvent` com `type: 'training'` e o local completo.
      - RF-12 (edição): `Notificar` vem desmarcado, salvar mostra `Evento salvo` e faz `back`.
      - Seção 7.5:
        - `forbidden` mostra `Você não tem mais permissão...` e faz `back`;
        - `not_found` mostra `Este evento não está mais disponível.` e faz `replace('/agenda')`;
        - `network` mostra `Sem conexão...` e mantém os campos.
      - CA-16 (formulário, evento existente): adicionar pela pauta chama `addMeetingItem`.
      - RNF-10: tocar em `Salvar` inválido mostra o erro do nome e chama `announceForAccessibility`.
      - Rotas: `EventFormRoute` sem unidade publicável faz redirect.
  - Referência:
    - `src/features/dev/DevPushScreen.tsx` (`AudiencePicker` + `sendPush` + `pushErrorMessageKey`);
    - `src/features/account/PhoneSheet.tsx` (formulário com blur, erros e envio);
    - `src/features/leadership/useLinkSave.ts` (`inFlight`);
    - `src/features/leadership/LeadershipScreen.test.tsx` (mock do viewer).
  - Cobre: CA-03, CA-04, CA-05, CA-06 (UI), CA-07, CA-08, CA-09, CA-10, CA-11, CA-12, CA-16 (formulário), CA-19, CA-20, CA-21, CA-23, RNF-06, RNF-07, RNF-10
  - Verificar: `npx jest src/features/calendar` e `make lint`

- [x] **T-08 — Agenda (`+`) e detalhe (editar, excluir, pauta)**
  - Arquivos:
    - alterar `src/features/calendar/AgendaScreen.tsx` e `AgendaScreen.test.tsx`;
    - alterar `src/features/calendar/EventDetailScreen.tsx` e `EventDetailScreen.test.tsx`.
  - O que fazer:
    - **Agenda** (RF-01): com `viewer.publishableUnits.length > 0`, mostra um `Pressable` flutuante, absoluto no canto inferior direito, com `right` e `bottom` = `space.lg`:
      - `size.fab`, `radius.fab`, fundo `primary`, `elevation[2]` e ícone `add` em `onPrimary`;
      - `accessibilityRole="button"`, rótulo `Novo evento`;
      - abre `router.push('/event/new')`.
      - O `ScrollView` da agenda ganha `paddingBottom` de `size.fab + space.xl`, para o botão não cobrir o último card.
    - **Detalhe:**
      - Com o evento carregado e `viewer.canPublish(event.unitId)`, o cabeçalho ganha 2 ações `tone: 'neutral'`: `edit` (`Editar`, que abre `router.push({ pathname: '/event/[id]/edit', params: { id } })`) e `delete` (`Excluir`, que abre o `ConfirmSheet` de RF-15 com `danger`).
      - Excluir confirmado:
        - chama `deleteEvent(id)`, com um `inFlight` para não repetir;
        - com sucesso: `cache.deleted(id)`, toast `Evento excluído.` (`success`) e `router.replace('/agenda')`;
        - com erro: `not_found` mostra `calendar.detail.gone` e faz `replace('/agenda')`; `forbidden` mostra `events.errors.forbidden`; `network` mostra `auth.errors.network`; os outros, `common.genericError`.
      - O card `Pauta da reunião` aparece com `event.type === 'meeting' && viewer.canLead(event.unitId)`, logo antes das ações (RF-17). As contagens vêm de `useMeetingItems(event.id, true)`.
      - O card abre o `MeetingAgendaSheet` usando o mesmo `useMeetingAgenda` em modo remoto da T-07. Um item adicionado ou removido é gravado na hora (RF-20). Com erro: `network` mostra `auth.errors.network`; os outros, `common.genericError`.
    - Testes:
      - CA-01: visitante (`publishableUnits` []), membro ([]) e `publicador.icara` (`['icara']`); só o último vê `Novo evento`.
      - CA-02: `publicador.icara` vê `Editar`/`Excluir` num evento de Içara e não vê num de Criciúma 1.
      - CA-13: confirmar a exclusão chama `deleteEvent`, mostra `Evento excluído.` e faz `replace('/agenda')`. `Cancelar` não exclui.
      - CA-14 (UI): numa Reunião de Içara, `publicador.icara` (sem `canLead`) não vê `Pauta da reunião`.
      - CA-15: numa Reunião de Criciúma 1, `bispo.criciuma1` (`unit_leader`) toca no card e o sheet abre com as 3 abas.
      - CA-16: no sheet, adicionar `Oração` chama `addMeetingItem(id, 'agenda', 'Oração')`, e remover chama `removeMeetingItem`.
  - Referência: `src/features/calendar/EventDetailScreen.tsx`; `src/features/leadership/useEditMode.tsx` (ações no `ScreenHeader`); `src/components/ScreenHeader.tsx:12` (`HeaderAction`).
  - Cobre: CA-01, CA-02, CA-13, CA-14 (UI), CA-15, CA-16
  - Verificar: `npx jest src/features/calendar` e `make check`

- [x] **T-09 — Fluxo Maestro (DoD)**
  - Arquivos: criar `.maestro/lider-publica-evento.yaml`.
  - O que fazer:
    - Com o Supabase local e o app em `make dev`:
      - entrar como `bispo.criciuma1@exemplo.org`. O código de 6 dígitos sai do Mailpit local por `runScript`, com `http.get('http://localhost:54324/api/v1/messages')` e a mensagem mais recente, de onde se extraem os 6 dígitos;
      - tocar em `Novo evento` e preencher `Conselho da ala Maestro`;
      - escolher o tipo `Reunião`, desmarcar `Notificar` e salvar;
      - conferir o toast `Evento salvo` e o card `Pauta da reunião`;
      - excluir e conferir `Evento excluído.`.
    - No topo do arquivo, comentar como rodar: Maestro instalado, simulador aberto, `supabase start`, `make dev`.
  - Referência: `.maestro/agenda-publica.yaml`.
  - Cobre: DoD (Maestro); CA-09 e CA-13 de ponta a ponta, sem push
  - Verificar: `maestro test .maestro/lider-publica-evento.yaml` (local; roda junto com o QA em aparelho da T-11)

- [x] **T-10 — Documentação**
  - Arquivos: alterar `.ai/docs/BUSINESS.md`, `.ai/docs/SECURITY.md`, `.ai/docs/ARCHITECTURE.md` e `.ai/docs/O11Y.md`.
  - O que fazer:
    - **BUSINESS.md, RN-07** (DoD): a série é "mesma unidade + mesmo nome após `lower`, sem acentos e com espaços colapsados". A cópia acontece na criação, a partir da reunião anterior mais recente. Renomear depois não copia de novo. Remover o "A definir".
    - **SECURITY.md:**
      - a linha de `meeting_items` em "Dados tratados": onde fica e quem lê (`can_lead`). A retenção continua "A definir", porque a spec não decide;
      - nas regras-chave, a escrita em `events` por `can_publish` e as RPCs `create_event`, `update_event` e `delete_event` (que não usam `admin` para pauta).
    - **ARCHITECTURE.md:** uma linha em "Padrões de referência" para "Escrita de evento e pauta" (as RPCs com id do aparelho, `meetingApi.ts` com chave fora de `public`, e o gatilho de pendências). Atualizar a lista de pastas de `calendar/`.
    - **O11Y.md:** os eventos `event_created`, `event_updated` e `event_deleted`, só com `event_id` e `unit_id`.
  - Referência: as próprias seções, no formato atual.
  - Cobre: DoD (`BUSINESS.md` RN-07), RNF-04 (documentado)
  - Verificar: leitura

- [ ] **T-11 — QA em aparelho (manual, pelo usuário)**
  - Arquivos: nenhum (registro no plano).
  - O que fazer:
    - Roteiro de QA da spec (passos 1 a 8) em iOS e Android, com VoiceOver e TalkBack (CA-22), mais o fluxo Maestro da T-09.
    - O usuário decidiu em 2026-11-17 que todos os testes em aparelho ficam para o fim do MVP. Esta tarefa não bloqueia o `/assessment-spec`: fica registrada como pendente, como a T-14 de `leadership`.
  - Cobre: CA-22, roteiro de QA, DoD (Maestro)
  - Verificar: o relato do usuário no Registro de implementação

## 5. Matriz de cobertura

| CA | Tarefa | Tipo de teste | Arquivo de teste |
| -- | ------ | ------------- | ---------------- |
| CA-01 | T-08 | componente | `src/features/calendar/AgendaScreen.test.tsx` |
| CA-02 | T-08 | componente | `src/features/calendar/EventDetailScreen.test.tsx` |
| CA-03 | T-07 | componente | `src/features/calendar/EventFormScreen.test.tsx` |
| CA-04 | T-02, T-07 | unitário + componente | `src/domain/eventForm.test.ts`, `EventFormScreen.test.tsx` |
| CA-05 | T-02, T-07 | unitário + componente | `src/domain/eventForm.test.ts`, `EventFormScreen.test.tsx` |
| CA-06 | T-01, T-07 | banco + componente | `supabase/tests/events_write.test.sql`, `EventFormScreen.test.tsx` |
| CA-07 | T-02, T-07 | unitário + componente | `src/domain/eventForm.test.ts`, `EventFormScreen.test.tsx` |
| CA-08 | T-02, T-07 | unitário + componente | `src/domain/eventForm.test.ts`, `EventFormScreen.test.tsx` |
| CA-09 | T-07, T-09 | componente + e2e | `EventFormScreen.test.tsx`, `.maestro/lider-publica-evento.yaml` |
| CA-10 | T-07 | componente | `EventFormScreen.test.tsx` |
| CA-11 | T-07 | componente | `EventFormScreen.test.tsx` |
| CA-12 | T-07 | componente | `EventFormScreen.test.tsx` |
| CA-13 | T-01, T-08, T-09 | banco + componente + e2e | `events_write.test.sql`, `EventDetailScreen.test.tsx`, `.maestro/lider-publica-evento.yaml` |
| CA-14 | T-01, T-08 | banco + componente | `events_write.test.sql`, `EventDetailScreen.test.tsx` |
| CA-15 | T-06, T-08 | componente | `MeetingAgendaSheet.test.tsx`, `EventDetailScreen.test.tsx` |
| CA-16 | T-06, T-07, T-08 | componente | `MeetingAgendaSheet.test.tsx`, `EventFormScreen.test.tsx`, `EventDetailScreen.test.tsx` |
| CA-17 | T-01 | banco | `supabase/tests/events_write.test.sql` |
| CA-18 | T-01 | banco | `supabase/tests/events_write.test.sql` |
| CA-19 | T-01, T-07 | banco + componente | `events_write.test.sql`, `EventFormScreen.test.tsx` |
| CA-20 | T-01, T-02, T-05, T-07 | banco + unitário + componente | `events_write.test.sql`, `src/domain/time.test.ts`, `DateTimeField.test.tsx`, `EventFormScreen.test.tsx` |
| CA-21 | T-01, T-07 | banco + componente | `events_write.test.sql`, `EventFormScreen.test.tsx` |
| CA-22 | T-03, T-05, T-06, T-07, T-11 | componente (papéis, rótulos, anúncio) + **manual** (VoiceOver/TalkBack) | `Selection.test.tsx`, `DateTimeField.test.tsx`, `MeetingAgendaSheet.test.tsx`, `EventFormScreen.test.tsx`; roteiro de QA, passo 8 |
| CA-23 | T-02, T-07 | unitário + componente | `src/domain/eventForm.test.ts`, `EventFormScreen.test.tsx` |

O CA-22 é manual porque o anúncio real do VoiceOver e do TalkBack só pode ser verificado em aparelho. Os testes de componente cobrem os papéis (`checkbox`, `radio`), os rótulos de data e hora, as etiquetas e o `announceForAccessibility`.

## 6. Riscos e mitigação

| Risco | Mitigação |
| ----- | --------- |
| O `timeZoneOffsetInMinutes` não funcionar em alguma plataforma do datetimepicker 9.2.1 | Conferir no `README` do pacote instalado (T-05). Se faltar numa plataforma, usar `timeZoneName="America/Sao_Paulo"` nela e registrar o desvio. O valor continua sendo um instante real, nunca montado com getters locais. |
| A política de `meeting_items` falhar por falta de `execute` em `meeting_event_leadable` | Nota da seção 2.1: conceder `execute` a `authenticated` (só devolve um booleano sobre o próprio chamador) e registrar. |
| O `translate` não cobrir algum acento que alguém digite no nome da série | Cobre o conjunto do pt e do es (a interface só tem esses idiomas). Um caractere fora da lista só faz a série não casar, e nesse caso nada é copiado (comportamento de "série nova"), sem erro. |
| `create_event` idempotente devolver um evento que o usuário não reconhece | Só devolve o evento se `created_by = auth.uid()`; caso contrário, `forbidden`. O id é um UUID v4 gerado no aparelho. |
| Duas pessoas adicionando itens ao mesmo tempo geram `position` repetida | A leitura ordena por `position`, `created_at` e `id`. Não há restrição única, então a inserção nunca falha. |
| O botão `+` cobrir o último card da agenda ou o toast | `paddingBottom` no `ScrollView` (T-08). O toast já usa `setBottomOffset` do `ToastProvider`, se preciso. |
| O Maestro não estar instalado nesta máquina | O fluxo é escrito na T-09 e executado com o QA em aparelho, na T-11, no fim do MVP (decisão do usuário). |
| O pgTAP depender do dia de hoje para as datas de 15/10 e 12/11 | Usar datas fixas e absolutas no teste (ex.: `'2026-10-15T22:30:00Z'`), sem `now()`. |

## 7. Registro de implementação

### Arquivos criados e alterados

**Banco**
- criados: `supabase/migrations/20261117125131_events_write_meeting_items.sql`, `supabase/tests/events_write.test.sql` (56 asserções).
- alterado: `src/lib/database.types.ts` (`make db-types`).

**Domínio**
- criados: `src/domain/eventForm.ts`, `src/domain/meetingItems.ts` (+ testes).
- alterados: `src/domain/time.ts` (`ClockTime`, `instantOf`) e `time.test.ts`.

**Design system e tema**
- criado: `src/components/Checkbox.tsx`.
- movido: `src/features/leadership/ChipGroup.tsx` → `src/components/ChipGroup.tsx` (imports de `HighCouncilorLinkSheet` e `OrgCounselorSheet` atualizados).
- alterados: `FilterChip.tsx` (`role`), `Sheet.tsx` (`heightRatio`), `src/theme/theme.ts` (`size.fab`, `size.checkboxForm`, `radius.fab`, `radius.checkbox`), `Selection.test.tsx`, `Sheet.test.tsx`, `ComponentCatalogScreen.tsx` (Checkbox na seção `switch`), `.ai/docs/DESIGN_SYSTEM.md`.

**App (`src/features/calendar/`)**
- criados: `DateTimeField.tsx`, `useDateTimePicker.tsx`, `FormHeader.tsx`, `EventFormScreen.tsx`, `EventFormRoute.tsx`, `MeetingAgendaCard.tsx`, `MeetingAgendaSheet.tsx`, `useMeetingAgenda.ts`, `meetingApi.ts` (+ testes de `DateTimeField`, `MeetingAgendaSheet`, `EventFormScreen`, `meetingApi`).
- alterados: `api.ts` (`createEvent`, `updateEvent`, `deleteEvent`, `EventWriteError`, `useEventCache`, `storedFromRow` exportada), `AgendaScreen.tsx`, `EventDetailScreen.tsx` e seus testes, `api.test.ts`.
- rotas: `src/app/event/new.tsx`, `src/app/event/[id]/edit.tsx`.
- outros: `src/lib/telemetry.ts` (+ teste), `src/i18n/locales/{pt-BR,en-US,es-MX}.json` (chave `events`), `package.json` e `package-lock.json` (`@react-native-community/datetimepicker` 9.2.1).
- e2e: `.maestro/lider-publica-evento.yaml`, `.maestro/scripts/read-otp.js` (não executados, ver T-11).
- docs: `BUSINESS.md` (RN-07), `SECURITY.md`, `ARCHITECTURE.md`, `O11Y.md`.

### Desvios do plano

1. **`position` de `meeting_items`** ganhou `default -1` (o gatilho trata `null` ou negativo como "ao fim da lista"). Sem default, o tipo gerado pelo Supabase exigia `position` no `insert` do app (`addMeetingItem`), o que contradiz "position por default do banco". Comportamento igual ao do plano.
2. **`execute` de `meeting_event_leadable` concedido a `authenticated`.** O pgTAP mostrou `permission denied for function meeting_event_leadable` (as políticas rodam a função com os privilégios de quem consulta), como a nota da seção 2.1 previa. A função só devolve um booleano sobre o próprio chamador.
3. **Fuso do seletor nativo:** usado `timeZoneName="America/Sao_Paulo"` em vez de `timeZoneOffsetInMinutes`. O README do pacote instalado marca o offset como obsoleto e com problemas conhecidos no Android, e recomenda `timeZoneName` (risco já previsto no plano). O instante devolvido segue sendo lido só com `toSaoPauloWallTime`. Sem plugin no `app.config.ts` (não é necessário e o `expo install` não criou `app.json`).
4. **`ChipGroup`** também é usado por `CallingFormScreen` (que tem o seu, local); só os dois sheets de `leadership` foram atualizados.
5. **Catálogo de componentes:** o `Checkbox` entrou na seção `switch` existente, para não criar chaves novas de `dev.catalog.section`.
6. **Contador de `plan` do pgTAP:** 56 asserções (o plano pedia "no mínimo" as listadas).

### Decisões durante a implementação

- **Card da pauta no modo edição** só aparece quando o evento está **salvo** como Reunião e a pessoa é `can_lead` da unidade salva. Os itens de evento existente são gravados direto na tabela (RF-20) e a RLS exige que o evento já seja uma Reunião no banco; trocar Atividade por Reunião na edição só libera a pauta depois de salvar. A spec não cobre esse caso; se o produto quiser a pauta já nessa edição, precisa de uma decisão.
- Trocar de Reunião para outro tipo com itens remotos (edição) só mostra a confirmação `Remover a pauta?`; o servidor apaga os itens em `update_event` (CA-19). Se a pessoa voltar para Reunião antes de salvar, os itens continuam.
- Falha do push depois do evento salvo: o evento fica salvo, o toast mostra a mensagem do push e a navegação segue normalmente.
- `Salvar` inválido continua tocável (aparência e `accessibilityState` de desabilitado) para marcar os erros, anunciar o primeiro e focar o campo (RNF-10).
- Durante o envio, o formulário inteiro fica com `pointerEvents="none"` e `busy` (RF-11).
- Testes de tela usam o prefixo `[event-form]`. O teste antigo de `useEvent` (placeholder) foi tornado determinístico (a consulta fica pendente), porque falhava de forma intermitente com a máquina carregada.
- Nenhum ADR novo.

### CA sem teste automatizado

- **CA-22** (VoiceOver/TalkBack): o anúncio real só se verifica em aparelho. Papéis (`checkbox`, `radio`), rótulos de data e hora, etiquetas dos itens e `announceForAccessibility` têm teste de componente.
- **Fluxo Maestro** `.maestro/lider-publica-evento.yaml`: escrito, **não executado** (Maestro não instalado).
- **T-11 (QA em aparelho, passos 1 a 8 do roteiro, iOS e Android)**: **pendente**. O usuário decidiu em 2026-11-17 fazer todos os testes em aparelho no fim do MVP. Não foi marcada como feita.
- Os demais CA têm teste automatizado com o ID no nome (banco: CA-06, CA-13, CA-14, CA-17, CA-18, CA-19, CA-20, CA-21; app: demais).
