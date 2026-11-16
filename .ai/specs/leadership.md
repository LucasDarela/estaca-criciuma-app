# Liderança: organograma, acompanhamento e contatos

> **Status:** Concluída
> **Área:** aba `leadership`, rota `/leadership/unit/[id]`, `src/features/leadership/`, `src/domain/orgChart.ts`, `src/domain/phone.ts`, Perfil (telefone), `supabase/migrations/`
> **Última atualização:** 2026-11-16

## 0. Skills obrigatórias

| Skill | Quando usar |
| ----- | ----------- |
| `vercel-react-native-skills` | Árvore em duas colunas, listas, `Sheet`, links `tel:` e WhatsApp |
| `ecc:postgres-patterns` | Tabelas de vínculo e de telefone, RLS, RPCs `security definer` |
| `ecc:accessibility` | Árvore navegável por leitor de tela, fonte ampliada, ações de contato |
| `ecc:react-testing` | Montagem da árvore, visibilidade do telefone por perfil, modo de edição |

## 1. Contexto

Visitantes e membros não sabem a quem procurar. O organograma mostra quem serve onde, de forma pública (RN-01).

Desde `roles-of-leadership`, quem aparece no organograma vem do **chamado** da pessoa (`member_calls`), e só depois que a própria pessoa aceita (`org_chart_consent = 'accepted'`, função `org_chart_members()`). Esta spec substitui a versão de 2026-11-13, que tinha um cadastro manual de pessoas com declaração de consentimento feita por quem cadastrava. Esse cadastro sai: o organograma passa a ter **uma única fonte**.

A estrutura segue como a liderança realmente funciona:
- Na estaca, cada conselheiro da presidência acompanha parte do sumo conselho, e cada sumo conselheiro acompanha unidades.
- Na ala e no ramo, cada conselheiro do bispado (ou da presidência do ramo) acompanha organizações.

O telefone é dado pessoal. Cada pessoa informa o próprio telefone no Perfil e decide se ele aparece no organograma, e só quem tem conta vê.

## 2. Objetivo

Ao final desta entrega:
- Qualquer pessoa abre a aba Liderança e vê a árvore da estaca e de cada unidade, com nomes e chamados de quem aceitou aparecer.
- Quem tem conta vê o telefone de quem escolheu mostrá-lo, e liga, chama no WhatsApp ou copia o número.
- A liderança define quem acompanha quem: `stake_leader` na estaca e `can_lead` na unidade.

## 3. Estado atual

| Item | Situação | Destino |
| ---- | -------- | ------- |
| Aba `leadership` (`src/app/(tabs)/leadership.tsx`) | Re-exporta `LeadershipPlaceholder` | Alterar: re-exporta `LeadershipScreen` |
| `LeadershipPlaceholder` (`src/features/placeholder/screens.tsx`) e a referência em `TabsLayout.test.tsx` | Tela "em breve" | Remover |
| `org_chart_members()` (`supabase/migrations/20261115222648_member_calls.sql`) | Pública. Devolve `member_call_id`, `unit_id`, `section`, `calling_id`, nomes nos 3 idiomas, `display_name`, `sort_order`; só chamados ativos, com seção e `accepted` | Usar sem mudança |
| `calling_catalog.org_chart_section` e as seções `stake_presidency`, `high_council`, `stake_clerks`, `stake_organizations`, `bishopric`, `unit_clerks`, `unit_organizations` | `roles-of-leadership` RF-05 | Usar |
| `member_calls` (RLS: a pessoa lê as próprias linhas; `stake_leader` e `admin` leem todas) | `roles-of-leadership` | Usar; as tabelas novas referenciam `member_calls.id` com `on delete cascade` |
| `can_lead(unit)`, `is_stake_leader()` (SQL) e `src/domain/permissions.ts` | `roles-of-leadership` | Usar para autorizar a edição |
| `MyCallingsSection`, `OrgChartConsentCard` (Perfil) | `roles-of-leadership` | Manter |
| `ProfileScreen` (linhas `Nome`, `Unidade`, `Idioma`) | `auth-account` | Alterar: linha `Telefone` logo depois de `Idioma` |
| `export_my_data()` | `auth-account` + `roles-of-leadership` | Alterar: inclui `phone` (RF-08) |
| Cache público (`src/lib/queryPersistence.ts`), `useIsOnline`, `OfflineBanner` | `calendar` | Usar; telefones nunca no cache persistido |
| Login sob demanda (`/sign-in` com `returnTo`) | `auth-account` | Usar no botão `Entrar` da ficha |
| Tabelas `leadership_positions`, `leadership_contacts`, `designations` da versão anterior | Nunca criadas | Não criar |
| `BUSINESS.md` (entidade `LeadershipPosition`, glossário `Liderança`) e `SECURITY.md` (linha do organograma com `leadership_positions`, regra de RLS de `leadership_positions`) | Descrevem o cadastro manual | Alterar (seção 13) |

## 4. Tecnologias e versões

| Tecnologia | Versão | Situação | Uso nesta entrega |
| ---------- | ------ | -------- | ----------------- |
| Supabase (Postgres + RLS) | do stack | instalada | Tabelas de vínculo e de telefone, RPCs |
| TanStack Query, expo-router | do stack | instaladas | Telas, cache |
| `Linking` (React Native) | do RN 0.88 | instalada | `tel:` e `https://wa.me/` |
| `expo-clipboard` | a do SDK 58 (`npx expo install expo-clipboard`) | adicionar | Copiar telefone |

## 5. Restrições e requisitos não funcionais

| ID | Requisito |
| -- | --------- |
| RNF-01 | `profile_phones`, `high_council_links`, `high_council_units` e `unit_org_links` nascem com RLS ligada. `profile_phones` tem políticas só para o dono (`user_id = auth.uid()`) nas 4 operações; as 3 tabelas de vínculo ficam **sem política** e com `revoke all` para `anon` e `authenticated`, e só as RPCs da seção 7.1 as alcançam. Cada tabela tem teste pgTAP de acesso negado. |
| RNF-02 | Telefone nunca chega a `anon`: `org_chart_phones()` tem `execute` só para `authenticated`; nenhuma outra função pública devolve telefone. Telefones nunca usam chave de query que começa com `'public'` e nunca vão para o disco do aparelho. |
| RNF-03 | Ninguém aparece sem `org_chart_consent = 'accepted'` (regra de `roles-of-leadership`, mantida). `org_chart_links()` nunca devolve o `member_call_id` de um chamado que não aparece em `org_chart_members()`, nem `user_id`, e-mail ou telefone. Um vínculo para um conselheiro que não aparece revela só o chamado da posição (ex.: `stake_first_counselor`). |
| RNF-04 | Telefone gravado em E.164 brasileiro: `check (phone_e164 ~ '^\+55[1-9][0-9][0-9]{8,9}$')` (DDD de 11 a 99 + 8 ou 9 dígitos). |
| RNF-05 | Autorização da edição no banco: vínculos da estaca só com `is_stake_leader()`; vínculos de uma unidade só com `can_lead(unidade)`. `admin`, `unit_publisher` e `stake_publisher` não editam (mesma regra de `can_lead`). |
| RNF-06 | Eventos de log só com ids e enums: `org_chart_link_saved` (`kind`, `unit_id`) e `profile_phone_saved` (`shown: boolean`). Nunca o número, o nome ou o `user_id`. |
| RNF-07 | LGPD: `export_my_data` inclui o telefone; excluir a conta apaga `profile_phones` em cascata; remover um chamado apaga os vínculos que o citam em cascata. |
| RNF-08 | Abrir a aba faz no máximo 2 chamadas ao servidor (`org_chart_members()` e `org_chart_links()`); `org_chart_phones()` é chamada uma vez, só com sessão e só quando a primeira ficha é aberta (`staleTime` de 5 min). A árvore é montada no app, sem uma chamada por unidade. |

