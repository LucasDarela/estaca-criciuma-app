# Assessment: Backend no Supabase Cloud (projeto único de produção)

> **Spec:** `.ai/specs/supabase-cloud.md`
> **Plano:** `.ai/plans/supabase-cloud.md`
> **Veredito atual:** PASS_WITH_GAPS

---

## Rodada 1 — 2026-11-14

**Veredito:** PASS_WITH_GAPS
**Resumo:** `make check` e `make test-db` passam, e nenhum CA está ❌. Os CA manuais têm evidência em runs reais do GitHub Actions que conferi com `gh`. Restam lacunas menores: CA-12 em produção ainda não foi executado (depende de `auth-account`), o grep do CA-07 tem uma ocorrência, e há pendências de bookkeeping no plano e na DoD.

### Verificações objetivas

| Comando | Resultado | Observação |
| ------- | --------- | ---------- |
| `make lint` | ✅ | `expo lint`, `tsc` e `prettier --check` passaram. |
| `make test` | ✅ | 9 suítes e 47 testes, 0 falhas. |
| `make build` | ✅ | Bundles iOS e Android exportados. `make check` terminou com sucesso. |
| `make test-db` | ✅ | 59/59 passam depois de `supabase db reset`. A primeira execução, num banco local em estado antigo (pós-testes de restauração, sem seed), falhou 19 testes. Foi estado stale, não defeito do código. |
| `shellcheck infra/backup/dump.sh` (Docker `koalaman/shellcheck:stable`) | ✅ | Sem avisos. |
| grep do CA-07 em `.github/ infra/ docs/ supabase/` | ⚠️ | 1 ocorrência: `docs/runbooks/backup.md:19`, o texto de instrução `AGE-SECRET-KEY-1...`. É falso positivo (não é chave real), mas a spec pede "nenhuma ocorrência". |
| `grep -c 'insert into public.units' supabase/seed.sql` | ✅ | 0. A linha 1 do seed é exatamente o comentário de RF-02. |
| grep de `self-hosted` fora de `.ai/{specs,adrs,plans,assessments}` e `supabase/config.toml` | ✅ | Nenhuma linha. |
| `gh run view` nos 4 runs do plano | ✅ | 43630545216 (Deploy) success, 43630879874 (Backup) success, 43634006932 (Backup) failure (esperado em CA-09), 43634769428 (Backup) success. |

### Critérios de aceitação

