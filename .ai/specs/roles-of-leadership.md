# Chamados da liderança: catálogo, acesso por chamado e organograma automático

> **Status:** Pronta para planejamento
> **Área:** `supabase/migrations/`, `src/domain/permissions.ts`, `src/domain/callings.ts`, `src/features/account/` (Acessos, Meus chamados, Catálogo de chamados), rotas `/profile/access`, `/profile/callings-catalog/*`
> **Última atualização:** 2026-11-15

## 0. Skills obrigatórias

| Skill | Quando usar |
| ----- | ----------- |
| `ecc:postgres-patterns` | Tabelas, RLS, funções de permissão reescritas e migração dos acessos |
| `ecc:database-migrations` | Migração de `memberships` para chamados sem perder o `admin` |
| `vercel-react-native-skills` | Telas de Acessos, Meus chamados e Catálogo |
| `ecc:accessibility` | Listas com busca, chips e confirmações |
| `ecc:react-testing` | Testes de tela e de fluxo |

## 1. Contexto

Hoje o acesso de um líder é escolhido à mão em Acessos, como "Papel + Grupo" (`auth-account`), e só existem 3 grupos de liderança. Na Igreja, quem define a responsabilidade de alguém é o **chamado** (Manual Geral, capítulos 6 a 15 e 30).

Esta spec cria o catálogo de chamados da estaca, das alas e do ramo. Em Acessos, a liderança passa a dar um **chamado** à pessoa, e o app deduz dele:
- o acesso (RN-02, RN-04);
- os grupos de aviso (RN-08);
- a entrada no organograma público (RN-01).

Ter um chamado revela a crença religiosa da pessoa, que é dado sensível (`SECURITY.md`). Por isso, aparecer no organograma exige o consentimento da própria pessoa.

## 2. Objetivo

Ao final desta entrega:
- O catálogo inicial (apêndice A) está no banco, e o admin consegue editá-lo.
- Em Acessos, a liderança da estaca concede e remove chamados.
- O acesso de cada pessoa é a soma dos níveis dos chamados dela, e existe o nível novo "Publicação da estaca".
- A pessoa vê os próprios chamados no Perfil e escolhe se aparece no organograma.
- As specs `leadership`, `callings` e `push-notifications` passam a usar o catálogo.

## 3. Estado atual

| Item | Situação | Destino |
| ---- | -------- | ------- |
| `memberships` (`role`, `leadership_group`) | `app-foundation` + `auth-account` | Alterar: guarda só `admin`; os outros papéis passam a vir de `member_calls` (RF-08) |
| `has_role`, `can_publish`, `can_lead`, `is_stake_leader`, `is_admin` | `app-foundation` | Reescrever para derivar de `member_calls` + `calling_catalog.access` (RF-09), com os mesmos nomes e assinaturas |
| `grant_role`, `revoke_role`, `list_access` | `auth-account` | Substituir por `grant_calling`, `revoke_calling`, `list_access` (nova forma) e `grant_admin`/`revoke_admin` |
| `role_grants_log` | `app-foundation` | Alterar: ganha a coluna `calling_id text null` |
| Regra de unidade (`auth-account` RF-16a, RF-12, decisões 19 e 20) e trigger `profiles_guard_home_unit` | `auth-account` | Manter, agora aplicada a chamados (RF-10, RF-11) |
| Telas Acessos e `GrantAccessSheet` | `auth-account` | Alterar: "Papel + Grupo" vira "Chamado" (RF-12 a RF-14) |
| `src/domain/permissions.ts` (`Role`, `Membership`, `viewerKind`) | `app-foundation` | Alterar: nível novo `stake_publisher`; membership derivada de chamados |
| Specs `leadership`, `callings`, `push-notifications` | Pronta para planejamento | Ajustadas nesta data para usar o catálogo (decisões 15 e 16) |
| `.ai/specs/roles-of-leadership.md` (rascunho do usuário) | Lista de chamados do Manual Geral | Vira o apêndice A |

## 4. Tecnologias e versões

| Tecnologia | Versão | Situação | Uso nesta entrega |
| ---------- | ------ | -------- | ----------------- |
| Supabase (Postgres + RLS) | do stack | instalada | Catálogo, chamados das pessoas, funções de permissão |
| TanStack Query, expo-router | do stack | instaladas | Telas |

Nenhuma dependência nova.

## 5. Restrições e requisitos não funcionais

| ID | Requisito |
| -- | --------- |
| RNF-01 | `calling_catalog`, `member_calls` e `calling_catalog_log` nascem com RLS e políticas explícitas, com teste de acesso negado. Toda escrita passa por uma RPC `security definer` que revalida quem chama. |
| RNF-02 | O acesso nunca é decidido só no app. `has_role`, `can_publish` e `can_lead` derivam do banco; `src/domain/permissions.ts` só espelha a regra para esconder interface. |
| RNF-03 | Ninguém aparece no organograma público sem ter aceitado (`org_chart_consent = 'accepted'`). Uma mudança no catálogo nunca publica ninguém sozinha. |
| RNF-04 | Mudar o `access` de um chamado vale na hora, no banco, para todos que o têm. O app reflete a mudança na próxima carga do viewer (até 5 min ou ao voltar ao app). |
| RNF-05 | Logs e eventos levam só ids: `calling_granted`, `calling_revoked`, `calling_catalog_saved`, `org_chart_consent_changed`. |
| RNF-06 | `export_my_data` (decisão 16 de `auth-account`) passa a incluir `calls`: `[{ unit_id, calling_id, calling_name, org_chart_consent, granted_at }]`. A exclusão de conta apaga `member_calls` em cascata. |

## 6. Escopo

### 6.1 Incluso

- Tabelas `calling_catalog`, com os chamados do apêndice A nos 3 idiomas, e `calling_catalog_log`.
- Tabela `member_calls` (chamados de cada pessoa) e migração dos acessos atuais para ela.
- Nível de acesso novo `stake_publisher` ("Publicação da estaca").
- Funções de permissão derivadas dos chamados.
- Acessos: conceder e remover **chamados**; `Administração` continua separada.
- Perfil: seção `Meus chamados`, com consentimento para o organograma.
- Perfil: `Catálogo de chamados`, só para `admin` (lista, criação e edição).
- Função pública `org_chart_members()`, que a spec `leadership` usa para exibir as pessoas.
- Ajuste de texto nas specs `leadership`, `callings` e `push-notifications`.

