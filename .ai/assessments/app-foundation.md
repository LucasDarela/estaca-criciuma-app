# Assessment: Fundação do app (Supabase, dados base e permissões)

> **Spec:** `.ai/specs/app-foundation.md`
> **Plano:** `.ai/plans/app-foundation.md`
> **Veredito atual:** PASS

---

## Rodada 1 — 2026-11-13

**Veredito:** PASS
**Resumo:** `make check` e `make test-db` passam. Os 13 CA estão atendidos, com testes de ID correspondente (pgTAP e Jest). Não achei escopo extra, violação de restrição nem problema de segurança. Os desvios do plano estão registrados e são justificados. Não executei o passo 5 do QA (abrir o app com `make dev`) nem o job `db` da CI.

### Verificações objetivas

| Comando | Resultado | Observação |
| ------- | --------- | ---------- |
| `make lint` (dentro do `make check`) | ✅ | `make check` terminou com exit 0 (lint, test e build). |
| `make test` (dentro do `make check`) | ✅ | 9 suítes, 47 testes, 0 falhas. Cobertura de `src/domain/permissions.ts` 100% (RNF-04 pede ≥ 80%). `src/lib/supabase.ts` 100%. `features/viewer` 100% de linhas. |
| `make build` (dentro do `make check`) | ✅ | `expo export` iOS e Android concluído. A pasta `dist` é ignorada pelo git. |
| `make test-db` | ✅ | `supabase test db`: `base_rls.test.sql .. ok`, 59 testes, `Result: PASS`. |

### Critérios de aceitação

| CA | Status | Evidência |
| -- | ------ | --------- |
| CA-01 | ✅ | `supabase/tests/base_rls.test.sql` tem 4 asserções `CA-01` (leitura anon das 7 unidades em ordem; `insert` negado para anon e membro). O arquivo passa em `make test-db`. O seed tem as 7 unidades com `sort_order` de 1 a 7 e os nomes de RF-01. |
| CA-02 | ✅ | 6 asserções `CA-02` no pgTAP (conta A vê e altera só a própria linha; ler ou alterar B retorna 0 linhas; anon vê 0). A migration tem as políticas `profiles_select_own` e `profiles_update_own`. |
| CA-03 | ✅ | 4 asserções `CA-03` (`stake_leader` em `icara` rejeitado com `23514`). A constraint `invalid_unit_for_role` está na migration. |
| CA-04 | ✅ | 9 asserções `CA-04` (insert em `memberships` negado com `42501`). A migration não tem política de escrita. |
| CA-05 | ✅ | 9 asserções `CA-05` no pgTAP. `can_publish` está na migration conforme RF-06. |
| CA-06 | ✅ | 7 asserções `CA-06`. `can_lead` na migration não inclui `admin` nem `unit_publisher`. |
| CA-07 | ✅ | 6 asserções `CA-07` (`membro` com 0 linhas, `estaca` com 4). A política `role_grants_log_select` usa `is_stake_leader() or is_admin()`. |
| CA-08 | ✅ | `src/domain/permissions.test.ts:33` (`CA-08: viewerKind`) e `:71` (`CA-08: canPublish / canLead`). Os testes passam. |
| CA-09 | ✅ | Teste `CA-09` em `src/features/viewer/ViewerProvider.test.tsx`. Passa. Em `ViewerProvider.tsx`, sem sessão o viewer usa `emptyData` e a query fica com `enabled: false`. |
| CA-10 | ✅ | Teste `CA-10` em `ViewerProvider.test.tsx`. Passa. |
| CA-11 | ✅ | Teste `CA-11` em `ViewerProvider.test.tsx`. Passa. Em falha sem cache, `data` fica vazio e `viewerKind` dá `'member'`. |
| CA-12 | ✅ | Rodei `make test-db`: 59 testes passam, incluindo os de acesso negado. O alvo `test-db` e o job `db` da CI existem. |
| CA-13 | ✅ | `src/lib/secrets.test.ts` (`CA-13`) passa. Rodei `grep -i service_role src .env.example`: a única ocorrência é `SUPABASE_SERVICE_ROLE_KEY` em `.env.example:16`, fora de `src/`. Está na seção "Edge Functions (nunca no app)", sem prefixo `EXPO_PUBLIC_`. |

### Requisitos, escopo e restrições

| Item | Status | Evidência |
| ---- | ------ | --------- |
| RF-01 a RF-04 (tabelas e copy literal) | ✅ | Migration e seed batem com a spec: ids, `kind`, nomes literais, constraints, `locale`, `organizations`, `invalid_unit_for_role`, `home_unit_not_stake`. `role_grants_log` não tem FK, então o log sobrevive ao perfil excluído (7.4). |
| RF-05 a RF-08 (funções SQL) | ✅ | As 5 funções estão em `supabase/migrations/20261113220132_base_units_profiles_roles.sql`, todas `security definer stable set search_path = public` (RNF-05). O pgTAP também verifica essas propriedades. |
| RF-09 e RF-10 (domínio e viewer) | ✅ | `permissions.ts` é puro. `ViewerProvider.tsx` retorna todos os campos de RF-10, e a query usa a chave `['viewer', userId]`. |
| RF-11 e RF-12 (seed e ferramentas) | ✅ | O seed tem as 5 contas `@exemplo.org` com os papéis corretos e nomes fictícios (RNF-06). O `Makefile` tem `REQUIRE_SUPABASE`, `test-db` e `db-types`. O job `db` está em `.github/workflows/ci.yml`. |
| Escopo: nada fora da spec | ✅ | Não há login, sessão persistida nem tabelas de outras features. `session` é `null` no `_layout.tsx`. `db-types` e `database.types.ts` estão previstos no plano. |
| Restrições (seção 5) e RULES.md | ✅ | RNF-01: RLS ligada nas 4 tabelas. O único `using (true)` está em `units`, sem dado pessoal. RNF-03: o cliente usa só a anon key. Não há dependência além de `@supabase/supabase-js`, que está prevista. Código em inglês, e não há UI nova. |
| Plano: tarefas concluídas e desvios registrados | ✅ | T-01 a T-09 estão marcadas. Os 5 desvios do registro de implementação são justificados: exclusão de `database.types.ts` da cobertura, `/// <reference types="node" />`, `doMock`, posição do `import type` e 59 asserções em vez de 63. |
| Documentação (DoD) | ✅ | `SECURITY.md` (tabela de papéis e funções), `BUSINESS.md` (membership e `unit_publisher`), `ARCHITECTURE.md`, `QA.md` e `AGENTS.md` foram alterados. |
| Segurança | ✅ | Não há segredo no código. Não há política de escrita em `memberships` nem em `role_grants_log`. O fallback em falha nunca concede permissão. `fetchViewerData` descarta role e unit desconhecidos. |

### Lacunas

Nenhuma bloqueante. Observações não bloqueantes:

- O passo 5 do QA (`make dev` sem erro de cliente Supabase) não foi executado manualmente, como o próprio registro informa. O código sustenta o comportamento, porque o cliente é criado só sob demanda e sem sessão nada é consultado.
- O job `db` da CI não foi validado em execução real. Só o equivalente local `make test-db` passou.

### Rodadas anteriores

Não se aplica (rodada 1).
