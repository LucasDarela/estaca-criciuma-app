# Anotações pessoais: lembretes, texto e desenho

> **Status:** Pronta para planejamento
> **Área:** aba `notes`, rotas `/notes/*`, `src/features/notes/`, `src/domain/markdown.ts`, `src/lib/reminderLog.ts`, `supabase/migrations/`
> **Última atualização:** 2026-11-13

## 0. Skills obrigatórias

| Skill | Quando usar |
| ----- | ----------- |
| `vercel-react-native-skills` | Skia, editor de texto, listas e notificações locais |
| `ecc:postgres-patterns` | Tabela `notes` com RLS só do dono |
| `ecc:accessibility` | Editor, checklist, desenho (alternativa textual) |
| `ecc:react-testing` | Markdown, lembretes, exclusão com desfazer |

## 1. Contexto

Membros anotam impressões de reuniões, visitas de ministração e lembretes em papel ou em apps soltos. As anotações são privadas do autor (RN-03) e sensíveis: só ficam no servidor, protegidas por RLS, e exigem conexão (decisão 22). O design prevê três modos: lembrete, texto e desenho à mão livre.

## 2. Objetivo

Quem tem conta cria, lê, edita e exclui as próprias anotações nos modos Lembrete (com notificação local na hora marcada), Texto (Markdown leve com barra de formatação) e Desenho (traços salvos como vetor), e ninguém mais acessa essas anotações.

## 3. Estado atual

| Item | Situação | Destino |
| ---- | -------- | ------- |
| Aba `notes` | Tela provisória (só Membro e Líder) | Substituir |
| `expo-notifications` | `push-notifications` | Usar para notificação local |
| `reminderLog` | `push-notifications` (leitura) | Escrever ao agendar e apagar ao excluir/concluir |
| `export_my_data`, `delete_my_account` | `auth-account` | `export_my_data` exporta perfil e papéis: alterar para incluir `notes` (decisão 16 de `auth-account`). `delete_my_account` já apaga `notes` pelo `on delete cascade` |

## 4. Tecnologias e versões

| Tecnologia | Versão | Situação | Uso nesta entrega |
| ---------- | ------ | -------- | ----------------- |
| `@shopify/react-native-skia` | do SDK 58 | adicionar | Desenho |
| `expo-notifications` | do SDK 58 | instalada (push) | Lembrete local |
| `@react-native-community/datetimepicker` | do SDK 58 | instalada (event-form) | Data e hora do lembrete |

## 5. Restrições e requisitos não funcionais

| ID | Requisito |
| -- | --------- |
| RNF-01 | `notes` com RLS: todas as operações só com `user_id = auth.uid()`; nenhuma política para outros papéis, inclusive `admin`. |
| RNF-02 | Nada de anotação no cache persistido nem em AsyncStorage, exceto o `reminderLog` (`noteId`, título, `fireAt`) exigido pela decisão 15. |
| RNF-03 | Notificação local do lembrete com título `Lembrete` e corpo = título da anotação; nunca o conteúdo de notas de texto. |
| RNF-04 | Conteúdo de anotação nunca vai para logs ou Sentry. |
| RNF-05 | Desenho salvo como JSON vetorial: `{ v: 1, width, height, strokes: [{ color, width, points: [[x,y],...] }] }`, até 200 KB. |
| RNF-06 | Texto até 20 000 caracteres. |

## 6. Escopo

### 6.1 Incluso

- Tabela `notes` com RLS.
- Aba Anotações: `Segmented` Lembrete/Texto/Desenho, listas, `+`.
- Lembretes: criar, editar, concluir, excluir, notificação local, `reminderLog`.
- Texto: editor com barra (negrito, itálico, lista, checklist), leitura renderizada, checklist tocável, salvamento automático.
- Desenho: tela de 4 cores, `Limpar`, salvamento automático, miniaturas.
- Excluir com `Desfazer`.
- Estado sem conexão.

### 6.2 Não incluso

- Leitura ou edição offline.
- Compartilhar anotações; pastas, etiquetas, busca.
- Borracha, desfazer traço, espessuras.
- Lembretes recorrentes.

## 7. Especificação funcional

### 7.1 Dados

| ID | Requisito |
| -- | --------- |
| RF-01 | `notes`: `id`, `user_id` → `profiles on delete cascade`, `kind` (`reminder` \| `text` \| `drawing`), `title` (0–120), `body text null` (texto, ≤ 20 000), `remind_at timestamptz null` (lembrete), `done bool` (lembrete), `drawing jsonb null` (RNF-05), `created_at`, `updated_at`. |