## 6. Escopo

### 6.1 Incluso

- Tabelas `profile_phones`, `high_council_links`, `high_council_units` e `unit_org_links`, com RLS, RPCs e testes pgTAP.
- RPCs `set_my_phone`, `org_chart_phones`, `org_chart_links`, `set_high_councilor_links` e `set_unit_org_counselor`; `export_my_data` com `phone`.
- Montagem da árvore em `src/domain/orgChart.ts`: posições fixas, colunas por conselheiro, organizações, secretários, ordem.
- Aba Liderança: busca, `Segmented` `Estaca` | `Unidades`, árvore da estaca e lista das 6 unidades.
- Tela da unidade (`/leadership/unit/[id]`) com a árvore da ala ou do ramo e `Acompanhada por`.
- Ficha da pessoa em `Sheet`, com telefone, `Ligar`, `WhatsApp` e `Copiar` para quem tem conta.
- Perfil: linha `Telefone` e sheet para informar o número e ligar `Mostrar meu telefone no organograma`.
- Modo de edição: conselheiro e unidades de cada sumo conselheiro (estaca); conselheiro de cada organização (unidade).
- Cache público da árvore para uso offline.
- Seed local com organograma fictício completo.
- Atualização de `BUSINESS.md` e `SECURITY.md`.

### 6.2 Não incluso

- Cadastro manual de pessoas sem conta e declaração de consentimento por terceiros (substitui a decisão 15 de `roles-of-leadership`).
- Designações em texto livre (ex.: "Responsável pelo JustServe").
- Foto das pessoas (só iniciais), e-mail de contato, horários de atendimento.
- Histórico de quem já serviu.
- Vínculo de conselheiro da estaca a outras seções (secretários, organizações da estaca) e vínculo de conselheiro do bispado a secretários.
- Link direto (deep link) para a ficha de uma pessoa.
- Reordenar pessoas à mão: a ordem vem do catálogo (RF-13).

## 7. Especificação funcional

### 7.1 Dados e servidor

| ID | Requisito |
| -- | --------- |
| RF-01 | A única fonte de pessoas é `org_chart_members()`, sem mudança. Cada linha é um **chamado visível** (uma pessoa com 2 chamados visíveis gera 2 linhas). O nome do chamado aparece no idioma da interface, com `calling_name_pt` quando a tradução é nula (RF-03 de `roles-of-leadership`). |
| RF-02 | Tabela `profile_phones`:<br>• `user_id uuid pk` → `profiles on delete cascade`<br>• `phone_e164 text not null` (RNF-04)<br>• `show_on_org_chart boolean not null default false`<br>• `updated_at timestamptz not null default now()`<br>Escrita pelo app só por `set_my_phone(p_phone_e164 text, p_show boolean)` (`security definer`, só `authenticated`, primeira instrução exige `auth.uid()`):<br>• `p_phone_e164` nulo: apaga a linha da pessoa (e ignora `p_show`);<br>• `p_phone_e164` fora do formato: erro `invalid_phone`;<br>• caso contrário, faz upsert com `show_on_org_chart = p_show`. |
| RF-03 | `org_chart_phones()`: `security definer`, `execute` só para `authenticated`. Devolve `member_call_id`, `phone_e164` para cada linha de `org_chart_members()` cuja pessoa tem `profile_phones.show_on_org_chart = true`. Visitante recebe erro de permissão (`42501`). |
| RF-04 | Tabelas de vínculo (todas com `updated_by uuid null`, `updated_at timestamptz not null default now()`):<br>• `high_council_links`: `high_councilor_call_id uuid pk` → `member_calls on delete cascade`, `counselor_call_id uuid not null` → `member_calls on delete cascade`.<br>• `high_council_units`: `high_councilor_call_id uuid` → `member_calls on delete cascade`, `unit_id text` → `units`; pk (`high_councilor_call_id`, `unit_id`).<br>• `unit_org_links`: `unit_id text` → `units`, `organization text check (organization in ('elders_quorum','relief_society','young_women','primary','sunday_school'))`, `counselor_call_id uuid not null` → `member_calls on delete cascade`; pk (`unit_id`, `organization`). |
| RF-05 | `set_high_councilor_links(p_high_councilor_call_id uuid, p_counselor_calling_id text, p_unit_ids text[])` (`security definer`, só `authenticated`), numa transação:<br>• sem `is_stake_leader()`: `forbidden`;<br>• o chamado `p_high_councilor_call_id` não existe, não está em `estaca` ou o chamado do catálogo não tem `org_chart_section = 'high_council'`: `not_found`;<br>• `p_counselor_calling_id` não nulo e diferente de `stake_first_counselor` e `stake_second_counselor`: `invalid_counselor`;<br>• `p_counselor_calling_id` não nulo e ninguém tem esse chamado em `estaca`: `no_counselor`. Com mais de uma pessoa, vale a de `granted_at` mais antigo;<br>• algum `p_unit_ids` que não seja unidade `ward` ou `branch`: `invalid_unit`.<br>Efeito: grava ou apaga (`p_counselor_calling_id` nulo) a linha de `high_council_links` com o `member_calls.id` resolvido, e substitui todas as linhas de `high_council_units` do sumo conselheiro por `p_unit_ids` (sem repetição; vazio apaga todas). |
| RF-06 | `set_unit_org_counselor(p_unit_id text, p_organization text, p_counselor_calling_id text)` (`security definer`, só `authenticated`):<br>• `p_unit_id` não é `ward` nem `branch`: `invalid_unit`;<br>• sem `can_lead(p_unit_id)`: `forbidden`;<br>• `p_organization` fora da lista de RF-04: `invalid_organization`;<br>• `p_counselor_calling_id` não nulo e fora de `bishopric_first_counselor`/`bishopric_second_counselor` (ala) ou `branch_first_counselor`/`branch_second_counselor` (ramo): `invalid_counselor`;<br>• ninguém tem esse chamado na unidade: `no_counselor` (mais de uma pessoa: `granted_at` mais antigo).<br>Efeito: grava ou apaga (`p_counselor_calling_id` nulo) a linha (`p_unit_id`, `p_organization`). |
| RF-07 | `org_chart_links()`: pública (`anon` e `authenticated`), `security definer`. Devolve linhas `kind`, `unit_id`, `member_call_id`, `organization`, `counselor_calling_id`, `target_unit_id`:<br>• `high_council_counselor`: `member_call_id` do sumo conselheiro e `counselor_calling_id` = chamado do conselheiro vinculado; só se o sumo conselheiro aparece em `org_chart_members()`.<br>• `high_council_unit`: `member_call_id` do sumo conselheiro e `target_unit_id`; só se o sumo conselheiro aparece.<br>• `unit_org_counselor`: `unit_id`, `organization` e `counselor_calling_id`.<br>Nunca devolve o `member_call_id` do conselheiro (RNF-03). |
| RF-08 | `export_my_data()` ganha a chave `phone`: `{ phone_e164, show_on_org_chart, updated_at }`, ou `null` sem telefone. |

