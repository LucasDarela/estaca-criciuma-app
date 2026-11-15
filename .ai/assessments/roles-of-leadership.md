# Assessment: Chamados da liderança — catálogo, acesso por chamado e organograma automático

> **Spec:** `.ai/specs/roles-of-leadership.md`
> **Plano:** `.ai/plans/roles-of-leadership.md`
> **Veredito atual:** PASS_WITH_GAPS

---

## Rodada 1 — 2026-11-15

**Veredito:** PASS_WITH_GAPS
**Resumo:** `make check` e `make test-db` passam, nenhum CA ficou ❌, e as RPCs `security definer`, as funções de permissão reescritas e a migração de `memberships` estão corretas e seguras. Fica PASS_WITH_GAPS porque a T-11 (QA em aparelho, CA-25, revisão dos nomes en-US/es-MX) não foi feita, e há duas lacunas menores sem efeito sobre o comportamento especificado.

### Verificações objetivas

| Comando | Resultado | Observação |
| ------- | --------- | ---------- |
| `make check` (lint + test + build) | ✅ | Saiu com código 0. Jest: 49 suítes, 342 testes, 0 falhas. `expo export` gerou `dist`. O aviso "worker process has failed to exit gracefully" do Jest já é antigo e não falha o comando. |
| `make lint` | ✅ | Está dentro do `make check`. |
| `make test` | ✅ | 342 testes, 0 falhas. |
| `make build` | ✅ | Está dentro do `make check`. |
| `supabase db reset --local` + `make test-db` | ✅ | Os 3 arquivos (`account`, `base_rls`, `callings`) deram ok, 198 testes pgTAP, "Result: PASS". Rodei só no Supabase local. |
| Seed contra o apêndice A | ✅ | Gerei os 128 itens do apêndice A a partir do markdown da spec e comparei com `calling_catalog` (`id`, `level`, `name_pt`, `access`, `notify_group`, `org_chart_section`, na ordem de `sort_order`). `diff` sem diferenças. |

### Critérios de aceitação

| CA | Status | Evidência |
| -- | ------ | --------- |
| CA-01 | ✅ | `callings.test.sql:9-41`: 128 chamados, todos ativos, sem `name_en`/`name_es` nulos, contagens por nível e acesso, linhas amostradas. Confirmei também com o diff programático acima. |
| CA-02 | ✅ | `callings.test.sql:77-87`: `invalid_access`, e o catálogo continua com 128 linhas. |
| CA-03 | ✅ | `callings.test.sql:46-63` (catálogo: anon lê, e insert/update dão 42501) e `:127-152` (membro só lê as próprias linhas de `member_calls`, escrita dá 42501, anon dá 42501). |
| CA-04 | ✅ | `callings.test.sql:69` (`not_authorized` para `stake_leader`). |
| CA-05 | ✅ | `callings.test.sql:138-140` e `src/domain/permissions.test.ts`. |
| CA-06 | ✅ | `callings.test.sql:122-125` e `permissions.test.ts`. |
| CA-07 | ✅ | `ViewerProvider.test.tsx` `[roles] CA-07`. |
| CA-08 | ✅ | `callings.test.sql:159-165`: `wrong_unit`, ok, `invalid_unit_for_calling`, ok. |
| CA-09 | ✅ | `callings.test.sql:168-174` (log com `calling_id`) e `GrantAccessSheet.test.tsx` (3 testes `[roles]`). |
| CA-10 | ✅ | `callings.test.ts` e `CallingPickerSheet.test.tsx` (`[roles] CA-10`). |
| CA-11 | ✅ | `GrantAccessSheet.test.tsx` e `CallingPickerSheet.test.tsx` (`includeAdmin`, `Administração` em primeiro). |
| CA-12 | ✅ | `callings.test.sql:182-192` e `AccessScreen.test.tsx`. |
| CA-13 | ✅ | `callings.test.sql:199-214` e `OrgChartConsentCard.test.tsx`. |
| CA-14 | ✅ | `callings.test.sql:230-234` e `OrgChartConsentCard.test.tsx`. |
| CA-15 | ✅ | `callings.test.sql:218-223`: anon executa a função, e a assinatura não tem e-mail, `user_id` nem telefone. O corpo em `member_calls.sql:418-430` confirma. |
| CA-16 | ✅ | `MyCallingsSection.test.tsx`. |
| CA-17 | ✅ | `callings.test.ts` e `CallingsCatalogScreen.test.tsx`. |
| CA-18 | ✅ | `callings.test.sql:259-266` e `CallingFormScreen.test.tsx`. |
| CA-19 | ✅ | `callings.test.sql:273-298` (`can_publish` vira `true`, log com `before` e `after`) e `CallingFormScreen.test.tsx`. |
| CA-20 | ✅ | `CallingsCatalogScreen.test.tsx`, `ProfileScreen.tsx:141` (item só com `isAdmin`) e `CallingsCatalogScreen.tsx:29,54` (`account.access.restricted`). |
| CA-21 | ✅ | `callings.test.sql:306-315` (mapeamento das 6 combinações, `memberships` só aceita `admin`, `leadership_group` removida). O seed segue RF-24 (diff de `seed.sql`). O `db reset` desta rodada aplicou as duas migrations e o seed sem erro. O implementer também registrou uma verificação manual da migração a partir do banco antigo; não reexecutei essa parte. |
| CA-22 | ✅ | `callings.test.sql` (`home_unit_locked`), trigger em `member_calls.sql:112-127` e `ProfileScreen.test.tsx`. |
| CA-23 | ✅ | `callings.test.sql:250-254`. |
| CA-24 | ✅ | `callings.test.ts` e `MyCallingsSection.test.tsx`. |
| CA-25 | ⚠️ | Manual (VoiceOver/TalkBack), não executado (T-11). Os rótulos de RNF-07 a RNF-09 têm teste de componente: `itemA11y` em `pt-BR.json`, `radiogroup` em `CallingFormScreen.tsx:390`, `showInOrgChartA11y`. O anúncio real não foi verificado. |

