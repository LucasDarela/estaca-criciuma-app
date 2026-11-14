# Plano: Backend no Supabase Cloud (homologação e produção)

> **Spec:** `.ai/specs/supabase-cloud.md`
> **Criado em:** 2026-11-14
> **Ajuste de 2026-11-14 (spec, decisões 8 e 9):** um projeto só (`estaca-criciuma`, produção) em `us-east-1`; sem homologação remota nem job `deploy-hml`. Os trechos abaixo que citam `hml`, `estaca-hml`/`estaca-prod` ou `sa-east-1` ficaram como registro do plano original; o que vale é a seção 7 › "Ajuste: projeto único em us-east-1".
> **ADRs relacionados:** `.ai/adrs/0002-stack-inicial.md`, `.ai/adrs/0003-hospedagem-supabase-oracle.md` (trazido, substituído), `.ai/adrs/0004-supabase-cloud.md` (criado em T-07)

## 1. Abordagem

Quase tudo é configuração e documentação: os projetos, o Auth, o Resend e os Environments do GitHub são criados à mão pelo runbook (T-09, sessão principal com o usuário). O código versionado se resume a dois workflows, um script de dump, um snippet SQL e a migration das unidades trazida da branch arquivada.

Os workflows usam a CLI no modo **linked** (`supabase link` + `SUPABASE_DB_PASSWORD`), o caminho que a documentação do Supabase usa para CI ("Managing environments"): a CLI resolve a conexão sozinha, sem montar URL com senha no workflow. O `dump.sh` aceita `DB_URL` opcional só para o teste local contra o Supabase da CLI; na CI ele usa `--linked`. Isso cumpre RNF-10 e RNF-11 com menos superfície do que montar a URL do pooler à mão; se a conexão falhar por IPv6 no runner, a mitigação está nos riscos (seção 6).

O dump é testável inteiro na máquina local: dump do Supabase local com seed → cifra com uma chave `age` temporária → restauração num Supabase local recém-criado → contagens iguais. Assim CA-10 e CA-15 são exercitados antes de existir produção.

Decisões que refinam a spec (são de implementação, não de comportamento):

1. **`dump.sh` em modo linked na CI** (a spec, em RF-09, cita `--db-url "$DB_URL"`): `DB_URL` vira opcional. Motivo acima.
2. **Quarto arquivo no dump, `data-public.sql`** (`--data-only --use-copy -s public`): sem ele, restaurar por cima da produção (RF-12, seção separada) exigiria filtrar `data.sql` à mão. Com ele, a restauração no lugar é "truncar `public` e carregar `data-public.sql`" numa transação.
3. **`grant_admin.sql` devolve uma linha `result`** (`granted`, `already admin`, `error: no user with this email`, `error: user has no profile yet`) em vez de levantar exceção: o SQL Editor mostra o resultado da última consulta, e um único comando com CTEs que modificam dados já é atômico (mesmo SQL de `infra/scripts/grant-admin.sh` da branch arquivada). Nos casos de erro, nada é gravado.

## 2. Contratos

### 2.1 `infra/backup/dump.sh`

```text
usage: infra/backup/dump.sh <output-file.tar.gz.age>

env:
  DB_URL               opcional; connection string percent-encoded. Ausente → usa --linked
                       (exige `supabase link` antes e SUPABASE_DB_PASSWORD no ambiente)
  AGE_RECIPIENTS_FILE  opcional; padrão: <raiz-do-repo>/infra/backup/age-recipients.txt

requer no PATH: supabase, age, tar

saídas:
  0  arquivo <output> criado: tar.gz cifrado com roles.sql, schema.sql, data.sql, data-public.sql
  2  "usage: dump.sh <output-file.tar.gz.age>"   (argumento ausente ou sem o sufixo .tar.gz.age)
  1  "error: missing command: <cmd>"             (supabase, age ou tar ausente)
  1  "error: no age recipient configured"        (recipients sem linha que comece com "age1")
  1  "error: dump failed"                        (qualquer `supabase db dump` com erro)
  1  "error: encryption failed"                  (tar ou age com erro; <output> parcial é apagado)
  mensagens de erro vão para stderr; nenhum segredo nem URL é impresso
```

Comandos, em ordem (`src` = `--db-url "$DB_URL"` ou `--linked`, montado num array Bash):

```bash
supabase db dump "${src[@]}" --role-only -f "$work/roles.sql"
supabase db dump "${src[@]}" -f "$work/schema.sql"
supabase db dump "${src[@]}" --data-only --use-copy -f "$work/data.sql"
supabase db dump "${src[@]}" --data-only --use-copy -s public -f "$work/data-public.sql"
tar -czf - -C "$work" roles.sql schema.sql data.sql data-public.sql | age -R "$recipients" -o "$output"
```

`work="$(mktemp -d)"` com `trap 'rm -rf "$work"' EXIT`; em falha da cifra, `rm -f "$output"`.

### 2.2 `infra/backup/age-recipients.txt`

```text
# Public age key(s) used to encrypt production backups. The private key lives only in the
# technical admin's password manager. Generate with `age-keygen` (docs/runbooks/provisioning.md, item g).
```

