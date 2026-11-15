# Assessment: Design system — componentes, ícones e navegação por abas

> **Spec:** `.ai/specs/design-system.md`
> **Plano:** `.ai/plans/design-system.md`
> **Veredito atual:** PASS_WITH_GAPS

---

## Rodada 1 — 2026-11-14

**Veredito:** PASS_WITH_GAPS
**Resumo:** `make check` passou, os CA-01 a CA-20 têm teste automatizado com o ID no nome e não encontrei restrição violada nem item fora do escopo. CA-21 e a conferência de CA-19 em build de produção dependem só do relato da T-14 (feito pelo admin técnico, sem evidência anexada). Isso e dois desvios de forma registrados no plano geram lacunas não bloqueantes.

### Verificações objetivas

| Comando | Resultado | Observação |
| ------- | --------- | ---------- |
| `make lint` | ✅ | exit 0 (`expo lint`, `tsc --noEmit` e `prettier --check`) |
| `make test` | ✅ | 24 suítes, 131 testes, 0 falhas; cobertura 100% nos arquivos listados na saída |
| `make build` | ✅ | `expo export` iOS (1432 módulos) e Android (1436 módulos) concluídos, "Exported: dist" |

`make check` completo executado, sem erro.

### Critérios de aceitação

| CA | Status | Evidência |
| -- | ------ | --------- |
| CA-01 | ✅ | `Button.test.tsx:8` "CA-01: loading ignores presses and reports busy" |
| CA-02 | ✅ | `Button.test.tsx:20` |
| CA-03 | ✅ | `TextField.test.tsx:16` |
| CA-04 | ✅ | `SearchField.test.tsx:8` |
| CA-05 | ✅ | `Selection.test.tsx:14` (FilterChip); o Segmented está no mesmo arquivo |
| CA-06 | ✅ | `Tags.test.tsx:9` |
| CA-07 | ✅ | `Badge.test.tsx:6` |
| CA-08 | ✅ | `Display.test.tsx:12`, `:31`, `:46`, `:51` |
| CA-09 | ✅ | `src/domain/initials.test.ts` ("CA-09: %j gives %j", com `Maria da Silva`, `Ângela` e ` joão  pedro `) e `Display.test.tsx:65-66`. O ID "CA-09" também aparece em `ViewerProvider.test.tsx:37`, de outra spec (ver lacuna 3). |
| CA-10 | ✅ | `Selection.test.tsx:42` e `:57` (`accessibilityRole="switch"` e `onValueChange` com o valor oposto) |
| CA-11 | ✅ | `ToastProvider.test.tsx:42`, `:52` (4000 ms), `:61` (6000 ms), `:70` |
| CA-12 | ✅ | `ScreenHeader.test.tsx:9` e `TabsLayout.test.tsx:152` |
| CA-13 | ✅ | `Sheet.test.tsx:44` |
| CA-14 | ✅ | `Display.test.tsx:74`; texto idêntico à spec em `pt-BR.json` `common.offline` |
| CA-15 | ✅ | `Icon.test.tsx:72` (compara `d` do contornado e do preenchido); tipo coberto por `@ts-expect-error`, validado pelo `tsc` do lint |
| CA-16 | ✅ | `TabsLayout.test.tsx:85`, com `it.each` para os 3 perfis |
| CA-17 | ✅ | `TabsLayout.test.tsx:103` |
| CA-18 | ✅ | `TabsLayout.test.tsx:126` |
| CA-19 | ⚠️ | Automatizado: `DevComponentsRoute.test.tsx:57` (`__DEV__` falso redireciona para `/agenda`; `DevComponentsRoute.tsx:7` mostra o catálogo só em `__DEV__`). A conferência em build de produção real (passo 7 do QA) só tem o relato da T-14. |
| CA-20 | ✅ | `designRules.test.ts:28` (sem cor literal). Nenhum `#RRGGBB` em `src/components` nem em `src/features` fora de testes. Sem import de `features/`, `lib/` ou Supabase em `src/components`. |
| CA-21 | ⚠️ | Manual por definição da spec. O plano (seção 7) registra a T-14 como executada em 2026-11-14 e sem problemas, mas só como relato, sem anotações por aparelho, sistema operacional, leitor de tela ou componente. |

