# Assessment: Criar, editar e excluir eventos, com pauta de reunião

> **Spec:** `.ai/specs/event-form.md`
> **Plano:** `.ai/plans/event-form.md`
> **Veredito atual:** PASS_WITH_GAPS

<!--
O cabeçalho acima é criado na rodada 1 e só o "Veredito atual" muda depois.
Cada execução de /assessment-spec acrescenta uma seção "Rodada N" no fim do arquivo.
O agent assessor devolve exatamente a seção abaixo, preenchida.
-->

---

## Rodada 1 — 2026-11-17

**Veredito:** PASS_WITH_GAPS
**Resumo:** `make check` e `make test-db` passam, nenhum CA está ❌ e a copy da spec foi conferida literalmente. Ficam as lacunas de verificação em aparelho que o usuário adiou: CA-22, o fluxo Maestro e o roteiro de QA (T-11 pendente). Há também um comportamento do formulário em edição que a spec não cobre.

### Verificações objetivas

| Comando | Resultado | Observação |
| ------- | --------- | ---------- |
| `make lint` | ✅ | ESLint, `tsc` e Prettier sem erro (`All matched files use Prettier code style!`). |
| `make test` | ✅ | 97 suítes, 915 testes, 0 falhas. Cobertura total: 92,82% de linhas/instruções, 88,19% de branches. |
| `make build` | ✅ | `expo export` iOS (1022 módulos) e Android (1691 módulos) geraram `dist`. Aparece só o aviso `Could not parse Expo config: android.googleServicesFile`, que não é desta feature. |
| `make check` | ✅ | Rodou lint, test e build, todos com sucesso. |
| `make test-db` | ✅ | 7 arquivos, 410 asserções, `Result: PASS`. Inclui `events_write.test.sql` (56 asserções) e `events_read.test.sql`. |
| `maestro test .maestro/lider-publica-evento.yaml` | ⚠️ não executado | Maestro não instalado. Adiado pelo usuário até o fim do MVP. |

### Critérios de aceitação

Os testes de tela estão em `describe('[event-form] ...')`, e o ID do CA está no nome do `it`. Os de banco estão em `supabase/tests/events_write.test.sql`.