Só comentários até o item (g) do runbook; depois, uma linha `age1<chave-pública>`.

### 2.3 `.github/workflows/deploy.yml`

```yaml
name: Deploy

on:
  workflow_run:
    workflows: [CI]
    types: [completed]
    branches: [main]
  workflow_dispatch:
    inputs:
      ref:
        description: Git ref (branch, tag or SHA) to deploy to production
        required: true
        default: main

permissions:
  contents: read

jobs:
  deploy-hml:
    if: github.event_name == 'workflow_run' && github.event.workflow_run.conclusion == 'success' && github.event.workflow_run.event == 'push'
    runs-on: ubuntu-latest
    timeout-minutes: 20
    environment: hml
    concurrency: { group: deploy-hml, cancel-in-progress: false }
    env:
      SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}
      SUPABASE_DB_PASSWORD: ${{ secrets.SUPABASE_DB_PASSWORD }}
      SUPABASE_PROJECT_ID: ${{ secrets.SUPABASE_PROJECT_ID }}
    steps:
      - uses: actions/checkout@v4
        with:
          ref: ${{ github.event.workflow_run.head_sha }}
      - uses: supabase/setup-cli@v1
        with:
          version: 2.84.2
      - run: supabase link --project-ref "$SUPABASE_PROJECT_ID"
      - run: supabase db push --linked --yes
      - name: Deploy Edge Functions
        run: # bloco da seção 2.4

  deploy-prod:
    if: github.event_name == 'workflow_dispatch'
    runs-on: ubuntu-latest
    timeout-minutes: 30
    environment: production
    concurrency: { group: deploy-prod, cancel-in-progress: false }
    env: # os mesmos três secrets, lidos do Environment production
    steps:
      - uses: actions/checkout@v4
        with:
          ref: ${{ inputs.ref }}
      - uses: supabase/setup-cli@v1
        with:
          version: 2.84.2
      - run: sudo apt-get install -y -qq age
      - run: supabase link --project-ref "$SUPABASE_PROJECT_ID"
      - name: Pre-deploy backup
        run: infra/backup/dump.sh "pre-deploy-${{ github.run_id }}.tar.gz.age" || { echo "error: pre-deploy backup failed"; exit 1; }
      - uses: actions/upload-artifact@v4
        with:
          name: pre-deploy-${{ github.run_id }}
          path: pre-deploy-${{ github.run_id }}.tar.gz.age
          retention-days: 30
          if-no-files-found: error
      - run: supabase db push --linked --yes
      - name: Deploy Edge Functions
        run: # bloco da seção 2.4
```

### 2.4 Passo de Edge Functions (igual nos dois jobs)

```bash
if [ -d supabase/functions ] && find supabase/functions -mindepth 1 -maxdepth 1 -type d ! -name '_*' | grep -q .; then
  supabase functions deploy --project-ref "$SUPABASE_PROJECT_ID"
else
  echo "no Edge Functions to deploy"
fi
```

Pastas com prefixo `_` (ex.: `_shared`) não contam como function, seguindo a convenção do Supabase.

### 2.5 `.github/workflows/backup.yml`

```yaml
name: Backup

on:
  schedule:
    - cron: '0 6 * * *' # 03:00 America/Sao_Paulo
  workflow_dispatch:

permissions:
  contents: read

concurrency: { group: backup-prod, cancel-in-progress: false }

jobs:
  backup-prod:
    runs-on: ubuntu-latest
    timeout-minutes: 30
    environment: production-backup
    env: # os mesmos três secrets, lidos do Environment production-backup
    steps:
      - uses: actions/checkout@v4
      - uses: supabase/setup-cli@v1
        with:
          version: 2.84.2
      - run: sudo apt-get install -y -qq age
      - run: supabase link --project-ref "$SUPABASE_PROJECT_ID"
      - id: name
        run: echo "name=backup-prod-$(date -u +%F)" >> "$GITHUB_OUTPUT"
      - run: infra/backup/dump.sh "${{ steps.name.outputs.name }}.tar.gz.age"
      - uses: actions/upload-artifact@v4
        with:
          name: ${{ steps.name.outputs.name }}
          path: ${{ steps.name.outputs.name }}.tar.gz.age
          retention-days: 30
          if-no-files-found: error
```

Um disparo manual no mesmo dia de uma execução agendada não conflita: nomes de artefato só precisam ser únicos dentro da mesma execução.

### 2.6 `supabase/snippets/grant_admin.sql`

```sql
-- Grants admin in 'estaca' to one user, audited in role_grants_log. Run in the SQL Editor.
-- Edit the e-mail below, run, and read the "result" column. One statement, so it is atomic.
with target as (select 'pessoa@exemplo.org'::text as email),
u as (select au.id from auth.users au, target t where lower(au.email) = lower(t.email)),
p as (select pr.id from public.profiles pr join u on u.id = pr.id),
m as (select 1 from public.memberships ms join p on p.id = ms.user_id
      where ms.unit_id = 'estaca' and ms.role = 'admin'),
ins as (insert into public.memberships (user_id, unit_id, role)
        select id, 'estaca', 'admin' from p where not exists (select 1 from m)
        returning user_id),
log as (insert into public.role_grants_log (action, user_id, unit_id, role)
        select 'granted', user_id, 'estaca', 'admin' from ins returning 1)
select case
  when not exists (select 1 from u) then 'error: no user with this email'
  when not exists (select 1 from p) then 'error: user has no profile yet'
  when exists (select 1 from m) then 'already admin'
  else 'granted' end as result;
```

