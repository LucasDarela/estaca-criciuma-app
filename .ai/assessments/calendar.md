# Assessment: Agenda pública

> **Spec:** `.ai/specs/calendar.md`
> **Plano:** `.ai/plans/calendar.md`
> **Veredito atual:** PASS_WITH_GAPS

---

## Rodada 1 — 2026-11-15

**Veredito:** PASS_WITH_GAPS
**Resumo:** `make lint`, `make test` e `make build` passam, e `make test-db` também. Nenhum CA está ❌. Ficam ⚠️ os critérios que dependem da T-12 (CA-14, CA-15, CA-22), o fluxo Maestro e o roteiro de QA em aparelho, que não foram executados. Há também dois pontos de comportamento que o usuário precisa decidir: o toast do CA-15 no Android e o anúncio da troca de período no iOS (RNF-09).

### Verificações objetivas

| Comando | Resultado | Observação |
| ------- | --------- | ---------- |
| `make lint` | ✅ | `expo lint`, `tsc` e `prettier --check` sem erros. |
| `make test` | ✅ | 63 suítes, 477 testes, 0 falhas (`TZ=Europe/Lisbon`). |
| `make build` | ✅ | `expo export` iOS e Android concluído (`Exported: dist`). |
| `make test-db` | ✅ | 4 arquivos, 208 testes, PASS. `events_read.test.sql` ok. |
| `make check` (lint + test + build) | ✅ | Os três alvos passaram. O `make check` único não foi rodado, só cada alvo separado. |
| `.maestro/agenda-publica.yaml` | ⚠️ | Não executado (Maestro não instalado, T-12). |

### Critérios de aceitação

| CA | Status | Evidência |
| -- | ------ | --------- |
| CA-01 | ✅ | `supabase/tests/events_read.test.sql:12,16`: `anon` lê o seed e o insert dá 42501. |
| CA-02 | ✅ | `events_read.test.sql` cobre a constraint `events_ends_after_starts`. `make test-db` passou. |
| CA-03 | ✅ | `AgendaScreen.test.tsx`: "CA-03: shows the title, the month, the selected day 13 and its events". |
| CA-04 | ✅ | `calendar.test.ts` e `AgendaScreen.test.tsx`: "CA-04: the search ignores case and accents". |
| CA-05 | ✅ | `calendar.test.ts` e `AgendaScreen.test.tsx`: "CA-05: the unit filter keeps only events of that unit". |
| CA-06 | ✅ | `calendar.test.ts` e `AgendaScreen.test.tsx`: "CA-06: the type chip keeps only events of that type". |
| CA-07 | ✅ | `AgendaScreen.test.tsx`: "CA-07: next month from 31/01 selects the last day of February", mais o teste de `addMonthsClamped` no domínio. |
| CA-08 | ✅ | `AgendaScreen.test.tsx`: "CA-08: ...". |
| CA-09 | ✅ | `calendar.test.ts` ("four units give three dots in unitOrder") e `MonthView.test.tsx` ("a day with four units shows three dots"). |
| CA-10 | ✅ | `WeekView.test.tsx`: "CA-10: a week without events shows the empty message". |
| CA-11 | ✅ | `calendar.test.ts` e `DayView.test.tsx`: "CA-11: an event from 05:00 to 07:00 starts on the 06:00 line". |
| CA-12 | ✅ | `calendar.test.ts` ("is first, middle and last on 14, 15 and 16/11") e `MonthView.test.tsx` ("CA-12: shows the start, ..."). |
| CA-13 | ✅ | `EventDetailScreen.test.tsx`: "CA-13: shows every field and the three actions". |
| CA-14 | ⚠️ | `eventActions.test.ts` cobre `maps:?q=` no iOS, `geo:0,0?q=` no Android e o fallback para o Google Maps. Falta confirmar o app de mapas real, que é a T-12. |
| CA-15 | ⚠️ | `eventActions.test.ts` e `EventDetailScreen.test.tsx` cobrem a chamada a `createEventInCalendarAsync` com os dados, sem `requestCalendarPermissionsAsync`, e o toast só em `saved`. O diálogo real não foi verificado (T-12). No Android a ação é sempre `done`, então o toast `Evento adicionado à sua agenda.` nunca aparece (ver lacuna 3). |
| CA-16 | ✅ | `calendar.test.ts` ("follows the format of RF-15"), `eventActions.test.ts` e `EventDetailScreen.test.tsx`. |
| CA-17 | ✅ | `EventDetailScreen.test.tsx`: "CA-17: an unknown event shows the gone message and ..."; `api.test.ts` devolve `null`. |
| CA-18 | ✅ | `AgendaScreen.test.tsx`: "CA-18: shows the error message and retries". |
| CA-19 | ✅ | `queryPersistence.test.ts` ("persists only queries whose key starts with ...", `maxAge` de 7 dias, `staleTime` de 5 min) e `AgendaScreen.test.tsx` ("CA-19: offline with data shows the offline banner"). A reabertura real do app offline é o passo 6 do roteiro (T-12). |
| CA-20 | ✅ | `time.test.ts` e `EventDetailScreen.test.tsx`: "CA-20: shows 19:30 ...". `jest.config.js` fixa `TZ=Europe/Lisbon`. |
| CA-21 | ✅ | `AgendaScreen.test.tsx`: "CA-21: the bell opens /notifications". |
| CA-22 | ⚠️ | Os rótulos de RNF-07 e RNF-10 e o `selected` têm teste. O rótulo do período usa só `accessibilityLiveRegion="polite"` (`PeriodBar.tsx:30`), que o React Native só implementa no Android. O VoiceOver no iOS provavelmente não anuncia a troca (RNF-09). Falta teste em leitor de tela real (T-12). |