| CA | Status | Evidência |
| -- | ------ | --------- |
| CA-01 | ✅ | `AgendaScreen.test.tsx:277` `[event-form] CA-01`: só quem tem `publishableUnits` vê `Novo evento`. |
| CA-02 | ✅ | `EventDetailScreen.test.tsx:256` `[event-form] CA-02`. |
| CA-03 | ✅ | `EventFormScreen.test.tsx:155`: mensagem ao sair do campo e `Salvar` desabilitado. |
| CA-04 | ✅ | `EventFormScreen.test.tsx:163` e `eventForm.test.ts`. |
| CA-05 | ✅ | `EventFormScreen.test.tsx:172` e `eventForm.test.ts`. |
| CA-06 | ✅ | UI: `EventFormScreen.test.tsx:191` (só o chip `Içara`). Servidor: `events_write.test.sql` (`insert` direto, `create_event` e `update_event` em `criciuma1` negados). |
| CA-07 | ✅ | `EventFormScreen.test.tsx:197` e `eventForm.test.ts`. |
| CA-08 | ✅ | `EventFormScreen.test.tsx:213` e `eventForm.test.ts`. |
| CA-09 | ✅ | `EventFormScreen.test.tsx:260`: `sendPush` com o público, toast e `replace` para o detalhe. |
| CA-10 | ✅ | `EventFormScreen.test.tsx:277`. |
| CA-11 | ✅ | `EventFormScreen.test.tsx:369`. |
| CA-12 | ✅ | `EventFormScreen.test.tsx:385`. |
| CA-13 | ✅ | `EventDetailScreen.test.tsx:275` e `:292`; banco: `events_write.test.sql` (cascata nos itens). |
| CA-14 | ✅ | `EventDetailScreen.test.tsx:317`; banco: membro, publicador e admin leem 0 itens (RLS por `can_lead`, sem política para admin). |
| CA-15 | ✅ | `EventDetailScreen.test.tsx:325` e `MeetingAgendaSheet.test.tsx` (abas, contagens e dicas). |
| CA-16 | ✅ | `MeetingAgendaSheet.test.tsx`, `EventDetailScreen.test.tsx:337` e `EventFormScreen.test.tsx:428`. |
| CA-17 | ✅ | `events_write.test.sql`: `conselho da  ALA` copia `Definir recepção` com `carried_from_date` de 15/10. `carry_pending_items` roda no gatilho `AFTER INSERT` do banco (migration). |
| CA-18 | ✅ | `events_write.test.sql`: unidade diferente, nada copiado. |
| CA-19 | ✅ | `EventFormScreen.test.tsx:398` e `:419`; banco: `update_event` de `meeting` para `activity` apaga os itens. |
| CA-20 | ✅ | `EventFormScreen.test.tsx:297` (`22:30Z` com `TZ=Europe/Lisbon`), `DateTimeField.test.tsx`, `time.test.ts`, `EventDetailScreen.test.tsx:118` e o banco. |
| CA-21 | ✅ | `EventFormScreen.test.tsx:312` (1 chamada) e banco (`create_event` idempotente por `p_id`; outro usuário com o mesmo `p_id` recebe `forbidden`). |
| CA-22 | ⚠️ | Parte automatizada: papéis `checkbox` e `radio` em `Selection.test.tsx`, rótulos de data/hora em `DateTimeField.test.tsx`, rótulos dos itens em `MeetingAgendaSheet.test.tsx`, `announceForAccessibility` em `EventFormScreen.test.tsx`. O anúncio real do VoiceOver/TalkBack e o foco no primeiro erro em aparelho não foram verificados. A spec define o CA-22 como manual. Adiado pelo usuário em 2026-11-17. |
| CA-23 | ✅ | `EventFormScreen.test.tsx:224` e `eventForm.test.ts`. |

### Requisitos, escopo e restrições

| Item | Status | Evidência |
| ---- | ------ | --------- |
| RF-01 a RF-21 (copy literal) | ✅ | Conferi caractere por caractere a chave `events.*` em `src/i18n/locales/pt-BR.json:528-640` contra a spec. Batem: nomes, placeholders, erros, toasts, `ConfirmSheet`s, dicas das abas, etiquetas e o resumo com plural. en-US e es-MX têm a mesma chave (a paridade é testada por `locales.test.ts`). |
| RF-21 / RNF-03 (série só no banco) | ✅ | O desvio de não ter função de série em `eventForm.ts` não muda o comportamento. `event_series_key` e `carry_pending_items` ficam no banco, no gatilho `AFTER INSERT`, e renomear depois não copia de novo (testado). |
| RF-11 × RNF-10 | ✅ | A resolução do plano atende às duas regras. `Salvar` inválido tem aparência e `accessibilityState.disabled`, não envia, mas marca os erros, anuncia o primeiro e foca o campo. CA-03 e CA-08 passam. |
| Desvio da pasta (`calendar` em vez de `events`) | ✅ | Só muda a localização do código. Segue a regra de `ARCHITECTURE.md` de uma feature não importar outra. |
| Desvio do rótulo `Içara` em vez de `Ala Içara` | ✅ | É o `units[id].label` já usado pelo filtro da Agenda. O comportamento do CA-06 (só a unidade do publicador) é o mesmo. |
| Escopo: nada fora da spec | ✅ | Sem recorrência, duplicação, rascunhos, anexos nem responsável/prazo. Os extras são infraestrutura prevista no plano: `Checkbox`, `role` do `FilterChip`, `heightRatio` do `Sheet`, mover `ChipGroup`, tokens derivados. |
| Restrições (seção 5) e RULES.md | ✅ | RNF-01: políticas de escrita por `can_publish`, e as RPCs checam a unidade antiga e a nova. RNF-02: a chave `['meeting', id]` fica fora de `public`, sem push. RNF-03: transação no banco. RNF-04: telemetria só com `event_id` e `unit_id`. RNF-05: `instantOf`, `timeZoneName="America/Sao_Paulo"` e `toSaoPauloWallTime`. Textos via `t()` e tokens de tema, com `designRules.test.ts` passando. Dependência nova prevista na spec. |
| DoD: `make check` e `make test-db` | ✅ | Ver a tabela acima. |
| DoD: teste por CA ou justificativa | ✅ | Todos têm teste, exceto o CA-22 em aparelho, justificado no plano. |
| DoD: Maestro | ⚠️ | O arquivo existe (`.maestro/lider-publica-evento.yaml`, `.maestro/scripts/`), mas não foi executado. |
| DoD: roteiro de QA em iOS e Android | ⚠️ | T-11 pendente. |
| DoD: Registro de implementação | ✅ | Seção 7 do plano preenchida, com 6 desvios justificados. |
| DoD: `BUSINESS.md` RN-07 | ✅ | `BUSINESS.md` aparece alterado e a T-10 está marcada. |
| Plano: tarefas concluídas e desvios registrados | ✅ | T-01 a T-10 marcadas. T-11 pendente por decisão do usuário e registrada. Desvios do plano: `position default -1`, `execute` em `meeting_event_leadable`, `timeZoneName` em vez de `timeZoneOffsetInMinutes`. Todos justificados e sem efeito no comportamento da spec. |
| Segurança | ✅ | Tabela nova com RLS ligada e políticas explícitas. `anon` sem acesso. Funções `security definer` com `search_path` fixo e `execute` revogado por padrão. Sem segredos nem dados pessoais em log. O admin não lê a pauta (RN-04). |

