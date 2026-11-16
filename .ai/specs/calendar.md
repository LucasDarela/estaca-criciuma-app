# Agenda pública

> **Status:** Em implementação
> **Área:** aba `agenda`, rota `/event/[id]`, `src/features/calendar/`, `src/lib/queryPersistence.ts`, `supabase/migrations/`
> **Última atualização:** 2026-11-13

## 0. Skills obrigatórias

| Skill | Quando usar |
| ----- | ----------- |
| `vercel-react-native-skills` | Grade do mês, listas, linha do tempo do dia e cache persistido |
| `ecc:postgres-patterns` | Tabela `events`, índices por período e RLS de leitura pública |
| `ecc:accessibility` | Grade de calendário, filtros e detalhe acessíveis |
| `ecc:react-testing` | Testes de filtros, navegação de período e estados |

## 1. Contexto

A agenda é o centro do app e a base da métrica de sucesso (80% dos eventos publicados no app). Visitantes e membros precisam ver o que acontece na estaca e nas unidades, quando e onde, sem conta (RN-01), com filtros por unidade (RN-06) e tipo. Esta spec cria a tabela de eventos e a leitura; criar e editar eventos fica em `event-form`.

## 2. Objetivo

Qualquer pessoa abre a aba Agenda, vê os eventos em mês, semana ou dia, filtra por unidade, tipo ou texto, abre o detalhe e adiciona o evento ao calendário do celular ou abre o local no app de mapas, inclusive sem conexão com a última versão salva.

## 3. Estado atual

| Item | Situação | Destino |
| ---- | -------- | ------- |
| Aba `agenda` | Tela provisória (`design-system`) | Substituir |
| Componentes (`EventCard`, `SearchField`, `FilterChip`, `Segmented`, `UnitTag`, `OfflineBanner`, `EmptyState`) | Prontos | Usar |
| `units`, `can_publish` | `app-foundation` | Usar |
| Tabela de eventos | Não existe | Criar |
| Cache persistido | Não existe | Criar (reutilizado por `board` e `leadership`) |

## 4. Tecnologias e versões

| Tecnologia | Versão | Situação | Uso nesta entrega |
| ---------- | ------ | -------- | ----------------- |
| `@tanstack/react-query-persist-client` + `@tanstack/query-async-storage-persister` | 5.x | adicionar | Cache offline de dados públicos |
| `@react-native-async-storage/async-storage` | do SDK 58 | adicionar (se `auth-account` ainda não adicionou) | Armazenamento do cache |
| `@react-native-community/netinfo` | do SDK 58 | adicionar | Detectar sem conexão |
| `expo-calendar` | do SDK 58 | adicionar | Diálogo nativo "Adicionar à agenda" |
| `Share` (React Native) | do RN | instalada | Compartilhar |

## 5. Restrições e requisitos não funcionais

| ID | Requisito |
| -- | --------- |
| RNF-01 | Só dados públicos vão para o cache persistido: chaves de query com prefixo `['public', ...]`. Nada de pauta, anotação ou chamado. |
| RNF-02 | Cache persistido válido por 7 dias (`maxAge`); dados considerados frescos por 5 min (`staleTime`). |
| RNF-03 | Leitura por intervalo: o app busca só eventos que se sobrepõem ao período visível ± 1 mês; índice em (`starts_at`, `ends_at`). |
| RNF-04 | Datas gravadas em `timestamptz`; exibidas em `America/Sao_Paulo` e no formato do idioma ativo. |
| RNF-05 | Trocar de mês, semana ou dia com dados em cache responde em até 100 ms (sem spinner); só a primeira carga mostra `Skeleton`. |
| RNF-06 | "Adicionar à agenda" não pede acesso total ao calendário: usa o diálogo do sistema (`createEventInCalendarAsync`). |

## 6. Escopo

### 6.1 Incluso

- Tabela `events` (leitura pública) e seed com eventos de exemplo.
- Aba Agenda: cabeçalho, busca, filtro de unidade, filtro de tipo, visões Mês/Semana/Dia, navegação de período e `Hoje`.
- Detalhe do evento (`/event/[id]`): dados, `Abrir no mapa`, `Adicionar à agenda`, `Compartilhar`.
- Cache persistido de dados públicos e aviso de offline (reutilizável).
- Sino de notificações no cabeçalho, que abre `/notifications` (o ponto de não lidas e a tela vêm em `push-notifications`).

### 6.2 Não incluso

- Criar, editar e excluir eventos; botão `+`; pauta de reunião (`event-form`).
- Eventos recorrentes.
- Mapa embutido e geocodificação.
- Link que abre o app a partir de outro aparelho (sem domínio ainda).

## 7. Especificação funcional

### 7.1 Dados