### 6.2 Não incluso

- As telas do organograma, do acompanhamento de Chamados e dos avisos. Cada uma fica na própria spec, já ajustada.
- Designações (um sumo conselheiro designado para uma ala ou uma tarefa). Continuam em `designations`, na spec `leadership`.
- O nível "Grupo" do Manual Geral, porque a estaca não tem grupos.
- Edição dos grupos de aviso. Os 13 de RF-04 ficam fixos nesta entrega.
- Concessão de chamados pelo bispado. Continua só com `stake_leader` e `admin` (decisão 7 de `auth-account`).
- Histórico dos chamados anteriores da pessoa. Remover um chamado apaga a linha, e o registro fica só em `role_grants_log`.

## 7. Especificação funcional

### 7.1 Catálogo

| ID | Requisito |
| -- | --------- |
| RF-01 | Tabela `calling_catalog`:<br>• `id text pk`: a chave do apêndice A, ou `gen_random_uuid()::text` para chamados novos<br>• `name_pt text` (2–80, obrigatório), `name_en text null` e `name_es text null` (até 80 cada)<br>• `level text`: `stake` \| `ward` \| `branch` \| `ward_branch`<br>• `access text`: `none` \| `unit_publisher` \| `unit_leader` \| `stake_publisher` \| `stake_leader`<br>• `notify_group text null`: um dos 13 de RF-04<br>• `org_chart_section text null`: uma de RF-05; `null` = não aparece no organograma<br>• `sort_order int`, `active boolean default true`, `updated_at`, `updated_by uuid null`<br>• Único: (`level`, `lower(name_pt)`) |
| RF-02 | O banco valida a coerência:<br>• `access` `stake_publisher` ou `stake_leader` só com `level = 'stake'`; `unit_publisher` ou `unit_leader` só com `level <> 'stake'`.<br>• As seções `stake_*` só com `level = 'stake'`; as outras, só fora de `stake`. |
| RF-03 | O nome aparece no idioma da interface. Sem tradução (`null`), aparece o `name_pt`. |
| RF-04 | Grupos de aviso (`notify_group`) e rótulos:<br>• `stake_presidency`: `Presidência da estaca`<br>• `high_council`: `Sumo conselho`<br>• `bishoprics`: `Bispados`<br>• `elders_quorum_presidency`: `Presidências do Quórum de Élderes`<br>• `relief_society_presidency`: `Presidências da Sociedade de Socorro`<br>• `young_women_presidency`: `Presidências das Moças`<br>• `primary_presidency`: `Presidências da Primária`<br>• `sunday_school_presidency`: `Presidências da Escola Dominical`<br>• `clerks`: `Secretários`<br>• `missionaries`: `Missionários`<br>• `temple_family_history_workers`: `Consultores de Templo e História da Família`<br>• `music`: `Música`<br>• `young_single_adult_leaders`: `Líderes de JAS` |
| RF-05 | Seções do organograma (as mesmas de RF-04 da spec `leadership`):<br>• Estaca: `stake_presidency` `Presidência da estaca`, `high_council` `Sumo conselho`, `stake_clerks` `Secretários da estaca`, `stake_organizations` `Organizações da estaca`.<br>• Unidade: `bishopric` `Bispado` (no ramo, `Presidência do ramo`), `unit_clerks` `Secretários`, `unit_organizations` `Organizações`. |
| RF-06 | Leitura do catálogo: pública (`anon` e `authenticated`), só com `active = true`. O `admin` lê também os inativos.<br>Escrita: só por `save_calling(...)`, exclusiva do `admin`. Na mesma transação, grava `calling_catalog_log` (`calling_id`, `actor_id`, `before jsonb`, `after jsonb`, `created_at`). |
| RF-07 | `save_calling` recusa com estes códigos:<br>• `name_taken`: nome repetido no mesmo nível<br>• `level_locked`: mudança de `level` num chamado que alguém tem<br>• `in_use`: desativar um chamado que alguém tem<br>• `invalid_access` ou `invalid_section`: violação de RF-02 |

### 7.2 Chamados das pessoas e acesso

| ID | Requisito |
| -- | --------- |
| RF-08 | Tabela `member_calls`:<br>• `id uuid pk`<br>• `user_id` → `profiles on delete cascade`<br>• `unit_id` → `units`<br>• `calling_id` → `calling_catalog`<br>• `granted_by uuid null`, `granted_at`<br>• `org_chart_consent text`: `pending` \| `accepted` \| `declined`, padrão `pending`; fica `null` quando o chamado não tem `org_chart_section`<br>• `org_chart_consent_at timestamptz null`<br>• Único: (`user_id`, `unit_id`, `calling_id`)<br>Leitura: cada pessoa lê as próprias linhas; `stake_leader` e `admin` leem todas.<br>`memberships` passa a aceitar só `role = 'admin'`. |
| RF-09 | O acesso de uma pessoa é a soma dos `access` dos chamados ativos dela, mais o `admin` que vem de `memberships`. Nas funções:<br>• `has_role(unit, roles)`: algum chamado na `unit` com `access` em `roles`. Para `stake_leader` e `stake_publisher`, a unidade é sempre `estaca`.<br>• `can_publish(unit)`: `unit_leader` ou `unit_publisher` na unidade; `stake_leader` em qualquer unidade; `stake_publisher` só em `estaca`; `admin` em qualquer unidade.<br>• `can_lead(unit)`: regra sem mudança (`unit_leader` da unidade ou `stake_leader`).<br>• `viewerKind`: `leader` com `unit_leader` ou `stake_leader`; `member` nos demais casos com sessão. |
| RF-10 | Unidade do chamado (decisão 19 de `auth-account`, mantida):<br>• Chamado de `level` `stake` só em `estaca`.<br>• Chamado `ward`, `branch` ou `ward_branch` só numa unidade de tipo compatível que seja igual a `profiles.home_unit_id`.<br>• Todo chamado exige `home_unit_id` informado.<br>Códigos de recusa: `no_home_unit`, `wrong_unit`, `invalid_unit_for_calling`. |
| RF-11 | Troca de unidade no Perfil (decisão 20 de `auth-account`, mantida):<br>• bloqueada para quem tem qualquer chamado de unidade;<br>• para `Não informada`, bloqueada para quem tem qualquer chamado ou `admin`.<br>Mensagem: `Para mudar de unidade, peça à liderança da estaca para remover seus acessos primeiro.` |