### 7.2 Aba

| ID | Requisito |
| -- | --------- |
| RF-02 | Cabeçalho `Anotações`, botão `add` (`primary`, rótulo `Nova anotação`), avatar; `Segmented` `Lembrete` (`alarm`) / `Texto` (`notes`) / `Desenho` (`draw`), padrão `Lembrete`, lembrando o último modo durante a sessão. `+` cria no modo atual. |
| RF-03 | Lembretes: pendentes por `remind_at` crescente, depois concluídos (opacidade 0,6, título riscado). Card: círculo de conclusão, título, `{Dia abreviado}, {d} {mês abreviado} · {HH:mm}` em `primary` (vencido e pendente: `danger`). Vazio: `Nenhum lembrete. Toque em + para criar.` |
| RF-04 | Textos: cards com título (ou `Sem título`), `Editado {hoje, HH:mm \| ontem \| d mês}` e 2 linhas de prévia sem marcações. Vazio: `Nenhuma anotação de texto. Toque em + para criar.` |
| RF-05 | Desenhos: grade de 2 colunas com miniatura e título (ou `Sem título`). Vazio: `Nenhum desenho. Toque em + para criar.` |
| RF-06 | Sem conexão: `EmptyState` `Sem conexão. Suas anotações aparecem quando a internet voltar.` com `Tentar de novo`; `+` desabilitado. |

### 7.3 Lembrete

| ID | Requisito |
| -- | --------- |
| RF-07 | `Sheet` `Novo lembrete`/`Editar lembrete`: `Lembrete` (obrigatório, 1–120, placeholder `Ex.: Levar hinários para a conferência`), `Data` e `Hora` (padrão: amanhã 09:00), botões `Salvar` e, na edição, `Excluir`. Mensagens: `Escreva o lembrete.`, `Use até 120 caracteres.`, `Escolha um horário no futuro.` |
| RF-08 | Salvar agenda notificação local em `remind_at` (RNF-03), substituindo a anterior da mesma anotação, e grava no `reminderLog`. Sem permissão de notificação: salva e mostra `Ative as notificações nas configurações para receber o lembrete.` |
| RF-09 | Tocar no círculo conclui (cancela a notificação, mantém no `reminderLog` só se já disparou) ou reabre (reagenda se `remind_at` futuro). |
| RF-10 | Tocar na notificação abre `/notes/{id}` (o sheet do lembrete). |

### 7.4 Texto

| ID | Requisito |
| -- | --------- |
| RF-11 | `/notes/{id}` de texto abre em leitura: `Editado {...}`, título serif 21, corpo renderizado (serif 16/26). Botão `Editar` (ícone `edit`) entra em edição; nova anotação já abre em edição. |
| RF-12 | Edição: campo `Título` (opcional, até 120, placeholder `Título`) e corpo multilinha (placeholder `Escreva aqui...`); barra fixa acima do teclado com `format_bold`, `format_italic`, `format_list_bulleted`, `checklist`. |
| RF-13 | Barra: com seleção, `negrito` envolve em `**…**` e `itálico` em `_…_`; sem seleção, insere o par e põe o cursor no meio. `lista` e `checklist` inserem `- ` ou `- [ ] ` no início da linha atual (tocar de novo remove). |
| RF-14 | Renderização (`src/domain/markdown.ts`, sem dependência): `**negrito**`, `_itálico_`, linhas `- ` como lista, `- [ ] `/`- [x] ` como checklist; o resto é texto literal (sem HTML, sem links ativos além de `https://`). Na leitura, tocar num item de checklist alterna `[ ]`/`[x]` e salva. |
| RF-15 | Salvamento automático 1 s após parar de digitar e ao sair; indicador `Salvando...` / `Salvo` ao lado de `Editado`. Falha: `Não foi possível salvar. Verifique a internet.` e o texto continua no editor. Nota nova vazia (título e corpo vazios) ao sair não é criada. |

### 7.5 Desenho

| ID | Requisito |
| -- | --------- |
| RF-16 | `/notes/{id}` de desenho: campo `Título` (opcional, até 120), tela branca raio 16 com largura total e proporção 296:420, dica `Desenhe aqui com o dedo` enquanto vazia; barra com 4 cores (`#005175` padrão, `#BD0057`, `#235C35`, `#212225`, anel na selecionada) e `delete` (`Limpar`). Traço de espessura 3, pontas arredondadas. |
| RF-17 | `Limpar` → `ConfirmSheet` `Limpar desenho?` / `Todos os traços serão apagados.` / `Limpar` / `Cancelar`. |
| RF-18 | Salvamento automático ao fim de cada traço (debounce 1 s) e ao sair, no formato de RNF-05 com coordenadas relativas à tela 296×420. Acima de 200 KB: `O desenho ficou grande demais para salvar. Limpe alguns traços.` |

