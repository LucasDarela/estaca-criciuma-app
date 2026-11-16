# Plano: Conta — login, consentimento, perfil e acessos

> **Spec:** `.ai/specs/auth-account.md`
> **Criado em:** 2026-11-14
> **ADRs relacionados:** nenhum novo (segue `0002-stack-inicial.md` e `0004-supabase-cloud.md`)

## 1. Abordagem

A sessão do Supabase Auth passa a ser persistida por um adaptador de storage, `src/lib/secureSessionStorage.ts`. O adaptador grava no AsyncStorage o JSON da sessão cifrado com AES-256-GCM (`expo-crypto`, decisão 18), e a chave aleatória fica no `expo-secure-store`.

O `AuthSessionProvider`, em `src/lib/authSession.tsx`, assina `onAuthStateChange` e expõe `{ status, userId, email }`. O layout raiz passa essa sessão ao `ViewerProvider` que já existe. Assim, abas, avatar e permissões passam a refletir o login sem mudar o `design-system`.

Toda regra de autorização fica no banco. Uma migration nova cria seis RPCs `security definer` (`complete_welcome`, `export_my_data`, `delete_my_account`, `list_access`, `grant_role`, `revoke_role`). Elas validam quem chama e gravam `role_grants_log` na mesma transação. `memberships` continua sem política de escrita. Em caso de erro, as RPCs devolvem um código curto em `message` (ex.: `no_account`), que o app traduz.

As telas ficam em duas features:
- `auth`: Entrar, código, Boas-vindas e `SessionEffects` (consentimento, idioma e sessão expirada).
- `account`: Perfil, Acessos e os sheets.

As duas importam `useViewer` de `features/viewer`, como `features/navigation` já faz: o viewer é o contexto que atravessa o app. O seletor de unidade é usado pelas duas features, então nasce em `src/components`.

Os rate limits seguem o que o GoTrue oferece (decisão 17). No ambiente local ficam no `config.toml`; na produção, são aplicados no painel pelo runbook. O mesmo template pt-BR serve aos e-mails `Magic Link` e `Confirm signup`.

## 2. Contratos

### 2.1 Banco: `supabase/migrations/<ts>_account_rpcs.sql`

Regras comuns a todas as funções:
- `language plpgsql`, `security definer`, `set search_path = public`.
- A primeira instrução é `if auth.uid() is null then raise exception 'not_authenticated' using errcode = 'P0001'; end if;`.
- Depois de criada: `revoke all on function ... from public, anon;` e `grant execute on function ... to authenticated;`.
- Erros de regra: sempre `raise exception '<código>' using errcode = 'P0001'`.

```sql
-- RF-10. Cria ou atualiza o próprio perfil e grava o consentimento com o relógio do servidor.
create function public.complete_welcome(p_display_name text, p_home_unit_id text, p_locale text)
returns void;
--   valida: btrim(p_display_name) entre 2 e 60 → senão 'invalid_display_name';
--           p_home_unit_id null ou unidade existente <> 'estaca' → senão 'invalid_unit';
--           p_locale in ('pt-BR','en-US','es-MX') → senão 'invalid_locale'
--   insert into profiles (id, display_name, home_unit_id, locale, consented_at)
--   values (auth.uid(), btrim(p_display_name), p_home_unit_id, p_locale, now())
--   on conflict (id) do update set display_name, home_unit_id, locale, consented_at = now()

-- RF-13 (decisão 16: notes e push-notifications acrescentam chaves a este objeto).
create function public.export_my_data() returns jsonb;
--   {
--     "exported_at": "<timestamptz ISO>",
--     "account":     { "email": "<auth.users.email>" },
--     "profile":     { "display_name", "home_unit_id", "locale", "organizations",
--                      "consented_at", "created_at", "updated_at" } | null,
--     "memberships": [ { "unit_id", "role", "leadership_group", "granted_at" } ]  -- ordem: units.sort_order, role
--   }

-- RF-14, RNF-06, 7.6. Apaga auth.users (cascata: profiles → memberships; futuras notes e push_tokens).
create function public.delete_my_account() returns void;
--   se quem chama é admin e count(memberships role='admin') = 1 → 'last_admin'
--   delete from auth.users where id = auth.uid()

-- RF-15. Só stake_leader/admin; senão 'not_authorized'.
create function public.list_access()
returns table (membership_id uuid, user_id uuid, display_name text, email text,
               unit_id text, role text, leadership_group text);
--   memberships join profiles join auth.users join units; order by units.sort_order, display_name

-- RF-16, RF-18, RNF-05. Devolve o id da membership criada.
create function public.grant_role(p_email text, p_unit_id text, p_role text, p_leadership_group text)
returns uuid;
--   1. is_stake_leader() or is_admin()                         → senão 'not_authorized'
--   2. p_role = 'admin' and not is_admin()                      → 'not_authorized'
--   3. p_role entre os 4 papéis e (p_role in ('stake_leader','admin')) = (p_unit_id = 'estaca')
--                                                              → senão 'invalid_unit_for_role'
--   4. p_leadership_group null; ou 'stake_presidency' só com 'estaca';
--      'bishops'/'presidents' só fora de 'estaca'              → senão 'invalid_group'
--   5. usuário = profiles join auth.users where lower(email) = lower(btrim(p_email))
--                                                              → nenhum: 'no_account'
--   6. já existe (user_id, unit_id, role)                       → 'already_granted'
--   7. insert memberships (..., granted_by = auth.uid())
--      + insert role_grants_log ('granted', user_id, unit_id, role, leadership_group, auth.uid())

-- RF-17, RF-18, RNF-05.
create function public.revoke_role(p_membership_id uuid) returns void;
--   membership inexistente                                      → 'not_found'
--   membership.user_id = auth.uid()                             → 'cannot_revoke_self'
--   nem stake_leader nem admin; ou role = 'admin' and not is_admin() → 'not_authorized'
--   delete + insert role_grants_log ('revoked', ..., actor_id = auth.uid())
```

Depois da migration, `make db-types` regenera `src/lib/database.types.ts`.

### 2.2 `src/lib`

```ts
// src/lib/secureSessionStorage.ts — adaptador `auth.storage` do supabase-js (RNF-01)
export const SESSION_KEY_STORE_KEY = 'estaca.session-key'; // nome no SecureStore
/** O AsyncStorage guarda o base64 de `AESSealedData.combined()`; a chave AES-256 (hex) fica no SecureStore.
 *  Se o getItem não conseguir decifrar (chave perdida, dado adulterado), remove o item e devolve null. */
export const secureSessionStorage: {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
};

// src/lib/supabase.ts — alterado
export function getSupabase(): SupabaseClient<Database>;
//   lê EXPO_PUBLIC_SUPABASE_URL e EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY (RF-20); erro:
//   'Supabase is not configured: set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY'
//   auth: { storage: secureSessionStorage, persistSession: true, autoRefreshToken: true,
//           detectSessionInUrl: false }
/** true quando as duas variáveis existem (sem elas, o app abre como visitante). */
export function isSupabaseConfigured(): boolean;

// src/lib/authSession.tsx
export type AuthSession =
  | { status: 'loading' }
  | { status: 'signedOut'; expired: boolean }   // expired: SIGNED_OUT sem signOut() do app (7.6)
  | { status: 'signedIn'; userId: string; email: string };
export function AuthSessionProvider({ children }: { children: ReactNode }): JSX.Element;
//   getSession() inicial, depois onAuthStateChange. Sem configuração: { status: 'signedOut', expired: false }.
//   AppState 'active' → supabase.auth.startAutoRefresh(); senão stopAutoRefresh() (guia RN do Supabase).
export function useAuthSession(): AuthSession;
/** Saída pedida pelo app (Sair, exclusão, consentimento recusado); não marca `expired`. */
export async function signOut(): Promise<void>;

// src/lib/appFocus.ts — RF-19 de design-system e 7.6: o viewer recarrega quando o app volta ao primeiro plano
export function useAppStateFocus(): void; // focusManager.setEventListener com AppState

// src/lib/telemetry.ts — RNF-04. Ainda sem Sentry: em __DEV__, console.info(JSON); em produção, nada.
export type TelemetryEvent =
  'user_signed_in' | 'account_deleted' | 'data_exported' | 'role_granted' | 'role_revoked';
export type TelemetryProps = { method?: 'email_otp'; user_id?: string; membership_id?: string };
export function track(event: TelemetryEvent, props?: TelemetryProps): void;

// src/lib/config.ts
/** Devolve EXPO_PUBLIC_PRIVACY_URL se começar com https://; senão null (o link não aparece). */
export function privacyUrl(): string | null;
```