`actor_id` e `granted_by` ficam `null` (concessão fora do app, RF-14). O CTE `log` não é lido pela consulta final de propósito: no Postgres, CTEs que modificam dados rodam mesmo sem ser referenciados.

### 2.7 Restauração (comandos que vão para `backup.md`)

```bash
# Decifrar e extrair
age -d -i <arquivo-da-chave-privada> -o backup.tar.gz <artefato>.tar.gz.age
mkdir restore && tar -xzf backup.tar.gz -C restore

# A) Teste de restauração num Supabase local novo (RF-12, CA-10)
supabase stop                                  # na pasta do projeto, se estiver rodando
tmp="$(mktemp -d)" && (cd "$tmp" && supabase init && supabase start)
psql --single-transaction --variable ON_ERROR_STOP=1 \
  --file restore/roles.sql --file restore/schema.sql \
  --command 'SET session_replication_role = replica' \
  --file restore/data.sql \
  --dbname 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'
psql 'postgresql://postgres:postgres@127.0.0.1:54322/postgres' -c \
  "select (select count(*) from public.units) units, (select count(*) from public.profiles) profiles, (select count(*) from public.memberships) memberships;"
(cd "$tmp" && supabase stop --no-backup) && rm -rf "$tmp" restore backup.tar.gz

# B) Restauração no lugar (só perda de dados em produção): truncar public e recarregar
#    1. Actions › Backup › Run workflow (dump "pre-restore" do estado atual)
#    2. psql na URL do session pooler da produção (painel › Connect › Session pooler):
psql "<url-session-pooler-prod>" --single-transaction --variable ON_ERROR_STOP=1 \
  --command 'SET session_replication_role = replica' \
  --command "do \$\$ begin execute (select 'truncate table ' || string_agg(format('%I.%I', schemaname, tablename), ', ') || ' cascade' from pg_tables where schemaname = 'public'); end \$\$;" \
  --file restore/data-public.sql
```

## 3. Dependências novas

Nenhuma dependência do projeto (`package.json` não muda). Ferramentas de linha de comando, já previstas na seção 4 da spec:

| Ferramenta | Onde | Motivo |
| ---------- | ---- | ------ |
| `age` | CI: `apt-get install age` no runner; local: `brew install age` (só para testar T-02 e T-04) | Cifra do backup |
| ShellCheck | local via `docker run --rm -v "$PWD:/mnt" -w /mnt koalaman/shellcheck:stable infra/backup/dump.sh` (mesmo método usado na branch arquivada) | CA-15 |

## 4. Tarefas

As tarefas T-01 a T-08 são executadas pelo agent `implementer` e verificáveis sem projeto real. A T-09 é o provisionamento e o QA reais, feitos na sessão principal com o usuário (contas e painéis dele), não pelo `implementer`.

- [x] **T-01 — Migration das unidades e seed sem unidades**
  - Arquivos: `criar supabase/migrations/20261114013039_units_reference_data.sql` · `alterar supabase/seed.sql`
  - O que fazer: `git show feat/supabase-self-hosted:supabase/migrations/20261114013039_units_reference_data.sql > supabase/migrations/20261114013039_units_reference_data.sql` (conteúdo sem alteração). No `seed.sql`, trocar o comentário da linha 1 e remover o bloco que começa em `insert into public.units` exatamente como em `git diff feat/app-foundation feat/supabase-self-hosted -- supabase/seed.sql`.
  - Referência: `supabase/migrations/20261113220132_base_units_profiles_roles.sql:6-11` (tabela `units`); diff da branch arquivada
  - Cobre: CA-02
  - Verificar: `supabase db reset --no-seed` e `psql 'postgresql://postgres:postgres@127.0.0.1:54322/postgres' -c 'select id from public.units order by sort_order'` (7 linhas); depois `supabase db reset` e `make test-db`; `grep -c 'insert into public.units' supabase/seed.sql` → `0`

- [x] **T-02 — Snippet do primeiro admin**
  - Arquivos: `criar supabase/snippets/grant_admin.sql`
  - O que fazer: conteúdo exato da seção 2.6.
  - Referência: `git show feat/supabase-self-hosted:infra/scripts/grant-admin.sh` (mesmo SQL)
  - Cobre: CA-12 (lógica; a execução no painel é manual na T-09)
  - Verificar, com o Supabase local e o seed aplicados (`supabase db reset`), usando `local='postgresql://postgres:postgres@127.0.0.1:54322/postgres'`:
    1. `sed "s/pessoa@exemplo.org/membro@exemplo.org/" supabase/snippets/grant_admin.sql | psql "$local" -tA` → `granted`; de novo → `already admin`; `select count(*) from public.role_grants_log where role = 'admin' and action = 'granted'` aumentou 1 uma única vez.
    2. Com `naoexiste@exemplo.org` → `error: no user with this email`.
    3. Criar um usuário sem perfil: `insert into auth.users (id, instance_id, aud, role, email) values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'semperfil@exemplo.org')`; rodar o snippet com esse e-mail → `error: user has no profile yet`; nenhuma linha nova em `memberships` nem em `role_grants_log`. Ao final, `supabase db reset`.