### 7.2 Montagem da árvore (`src/domain/orgChart.ts`, função pura)

| ID | Requisito |
| -- | --------- |
| RF-09 | Posições fixas por tipo de unidade (sempre desenhadas, RF-11 e RF-12):<br>• Estaca: topo `stake_president` (rótulo curto `Presidente`); colunas `stake_first_counselor` (`1º Conselheiro`) e `stake_second_counselor` (`2º Conselheiro`).<br>• Ala: topo `bishop` (`Bispo`); colunas `bishopric_first_counselor` (`1º Conselheiro`) e `bishopric_second_counselor` (`2º Conselheiro`).<br>• Ramo: topo `branch_president` (`Presidente do Ramo`); colunas `branch_first_counselor` (`1º Conselheiro`) e `branch_second_counselor` (`2º Conselheiro`).<br>Uma posição mostra **todas** as linhas visíveis com aquele `calling_id` na unidade. Sem nenhuma, mostra só o rótulo curto, com `Avatar` vazio e sem nome. |
| RF-10 | Organização de um chamado (pelo `calling_id`):<br>• `elders_quorum` `Quórum de Élderes`: `elders_quorum_president`, `elders_quorum_counselor_1`, `elders_quorum_counselor_2`, `elders_quorum_secretary`.<br>• `relief_society` `Sociedade de Socorro`: ids que começam com `relief_society_` ou `stake_relief_society_`.<br>• `young_women` `Moças`: ids que começam com `young_women_` ou `stake_young_women_`.<br>• `young_men` `Rapazes`: ids que começam com `stake_young_men_`.<br>• `primary` `Primária`: ids que começam com `primary_` ou `stake_primary_`.<br>• `sunday_school` `Escola Dominical`: ids que começam com `sunday_school_` ou `stake_sunday_school_`.<br>• `other` `Outros`: qualquer outro chamado da seção `unit_organizations` ou `stake_organizations` (ex.: `unit_mission_leader`, `unit_temple_fh_leader`, chamados criados pelo admin).<br>Ordem dos blocos na unidade: Quórum de Élderes, Sociedade de Socorro, Moças, Primária, Escola Dominical, Outros. Na estaca: Sociedade de Socorro, Moças, Primária, Rapazes, Escola Dominical, Outros. |
| RF-11 | Árvore da **estaca** (de cima para baixo):<br>1. Posição `Presidente`.<br>2. Duas colunas, `1º Conselheiro` e `2º Conselheiro`. Abaixo de cada posição, os sumos conselheiros (seção `high_council`) cujo vínculo `high_council_counselor` aponta para o chamado daquela coluna.<br>3. `Sem conselheiro definido`: sumos conselheiros visíveis sem vínculo (só aparece se houver algum).<br>4. Faixa `SECRETÁRIOS DA ESTACA`: seção `stake_clerks`.<br>5. Os demais da seção `stake_presidency` que não são posição fixa (ex.: `Patriarca da Estaca`), cada um num cartão próprio, sem linha de hierarquia.<br>6. `ORGANIZAÇÕES DA ESTACA`: seção `stake_organizations`, em blocos por organização (RF-10); bloco sem ninguém não aparece. |
| RF-12 | Árvore da **ala** ou do **ramo**:<br>1. `Acompanhada por`: uma linha `{nome} (Sumo Conselheiro)` por sumo conselheiro visível com vínculo `high_council_unit` para esta unidade (só aparece se houver algum).<br>2. Posição do topo (`Bispo` ou `Presidente do Ramo`).<br>3. Duas colunas, `1º Conselheiro` e `2º Conselheiro`. Abaixo de cada posição, os blocos de organização (das 5 de RF-04) cujo vínculo `unit_org_counselor` aponta para o chamado daquela coluna. Cada bloco tem o nome da organização e as pessoas da seção `unit_organizations` daquela organização; bloco sem ninguém não aparece fora do modo de edição.<br>4. `Sem conselheiro definido`: blocos das 5 organizações sem vínculo e com alguém visível.<br>5. Faixa `SECRETÁRIOS`: seção `unit_clerks`.<br>6. `OUTROS`: pessoas da organização `other` e quem está na seção `bishopric` sem ser posição fixa.<br>7. Sem nenhuma pessoa visível na unidade: as posições fixas só com rótulos e, abaixo, `Ainda não há pessoas no organograma desta unidade.` |
| RF-13 | Ordem dentro de cada posição, coluna, faixa e bloco: `sort_order` do catálogo e, no empate, `display_name` (comparação ignorando maiúsculas e acentos). Uma pessoa com 2 chamados visíveis aparece nos 2 lugares. |

### 7.3 Telas