### 2.3 `src/domain`

```ts
// src/domain/email.ts (RF-03)
export const EMAIL_MAX_LENGTH = 254;
export function normalizeEmail(raw: string): string;          // trim + toLowerCase
export type EmailError = 'required' | 'invalid';
export function validateEmail(raw: string): EmailError | null; // /^[^\s@]+@[^\s@]+\.[^\s@]+$/ após normalizar; > 254 → 'invalid'

// src/domain/displayName.ts (RF-08, RF-09)
export type DisplayNameError = 'required' | 'length';
export function validateDisplayName(raw: string): DisplayNameError | null; // trim; 2 a 60

// src/domain/access.ts (RF-16, RF-18): espelha o grant_role, mas a barreira real é o banco
export function canManageAccess(memberships: readonly Membership[]): boolean; // stake_leader || admin
export function grantableRoles(memberships: readonly Membership[], unitId: UnitId): Role[];
//   sem canManageAccess → []; 'estaca' → ['stake_leader', ...(isAdmin ? ['admin'] : [])];
//   outras → ['unit_leader', 'unit_publisher']
export function groupsFor(unitId: UnitId): (LeadershipGroup | null)[];
//   'estaca' → ['stake_presidency', null]; outras → ['bishops', 'presidents', null]
```

### 2.4 Features

```ts
// src/features/auth/api.ts
export type AuthErrorCode = 'invalid_code' | 'rate_limited' | 'network' | 'unknown';
export class AuthFlowError extends Error { constructor(readonly code: AuthErrorCode) }
/** status 429 ou code over_email_send_rate_limit / over_request_rate_limit → rate_limited;
 *  code otp_expired, invalid_credentials ou status 400/401/403 no verify → invalid_code;
 *  AuthRetryableFetchError ou TypeError de fetch → network. */
export function toAuthFlowError(error: unknown): AuthFlowError;
export async function requestCode(email: string): Promise<void>;
//   signInWithOtp({ email: normalizeEmail(email), options: { shouldCreateUser: true } }) (RNF-02)
export async function verifyCode(email: string, token: string): Promise<{ consented: boolean }>;
//   verifyOtp({ email, token, type: 'email' }); depois, select consented_at do próprio perfil;
//   track('user_signed_in', { method: 'email_otp' })
export async function completeWelcome(input: {
  displayName: string; homeUnitId: UnitId | null; locale: Locale;
}): Promise<void>; // rpc complete_welcome

// src/features/account/api.ts
export type AccountErrorCode =
  | 'last_admin' | 'no_account' | 'already_granted' | 'cannot_revoke_self'
  | 'not_authorized' | 'network' | 'unknown';
export class AccountError extends Error { constructor(readonly code: AccountErrorCode) }
export async function updateProfile(
  userId: string, patch: { displayName?: string; homeUnitId?: UnitId | null; locale?: Locale },
): Promise<void>;                                  // update profiles (política profiles_update_own)
export async function exportMyData(): Promise<void>;
//   rpc export_my_data → new File(Paths.cache, 'meus-dados-estaca-criciuma.json').write(JSON.stringify(data, null, 2))
//   → Sharing.shareAsync(file.uri, { mimeType: 'application/json' }); track('data_exported')
export async function deleteMyAccount(): Promise<void>; // rpc; track('account_deleted'); signOut()
export type AccessEntry = {
  membershipId: string; userId: string; displayName: string; email: string;
  unitId: UnitId; role: Role; leadershipGroup: LeadershipGroup | null;
};
export const accessQueryKey = ['access'] as const;
export async function listAccess(): Promise<AccessEntry[]>; // descarta linhas com unidade ou papel desconhecido
export async function grantRole(input: {
  email: string; unitId: UnitId; role: Role; leadershipGroup: LeadershipGroup | null;
}): Promise<void>;                                  // track('role_granted', { membership_id })
export async function revokeRole(membershipId: string): Promise<void>; // track('role_revoked', { membership_id })
```

```ts
// src/components/UnitPickerSheet.tsx — design system; não importa features nem lib
export type UnitPickerSheetProps = {
  visible: boolean;
  title: string;
  noneLabel: string;              // "Prefiro não informar"
  value: UnitId | null;           // null = nenhuma
  units: readonly UnitId[];       // a tela passa unitOrder sem 'estaca'
  onSelect: (unitId: UnitId | null) => void;
  onClose: () => void;
};
```

### 2.5 Rotas

| Arquivo | Re-exporta |
| --- | --- |
| `src/app/(tabs)/sign-in.tsx` | `SignInScreen` de `features/auth/SignInScreen` |
| `src/app/sign-in/code.tsx` | `OtpScreen` (params `email`, `returnTo`) |
| `src/app/welcome.tsx` | `WelcomeScreen` |
| `src/app/(tabs)/profile.tsx` | `ProfileScreen` de `features/account/ProfileScreen` |
| `src/app/profile/access.tsx` | `AccessScreen` |

Navegação:
- Depois de `verifyCode`: se `consented` for `false`, `router.replace('/welcome')`. Senão, `router.replace(returnTo ?? '/agenda')`, com o param opcional `returnTo` de `/sign-in` (RF-07).
- `Começar` vai para `/agenda`.
- Sair e excluir fazem `router.replace('/agenda')`.

### 2.6 Tokens novos (`src/theme/theme.ts`, todos `// derived`)

```ts
size.codeBoxWidth: 48, size.codeBoxHeight: 56, size.checkbox: 24
type.signatureName: { fontFamily: fontFamily.serifSemiBold, fontSize: 26, lineHeight: 32 }
type.signatureTagline: { fontFamily: fontFamily.sansSemiBold, fontSize: 12, lineHeight: 16, letterSpacing: 2.4 }
```

### 2.7 i18n (chaves novas nos 3 locales; pt-BR literal da spec)

Copie o pt-BR **exatamente** como nas seções 7.1 a 7.6 da spec e traduza en-US e es-MX com fidelidade. "Estaca Criciúma" e `SANTA CATARINA · BRASIL` ficam iguais nos 3 idiomas.

```
auth.signature.name, auth.signature.tagline
auth.signIn.title, .intro, .email, .submit
auth.errors.emailRequired, .emailInvalid, .invalidCode, .rateLimited, .network
auth.code.title, .sentTo ({{email}}), .label ("Código"), .a11yLabel ("Código de 6 dígitos"),
         .submit ("Entrar"), .resend, .resendIn ({{seconds}}), .otherEmail
auth.welcome.title, .name, .unit, .unitNone ("Prefiro não informar"), .consent (texto 7.5),
            .privacy, .submit, .errors.nameRequired, .errors.nameLength, .errors.consent
auth.sessionExpired
account.profile.title, .name, .unit, .unitNone ("Não informada"), .language, .access,
               .export, .privacy, .signOut, .delete, .updated ("Perfil atualizado"), .save ("Salvar")
account.languages.pt-BR ("Português (Brasil)"), .en-US ("English (US)"), .es-MX ("Español (México)")
account.delete.title, .message, .confirmWord ("EXCLUIR"), .inputLabel, .submit, .done ("Conta excluída."),
              .lastAdmin
account.access.title ("Acessos"), .restricted ("Acesso restrito"), .grant ("Conceder acesso"),
              .email ("E-mail da conta"), .unit, .role, .group, .submit ("Conceder"),
              .granted ("Acesso concedido"), .noAccount, .alreadyGranted,
              .revokeTitle ("Remover acesso?"), .revokeMessage ({{name}}, {{role}}, {{unit}}),
              .revoke ("Remover"), .cannotRevokeSelf
account.roles.unit_leader, .unit_publisher, .stake_leader, .admin
account.groups.stake_presidency, .bishops, .presidents, .none ("Nenhum")
```