- [x] **T-03 — Recipients do age**
  - Arquivos: `criar infra/backup/age-recipients.txt`
  - O que fazer: conteúdo exato da seção 2.2 (só comentários).
  - Referência: seção 2.2
  - Cobre: base para CA-07 e CA-08
  - Verificar: `grep -c '^age1' infra/backup/age-recipients.txt` → `0`

- [x] **T-04 — Script de dump**
  - Arquivos: `criar infra/backup/dump.sh` (modo `755`)
  - O que fazer: contrato da seção 2.1. Bash com `#!/usr/bin/env bash`, `set -euo pipefail`, comentários em inglês, função `die()` que escreve em stderr e sai com o código dado. Raiz do repo = `"$(cd "$(dirname "$0")/../.." && pwd)"`. Checagem de recipients: `grep -q '^age1' "$recipients"`. Em falha de `supabase db dump`, `die "error: dump failed" 1`; o script nunca ecoa `DB_URL`.
  - Referência: `git show feat/supabase-self-hosted:infra/scripts/backup.sh` (estrutura de `trap`, `die` e mensagens) e `git show feat/supabase-self-hosted:infra/scripts/lib.sh`
  - Cobre: CA-15; base para CA-08 e CA-10
  - Verificar (com `age` local; `brew install age` se faltar):
    1. ShellCheck sem avisos (comando da seção 3).
    2. `infra/backup/dump.sh` sem argumento → código 2; `infra/backup/dump.sh x.tar.gz` → código 2.
    3. Com o recipients só de comentários → código 1 e `error: no age recipient configured`.
    4. Ciclo completo: `supabase db reset` (com seed); `key="$(mktemp)"; age-keygen -o "$key"`; arquivo temporário de recipients com `age-keygen -y "$key"`; `AGE_RECIPIENTS_FILE=<esse arquivo> DB_URL='postgresql://postgres:postgres@127.0.0.1:54322/postgres' infra/backup/dump.sh "$(mktemp -d)/b.tar.gz.age"` → código 0; `strings` no arquivo gerado não encontra `CREATE TABLE`; nenhum `.sql` sobra no diretório temporário do script.
    5. Restauração A da seção 2.7 com esse arquivo → contagens iguais às do banco de origem (7 unidades e as mesmas contagens de `profiles` e `memberships` do seed). Depois, `supabase start` de novo na pasta do projeto.
    6. Restauração B da seção 2.7 contra o Supabase local do projeto (no lugar da URL de produção), depois de apagar uma linha de `memberships` → a linha volta e as contagens batem.
    7. Apagar a chave temporária e os arquivos de teste.

- [x] **T-05 — Workflow de deploy**
  - Arquivos: `criar .github/workflows/deploy.yml`
  - O que fazer: contrato da seção 2.3 com o passo da seção 2.4 nos dois jobs. Nenhum `secrets.*` fora de job com `environment:`. Nenhum passo roda `seed.sql`.
  - Referência: `.github/workflows/ci.yml:1-50` (estilo e `setup-cli`) e `git show feat/supabase-self-hosted:.github/workflows/deploy.yml` (gatilhos e `if`)
  - Cobre: CA-04, CA-05, CA-06 e CA-16 (execução real na T-09); CA-07 (inspeção)
  - Verificar: `npx prettier --check .github/workflows/deploy.yml`; `python3 -c "import yaml; yaml.safe_load(open('.github/workflows/deploy.yml'))"`; o grep de CA-07 sem ocorrências; `secrets.` só aparece dentro dos jobs com `environment:`

- [x] **T-06 — Workflow de backup**
  - Arquivos: `criar .github/workflows/backup.yml`
  - O que fazer: contrato da seção 2.5.
  - Referência: T-05
  - Cobre: CA-08 e CA-09 (execução real na T-09); CA-07 (inspeção)
  - Verificar: os mesmos comandos da T-05, para `backup.yml`

- [x] **T-07 — ADRs**
  - Arquivos: `criar .ai/adrs/0003-hospedagem-supabase-oracle.md` · `criar .ai/adrs/0004-supabase-cloud.md` · `alterar .ai/adrs/0002-stack-inicial.md`
  - O que fazer:
    - 0003: `git show feat/supabase-self-hosted:.ai/adrs/0003-hospedagem-supabase-oracle.md`, trocando só a linha de status por `> **Status:** Substituído por [0004](0004-supabase-cloud.md)` e acrescentando, abaixo de `> **Origem:**`, `> **Nota:** nunca entrou em produção; o código está arquivado na branch` `` `feat/supabase-self-hosted` ``.
    - 0004: formato de `_template.md`, `Status: Aceito`, `Data: 2026-11-14`, `Origem: .ai/plans/supabase-cloud.md`, com o conteúdo de RF-20 da spec (contexto, 3 opções, decisão, consequências positivas e negativas e "O que muda para quem desenvolve": deploy por workflow, migrations só por PR, backup e alertas).
    - 0002: só acrescentar abaixo do cabeçalho `> **Hospedagem substituída por:** [0004](0004-supabase-cloud.md) (Supabase Cloud em vez de self-hosted; o resto da decisão continua valendo).` ADRs aceitos não têm o corpo editado.
  - Referência: `.ai/adrs/_template.md`, `.ai/adrs/0002-stack-inicial.md`
  - Cobre: CA-14 (parte dos ADRs)
  - Verificar: `make lint` (Prettier); `grep -n 'Status' .ai/adrs/0003-*.md` mostra `Substituído por`