### Requisitos, escopo e restrições

| Item | Status | Evidência |
| ---- | ------ | --------- |
| RF-01 a RF-07 (catálogo, `save_calling`) | ✅ | Constraints e índice único em `calling_catalog.sql:5-33`. `save_calling` em `member_calls.sql:140-230` devolve `name_taken`, `level_locked`, `in_use`, `invalid_access` e `invalid_section`, e grava o log na mesma transação. Leitura pública só dos ativos, e o admin lê também os inativos (`calling_catalog.sql:52-53`). |
| RF-08 a RF-11 | ✅ | `member_calls` com RLS, sem política de escrita e com privilégios de escrita revogados. `memberships_admin_only` (`member_calls.sql:70`). `grant_calling` valida `no_home_unit`, `invalid_unit_for_calling` e `wrong_unit`. O trigger de unidade vale para qualquer chamado de unidade e para `Não informada`. |
| RF-12 a RF-15 | ✅ | `list_access` por ordem de unidade, com `admin` na Estaca. Só `stake_leader` e `admin` concedem e removem chamados. `Administração` só pelo `admin` (`grant_admin`/`revoke_admin`). `cannot_revoke_self` está em ambas. O log leva `calling_id` e o `access` do momento. |
| RF-16 a RF-19 | ✅ | `set_org_chart_consent` só pelo dono (`not_found` para os outros, `invalid_calling` sem seção). `org_chart_members` só devolve ativos, com seção e `accepted`. |
| RF-20 a RF-22 | ✅ | Chaves de i18n pt-BR conferidas literalmente com a spec (`callings.*` e `account.access.*`), sem divergência de copy. |
| RF-23, RF-24 | ✅ | Conversão, apagamento só das linhas convertidas, constraint `admin_only` e log na migration. Seed conforme RF-24. |
| RNF-01 / RNF-02 | ✅ | Todas as tabelas novas têm RLS. `has_role`, `can_publish`, `is_stake_leader` e `is_stake_publisher` derivam de `my_accesses()`. `can_lead` e `is_admin` não foram alterados e ainda estão corretos, porque `memberships` só guarda `admin`. |
| RNF-03 | ✅ | A visibilidade exige `org_chart_consent = 'accepted'`. Seção nova no catálogo move `null` para `pending`, nunca para `accepted`. |
| RNF-05 | ✅ | `track()` só leva ids (`calling_id`, `membership_id`). Nenhum `console.*` em `src/features/account`. |
| RNF-06 | ✅ | `export_my_data` ganhou `calls`. Os dados de `member_calls` saem em cascata com `profiles`. |
| Segurança das RPCs `security definer` | ✅ | Todas têm `search_path = public` e checam `auth.uid()` antes de qualquer outra coisa. Privilégios no banco local (`has_function_privilege`): `anon` só executa `has_role`, `can_*`, `is_*`, `org_chart_members` e o trigger `profiles_guard_home_unit`. `my_accesses` não é executável por `anon` nem `authenticated`. `save_calling`, `grant_*`, `revoke_*`, `list_access`, `calling_holder_count`, `set_org_chart_consent` e `export_my_data` só para `authenticated`. `create or replace` manteve os grants das funções antigas. As políticas antigas (`memberships_select`, `role_grants_log_select`, `profiles`) continuam corretas porque nomes e assinaturas não mudaram. |
| Escopo: nada fora da spec | ✅ | Não vi nada fora da spec. Os desvios 6 e 7 do plano (props aditivas em `ListItem`, `useLocale`, `callingFromRow`) são suporte, não funcionalidade nova. |
| Restrições (seção 5) e RULES.md | ✅ | Nenhuma dependência nova, código em inglês, textos via `t()`, nenhum segredo. |
| Plano: tarefas e desvios | ⚠️ | T-01 a T-10 marcadas, e os 11 desvios estão registrados e justificados. T-11 está aberta (de propósito, é da sessão principal). O Registro de implementação existe e está completo. |
| Documentação (DoD) | ✅ | `SECURITY.md`, `BUSINESS.md` e `ARCHITECTURE.md` foram alterados (diff). Não li o texto linha a linha. |
| Segurança geral | ✅ | Sem segredos nem dados sensíveis em log. `org_chart_members` expõe só `display_name` e o chamado, com consentimento. |