`account.delete.confirmWord` é a palavra que habilita o botão em cada idioma: `EXCLUIR` (pt-BR), `DELETE` (en-US) e `ELIMINAR` (es-MX). A mensagem `account.delete.message` cita essa mesma palavra.

## 3. Dependências novas

Instalar com `npx expo install`. As versões são as do SDK 58 e ficam fixadas no `package-lock.json`.

| Pacote | Versão | Motivo |
| --- | --- | --- |
| `expo-secure-store` | ~58.0.3 | Chave da cifra da sessão (RNF-01) |
| `@react-native-async-storage/async-storage` | 2.2.0 | Sessão cifrada (RNF-01) |
| `expo-crypto` | ~58.0.8 | AES-256-GCM e chave aleatória (decisão 18) |
| `expo-file-system` | ~58.0.13 | Arquivo da exportação (RF-13) |
| `expo-sharing` | ~58.0.23 | Compartilhamento do sistema (RF-13) |

Se o `npx expo install` registrar plugins num `app.json`, mova-os para o `app.config.ts` e apague o `app.json` (ver `ARCHITECTURE.md`). Rode `npm audit --omit=dev` e registre o resultado.

## 4. Tarefas

- [x] **T-01 — Nome da chave publishable (RF-20)**
  - Arquivos: `alterar src/lib/supabase.ts` · `alterar src/lib/supabase.test.ts` · `alterar .env.example` · `alterar .ai/docs/ARCHITECTURE.md` (tabela de integrações) · `criar src/lib/envNames.test.ts`
  - O que fazer:
    - Trocar a leitura da variável e a mensagem de erro para `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, e acrescentar `isSupabaseConfigured()`.
    - No `.env.example`:
      - deixar `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_ficticia`;
      - acrescentar `EXPO_PUBLIC_PRIVACY_URL=https://exemplo.org/privacidade`, com um comentário dizendo que a estaca publica a política;
      - tirar o comentário sobre manter o nome `ANON_KEY`.
    - Criar `envNames.test.ts`, que lê com `fs` os arquivos de `src/`, o `.env.example`, `.ai/docs/`, `docs/`, o `README.md` e o `AGENTS.md`. O teste falha se algum deles contiver `SUPABASE_ANON_KEY`. Siga o padrão de leitura de `src/components/designRules.test.ts`.
  - Referência: `src/lib/supabase.test.ts:15-55`, `src/components/designRules.test.ts`
  - Cobre: CA-08
  - Verificar: `make test`

- [x] **T-02 — Dependências e sessão cifrada (RF-01, RNF-01)**
  - Arquivos: `alterar package.json`/`package-lock.json` (seção 3) · `criar src/lib/secureSessionStorage.ts` · `criar src/lib/secureSessionStorage.test.ts` · `alterar src/lib/supabase.ts` · `alterar src/lib/supabase.test.ts` · `alterar jest.setup.ts`
  - O que fazer:
    - Implementar o contrato 2.2 com `AESEncryptionKey.generate(AESKeySize.AES256)`, `aesEncryptAsync` e `aesDecryptAsync` do `expo-crypto`. Confira as assinaturas exatas em `node_modules/expo-crypto/build/aes/aes.types.d.ts` e `build/aes/index.d.ts`.
    - A chave é criada uma vez e reaproveitada. O valor gravado é `combined('base64')`.
    - No `jest.setup.ts`, registrar o mock oficial do AsyncStorage (`@react-native-async-storage/async-storage/jest/async-storage-mock`) e um mock em memória do `expo-secure-store`.
    - No teste, mockar o `expo-crypto` com uma cifra falsa e reversível.
    - Testes:
      - "CA-01": o valor no AsyncStorage não contém o JWT de exemplo, e a chave existe no SecureStore;
      - `setItem` seguido de `getItem` devolve o valor original;
      - falha ao decifrar remove o item e devolve null;
      - `removeItem` apaga o item.
    - O `supabase.test.ts` passa a esperar `persistSession: true`, `autoRefreshToken: true` e `storage: secureSessionStorage`.
  - Referência: `src/lib/supabase.test.ts:15-22` (isolamento de módulo)
  - Cobre: CA-01 (parte automatizada)
  - Verificar: `make test`

- [x] **T-03 — Sessão no app (RF-01, 7.6)**
  - Arquivos: `criar src/lib/authSession.tsx` · `criar src/lib/authSession.test.tsx` · `criar src/lib/appFocus.ts` · `alterar src/app/_layout.tsx` · `alterar src/features/viewer/ViewerProvider.tsx` · `alterar src/features/viewer/ViewerProvider.test.tsx`
  - O que fazer:
    - Implementar `AuthSessionProvider`, `useAuthSession` e `signOut` (contrato 2.2). Um flag de módulo, `appInitiatedSignOut`, distingue a saída pedida pelo app da sessão expirada.
    - No `_layout.tsx`:
      - chamar `useAppStateFocus()`;
      - envolver os providers com `AuthSessionProvider`;
      - manter o splash enquanto `status` for `'loading'`;
      - passar ao `ViewerProvider` `session={auth.status === 'signedIn' ? { userId: auth.userId } : null}`.
    - No `ViewerProvider`, a query ganha `refetchInterval: 5 * 60_000` (7.6).
    - Testes, com o cliente mockado:
      - "CA-02": uma sessão salva em `getSession` resulta em `signedIn` sem novo login;
      - `SIGNED_OUT` sem `signOut()` resulta em `expired: true`;
      - com `signOut()`, `expired` fica `false`;
      - sem configuração, o estado é `signedOut`.
  - Referência: `src/features/viewer/ViewerProvider.tsx:38-75`, `src/features/viewer/ViewerProvider.test.tsx`
  - Cobre: CA-02
  - Verificar: `make test`

- [x] **T-04 — Telemetria, URL de privacidade e regras de domínio**
  - Arquivos: `criar src/lib/telemetry.ts` (+ teste) · `criar src/lib/config.ts` (+ teste) · `criar src/domain/email.ts` · `criar src/domain/displayName.ts` · `criar src/domain/access.ts` (+ testes de cada um)
  - O que fazer:
    - Implementar os contratos 2.2 e 2.3.
    - O `track` aceita só as chaves de `TelemetryProps`, sem índice livre, para que o tipo impeça passar e-mail ou nome.
    - Os testes de domínio cobrem:
      - limites de tamanho: 1, 2, 60 e 61 caracteres no nome; 254 e 255 no e-mail;
      - `abc@`, maiúsculas e espaços no e-mail;
      - a tabela de `grantableRoles` e `groupsFor` para `stake_leader`, `admin` e membro.
  - Referência: `src/domain/permissions.ts`, `src/domain/permissions.test.ts`
  - Cobre: base para CA-03, CA-09, CA-17 e CA-21
  - Verificar: `make test` (cobertura de 80% em `src/domain` e `src/lib`)