### 7.3 Acessos

| ID | Requisito |
| -- | --------- |
| RF-12 | `/profile/access` (`stake_leader` e `admin`): lista agrupada por unidade, na ordem de `unitOrder`. Cada item tem `Avatar`, o nome e o subtítulo `{e-mail} · {chamado}`. Quem tem `admin` aparece em Estaca, com `Administração`. |
| RF-13 | `Conceder acesso` abre um sheet com:<br>• `E-mail da conta`, com as regras de RF-03 de `auth-account`.<br>• `Unidade`: Estaca + 6.<br>• `Chamado`: abre uma lista com o `SearchField` `Buscar chamado`. Mostra só os chamados ativos compatíveis com a unidade, em `sort_order`. Cada item traz o nome e, se `access <> 'none'`, o rótulo do acesso como subtítulo (`Liderança da estaca`, `Publicação da estaca`, `Liderança da unidade`, `Publicação da unidade`). Para o `admin`, a lista da Estaca começa com `Administração`.<br>• Botão `Conceder`.<br>Mensagens:<br>• sucesso: toast `Chamado concedido`;<br>• e-mail sem conta: `Nenhuma conta com este e-mail. Peça para a pessoa entrar no app primeiro.`;<br>• chamado repetido: `Esta pessoa já tem este chamado nesta unidade.`;<br>• `no_home_unit`: `Esta pessoa precisa informar a unidade no Perfil antes de receber um acesso.`;<br>• `wrong_unit`: `Esta pessoa frequenta outra unidade. Papéis de unidade só podem ser dados na unidade dela.` |
| RF-14 | Remover: tocar no item abre o `ConfirmSheet` `Remover chamado?` / `{nome} deixa de ter o chamado "{chamado}" em {unidade}.` / `Remover` (`danger`) / `Cancelar`. Depois, toast `Chamado removido`.<br>Ninguém remove o próprio chamado: `Você não pode remover o próprio acesso.` |
| RF-15 | Quem concede o quê:<br>• `stake_leader` concede e remove qualquer chamado, inclusive os de `access = 'stake_leader'`.<br>• Só o `admin` concede ou remove `Administração`.<br>• Toda concessão e remoção grava `role_grants_log` com `calling_id`; `role` recebe o `access` do chamado naquele momento. `Administração` grava `role = 'admin'` e `calling_id` nulo. |

### 7.4 Meus chamados e organograma

| ID | Requisito |
| -- | --------- |
| RF-16 | Seção `Meus chamados` no Perfil (só aparece com pelo menos um chamado): um `ListItem` por chamado, com o nome e a unidade. Nos chamados com `org_chart_section`, `trailing` `switch` com o rótulo `Mostrar no organograma`; ligado = `accepted`. |
| RF-17 | Com algum chamado em `pending`, o topo do Perfil mostra um cartão:<br>• texto: `Você recebeu o chamado {chamado} em {unidade}. Quer que seu nome e seu chamado apareçam no organograma público da estaca?`;<br>• `Mostrar` (`primary`): grava `accepted` e mostra o toast `Seu nome aparece no organograma.`;<br>• `Agora não` (`ghost`): grava `declined`, e o cartão some.<br>Com mais de um chamado pendente, aparece um cartão de cada vez. |
| RF-18 | `org_chart_members()`: função pública (`anon` e `authenticated`), `security definer`. Retorna `member_call_id`, `unit_id`, `section`, `calling_id`, `calling_name_pt`, `calling_name_en`, `calling_name_es`, `display_name` e `sort_order`. Só entram chamados ativos com `org_chart_section` e `org_chart_consent = 'accepted'`. Nunca retorna e-mail, `user_id` nem telefone. |
| RF-19 | `set_org_chart_consent(member_call_id, accepted boolean)`: só o dono do chamado pode chamar. Grava `org_chart_consent_at = now()`. |

### 7.5 Catálogo de chamados (admin)

| ID | Requisito |
| -- | --------- |
| RF-20 | Perfil › `Catálogo de chamados` (só `admin`) abre `/profile/callings-catalog`, com:<br>• `ScreenHeader` `Catálogo de chamados` e a ação `add` `Novo chamado`;<br>• `SearchField` `Buscar chamado`: a partir de 2 caracteres, nos 3 nomes, ignorando maiúsculas e acentos;<br>• `Segmented` `Estaca` \| `Alas e ramo`;<br>• lista em `sort_order`, com o nome como título e `{nível} · {acesso}` como subtítulo; os inativos vão para o fim, com `StatusTag` `Inativo`;<br>• sem resultado: `Nenhum chamado encontrado para "{termo}".` |
| RF-21 | Formulário `/profile/callings-catalog/[id]` (ou `new`):<br>• `Nome (português)` (2–80), `Nome (inglês)` e `Nome (espanhol)` (opcionais, até 80, com `trim`);<br>• `Nível`: chips `Estaca`, `Ala`, `Ramo`, `Ala e ramo`;<br>• `Acesso`: chips válidos para o nível. Estaca: `Nenhum`, `Publicação da estaca`, `Liderança da estaca`. Os outros: `Nenhum`, `Publicação da unidade`, `Liderança da unidade`;<br>• `Grupo de aviso`: chips `Nenhum` + os de RF-04;<br>• `Seção do organograma`: `Não aparece` + as seções do nível (RF-05);<br>• `Ativo` (`Switch`);<br>• botão `Salvar`.<br>Mensagens de erro:<br>• `Informe o nome.`<br>• `Use entre 2 e 80 caracteres.`<br>• `Já existe um chamado com este nome neste nível.`<br>• `Não dá para mudar o nível de um chamado que alguém tem.`<br>• `Remova este chamado das {n} pessoas que o têm antes de desativá-lo.`<br>Sucesso: toast `Chamado salvo` e volta para a lista. |
| RF-22 | Mudar o `Acesso` de um chamado que alguém tem pede confirmação: `ConfirmSheet` `Mudar o acesso?` / `{n} pessoas com este chamado passam a ter "{acesso}".` / `Mudar` / `Cancelar`. |