| ID | Requisito |
| -- | --------- |
| RF-14 | Aba Liderança: `ScreenHeader` `Liderança` (com o avatar do viewer, como as outras abas), `SearchField` `Buscar nome ou chamado`, `Segmented` `Estaca` \| `Unidades` (abre sempre em `Estaca`). `Estaca` mostra a árvore de RF-11. |
| RF-15 | `Unidades`: um `ListItem` por unidade (as 6, na ordem de `unitOrder`, sem a Estaca), com ponto da cor da unidade, nome, subtítulo `{grupo principal} · {n}` (`Bispado` na ala, `Presidência do ramo` no ramo; `n` = pessoas visíveis na seção `bishopric` da unidade, inclusive 0) e chevron. Toque abre `/leadership/unit/[id]`. |
| RF-16 | `/leadership/unit/[id]`: `ScreenHeader` com voltar e o nome da unidade como título; árvore de RF-12. `id` que não é `ward` nem `branch`: `EmptyState` `Unidade não encontrada.` com o botão `Voltar para Liderança`. |
| RF-17 | Busca: a partir de 2 caracteres (após `trim`), ignorando maiúsculas e acentos, no `display_name` e no nome do chamado no idioma da interface, em toda a estaca. Enquanto houver termo válido, a lista de resultados substitui o conteúdo abaixo do `Segmented`. Cada resultado é um `ListItem` com `Avatar` (iniciais), nome e subtítulo `{chamado} · {unidade}`, na ordem de RF-13. Sem resultado: `Ninguém encontrado para "{termo}".` Toque abre a ficha (RF-18). |
| RF-18 | Ficha (`Sheet`), aberta ao tocar numa pessoa da árvore, de `Acompanhada por` ou da busca:<br>• `Avatar` `large` com iniciais, nome, `{chamado} · {unidade}` (o chamado tocado);<br>• sumo conselheiro com vínculos de unidade: `Acompanha: {unidades}` (nomes separados por vírgula, na ordem de `unitOrder`);<br>• conselheiro de ala ou ramo com organizações vinculadas: `Acompanha: {organizações}` (na ordem de RF-10);<br>• área de contato (RF-19). |
| RF-19 | Área de contato da ficha:<br>• **Visitante:** `Entre para ver os contatos.` e o botão `Entrar` (`ghost`), que abre `/sign-in` com `returnTo` = rota atual. O texto é o mesmo tenha a pessoa telefone ou não.<br>• **Com sessão, carregando:** `Skeleton` de uma linha.<br>• **Com sessão e telefone visível:** o número formatado (`(48) 99999-0000` ou `(48) 3333-0000`) e os botões `Ligar` (`secondary`, ícone `call`, abre `tel:+5548999990000`), `WhatsApp` (`outline`, ícone `chat`, abre `https://wa.me/5548999990000`; só para número de 11 dígitos) e `Copiar` (`ghost`, ícone `content_copy`, copia `(48) 99999-0000` e mostra o toast `Telefone copiado`). Toque longo no número também copia.<br>• **Com sessão e sem telefone visível:** a área de contato não aparece.<br>• **Com sessão e offline sem telefones carregados:** `Telefone disponível com conexão.`<br>• **Com sessão e erro ao carregar:** `Não foi possível carregar o telefone.` e o botão `Tentar de novo`. |
| RF-20 | Estados da aba e da tela da unidade:<br>• carregando sem cache: `Skeleton` no formato da árvore (posição do topo + 2 colunas);<br>• erro sem cache: `Não foi possível carregar a liderança.` e `Tentar de novo`;<br>• offline com cache: árvore do cache e `OfflineBanner`;<br>• offline sem cache: `EmptyState` `Sem conexão. Conecte-se para ver a liderança.` e `Tentar de novo`. |

### 7.4 Telefone no Perfil

| ID | Requisito |
| -- | --------- |
| RF-21 | Perfil: `ListItem` `Telefone`, logo depois de `Idioma`, para qualquer conta, com subtítulo = número formatado (sem telefone: `Não informado`) e chevron. Toque abre o `Sheet` `Telefone`:<br>• `TextField` `Telefone`, teclado numérico, máscara `(00) 00000-0000` (10 dígitos: `(00) 0000-0000`), placeholder `(48) 99999-0000`, preenchido com o atual;<br>• linha com `Switch` `Mostrar meu telefone no organograma`;<br>• texto de apoio `Só pessoas com conta veem, e só nos chamados em que você aparece no organograma.`;<br>• botão `Salvar` (`primary`);<br>• com telefone salvo, botão `Remover telefone` (`ghost`). |
| RF-22 | Regras do sheet `Telefone`:<br>• dígitos (sem máscara) diferentes de 10 ou 11, ou DDD começando com 0: `Informe um telefone com DDD.` abaixo do campo;<br>• `Switch` ligado com campo vazio: `Informe o telefone para mostrá-lo no organograma.`;<br>• `Salvar` chama `set_my_phone('+55' + dígitos, switch)`, mostra o toast `Telefone salvo` e fecha;<br>• `Remover telefone` chama `set_my_phone(null, false)`, mostra o toast `Telefone removido` e fecha;<br>• falha de rede: toast `Sem conexão. Verifique a internet e tente de novo.`, o sheet continua aberto com o que foi digitado;<br>• `Salvar` fica desabilitado enquanto envia (sem duplo envio). |

### 7.5 Modo de edição

| ID | Requisito |
| -- | --------- |
| RF-23 | Botão `Editar` (ação do `ScreenHeader`, ícone `edit`):<br>• na árvore da estaca (aba, segmento `Estaca`), só para `stake_leader`;<br>• na tela da unidade, só com `canLead(unidade)` (`src/domain/permissions.ts`);<br>• desabilitado offline, com o rótulo de acessibilidade `Editar indisponível sem conexão`.<br>Ao tocar, aparece a faixa `primarySubtle` `Modo de edição` com o botão `Concluir`, e a busca fica oculta. `Concluir` sai do modo e recarrega `org_chart_links()`. |
| RF-24 | Estaca em modo de edição: cada sumo conselheiro visível (nas colunas e em `Sem conselheiro definido`) ganha o ícone `edit` à direita; tocar abre o `Sheet` `Acompanhamento`, com o nome da pessoa como título e:<br>• grupo de chips de seleção única `Conselheiro`: `1º Conselheiro`, `2º Conselheiro`, `Nenhum` (marcado o atual);<br>• grupo de chips de seleção múltipla `Unidades que acompanha`: as 6 unidades, com o ponto da cor (marcadas as atuais);<br>• botão `Salvar` → `set_high_councilor_links`; sucesso: toast `Acompanhamento salvo`, fecha e recarrega. |
| RF-25 | Unidade em modo de edição: os 5 blocos de organização aparecem sempre (mesmo sem pessoas, com `Nenhuma pessoa no organograma.`), cada um com o botão `Editar` (`ghost`, compacto); tocar abre o `Sheet` `Acompanhamento`, com o nome da organização como título, o grupo de chips de seleção única `Conselheiro` (`1º Conselheiro`, `2º Conselheiro`, `Nenhum`) e `Salvar` → `set_unit_org_counselor`; sucesso: toast `Acompanhamento salvo`, fecha e recarrega. |
| RF-26 | Erros dos sheets de acompanhamento (toast, o sheet continua aberto):<br>• `no_counselor`: `Ninguém tem este chamado agora. Conceda o chamado em Acessos primeiro.`;<br>• `forbidden`: `Você não tem permissão para editar este organograma.`;<br>• `not_found`: `Esta pessoa não está mais no sumo conselho.` (o sheet fecha e a árvore recarrega);<br>• falha de rede: `Sem conexão. Verifique a internet e tente de novo.`;<br>• qualquer outro: `Não foi possível salvar. Tente de novo.`<br>`Salvar` fica desabilitado enquanto envia. |

### 7.6 Casos de borda