| ID | Requisito |
| -- | --------- |
| RF-01 | `events`: `id uuid`, `unit_id` → `units`, `type` (`activity` \| `meeting` \| `training` \| `conference` \| `caravan`), `title` (1–80), `starts_at`, `ends_at` (`ends_at > starts_at`), `location` (0–160), `notes` (0–1000), `links text[]` (até 5, cada um `https://`, até 500), `created_by uuid null`, `created_at`, `updated_at`. Leitura para `anon` e `authenticated`; escrita definida em `event-form`. |
| RF-02 | Rótulos de tipo (singular / plural / ícone): `Atividade` / `Atividades` / `celebration`; `Reunião` / `Reuniões` / `forum`; `Treinamento` / `Treinamentos` / `school`; `Conferência` / `Conferências` / `podium`; `Caravana` / `Caravanas` / `directions_bus`. |

### 7.2 Aba Agenda

| ID | Requisito |
| -- | --------- |
| RF-03 | Cabeçalho: overline `ESTACA CRICIÚMA`, título `Agenda`, botão de sino (`notifications`) que abre `/notifications`; avatar quando logado. |
| RF-04 | Busca `Buscar evento`: filtra, ignorando maiúsculas e acentos, por título, tipo (singular e plural), local e nome da unidade. |
| RF-05 | Filtro de unidade (botão com ponto de cor e nome, abre lista): `Todas` (padrão) + 7 unidades na ordem de `unitOrder`, com ✓ na atual. |
| RF-06 | Filtro de tipo (chips roláveis): `Todos os tipos` (padrão) + os 5 plurais de RF-02. Um tipo por vez. |
| RF-07 | `Segmented` `Mês` (padrão) / `Semana` / `Dia`, setas anterior/próximo e botão `Hoje`. Rótulo do período: Mês `Novembro 2026`; Semana `8 nov – 14 nov`; Dia `Sex, 13 nov`. Semana começa no domingo. As setas movem 1 mês, 1 semana ou 1 dia mantendo o dia selecionado (no mês, limitado ao último dia). `Hoje` seleciona a data atual. |
| RF-08 | Mês: grade 7 colunas (`D S T Q Q S S`) com dias do mês anterior/seguinte em cinza; até 3 pontos com as cores das unidades que têm eventos no dia; hoje com contorno `primary`; selecionado com fundo `primary`. Abaixo, `{Dia da semana}, {d} de {mês}` + `{n} evento(s)` e os `EventCard`s do dia, ou `Nenhum evento neste dia com os filtros atuais.` |
| RF-09 | Semana: faixa dos 7 dias (mesmo destaque do mês) e grupos por dia com eventos (`{Dia da semana}, {d} {mês abreviado}` + `Hoje` quando for o caso); sem eventos: `Nenhum evento nesta semana com os filtros atuais.` |
| RF-10 | Dia: faixa da semana e linha do tempo das 06:00 às 22:00 (44 px por hora) com blocos na cor da unidade (fundo `tint`, borda esquerda `dot`), título e `{início}–{fim} · {unidade}`; linha `danger` do horário atual quando o dia é hoje; sem eventos: `Nenhum evento neste dia`. Eventos fora da janela aparecem presos na borda (início antes das 06:00 começa em 06:00). |
| RF-11 | `EventCard`: ícone do tipo + `{início}–{fim} · {tipo}`, título, local, `UnitTag`. Evento de vários dias aparece em cada dia que cobre, com `{início}` no 1º dia, `Dia todo` nos intermediários e `até {fim}` no último. |

### 7.3 Detalhe do evento

| ID | Requisito |
| -- | --------- |
| RF-12 | `/event/[id]`: voltar; overline com ícone e tipo; título (serif 26); data `{Dia da semana}, {d} de {mês} de {aaaa}` (vários dias: `{d} de {mês} – {d} de {mês} de {aaaa}`); horário `{início} – {fim}`; local com ícone `location_on`; `UnitTag`; `Notas` (se houver); `Links` (cada um abre no navegador); botões `Adicionar à agenda` (`secondary`), `Compartilhar` (`outline`); `Abrir no mapa` (link ao lado do local, só se houver local). |
| RF-13 | `Abrir no mapa`: iOS abre `maps:?q={local}`; Android abre `geo:0,0?q={local}`; se não abrir, `https://www.google.com/maps/search/?api=1&query={local}`. |
| RF-14 | `Adicionar à agenda`: diálogo do sistema pré-preenchido (título, início, fim, local, notas + links). Concluído: toast `Evento adicionado à sua agenda.`; cancelado: nada. |
| RF-15 | `Compartilhar`: texto `{título}\n{data} · {início}–{fim}\n{local}\n{unidade}` + links, um por linha. |
| RF-16 | Evento inexistente ou excluído: `EmptyState` `Este evento não está mais disponível.` com o botão `Ver agenda`. |