### 7.6 Migração

| ID | Requisito |
| -- | --------- |
| RF-23 | A migração cria e popula o catálogo com o apêndice A. `name_en` e `name_es` usam os nomes oficiais do Manual Geral em cada idioma.<br>Depois, converte as linhas de `memberships` que não são `admin`:<br>• `stake_leader` + `stake_presidency` → `stake_first_counselor`;<br>• `stake_leader` sem grupo → `high_councilor`;<br>• `unit_leader` + `bishops` → `bishop` (ala) ou `branch_president` (ramo);<br>• `unit_leader` sem grupo → `unit_clerk`;<br>• `unit_publisher` → `unit_activities_committee_chair`.<br>Todas entram com `org_chart_consent = 'pending'`. Em seguida, a migração apaga essas linhas de `memberships`, remove a coluna `leadership_group` e grava `role_grants_log` (`granted`, `actor_id` nulo). |
| RF-24 | O seed local (`supabase/seed.sql`) dá chamados às contas fictícias: o bispo recebe `bishop` em `criciuma1`; o publicador, `relief_society_president` em `icara`; a conta estaca, `stake_first_counselor`. O admin continua em `memberships`. |

### 7.7 Casos de borda

| Situação | Comportamento |
| -------- | ------------- |
| Admin desativa um chamado que ninguém tem | O chamado some das listas de concessão; quem já o teve fica só no log |
| Chamado perde a `org_chart_section` | Some do organograma, mas o consentimento gravado fica guardado. Se a seção voltar, reaparece só para quem tinha `accepted` |
| Pessoa toca em `Agora não` e depois liga o switch | Passa a `accepted` e aparece no organograma |
| O mesmo chamado em duas unidades (ex.: `Secretário`) | Não acontece: pela RF-10, a pessoa só frequenta uma unidade |
| Duas pessoas concedem o mesmo chamado ao mesmo tempo | A restrição única (`user_id`, `unit_id`, `calling_id`) recusa a segunda: `Esta pessoa já tem este chamado nesta unidade.` |
| Admin muda o acesso enquanto a pessoa usa o app | As abas se ajustam na próxima carga do viewer (RNF-04, RF-19 de `design-system`) |
| Falha de rede ao salvar ou conceder | Toast `Sem conexão. Verifique a internet e tente de novo.`; nada muda |

## 8. Especificação de UI/UX

- **Acessos:** mesmo layout da `auth-account`. No sheet de concessão, `Chamado` é um `ListItem` com chevron que abre um segundo `Sheet`, com `SearchField` e `ListItem`s.
- **Meus chamados:** seção do Perfil logo abaixo de `Unidade` e `Idioma`, com overline `MEUS CHAMADOS`.
- **Cartão de consentimento:** fundo `surface` com `elevation 1` e `radius.card`; botões lado a lado (`size="compact"`).
- **Catálogo:** formulário em tela cheia, com `FilterChip` de seleção única para Nível, Acesso, Grupo e Seção.
- Só componentes de `DESIGN_SYSTEM.md` e tokens de `theme.ts`.

## 9. Acessibilidade

| ID | Requisito |
| -- | --------- |
| RNF-07 | Cada item de Acessos é anunciado como `{nome}, {chamado}, {unidade}`. |
| RNF-08 | O switch é anunciado com o nome do chamado: `Mostrar {chamado} no organograma`. |
| RNF-09 | Cada linha de chips é um grupo com rótulo (`Nível`, `Acesso`, `Grupo de aviso`, `Seção do organograma`), e o chip marcado é anunciado como selecionado. |
| RNF-10 | Alvos de toque com no mínimo 44 pt; a lista de chamados funciona com fonte em 1,6×. |

## 10. Estrutura de arquivos esperada

```
supabase/migrations/<ts>_calling_catalog.sql      # catálogo + seed do apêndice A + log + RPC save_calling
supabase/migrations/<ts>_member_calls.sql         # member_calls, permissões reescritas, grant/revoke, migração, org_chart_members
supabase/tests/callings.test.sql
supabase/seed.sql                                 # alterar: RF-24
src/domain/callings.ts (+ teste)                  # tipos, rótulos de acesso/grupo/seção, filtro por nível
src/domain/permissions.ts (+ teste)               # alterar: stake_publisher
src/features/viewer/api.ts                        # alterar: membership derivada de member_calls
src/features/account/AccessScreen.tsx, GrantAccessSheet.tsx, CallingPickerSheet.tsx (+ testes)
src/features/account/MyCallingsSection.tsx, OrgChartConsentCard.tsx (+ testes)
src/features/account/CallingsCatalogScreen.tsx, CallingFormScreen.tsx (+ testes)
src/features/account/api.ts                       # alterar
src/app/profile/callings-catalog/index.tsx, src/app/profile/callings-catalog/[id].tsx
src/i18n/locales/*.json                           # callings.*, account.access.* (ajustes)
.ai/docs/SECURITY.md, BUSINESS.md                 # alterar: modelo de permissão por chamado
```

## 11. Critérios de aceitação