### Lacunas

| # | ID | Bloqueante | O que está errado | Evidência | O que precisa acontecer |
| - | -- | ---------- | ----------------- | --------- | ----------------------- |
| 1 | CA-25 / DoD | não (necessário antes de fechar a spec) | O QA manual não foi feito: passos 1 a 10 do roteiro em iOS e Android, VoiceOver/TalkBack nas telas Acessos, Meus chamados e Catálogo. A spec continua com `Status: Em implementação`. | Plano T-11 `[ ]`. DoD da spec, itens "Roteiro de QA executado" e "CA-25". | Executar a T-11 contra o Supabase local, registrar o resultado no Registro de implementação e, só então, passar o status para concluído. |
| 2 | RF-23 / CA-01 | não | Os nomes `name_en` e `name_es` dos 128 chamados foram escritos de memória, sem consultar o General Handbook nem o Manual General. A spec (RF-23, decisão 19) exige os nomes oficiais. As traduções de grupos e seções em en-US e es-MX também são do implementer. Não tenho como confirmar os nomes. Alguns têm cara de tradução livre, por exemplo "Representante de edificios", "Líder misional", "Stake Sports and Activities Coordinator" e a variação masculino/feminino do es-MX. | `calling_catalog.sql:149-276` e a lista de dúvidas no plano, seção 7, última linha de "Decisões". O CA-01 só testa que os campos não são nulos, não que estão corretos. | Revisar na T-11 com o usuário e, se algum nome mudar, corrigir por uma migration nova de `update`. O banco ainda não está em produção, então também dá para corrigir o seed. Revisar em especial os itens listados no plano. |
| 3 | RF-07 / RNF-01 | não | Condição de corrida entre `grant_calling` e `save_calling`. `save_calling` trava a linha do catálogo com `for update` (`member_calls.sql:192`) e depois conta os donos. `grant_calling` lê o chamado sem lock (`:253`). Uma concessão simultânea pode inserir uma linha em `member_calls` depois da contagem, e o chamado pode ficar desativado ou mudar de nível com alguém que o tem. Para o admin único do MVP o risco é muito baixo. | `member_calls.sql:253` (`select * into v_calling ... c.active`, sem `for share`) contra `:192-200`. | Em `grant_calling`, ler o chamado com `for share` (ou `for key share`) para serializar com o `for update` de `save_calling`. Isso é uma melhoria, não bloqueia. |
| 4 | Desvio 4 do plano | não | `legacy_role_to_calling` mapeia qualquer `unit_leader` cujo grupo não seja `bishops` (o antigo `presidents`) para `unit_clerk`, o que dá `unit_leader` a quem a spec não mapeou. O plano registra e justifica o desvio (preserva o acesso, e a produção não tem acessos além do admin), então não conta contra o veredito. | `member_calls.sql:32-44`. O registro em `plans/roles-of-leadership.md` (desvios) cita o caso. | Nada a corrigir agora. Se o usuário quiser seguir a spec ao pé da letra, ajustar RF-23 ou a função. |

### Rodadas anteriores

Não há. Esta é a rodada 1.