- [x] **T-05 — RPCs e testes de banco (RNF-05, RNF-06)**
  - Arquivos: `criar supabase/migrations/<ts>_account_rpcs.sql` (`supabase migration new account_rpcs`) · `criar supabase/tests/account.test.sql` · `alterar src/lib/database.types.ts` (`make db-types`)
  - O que fazer:
    - Criar as funções do contrato 2.1.
    - No pgTAP, usar os usuários do seed (`...001` membro, `...003` bispo, `...004` estaca, `...005` admin) e o padrão `set local role` + `request.jwt.claims`. Testar:
      - `anon` não executa nenhuma das 6 funções (`42501`);
      - "CA-09": `complete_welcome` grava `consented_at` e rejeita nome de 1 caractere;
      - "CA-12": `export_my_data` traz e-mail, perfil e papéis só de quem chama;
      - "CA-15": a conta estaca concede `unit_leader`/`icara`/`bishops` ao membro, e a linha aparece em `memberships` e em `role_grants_log` com `actor_id`;
      - "CA-16": e-mail sem conta → `no_account`;
      - conceder de novo o mesmo papel → `already_granted`;
      - "CA-19": a conta estaca concedendo `admin` → `not_authorized`;
      - o admin concede `admin`;
      - membro e bispo chamando `grant_role` ou `list_access` → `not_authorized`;
      - `stake_presidency` fora de `estaca` → `invalid_group`;
      - "CA-18": revogar a própria membership → `cannot_revoke_self`;
      - a conta estaca revogando `admin` → `not_authorized`;
      - revogar grava `revoked` no log;
      - "CA-20": o único admin chamando `delete_my_account` → `last_admin`;
      - "CA-13": `delete_my_account` chamado pelo membro apaga `auth.users`, `profiles` e `memberships` dele, e `role_grants_log` continua.
    - Antes dos testes, rode `supabase db reset` para partir do estado conhecido do seed.
  - Referência: `supabase/migrations/20261113220132_base_units_profiles_roles.sql:56-86`, `supabase/tests/base_rls.test.sql:1-60`, `supabase/snippets/grant_admin.sql`
  - Cobre: CA-09, CA-12, CA-13, CA-15, CA-16, CA-18, CA-19 e CA-20 (no banco)
  - Verificar: `supabase db reset && make test-db && make db-types && make lint`

- [x] **T-06 — E-mail do código e rate limits (RF-21, RNF-03)**
  - Arquivos: `alterar supabase/config.toml` · `criar supabase/templates/magic_link.html` · `alterar docs/runbooks/provisioning.md` (item e)
  - O que fazer:
    - No `config.toml`:
      - `[auth.email]`: `otp_length = 6`, `otp_expiry = 600`, `max_frequency = "60s"`;
      - `[auth.rate_limit]`: `email_sent = 30`, `token_verifications = 10`;
      - `[auth.email.template.magic_link]` e `[auth.email.template.confirmation]`, ambos com `subject = "Seu código de acesso"` e `content_path = "./supabase/templates/magic_link.html"`.
    - O HTML é simples, com estilos inline. Contém os dois textos de RF-21 e `{{ .Token }}` num bloco com fonte de 32 px e `letter-spacing: 6px`. Não tem link nem `{{ .ConfirmationURL }}`.
    - No runbook, item (e), acrescentar:
      - passo 4, Authentication › Emails: templates `Magic Link` e `Confirm signup` com o mesmo assunto e corpo (colar o arquivo);
      - passo 5, Authentication › Sign In / Providers › Email: OTP de 6 dígitos, validade de 600 s, intervalo mínimo de 60 s;
      - passo 6, Authentication › Rate Limits: 30 e-mails por hora e 10 verificações a cada 5 min.
    - O passo 3 passa a dizer: "Google e Apple desligados (fora da `auth-account`, decisão 14)".
  - Referência: `docs/runbooks/provisioning.md:44-58`
  - Cobre: CA-06 (configuração) e CA-23 (local)
  - Verificar: `supabase stop && supabase start`; pedir um código e ver o e-mail no Inbucket (`http://localhost:54324`)

- [x] **T-07 — Tela Entrar (RF-02 a RF-04)**
  - Arquivos: `criar src/features/auth/api.ts` (+ `api.test.ts`) · `criar src/features/auth/components/Signature.tsx` · `criar src/features/auth/SignInScreen.tsx` (+ teste) · `alterar src/app/(tabs)/sign-in.tsx` · `alterar src/theme/theme.ts` (tokens 2.6) · `alterar src/i18n/locales/*.json` (`auth.signature.*`, `auth.signIn.*`, `auth.errors.*`)
  - O que fazer:
    - A tela é um `ScrollView` com:
      - `Signature`, título e texto de RF-02;
      - `TextField` de e-mail com `keyboardType="email-address"`, `autoCapitalize="none"`, `autoComplete="email"`, `textContentType="emailAddress"` e `maxLength={254}`;
      - `Button` primary, em `loading` enquanto `requestCode` roda.
    - Validar ao tocar no botão. Com erro, chamar `AccessibilityInfo.announceForAccessibility(msg)` e `ref.focus()` (RNF-08).
    - Em sucesso, `router.push({ pathname: '/sign-in/code', params: { email, returnTo } })`.
    - Erros de `requestCode` aparecem no campo, com as mensagens de RF-05.
    - O `api.test.ts` testa o `toAuthFlowError` com cada caso de 2.4.
    - Testes de tela:
      - "CA-03": botão com o campo vazio, depois com `abc@`;
      - "CA-04": com e-mail válido, chama `requestCode` uma vez, mesmo com toque duplo, e navega;
      - "CA-07": não há botão com "Google" nem com "Apple"; só o campo `E-mail` e `Receber código`.
  - Referência: `src/features/placeholder/ComingSoonScreen.tsx` (tela), `src/components/TextField.tsx`, `src/features/navigation/TabsLayout.test.tsx` (render com router)
  - Cobre: CA-03, CA-04 e CA-07 (automatizado)
  - Verificar: `make test`

- [x] **T-08 — Tela do código (RF-04, RF-05, RF-07, RNF-07, RNF-09)**
  - Arquivos: `criar src/features/auth/components/CodeField.tsx` · `criar src/features/auth/OtpScreen.tsx` (+ teste) · `criar src/app/sign-in/code.tsx` · `alterar src/i18n/locales/*.json` (`auth.code.*`)
  - O que fazer:
    - `CodeField`: um único `TextInput` invisível sobre 6 caixas de `size.codeBoxWidth`×`size.codeBoxHeight`.
      - Props do input: `keyboardType="number-pad"`, `textContentType="oneTimeCode"`, `autoComplete="sms-otp"`, `maxLength={6}`, `accessibilityLabel={t('auth.code.a11yLabel')}`.
      - `onChangeText` mantém só dígitos, até 6, para que colar o código preencha tudo.
    - Contador de 60 s depois de cada envio:
      - durante a contagem, mostra `Reenviar em {s} s` desabilitado, com `accessibilityLiveRegion="none"`, sem anunciar cada segundo;
      - ao chegar a 0, anuncia uma vez `Reenviar código` (RNF-09).
    - `Entrar` (com loading) chama `verifyCode` e navega conforme 2.5. `Usar outro e-mail` faz `router.back()`.
    - Testes, com `jest.useFakeTimers`:
      - "CA-04": a frase traz o e-mail; aparece `Reenviar em 60 s` e, depois, `Reenviar código`;
      - "CA-05": `invalid_code` mostra a mensagem;
      - "CA-06": `rate_limited` mostra `Muitas tentativas…`;
      - `network` mostra a mensagem de falta de conexão;
      - `consented: false` leva a `/welcome`; `consented: true`, a `/agenda`;
      - colar `123456` preenche as 6 caixas;
      - "CA-21": ao pedir e verificar o código, nenhuma chamada a `track` nem a `console.*` recebe o e-mail ou o código (spy em `@/lib/telemetry` e em `console`).
  - Referência: `src/components/toast/ToastProvider.test.tsx` (fake timers)
  - Cobre: CA-04, CA-05, CA-06 e CA-21 (no app)
  - Verificar: `make test`