### Requisitos, escopo e restrições

| Item | Status | Evidência |
| ---- | ------ | --------- |
| Copy literal (RF-02 a RF-17, 7.5) em pt-BR | ✅ | `src/i18n/locales/pt-BR.json`, bloco `calendar.*`, confere caractere por caractere. Inclui `ESTACA CRICIÚMA`, `Buscar evento`, as 3 mensagens de vazio, `Dia todo`, `até {{time}}`, `Notas`, `Links`, os 3 botões, `Abrir no mapa`, `Evento adicionado à sua agenda.`, `Não foi possível abrir a agenda do celular.`, `Este evento não está mais disponível.`, `Ver agenda`, `Não foi possível carregar a agenda.` e `Tentar de novo`. |
| Copy: rótulos de período (RF-07) | ✅ | O plano especifica `plain()` e há `labels.test.ts` (86 linhas). O resultado em en-US e es-MX não foi comparado manualmente. |
| RF-13 (URLs de mapa) | ✅ | `eventActions.ts` usa `maps:?q=`, `geo:0,0?q=` e o fallback `https://www.google.com/maps/search/?api=1&query=`, com `encodeURIComponent`. |
| RF-14 / RNF-06 | ✅ | `createEventInCalendarAsync` vem de `expo-calendar/legacy`, sem pedir permissão total (desvio 1 registrado e justificado). |
| RF-18 / RNF-01 / RNF-02 | ✅ | `queryPersistence.ts` aceita só chave `'public'` com status `success`, `maxAge` de 7 dias e `staleTime` de 5 min. |
| Escopo: nada fora da spec | ✅ | Sem criar/editar eventos, sem botão `+`, sem recorrência, sem mapa embutido. `/notifications` é provisória, como a spec permite. |
| Restrições (seção 5) e RULES.md | ✅ | `RULES.md` atualizado. Datas passam por `src/domain/time.ts` (ADR 0005). Tokens novos em `theme.ts`. Rotas só re-exportam. |
| Plano: tarefas concluídas e desvios registrados | ⚠️ | T-01 a T-11 marcadas e 11 desvios registrados e justificados. T-12 pendente, como informado. |
| Definition of Done (seção 13) | ⚠️ | `make check` e `make test-db` passam. Pendentes: Maestro, roteiro de QA em iOS e Android, e o status da spec ("Em implementação"). |
| Segurança | ✅ | Tabela `events` com RLS ligada e só política de `select`, sem política de escrita. Cache persistido sem dados privados. Nenhum `console.*` nem `http://` no código novo da feature. Nenhum segredo introduzido. `npm audit` idêntico antes e depois das 4 dependências novas. |

### Lacunas

| # | ID | Bloqueante | O que está errado | Evidência | O que precisa acontecer |
| - | -- | ---------- | ----------------- | --------- | ----------------------- |
| 1 | T-12 / DoD (CA-14, CA-15, CA-22, Maestro) | sim, para fechar a spec | O QA em aparelho não foi feito. `make test-e2e` não foi rodado, o roteiro de QA (passos 1 a 8, iOS e Android) não foi executado, e CA-14, CA-15 e CA-22 não foram vistos nos apps reais. | Registro de implementação, "CA sem teste automatizado" (T-12 pendente). `.maestro/agenda-publica.yaml` existe, mas não foi executado. | Instalar o Maestro e rodar `make test-e2e`. Executar o roteiro de QA em iOS e Android, incluindo VoiceOver e TalkBack, e registrar o resultado no Registro de implementação. |
| 2 | CA-22 / RNF-09 | não, mas precisa ser confirmado na T-12 | O anúncio da troca de período depende só de `accessibilityLiveRegion`, que é Android-only. No iOS o VoiceOver provavelmente não anuncia. | `src/features/calendar/PeriodBar.tsx:30`. O teste só confere a prop. | Na T-12, verificar o VoiceOver. Se não anunciar, chamar `AccessibilityInfo.announceForAccessibility(label)` ao mudar o período (ou equivalente) e acrescentar teste. |
| 3 | CA-15 (Android) | não, decisão do usuário | No Android o diálogo do sistema sempre responde `done`, então o toast `Evento adicionado à sua agenda.` nunca aparece. O CA-15 pede o toast depois de confirmar. | `eventActions.ts` (`'saved'` só quando `result.action === 'saved'`) e Registro de implementação, "Decisões durante a implementação". | O usuário decide: manter assim (e ajustar a spec para dizer que o toast é só no iOS) ou mostrar o toast em `done` também no Android, com teste. |
| 4 | Plano / spec | não | O status da spec continua "Em implementação" e `.ai/assessments/calendar.md` ainda não existe. | `.ai/specs/calendar.md:3`. | Depois da T-12, gravar o assessment e atualizar o status da spec. |

### Rodadas anteriores

Primeira rodada. Nada a conferir.