### 7.4 Offline e carregamento

| ID | Requisito |
| -- | --------- |
| RF-17 | Primeira carga sem cache: `Skeleton` de 3 cards. Erro sem cache: `EmptyState` `Não foi possível carregar a agenda.` + botão `Tentar de novo`. |
| RF-18 | Sem conexão com cache: mostra o cache e o `OfflineBanner` (`Sem conexão. Mostrando a última versão salva.`); ao reconectar, atualiza e o banner some. |

### 7.5 Casos de borda

| Situação | Comportamento |
| -------- | ------------- |
| Mais de 3 unidades com evento no mesmo dia | 3 pontos (ordem de `unitOrder`); a lista abaixo mostra todos |
| Busca sem resultados no período | Mensagens de vazio de RF-08/RF-09/RF-10 |
| Evento termina à meia-noite | Não aparece no dia seguinte (`ends_at` exclusivo) |
| Mudança de horário de verão | Não se aplica a `America/Sao_Paulo` (sem horário de verão desde 2019); horários seguem o fuso |
| Evento excluído enquanto o detalhe está aberto | Ao atualizar, RF-16 |
| Calendário do sistema indisponível | Toast `Não foi possível abrir a agenda do celular.` |

## 8. Especificação de UI/UX

- Layout e medidas como `AgendaScreen.dc.html`: cabeçalho branco com borda inferior; busca (40) + filtro de unidade (máx. 142 de largura); chips de tipo 32; `Segmented` compacto; barra de período com setas circulares 32 (`primarySubtle`) e `Hoje` com contorno.
- Grade do mês com células de 41 de altura; círculo do número 30.
- Detalhe em tela cheia com rolagem; botões no fim do conteúdo, não fixos.

## 9. Acessibilidade

| ID | Requisito |
| -- | --------- |
| RNF-07 | Cada dia da grade é um botão com rótulo `{d} de {mês}, {n} eventos` (ou `sem eventos`) e `selected` quando selecionado; `Hoje` incluído no rótulo do dia atual. |
| RNF-08 | Os pontos de unidade não são a única informação: o rótulo e a lista abaixo informam a unidade. |
| RNF-09 | Trocar de período anuncia o novo rótulo (`Novembro 2026`). |
| RNF-10 | Blocos da visão Dia são botões que abrem o detalhe, com rótulo `{título}, {início} a {fim}, {unidade}`. |

## 10. Estrutura de arquivos esperada

```
supabase/migrations/<ts>_events.sql                # tabela, índices, RLS de leitura
supabase/seed.sql                                  # alterar: ~20 eventos de exemplo em 3 meses
supabase/tests/events_read.test.sql
src/domain/calendar.ts (+ test)                    # grade do mês, semana, janela do dia, eventos multi-dia, filtros, busca normalizada
src/domain/eventTypes.ts                           # tipos, rótulos e ícones (RF-02)
src/features/calendar/api.ts                       # useEventsInRange, useEvent
src/features/calendar/AgendaScreen.tsx, MonthView.tsx, WeekView.tsx, DayView.tsx, UnitFilterSheet.tsx (+ testes)
src/features/calendar/EventDetailScreen.tsx (+ teste)
src/lib/queryPersistence.ts                        # persister + regra de RNF-01
src/lib/network.ts                                 # useIsOnline
src/app/(tabs)/agenda.tsx, src/app/event/[id].tsx, src/app/notifications.tsx (provisória)
src/i18n/locales/*.json                            # calendar.*
```

## 11. Critérios de aceitação

