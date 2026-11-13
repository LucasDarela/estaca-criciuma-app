# Fundação do app: Supabase, dados base e permissões

> **Status:** Pronta para planejamento
> **Área:** `src/lib/supabase.ts`, `src/domain/permissions.ts`, `src/features/viewer/`, `supabase/migrations/`, `supabase/tests/`, `Makefile`, CI
> **Última atualização:** 2026-11-13

## 0. Skills obrigatórias

| Skill | Quando usar |
| ----- | ----------- |
| `ecc:postgres-patterns` | Tabelas, índices, funções `security definer` e políticas RLS |
| `vercel-react-native-skills` | Provider do viewer e cliente Supabase no app |
| `ecc:react-testing` | Testes do provider e das funções de permissão |
| `ecc:accessibility` | Não há UI nesta entrega; carregar só se algum componente for tocado |

## 1. Contexto

Todas as telas do app (agenda, mural, liderança, anotações, chamados, push) dependem de três coisas que ainda não existem: o cliente do Supabase, as tabelas base (unidades, perfis e papéis) com RLS, e uma forma única de o app saber **quem está usando** (visitante, membro ou líder) e **o que essa pessoa pode fazer** em cada unidade. Esta spec cria essa base, aplicando RN-02 e RN-04 de `BUSINESS.md` e o modelo de autorização de `SECURITY.md`.

## 2. Objetivo

Existe um banco Supabase local reproduzível (`supabase start` + migrations + seed) com as 7 unidades, perfis e papéis protegidos por RLS testada, e o app expõe `useViewer()`, que diz o tipo de perfil e as permissões por unidade, a partir de funções puras testadas.

## 3. Estado atual