### Lacunas

| # | ID | Bloqueante | O que está errado | Evidência | O que precisa acontecer |
| - | -- | ---------- | ----------------- | --------- | ----------------------- |
| 1 | CA-22 | não | O anúncio de VoiceOver/TalkBack e o foco no primeiro erro não foram verificados em aparelho. | Plano T-11 pendente. Spec seção 13: CA-22 manual. | Executar o passo 8 do roteiro em iOS e Android e registrar o resultado no Registro de implementação. |
| 2 | DoD Maestro | não | `.maestro/lider-publica-evento.yaml` nunca foi executado. | Maestro não instalado. Spec seção 13. | Rodar `maestro test .maestro/lider-publica-evento.yaml` com `supabase start` e `make dev`, e registrar. |
| 3 | DoD QA | não | Roteiro de QA (passos 1 a 8) não executado em iOS e Android. | Plano T-11 `[ ]`. | Executar o roteiro, registrar divergências e marcar a T-11. O usuário decidiu fazer isso no fim do MVP. |
| 4 | RF-17 (edição) | não | Na edição, o card `Pauta da reunião` só aparece quando o evento já está salvo como Reunião. Quem muda Atividade para Reunião no formulário não vê o card até salvar. A spec RF-17 diz "com tipo `Reunião` e `canLead`: card no formulário". | Plano seção 7, "Decisões durante a implementação", primeiro item. O motivo é que a RLS de `meeting_items` exige uma Reunião já salva. | Decisão de produto, a pedido do plano. Opção A: aceitar o comportamento e registrar a exceção na spec RF-17. Opção B: manter os itens locais nesse caso e enviá-los no `update_event`, o que exige mudar a RPC. |
| 5 | Spec seções 4 e 10 | não | A spec lista `src/features/events/` e `normalização do nome da série` em `eventForm.ts`, e o código usa outra estrutura. Os chips dizem `Içara` em vez de `Ala Içara`, e o `timeZoneName` substitui o offset. | Desvios 3 e 4 do plano e seção 1 do plano. | Opcional: atualizar a spec (seção 10 e CA-06) para refletir o código, para os próximos leitores não estranharem. Sem efeito no comportamento. |

### Rodadas anteriores

Não há. Esta é a rodada 1.