| Situação | Comportamento |
| -------- | ------------- |
| Conselheiro vinculado perde o chamado | O vínculo some em cascata (RF-04); o sumo conselheiro ou a organização vai para `Sem conselheiro definido` |
| Conselheiro vinculado desliga `Mostrar no organograma` | O vínculo fica; a coluna mostra só o rótulo `1º Conselheiro` sem nome, com os vinculados abaixo (RF-09, RNF-03) |
| Sumo conselheiro desliga `Mostrar no organograma` | Some da árvore, de `Acompanhada por` e da edição; os vínculos ficam guardados e voltam se ele religar |
| Duas pessoas com o mesmo chamado de conselheiro na unidade | A posição mostra as duas (RF-09); o vínculo novo vai para a de `granted_at` mais antigo (RF-05, RF-06) |
| Pessoa com chamado visível e telefone com `show_on_org_chart = false` | A ficha não mostra contato para quem tem sessão; o visitante vê `Entre para ver os contatos.` |
| Pessoa sem nenhum chamado visível liga `Mostrar meu telefone no organograma` | O telefone fica salvo e não aparece em lugar nenhum até ela ter um chamado visível |
| Número fixo (10 dígitos) | `Ligar` e `Copiar`; sem `WhatsApp` |
| WhatsApp não instalado | `https://wa.me/{número}` abre no navegador |
| Visitante chama `org_chart_phones()` pela API | Erro `42501`, nenhuma linha (RNF-02) |
| Dois líderes editam o mesmo vínculo ao mesmo tempo | Vale o último salvamento; `Concluir` recarrega |
| Líder abre `Editar` e perde o acesso no meio | O `Salvar` recebe `forbidden` e mostra a mensagem de RF-26 |
| Admin muda a seção de um chamado no catálogo | A árvore reflete na próxima carga; vínculos de sumo conselheiro cujo chamado saiu de `high_council` ficam guardados, mas não aparecem (o sumo conselheiro não está mais na seção) |
| Busca com 1 caractere | Nenhuma busca; o conteúdo normal continua |

## 8. Especificação de UI/UX

- **Referência visual:** tela "Liderança (organograma)" do projeto Design System (seção 07). Só componentes de `DESIGN_SYSTEM.md` e tokens de `theme.ts`.
- **Posição fixa (cartão):** fundo `surface`, borda `border`, `radius.card`, padding `space.md`, centralizado. Topo: `Avatar` `large`, nome em `type.callout`, rótulo curto em `type.caption` `textMuted`. Conselheiros: `Avatar` `default`. Sem pessoa: `Avatar` com fundo `surfaceDisabled` e sem iniciais, só o rótulo.
- **Linhas da árvore:** `stroke` de 1.5 em `borderStrong`, ligando o topo às duas colunas e cada coluna aos itens abaixo. Puramente decorativas.
- **Colunas:** duas, de larguras iguais, com `space.md` entre elas e `space.lg` de margem lateral. Itens das colunas: `ListItem` compacto com `Avatar` `small` e nome (sumos conselheiros) ou bloco com título da organização em `type.caption` 600 `primary` e as pessoas em `ListItem` compacto (nome; o chamado como subtítulo).
- **Fonte ampliada:** com `fontScale ≥ 1.3`, as colunas ficam empilhadas (coluna do `1º Conselheiro` inteira, depois a do `2º`), cada uma com uma linha vertical à esquerda.
- **Faixas e seções:** overlines (`type.overline`, `primary`) `SECRETÁRIOS DA ESTACA`, `SECRETÁRIOS`, `ORGANIZAÇÕES DA ESTACA`, `OUTROS`, `SEM CONSELHEIRO DEFINIDO`, `ACOMPANHADA POR`; listas em blocos `surface` com `radius.card`; `space.xl` entre seções.
- **Ficha:** `Sheet`; botões de contato lado a lado em `size="compact"` (`Ligar`, `WhatsApp`, `Copiar`), quebrando para linhas com fonte ampliada.
- **Modo de edição:** faixa `primarySubtle` no topo com `Modo de edição` (`type.callout`) e `Concluir` (`ghost`). Sheet `Acompanhamento` com `FilterChip`.
- **Perfil:** `Sheet` `Telefone` com `TextField`, `ListItem` com `Switch` e os botões empilhados.

### Copy (pt-BR)

| Chave sugerida | Texto |
| -------------- | ----- |
| `leadership.title` | `Liderança` |
| `leadership.search` | `Buscar nome ou chamado` |
| `leadership.segment.stake` / `.units` | `Estaca` / `Unidades` |
| `leadership.slot.stakePresident` / `.bishop` / `.branchPresident` / `.firstCounselor` / `.secondCounselor` | `Presidente` / `Bispo` / `Presidente do Ramo` / `1º Conselheiro` / `2º Conselheiro` |
| `leadership.section.*` | `SECRETÁRIOS DA ESTACA`, `SECRETÁRIOS`, `ORGANIZAÇÕES DA ESTACA`, `OUTROS`, `SEM CONSELHEIRO DEFINIDO`, `ACOMPANHADA POR` |
| `leadership.org.*` | `Quórum de Élderes`, `Sociedade de Socorro`, `Moças`, `Rapazes`, `Primária`, `Escola Dominical`, `Outros` |
| `leadership.units.main.ward` / `.branch` | `Bispado` / `Presidência do ramo` |
| `leadership.supervisedBy` | `{nome} (Sumo Conselheiro)` |
| `leadership.empty.unit` | `Ainda não há pessoas no organograma desta unidade.` |
| `leadership.empty.org` | `Nenhuma pessoa no organograma.` |
| `leadership.search.empty` | `Ninguém encontrado para "{termo}".` |
| `leadership.unit.notFound` / `.back` | `Unidade não encontrada.` / `Voltar para Liderança` |
| `leadership.person.subtitle` | `{chamado} · {unidade}` |
| `leadership.person.supervises` | `Acompanha: {lista}` |
| `leadership.contact.signIn` / `.signInButton` | `Entre para ver os contatos.` / `Entrar` |
| `leadership.contact.call` / `.whatsapp` / `.copy` / `.copied` | `Ligar` / `WhatsApp` / `Copiar` / `Telefone copiado` |
| `leadership.contact.offline` / `.error` | `Telefone disponível com conexão.` / `Não foi possível carregar o telefone.` |
| `leadership.error` / `.offlineEmpty` / `common` retry | `Não foi possível carregar a liderança.` / `Sem conexão. Conecte-se para ver a liderança.` / `Tentar de novo` |
| `leadership.edit.button` / `.offline` / `.banner` / `.done` | `Editar` / `Editar indisponível sem conexão` / `Modo de edição` / `Concluir` |
| `leadership.edit.sheetTitle` / `.counselor` / `.none` / `.units` / `.save` / `.saved` | `Acompanhamento` / `Conselheiro` / `Nenhum` / `Unidades que acompanha` / `Salvar` / `Acompanhamento salvo` |
| `leadership.edit.error.*` | `Ninguém tem este chamado agora. Conceda o chamado em Acessos primeiro.` / `Você não tem permissão para editar este organograma.` / `Esta pessoa não está mais no sumo conselho.` / `Não foi possível salvar. Tente de novo.` |
| `account.profile.phone` / `.phoneNone` | `Telefone` / `Não informado` |
| `account.phone.title` / `.label` / `.placeholder` / `.show` / `.help` | `Telefone` / `Telefone` / `(48) 99999-0000` / `Mostrar meu telefone no organograma` / `Só pessoas com conta veem, e só nos chamados em que você aparece no organograma.` |
| `account.phone.save` / `.remove` / `.saved` / `.removed` | `Salvar` / `Remover telefone` / `Telefone salvo` / `Telefone removido` |
| `account.phone.invalid` / `.required` | `Informe um telefone com DDD.` / `Informe o telefone para mostrá-lo no organograma.` |
| erro de rede (existente) | `Sem conexão. Verifique a internet e tente de novo.` |

