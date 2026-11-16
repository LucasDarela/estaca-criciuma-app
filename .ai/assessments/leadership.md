# Assessment: Liderança — organograma, acompanhamento e contatos

> **Spec:** `.ai/specs/leadership.md`
> **Plano:** `.ai/plans/leadership.md`
> **Veredito atual:** PASS_WITH_GAPS

<!--
O cabeçalho acima é criado na rodada 1 e só o "Veredito atual" muda depois.
Cada execução de /assessment-spec acrescenta uma seção "Rodada N" no fim do arquivo.
O agent assessor devolve exatamente a seção abaixo, preenchida.
-->

---

## Rodada 1 — 2026-11-16

**Veredito:** PASS_WITH_GAPS
**Resumo:** `make check` (lint, 809 testes, build) e `make test-db` (354 asserções) passaram. Todos os CA automatizáveis (CA-01 a CA-31) têm teste com o ID no nome e nenhum falhou. O CA-32 (VoiceOver, TalkBack e fonte 1.6× em aparelho) e a T-14 ainda não foram feitos, então o DoD de QA manual segue aberto. Por isso o veredito é PASS_WITH_GAPS.

### Verificações objetivas

| Comando | Resultado | Observação |
| ------- | --------- | ---------- |
| `make lint` | ✅ | Roda dentro de `make check` (exit 0). Só aparece um aviso do watchman, sem relação com o código. |
| `make test` | ✅ | 90 suítes, 809 testes, 0 falhas. |
| `make build` | ✅ | Bundles iOS e Android exportados. Aparece o aviso "Could not parse Expo config: android.googleServicesFile", que é de ambiente e não vem desta feature. |
| `make check` | ✅ | exit 0. |
| `make test-db` | ✅ | 6 arquivos, 354 asserções, "Result: PASS". Inclui `leadership.test.sql` e as 5 suítes antigas, isoladas do seed de demonstração. |

### Critérios de aceitação

| CA | Status | Evidência |
| -- | ------ | --------- |
| CA-01 | ✅ | `[leadership] CA-01` em `supabase/tests/leadership.test.sql` (passa em `make test-db`). Migration `20261116202618_leadership.sql` tem a constraint E.164 e `set_my_phone`. |
| CA-02 | ✅ | `[leadership] CA-02` em `leadership.test.sql`. O grant de `org_chart_phones()` é só para `authenticated`. |
| CA-03 | ✅ | `[leadership] CA-03` em `leadership.test.sql`. As 3 tabelas de vínculo têm RLS ligada e `revoke all`. |
| CA-04 | ✅ | `[leadership] CA-04` em `leadership.test.sql`. |
| CA-05 | ✅ | `[leadership] CA-05` em `leadership.test.sql`. |
| CA-06 | ✅ | `[leadership] CA-06` em `leadership.test.sql`. |
| CA-07 | ✅ | `[leadership] CA-07` em `leadership.test.sql`. |
| CA-08 | ✅ | `[leadership] CA-08` em `leadership.test.sql`. Cobre o vínculo mantido com o conselheiro `declined`, a ausência de `member_call_id` de conselheiro e a cascata. |
| CA-09 | ✅ | `[leadership] CA-09` em `leadership.test.sql`. |
| CA-10 | ✅ | `[leadership] CA-10` em `leadership.test.sql`. O `export_my_data` da migration inclui a chave `phone`. |
| CA-11 | ✅ | `[leadership] CA-11` em `src/domain/orgChart.test.ts` e `src/features/leadership/StakeTree.test.tsx`. |
| CA-12 | ✅ | `[leadership] CA-12` em `orgChart.test.ts`. |
| CA-13 | ✅ | `[leadership] CA-13` em `orgChart.test.ts` e `UnitTree.test.tsx`. |
| CA-14 | ✅ | `[leadership] CA-14` em `orgChart.test.ts`, `UnitTree.test.tsx` e `UnitLeadershipScreen.test.tsx`. |
| CA-15 | ✅ | `[leadership] CA-15` em `orgChart.test.ts`, `UnitTree.test.tsx` e `UnitLeadershipScreen.test.tsx`. |
| CA-16 | ✅ | `[leadership] CA-16` em `LeadershipScreen.test.tsx`. |
| CA-17 | ✅ | `[leadership] CA-17` em `UnitLeadershipScreen.test.tsx`. |
| CA-18 | ✅ | `[leadership] CA-18` em `orgChart.test.ts` e `LeadershipScreen.test.tsx`. |
| CA-19 | ✅ | `[leadership] CA-19` em `PersonSheet.test.tsx`. |
| CA-20 | ✅ | `[leadership] CA-20` em `PersonSheet.test.tsx` e `LeadershipScreen.test.tsx`. Usa `Linking` simulado e cliente real do TanStack Query. |
| CA-21 | ✅ | `[leadership] CA-21` em `PersonSheet.test.tsx`. Usa clipboard simulado. |
| CA-22 | ✅ | `[leadership] CA-22` em `PersonSheet.test.tsx` e `phone.test.ts`. |
| CA-23 | ✅ | `[leadership] CA-23` em `api.test.ts`, `PersonSheet.test.tsx` e `LeadershipScreen.test.tsx`. A chave `['leadership','phones',userId]` não é pública, então o `queryPersistence` (só prefixo `public`) nunca a grava em disco. A inspeção do `AsyncStorage` em aparelho é do passo 10 do QA. |
| CA-24 | ✅ | `[leadership] CA-24` em `PhoneSheet.test.tsx` e `ProfileScreen.test.tsx`. |
| CA-25 | ✅ | `[leadership] CA-25` em `PhoneSheet.test.tsx` e `phone.test.ts`. |
| CA-26 | ✅ | `[leadership] CA-26` em `LeadershipScreen.test.tsx` e `UnitLeadershipScreen.test.tsx`. |
| CA-27 | ✅ | `[leadership] CA-27` em `HighCouncilorLinkSheet.test.tsx`. |
| CA-28 | ✅ | `[leadership] CA-28` em `OrgCounselorSheet.test.tsx` e `UnitLeadershipScreen.test.tsx`. |
| CA-29 | ✅ | `[leadership] CA-29` em `HighCouncilorLinkSheet.test.tsx` e `OrgCounselorSheet.test.tsx`. |
| CA-30 | ✅ | `[leadership] CA-30` em `LeadershipScreen.test.tsx`. |
| CA-31 | ✅ | `[leadership] CA-31` em `api.test.ts` e `account/api.test.ts`. `api.ts:241` e `api.ts:256` chamam `track` só com `kind` e `unit_id`. |
| CA-32 | ⚠️ | A parte automatizada existe: rótulos `{nome}, {chamado}`, posição vazia anunciada, linhas ocultas, papéis `header`, `radiogroup` e `list`, colunas empilhadas e `Switch` com rótulo. O percurso com VoiceOver e TalkBack, a fonte 1.6× e a checagem de texto cortado dependem da T-14, que ainda não foi feita. |