### 7.6 Excluir

| ID | Requisito |
| -- | --------- |
| RF-19 | Excluir (botão `delete` no cabeçalho da anotação ou `Excluir` no sheet do lembrete) some da lista na hora e mostra o toast `Anotação excluída` com `Desfazer` (6 s). Sem desfazer, apaga no servidor, cancela a notificação e remove do `reminderLog`. |

### 7.7 Casos de borda

| Situação | Comportamento |
| -------- | ------------- |
| Conexão cai durante a edição | RF-15/RF-18 mostram falha; ao voltar, salva de novo |
| App fechado com edição pendente | O que não foi salvo se perde; o salvamento ao sair (background) tenta antes |
| Mesma conta em dois aparelhos | Vale o último salvamento; lembretes são agendados no aparelho que salvou |
| Lembrete com horário que já passou ao reabrir | Fica pendente em `danger` até ser concluído |
| Conta excluída | Notas apagadas em cascata; o app limpa o `reminderLog` e cancela notificações locais ao sair |

## 8. Especificação de UI/UX

- Como "Minhas anotações · logado" do design: `Segmented` com ícones; cards brancos raio 14 com borda `border`; círculo de conclusão 22 com borda 2 `primary` (concluído: preenchido com `check`).
- Leitura do texto em serif (`type.reading`); edição em sans.
- Desenho com a barra de cores abaixo da tela, em bloco branco raio 14.

## 9. Acessibilidade

| ID | Requisito |
| -- | --------- |
| RNF-07 | Círculo de conclusão é `checkbox` com rótulo `Concluir "{título}"`. |
| RNF-08 | Botões da barra com rótulos `Negrito`, `Itálico`, `Lista`, `Checklist`. |
| RNF-09 | Itens de checklist na leitura são `checkbox`. |
| RNF-10 | A tela de desenho tem rótulo `Área de desenho` e o título serve de descrição; cores anunciadas por nome (`Azul`, `Vermelho`, `Verde`, `Preto`). |

## 10. Estrutura de arquivos esperada

```
supabase/migrations/<ts>_notes.sql            # tabela e RLS só do dono
supabase/tests/notes.test.sql
src/domain/markdown.ts (+ test)               # parse/render e operações da barra (RF-13/RF-14)
src/domain/drawing.ts (+ test)                # serialização, limite de tamanho
src/features/notes/NotesScreen.tsx, ReminderSheet.tsx, TextNoteScreen.tsx, DrawingNoteScreen.tsx, NoteCard.tsx (+ testes)
src/features/notes/api.ts, src/features/notes/reminders.ts   # CRUD e agendamento local
src/lib/reminderLog.ts                        # alterar: escrita
src/app/(tabs)/notes.tsx, src/app/notes/[id].tsx, src/app/notes/new.tsx
src/i18n/locales/*.json                       # notes.*
```

## 11. Critérios de aceitação