- [x] **T-09 — Boas-vindas e efeitos de sessão (RF-07 a RF-10, RNF-10, 7.6)**
  - Arquivos: `criar src/components/UnitPickerSheet.tsx` (+ teste) · `criar src/features/auth/WelcomeScreen.tsx` (+ teste) · `criar src/features/auth/components/ConsentCheckbox.tsx` · `criar src/features/auth/SessionEffects.tsx` (+ teste) · `criar src/app/welcome.tsx` · `alterar src/app/_layout.tsx` (`<SessionEffects />` dentro do `ToastProvider`) · `alterar src/i18n/locales/*.json` (`auth.welcome.*`, `auth.sessionExpired`)
  - O que fazer:
    - `UnitPickerSheet` (contrato 2.4): um `Sheet` com o `ListItem` de `noneLabel` primeiro e, depois, as unidades com `leading: { kind: 'unitDot', unitId }` e `trailing` `check` na selecionada. Não importa `features/` nem `lib/` (CA-20 de `design-system`).
    - `WelcomeScreen`:
      - `ScreenHeader` com `onBack`, que faz `signOut()` e `router.replace('/agenda')`;
      - nome em `TextField`;
      - unidade em `ListItem`, que abre o `UnitPickerSheet` com as 6 unidades de `unitOrder` sem `estaca`;
      - `ConsentCheckbox`;
      - link de privacidade, só se `privacyUrl()` existir, via `Linking.openURL`;
      - `Começar`, que chama `completeWelcome` com o locale de `i18n.language`, invalida `['viewer']` e faz `router.replace('/agenda')`.
    - O botão voltar do Android (`BackHandler`) tem o mesmo comportamento do `onBack`.
    - `ConsentCheckbox`: `Pressable` com `accessibilityRole="checkbox"`, `accessibilityState={{ checked }}` e o texto completo como rótulo. A caixa tem `size.checkbox` e mostra `Icon check` quando marcada.
    - `SessionEffects` não tem UI e faz três coisas:
      1. **Consentimento:** com `signedIn`, o viewer carregado, `profile?.consentedAt` nulo e a rota fora de `/welcome` e de `/sign-in*`, faz `signOut()` (RF-10, para quando o app foi fechado no meio).
      2. **Idioma:** se `profile.locale` for diferente de `i18n.language`, chama `i18n.changeLanguage(profile.locale)`.
      3. **Sessão expirada:** em `signedOut` com `expired: true`, mostra uma vez o toast `auth.sessionExpired`.
    - Testes:
      - "CA-09": sem consentimento, aparece a mensagem de RF-09; com consentimento, `completeWelcome` recebe nome, unidade e locale, e a navegação vai para `/agenda`;
      - nome vazio e nome de 1 caractere;
      - "CA-10": `onBack` chama `signOut`;
      - os três efeitos do `SessionEffects`;
      - no `UnitPickerSheet`, a seleção e o `noneLabel`.
  - Referência: `src/components/Sheet.tsx`, `src/components/ListItem.tsx:12-24`, `src/features/viewer/ViewerProvider.test.tsx`
  - Cobre: CA-09 e CA-10
  - Verificar: `make test`

- [x] **T-10 — Perfil, exportação e exclusão (RF-11 a RF-14)**
  - Arquivos: `criar src/features/account/api.ts` (+ `api.test.ts`) · `criar src/features/account/ProfileScreen.tsx` (+ teste) · `criar src/features/account/EditNameSheet.tsx` · `criar src/features/account/LanguageSheet.tsx` · `criar src/features/account/DeleteAccountSheet.tsx` (+ teste) · `alterar src/app/(tabs)/profile.tsx` · `alterar src/i18n/locales/*.json` (`account.profile.*`, `account.languages.*`, `account.delete.*`)
  - O que fazer:
    - `ProfileScreen`:
      - `ScreenHeader` `Perfil`, `Avatar size="large"`, o nome e o e-mail de `useAuthSession()`;
      - itens `ListItem` com chevron, na ordem de RF-11;
      - `Acessos` só aparece com `canManageAccess` e leva a `/profile/access`;
      - `Excluir conta` fica separado no fim da lista, em `Pressable` com texto `type.listTitle` e cor `theme.danger`.
    - Nome e unidade:
      - o nome abre o `EditNameSheet` (`TextField` + `Salvar`, com as regras de RF-08 e RF-09);
      - a unidade abre o `UnitPickerSheet`, com `noneLabel` = `Não informada`;
      - ao salvar, chamar `updateProfile`, invalidar o viewer e mostrar o toast `Perfil atualizado`.
    - Idioma: o `LanguageSheet` lista os 3 idiomas. Ao escolher, chamar `i18n.changeLanguage` e, depois, `updateProfile({ locale })`.
    - `Exportar meus dados`: item em loading enquanto roda; chama `exportMyData`. Em `network`, toast de falta de conexão.
    - `Sair`: `signOut()`, depois `router.replace('/agenda')`.
    - `DeleteAccountSheet`:
      - o botão só habilita com o texto **exatamente** igual a `t('account.delete.confirmWord')`;
      - confirmado: `deleteMyAccount`, `router.replace('/agenda')` e toast `Conta excluída.`;
      - `last_admin` mostra a mensagem 7.6 dentro do sheet; `network` mostra o toast e nada é excluído.
    - No teste da api, mockar `expo-file-system` (`File`, `Paths`) e `expo-sharing`.
    - Testes:
      - "CA-11": escolher `English (US)` troca o texto da tela na hora e chama `updateProfile` com `en-US`;
      - "CA-12": `exportMyData` grava `meus-dados-estaca-criciuma.json` com o JSON da RPC e chama `shareAsync`;
      - "CA-13": com `excluir`, o botão continua desabilitado; com `EXCLUIR`, chama a RPC, navega e mostra o toast;
      - "CA-20": `last_admin` mostra `Transfira a administração…`;
      - `Acessos` não aparece para membro.
  - Referência: `src/components/ConfirmSheet.tsx`, `src/components/Sheet.test.tsx`, `src/features/viewer/api.ts` (acesso a dados)
  - Cobre: CA-11, CA-12, CA-13 e CA-20 (no app)
  - Verificar: `make test`

- [x] **T-11 — Acessos (RF-15 a RF-18)**
  - Arquivos: `criar src/features/account/AccessScreen.tsx` (+ teste) · `criar src/features/account/GrantAccessSheet.tsx` (+ teste) · `criar src/app/profile/access.tsx` · `alterar src/i18n/locales/*.json` (`account.access.*`, `account.roles.*`, `account.groups.*`)
  - O que fazer:
    - `AccessScreen`:
      - sem `canManageAccess`, mostra `ScreenHeader` e `EmptyState` `Acesso restrito`, sem chamar `listAccess`;
      - com permissão, carrega `useQuery(accessQueryKey, listAccess)` numa `SectionList` por unidade (ordem `unitOrder`, título `units[id].label`);
      - cada item é um `ListItem` com `leading: avatar`, `title` = nome e `subtitle` = `email · papel · grupo`;
      - o botão `Conceder acesso` fica fixo no rodapé.
    - Remover acesso:
      - tocar num item abre o `ConfirmSheet` com os textos de RF-17;
      - se o item for de quem está logado, mostra o toast `Você não pode remover o próprio acesso.` sem chamar a RPC;
      - depois de revogar ou conceder, invalidar `accessQueryKey` e `['viewer']`.
    - `GrantAccessSheet`:
      - campo de e-mail validado por `validateEmail`;
      - linhas de `FilterChip` de seleção única para a unidade (Estaca + 6), o papel (`grantableRoles`) e o grupo (`groupsFor`);
      - trocar a unidade limpa papel e grupo que deixaram de valer;
      - `Conceder` só habilita com e-mail, unidade e papel preenchidos;
      - em sucesso, fecha e mostra o toast `Acesso concedido`. `no_account` e `already_granted` aparecem como erro no campo de e-mail.
    - Testes:
      - "CA-14": um membro vê `Acesso restrito`;
      - "CA-15": conceder a `membro@exemplo.org` `Liderança da unidade` em `Ala Içara`, grupo `Bispos`, chama `grantRole` com esses valores e mostra o toast;
      - "CA-16": `no_account` mostra a mensagem;
      - "CA-17": para `stake_leader` não há chip `Administração`; para `admin`, há;
      - "CA-18": tocar no próprio item mostra a mensagem e não chama `revokeRole`;
      - revogar outro item chama `revokeRole` depois da confirmação.
  - Referência: `src/components/FilterChip.tsx`, `src/components/ConfirmSheet.tsx`, `src/components/EmptyState.tsx`
  - Cobre: CA-14, CA-15, CA-16, CA-17 e CA-18 (no app)
  - Verificar: `make test`

