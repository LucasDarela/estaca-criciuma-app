# Arquitetura

Estado atual: app Expo criado com a base (rotas, fontes, i18n, TanStack Query, tokens, lint e testes); nenhuma feature implementada. Versões exatas: `package.json` / `package-lock.json` — confirme lá.

Pacotes previstos no ADR 0002 mas **ainda não instalados** (entram com a spec da feature que precisa deles): `@shopify/react-native-skia` (anotações), `@sentry/react-native`. `expo-notifications` e `expo-device` entraram com `push-notifications`.

## Stack

| Camada | Tecnologia | Versão | ADR |
| ------ | ---------- | ------ | --- |
| Linguagem | TypeScript (`strict`) | 6.0 | [0002](../adrs/0002-stack-inicial.md) |
| Framework | React Native + Expo (managed, dev client), expo-router | Expo SDK 58 · RN 0.88 · React 19.3 · expo-router 58 | 0002 |
| Estado de servidor | TanStack Query (cache persistido para offline) | 5.x | 0002 |
| Banco de dados | PostgreSQL do Supabase Cloud | gerenciada pelo Supabase | 0002 |
| Sessão | `src/lib/authSession.tsx` (`AuthSessionProvider`, `useAuthSession`, `signOut`); storage cifrado em `src/lib/secureSessionStorage.ts` |
| RPC com auditoria | `supabase/migrations/*_account_rpcs.sql` (+ `supabase/tests/account.test.sql`) |
| Acesso a dados | `@supabase/supabase-js` direto (PostgREST) + RLS; RPC para lógica que precisa ser atômica | idem | 0002 |
| Autenticação | Supabase Auth (GoTrue): OTP por e-mail | idem | 0002 |
| Push | `expo-notifications` + Expo Push Service, disparado por Edge Function | idem | 0002 |
| Desenho | `@shopify/react-native-skia` | idem | 0002 |
| i18n | `i18next` + `react-i18next` + `expo-localization` (pt-BR, en-US, es-MX) | i18next 27 · react-i18next 18 | 0002 |
| Erros | `@sentry/react-native` | idem | 0002 |
| Testes | Jest (`jest-expo`) + React Native Testing Library; Maestro (E2E) | Jest 30 · RNTL 14 | 0002 |
| Hospedagem / deploy | App: EAS Build + EAS Submit. Backend: Supabase Cloud (Free, `us-east-1`, projeto único `estaca-criciuma`); deploy por `.github/workflows/deploy.yml` | — | 0004 |
| Runtime de dev/CI/EAS | Node 26 LTS (`.nvmrc` para dev e CI; `eas.json` › `build.base.node` fixa o patch nos builds da EAS — mantenha os dois alinhados), npm | 26 (EAS: 26.13.1) | 0002 |

## Arquivos de configuração relevantes

- `package.json` / `package-lock.json` — versões reais. `react-dom` fica fixado na mesma versão de `react` (19.3.0): sem isso, dependências web do expo-router puxam um `react-dom` incompatível e o `npm install` falha.
- `src/lib/database.types.ts` — tipos do banco, gerados por `make db-types` (banco local rodando). Regenere a cada migration nova.
- `app.config.ts` — configuração Expo (nome, ícones, splash, plugins). Não existe `app.json`: o `npx expo install` pode recriá-lo ao registrar plugin; mova o plugin para `app.config.ts` e apague o `app.json`.
- `eas.json` — perfis de build (`development`, `preview`, `production`)
- `tsconfig.json` (`strict: true`, `types: ["jest"]` — o TS 6 não carrega `@types/*` sozinho — e alias `@/` → `src/`), `eslint.config.js`, `.prettierrc` / `.prettierignore` (Markdown fica fora do Prettier), `jest.config.js` + `jest.setup.ts` (locale pt-BR nos testes)
- `supabase/config.toml`, `supabase/migrations/`, `supabase/functions/`
- `.nvmrc`, `.env.example`, `Makefile`, `.github/workflows/ci.yml`

## Estrutura de pastas