en-US e es-MX recebem as mesmas chaves (paridade de `locales.test.ts`).

## 9. Acessibilidade

| ID | Requisito |
| -- | --------- |
| RNF-09 | Cada pessoa é um botão anunciado como `{nome}, {chamado}`; posição fixa sem pessoa é texto anunciado como `{rótulo}, sem nome no organograma`. |
| RNF-10 | Overlines e títulos de organização têm `accessibilityRole="header"`. Ordem de leitura: `Acompanhada por`, topo, coluna do 1º Conselheiro (posição e itens), coluna do 2º, `Sem conselheiro definido`, secretários, demais seções. As linhas da árvore ficam ocultas do leitor de tela. |
| RNF-11 | Com `fontScale ≥ 1.3`, colunas empilhadas (seção 8); layout sem texto cortado em 1.6×. |
| RNF-12 | Telefone anunciado dígito a dígito (rótulo com espaços: `4 8, 9 9 9 9 9, 0 0 0 0`). Botões com rótulos `Ligar para {nome}`, `Chamar {nome} no WhatsApp`, `Copiar telefone de {nome}`. Copiar existe como botão, não só como toque longo. |
| RNF-13 | Grupos de chips com rótulo (`Conselheiro`, `Unidades que acompanha`); chip marcado anunciado como selecionado; o `Switch` do Perfil é anunciado como `Mostrar meu telefone no organograma`. |
| RNF-14 | Alvos de toque com no mínimo 44 pt (incluindo o ícone `edit` e os itens compactos das colunas). |

## 10. Estrutura de arquivos esperada

```
supabase/migrations/<ts>_leadership.sql        # profile_phones, 3 tabelas de vínculo, RLS, RPCs, export_my_data
supabase/tests/leadership.test.sql             # RLS, RPCs, cascatas, export
supabase/seed.sql                              # alterar: organograma fictício completo (presidência, 6 sumos conselheiros, secretários, bispado e organizações de Criciúma 1, presidência do Ramo Gaivota), telefones e vínculos
src/domain/orgChart.ts (+ teste)               # posições fixas, organização do chamado, montagem das árvores, busca, ordem
src/domain/phone.ts (+ teste)                  # máscara, validação, E.164, formatação, rótulo de acessibilidade, wa.me
src/features/leadership/LeadershipScreen.tsx   # aba: busca, Segmented, árvore da estaca, lista de unidades
src/features/leadership/UnitLeadershipScreen.tsx
src/features/leadership/StakeTree.tsx, UnitTree.tsx, TreeSlot.tsx
src/features/leadership/PersonSheet.tsx
src/features/leadership/HighCouncilorLinkSheet.tsx, OrgCounselorSheet.tsx
src/features/leadership/api.ts                 # queries ['public','leadership','members'], ['public','leadership','links'] e ['leadership','phones'], mutations
src/features/leadership/*.test.tsx
src/features/account/PhoneSheet.tsx (+ teste)
src/features/account/ProfileScreen.tsx, api.ts # alterar: linha Telefone, set_my_phone
src/features/placeholder/screens.tsx           # alterar: remove LeadershipPlaceholder
src/features/navigation/TabsLayout.test.tsx    # alterar
src/app/(tabs)/leadership.tsx                  # alterar: re-exporta LeadershipScreen
src/app/leadership/unit/[id].tsx               # novo: re-exporta UnitLeadershipScreen
src/i18n/locales/*.json                        # leadership.*, account.phone.*
src/lib/database.types.ts                      # make db-types
.ai/docs/BUSINESS.md, SECURITY.md, ARCHITECTURE.md
```

## 11. Critérios de aceitação