- [x] **T-12 — Documentação**
  - Arquivos: `alterar .ai/docs/SECURITY.md` · `alterar .ai/docs/RULES.md` · `alterar .ai/docs/ARCHITECTURE.md` · `alterar AGENTS.md` · `alterar .ai/docs/DESIGN_SYSTEM.md`
  - O que fazer:
    - `SECURITY.md`:
      - a autenticação passa a ser só por OTP por e-mail; Google e Apple ficam para uma spec futura;
      - a sessão fica no AsyncStorage, cifrada com AES-256-GCM, com a chave no SecureStore (decisão 18);
      - incluir os rate limits de RNF-03;
      - listar as 6 RPCs entre as RPCs auditadas.
    - `RULES.md`: na linha "Guardar dado pessoal em `AsyncStorage`", a coluna "Em vez disso" passa a citar o `secureSessionStorage`.
    - `ARCHITECTURE.md`:
      - linha Autenticação: "OTP por e-mail";
      - a linha Google/Apple das integrações fica marcada como futura;
      - acrescentar `features/auth` e `features/account`;
      - acrescentar os padrões "Sessão" (`src/lib/authSession.tsx`) e "RPC com auditoria" (a migration nova);
      - tirar "armazenamento seguro de sessão" da lista de pacotes não instalados.
    - `AGENTS.md`: na linha da stack, "OTP por e-mail + Google + Apple" vira "OTP por e-mail".
    - `DESIGN_SYSTEM.md`: listar o `UnitPickerSheet` e os tokens novos (2.6).
  - Referência: as seções atuais dos próprios arquivos
  - Cobre: CA-08 (docs) e DoD
  - Verificar: `make check`

- [x] **T-14 — Unidade de quem recebe acesso (RF-16a, RF-12; decisões 19 e 20; achado do QA)**
  - Arquivos: `criar supabase/migrations/<ts>_role_home_unit.sql` · `alterar supabase/tests/account.test.sql` · `alterar supabase/seed.sql` · `alterar supabase/snippets/grant_admin.sql` · `alterar src/lib/database.types.ts` · `alterar src/features/account/api.ts` · `alterar src/features/account/GrantAccessSheet.tsx` (+ teste) · `alterar src/features/account/ProfileScreen.tsx` (+ teste) · `alterar src/i18n/locales/*.json` · `alterar docs/runbooks/provisioning.md` (item j)
  - O que fazer:
    - Migration nova (não edite a `account_rpcs` já aplicada):
      - `create or replace function grant_role` com dois passos novos depois do 5: `profiles.home_unit_id is null` → `'no_home_unit'`; `p_role in ('unit_leader','unit_publisher') and p_unit_id <> home_unit_id` → `'wrong_unit'`.
      - Função de trigger `profiles_guard_home_unit` (`before update of home_unit_id on profiles`, `security definer`, `set search_path = public`). Quando `new.home_unit_id is distinct from old.home_unit_id`, faz `raise exception 'home_unit_locked' using errcode = 'P0001'` em dois casos:
        - `new.home_unit_id is null` e existe alguma membership da pessoa;
        - existe membership da pessoa com `role in ('unit_leader','unit_publisher')`.
      - O trigger vale também para o `on conflict do update` do `complete_welcome`.
    - `seed.sql`: dar `home_unit_id` coerente aos usuários fictícios com papel (bispo → `criciuma1`, publicador → `icara`, estaca e admin → uma ala qualquer). O membro fica sem unidade.
    - `grant_admin.sql`: novo resultado `'error: user has no home unit'`, antes do insert.
    - Runbook, item (j): o admin informa a unidade em `Boas-vindas` antes de rodar o snippet.
    - App:
      - `AccountErrorCode` ganha `'no_home_unit' | 'wrong_unit' | 'home_unit_locked'`, com as mensagens literais de RF-16a e RF-12 (`account.access.noHomeUnit`, `account.access.wrongUnit`, `account.profile.unitLocked`) nos 3 locales;
      - no `GrantAccessSheet`, os dois erros aparecem no campo de e-mail;
      - no `ProfileScreen`, `home_unit_locked` ao salvar a unidade mostra a mensagem no sheet e mantém a unidade.
    - Testes pgTAP:
      - "CA-24": a conta estaca concede `unit_leader` em `criciuma2` a quem frequenta `criciuma1` → `wrong_unit`; em `criciuma1` → ok; `stake_leader` → ok;
      - "CA-25": quem não tem unidade recebendo `stake_leader` → `no_home_unit`; `admin`, concedido pela conta admin → `no_home_unit`;
      - "CA-26": quem tem `unit_leader` atualizando o próprio `home_unit_id` para outra unidade → `home_unit_locked`; para null → `home_unit_locked`; quem tem só `stake_leader` muda de uma ala para outra → ok, e para null → `home_unit_locked`.
    - Ajuste os testes antigos (CA-15 e outros) que concedem papel a um usuário sem unidade ou em outra unidade.
    - Testes de componente: "CA-24"/"CA-25" com a mensagem no sheet; "CA-26" com a mensagem no Perfil.
  - Referência: `supabase/migrations/20261115030703_account_rpcs.sql` (grant_role), `supabase/tests/account.test.sql`
  - Cobre: CA-24, CA-25, CA-26
  - Verificar: `supabase db reset && make test-db && make db-types && make check`

- [ ] **T-13 — Roteiro de QA em aparelho (sessão principal, com o usuário)**
  - Arquivos: nenhum; o resultado vai para o Registro de implementação
  - O que fazer:
    - Executar os passos 1 a 9 do roteiro da spec contra o Supabase local. O usuário precisa trocar o nome da variável (RF-20) no `.env` dele.
    - CA-01 no aparelho: ler o AsyncStorage pelo depurador e confirmar que não há JWT legível.
    - CA-22 com VoiceOver e TalkBack.
    - CA-23 no Inbucket.
    - Depois do merge e do deploy da migration pelo `deploy.yml`:
      - aplicar os passos 4 a 6 do item (e) do runbook no painel;
      - executar o passo 10 na produção: o e-mail chega em pt-BR, com SPF, DKIM e DMARC `pass`, e o `grant_admin.sql` retorna `granted`.
    - O `implementer` não executa esta tarefa.
  - Cobre: CA-01 (aparelho), CA-21 (logs do Supabase), CA-22, CA-23 e o passo 10
  - Verificar: roteiro de QA

- [x] **T-15 — Idioma em Boas-vindas (RF-08b, decisão 22; ajuste pós-merge)**
  - Arquivos: `criar src/components/LanguageSheet.tsx` (+ teste) · `remover src/features/account/LanguageSheet.tsx` · `alterar src/features/account/ProfileScreen.tsx` · `alterar src/features/auth/WelcomeScreen.tsx` (+ teste)
  - O que fazer:
    - Mover o `LanguageSheet` para o design system, porque uma feature não importa outra. O componente recebe por props `title`, `options: readonly { value: Locale; label: string }[]`, `value`, `onSelect` e `onClose`, e não importa `features/` nem `lib/`. O Perfil passa a usá-lo de lá, sem mudar o comportamento.
    - Em `WelcomeScreen`, acrescentar o `ListItem` `Idioma` (chave `account.profile.language` já existente, ou uma chave nova `auth.welcome.language` com o mesmo texto `Idioma` nos 3 locales), entre a unidade e o consentimento, mostrando o idioma atual com as chaves `account.languages.*`.
    - Escolher o idioma chama `i18n.changeLanguage`. O `completeWelcome` já envia o locale de `i18n.language`, então não muda.
    - Testes:
      - "CA-27": escolher `Español (México)` muda os textos da tela e faz `completeWelcome` receber `es-MX`;
      - o `LanguageSheet` marca a opção atual e chama `onSelect`;
      - o teste "CA-11" do Perfil continua passando.
  - Referência: `src/features/account/LanguageSheet.tsx`, `src/components/UnitPickerSheet.tsx` (componente do design system com rótulos por props)
  - Cobre: CA-27
  - Verificar: `make check`