```
src/
  app/                    Rotas do expo-router: SÓ arquivos de rota (re-export de telas). Tudo aqui vai para o bundle
    index.tsx             Redireciona para /agenda
    (tabs)/               Abas: agenda, board, leadership, notes, callings, profile, sign-in (telas provisórias até cada feature chegar)
    dev/components.tsx    Catálogo de componentes, só em __DEV__
    _layout.tsx           Providers: Query, sessão (Auth), i18n, fontes, splash (Sentry entra com sua spec)
  features/<feature>/     Uma pasta por área: calendar, board, leadership, notes, callings, notifications
    calendar/             Aba Agenda (mês, semana, dia), detalhe do evento e ações do sistema (mapa, calendário, compartilhar)
    auth/                 Entrar, código, Boas-vindas e SessionEffects (consentimento, idioma, sessão expirada)
    account/              Perfil, Acessos e os sheets (nome, idioma, exclusão, conceder acesso)
    navigation/           Layout das abas por perfil (TabsLayout), avatar do cabeçalho e redirecionamento da raiz
    placeholder/          Telas "em breve" das abas sem feature
    dev/                  Catálogo de componentes (/dev/components)
    components/           Componentes específicos da feature
    api.ts                Queries/mutations TanStack + chamadas Supabase da feature
    hooks.ts              Hooks da feature
    <Name>Screen.tsx      Telas, com teste ao lado; a rota em src/app só re-exporta
  components/             Design system compartilhado (Button, EventCard, TabBar... ver DESIGN_SYSTEM.md)
  domain/                 Tipos e regras puras do domínio (sem React, sem Supabase): permissões, etapas de chamado, datas
  lib/                    Infra compartilhada: supabase client, query client, sentry, notifications, storage
  i18n/                   Configuração do i18next e locales/{pt-BR,en-US,es-MX}.json
  theme/                  theme.ts (tokens)
supabase/
  migrations/             SQL versionado: tabelas, RLS, funções (has_role)
  functions/              Edge Functions (Deno): register-device, send-push; _shared/ = núcleo puro testado no Jest
  seed.sql                Dados fictícios para dev local
.maestro/                 Fluxos E2E (YAML)
assets/                   Fontes, ícones, splash
```

## Camadas e dependências

```
app (rotas) → features → components, domain, lib, i18n, theme
components → theme, i18n            (nunca features, nunca lib/supabase)
domain     → nada                   (TypeScript puro, testável sem mocks)
lib        → domain, theme
```

- Uma feature **não importa** outra feature. O que for compartilhado sobe para `components`, `domain` ou `lib`.
- Só `features/*/api.ts` e `lib/` falam com o Supabase. Componentes recebem dados por props/hooks.
- Autorização é garantida pela **RLS no banco**. Checagens no app (`domain/permissions.ts`) só escondem UI; nunca são a única barreira.
- Edge Functions usam a service role key; o app usa apenas a anon key + sessão do usuário.

## Padrões de referência