| ID | Cobre | Dado | Quando | Então |
| -- | ----- | ---- | ------ | ----- |
| CA-01 | RF-01, RF-04, RF-05, RF-23 | o banco migrado | conto o catálogo | todos os chamados do apêndice A, ativos, com `name_pt`, `name_en` e `name_es` preenchidos e `access`, `notify_group` e `org_chart_section` iguais aos do apêndice |
| CA-02 | RF-02, RF-07 | `admin` | salvo um chamado `Estaca` com acesso `Publicação da unidade` | `invalid_access`; nada muda |
| CA-03 | RF-06 | visitante | leio o catálogo | só os ativos; escrever é negado |
| CA-04 | RF-06 | `stake_leader` | chamo `save_calling` | negado |
| CA-05 | RF-09 | pessoa só com `relief_society_president` em `icara` | `can_publish('icara')`, `can_lead('icara')`, `can_publish('criciuma1')` | `true`, `false`, `false` |
| CA-06 | RF-09 | pessoa com `stake_relief_society_president` | `can_publish('estaca')`, `can_publish('icara')`, `can_lead('estaca')` | `true`, `false`, `false` |
| CA-07 | RF-09 | pessoa com `high_councilor` e `sunday_school_teacher` | carrego o viewer | `leader`, com a aba Chamados |
| CA-08 | RF-10 | pessoa de `criciuma1` | concedo `bishop` em `criciuma2`; `bishop` em `criciuma1`; `branch_president` em `criciuma1`; `high_councilor` em `estaca` | `wrong_unit`; ok; `invalid_unit_for_calling`; ok |
| CA-09 | RF-12, RF-13, RF-15 | conta `estaca` | concedo `Presidente da Primária` em `Ala Içara` a uma pessoa de Içara | toast `Chamado concedido`; a linha aparece e `role_grants_log` tem `calling_id` |
| CA-10 | RF-13 | conta `estaca`, unidade `Ramo Gaivota` | abro a lista de chamados | aparecem `Presidente do Ramo` e os de `Ala e ramo`; não aparece `Bispo` |
| CA-11 | RF-13, RF-15 | conta `estaca` | abro a lista da Estaca | `Administração` não aparece; para `admin`, aparece em primeiro |
| CA-12 | RF-14 | conta `estaca` | removo um chamado e confirmo | toast `Chamado removido`; o acesso some na próxima carga |
| CA-13 | RF-16, RF-17, RF-19 | pessoa que recebeu `bishop` | abro o Perfil | vejo o cartão; com `Mostrar`, a pessoa aparece em `org_chart_members()` e o switch fica ligado |
| CA-14 | RF-17, RNF-03 | pessoa com chamado `pending` | toco em `Agora não` | não aparece em `org_chart_members()`; o switch fica desligado |
| CA-15 | RF-18 | visitante | chamo `org_chart_members()` | só `accepted`, sem e-mail nem `user_id` |
| CA-16 | RF-16 | pessoa com `sunday_school_teacher` (sem seção) | abro `Meus chamados` | o chamado aparece sem switch; nenhum cartão |
| CA-17 | RF-20 | `admin` | busco `primaria` | aparecem os chamados da Primária, sem diferenciar acento |
| CA-18 | RF-21, RF-07 | `admin`, chamado que alguém tem | desativo e salvo | `Remova este chamado das 1 pessoas que o têm antes de desativá-lo.`; continua ativo |
| CA-19 | RF-22, RNF-04 | `admin`, `relief_society_counselor_1` com 1 pessoa | mudo o acesso para `Publicação da unidade` e confirmo | `can_publish` da pessoa passa a `true`; `calling_catalog_log` tem `before` e `after` |
| CA-20 | RF-20 | `stake_leader` | abro o Perfil | não há `Catálogo de chamados`; `/profile/callings-catalog` mostra `Acesso restrito` |
| CA-21 | RF-23, RF-24 | banco com as `memberships` antigas do seed anterior | rodo a migração | cada linha vira o chamado de RF-23; o `admin` continua; `leadership_group` não existe mais; depois de `supabase db reset`, as contas do seed têm os chamados de RF-24 |
| CA-22 | RF-11 | pessoa com `bishop` | troco a unidade no Perfil | `Para mudar de unidade, peça à liderança da estaca para remover seus acessos primeiro.` |
| CA-23 | RNF-06 | pessoa com 2 chamados | exporto meus dados | o JSON tem `calls` com os 2 |
| CA-24 | RF-03 | interface em `en-US` | abro `Meus chamados` | `Bishop`; para um chamado sem `name_en`, o `name_pt` |
| CA-25 | RNF-07 a RNF-10 | VoiceOver/TalkBack | navego por Acessos, Meus chamados e Catálogo | anúncios conforme RNF-07 a RNF-09 |

## 12. Roteiro de QA

| Passo | Ação | Resultado esperado |
| ----- | ---- | ------------------ |
| 1 | `supabase db reset`; entre como `admin@exemplo.org` › Perfil › `Catálogo de chamados` | Lista com os chamados do apêndice A |
| 2 | Busque `secretario` e abra `Secretário` | Formulário com `Ala e ramo`, `Liderança da unidade`, `Secretários` e seção `Secretários` |
| 3 | Crie `Coordenador de Caravanas ao Templo` (`Estaca`, `Nenhum`, `Consultores de Templo e História da Família`, `Não aparece`) | Toast `Chamado salvo`; o chamado aparece na lista |
| 4 | Entre como `estaca@exemplo.org` › Acessos e conceda `Presidente da Primária` em `Ala Içara` a `publicador.icara@exemplo.org` | Toast `Chamado concedido`; linha `… · Presidente da Primária` |
| 5 | Entre como `publicador.icara@exemplo.org` › Perfil | Cartão de consentimento; `Mostrar` exibe o toast `Seu nome aparece no organograma.` |
| 6 | Como visitante, chame `org_chart_members()` (por SQL, ou pela tela de organograma quando ela existir) | A pessoa aparece com `Presidente da Primária`, sem e-mail |
| 7 | Como `admin`, tente desativar `Presidente da Primária` | Mensagem com `1 pessoas`; o chamado não é desativado |
| 8 | Como `estaca`, remova o chamado do passo 4 | Toast `Chamado removido`; a pessoa some do organograma |
| 9 | Com quem tem `bishop`, mude o idioma para `English (US)` e abra `Meus chamados` | `Bishop` |
| 10 | Percorra as três telas com o VoiceOver | Anúncios conforme RNF-07 a RNF-09 |

## 13. Definition of Done

- [ ] `make check` e `make test-db` passam
- [ ] Todo `CA` tem teste automatizado com o ID no nome, ou justificativa de teste manual no plano (o CA-25 é manual)
- [ ] Roteiro de QA executado sem divergências em iOS e Android
- [ ] Registro de implementação preenchido no plano
- [ ] `SECURITY.md` e `BUSINESS.md` descrevem o acesso por chamado e o nível `stake_publisher`
- [ ] Nenhum segredo, dado pessoal ou log sensível introduzido (ver `.ai/docs/SECURITY.md`)

## 14. Decisões em aberto

Nenhuma decisão em aberto.