| ID | Cobre | Dado | Quando | Então |
| -- | ----- | ---- | ------ | ----- |
| CA-01 | RF-02, RNF-01, RNF-04 | pessoas A e B com telefone | A lê `profile_phones`; `anon` lê; A grava direto um telefone `48999` | A vê só a própria linha; `anon` recebe 0 linhas ou erro de permissão; `set_my_phone('+5548999', true)` retorna `invalid_phone` |
| CA-02 | RF-03, RNF-02 | pessoa visível com `show_on_org_chart = true` e outra com `false` | `anon` chama `org_chart_phones()`; um membro chama | `anon`: erro `42501`; membro: só o telefone da primeira |
| CA-03 | RF-04, RNF-01 | o seed | `anon` e `authenticated` leem `high_council_links`, `high_council_units` e `unit_org_links` | erro de permissão nas 3 |
| CA-04 | RF-05, RNF-05 | conta `estaca` (`stake_leader`) e `bispo.criciuma1` | os dois chamam `set_high_councilor_links(sumo, 'stake_first_counselor', ['icara'])` | `estaca`: grava o vínculo e a unidade; bispo: `forbidden` |
| CA-05 | RF-05 | `stake_leader` | chamo com `p_counselor_calling_id = 'bishop'`; com `stake_second_counselor` sem ninguém com o chamado; com `p_unit_ids = ['estaca']` | `invalid_counselor`; `no_counselor`; `invalid_unit` |
| CA-06 | RF-06, RNF-05 | `bispo.criciuma1`, `publicador.icara` e `admin` | chamam `set_unit_org_counselor('criciuma1', 'primary', 'bishopric_first_counselor')` | bispo: grava; publicador e `admin`: `forbidden` |
| CA-07 | RF-06 | `stake_leader` | chamo para `gaivota` com `bishopric_first_counselor`; para `criciuma1` com `organization = 'young_men'` | `invalid_counselor`; `invalid_organization` |
| CA-08 | RF-04, RF-07, RNF-03, RNF-07 | sumo conselheiro vinculado ao 1º conselheiro | o 1º conselheiro desliga `Mostrar no organograma`; depois o chamado dele é removido em Acessos | 1º passo: `org_chart_links()` ainda devolve `counselor_calling_id = 'stake_first_counselor'` e nenhum `member_call_id` de conselheiro; 2º passo: a linha de `high_council_links` não existe mais |
| CA-09 | RF-07, RNF-03 | sumo conselheiro com vínculos que desligou o organograma | `anon` chama `org_chart_links()` | nenhuma linha com o `member_call_id` dele |
| CA-10 | RF-08, RNF-07 | pessoa com telefone | exporta os dados; depois exclui a conta | JSON tem `phone` com `phone_e164` e `show_on_org_chart`; após excluir, nenhuma linha em `profile_phones` |
| CA-11 | RF-01, RF-09, RF-11, RF-13 | membros visíveis: presidente, 1º conselheiro, 6 sumos conselheiros (3 vinculados a cada conselheiro), 2 secretários, patriarca; 2º conselheiro não visível | monto a árvore da estaca | topo com o presidente; coluna 1 com o 1º conselheiro e seus 3; coluna 2 com `2º Conselheiro` sem nome e os outros 3; faixa com os 2 secretários; cartão do patriarca; ordem por `sort_order` e nome |
| CA-12 | RF-11 | sumo conselheiro visível sem vínculo | monto a árvore da estaca | ele aparece em `Sem conselheiro definido`; sem ninguém sem vínculo, a seção não aparece |
| CA-13 | RF-10, RF-12 | Criciúma 1 com Primária e Moças vinculadas ao 1º conselheiro, Escola Dominical sem vínculo, Líder da Missão visível | monto a árvore | coluna 1 com os blocos `Moças` e `Primária` (nessa ordem); `Sem conselheiro definido` com `Escola Dominical`; `OUTROS` com o Líder da Missão |
| CA-14 | RF-12 | sumo conselheiro visível com vínculo para `icara` | abro a Ala Içara | `ACOMPANHADA POR` com `{nome} (Sumo Conselheiro)` |
| CA-15 | RF-09, RF-12 | Ramo Gaivota sem ninguém visível | abro a tela do ramo | posições `Presidente do Ramo`, `1º Conselheiro`, `2º Conselheiro` sem nomes e `Ainda não há pessoas no organograma desta unidade.` |
| CA-16 | RF-14, RF-15 | o seed | abro a aba e toco em `Unidades` | as 6 unidades na ordem de `unitOrder`, com `Bispado · {n}` nas alas e `Presidência do ramo · {n}` no ramo; tocar em Criciúma 1 abre `/leadership/unit/criciuma1` |
| CA-17 | RF-16 | — | abro `/leadership/unit/estaca` | `Unidade não encontrada.` e `Voltar para Liderança` |
| CA-18 | RF-17 | o seed | busco `secretario`; depois `zzz`; depois `s` | 1º: os secretários com `{chamado} · {unidade}`; 2º: `Ninguém encontrado para "zzz".`; 3º: o conteúdo normal continua |
| CA-19 | RF-18, RF-19 | visitante | toco num sumo conselheiro com telefone visível | ficha com nome, `Sumo Conselheiro · Estaca`, `Acompanha: Ala Içara` e `Entre para ver os contatos.`; `Entrar` abre `/sign-in` com `returnTo` |
| CA-20 | RF-19, RNF-08 | membro logado | abro a mesma ficha | `(48) 99999-0000`, `Ligar`, `WhatsApp` e `Copiar`; `Ligar` abre `tel:+5548999990000`; `WhatsApp` abre `https://wa.me/5548999990000`; abrir uma 2ª ficha não chama `org_chart_phones()` de novo |
| CA-21 | RF-19 | membro logado | toco em `Copiar`; depois, toque longo no número | nos dois, o número vai para a área de transferência e aparece `Telefone copiado` |
| CA-22 | RF-19, 7.6 | membro logado; pessoa com telefone fixo de 10 dígitos; outra sem telefone visível | abro as fichas | 1ª: `Ligar` e `Copiar`, sem `WhatsApp`; 2ª: sem área de contato |
| CA-23 | RF-20, RNF-02 | árvore e telefones carregados; app offline e reaberto | abro a aba e uma ficha | árvore do cache com `OfflineBanner`; ficha com `Telefone disponível com conexão.`; o disco não tem nenhuma chave de telefone |
| CA-24 | RF-21, RF-22 | membro sem telefone | abro o Perfil, toco em `Telefone`, digito `48999990000`, ligo o switch e salvo | subtítulo antes: `Não informado`; toast `Telefone salvo`; `set_my_phone('+5548999990000', true)`; subtítulo depois: `(48) 99999-0000` |
| CA-25 | RF-22 | sheet `Telefone` | salvo `4899999`; salvo vazio com o switch ligado; toco em `Remover telefone` com telefone salvo | `Informe um telefone com DDD.`; `Informe o telefone para mostrá-lo no organograma.`; toast `Telefone removido` e subtítulo `Não informado` |
| CA-26 | RF-23 | `estaca`, `bispo.criciuma1`, `publicador.icara`, membro | abrem a árvore da estaca e a de Criciúma 1 | `Editar` na estaca só para `estaca`; em Criciúma 1, para `estaca` e `bispo.criciuma1`; offline, `Editar` desabilitado |
| CA-27 | RF-24, RF-26 | `estaca` em modo de edição | abro o sumo conselheiro A, escolho `2º Conselheiro` e as unidades `Ala Içara` e `Ala Araranguá`, salvo | toast `Acompanhamento salvo`; A aparece na coluna do 2º Conselheiro; a Ala Araranguá mostra A em `Acompanhada por` |
| CA-28 | RF-25, RF-26 | `bispo.criciuma1` em modo de edição | vejo os blocos; vinculo `Escola Dominical` ao `1º Conselheiro`; repito com o chamado de 1º conselheiro removido | os 5 blocos aparecem (vazios com `Nenhuma pessoa no organograma.`); `Acompanhamento salvo`; depois, `Ninguém tem este chamado agora. Conceda o chamado em Acessos primeiro.` |
| CA-29 | RF-26 | sheet de acompanhamento | o servidor responde `forbidden`; depois falha de rede | `Você não tem permissão para editar este organograma.`; `Sem conexão. Verifique a internet e tente de novo.`; o sheet continua aberto |
| CA-30 | RF-20 | sem cache | a primeira carga falha; depois, offline | `Não foi possível carregar a liderança.` com `Tentar de novo`; `Sem conexão. Conecte-se para ver a liderança.` |
| CA-31 | RNF-06 | — | salvo um vínculo e um telefone | os eventos `org_chart_link_saved` e `profile_phone_saved` não contêm número, nome nem `user_id` |
| CA-32 | RNF-09 a RNF-14 | VoiceOver e TalkBack; fonte em 1.6× | percorro a árvore da estaca, uma unidade, a ficha e o modo de edição | anúncios e ordem de RNF-09 a RNF-13; colunas empilhadas; nada cortado |

## 12. Roteiro de QA