### Requisitos, escopo e restrições

| Item | Status | Evidência |
| ---- | ------ | --------- |
| RF-01 a RF-21 (copy literal) | ✅ | Textos da seção 7.2 idênticos em `pt-BR.json` (`common.offline`, `back`, `clear`, `close`, `cancel`, `comingSoon`, `profile`). Há testes por componente e para a navegação, e o `DevComponentsRoute` cobre RF-21/RNF-05. Não conferi visualmente cada medida do design. |
| Escopo: nada fora da spec | ✅ | `src/features/home` removido; `/` redireciona para `/agenda`. Os arquivos novos correspondem à seção 10. As chaves extras `dev.catalog.*` servem ao RNF-02. Não houve tema escuro nem animação extra. |
| Restrições (seção 5) e RULES.md | ✅ | RNF-01, RNF-02, RNF-03 e RNF-05 verificados por `designRules.test.ts` e por busca. A licença está em `src/components/icons/LICENSE` (RNF-04). `@material-symbols/svg-400` entrou como devDependency, aprovada pelo usuário segundo o plano. |
| Plano: tarefas concluídas e desvios registrados | ✅ | T-01 a T-14 marcadas `[x]`. Desvios justificados na seção 7: `href: null` (por causa de RF-19), `expo-router/js-tabs`, `glyphs.ts` único, paddings pelo token mais próximo e `Sheet` sem `accessibilityViewIsModal`. |
| Segurança | ✅ | Sem segredo, log sensível, rota que precise de autorização nem entrada sem validação. A rota `/dev` redireciona em produção. |

### Lacunas

| # | ID | Bloqueante | O que está errado | Evidência | O que precisa acontecer |
| - | -- | ---------- | ----------------- | --------- | ----------------------- |
| 1 | CA-21 / DoD "roteiro de QA em iOS e Android" | não | A T-14 só tem o relato verbal "concluída sem problemas". Falta o registro verificável do que foi testado. | Plano seção 7, "CA sem teste automatizado". Nenhum detalhe de aparelho, versão de SO, TalkBack/VoiceOver, fonte em 1,6×, "Reduzir movimento" ou alvos ≥ 44 pt. | O admin técnico anexa ao plano (seção 7) uma tabela curta por plataforma (iOS e Android): aparelho e SO, passos 1 a 7 do QA com ok/divergência, e confirmação explícita de VoiceOver/TalkBack, fonte 1,6×, contraste (RNF-12) e alvos de toque. Se possível, anexa capturas. |
| 2 | CA-19 (parte produção) | não | A conferência num build de produção real só foi relatada. | Plano seção 7. O teste automatizado cobre só `__DEV__ === false` simulado. | Registrar, na mesma tabela da lacuna 1, o resultado do passo 7 (`/dev/components` redireciona para a Agenda no build de produção, em qual plataforma). |
| 3 | CA-09, CA-10 e CA-11 | não | Os IDs dos testes do `ViewerProvider` (`ViewerProvider.test.tsx:37`, `:46`, `:56`) coincidem com os CA-09/10/11 desta spec, que são de outra spec (`app-foundation`). Uma busca por ID tem resultado ambíguo. Os testes desta spec estão corretos. | `grep "CA-09"` retorna `ViewerProvider.test.tsx` e `initials.test.ts`. | Opcional: prefixar os IDs dos testes de outra spec, por exemplo "app-foundation CA-09". Não afeta o comportamento. |

### Rodadas anteriores

Primeira rodada: não há lacunas anteriores.