| Item | Situação | Destino |
| ---- | -------- | ------- |
| `supabase/config.toml` | Criado por `supabase init`, sem migrations | Manter; ajustar `project_id` para `estaca-criciuma` |
| `src/theme/theme.ts` | `UnitId` e `units` com os 7 ids de unidade | Manter; os ids do banco são os mesmos |
| `src/app/_layout.tsx` | Providers de Query, i18n e fontes | Alterar: incluir `ViewerProvider` |
| `.env.example` | Já documenta `EXPO_PUBLIC_SUPABASE_URL` e `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Manter |
| `Makefile` / CI | Sem testes de banco | Alterar: alvo `test-db` e job de CI |
| Cliente Supabase, tabelas, `src/domain`, `src/lib` | Não existem | Criar |

## 4. Tecnologias e versões

| Tecnologia | Versão | Situação | Uso nesta entrega |
| ---------- | ------ | -------- | ----------------- |
| `@supabase/supabase-js` | 2.x mais recente | adicionar | Cliente do app |
| Supabase CLI | 2.84+ (local) | instalada | `supabase start`, migrations, `supabase test db` |
| PostgreSQL / pgTAP | do stack Supabase | via CLI | Tabelas, RLS e testes SQL |
| TanStack Query | 5.x | instalada | Query do perfil e papéis do viewer |

## 5. Restrições e requisitos não funcionais

| ID | Requisito |
| -- | --------- |
| RNF-01 | RLS ligada em **todas** as tabelas criadas; nenhuma política `using (true)` em tabela com dado pessoal. |
| RNF-02 | Toda política tem teste pgTAP de acesso permitido **e** de acesso negado (visitante `anon`, conta sem papel, líder de outra unidade, `admin` onde RN-04 nega). |
| RNF-03 | O app usa só a anon key + sessão do usuário. A service role key não aparece em `src/` nem em variável `EXPO_PUBLIC_*`. |
| RNF-04 | `src/domain/permissions.ts` é TypeScript puro (sem React, sem Supabase) com cobertura de linhas ≥ 80%. |
| RNF-05 | As funções SQL de permissão são `security definer`, `stable`, com `search_path` fixo (`set search_path = public`). |
| RNF-06 | Nenhum dado real de membros no seed: pessoas fictícias ("Nome Sobrenome"). |

## 6. Escopo

### 6.1 Incluso

- Cliente Supabase em `src/lib/supabase.ts`, sem persistência de sessão (a sessão persistida entra em `auth-account`).
- Migrations: `units`, `profiles`, `memberships`, `role_grants_log`, funções `has_role`, `can_publish`, `can_lead`, `is_admin` e as políticas RLS dessas tabelas.
- Seed (`supabase/seed.sql`) com as 7 unidades reais e contas fictícias para cada papel.
- Funções puras de permissão e de tipo de perfil em `src/domain/permissions.ts`.
- `ViewerProvider` e `useViewer()` (sem sessão, o viewer é sempre visitante até `auth-account`).
- Alvo `make test-db` e job de CI que roda os testes pgTAP.
- Atualizar `SECURITY.md` e `BUSINESS.md` com o modelo de papéis final (seção 7.2).

### 6.2 Não incluso

- Login, sessão persistida, telas de conta e a tela Acessos (`auth-account`).
- Tabelas de eventos, avisos, liderança, anotações, chamados e push (cada uma na sua spec).
- Navegação por abas e componentes visuais (`design-system`).
- Deploy do Supabase self-hosted de produção.

## 7. Especificação funcional

### 7.1 Tabelas

| ID | Requisito |
| -- | --------- |
| RF-01 | `units`: `id text pk` (`estaca`, `criciuma1`, `criciuma2`, `criciuma3`, `icara`, `ararangua`, `ramoGaivota`, iguais a `UnitId`), `kind text` (`stake` \| `ward` \| `branch`), `name text` (`Estaca Criciúma`, `Ala Criciúma 1`, `Ala Criciúma 2`, `Ala Criciúma 3`, `Ala Içara`, `Ala Araranguá`, `Ramo Gaivota`), `sort_order int`. Leitura pública (`anon` e `authenticated`); sem escrita pelo app. |
| RF-02 | `profiles`: `id uuid pk` → `auth.users(id) on delete cascade`, `display_name text` (2–60), `home_unit_id text null` → `units` (só `ward`/`branch`), `locale text` (`pt-BR` \| `en-US` \| `es-MX`, padrão `pt-BR`), `organizations text[]` (padrão `{}`), `consented_at timestamptz null`, `created_at`, `updated_at`. Cada pessoa lê e altera só o próprio perfil. |
| RF-03 | `memberships`: `id uuid pk`, `user_id uuid` → `profiles on delete cascade`, `unit_id text` → `units`, `role text` (`unit_leader` \| `unit_publisher` \| `stake_leader` \| `admin`), `leadership_group text null` (`stake_presidency` \| `bishops` \| `presidents`), `granted_by uuid null`, `granted_at timestamptz`. Único por (`user_id`, `unit_id`, `role`). `stake_leader` e `admin` só com `unit_id = 'estaca'`; `unit_leader` e `unit_publisher` só com unidade `ward`/`branch`. |
| RF-04 | `role_grants_log`: `id`, `action` (`granted` \| `revoked`), `user_id`, `unit_id`, `role`, `leadership_group`, `actor_id`, `created_at`. Só inserção (via funções); leitura por `stake_leader` e `admin`. |

### 7.2 Papéis e permissões

"Membro" é qualquer pessoa autenticada; não existe linha em `memberships` para isso. Papéis elevados:

| Papel | Quem é | Publica agenda, mural e liderança | Vê e edita pautas e chamados | Gerencia acessos |
| ----- | ------ | --------------------------------- | ---------------------------- | ---------------- |
| `unit_leader` | Bispado/presidência de ramo e secretários | Da própria unidade | Da própria unidade | Não |
| `unit_publisher` | Presidentes de organizações da unidade | Da própria unidade | **Não** | Não |
| `stake_leader` | Presidência, sumo conselho e secretários da estaca | Estaca e todas as unidades | Estaca e todas as unidades | Sim, exceto `admin` |
| `admin` | Responsável técnico | Estaca e todas as unidades | **Não** (RN-04) | Sim, inclusive `admin` |

| ID | Requisito |
| -- | --------- |
| RF-05 | SQL `has_role(p_unit text, p_roles text[]) returns boolean`: verdadeiro se `auth.uid()` tem membership com `unit_id = p_unit` e `role = any(p_roles)`. |
| RF-06 | SQL `can_publish(p_unit text)`: verdadeiro para `unit_leader`/`unit_publisher` da unidade, ou qualquer `stake_leader` ou `admin`. |
| RF-07 | SQL `can_lead(p_unit text)`: verdadeiro para `unit_leader` da unidade ou qualquer `stake_leader`. Falso para `admin` e `unit_publisher`. |
| RF-08 | SQL `is_admin()` e `is_stake_leader()`: papel correspondente em qualquer unidade. |
| RF-09 | `src/domain/permissions.ts` exporta `viewerKind(session, memberships)` → `'visitor'` (sem sessão) \| `'member'` (sessão sem papel elevado, ou só `unit_publisher`) \| `'leader'` (algum `unit_leader` ou `stake_leader`) e `canPublish(memberships, unitId)`, `canLead(memberships, unitId)`, `publishableUnits(memberships)`, `leadableUnits(memberships)` com as mesmas regras de RF-06 e RF-07. `admin` sem outro papel é `'member'`. |
| RF-10 | `useViewer()` retorna `{ kind, userId, profile, memberships, canPublish(unitId), canLead(unitId), publishableUnits, leadableUnits, isAdmin, isStakeLeader }`. Sem sessão: `kind = 'visitor'` e listas vazias. Com sessão: carrega `profiles` e `memberships` do usuário via TanStack Query (chave `['viewer', userId]`). |

### 7.3 Seed e ferramentas

| ID | Requisito |
| -- | --------- |
| RF-11 | `supabase/seed.sql` insere as 7 unidades (RF-01) e contas fictícias com e-mail `@exemplo.org`: `membro@`, `publicador.icara@` (`unit_publisher`, `icara`), `bispo.criciuma1@` (`unit_leader`, `criciuma1`, grupo `bishops`), `estaca@` (`stake_leader`, grupo `stake_presidency`), `admin@` (`admin`). |
| RF-12 | `make test-db` roda `supabase test db`; sem `supabase` CLI instalado, avisa e sai com sucesso (mesmo padrão de `REQUIRE_APP`). Job `db` na CI: `supabase start`, `supabase test db`. |

### 7.4 Casos de borda

| Situação | Comportamento |
| -------- | ------------- |
| Conta com papéis em duas unidades | Permissões somadas por unidade; `viewerKind` = `'leader'` se qualquer uma for `unit_leader`. |
| Membership inválida (`stake_leader` em `icara`) | Rejeitada por `check constraint` com mensagem `invalid unit for role`. |
| Perfil excluído | Memberships removidas em cascata; o `role_grants_log` é mantido com `user_id` (sem nome). |
| Falha ao carregar o viewer (rede) | `useViewer()` mantém o último valor em cache; sem cache, trata como `'member'` sem papéis (nunca concede permissão por falha). |
| `profiles.home_unit_id = 'estaca'` | Rejeitado por constraint (a unidade frequentada é ala ou ramo). |

## 8. Especificação de UI/UX

Não se aplica: entrega sem telas.

## 9. Acessibilidade

Não se aplica: entrega sem telas.

## 10. Estrutura de arquivos esperada

```
supabase/migrations/<ts>_base_units_profiles_roles.sql   # tabelas, constraints, funções e RLS
supabase/seed.sql                                        # unidades + contas fictícias
supabase/tests/base_rls.test.sql                         # pgTAP: permitido e negado
src/lib/supabase.ts                                      # createClient com anon key
src/domain/permissions.ts                                # funções puras (RF-09)
src/domain/permissions.test.ts
src/features/viewer/ViewerProvider.tsx                   # provider + useViewer (RF-10)
src/features/viewer/ViewerProvider.test.tsx
src/app/_layout.tsx                                      # alterar: ViewerProvider
Makefile, .github/workflows/ci.yml                       # alterar: test-db e job db
.ai/docs/SECURITY.md, .ai/docs/BUSINESS.md               # alterar: modelo de papéis da seção 7.2
```

## 11. Critérios de aceitação

| ID | Cobre | Dado | Quando | Então |
| -- | ----- | ---- | ------ | ----- |
| CA-01 | RF-01 | o banco local com seed | um cliente `anon` lê `units` | recebe as 7 unidades na ordem de `sort_order`, e qualquer `insert` é negado |
| CA-02 | RF-02 | duas contas A e B | A lê e altera `profiles` | só vê e altera a própria linha; ler ou alterar B retorna 0 linhas |
| CA-03 | RF-03 | o seed | tento inserir `stake_leader` com `unit_id = 'icara'` | a constraint rejeita |
| CA-04 | RF-03, RNF-01 | uma conta sem papel elevado | tenta inserir em `memberships` | é negado pela RLS |
| CA-05 | RF-05, RF-06 | `publicador.icara` | avalio `can_publish('icara')` e `can_publish('criciuma1')` | `true` e `false` |
| CA-06 | RF-07 | `publicador.icara`, `admin` e `estaca` | avalio `can_lead('icara')` | `false`, `false` e `true` |
| CA-07 | RF-04, RF-08 | `membro` e `estaca` | leem `role_grants_log` | `membro` recebe 0 linhas; `estaca` recebe as linhas |
| CA-08 | RF-09 | sessões fictícias com cada combinação de papéis | chamo `viewerKind` e `canPublish`/`canLead` | resultados batem com a tabela da seção 7.2 (inclusive `admin` sozinho = `'member'`) |
| CA-09 | RF-10 | app sem sessão | renderizo um componente que usa `useViewer()` | `kind = 'visitor'` e `canPublish('estaca') = false` |
| CA-10 | RF-10 | sessão de `bispo.criciuma1` com resposta mockada | o viewer carrega | `kind = 'leader'`, `canLead('criciuma1') = true`, `canLead('icara') = false` |
| CA-11 | RF-10, 7.4 | sessão ativa e falha de rede sem cache | o viewer carrega | `kind = 'member'` e nenhuma permissão concedida |
| CA-12 | RF-11, RF-12, RNF-02 | Docker e Supabase CLI disponíveis | rodo `make test-db` | todos os testes pgTAP passam, inclusive os de acesso negado |
| CA-13 | RNF-03 | o repositório | procuro `service_role` em `src/` e em `EXPO_PUBLIC_` | nenhuma ocorrência |

## 12. Roteiro de QA

| Passo | Ação | Resultado esperado |
| ----- | ---- | ------------------ |
| 1 | `supabase start` e `supabase db reset` | Migrations e seed aplicados sem erro |
| 2 | No Studio local, abra `units` | 7 linhas com os nomes de RF-01 |
| 3 | `make test-db` | Todos os testes passam |
| 4 | `make check` | Passa, com cobertura ≥ 80% em `src/domain` |
| 5 | Abra o app (`make dev`) | Abre normalmente; nenhum erro de cliente Supabase no console |

## 13. Definition of Done

- [ ] `make check` passa (lint, tipos, testes, build)
- [ ] `make test-db` passa localmente e no job `db` da CI
- [ ] Todo `CA` tem teste automatizado com o ID no nome, ou justificativa de teste manual no plano
- [ ] Roteiro de QA executado sem divergências
- [ ] Registro de implementação preenchido no plano
- [ ] Nenhum segredo, dado pessoal ou log sensível introduzido (ver `.ai/docs/SECURITY.md`)
- [ ] `SECURITY.md` e `BUSINESS.md` atualizados com os papéis da seção 7.2

## 14. Decisões em aberto

Nenhuma decisão em aberto.

| # | Pergunta | Decisão | Origem |
| - | -------- | ------- | ------ |
| 1 | Divisão das specs | 10 specs; esta é a 1ª | usuário |
| 4 | Skills obrigatórias | vercel-react-native-skills, ecc:react-testing, ecc:postgres-patterns, ecc:accessibility | usuário |
| 5 | Unidade no cadastro | Opcional (`home_unit_id` nulo) | usuário |
| 6 | Papéis de unidade | `unit_leader` (vê chamados) e `unit_publisher` (só publica) | usuário |
| 13 | Grupos de liderança para push | `leadership_group` na membership | usuário |
| A1 | "Membro" precisa de linha em `memberships`? | Não; qualquer conta autenticada é membro | padrão do projeto |
| A2 | Ids das unidades | Iguais a `UnitId` de `theme.ts` | padrão do projeto |
| A3 | Viewer em falha de rede sem cache | Nunca concede permissão | padrão do projeto |

## 15. Próximos passos (fora desta entrega)

- `design-system`: componentes e navegação por abas usando `useViewer()`.
- `auth-account`: sessão persistida, login e tela Acessos (escreve em `memberships` e `role_grants_log`).