| # | Pergunta | Decisão | Origem |
| - | -------- | ------- | ------ |
| 1 | Para que serve o catálogo | O chamado define o acesso, os grupos de aviso e o organograma; `Administração` fica separada | usuário |
| 2 | Presidências de organizações da estaca | Nível novo `stake_publisher` (`Publicação da estaca`): publica pela Estaca sem ver chamados nem pautas | usuário |
| 3 | Abrangência | Todos os chamados do Manual Geral (apêndice A); só os marcados dão acesso; sem o nível "Grupo" | usuário |
| 4 | Manutenção do catálogo | Editável pelo `admin`, com registro; nada é apagado, só desativado | usuário |
| 5 | Tabela de acesso inicial | Coluna Acesso do apêndice A, aprovada pelo usuário | usuário |
| 6 | Vários chamados | Sim; o acesso é a soma | usuário |
| 7 | Grupos de aviso | Vêm do chamado; 13 grupos fixos (RF-04) | usuário |
| 8 | Ordem com `auth-account` | A `auth-account` fecha antes; esta spec troca "Papel + Grupo" por "Chamado" | usuário |
| 9 | Organograma | Quem recebe chamado com seção entra automaticamente | usuário |
| 10 | Cargo na tela Chamados | Do catálogo + `Outro chamado` | usuário |
| 11 | O que o admin edita | Nomes, nível, acesso, grupo, seção e ativo | usuário |
| 12 | Grupos editáveis | Fixos nesta entrega | usuário |
| 13 | Quem entra no organograma | Chamados com `org_chart_section` (marcação editável) | usuário |
| 14 | Consentimento no organograma | A própria pessoa aceita no Perfil e pode desligar | usuário |
| 15 | Cadastro manual no organograma | Continua para quem não tem conta, escolhendo do catálogo ou `Outro chamado` | usuário |
| 16 | Specs dependentes | `leadership`, `callings` e `push-notifications` ajustadas em 2026-11-15; `app-foundation` e `auth-account` (concluídas) não são reescritas | padrão do projeto |
| 17 | Regra de unidade | Mantida da `auth-account` (decisões 19 e 20), agora sobre chamados | padrão do projeto |
| 18 | Designações | Continuam em `designations` (spec `leadership`). O bispo como presidente do quórum de sacerdotes não é um chamado separado | padrão do projeto |
| 19 | Nomes em en-US e es-MX | Nomes oficiais do Manual Geral em cada idioma; sem tradução, aparece o pt-BR | padrão do projeto |
| 20 | Desativar ou mudar o nível de chamado que alguém tem | Bloqueado com mensagem (RF-07) | padrão do projeto |
| 21 | Migração dos acessos existentes | Mapeamento de RF-23; a produção ainda não tem acessos além do `admin` | padrão do projeto |
| 22 | Quem concede chamados | `stake_leader` e `admin`, como na `auth-account` | padrão do projeto |

## 15. Próximos passos (fora desta entrega)

- Grupos de aviso editáveis pelo admin.
- Concessão de chamados de unidade pelo bispado da própria unidade.
- Histórico dos chamados anteriores de cada pessoa.

## Apêndice A. Catálogo inicial

Fonte: *Manual Geral: Servir em A Igreja de Jesus Cristo dos Santos dos Últimos Dias*, capítulos 6 a 15 e 30, a partir do levantamento feito pelo usuário em 2026-11-15.

Legenda:
- **Acesso:** — = `none`; UP = `unit_publisher`; UL = `unit_leader`; SP = `stake_publisher`; SL = `stake_leader`.
- **Grupo:** chave de RF-04. **Seção:** chave de RF-05. Nas duas colunas, — = nulo.
- `sort_order` segue a ordem da tabela.

**Chamado e designação (Manual Geral, cap. 30):**
- Um **chamado** exige entrevista, apoio da congregação e designação por imposição de mãos. Só chamados entram no catálogo.
- Uma **designação** é uma responsabilidade dada a quem já tem um chamado (ex.: sumo conselheiro designado para a Ala Içara, ou conselheiro do Quórum de Élderes atuando como líder da missão). As designações ficam na spec `leadership`.

### A.1 Estaca (`level = stake`)