| Passo | Ação | Resultado esperado |
| ----- | ---- | ------------------ |
| 1 | `supabase db reset`; como visitante, abra Liderança | Árvore da estaca com presidente, 2 colunas de sumos conselheiros, secretários, patriarca e organizações |
| 2 | Toque em `Unidades` e abra a Ala Criciúma 1 | Bispado no topo, organizações nas colunas, secretários e `OUTROS` |
| 3 | Abra o Ramo Gaivota | Rótulos `Presidente do Ramo`, `1º Conselheiro`, `2º Conselheiro` |
| 4 | Toque num sumo conselheiro | Ficha com `Acompanha: {unidades}` e `Entre para ver os contatos.` |
| 5 | Busque `primaria` | Pessoas da Primária, sem diferenciar acento |
| 6 | Entre como membro e abra a mesma ficha | Telefone, `Ligar`, `WhatsApp`, `Copiar`; `Ligar` abre o discador |
| 7 | No Perfil, informe `48 99999-0000`, ligue `Mostrar meu telefone no organograma` e salve | Toast `Telefone salvo`; linha `Telefone` com `(48) 99999-0000` |
| 8 | Como `estaca@exemplo.org`, em `Estaca`, toque em `Editar`, mude um sumo conselheiro para o `2º Conselheiro` e marque `Ala Içara` | Toast `Acompanhamento salvo`; ele muda de coluna; a Ala Içara mostra `Acompanhada por` |
| 9 | Como `bispo.criciuma1@exemplo.org`, abra Criciúma 1 › `Editar` e vincule a `Escola Dominical` ao `1º Conselheiro` | O bloco vai para a coluna do 1º Conselheiro; `Editar` não aparece em `Estaca` nem em outras unidades |
| 10 | Ative o modo avião e reabra o app | Árvore do cache com aviso; ficha com `Telefone disponível com conexão.`; `Editar` desabilitado |
| 11 | Percorra as telas com VoiceOver (iOS) e TalkBack (Android), e com fonte em 1.6× | Anúncios de RNF-09 a RNF-13; colunas empilhadas |

## 13. Definition of Done

- [ ] `make check` e `make test-db` passam
- [ ] Todo `CA` tem teste automatizado com o ID no nome, ou justificativa de teste manual no plano (CA-32 manual; CA-20 e CA-21 com `Linking` e clipboard simulados)
- [ ] Roteiro de QA executado sem divergências em iOS e Android
- [ ] Registro de implementação preenchido no plano
- [ ] Nenhum segredo, dado pessoal ou log sensível introduzido (ver `.ai/docs/SECURITY.md`)
- [ ] `SECURITY.md`: linha do organograma só com `member_calls`/`org_chart_members()`; linha nova "Telefone da pessoa" (`profile_phones`, pessoal, só logados e só com o switch ligado, até a pessoa remover ou excluir a conta); RLS de `leadership_positions` substituída pelas tabelas desta spec; exportação com `phone`
- [ ] `BUSINESS.md`: entidade `LeadershipPosition` substituída pelos vínculos de acompanhamento; glossário `Liderança` → `org_chart_members()`; organização `sunday_school` no glossário (só para o organograma); RN-02 sem "publicar liderança"
- [ ] `ARCHITECTURE.md`: padrão "Organograma" (`src/domain/orgChart.ts`, cache `['public','leadership','members']` e `['public','leadership','links']`, telefones fora do cache)
- [ ] `expo-clipboard` instalado com `npx expo install`

## 14. Decisões em aberto

Nenhuma decisão em aberto.

| # | Pergunta | Decisão | Origem |
| - | -------- | ------- | ------ |
| 1 | Fonte das pessoas | Só `member_calls` com consentimento aceito (`org_chart_members()`); cadastro manual e declaração de consentimento por terceiros saem (substitui a decisão 15 de `roles-of-leadership`) | usuário (2026-11-16) |
| 2 | Telefone | Cada pessoa informa no Perfil, com `Mostrar meu telefone no organograma`; só pessoas logadas veem | usuário (2026-11-16) |
| 3 | Spec existente | Sobrescrita, IDs novos (nunca foi planejada) | usuário |
| 4 | Navegação da aba | Busca + `Segmented` `Estaca` \| `Unidades`; cada unidade abre a própria árvore | usuário |
| 5 | Árvore da estaca | Presidente no topo; 2 colunas por conselheiro com os sumos conselheiros; faixa de secretários; patriarca em cartão próprio; organizações abaixo | usuário |
| 6 | Árvore da ala e do ramo | Espelho da estaca: topo, 2 colunas por conselheiro com organizações, secretários, `Outros` | usuário |
| 7 | Alvo do vínculo | A pessoa do conselheiro (`member_calls.id`); some em cascata quando o chamado é removido | usuário |
| 8 | Quem edita e onde | `stake_leader` na estaca e `can_lead` na unidade, pelo modo de edição da árvore | usuário |
| 9 | Unidades acompanhadas pelo sumo conselheiro | Sim, 0 ou mais; `Acompanhada por` na unidade | usuário |
| 10 | Designações em texto livre | Fora desta entrega | usuário |
| 11 | Onde informar o telefone | Linha `Telefone` no Perfil, para qualquer conta | usuário |
| 12 | Ficha da pessoa | `Sheet`, sem rota própria | usuário |
| 13 | Posição fixa sem pessoa visível | Só o rótulo, sem nome (não revela vaga nem recusa) | usuário |
| 14 | Escolha do conselheiro na edição | Pelo chamado (`1º`/`2º Conselheiro`); o servidor resolve quem o tem (`granted_at` mais antigo se houver mais de um) | padrão do projeto |
| 15 | Tabela do telefone | `profile_phones` separada de `profiles`, só o dono lê; exposição só por `org_chart_phones()` | padrão do projeto |
| 16 | Formato e ações do telefone | E.164 brasileiro (10 ou 11 dígitos); `Ligar`, `WhatsApp` (só celular) e `Copiar` (decisão 27 da versão anterior) | padrão do projeto |
| 17 | Visitante e contato | `Entre para ver os contatos.` sempre, sem revelar se a pessoa compartilha | padrão do projeto |
| 18 | Offline | Árvore no cache público; telefones nunca em disco; edição desabilitada | padrão do projeto |
| 19 | Agrupamento por organização | Pelo `calling_id` (RF-10); o resto vai para `Outros` | padrão do projeto |
| 20 | Ordem | `sort_order` do catálogo e nome; sem reordenação manual | padrão do projeto |
| 21 | Fonte ampliada | Colunas empilhadas a partir de 1.3× | padrão do projeto |
| 22 | Busca | 2+ caracteres, nome e chamado, sem acento (decisão da versão anterior) | padrão do projeto |
| 23 | Dependência nova | `expo-clipboard` (SDK 58) para copiar | padrão do projeto |
| 24 | Skills | `vercel-react-native-skills`, `ecc:postgres-patterns`, `ecc:accessibility`, `ecc:react-testing` | padrão do projeto |

## 15. Próximos passos (fora desta entrega)

- Designações em texto livre e vínculos de conselheiro a secretários e organizações da estaca.
- Foto opcional e horários de atendimento.
- Link direto para a ficha de uma pessoa (a partir de avisos ou push).