| CA | Status | Evidência |
| -- | ------ | --------- |
| CA-01 | ✅ | Tabela de QA do plano: projeto `estaca-criciuma`, Free, `us-east-1`, sem add-on pago, conferido pelo usuário. Evidência manual de painel, não verificável por mim. |
| CA-02 | ✅ | `supabase/migrations/20261114013039_units_reference_data.sql` existe. O seed tem 0 `insert into public.units`. `make test-db` passa 59/59 depois do reset. O registro da T-01 afirma 7 unidades com `db reset --no-seed`. Não refiz esse passo. |
| CA-03 | ✅ | QA do plano: remetente correto, `spf`, `dkim` e `dmarc` = pass. Ver G-04 sobre o e-mail ter caído no lixo eletrônico (não afeta o CA). |
| CA-04 | ✅ | Run 43630545216 com `conclusion: success` e `event: workflow_dispatch`. `deploy.yml` só tem `workflow_dispatch`, então o merge não dispara deploy. Passos "Run supabase db push --linked --yes" e "Pre-deploy backup" com success. |
| CA-05 | ✅ | QA do plano: `db push --local` saiu com código 1 e a migration com erro não ficou registrada. Foi local e a migration de teste foi apagada. Não refeito por mim. |
| CA-06 | ✅ | `deploy.yml` tem `environment: production` e o passo "Pre-deploy backup" e o upload de `pre-deploy-<run_id>` vêm antes do `db push`. Ordem confirmada nos passos do run 43630545216. A aprovação do reviewer está registrada no plano; a configuração do Environment é do painel e não conferi. |
| CA-07 | ⚠️ | `secrets.*` só aparece em `env:` de jobs com `environment:` (`deploy.yml`, `backup.yml`). Nenhum secret de repositório. O grep tem 1 ocorrência literal (ver G-03). O plano registra "sem ocorrências" de forma imprecisa. |
| CA-08 | ✅ | Run 43630879874 success. Artefato `backup-prod-2026-11-14`, retenção de 30 dias (`retention-days: 30` em `backup.yml`). `strings` sem `CREATE TABLE`, segundo o QA. |
| CA-09 | ✅ | Run 43634006932 falhou, e o run 43634769428 voltou a passar (`gh`). O plano registra o log só com `***` e o e-mail de falha recebido. `dump.sh` usa `error: dump failed` e redireciona a saída da CLI para `/dev/null`. |
| CA-10 | ✅ | QA do plano: restauração do backup real com `units` 7, `profiles` 0 e `memberships` 0, iguais à produção. O desvio (fixar Auth `v2.197.0` e Storage `v1.94.2`) foi documentado em `backup.md`. |
| CA-11 | ✅ | QA do plano: `public.units` = 7 e 0 contas `@exemplo.org`. Evidência manual. |
| CA-12 | ⚠️ | Os 4 casos locais estão registrados como verificados na T-02. Não os rerrodei; só inspecionei o snippet pelo plano. O caso de produção (`granted`) não foi executado: depende de `auth-account` criar `profiles`. Ver G-01. |
| CA-13 | ✅ | QA do plano: organização só com o admin técnico, 2FA no Supabase e no Resend, conferido pelo usuário. Evidência manual. |
| CA-14 | ✅ | Os 3 runbooks existem. `supabase-down.md` tem a seção "4. Rollback de deploy". O ADR 0003 tem `Status: Substituído por [0004]`. `SECURITY.md:20` cita Supabase Inc. e Resend como operadores nos EUA, mais GitHub. `O11Y.md:9,42,43` e `ARCHITECTURE.md:22,107,108` estão atualizados. Os "A definir" restantes não são pontos de RF-19. Nenhum doc fora de `.ai/adrs/` e `.ai/specs/` descreve o backend como self-hosted. |
| CA-15 | ✅ | ShellCheck sem avisos. `dump.sh` tem `set -euo pipefail` e `trap cleanup EXIT` com `rm -rf "$work"`. |
| CA-16 | ✅ | Run 43630545216 com o passo "Deploy Edge Functions" success. O plano registra `no Edge Functions to deploy`. `supabase/functions/` não existe. |

### Requisitos, escopo e restrições

| Item | Status | Evidência |
| ---- | ------ | --------- |
| RF-02 (copy do seed) | ✅ | `supabase/seed.sql:1` é literal à spec. |
| RF-04, RF-05 | ✅ | `deploy.yml`: job único `deploy-prod`, `workflow_dispatch` com input `ref` obrigatório, `environment: production`, `concurrency` `deploy-prod` com `cancel-in-progress: false`, CLI `2.84.2`, 3 secrets de Environment, passo de functions condicional. Nenhum passo roda seed. |
| RF-07 | ✅ | Passo "Pre-deploy backup" emite `error: pre-deploy backup failed` e sai com 1 antes do `db push`. Artefato `pre-deploy-<run_id>` com `retention-days: 30`. |
| RF-09 | ⚠️ | O script gera 4 arquivos (acrescenta `data-public.sql`) e usa `--linked` com `DB_URL` opcional, em vez de 3 dumps com `--db-url "$DB_URL"` montada dos secrets. Os desvios estão justificados no plano (seção 1, decisões 1 e 2) e funcionam no run real. Divergem da letra de RF-09. Ver G-02. |
| RF-10, RNF-08 | ✅ | `backup.yml`: cron `0 6 * * *`, `workflow_dispatch`, `environment: production-backup`, artefato `backup-prod-<data>` com retenção de 30 dias. |
| RNF-04 | ✅ | `infra/backup/age-recipients.txt` só tem a chave pública `age1...`. Nenhuma `AGE-SECRET-KEY` real no repositório. |
| RNF-10 | ⚠️ | Os workflows usam `supabase link` e `--linked`, não a URL do session pooler montada à mão. Funcionou nos runs reais. Ver G-02. |
| RF-14 | ✅ (local) | O plano registra a seção 2.6 do snippet e a verificação local. A produção está pendente (G-01). |
| RF-18, RF-19 | ✅ | `.env.example:7-8` com os dois valores possíveis. `AGENTS.md:12` e `README.md:9` dizem "Supabase Cloud (plano Free, região us-east-1)". |
| RF-20 | ✅ | ADR 0004 existe e o ADR 0002 aponta para ele. |
| Escopo: nada fora da spec | ✅ | Sem deploy-hml, sem OAuth, sem EAS, sem Edge Functions e sem monitor de uptime. |
| Restrições (seção 5) e RULES.md | ✅ | Sem `EXPO_PUBLIC_*` secreto. `package.json` sem dependência nova. Código e comentários em inglês, docs em português. |
| Plano: tarefas concluídas e desvios registrados | ⚠️ | T-01 a T-08 estão `[x]` e há 3 desvios mais o ajuste de projeto único registrados. A T-09 continua `[ ]`, e o cabeçalho e as seções 1 a 6 ainda citam hml e `sa-east-1` (avisado no topo do plano). Ver G-05. |
| Segurança | ✅ | Nenhum segredo em código ou log. `dump.sh` não imprime `DB_URL` e redireciona a saída da CLI para `/dev/null`. `age-recipients.txt` só tem a chave pública. `grep` sem chave real. Secrets só em Environments. Nenhuma rota nova. |