| id | Nome (pt-BR) | Acesso | Grupo | Seção |
| -- | ------------ | ------ | ----- | ----- |
| `stake_president` | Presidente da Estaca | SL | `stake_presidency` | `stake_presidency` |
| `stake_first_counselor` | Primeiro Conselheiro na Presidência da Estaca | SL | `stake_presidency` | `stake_presidency` |
| `stake_second_counselor` | Segundo Conselheiro na Presidência da Estaca | SL | `stake_presidency` | `stake_presidency` |
| `stake_patriarch` | Patriarca da Estaca | — | — | `stake_presidency` |
| `high_councilor` | Sumo Conselheiro | SL | `high_council` | `high_council` |
| `stake_executive_secretary` | Secretário Executivo da Estaca | SL | `clerks` | `stake_clerks` |
| `stake_assistant_executive_secretary` | Secretário Executivo Adjunto da Estaca | SL | `clerks` | `stake_clerks` |
| `stake_clerk` | Secretário da Estaca | SL | `clerks` | `stake_clerks` |
| `stake_assistant_clerk` | Secretário Adjunto da Estaca | SL | `clerks` | `stake_clerks` |
| `stake_auditor` | Auditor da Estaca | — | — | — |
| `stake_relief_society_president` | Presidente da Sociedade de Socorro da Estaca | SP | `relief_society_presidency` | `stake_organizations` |
| `stake_relief_society_counselor_1` | Primeira Conselheira na Presidência da Sociedade de Socorro da Estaca | SP | `relief_society_presidency` | `stake_organizations` |
| `stake_relief_society_counselor_2` | Segunda Conselheira na Presidência da Sociedade de Socorro da Estaca | SP | `relief_society_presidency` | `stake_organizations` |
| `stake_relief_society_secretary` | Secretária da Sociedade de Socorro da Estaca | — | `relief_society_presidency` | `stake_organizations` |
| `stake_young_women_president` | Presidente das Moças da Estaca | SP | `young_women_presidency` | `stake_organizations` |
| `stake_young_women_counselor_1` | Primeira Conselheira na Presidência das Moças da Estaca | SP | `young_women_presidency` | `stake_organizations` |
| `stake_young_women_counselor_2` | Segunda Conselheira na Presidência das Moças da Estaca | SP | `young_women_presidency` | `stake_organizations` |
| `stake_young_women_secretary` | Secretária das Moças da Estaca | — | `young_women_presidency` | `stake_organizations` |
| `stake_primary_president` | Presidente da Primária da Estaca | SP | `primary_presidency` | `stake_organizations` |
| `stake_primary_counselor_1` | Primeira Conselheira na Presidência da Primária da Estaca | SP | `primary_presidency` | `stake_organizations` |
| `stake_primary_counselor_2` | Segunda Conselheira na Presidência da Primária da Estaca | SP | `primary_presidency` | `stake_organizations` |
| `stake_primary_secretary` | Secretária da Primária da Estaca | — | `primary_presidency` | `stake_organizations` |
| `stake_young_men_president` | Presidente dos Rapazes da Estaca | — | — | `stake_organizations` |
| `stake_young_men_counselor` | Conselheiro na Presidência dos Rapazes da Estaca | — | — | `stake_organizations` |
| `stake_young_men_secretary` | Secretário dos Rapazes da Estaca | — | — | `stake_organizations` |
| `stake_sunday_school_president` | Presidente da Escola Dominical da Estaca | — | `sunday_school_presidency` | `stake_organizations` |
| `stake_sunday_school_counselor` | Conselheiro na Presidência da Escola Dominical da Estaca | — | `sunday_school_presidency` | `stake_organizations` |
| `stake_sunday_school_secretary` | Secretário da Escola Dominical da Estaca | — | `sunday_school_presidency` | `stake_organizations` |
| `stake_seminary_institute_supervisor` | Supervisor do Seminário e Instituto da Estaca | — | — | — |
| `seminary_teacher` | Professor do Seminário | — | — | — |
| `institute_teacher` | Professor do Instituto | — | — | — |
| `stake_temple_fh_lead_consultant` | Consultor Líder de Templo e História da Família da Estaca | — | `temple_family_history_workers` | — |
| `stake_temple_fh_consultant` | Consultor de Templo e História da Família da Estaca | — | `temple_family_history_workers` | — |
| `familysearch_center_director` | Diretor do Centro do FamilySearch | — | `temple_family_history_workers` | — |
| `familysearch_center_consultant` | Consultor do Centro do FamilySearch | — | `temple_family_history_workers` | — |
| `stake_music_coordinator` | Coordenador de Música da Estaca | — | `music` | — |
| `stake_organist` | Organista ou Pianista da Estaca | — | `music` | — |
| `stake_choir_director` | Regente de Coro da Estaca | — | `music` | — |
| `stake_communication_director` | Diretor de Comunicação da Estaca | SP | — | — |
| `stake_assistant_communication_director` | Diretor Adjunto de Comunicação da Estaca | — | — | — |
| `stake_self_reliance_specialist` | Especialista de Autossuficiência da Estaca | — | — | — |
| `stake_welfare_specialist` | Especialista de Bem-Estar da Estaca | — | — | — |
| `stake_justserve_coordinator` | Coordenador do JustServe da Estaca | — | — | — |
| `stake_ysa_committee_leader` | Líder do Comitê de Jovens Adultos Solteiros da Estaca | — | `young_single_adult_leaders` | — |
| `stake_sa_committee_leader` | Líder do Comitê de Adultos Solteiros da Estaca | — | — | — |
| `stake_technology_specialist` | Especialista de Tecnologia da Estaca | — | — | — |
| `stake_building_representative` | Representante de Capelas da Estaca | — | — | — |
| `stake_activities_coordinator` | Coordenador de Esportes e Atividades da Estaca | — | — | — |
| `stake_service_missionary` | Missionário de Serviço da Estaca | — | `missionaries` | — |

### A.2 Bispado e presidência do ramo

| id | Nível | Nome (pt-BR) | Acesso | Grupo | Seção |
| -- | ----- | ------------ | ------ | ----- | ----- |
| `bishop` | `ward` | Bispo | UL | `bishoprics` | `bishopric` |
| `bishopric_first_counselor` | `ward` | Primeiro Conselheiro no Bispado | UL | `bishoprics` | `bishopric` |
| `bishopric_second_counselor` | `ward` | Segundo Conselheiro no Bispado | UL | `bishoprics` | `bishopric` |
| `branch_president` | `branch` | Presidente do Ramo | UL | `bishoprics` | `bishopric` |
| `branch_first_counselor` | `branch` | Primeiro Conselheiro na Presidência do Ramo | UL | `bishoprics` | `bishopric` |
| `branch_second_counselor` | `branch` | Segundo Conselheiro na Presidência do Ramo | UL | `bishoprics` | `bishopric` |

### A.3 Ala e ramo (`level = ward_branch`)