### Requisitos, escopo e restrições

| Item | Status | Evidência |
| ---- | ------ | --------- |
| RF-01 a RF-08 (servidor) | ✅ | Migration com as 4 tabelas, 5 RPCs, helper privado e `export_my_data` com `phone`. Os grants por função estão nas linhas finais da migration. `leadership.test.sql` passa. |
| RF-09 a RF-13 (árvore) | ✅ | `src/domain/orgChart.ts` com testes de CA-11 a CA-15 passando. |
| RF-14 a RF-20 (telas) | ✅ | Testes CA-16 a CA-23 e CA-30 passando. Copy literal conferida em `pt-BR.json`: `Entre para ver os contatos.` (l.494), `Telefone disponível com conexão.` (l.500), `Modo de edição` (l.511), `Ninguém tem este chamado agora. Conceda o chamado em Acessos primeiro.` (l.521). O restante é coberto por asserções de texto nos testes. |
| RF-21, RF-22 (Perfil) | ✅ | CA-24 e CA-25 passando. |
| RF-23 a RF-26 (edição) | ✅ | CA-26 a CA-29 passando. |
| Escopo: nada fora da spec | ✅ | Não há cadastro manual, designações em texto livre, foto nem deep link. A única dependência nova é `expo-clipboard ~58.0.4`, prevista. `LeadershipPlaceholder` foi removido e não há mais referências. |
| Restrições (seção 5) e RULES.md | ✅ | RNF-01 a RNF-04 verificados no pgTAP. A chave de telefone fica fora do prefixo `public` (RNF-02). O log só tem ids e enums (RNF-06). Os desvios de `PersonRow`, `TextField.placeholder` e arquivos extras estão registrados e justificados. |
| Plano: tarefas concluídas e desvios registrados | ⚠️ | T-01 a T-13 estão marcadas. A T-14 está pendente e declarada. O registro de implementação está preenchido. |
| Segurança | ✅ | Não há segredos no código. Telefone só para `authenticated`. Tabelas de vínculo sem política e sem grant. `org_chart_links` não devolve `user_id`, e-mail, telefone nem o `member_call_id` do conselheiro. Não há log com dados pessoais. |
| DoD: docs (`BUSINESS.md`, `SECURITY.md`, `ARCHITECTURE.md`) | ✅ | Os 3 arquivos foram alterados, conforme T-13. Conferi pelo diff só que foram tocados, sem reler cada linha. |
| DoD: `expo-clipboard` por `npx expo install` | ✅ | `package.json:27`. |
| DoD: roteiro de QA em iOS e Android sem divergências | ❌ pendente | T-14 não executada. |

### Lacunas

| # | ID | Bloqueante | O que está errado | Evidência | O que precisa acontecer |
| - | -- | ---------- | ----------------- | --------- | ----------------------- |
| 1 | CA-32 / T-14 | não, mas bloqueia o fechamento da spec (DoD) | O QA em aparelho não foi feito: percurso com VoiceOver e TalkBack, fonte 1.6× sem texto cortado, e os passos 1 a 11 do roteiro, incluindo o passo 10 (modo avião: árvore do cache, `Telefone disponível com conexão.`, `Editar` desabilitado, sem chave de telefone no `AsyncStorage`). | Plano, T-14 com `[ ]`. Registro de implementação, "CA sem teste automatizado". Spec, seção 13, item "Roteiro de QA executado sem divergências em iOS e Android". | A sessão principal, com o usuário, roda `supabase db reset` e `make dev` num dev build. Executa o roteiro 1 a 11 em iOS e Android e registra o resultado no Registro de implementação. Se houver divergência, abre lacunas novas. Depois disso, uma rodada 2 pode fechar como PASS. |

### Rodadas anteriores

Primeira rodada, sem lacunas anteriores.