| ID | Cobre | Dado | Quando | Então |
| -- | ----- | ---- | ------ | ----- |
| CA-01 | RF-01, RNF-01 | contas A, B e `admin` | B e `admin` leem as notas de A pela API | 0 linhas |
| CA-02 | RF-02 | membro logado | abro Anotações | `Segmented` em `Lembrete`; `+` cria lembrete |
| CA-03 | RF-03 | 2 pendentes (um vencido) e 1 concluído | olho a lista | pendentes por data (vencido em `danger`), concluído no fim riscado |
| CA-04 | RF-06 | sem conexão | abro a aba | `Sem conexão. Suas anotações aparecem quando a internet voltar.` e `+` desabilitado |
| CA-05 | RF-07 | sheet de lembrete | salvo com horário passado | `Escolha um horário no futuro.` |
| CA-06 | RF-08, RNF-03 | lembrete para amanhã 09:00 | salvo | notificação local agendada com título `Lembrete` e corpo = título; entrada no `reminderLog` |
| CA-07 | RF-08 | permissão negada | salvo | salvo e `Ative as notificações nas configurações para receber o lembrete.` |
| CA-08 | RF-09 | lembrete pendente | toco no círculo | concluído e notificação cancelada |
| CA-09 | RF-12, RF-13 | texto `oi` selecionado | toco em negrito | vira `**oi**` |
| CA-10 | RF-13 | cursor numa linha `itens` | toco em checklist duas vezes | `- [ ] itens` e depois `itens` |
| CA-11 | RF-11, RF-14 | corpo `- [ ] a\n**b** _c_ <b>x</b>` | abro em leitura | checklist `a`, `b` negrito, `c` itálico, `<b>x</b>` literal |
| CA-12 | RF-14 | leitura com `- [ ] a` | toco no item | vira `- [x] a` e é salvo |
| CA-13 | RF-15 | edição | paro de digitar por 1 s | `Salvando...` e depois `Salvo`; o servidor tem o texto |
| CA-14 | RF-15 | nota nova sem nada digitado | saio | nada é criado |
| CA-15 | RF-16, RF-18, RNF-05 | tela de desenho | desenho 2 traços em cores diferentes e saio | JSON com `v:1`, 2 traços, cores corretas; miniatura na grade |
| CA-16 | RF-17 | desenho com traços | `Limpar` e confirmo | tela vazia e salvo vazio |
| CA-17 | RF-19 | uma anotação | excluo e toco em `Desfazer` | volta à lista e nada é apagado; sem desfazer, some do servidor após 6 s |
| CA-18 | RF-10 | lembrete disparado | toco na notificação | abre o lembrete |
| CA-19 | RNF-02, RNF-04 | uso completo | inspeciono AsyncStorage, cache e logs | só o `reminderLog` (id, título, horário); nenhum conteúdo em logs |
| CA-20 | RNF-07 a RNF-10 | VoiceOver/TalkBack | navego nos 3 modos | rótulos e papéis de RNF-07 a RNF-10 |
| CA-21 | RF-04, RF-05 | uma nota de texto sem título com corpo `**oi** mundo` e um desenho sem título; e uma conta sem anotações | olho as listas `Texto` e `Desenho` | card `Sem título`, prévia `oi mundo` e `Editado {...}`; desenho na grade com `Sem título`; na conta vazia, as mensagens de vazio de RF-04 e RF-05 |

## 12. Roteiro de QA

| Passo | Ação | Resultado esperado |
| ----- | ---- | ------------------ |
| 1 | Membro cria lembrete para daqui a 2 min | Notificação local chega; tocar abre o lembrete |
| 2 | Conclui o lembrete | Vai para o fim, riscado |
| 3 | Cria texto com título, negrito, lista e checklist | Leitura renderiza; checklist alterna e salva |
| 4 | Cria desenho com 3 cores e `Limpar` | Confirmação; salva vazio; miniatura atualiza |
| 5 | Exclui e desfaz; exclui de novo | Volta; depois some |
| 6 | Modo avião e abre a aba | Mensagem de sem conexão |
| 7 | Abre Notificações após o lembrete do passo 1 | Item `Minhas anotações · {dia}` |

## 13. Definition of Done

- [ ] `make check` e `make test-db` passam
- [ ] Todo `CA` tem teste automatizado com o ID no nome, ou justificativa de teste manual no plano (CA-06 em aparelho, CA-18 e CA-20 manuais)
- [ ] Fluxo Maestro `.maestro/anotacao-lembrete.yaml` passa localmente
- [ ] Roteiro de QA executado sem divergências em iOS e Android
- [ ] Registro de implementação preenchido no plano
- [ ] Nenhum segredo, dado pessoal ou log sensível introduzido (ver `.ai/docs/SECURITY.md`)

## 14. Decisões em aberto

Nenhuma decisão em aberto.

| # | Pergunta | Decisão | Origem |
| - | -------- | ------- | ------ |
| 15 | Lembretes no histórico | `reminderLog` local lido por `push-notifications` | usuário |
| 21 | Formatação do texto | Markdown leve com barra | usuário |
| 22 | Offline | Exige conexão | usuário |
| A1 | Cores do desenho | As 4 do design | padrão do projeto |
| A2 | Salvamento | Automático (1 s) | padrão do projeto |
| A3 | Excluir | Imediato na lista com `Desfazer` por 6 s (DESIGN.md) | padrão do projeto |
| A4 | Limites | Título 120, texto 20 000, desenho 200 KB | padrão do projeto |

## 15. Próximos passos (fora desta entrega)

- Cache criptografado para leitura offline; busca; borracha e desfazer no desenho.