| id | Nome (pt-BR) | Acesso | Grupo | Seção |
| -- | ------------ | ------ | ----- | ----- |
| `unit_executive_secretary` | Secretário Executivo | UL | `clerks` | `unit_clerks` |
| `unit_assistant_executive_secretary` | Secretário Executivo Adjunto | UL | `clerks` | `unit_clerks` |
| `unit_clerk` | Secretário | UL | `clerks` | `unit_clerks` |
| `unit_assistant_clerk` | Secretário Adjunto | UL | `clerks` | `unit_clerks` |
| `elders_quorum_president` | Presidente do Quórum de Élderes | UP | `elders_quorum_presidency` | `unit_organizations` |
| `elders_quorum_counselor_1` | Primeiro Conselheiro na Presidência do Quórum de Élderes | — | `elders_quorum_presidency` | `unit_organizations` |
| `elders_quorum_counselor_2` | Segundo Conselheiro na Presidência do Quórum de Élderes | — | `elders_quorum_presidency` | `unit_organizations` |
| `elders_quorum_secretary` | Secretário do Quórum de Élderes | — | `elders_quorum_presidency` | `unit_organizations` |
| `elders_quorum_assistant_secretary` | Secretário Adjunto do Quórum de Élderes | — | — | — |
| `elders_quorum_instructor` | Instrutor do Quórum de Élderes | — | — | — |
| `elders_quorum_service_coordinator` | Coordenador de Serviço do Quórum de Élderes | — | — | — |
| `relief_society_president` | Presidente da Sociedade de Socorro | UP | `relief_society_presidency` | `unit_organizations` |
| `relief_society_counselor_1` | Primeira Conselheira na Presidência da Sociedade de Socorro | — | `relief_society_presidency` | `unit_organizations` |
| `relief_society_counselor_2` | Segunda Conselheira na Presidência da Sociedade de Socorro | — | `relief_society_presidency` | `unit_organizations` |
| `relief_society_secretary` | Secretária da Sociedade de Socorro | — | `relief_society_presidency` | `unit_organizations` |
| `relief_society_assistant_secretary` | Secretária Adjunta da Sociedade de Socorro | — | — | — |
| `relief_society_teacher` | Professora da Sociedade de Socorro | — | — | — |
| `relief_society_service_coordinator` | Coordenadora de Serviço da Sociedade de Socorro | — | — | — |
| `priests_quorum_first_assistant` | Primeiro Assistente do Presidente do Quórum de Sacerdotes | — | — | — |
| `priests_quorum_second_assistant` | Segundo Assistente do Presidente do Quórum de Sacerdotes | — | — | — |
| `priests_quorum_secretary` | Secretário do Quórum de Sacerdotes | — | — | — |
| `teachers_quorum_president` | Presidente do Quórum de Mestres | — | — | — |
| `teachers_quorum_counselor_1` | Primeiro Conselheiro na Presidência do Quórum de Mestres | — | — | — |
| `teachers_quorum_counselor_2` | Segundo Conselheiro na Presidência do Quórum de Mestres | — | — | — |
| `teachers_quorum_secretary` | Secretário do Quórum de Mestres | — | — | — |
| `deacons_quorum_president` | Presidente do Quórum de Diáconos | — | — | — |
| `deacons_quorum_counselor_1` | Primeiro Conselheiro na Presidência do Quórum de Diáconos | — | — | — |
| `deacons_quorum_counselor_2` | Segundo Conselheiro na Presidência do Quórum de Diáconos | — | — | — |
| `deacons_quorum_secretary` | Secretário do Quórum de Diáconos | — | — | — |
| `aaronic_priesthood_adviser` | Consultor dos Quóruns do Sacerdócio Aarônico | — | — | — |
| `young_men_specialist` | Especialista dos Rapazes | — | — | — |
| `young_women_president` | Presidente das Moças | UP | `young_women_presidency` | `unit_organizations` |
| `young_women_counselor_1` | Primeira Conselheira na Presidência das Moças | — | `young_women_presidency` | `unit_organizations` |
| `young_women_counselor_2` | Segunda Conselheira na Presidência das Moças | — | `young_women_presidency` | `unit_organizations` |
| `young_women_secretary` | Secretária das Moças | — | `young_women_presidency` | `unit_organizations` |
| `young_women_adviser` | Consultora das Moças | — | — | — |
| `young_women_specialist` | Especialista das Moças | — | — | — |
| `young_women_class_president` | Presidente de Classe das Moças | — | — | — |
| `young_women_class_counselor_1` | Primeira Conselheira na Presidência da Classe das Moças | — | — | — |
| `young_women_class_counselor_2` | Segunda Conselheira na Presidência da Classe das Moças | — | — | — |
| `young_women_class_secretary` | Secretária da Classe das Moças | — | — | — |
| `primary_president` | Presidente da Primária | UP | `primary_presidency` | `unit_organizations` |
| `primary_counselor_1` | Primeira Conselheira na Presidência da Primária | — | `primary_presidency` | `unit_organizations` |
| `primary_counselor_2` | Segunda Conselheira na Presidência da Primária | — | `primary_presidency` | `unit_organizations` |
| `primary_secretary` | Secretária da Primária | — | `primary_presidency` | `unit_organizations` |
| `primary_music_leader` | Líder de Música da Primária | — | `music` | — |
| `primary_pianist` | Pianista da Primária | — | `music` | — |
| `primary_teacher` | Professor da Primária | — | — | — |
| `nursery_leader` | Líder do Berçário | — | — | — |
| `primary_activities_leader` | Líder de Atividades da Primária | — | — | — |
| `sunday_school_president` | Presidente da Escola Dominical | UP | `sunday_school_presidency` | `unit_organizations` |
| `sunday_school_counselor_1` | Primeiro Conselheiro na Presidência da Escola Dominical | — | `sunday_school_presidency` | `unit_organizations` |
| `sunday_school_counselor_2` | Segundo Conselheiro na Presidência da Escola Dominical | — | `sunday_school_presidency` | `unit_organizations` |
| `sunday_school_secretary` | Secretário da Escola Dominical | — | `sunday_school_presidency` | `unit_organizations` |
| `sunday_school_teacher` | Professor da Escola Dominical | — | — | — |
| `unit_librarian` | Bibliotecário | — | — | — |
| `unit_assistant_librarian` | Bibliotecário Adjunto | — | — | — |
| `unit_mission_leader` | Líder da Missão | — | `missionaries` | `unit_organizations` |
| `unit_missionary` | Missionário da Unidade | — | `missionaries` | — |
| `unit_temple_fh_leader` | Líder de Templo e História da Família | — | `temple_family_history_workers` | `unit_organizations` |
| `unit_temple_fh_consultant` | Consultor de Templo e História da Família | — | `temple_family_history_workers` | — |
| `unit_music_coordinator` | Coordenador de Música | — | `music` | — |
| `sacrament_meeting_chorister` | Regente da Reunião Sacramental | — | `music` | — |
| `unit_organist` | Organista ou Pianista | — | `music` | — |
| `unit_choir_director` | Regente de Coro | — | `music` | — |
| `unit_choir_pianist` | Pianista de Coro | — | `music` | — |
| `unit_self_reliance_specialist` | Especialista de Autossuficiência | — | — | — |
| `unit_welfare_specialist` | Especialista de Bem-Estar | — | — | — |
| `unit_activities_committee_chair` | Presidente do Comitê de Atividades | UP | — | — |
| `unit_activities_specialist` | Especialista de Atividades | — | — | — |
| `unit_technology_specialist` | Especialista de Tecnologia | — | — | — |
| `unit_building_representative` | Representante de Capela | — | — | — |
| `unit_ysa_leader` | Líder de Jovens Adultos Solteiros | — | `young_single_adult_leaders` | — |