### Lacunas

| # | ID | Bloqueante | O que está errado | Evidência | O que precisa acontecer |
| - | -- | ---------- | ----------------- | --------- | ----------------------- |
| 1 | G-01 (CA-12) | não | O caso de produção de CA-12 (`granted` para o admin técnico) não foi executado. A spec exige "produção: `granted`". | Plano, seção 7, "Pendente: CA-12 na produção". | Depois que `auth-account` criar `profiles`, rodar `supabase/snippets/grant_admin.sql` no SQL Editor com o e-mail do admin, confirmar `granted` e uma linha em `role_grants_log`. Registrar o resultado no plano e fechar o CA. Enquanto isso, registrar na spec que CA-12 em produção fica adiado para `auth-account`. |
| 2 | G-02 (RF-09, RNF-10) | não | A implementação diverge da letra de RF-09 e RNF-10: modo `--linked` em vez de `--db-url` montada a partir dos secrets, e 4 arquivos de dump em vez de 3. A divergência funciona nos runs reais e o plano a justifica, mas a spec não foi atualizada. | `infra/backup/dump.sh` (`src=(--linked)`, `data-public.sql`); spec RF-09 e RNF-10; plano, seção 1, decisões 1 e 2. | Atualizar RF-09 e RNF-10 na spec para o comportamento real (`--linked`, `DB_URL` opcional, `data-public.sql`), ou registrar o desvio como aceito pelo usuário. Evita assessments futuros divergentes. |
| 3 | G-03 (CA-07) | não | O grep do CA-07 retorna 1 ocorrência (`AGE-SECRET-KEY-1...` em texto de instrução). O plano diz "sem ocorrências". | `docs/runbooks/backup.md:19`. | Reescrever o texto sem o literal (por exemplo, "a linha que começa com `AGE-SECRET-` ..."), ou ajustar o padrão do CA-07 na spec para ignorar esse trecho. Corrigir a afirmação do plano. |
| 4 | G-04 (observação) | não | O e-mail OTP caiu no lixo eletrônico do Outlook (SCL 5), apesar de SPF, DKIM e DMARC `pass`. O CA-03 não exige entrega na caixa de entrada, mas isso afeta o produto. | Plano, QA da T-09, observações. | Acompanhar em `auth-account` (templates em pt-BR, código em destaque). Sem ação nesta spec. |
| 5 | G-05 (plano e DoD) | não | O bookkeeping está incompleto: a T-09 está `[ ]` e o título do plano diz "homologação e produção". As caixas da DoD (seção 13 da spec) estão todas desmarcadas. O cabeçalho da spec já diz "Aguardando assessment". `docs/runbooks/provisioning.md:38` ainda cita `sa-east-1` ("se o Resend oferecer") para a região do Resend, o que é válido só para o envio de e-mail, mas pode confundir. | `.ai/plans/supabase-cloud.md:1,334`; `.ai/specs/supabase-cloud.md:235-242`; `docs/runbooks/provisioning.md:38`. | Marcar a T-09 como feita, exceto CA-12 em produção. Marcar a DoD depois deste assessment. Opcionalmente corrigir o título do plano e deixar claro no runbook que `sa-east-1` ali é a região do Resend. |

### Rodadas anteriores

Primeira rodada: não há lacunas anteriores.