- [x] **T-08 — Runbooks e docs**
  - Arquivos: `criar docs/runbooks/provisioning.md` · `criar docs/runbooks/backup.md` · `criar docs/runbooks/supabase-down.md` · `alterar AGENTS.md` · `alterar README.md` · `alterar .ai/docs/ARCHITECTURE.md` · `alterar .ai/docs/SECURITY.md` · `alterar .ai/docs/O11Y.md` · `alterar .env.example`
  - O que fazer:
    - `provisioning.md`: itens (a) a (k) de RF-15, na ordem, cada um dizendo onde fazer (painel, terminal local, GitHub). (a) registrar no registro.br e delegar os nameservers para a Cloudflare (plano Free), onde ficam todos os registros DNS. (b) 2FA na conta do Supabase. (c) região `sa-east-1` destacada como irreversível (RNF-01); senha do banco gerada no gerenciador, 32 caracteres só com letras e números. (d) "crie a conta no Resend, se ainda não existir" (o usuário já criou em 2026-11-14); adicionar o domínio; criar na Cloudflare (o domínio usa os nameservers dela; registros em modo "DNS only", nuvem cinza) os registros SPF, DKIM e MX de retorno que o Resend mostrar e um DMARC `v=DMARC1; p=none; rua=mailto:<e-mail do admin>`; criar uma chave por ambiente com permissão "Sending access". (e) valores exatos de RF-03. (f) access token em Account › Access Tokens; Environments `hml`, `production` (Required reviewers ≥ 1) e `production-backup` (sem revisor) com `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD` e `SUPABASE_PROJECT_ID`. (g) `age-keygen -o estaca-backup.key`; chave privada no gerenciador; linha pública em `infra/backup/age-recipients.txt` por PR; apagar o arquivo local. (h) primeiro deploy da hml pelo merge na `main` (ou Re-run) e o seed de RF-13, com o aviso de chave duplicada. (i) Actions › Deploy › Run workflow com `ref=main`. (j) snippet da seção 2.6 no SQL Editor. (k) Actions › Backup › Run workflow e procedimento A do `backup.md`. Ao final, tabela "Onde está cada segredo" (nome → gerenciador / Environment / painel), sem valores.
    - `backup.md`: backup manual (Run workflow); baixar o artefato (Actions › execução › Artifacts, ou `gh run download <run-id> -n <nome>`); restaurações A e B da seção 2.7, com o aviso de que B é só para perda de dados e começa pelo dump `pre-restore`; teste trimestral (procedimento A, anotando data e contagens numa tabela "Histórico de testes" no fim do arquivo); e-mail de falha (RF-11); o que fazer ao receber o e-mail (projeto pausado → `supabase-down.md`; senha → atualizar o secret; token → gerar outro); aviso de que o GitHub desativa workflows agendados depois de 60 dias sem atividade no repositório e como reativar (Actions › Backup › Enable workflow); chave `age` perdida (caso de borda da spec).
    - `supabase-down.md`: diagnóstico (status no painel, `https://status.supabase.com`, `curl -s -o /dev/null -w '%{http_code}' https://<ref>.supabase.co/auth/v1/health` → `200`); projeto pausado → Restore no painel (até 90 dias); rollback de deploy = nova migration por PR, nunca editar migration aplicada (RF-08); quando restaurar backup (perda de dados, não queda).
    - `AGENTS.md:12` e `README.md:9`: "Supabase self-hosted" → "Supabase Cloud (plano Free, região São Paulo)".
    - `ARCHITECTURE.md`: linha 14 → "PostgreSQL do Supabase Cloud", versão "gerenciada pelo Supabase"; linha 22 → "Backend: Supabase Cloud (Free, `sa-east-1`); deploy por `.github/workflows/deploy.yml`", ADR `0004`; linha 96 → "Supabase Cloud (API, Auth, Storage)"; linhas 107-108 → URLs no formato de RF-18 e o deploy (`deploy-hml` automático após o CI na `main`; `deploy-prod` manual com aprovação; backup diário por `backup.yml`).
    - `SECURITY.md`: linha 24, "Supabase Auth (GoTrue) self-hosted" → "Supabase Auth (Supabase Cloud)"; a seção "Infra self-hosted" (linhas 55-60) vira "Infra (Supabase Cloud)": Postgres acessível só pela API e pelo session pooler com senha; painel só do admin técnico, com 2FA (RNF-07); backup diário cifrado com `age`, artefato de 30 dias, teste trimestral (`docs/runbooks/backup.md`); segredos só em Environments, painéis e gerenciador (RNF-03). Abaixo da tabela "Dados tratados", parágrafo "Operadores e transferência internacional": Supabase Inc. (EUA, dados em `sa-east-1`), Resend (EUA, e-mail de quem pede o código) e GitHub (EUA, backup cifrado), a citar na política de privacidade.
    - `O11Y.md`: linha 9 → "Logs do Supabase Cloud (API, Postgres, Auth, Edge Functions)" em "Painel do Supabase › Logs (retenção de 1 dia no plano Free)"; alerta "Backend fora do ar" → condição "Execução do `backup.yml` ou do `deploy.yml` falha (inclui projeto pausado)", quem é avisado "Admin técnico (e-mail de falha do GitHub Actions)", runbook `docs/runbooks/supabase-down.md`; "Backup não executado" → execução do `backup.yml` falha, runbook `docs/runbooks/backup.md`; a linha que começa com "A definir: ferramenta de uptime" vira "Sem monitor externo de uptime no MVP: o Supabase opera a disponibilidade (ADR 0004)." Os alertas de crash e de push continuam como estão (são de outras specs).
    - `.env.example`: comentário de RF-18 acima de `EXPO_PUBLIC_SUPABASE_URL`.
  - Referência: `git show feat/supabase-self-hosted:docs/runbooks/provisioning.md` (estrutura numerada e tom); `.ai/docs/SECURITY.md:55-60`; `.ai/docs/O11Y.md:36-45`
  - Cobre: CA-14
  - Verificar: `make lint`; `grep -rn -i 'self-hosted' --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=dist . | grep -v '^./.ai/\(specs\|adrs\|plans\|assessments\)/' | grep -v '^./supabase/config.toml'` → nenhuma linha; `grep -n 'A definir' .ai/docs/ARCHITECTURE.md .ai/docs/SECURITY.md .ai/docs/O11Y.md` não mostra ambientes, backup nem uptime