| Para criar... | Siga o padrão de |
| ------------- | ---------------- |
| Rota | `src/app/index.tsx` (re-export da tela) |
| Tela | `src/features/placeholder/ComingSoonScreen.tsx` (tokens + `t()` + `accessibilityRole`) |
| Teste de componente | `src/features/navigation/TabsLayout.test.tsx` |
| Teste unitário (função pura) | `src/i18n/resolveLanguage.test.ts` |
| Texto traduzido | `src/i18n/locales/*.json` (paridade verificada por `src/i18n/locales.test.ts`) |
| Componente do design system | `src/components/Button.tsx` (+ `Button.test.tsx`) |
| Sessão | `src/lib/authSession.tsx` (`AuthSessionProvider`, `useAuthSession`, `signOut`); storage cifrado em `src/lib/secureSessionStorage.ts` |
| RPC com auditoria | `supabase/migrations/*_account_rpcs.sql` (+ `supabase/tests/account.test.sql`) |
| Acesso a dados | `src/features/viewer/api.ts` (cliente de `src/lib/supabase.ts`, tipos de `src/lib/database.types.ts`) |
| Migration com RLS | `supabase/migrations/*_base_units_profiles_roles.sql` |
| Teste de RLS | `supabase/tests/base_rls.test.sql` (pgTAP; `make test-db`) |
| Acesso derivado de chamado | O banco soma o `access` dos chamados ativos da pessoa (`member_calls` → `calling_catalog`) em `my_accesses()`, e `has_role`, `can_publish` e `can_lead` derivam dele (`supabase/migrations/*_member_calls.sql`). O app só espelha a regra em `src/domain/callings.ts` (`membershipsFromCalls`) e `src/domain/permissions.ts`. Nova regra de acesso = novo valor de `calling_catalog.access`, nunca papel escrito à mão. |
| Edge Function | ADR [0006](../adrs/0006-edge-functions-nucleo-puro.md). `supabase/functions/<nome>/index.ts` (Deno) só liga HTTP, `supabase-js` e `fetch`; a lógica fica em `supabase/functions/_shared/<nome>.ts`, TypeScript **sem imports**, com dependências injetadas e teste ao lado (roda no Jest). Regras de dados (permissão, destinatários, limites) ficam em funções SQL `security definer` executáveis só pela `service_role` (`push_prepare`, `push_recipients`...), testadas por pgTAP. Referência: `register-device` e `send-push` (+ `supabase/tests/push.test.sql`). |
| Histórico de notificações e lidos | `src/lib/notificationInbox.ts`: `useInbox` junta `my_notifications` (servidor) e os lembretes do `reminderLog` (aparelho); a Agenda (ponto do sino) e a tela Notificações usam o mesmo dado, por isso fica em `lib`. Chave `['inbox', ...]`, nunca `public`. O estado de lido é por pessoa no servidor (`notification_reads`); de visitante e de lembretes, só ids no aparelho. |
| Lembretes de anotações no histórico | `src/lib/reminderLog.ts` (cifrado). A spec `notes` grava com `addReminder`; `push-notifications` só lê. |
| Cache público persistido | `src/lib/queryPersistence.ts`: o `PersistQueryClientProvider` (em `_layout.tsx`) grava no AsyncStorage só as queries cuja chave começa com `'public'` (RNF-01), por 7 dias. Query pública nova: chave `['public', ...]`, `gcTime` ≥ `PERSIST_MAX_AGE_MS` e dado serializável em JSON (`Date` vira texto no disco: guarde ISO e converta no `select`, como `src/features/calendar/api.ts`). Dado pessoal nunca usa esse prefixo. A conectividade vem de `src/lib/network.ts` (`useIsOnline`, `wireOnlineManager`). |
| Organograma | `src/domain/orgChart.ts` monta as árvores da estaca e das unidades (função pura, com teste) a partir de duas listas públicas, `['public','leadership','members']` e `['public','leadership','links']`, buscadas por `useOrgChart` (2 chamadas por abertura da aba, `src/features/leadership/api.ts`). Telefones são outra query, `['leadership','phones',userId]`, **fora** do prefixo `public`: só com sessão, só quando uma ficha abre, e nunca vão para o disco. As linhas da árvore são `View`s ocultas do leitor de tela; com `fontScale ≥ 1.3` as colunas empilham. Máscara, validação e links de telefone: `src/domain/phone.ts`. |
| Seed de demonstração | `supabase/seeds/org_chart_demo.sql` (depois de `supabase/seed.sql`, por `sql_paths` em `config.toml`): organograma fictício com contas `organograma.NN@exemplo.org`. Os testes pgTAP apagam essas contas na primeira linha, dentro da transação, para não mudar as contagens das 5 contas base. |
| Datas | `src/domain/time.ts`: data civil e hora em Brasília com offset fixo UTC−3 (ADR 0005). Nunca use os getters locais de `Date`; rótulos por `formatCivil` / `formatTime`. A suíte roda com `TZ=Europe/Lisbon`. |
| Teste e2e | `.maestro/agenda-publica.yaml` (primeiro fluxo; `make test-e2e`, local, com Expo Go) |

## Integrações externas

| Serviço | Para quê | Onde está o cliente | Variáveis de ambiente |
| ------- | -------- | ------------------- | --------------------- |
| Supabase Cloud (API, Auth, Storage) | Dados, login, imagens do mural | `src/lib/supabase.ts` | `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` |
| Expo Push Service | Entrega de push (APNs/FCM) | `supabase/functions/send-push` | `EXPO_ACCESS_TOKEN` (secret da function) |
| Google / Apple Sign-In (futuro, fora de `auth-account`) | Login social | Supabase Auth + `expo-auth-session` / `expo-apple-authentication` | Configurados no GoTrue (servidor) |
| Sentry | Crashes e erros do app | `src/lib/sentry.ts` | `EXPO_PUBLIC_SENTRY_DSN`, `SENTRY_AUTH_TOKEN` (só build) |
| EAS (Expo) | Builds e envio às lojas | `eas.json` | `EXPO_TOKEN` (CI de release) |

## Ambientes

| Ambiente | URL | Deploy | Observações |
| -------- | --- | ------ | ----------- |
| local | `http://localhost:54321` (Supabase CLI) | `make dev` + `supabase start` | Seed fictício em `supabase/seed.sql` |
| preview | `https://<project-ref>.supabase.co` (o mesmo projeto da produção) | EAS Build perfil `preview` (TestFlight / teste interno) | Para líderes testarem antes do lançamento. Não há homologação remota: usa o backend de produção, com dados reais |
| produção | `https://<project-ref>.supabase.co` | EAS Build `production` + EAS Submit; backend: `deploy-prod`, manual com aprovação e dump prévio | Backup diário por `backup.yml` (ver `SECURITY.md` e `docs/runbooks/backup.md`) |