- [ ] **T-16 — Mensagem ao falhar o envio do código (RF-05a, decisão 23; achado do QA)**
  - Arquivos: `alterar src/features/auth/api.ts` (+ `api.test.ts`) · `alterar src/features/auth/SignInScreen.tsx` (+ teste) · `alterar src/features/auth/OtpScreen.tsx` (+ teste) · `alterar src/i18n/locales/*.json`
  - O que fazer:
    - `AuthErrorCode` ganha `'send_failed'`. No `requestCode`, um `AuthApiError` com status 400, 401 ou 403 (e qualquer outro erro do servidor que não seja limite nem rede) vira `send_failed`. O `toAuthFlowError` do `verifyCode` não muda.
    - Chave nova `auth.errors.sendFailed`: "Não foi possível enviar o código. Tente de novo." em pt-BR, traduzida em en-US e es-MX.
    - A mensagem aparece no campo de e-mail (`SignInScreen`) e no reenvio (`OtpScreen`).
    - Testes:
      - "CA-28": 401 em `requestCode` mostra a mensagem nova, e não "Código inválido…";
      - no `api.test.ts`, `requestCode` com 400, 401 e 403 devolve `send_failed`, e `verifyCode` com 403 continua `invalid_code`.
  - Referência: `src/features/auth/api.ts:20-55`
  - Cobre: CA-28
  - Verificar: `make check`

## 5. Matriz de cobertura

| CA | Tarefa | Tipo de teste | Arquivo de teste |
| -- | ------ | ------------- | ---------------- |
| CA-01 | T-02, T-13 | unitário + manual (aparelho) | `src/lib/secureSessionStorage.test.ts` |
| CA-02 | T-03 | componente (cliente mockado) | `src/lib/authSession.test.tsx` |
| CA-03 | T-04, T-07 | unitário + componente | `src/domain/email.test.ts`, `src/features/auth/SignInScreen.test.tsx` |
| CA-04 | T-07, T-08 | componente | `SignInScreen.test.tsx`, `OtpScreen.test.tsx` |
| CA-05 | T-08 | componente | `src/features/auth/OtpScreen.test.tsx` |
| CA-06 | T-06, T-08 | componente (429 mockado) + configuração | `OtpScreen.test.tsx`, `src/features/auth/api.test.ts` |
| CA-07 | T-07 | componente + manual | `SignInScreen.test.tsx` |
| CA-08 | T-01, T-12 | unitário (busca em arquivos) | `src/lib/envNames.test.ts` |
| CA-09 | T-05, T-09 | banco + componente | `supabase/tests/account.test.sql`, `WelcomeScreen.test.tsx` |
| CA-10 | T-09 | componente | `src/features/auth/WelcomeScreen.test.tsx` |
| CA-11 | T-10 | componente | `src/features/account/ProfileScreen.test.tsx` |
| CA-12 | T-05, T-10 | banco + integração | `account.test.sql`, `src/features/account/api.test.ts` |
| CA-13 | T-05, T-10 | banco + componente | `account.test.sql`, `DeleteAccountSheet.test.tsx` |
| CA-14 | T-11 | componente | `src/features/account/AccessScreen.test.tsx` |
| CA-15 | T-05, T-11 | banco + componente | `account.test.sql`, `GrantAccessSheet.test.tsx` |
| CA-16 | T-05, T-11 | banco + componente | `account.test.sql`, `GrantAccessSheet.test.tsx` |
| CA-17 | T-04, T-11 | unitário + componente | `src/domain/access.test.ts`, `GrantAccessSheet.test.tsx` |
| CA-18 | T-05, T-11 | banco + componente | `account.test.sql`, `AccessScreen.test.tsx` |
| CA-19 | T-05 | banco | `supabase/tests/account.test.sql` |
| CA-20 | T-05, T-10 | banco + componente | `account.test.sql`, `DeleteAccountSheet.test.tsx` |
| CA-21 | T-04, T-08, T-13 | componente (spy) + manual (logs do Supabase) | `OtpScreen.test.tsx` |
| CA-24 | T-14 | banco + componente | `account.test.sql`, `GrantAccessSheet.test.tsx` |
| CA-25 | T-14 | banco + componente | `account.test.sql`, `GrantAccessSheet.test.tsx` |
| CA-26 | T-14 | banco + componente | `account.test.sql`, `ProfileScreen.test.tsx` |
| CA-27 | T-15 | componente | `src/features/auth/WelcomeScreen.test.tsx` |
| CA-28 | T-16 | unitário + componente | `src/features/auth/api.test.ts`, `SignInScreen.test.tsx` |
| CA-22 | T-13 | manual (VoiceOver/TalkBack) | roteiro de QA |
| CA-23 | T-06, T-13 | manual (Inbucket e produção) | roteiro de QA |

## 6. Riscos e mitigação