- [ ] **T-09 — Provisionar e executar o QA (sessão principal, com o usuário)**
  - Arquivos: `alterar infra/backup/age-recipients.txt` (chave pública real, item g)
  - O que fazer: seguir `provisioning.md` (a) a (k) e o roteiro de QA da spec (seção 12), anotando desvios no Registro de implementação.
  - Cobre: CA-01, CA-03 a CA-06, CA-08 a CA-13, CA-16
  - Verificar: cada CA manual com o resultado esperado da spec

## 5. Matriz de cobertura

| CA | Tarefa | Tipo de teste | Arquivo de teste |
| -- | ------ | ------------- | ---------------- |
| CA-01 | T-09 | manual (painel) | — |
| CA-02 | T-01 | integração (comando) + `make test-db` | `supabase/tests/base_rls.test.sql` (existente) |
| CA-03 | T-09 | manual (e-mail real) | — |
| CA-04 | T-05, T-09 | manual (workflow real) | — |
| CA-05 | T-05, T-09 | manual (`db push` de migration inválida) | — |
| CA-06 | T-05, T-09 | manual (Environment com aprovação) | — |
| CA-07 | T-05, T-06 | automatizado (comando grep) | — |
| CA-08 | T-04 (local), T-06, T-09 | integração local (T-04, passo 4) + manual | — |
| CA-09 | T-06, T-09 | manual (secret errado) | — |
| CA-10 | T-04 (local), T-09 | integração local (T-04, passo 5) + manual | — |
| CA-11 | T-01, T-09 | manual | — |
| CA-12 | T-02 (local), T-09 | integração local (T-02) + manual no SQL Editor | — |
| CA-13 | T-09 | manual (configurações de conta) | — |
| CA-14 | T-07, T-08 | inspeção + comandos grep | — |
| CA-15 | T-04 | automatizado (ShellCheck) | — |
| CA-16 | T-05, T-09 | manual (junto com CA-04) | — |

Justificativa dos CA manuais: dependem de projetos reais do Supabase Cloud, de Environments do GitHub e de contas de terceiros (Resend, registro.br), que não existem em teste automatizado. Os que têm lógica no repositório (CA-08, CA-10, CA-12) são exercitados localmente antes.

## 6. Riscos e mitigação

| Risco | Mitigação |
| ----- | --------- |
| `supabase db push` ou `db dump --linked` tentar a conexão direta (IPv6) no runner e falhar | É o caminho documentado pelo Supabase para CI. Se falhar na T-09: criar a variável de Environment `SUPABASE_POOLER_HOST`, montar `DB_URL` percent-encoded num passo com `::add-mask::` e passá-la ao `dump.sh` (que já aceita `DB_URL`) e ao `db push --db-url`. Registrar como desvio |
| Restauração local falhar por diferença de versão entre o Postgres/Auth do Cloud e as imagens da CLI 2.84.2 | T-04 testa o ciclo com o banco local; na T-09 (CA-10) o teste usa um dump real. Se falhar, ajustar ordem e flags pelo guia oficial de restauração de dumps da CLI e registrar no `backup.md` |
| GitHub desativar o `backup.yml` agendado depois de 60 dias sem atividade no repositório | O GitHub avisa por e-mail antes; `backup.md` explica como reativar; o desenvolvimento ativo mantém o repositório ativo |
| Produção pausar antes do lançamento por falta de uso | O backup diário falha e avisa; reativar pelo `supabase-down.md`. Nenhum dado se perde |
| Chave privada do `age` perdida | Caso de borda documentado em `backup.md`; o DoD exige a chave no gerenciador de senhas |
| `deploy-prod` com um `ref` antigo, sem `infra/backup/dump.sh` | O passo falha com `error: pre-deploy backup failed` e nada é aplicado; só refs posteriores ao merge desta spec são implantáveis |
| Seed rodado duas vezes na hml | Falha por chave duplicada sem alterar nada (RF-13); aviso no runbook |