| ID | Cobre | Dado | Quando | Então |
| -- | ----- | ---- | ------ | ----- |
| CA-01 | RF-01 | o seed | um cliente `anon` lê `events` e tenta inserir | lê; inserir é negado |
| CA-02 | RF-01 | um evento com `ends_at <= starts_at` | insiro no banco | a constraint rejeita |
| CA-03 | RF-03, RF-07, RF-08 | a aba Agenda em 13/11/2026 | abro | vejo `Agenda`, `Novembro 2026`, o dia 13 selecionado e os eventos dele |
| CA-04 | RF-04 | eventos `Conferência de Estaca` e `Noite de jogos` | busco `conferencia` | só o primeiro aparece |
| CA-05 | RF-05 | filtro `Ala Içara` | olho a grade | só aparecem pontos e cards de Içara |
| CA-06 | RF-02, RF-06 | chip `Reuniões` | olho a lista | só eventos do tipo `meeting` |
| CA-07 | RF-07 | dia 31/01 selecionado em Mês | toco em próximo | o mês é `Fevereiro` e o dia selecionado é 28 (ou 29) |
| CA-08 | RF-07 | qualquer período | toco em `Hoje` | a data atual fica selecionada |
| CA-09 | RF-08 | um dia com 4 unidades com eventos | olho a célula | 3 pontos |
| CA-10 | RF-09 | semana sem eventos | troco para `Semana` | `Nenhum evento nesta semana com os filtros atuais.` |
| CA-11 | RF-10 | evento das 05:00 às 07:00 no dia | troco para `Dia` | o bloco começa na linha das 06:00 |
| CA-12 | RF-11 | evento de 14/11 18:00 a 16/11 12:00 | olho os dias 14, 15 e 16 | `18:00`, `Dia todo` e `até 12:00` |
| CA-13 | RF-12 | um evento com local, notas e 2 links | abro o detalhe | vejo todos os campos e os 3 botões |
| CA-14 | RF-13 | o detalhe com local | toco em `Abrir no mapa` | abre o app de mapas com o local |
| CA-15 | RF-14, RNF-06 | o detalhe | toco em `Adicionar à agenda` e confirmo | abre o diálogo do sistema sem pedir acesso total; depois, toast `Evento adicionado à sua agenda.` |
| CA-16 | RF-15 | o detalhe | toco em `Compartilhar` | o texto segue o formato de RF-15 |
| CA-17 | RF-16 | id inexistente | abro `/event/<id>` | `Este evento não está mais disponível.` e `Ver agenda` |
| CA-18 | RF-17 | sem cache e com erro de rede | abro a aba | `Não foi possível carregar a agenda.` e `Tentar de novo` |
| CA-19 | RF-18, RNF-01, RNF-02 | agenda carregada uma vez | fico offline e reabro o app | vejo os eventos e o banner de offline; o cache só tem chaves `['public', ...]` |
| CA-20 | RNF-04 | evento às 19:30 de Brasília e aparelho no fuso de Lisboa | abro o detalhe | vejo `19:30` |
| CA-21 | RF-03 | a aba Agenda | toco no sino | abre `/notifications` |
| CA-22 | RNF-07 a RNF-10 | a aba com VoiceOver/TalkBack | percorro a grade, os filtros e a visão Dia | rótulos de RNF-07 e RNF-10 anunciados; troca de período anunciada |

## 12. Roteiro de QA

| Passo | Ação | Resultado esperado |
| ----- | ---- | ------------------ |
| 1 | Abra o app como visitante | Agenda do mês atual com os eventos do seed |
| 2 | Filtre `Ala Içara`, depois `Reuniões`, depois busque `conselho` | Lista reduz a cada filtro; vazio com a mensagem certa |
| 3 | Navegue 3 meses para frente e toque em `Hoje` | Volta ao dia atual |
| 4 | Visão `Dia` num dia com eventos | Blocos nos horários certos e linha do agora no dia atual |
| 5 | Abra um evento, toque em `Abrir no mapa`, `Adicionar à agenda` e `Compartilhar` | Apps do sistema abrem com os dados corretos |
| 6 | Ative o modo avião e reabra o app | Eventos aparecem com o banner de offline |
| 7 | Repita os passos 1 a 4 em pt-BR, en-US e es-MX | Datas e rótulos no idioma |
| 8 | VoiceOver/TalkBack na grade do mês | Rótulos de RNF-07 |

## 13. Definition of Done

- [ ] `make check` e `make test-db` passam
- [ ] Todo `CA` tem teste automatizado com o ID no nome, ou justificativa de teste manual no plano (CA-14, CA-15, CA-22 podem ser manuais)
- [ ] Fluxo Maestro `.maestro/agenda-publica.yaml` (abrir agenda, filtrar, abrir detalhe) passa localmente
- [ ] Roteiro de QA executado sem divergências em iOS e Android
- [ ] Registro de implementação preenchido no plano
- [ ] Nenhum segredo, dado pessoal ou log sensível introduzido (ver `.ai/docs/SECURITY.md`)

## 14. Decisões em aberto

Nenhuma decisão em aberto.

| # | Pergunta | Decisão | Origem |
| - | -------- | ------- | ------ |
| 9 | Mapa e "Adicionar à agenda" | Apps do sistema; sem mapa embutido | usuário |
| 10 | Offline | Cache persistido só de dados públicos | usuário |
| A1 | Recorrência | Fora; evento de vários dias coberto | padrão do projeto |
| A2 | Compartilhar | Texto, sem link para o app | padrão do projeto |
| A3 | Rascunhos | Não existem; todo evento salvo é público | padrão do projeto |
| A4 | Início da semana | Domingo (como o design) | padrão do projeto |
| A5 | Janela da visão Dia | 06:00–22:00 (como o design) | padrão do projeto |

## 15. Próximos passos (fora desta entrega)

- `push-notifications`: ponto de não lidas no sino e tela Notificações.
- `event-form`: botão `+`, criar, editar, excluir e pauta.