| Risco | Mitigação |
| ----- | --------- |
| `delete from auth.users` numa função `security definer` sem permissão no Supabase Cloud | A função pertence ao `postgres`, que no Supabase tem `delete` em `auth.users`. O pgTAP cobre no ambiente local, e o passo 9 do QA na produção confirma. Se falhar na produção, pare e avise; não use a chave secreta no app. |
| O primeiro código de um e-mail novo sai pelo template `Confirm signup`, não pelo `Magic Link` | Os dois templates recebem o mesmo conteúdo (T-06; RF-21 já ajustado na spec). |
| O `.env` local do usuário ainda tem `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Sem a variável nova, o app abre como visitante (`isSupabaseConfigured`). O QA (T-13) começa pela troca do nome. |
| Sessão cifrada ilegível (chave apagada ao reinstalar no iOS, dado adulterado) | O `getItem` remove o item e devolve `null`; a pessoa só precisa entrar de novo. |
| Corrida entre o `verifyCode` e o `SessionEffects` encerrando a sessão sem consentimento | O efeito ignora `/welcome` e `/sign-in*` (T-09). |
| Rate limit por IP compartilhado (rede da capela) bloqueia várias pessoas ao mesmo tempo | 10 verificações a cada 5 min por IP é o limite combinado (decisão 17). A mensagem de RF-05 orienta a esperar. |
| E-mail ou nome em log | `role_grants_log` só guarda ids, e o `track` só aceita ids (T-04). |

## 7. Registro de implementação

### Arquivos criados e alterados

- **Banco:** `supabase/migrations/20261115030703_account_rpcs.sql` (criado), `supabase/tests/account.test.sql` (criado, 37 testes), `supabase/config.toml` (OTP 6 dígitos/600 s/60 s, rate limits, templates `magic_link` e `confirmation`), `supabase/templates/magic_link.html` (criado), `src/lib/database.types.ts` (regenerado).
- **lib:** `secureSessionStorage.ts`, `authSession.tsx`, `appFocus.ts`, `telemetry.ts`, `config.ts` (criados, cada um com teste); `supabase.ts` e `supabase.test.ts` (alterados); `envNames.test.ts` (criado).
- **domain:** `email.ts`, `displayName.ts`, `access.ts` (criados, com testes).
- **features/auth:** `api.ts`, `SignInScreen.tsx`, `OtpScreen.tsx`, `WelcomeScreen.tsx`, `SessionEffects.tsx`, `components/{Signature,CodeField,ConsentCheckbox}.tsx` (criados, com testes).
- **features/account:** `api.ts`, `ProfileScreen.tsx`, `EditNameSheet.tsx`, `LanguageSheet.tsx`, `DeleteAccountSheet.tsx`, `AccessScreen.tsx`, `GrantAccessSheet.tsx` (criados, com testes).
- **components:** `UnitPickerSheet.tsx` (+ teste) criado; `ListItem.tsx` (trailing `check` e `loading`, prop `selected`) e `Sheet.tsx` (`KeyboardAvoidingView`) alterados.
- **viewer:** `ViewerProvider.tsx` (`refetchInterval` de 5 min e campo `loaded`) e seu teste.
- **rotas:** `src/app/_layout.tsx` (providers de sessão, `SessionEffects`, splash), `(tabs)/sign-in.tsx`, `(tabs)/profile.tsx`, `sign-in/code.tsx`, `welcome.tsx`, `profile/access.tsx`.
- **tema e i18n:** `theme.ts` (tokens 2.6), `i18n/locales/{pt-BR,en-US,es-MX}.json`.
- **config e docs:** `package.json`/`package-lock.json` (5 pacotes da seção 3), `app.config.ts` (plugins `expo-secure-store` e `expo-sharing`), `jest.setup.ts` (mocks de AsyncStorage e SecureStore), `.env.example`, `docs/runbooks/provisioning.md`, `AGENTS.md`, `.ai/docs/{SECURITY,RULES,ARCHITECTURE,DESIGN_SYSTEM}.md`.

### Desvios do plano

- **`revoke_role` checa a permissão antes de procurar a membership** (o plano listava `not_found` primeiro). Motivo: quem não pode gerenciar acessos não deve conseguir descobrir quais ids existem. Os códigos de erro e os testes de CA-18 não mudam.
- **`Viewer` ganhou o campo `loaded`** (`ViewerProvider.tsx`). O `SessionEffects` precisa distinguir "perfil ainda carregando" de "conta sem perfil/consentimento"; sem isso, deslogaria durante a carga.
- **`ListItem` ganhou `trailing` `check` e `loading` e a prop `selected`**: o plano pedia `check` na unidade escolhida, que o componente não tinha; o `loading` atende "Exportar meus dados em loading". Documentado em `DESIGN_SYSTEM.md`.
- **`Sheet` agora usa `KeyboardAvoidingView` no iOS**: sem isso o teclado cobriria os sheets com campo de texto (nome, exclusão, conceder acesso). Verificar em aparelho (T-13).
- **Chaves de i18n extras**: `common.genericError` e `common.retry` (erros `unknown`, `not_authorized` e a nova tentativa da tela Acessos). Mesmos textos nos 3 idiomas.
- **`SignInScreen` não chama `AccessibilityInfo.announceForAccessibility` direto**: o `TextField` já anuncia o erro quando ele aparece (RNF-08); a tela só move o foco. Evita anúncio duplo.
- **`EditNameSheet` e `GrantAccessSheet` montam o formulário só com o sheet aberto**, para reiniciar o estado a cada abertura sem `setState` em efeito (regra do lint).
- `verifyCode` lança erro se a leitura de `consented_at` falhar (não presume `consented`).

### Decisões durante a implementação

- `signOut()` usa o escopo padrão do Supabase (global); o flag `appInitiatedSignOut` é zerado em `finally`, pois o `SIGNED_OUT` chega antes de a promessa resolver.
- O splash é escondido no `AuthenticatedApp`, depois de fontes e sessão carregadas.
- A exclusão reaproveita o `signOut()` ao final de `deleteMyAccount`; a tela só navega e mostra o toast.
- `complete_welcome` rejeita `estaca` como unidade frequentada (`invalid_unit`), coerente com a constraint `home_unit_not_stake`.
- `npm audit --omit=dev`: relata `deepmerge` (>=4.2.0, prototype poisoning) via cadeia `jest`/`jest-config` já existente, sem relação com os 5 pacotes novos; o "fix" proposto rebaixaria o Jest para 29 (breaking). Não tratado aqui.
- Template de e-mail e config local verificados: o código de 6 dígitos chega ao Inbucket/Mailpit local com assunto `Seu código de acesso` e sem link.
- **Achado do QA (T-13), corrigido:** depois de `Começar`, o usuário caía na Agenda deslogado. O `await invalidateQueries(['viewer'])` resolve antes de o TanStack entregar o dado novo ao observer do `ViewerProvider`, e o `router.replace('/agenda')` renderiza primeiro; o `SessionEffects` via `/agenda` com o perfil antigo (`consentedAt` nulo) e chamava `signOut()`. Correção: a guarda de consentimento roda uma vez por id de usuário logado, na primeira vez em que o viewer daquele usuário está carregado (ref com o id já checado, zerada ao deslogar). Navegação posterior nunca a dispara. Cobre só o caso para o qual existe (app fechado no meio do `/welcome`, RF-10). Testes de regressão em `SessionEffects.test.tsx`.
- **T-14 (QA, decisões 19 a 21):** a migration `20261115173955_role_home_unit.sql` redefine `grant_role` (passos `no_home_unit` e `wrong_unit` depois de `no_account`, antes de `already_granted`) e cria o trigger `profiles_guard_home_unit` (`before update of home_unit_id`, `security definer`), que cobre também o `on conflict do update` do `complete_welcome` e updates diretos pela API. O seed passou a dar unidade a quem tem papel (bispo `criciuma1`, publicador `icara`, estaca `criciuma3`, admin `criciuma1`); o membro (`...001`) ficou sem unidade. `grant_admin.sql` devolve `error: user has no home unit` (conferido no banco local: membro sem unidade recusado, publicador com unidade concedido). pgTAP: 48 testes em `account.test.sql` (CA-24, CA-25, CA-26), com um usuário extra `...006` sem unidade. App: três códigos novos em `AccountError` e as mensagens literais nos 3 idiomas (`account.access.noHomeUnit`, `account.access.wrongUnit`, `account.profile.unitLocked`); `GrantAccessSheet` mostra os dois erros no campo de e-mail; `ProfileScreen` mostra `home_unit_locked` dentro do sheet de unidade e mantém a unidade. `UnitPickerSheet` ganhou a prop opcional `error` para isso. Runbook item (j) atualizado.
- **T-15 (decisão 22):** `LanguageSheet` foi para `src/components/` (props `title`, `options`, `value`, `onSelect`, `onClose`; teste próprio) e o Perfil passa as opções. `/welcome` ganhou o `ListItem` `Idioma` (reaproveita `account.profile.language` e `account.languages.*`, sem chave nova) entre unidade e consentimento; escolher chama `i18n.changeLanguage`, e `completeWelcome` segue lendo `i18n.language`. Teste CA-27 em `WelcomeScreen.test.tsx`; o teste CA-11 do Perfil continua passando.
- Nenhum ADR novo (as decisões seguem os ADRs 0002 e 0004 e as decisões 14 a 18 da spec).

### CA sem teste automatizado

- **CA-01 (aparelho):** o teste unitário cobre a cifra (JWT não aparece no AsyncStorage, chave no SecureStore); inspecionar o AsyncStorage no aparelho fica na T-13.
- **CA-02:** coberto por teste do `AuthSessionProvider` (cliente mockado); reabrir o app de verdade fica no roteiro (passo 4).
- **CA-21:** coberto no app (spy em `track` e `console`); a busca nos logs do Supabase é manual (T-13).
- **CA-22 (VoiceOver/TalkBack) e CA-23 (e-mail em produção; SPF/DKIM/DMARC):** manuais (T-13). O e-mail local foi conferido no Mailpit.
- **CA-07:** testado em componente; a conferência visual em iOS e Android é manual.
- **T-13 (QA em aparelho e produção): PENDENTE**, é da sessão principal com o usuário: passos 1 a 9 do roteiro contra o Supabase local (o usuário renomeia a variável no `.env`), CA-01 no aparelho, CA-22, CA-23, e, depois do deploy da migration, passos 4 a 6 do runbook no painel e o passo 10 na produção.