## 7. Registro de implementação

### Arquivos criados e alterados

Criados: `supabase/migrations/20261114013039_units_reference_data.sql` (trazida sem alteração), `supabase/snippets/grant_admin.sql`, `infra/backup/age-recipients.txt`, `infra/backup/dump.sh` (755), `.github/workflows/deploy.yml`, `.github/workflows/backup.yml`, `.ai/adrs/0003-hospedagem-supabase-oracle.md`, `.ai/adrs/0004-supabase-cloud.md`, `docs/runbooks/provisioning.md`, `docs/runbooks/backup.md`, `docs/runbooks/supabase-down.md`.

Alterados: `supabase/seed.sql`, `.ai/adrs/0002-stack-inicial.md`, `AGENTS.md`, `README.md`, `.ai/docs/ARCHITECTURE.md`, `.ai/docs/SECURITY.md`, `.ai/docs/O11Y.md`, `.env.example`, este plano.

### Desvios do plano

1. **`deploy.yml`, passo "Pre-deploy backup"**: o `run:` da seção 2.3 em linha única (`run: infra/backup/dump.sh ... || { echo "error: ..."; ... }`) é YAML inválido (`: ` dentro de escalar simples). Passou a ser bloco `run: |` com o mesmo comando. Comportamento idêntico. Os `concurrency` também foram escritos em formato de bloco (não `{ group: ..., cancel-in-progress: false }`), pelo Prettier.
2. **Restauração A (seção 2.7 e `backup.md`)**: o `psql` final conecta como `supabase_admin` (`postgresql://supabase_admin:postgres@127.0.0.1:54322/postgres`) em vez de `postgres`. Com `postgres`, o `data.sql` falha com `permission denied for table buckets_vectors` (tabela do schema `storage`, o usuário `postgres` local não tem INSERT). Com `supabase_admin` a restauração passa e as contagens batem. A consulta de contagens continua com `postgres`. A restauração B (só `data-public.sql`, schema `public`) funciona com `postgres`, como no plano.
3. **Limpeza dos testes da T-04 não concluída**: o comando de limpeza (`rm -rf` dos arquivos de teste no scratchpad da sessão, inclusive a chave `age` temporária de teste) foi negado pelo sistema de permissões e não foi repetido por outro meio. Restam em `/private/tmp/claude-501/-Users-lucasdarela-workspace-projetos-estaca-criciuma-app/b4be362e-4578-49a0-b7f8-d8c920b059d4/scratchpad/`: `t1/` (dump cifrado de teste e `.sql` extraídos, só dados fictícios), `t1.key` (chave privada `age` descartável, sem valor), `t1.rec` e `tmpdir`. Devem ser apagados à mão.

### Decisões durante a implementação

- `dump.sh`: a função `dump()` redireciona a saída do `supabase db dump` para `/dev/null` (a CLI pode ecoar a conexão em erro) e falha com `error: dump failed`.
- Teste da T-04 usou `DB_URL` do Supabase local; o modo `--linked` só é exercitado na T-09.
- Supabase local do projeto: estava rodando ao início, foi parado para o teste da restauração A (portas) e iniciado de novo; termina rodando, com `db reset` (seed aplicado).
- `age` instalado localmente por `brew install age` (1.3.2), só como ferramenta de teste (plano, seção 3). ShellCheck via Docker.

### Verificações executadas (T-01 a T-08)

- T-01: `db reset --no-seed` mostra as 7 unidades na ordem; `db reset` + `make test-db` passam (59 testes); `grep -c 'insert into public.units' supabase/seed.sql` = 0.
- T-02: `granted`; repetição `already admin` (log +1 só uma vez); inexistente `error: no user with this email`; usuário sem perfil `error: user has no profile yet`, sem linhas novas em `memberships` e `role_grants_log`.
- T-03: `grep -c '^age1'` = 0.
- T-04: ShellCheck sem avisos; sem argumento e `x.tar.gz` saem com 2; recipients só de comentários sai com 1 e `error: no age recipient configured`; ciclo completo com chave temporária: código 0, `strings` sem `CREATE TABLE`, só o `.tar.gz.age` na pasta de saída, contém os 4 `.sql`; restauração A (como `supabase_admin`) devolve 7 unidades, 5 perfis, 4 memberships, iguais à origem; restauração B contra o Supabase local do projeto, depois de apagar uma `membership` (3 linhas), volta a 7, 5 e 4.
- T-05 e T-06: `prettier --check` e `yaml.safe_load` passam; grep de CA-07 sem ocorrências (em `.github/ infra/ docs/ supabase/`); `secrets.` só dentro de jobs com `environment:`; nenhum passo roda `seed.sql`.
- T-07: ADR 0003 com `Substituído por [0004]`.
- T-08: grep de `self-hosted` fora de `.ai/{specs,adrs,plans,assessments}` e `supabase/config.toml` sem linhas; nenhum "A definir" de ambientes, backup ou uptime nos três docs.
- `make check` passa; `make test-db` passa.

### CA sem teste automatizado

CA-01, CA-03, CA-04, CA-05, CA-06, CA-09, CA-11, CA-13 e CA-16: manuais, dependem de projetos reais, Environments e contas de terceiros (matriz da seção 5). CA-08, CA-10 e CA-12: lógica exercitada localmente (T-02 e T-04), execução real na T-09. CA-07 e CA-15: verificados por comando (grep e ShellCheck via Docker), sem arquivo de teste no repositório. CA-02 e CA-14: comandos e inspeção.

### T-09 (pendente)

Provisionamento real (registro.br e Cloudflare, Supabase Cloud, Resend, Environments do GitHub, chave `age` e `age-recipients.txt`) e roteiro de QA da spec (seção 12): **não executada**; feita na sessão principal com o usuário.

### Ajuste: projeto único em us-east-1 (2026-11-14, durante a T-09)

Na criação, São Paulo não estava disponível no plano Free, e o usuário criou um projeto só, `estaca-criciuma`, em `us-east-1`. Decisões 8 e 9 da spec, escolhidas pelo usuário. Mudanças:

- `deploy.yml`: removidos o gatilho `workflow_run` e o job `deploy-hml`; fica só `deploy-prod` (manual, aprovação, dump prévio). Merge na `main` não faz deploy.
- Spec: RF-01, RF-03, RF-04, RF-05, RF-13, RF-15, RF-18, RNF-01, RNF-05, RNF-06, RNF-09, CA-01, CA-03, CA-04, CA-05 (agora no Supabase local), CA-11, CA-12 (casos de erro no local, `granted` na produção), CA-16 e roteiro de QA.
- `provisioning.md`: projeto único; dois Environments (`production`, `production-backup`); item (h) passa a avisar que o seed não roda no remoto.
- `SECURITY.md` e ADR 0004: transferência internacional (dados nos EUA) e ausência de homologação remota. `ARCHITECTURE.md`, `AGENTS.md`, `README.md`, `.env.example`, `supabase-down.md`, `backup.md` e o comentário do `seed.sql` alinhados.
- Risco novo: com um projeto só, a pausa por inatividade atinge a produção. O backup diário conecta no banco todo dia, o que deve contar como atividade; confirmar na primeira semana.


### QA da T-09 (2026-11-14, em andamento)

| CA | Resultado | Evidência |
| -- | --------- | --------- |
| CA-04, CA-06, CA-16 | passou | Run 43630545216: aprovação do Environment `production` exigida; `pre-deploy-43630545216` enviado antes do `db push`; as 2 migrations aplicadas; passo de functions pulado (`no Edge Functions to deploy`) |
| CA-08 | passou | Run 43630879874: artefato `backup-prod-2026-11-14` (só `.tar.gz.age`, cabeçalho `age-encryption.org/v1`, 0 ocorrências de `CREATE TABLE` em `strings`), retenção até 2026-12-14 |
| CA-03 | passou | OTP para conta Outlook: remetente `Estaca Criciúma <nao-responda@estacacriciuma.com.br>`, `spf=pass`, `dkim=pass`, `dmarc=pass`, `compauth=pass` |
| CA-07 | passou | Varredura do CA-07 sem ocorrências (só o próprio padrão na spec) |
| CA-05 | passou | Supabase local com as 2 migrations; migration de teste com `create table public.ca05_probe` seguido de SQL inválido: `supabase db push --local` saiu com código 1; `migration list --local` continuou com 2 migrations; `ca05_probe` não existe (sem estado parcial). Migration de teste apagada |
| CA-11 | passou | SQL Editor da produção: `public.units` = 7; contas `@exemplo.org` em `auth.users` = 0 |

Observações:

- Primeiro envio falhou com `535 Invalid username`: o campo Username do SMTP não era `resend`. Corrigido no painel; o runbook já indica `resend`.
- O e-mail caiu no lixo eletrônico do Outlook (SCL 5) com autenticação válida: domínio novo e template padrão do Supabase (inglês, só link para `supabase.co`). Tratar em `auth-account` com templates em pt-BR e código em destaque.
- O Supabase chama a anon key de **publishable key** (`sb_publishable_...`) e a service_role de **secret key** (`sb_secret_...`). Renomear em `.env.example` e no runbook na spec `auth-account`, quando o app passar a usar a chave.
- CA-12 na produção depende de linha em `profiles`, que só existe depois do cadastro do app (`auth-account`); até lá, o snippet deve retornar `user has no profile yet`.

Pendentes: CA-01, CA-09, CA-10, CA-12, CA-13.
