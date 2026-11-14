# Plano: Infraestrutura do Supabase self-hosted (homologação e produção)

> **Spec:** `.ai/specs/supabase-self-hosted.md`
> **Criado em:** 2026-11-13
> **ADRs relacionados:** `.ai/adrs/0002-stack-inicial.md`; `.ai/adrs/0003-hospedagem-supabase-oracle.md` (criado em T-10)

## 1. Abordagem

O servidor roda o compose **oficial** do Supabase, sem fork. A pasta `docker/` do repositório `supabase/supabase` é baixada por sparse clone no commit da release `self-hosted/v0.8.4` (`189adda99d1b56da55fc5a6ee3f849354aaea92a`), e o resto vem de três camadas: o `docker-compose.logs.yml` (Analytics e Vector, para os logs no Studio que o `O11Y.md` exige), um override nosso e um `.env` por ambiente. O override só faz o que o upstream não faz: põe as portas em `127.0.0.1`, dá a cada container um nome com o prefixo do ambiente (necessário para dois stacks no mesmo daemon Docker) e liga as variáveis de Google e Apple no GoTrue. O upstream referencia três nomes de container fixos (`realtime-dev.supabase-realtime` no Envoy, `supabase-*` no Vector), e um `sed` restrito a esses três arquivos troca o prefixo.

Toda a lógica comum (caminhos, leitura do `.env`, `docker compose`, `psql`) fica em `infra/scripts/lib.sh`, carregado por todos os scripts. Os segredos do Supabase são gerados pelo `utils/generate-keys.sh` do próprio upstream, num diretório temporário, com a saída descartada. Só as chaves legadas HS256 (anon e service role) são usadas: são as que o cliente da `app-foundation` já usa; as chaves assimétricas do upstream ficam desligadas.

O deploy é `git fetch` + `checkout` no servidor (o repositório é público, então não há credencial do GitHub na VM), seguido de `supabase db push` e `rsync` das functions. O workflow faz o checkout antes de chamar `deploy.sh`, para rodar a versão do script do commit publicado. A senha do Postgres e a URL do Healthchecks nunca aparecem em argumentos de comando (`PGPASSWORD` por ambiente, `curl -K -`), o que atende RNF-07 e RNF-12 também na lista de processos.

As tarefas T-01 a T-10 rodam no repositório (verificação com `make lint-infra`, `docker compose config` e `make test-db`). A T-11 é o provisionamento real e o roteiro de QA na VM. Ela depende de contas e acessos do usuário (registro.br, Oracle, Resend, GitHub, UptimeRobot, Healthchecks.io) e é feita na sessão principal com ele, não pelo agent `implementer`.

## 2. Contratos

### 2.1 Layout no servidor

```
/opt/estaca/<env>/                 dono estaca-<env>, 750
  .env                             600, dono estaca-<env> (RNF-07)
  .seeded                          só hml, marcador de RF-02
  app/                             git clone de https://github.com/LucasDarela/estaca-criciuma-app.git
  supabase/                        sparse clone de supabase/supabase (só docker/) no commit de VERSION
  supabase/docker/.env             symlink → /opt/estaca/<env>/.env
  backup-tmp/                      700, apagado ao fim de cada backup
  restore/<timestamp>/             saída de restore.sh
/etc/caddy/Caddyfile               cópia de infra/caddy/Caddyfile
/etc/caddy/estaca.env              600 root: HML_ANON_KEY=…, PROD_ANON_KEY=…
/etc/systemd/system/caddy.service.d/estaca.conf   EnvironmentFile=/etc/caddy/estaca.env
/etc/systemd/system/estaca-backup@.{service,timer}
/etc/ssh/sshd_config.d/10-estaca.conf
/etc/fail2ban/jail.local
```

| Valor por ambiente | `hml` | `prod` |
| --- | --- | --- |
| Usuário Linux / projeto Compose | `estaca-hml` | `estaca-prod` |
| URL pública | `https://api-hml.estacacriciuma.com.br` | `https://api.estacacriciuma.com.br` |
| `HOST_GW_PORT` (Envoy) | `8100` | `8000` |
| `HOST_STUDIO_PORT` | `3100` | `3000` |
| `HOST_DB_PORT` | `5532` | `5432` |
| Container do banco | `estaca-hml-db` | `estaca-prod-db` |
| Repositório restic | `s3:${OCI_S3_ENDPOINT}/${OCI_BUCKET}/hml` | `…/prod` |

### 2.2 `infra/scripts/lib.sh`

```bash
# Sourced by every script; never executed directly.
REPO_URL="https://github.com/LucasDarela/estaca-criciuma-app.git"
SUPABASE_REPO_URL="https://github.com/supabase/supabase.git"

die() { echo "$1" >&2; exit "${2:-1}"; }                 # die "error: ..." [code]
require_env_arg() { ... }    # $1 must be hml|prod, else die "usage: $(basename "$0") <hml|prod>" 2
                             # (restore/deploy/grant-admin append their extra args to usage)
set_env_paths() { ... }      # from $1 sets: ENV_NAME ENV_USER BASE APP_DIR SUPABASE_DIR DOCKER_DIR
                             #   ENV_FILE DB_CONTAINER HOST_GW_PORT HOST_STUDIO_PORT HOST_DB_PORT PUBLIC_URL
env_get() { ... }            # env_get KEY → value from $ENV_FILE via grep '^KEY=' | cut -d= -f2-
                             #   strips surrounding double quotes; never `source` the file
                             #   (JSON values such as JWT_KEYS break shell parsing)
compose() { docker compose -p "estaca-$ENV_NAME" --project-directory "$DOCKER_DIR" "$@"; }
db_psql() { ... }            # PGPASSWORD="$(env_get POSTGRES_PASSWORD)" docker exec -i -e PGPASSWORD \
                             #   "$DB_CONTAINER" psql -h 127.0.0.1 -U supabase_admin -d "${1:-postgres}" \
                             #   -v ON_ERROR_STOP=1 -At "${@:2}"
ping_healthchecks() { ... }  # ping_healthchecks [suffix]: printf 'url = "%s%s"\n' "$url" "$suffix" |
                             #   curl -fsS -m 10 --retry 3 -o /dev/null -K -   (URL never in argv)
```

### 2.3 Scripts

| Script | Como roda | Argumentos | Saídas literais (stdout/stderr) | Código |
| --- | --- | --- | --- | --- |
| `provision-host.sh` | `root` | nenhum | `error: must run as root`; `error: at least ${MIN_RAM_GB} GB of RAM required` | 1 |
| `provision-env.sh` | `root` | `<hml\|prod>` | `usage: provision-env.sh <hml\|prod>` (2); `error: fill VAR1, VAR2 in /opt/estaca/<env>/.env and run again` (1); `warn: added VAR from env.template; review it` | 0/1/2 |
| `deploy.sh` | `estaca-<env>` ou `root` | `<hml\|prod> <git-sha>` | `error: unknown commit`; `error: pre-deploy backup failed`; `info: no edge functions to deploy`; `deployed <env> <sha>` | 0/1/2 |
| `backup.sh` | `root` (timer) ou `estaca-prod` (pré-deploy) | `<hml\|prod>` | `error: disk usage above 85%`; `backup ok <env> <snapshot-id>` | 0/1/2 |
| `restore.sh` | `root` | `<hml\|prod> <snapshot\|latest> <banco-destino>` | `error: target database must be new and not 'postgres'`; `warn: pg_restore reported errors`; `units=<n> profiles=<n> memberships=<n>` | 0/1/2 |
| `grant-admin.sh` | `estaca-<env>` ou `root` | `<hml\|prod> <email>` | `error: no user with this email`; `error: user has no profile yet`; `already admin`; `granted` | 0/1/2 |

O RAM mínimo de `provision-host.sh` usa GB decimais: falha se `MemTotal` (kB, de `/proc/meminfo`) `< MIN_RAM_GB × 1000000`. `MIN_RAM_GB` tem padrão `12`. A checagem roda antes de qualquer instalação (CA-24).

### 2.4 `infra/supabase/docker-compose.override.yml`

```yaml
# Estaca overrides on top of supabase/docker at infra/supabase/VERSION (self-hosted/v0.8.4).
# ENV_NAME and HOST_* come from /opt/estaca/<env>/.env. Requires Docker Compose >= 2.24.4 (!override/!reset).
services:
  studio:
    container_name: estaca-${ENV_NAME}-studio
    ports: !override
      - 127.0.0.1:${HOST_STUDIO_PORT}:3000
  api-gw:
    container_name: estaca-${ENV_NAME}-envoy
    ports: !override
      - 127.0.0.1:${HOST_GW_PORT}:8000/tcp
  auth:
    container_name: estaca-${ENV_NAME}-auth
    environment:
      GOTRUE_EXTERNAL_GOOGLE_ENABLED: ${GOOGLE_ENABLED}
      GOTRUE_EXTERNAL_GOOGLE_CLIENT_ID: ${GOOGLE_CLIENT_ID}
      GOTRUE_EXTERNAL_GOOGLE_SECRET: ${GOOGLE_SECRET}
      GOTRUE_EXTERNAL_GOOGLE_REDIRECT_URI: ${API_EXTERNAL_URL}/callback
      GOTRUE_EXTERNAL_APPLE_ENABLED: ${APPLE_ENABLED}
      GOTRUE_EXTERNAL_APPLE_CLIENT_ID: ${APPLE_CLIENT_ID}
      GOTRUE_EXTERNAL_APPLE_SECRET: ${APPLE_SECRET}
      GOTRUE_EXTERNAL_APPLE_REDIRECT_URI: ${API_EXTERNAL_URL}/callback
  rest:
    container_name: estaca-${ENV_NAME}-rest
  realtime:
    # The "realtime-dev." label is the realtime tenant id; keep it.
    container_name: realtime-dev.estaca-${ENV_NAME}-realtime
  storage:
    container_name: estaca-${ENV_NAME}-storage
  imgproxy:
    container_name: estaca-${ENV_NAME}-imgproxy
  meta:
    container_name: estaca-${ENV_NAME}-meta
  functions:
    container_name: estaca-${ENV_NAME}-edge-functions
  db:
    container_name: estaca-${ENV_NAME}-db
    ports: !override
      - 127.0.0.1:${HOST_DB_PORT}:5432
  supavisor:
    container_name: estaca-${ENV_NAME}-pooler
    ports: !reset []
  analytics:
    container_name: estaca-${ENV_NAME}-analytics
  vector:
    container_name: estaca-${ENV_NAME}-vector
```

`COMPOSE_FILE` no `.env` = `docker-compose.yml:docker-compose.logs.yml:/opt/estaca/<env>/app/infra/supabase/docker-compose.override.yml`.

O `sed` de nomes roda em `provision-env.sh` sobre exatamente três arquivos de `$DOCKER_DIR`: `volumes/api/envoy/cds.yaml`, `volumes/api/envoy/lds.template.yaml` e `volumes/logs/vector.yml`. O comando é `sed -i "s/supabase-/estaca-${ENV_NAME}-/g"`, seguido de `grep -q 'supabase-'` nesses arquivos, que precisa falhar; se não falhar, `die "error: container name rewrite incomplete"`.

### 2.5 `infra/supabase/env.template`

Mesmas variáveis do `.env.example` do upstream no commit fixado, mais as nossas. Cada linha tem um comentário em inglês acima, dizendo quem preenche (RF-05). Regras:

| Grupo | Variáveis | Valor no template | Quem preenche |
| --- | --- | --- | --- |
| Composição | `COMPOSE_FILE`, `COMPOSE_PROJECT_NAME`, `ENV_NAME`, `HOST_GW_PORT`, `HOST_STUDIO_PORT`, `HOST_DB_PORT` | `set-by-provision-env` | `provision-env.sh` (valores da tabela 2.1) |
| URLs | `SUPABASE_PUBLIC_URL`, `API_EXTERNAL_URL` | `set-by-provision-env` | `provision-env.sh` (URL pública do ambiente) |
| Segredos do upstream | `POSTGRES_PASSWORD`, `JWT_SECRET`, `ANON_KEY`, `SERVICE_ROLE_KEY`, `DASHBOARD_PASSWORD`, `SECRET_KEY_BASE`, `REALTIME_DB_ENC_KEY`, `VAULT_ENC_KEY`, `PG_META_CRYPTO_KEY`, `LOGFLARE_PUBLIC_ACCESS_TOKEN`, `LOGFLARE_PRIVATE_ACCESS_TOKEN`, `S3_PROTOCOL_ACCESS_KEY_ID`, `S3_PROTOCOL_ACCESS_KEY_SECRET`, `MINIO_ROOT_PASSWORD` | `generated-by-provision-env` | `utils/generate-keys.sh --update-env` do upstream |
| Nossos segredos gerados | `RESTIC_PASSWORD` | `generated-by-provision-env` | `openssl rand -hex 32` |
| Auth fixo | `SITE_URL=estacacriciuma://`, `ADDITIONAL_REDIRECT_URLS=estacacriciuma://auth-callback`, `DISABLE_SIGNUP=false`, `ENABLE_EMAIL_SIGNUP=true`, `ENABLE_EMAIL_AUTOCONFIRM=false`, `ENABLE_ANONYMOUS_USERS=false`, `ENABLE_PHONE_SIGNUP=false`, `ENABLE_PHONE_AUTOCONFIRM=false`, `DASHBOARD_USERNAME=estaca` | esses valores | fixo |
| SMTP | `SMTP_ADMIN_EMAIL=nao-responda@estacacriciuma.com.br`, `SMTP_HOST=smtp.resend.com`, `SMTP_PORT=465`, `SMTP_USER=resend`, `SMTP_SENDER_NAME="Estaca Criciúma"`, `SMTP_PASS=fill-in-manually` | esses valores | fixo; `SMTP_PASS` manual (chave do Resend) |
| Google/Apple | `GOOGLE_ENABLED=false`, `GOOGLE_CLIENT_ID=`, `GOOGLE_SECRET=`, `APPLE_ENABLED=false`, `APPLE_CLIENT_ID=`, `APPLE_SECRET=` | esses valores | `auth-account` |
| Backup e monitor | `OCI_S3_ENDPOINT`, `OCI_REGION`, `OCI_BUCKET`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `HEALTHCHECKS_URL` | `fill-in-manually` | manual (runbook itens d e h) |
| Chaves assimétricas | `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `JWT_KEYS`, `JWT_JWKS`, `ANON_KEY_ASYMMETRIC`, `SERVICE_ROLE_KEY_ASYMMETRIC` | vazio | não usadas (comentário: legacy HS256 keys only) |
| Demais do upstream | as que sobrarem do `.env.example` do commit fixado | valor padrão do upstream | fixo |

Nenhum valor do template é um JWT ou uma chave real. As chaves demo do upstream (`eyJ…`) **não** são copiadas (CA-08). As variáveis manuais obrigatórias, checadas por `provision-env.sh`, são `SMTP_PASS`, `OCI_S3_ENDPOINT`, `OCI_REGION`, `OCI_BUCKET`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` e `HEALTHCHECKS_URL`; cada uma é inválida quando vazia ou igual a `fill-in-manually`.

### 2.6 `infra/caddy/Caddyfile`

```caddyfile
(estaca_site) {
	header Strict-Transport-Security "max-age=31536000"
	tls {
		protocols tls1.2 tls1.3
	}
	handle /healthz/auth {
		rewrite * /auth/v1/health
		reverse_proxy 127.0.0.1:{args[0]} {
			header_up apikey {env.{args[1]}}
		}
	}
	handle /healthz/rest {
		rewrite * /rest/v1/
		reverse_proxy 127.0.0.1:{args[0]} {
			header_up apikey {env.{args[1]}}
		}
	}
	@api path /auth/v1/* /rest/v1/* /storage/v1/* /functions/v1/* /realtime/v1/*
	handle @api {
		reverse_proxy 127.0.0.1:{args[0]}
	}
	handle {
		respond 404
	}
}

api-hml.estacacriciuma.com.br {
	import estaca_site 8100 HML_ANON_KEY
}

api.estacacriciuma.com.br {
	import estaca_site 8000 PROD_ANON_KEY
}
```

Se o Caddy instalado não aceitar placeholder aninhado (`{env.{args[1]}}`; verificar com `caddy validate --config infra/caddy/Caddyfile --adapter caddyfile`), troque `{env.{args[1]}}` por `{env.HML_ANON_KEY}` e `{env.PROD_ANON_KEY}` escritos em cada site, sem o snippet para os dois `handle /healthz/*`. O comportamento é o mesmo. O redirecionamento HTTP → HTTPS (`308`) é o padrão do Caddy.

### 2.7 SQL do `grant-admin.sh`

Uma única instrução, portanto atômica. O e-mail entra como variável do `psql` (`-v email=…`):

```sql
with u as (select id from auth.users where lower(email) = lower(:'email')),
p as (select pr.id from public.profiles pr join u on u.id = pr.id),
m as (select 1 from public.memberships ms join p on p.id = ms.user_id
      where ms.unit_id = 'estaca' and ms.role = 'admin'),
ins as (insert into public.memberships (user_id, unit_id, role)
        select id, 'estaca', 'admin' from p where not exists (select 1 from m)
        returning user_id),
log as (insert into public.role_grants_log (action, user_id, unit_id, role)
        select 'granted', user_id, 'estaca', 'admin' from ins returning 1)
select case
  when not exists (select 1 from u) then 'not_found'
  when not exists (select 1 from p) then 'no_profile'
  when exists (select 1 from m) then 'already'
  else 'granted' end;
```

Mapeamento: `not_found` → `error: no user with this email` (1); `no_profile` → `error: user has no profile yet` (1); `already` → `already admin` (0); `granted` → `granted` (0).

### 2.8 `.github/workflows/deploy.yml`

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
        description: Git ref to deploy to production
        required: true
        default: main

permissions:
  contents: read

jobs:
  deploy-hml:
    if: github.event_name == 'workflow_run' && github.event.workflow_run.conclusion == 'success' && github.event.workflow_run.event == 'push'
    runs-on: ubuntu-latest
    environment: hml
    concurrency: { group: deploy-hml, cancel-in-progress: false }
    steps:
      - name: Deploy
        env:
          SHA: ${{ github.event.workflow_run.head_sha }}
          DEPLOY_HOST: ${{ secrets.DEPLOY_HOST }}
          DEPLOY_SSH_KEY: ${{ secrets.DEPLOY_SSH_KEY }}
          DEPLOY_KNOWN_HOSTS: ${{ secrets.DEPLOY_KNOWN_HOSTS }}
        run: |
          install -m 700 -d ~/.ssh
          printf '%s\n' "$DEPLOY_SSH_KEY" > ~/.ssh/id_ed25519 && chmod 600 ~/.ssh/id_ed25519
          printf '%s\n' "$DEPLOY_KNOWN_HOSTS" > ~/.ssh/known_hosts
          ssh "estaca-hml@$DEPLOY_HOST" "cd /opt/estaca/hml/app && git fetch --quiet origin && git checkout --quiet --force $SHA && infra/scripts/deploy.sh hml $SHA"

  deploy-prod:
    if: github.event_name == 'workflow_dispatch'
    runs-on: ubuntu-latest
    environment: production
    concurrency: { group: deploy-prod, cancel-in-progress: false }
    steps:
      - uses: actions/checkout@v4
        with:
          ref: ${{ inputs.ref }}
      - name: Deploy
        env:
          DEPLOY_HOST: ${{ secrets.DEPLOY_HOST }}
          DEPLOY_SSH_KEY: ${{ secrets.DEPLOY_SSH_KEY }}
          DEPLOY_KNOWN_HOSTS: ${{ secrets.DEPLOY_KNOWN_HOSTS }}
        run: |
          SHA="$(git rev-parse HEAD)"
          install -m 700 -d ~/.ssh
          printf '%s\n' "$DEPLOY_SSH_KEY" > ~/.ssh/id_ed25519 && chmod 600 ~/.ssh/id_ed25519
          printf '%s\n' "$DEPLOY_KNOWN_HOSTS" > ~/.ssh/known_hosts
          ssh "estaca-prod@$DEPLOY_HOST" "cd /opt/estaca/prod/app && git fetch --quiet origin && git checkout --quiet --force $SHA && infra/scripts/deploy.sh prod $SHA"
```

O job de `hml` só roda quando o workflow `CI` inteiro passou num `push` para `main` (os jobs `check` e `db`), o que atende RF-10 com folga. A aprovação de produção vem da regra "Required reviewers" do Environment `production`, configurada no GitHub (runbook item g).

## 3. Dependências novas

Nenhuma dependência do app (`package.json` não muda). Na VM, instaladas por `provision-host.sh`, todas previstas na seção 4 da spec:

| Pacote | Versão | Origem |
| --- | --- | --- |
| Docker Engine + `docker-compose-plugin` | estável do repositório `download.docker.com` (Compose ≥ 2.24.4) | apt (repositório oficial Docker, arm64) |
| Caddy | 2.x estável | apt (`dl.cloudsmith.io/public/caddy/stable`) |
| Supabase CLI | 2.84.2 | `.deb` `supabase_2.84.2_linux_arm64.deb` da release do GitHub |
| restic, rsync, git, jq, openssl, curl, fail2ban, ufw, unattended-upgrades | do Ubuntu | apt |
| Supabase self-hosted | `self-hosted/v0.8.4` = `189adda99d1b56da55fc5a6ee3f849354aaea92a` | sparse clone de `supabase/supabase` |

## 4. Tarefas

- [x] **T-01 — Unidades como migration de dados**
  - Arquivos: `criar supabase/migrations/<ts>_units_reference_data.sql` (via `supabase migration new units_reference_data`) · `alterar supabase/seed.sql`
  - O que fazer: mova o `insert into public.units ...` das linhas 3 a 10 do `seed.sql` para a migration, acrescentando `on conflict (id) do nothing`. Acima do insert, ponha o comentário `-- Reference data: the 7 real units exist in every environment (prod has no seed).`. No `seed.sql`, ajuste o comentário da linha 1 para `-- Local/hml seed: fictitious accounts only (no real member data). Units come from a migration.`
  - Referência: `supabase/seed.sql:1-10`, `supabase/migrations/20261113220132_base_units_profiles_roles.sql` (estilo SQL)
  - Cobre: CA-14
  - Verificar: `supabase db reset --no-seed` e depois `psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -Atc "select count(*) from units"` → `7`; em seguida `supabase db reset` e `make test-db` (59 testes passam)

- [x] **T-02 — `lib.sh`, `make lint-infra` e CI**
  - Arquivos: `criar infra/scripts/lib.sh` · `alterar Makefile` · `alterar .github/workflows/ci.yml`
  - O que fazer: escreva `lib.sh` conforme a seção 2.2, com `# shellcheck shell=bash` no topo e sem `set -euo pipefail` (quem faz `source` já define). No `Makefile`, crie `REQUIRE_SHELLCHECK = if ! command -v shellcheck >/dev/null 2>&1; then echo "[make $@] shellcheck não encontrado: nada a fazer"; exit 0; fi;`, adicione `lint-infra` à `.PHONY` e o alvo `lint-infra: ## Lint dos scripts de infra (ShellCheck)` com receita `@$(REQUIRE_SHELLCHECK) shellcheck -x infra/scripts/*.sh`. Na CI, adicione ao job `check`, depois de `make setup`, o passo `- name: Lint dos scripts de infra` / `run: make lint-infra`.
  - Referência: `Makefile:18` (`REQUIRE_SUPABASE`), `.github/workflows/ci.yml:27-31`
  - Cobre: CA-21 (parcial; completa em T-09)
  - Verificar: `make lint-infra` (com e sem ShellCheck no PATH: `PATH=/usr/bin:/bin make lint-infra` deve imprimir a mensagem de RF-18 e sair com 0) e `make help` listando `lint-infra`

- [x] **T-03 — Versão fixada, override e `env.template`**
  - Arquivos: `criar infra/supabase/VERSION` (uma linha: `189adda99d1b56da55fc5a6ee3f849354aaea92a`) · `criar infra/supabase/docker-compose.override.yml` (seção 2.4) · `criar infra/supabase/env.template` (seção 2.5)
  - O que fazer: monte o `env.template` a partir do `.env.example` do upstream nesse commit (`https://raw.githubusercontent.com/supabase/supabase/189adda99d1b56da55fc5a6ee3f849354aaea92a/docker/.env.example`), aplicando as regras da tabela 2.5. Ponha um comentário em inglês por variável e acrescente as variáveis nossas.
  - Referência: seções 2.4 e 2.5; `.env.example` da raiz (estilo de comentário)
  - Cobre: CA-08, CA-09, base para CA-06 e CA-07
  - Verificar: (1) `grep -rEn 'eyJ[A-Za-z0-9_-]{20,}|re_[A-Za-z0-9]{20,}' infra/ .github/` → nada; (2) num diretório do scratchpad, faça sparse clone do upstream nesse commit, copie o template como `.env` com `ENV_NAME=hml`, portas e `COMPOSE_FILE` de hml, e rode `docker compose -p estaca-hml --project-directory <dir>/docker config`. Ele precisa terminar sem erro, e a saída não pode ter `published` sem `host_ip: 127.0.0.1`, nem `image:` com `:latest`.

- [x] **T-04 — Caddyfile**
  - Arquivos: `criar infra/caddy/Caddyfile` (seção 2.6)
  - O que fazer: como na seção 2.6, incluindo o fallback do placeholder se `caddy validate` reclamar.
  - Referência: seção 2.6
  - Cobre: CA-04, CA-05, CA-18 (configuração; verificação real na T-11)
  - Verificar: `docker run --rm -v "$PWD/infra/caddy:/etc/caddy" -e HML_ANON_KEY=x -e PROD_ANON_KEY=y caddy:2 caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile` → `Valid configuration`

- [x] **T-05 — `provision-host.sh`**
  - Arquivos: `criar infra/scripts/provision-host.sh` · `criar infra/systemd/estaca-backup@.service` · `criar infra/systemd/estaca-backup@.timer`
  - O que fazer: `set -euo pipefail`; carregar `lib.sh` (`# shellcheck source=lib.sh` + `source "$(dirname "$0")/lib.sh"`). Passos, nesta ordem, cada um idempotente (um arquivo só é reescrito se o conteúdo mudar: gere em temporário e use `cmp -s || install`):
    1. Exigir root; checar RAM (seção 2.3) antes de tudo.
    2. `apt-get install` dos pacotes do Ubuntu da seção 3; repositórios e chaves do Docker e do Caddy em `/etc/apt/keyrings`; instalar o `.deb` do Supabase CLI só se `supabase --version` ≠ `2.84.2`.
    3. `timedatectl set-timezone America/Sao_Paulo`.
    4. Usuários `estaca-hml` e `estaca-prod` (`useradd --create-home --shell /bin/bash`, se não existirem), no grupo `docker`, com `~/.ssh` em 700 e `authorized_keys` em 600 (criado vazio se não existir; as chaves são colocadas pelo runbook).
    5. `/etc/ssh/sshd_config.d/10-estaca.conf` com `PasswordAuthentication no`, `KbdInteractiveAuthentication no` e `PermitRootLogin no`; `sshd -t && systemctl reload ssh`.
    6. `/etc/fail2ban/jail.local` com `[sshd]` / `enabled = true`; `systemctl enable --now fail2ban`.
    7. `/etc/apt/apt.conf.d/20auto-upgrades` com `APT::Periodic::Update-Package-Lists "1";` e `APT::Periodic::Unattended-Upgrade "1";`.
    8. Firewall da imagem Oracle: se `/etc/iptables/rules.v4` existir e não tiver `--dport 80`, insira antes da primeira linha `-A INPUT -j REJECT` as linhas `-A INPUT -p tcp -m state --state NEW -m tcp --dport 80 -j ACCEPT` e o equivalente para `443`, depois `netfilter-persistent reload`. Não remova as regras da Oracle, porque elas liberam o tráfego de metadados `169.254.0.0/16`.
    9. `ufw default deny incoming`, `ufw default allow outgoing`, `ufw allow 22/tcp`, `ufw allow 80/tcp`, `ufw allow 443/tcp` e `ufw --force enable`.
    10. Copiar `infra/caddy/Caddyfile` para `/etc/caddy/Caddyfile`. Criar `/etc/caddy/estaca.env` (600, root) com `HML_ANON_KEY=` e `PROD_ANON_KEY=` se não existir, e o drop-in `caddy.service.d/estaca.conf` com `[Service]` / `EnvironmentFile=/etc/caddy/estaca.env`. Depois, `systemctl daemon-reload && systemctl enable caddy && systemctl restart caddy`.
    11. Copiar as units de `infra/systemd/` para `/etc/systemd/system/` e rodar `systemctl daemon-reload`.
    12. `mkdir -p /opt/estaca` (755, root).
  - Units: `.service` = `[Unit] Description=Estaca backup (%i)` / `[Service] Type=oneshot` / `ExecStart=/opt/estaca/%i/app/infra/scripts/backup.sh %i`. `.timer` = `[Timer] OnCalendar=*-*-* 03:00:00 America/Sao_Paulo` / `Persistent=true` / `[Install] WantedBy=timers.target`.
  - Referência: seções 2.1 e 2.3
  - Cobre: CA-01, CA-02, CA-03, CA-24 (execução real na T-11)
  - Verificar: `make lint-infra`; `bash -n infra/scripts/provision-host.sh`

- [x] **T-06 — `provision-env.sh`**
  - Arquivos: `criar infra/scripts/provision-env.sh`
  - O que fazer: `set -euo pipefail`, carregar `lib.sh`, `require_env_arg`, exigir root e `set_env_paths`. Passos:
    1. `/opt/estaca/<env>` (750, dono `estaca-<env>`).
    2. Se `app/` não existir: `sudo -u estaca-<env> git clone --quiet "$REPO_URL" app`.
    3. `SHA=$(cat app/infra/supabase/VERSION)`. Se `supabase/` não existir: `sudo -u estaca-<env> git clone --quiet --filter=blob:none --no-checkout "$SUPABASE_REPO_URL" supabase`, `git sparse-checkout set docker` e `git checkout --quiet "$SHA"`. Se existir e `HEAD` ≠ `SHA`: `fetch` + `checkout --force "$SHA"` (caminho de atualização).
    4. Reescrita de nomes (seção 2.4), sempre (é idempotente).
    5. `.env`: se não existir, copie o template para um temporário (`mktemp -d`), rode lá `sh "$DOCKER_DIR/utils/generate-keys.sh" --update-env >/dev/null`, preencha as variáveis de composição e URLs (tabela 2.1) e `RESTIC_PASSWORD=$(openssl rand -hex 32)`, e instale em `$ENV_FILE` com `install -m 600 -o estaca-<env>`. Se existir, para cada variável do template ausente no `.env`, acrescente a linha do template e imprima `warn: added VAR from env.template; review it`; nunca altere linhas existentes. Por fim, `ln -sfn "$ENV_FILE" "$DOCKER_DIR/.env"`.
    6. Checar as variáveis manuais (seção 2.5). Se faltar alguma, `die "error: fill VAR1, VAR2 in /opt/estaca/<env>/.env and run again"`.
    7. Atualizar a linha `HML_ANON_KEY=`/`PROD_ANON_KEY=` de `/etc/caddy/estaca.env` com `env_get ANON_KEY` e, só se ela mudou, `systemctl restart caddy`.
    8. `compose pull -q && compose up -d --wait`.
    9. Inicializar o restic, exportando as variáveis com `env_get`: `RESTIC_REPOSITORY="s3:$OCI_S3_ENDPOINT/$OCI_BUCKET/<env>"`, `RESTIC_PASSWORD`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_DEFAULT_REGION=$OCI_REGION`, sempre com `-o s3.bucket-lookup=path`. Se `restic cat config` falhar, rodar `restic init`.
    10. Só para `hml` e sem `.seeded`: rodar `sudo -u estaca-hml infra/scripts/deploy.sh hml "$(git -C app rev-parse HEAD)"` para as migrations, depois `db_psql postgres < app/supabase/seed.sql` e `touch .seeded`.
    11. `systemctl enable --now estaca-backup@<env>.timer`.
    12. Imprimir a URL pública e o comando de túnel do Studio (`ssh -L <HOST_STUDIO_PORT>:127.0.0.1:<HOST_STUDIO_PORT> estaca-<env>@<host>`), sem nenhum segredo.
  - Referência: seções 2.1 a 2.5
  - Cobre: CA-06, CA-07, CA-10, CA-22 (execução real na T-11)
  - Verificar: `make lint-infra`; `bash infra/scripts/provision-env.sh staging; echo $?` → `usage: provision-env.sh <hml|prod>` e `2`

- [x] **T-07 — `deploy.sh` e workflow de deploy**
  - Arquivos: `criar infra/scripts/deploy.sh` · `criar .github/workflows/deploy.yml` (seção 2.8)
  - O que fazer: `deploy.sh`, após `require_env_arg` e o `sha` (sem `sha`, `die "usage: deploy.sh <hml|prod> <git-sha>" 2`):
    1. `sha` precisa casar com `^[0-9a-f]{7,40}$`; `git -C app fetch --quiet origin`; `git -C app cat-file -e "$sha^{commit}"`; se qualquer um falhar, `die "error: unknown commit"`. Depois, `git -C app checkout --quiet --force "$sha"`.
    2. Se `env = prod`: `infra/scripts/backup.sh prod || die "error: pre-deploy backup failed"`.
    3. `PGPASSWORD="$(env_get POSTGRES_PASSWORD)" supabase db push --db-url "postgresql://postgres@127.0.0.1:$HOST_DB_PORT/postgres" --workdir "$APP_DIR" --yes`, exportando `PGPASSWORD` só para esse comando, com a senha fora da URL.
    4. Se `app/supabase/functions` existir e não estiver vazia: `rsync -a --delete --exclude main/ app/supabase/functions/ "$DOCKER_DIR/volumes/functions/"` e `compose restart functions`. Senão, imprimir `info: no edge functions to deploy`.
    5. Imprimir `deployed <env> <sha>`.
  - Referência: seções 2.2, 2.3 e 2.8; `.github/workflows/ci.yml` (estilo de workflow)
  - Cobre: CA-11, CA-12, CA-13
  - Verificar: `make lint-infra`; `bash infra/scripts/deploy.sh hml; echo $?` → usage e `2`; `python3 -c "import yaml,sys; yaml.safe_load(open(sys.argv[1]))" .github/workflows/deploy.yml` sem erro

- [x] **T-08 — `backup.sh` e `restore.sh`**
  - Arquivos: `criar infra/scripts/backup.sh` · `criar infra/scripts/restore.sh`
  - O que fazer:
    - `backup.sh <env>`: `trap` em `EXIT` que, com código ≠ 0, chama `ping_healthchecks /fail`, e em qualquer caso apaga `backup-tmp/`. Passos:
      1. Se `df --output=pcent /opt/estaca | tail -1` (sem `%`) for > 85, `die "error: disk usage above 85%"`.
      2. `mkdir -m 700 backup-tmp`.
      3. `PGPASSWORD=… docker exec -e PGPASSWORD "$DB_CONTAINER" pg_dumpall -h 127.0.0.1 -U supabase_admin --globals-only > backup-tmp/globals.sql`.
      4. `… pg_dump -h 127.0.0.1 -U supabase_admin -d postgres -Fc > backup-tmp/postgres.dump`.
      5. Com o restic exportado como no passo 9 da T-06: `restic -o s3.bucket-lookup=path backup --host estaca --tag "<env>" backup-tmp "$DOCKER_DIR/volumes/storage"`.
      6. `restic … forget --host estaca --tag "<env>" --keep-daily 30 --prune`.
      7. `ping_healthchecks`.
      8. Imprimir `backup ok <env> <snapshot-id>`, usando o id curto da saída `--json` do `backup`, extraído com `jq`.
    - `restore.sh <env> <snapshot|latest> <db>`: `db` precisa casar com `^[a-z_][a-z0-9_]{0,62}$`. Se for `postgres` ou já existir (`db_psql postgres -c "select 1 from pg_database where datname = :'db'" -v db="$db"` retornar `1`), `die "error: target database must be new and not 'postgres'"`. Passos:
      1. `restic restore "$snap" --tag "<env>" --target "$BASE/restore/$(date +%Y%m%dT%H%M%S)"`.
      2. `db_psql postgres -c "create database \"$db\""`, com o nome já validado pelo regex.
      3. `PGPASSWORD=… docker exec -i -e PGPASSWORD "$DB_CONTAINER" pg_restore -h 127.0.0.1 -U supabase_admin -d "$db" --no-owner < <dump restaurado>`. Com código ≠ 0, imprimir `warn: pg_restore reported errors` e seguir, porque extensões e objetos do sistema já existentes geram erros esperados.
      4. Imprimir `units=<n> profiles=<n> memberships=<n>` a partir de `select count(*)` no banco restaurado.
  - Referência: seções 2.2 e 2.3
  - Cobre: CA-15, CA-16, CA-17
  - Verificar: `make lint-infra`; `bash infra/scripts/restore.sh hml latest postgres` fora da VM falha só depois da validação de argumento (o teste real é na T-11)

- [x] **T-09 — `grant-admin.sh`**
  - Arquivos: `criar infra/scripts/grant-admin.sh`
  - O que fazer: argumentos `<env> <email>` (sem e-mail, `die "usage: grant-admin.sh <hml|prod> <email>" 2`). Rodar o SQL da seção 2.7 com `db_psql postgres -v email="$email"`, com o SQL via heredoc no stdin, e mapear o resultado como na seção 2.7. O e-mail não aparece em nenhuma saída.
  - Referência: seção 2.7; `supabase/migrations/20261113220132_base_units_profiles_roles.sql` (tabelas)
  - Cobre: CA-20, CA-21
  - Verificar: `make lint-infra`. Localmente, contra o Supabase da CLI, valide o SQL: `psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v email=membro@exemplo.org -f <sql>` → `granted`, e de novo → `already`; `-v email=x@y.z` → `not_found`. Depois, `supabase db reset` para limpar.

- [x] **T-10 — Runbooks, ADR e docs**
  - Arquivos: `criar docs/runbooks/provisioning.md` · `criar docs/runbooks/backup.md` · `criar docs/runbooks/supabase-down.md` · `criar .ai/adrs/0003-hospedagem-supabase-oracle.md` · `alterar .ai/docs/SECURITY.md` · `alterar .ai/docs/ARCHITECTURE.md` · `alterar .ai/docs/O11Y.md` · `alterar AGENTS.md`
  - O que fazer:
    - `provisioning.md`: itens (a) a (k) de RF-19, com comandos exatos. Inclua a geração da chave de deploy por ambiente (`ssh-keygen -t ed25519 -C deploy-<env> -N ''`), a chave pública em `~estaca-<env>/.ssh/authorized_keys` e a privada no secret `DEPLOY_SSH_KEY` do Environment; `DEPLOY_KNOWN_HOSTS` obtido com `ssh-keyscan <host>`; e os Environments `hml` (sem revisor) e `production` (1 revisor). Explique também como rodar o `provision-env.sh` duas vezes: a primeira para, pedindo as variáveis manuais.
    - `backup.md` e `supabase-down.md`: conteúdo de RF-20, incluindo `docker compose -p estaca-<env> --project-directory /opt/estaca/<env>/supabase/docker ps|logs <serviço>`, o nome do serviço do gateway (`api-gw`) e o rollback com `deploy.sh <env> <sha-anterior>`. Avise que migration não tem rollback automático: a reversão é uma migration nova ou a restauração do backup.
    - ADR 0003 no formato de `.ai/adrs/_template.md`: contexto (dados sensíveis, time voluntário, custo), opções (VM Oracle única com dois stacks, uma VM por ambiente, Supabase Cloud), decisão e consequências (risco residual de root/Docker, recuperação de instância Always Free, imagens arm64, gateway Envoy do upstream).
    - Docs conforme RF-21. Em `SECURITY.md` › Dados tratados, acrescente a linha "E-mail do destinatário do OTP | Pessoal | Resend (EUA), só em trânsito | Consentimento | Não armazenado pelo app; logs do Resend conforme a política do fornecedor" e cite a transferência internacional. Em `ARCHITECTURE.md` › Ambientes, preencha as URLs e o deploy e cite `infra/` na estrutura de pastas. Em `O11Y.md` › Alertas, ponha as ferramentas e os caminhos dos runbooks.
  - Referência: `.ai/adrs/0002-stack-inicial.md` (formato de ADR); `.ai/docs/SECURITY.md` › Infra self-hosted
  - Cobre: CA-23
  - Verificar: leitura; `grep -n "A definir" .ai/docs/SECURITY.md .ai/docs/ARCHITECTURE.md .ai/docs/O11Y.md` não mostra os pontos de RF-21

- [ ] **T-11 — Provisionar a homologação e executar o QA (sessão principal, com o usuário)**
  - Arquivos: nenhum no repositório, exceto correções que o QA revelar (registradas no plano)
  - O que fazer: seguir `docs/runbooks/provisioning.md` itens (a) a (j) com o usuário, que tem as contas e o acesso SSH à VM, e depois o roteiro de QA da spec (passos 1 a 11). Cada CA manual é registrado no Registro de implementação com data e resultado. Os segredos ficam só no servidor e no gerenciador de senhas do usuário, e nada deles entra na conversa nem em arquivos.
  - Referência: seção 12 da spec
  - Cobre: CA-01 a CA-07, CA-10 a CA-13, CA-15 a CA-20, CA-22, CA-24 (manuais)
  - Verificar: roteiro de QA sem divergências

## 5. Matriz de cobertura

Justificativa dos manuais: esses CA verificam o estado de uma VM real (firewall, TLS, e-mail, backup no Object Storage, alertas externos), que não tem como ser reproduzido na CI sem a infraestrutura e as contas do usuário.

| CA | Tarefa | Tipo de teste | Arquivo / comando |
| -- | ------ | ------------- | ----------------- |
| CA-01 | T-05, T-11 | manual | `nmap -Pn -p-` de fora |
| CA-02 | T-05, T-11 | manual | `ssh -o PubkeyAuthentication=no`, `ssh root@` |
| CA-03 | T-05, T-11 | manual | 2ª execução de `provision-host.sh` + `sha256sum` |
| CA-04 | T-04, T-11 | manual | `curl -I` |
| CA-05 | T-04, T-11 | manual | `curl` nos caminhos bloqueados e `/rest/v1/units` |
| CA-06 | T-03, T-06, T-11 | automatizado parcial (`docker compose config` em T-03) + manual | `ss -tlnp`, túnel SSH |
| CA-07 | T-06, T-11 | manual | `stat`, `sudo -u estaca-prod cat` |
| CA-08 | T-03 | automatizado (comando) | `grep -rEn …` + comparação de nomes com o `.env` na T-11 |
| CA-09 | T-03 | automatizado (comando) | `cat infra/supabase/VERSION`, `docker compose config` |
| CA-10 | T-06, T-11 | manual | Studio + 2ª execução + `sha256sum` |
| CA-11 | T-07, T-11 | manual | workflow `Deploy` + `supabase migration list` |
| CA-12 | T-07, T-11 | manual | `deploy.sh` com migration inválida |
| CA-13 | T-07, T-11 | manual (inspeção) | `.github/workflows/deploy.yml`, Environment `production` |
| CA-14 | T-01 | automatizado (comando) + pgTAP | `supabase db reset --no-seed`, `make test-db` |
| CA-15 | T-08, T-11 | manual | `systemctl start estaca-backup@hml`, `restic snapshots` |
| CA-16 | T-08, T-11 | manual | backup com senha errada |
| CA-17 | T-08, T-11 | manual | `restore.sh hml latest restore_check` |
| CA-18 | T-04, T-11 | manual | `curl /healthz/*`, `stop api-gw` |
| CA-19 | T-03, T-11 | manual | `POST /auth/v1/otp`, cabeçalhos do e-mail |
| CA-20 | T-09, T-11 | automatizado parcial (SQL local em T-09) + manual | `grant-admin.sh` |
| CA-21 | T-02, T-05 a T-09 | automatizado | `make lint-infra` (local e CI) |
| CA-22 | T-06 | automatizado (comando) | `provision-env.sh staging` |
| CA-23 | T-10 | manual (leitura) | runbooks, ADR, docs |
| CA-24 | T-05, T-11 | manual | `MIN_RAM_GB=1024 provision-host.sh` |

## 6. Riscos e mitigação

| Risco | Mitigação |
| ----- | --------- |
| Uma imagem do upstream sem variante arm64 | Na T-11, `compose pull` falha cedo; registrar a imagem e decidir com o usuário (todas as imagens de `self-hosted/v0.8.4` publicam arm64 hoje) |
| Dois stacks com Analytics excedem a RAM da VM | RNF-13 (≥ 12 GB) checado no `provision-host.sh`; se a VM ficar sem memória, o runbook `supabase-down.md` orienta a parar a homologação primeiro |
| `pg_dump` como `supabase_admin` exige senha diferente | A imagem `supabase/postgres` usa `POSTGRES_PASSWORD` para `supabase_admin`; se a T-11 mostrar falha de autenticação, trocar para `-U postgres` (mesma senha) e registrar o desvio |
| Atualizar o upstream quebra a reescrita de nomes ou o override | `provision-env.sh` falha com `error: container name rewrite incomplete`; a atualização vai primeiro para a homologação (RNF-08) |
| Docker publica portas por fora do `ufw` | Todas as portas do stack em `127.0.0.1` (override); verificado por `docker compose config` (T-03) e `ss -tlnp` (CA-06) |
| `supabase db push` não isola cada migration numa transação | CA-12 verifica de fato; se aparecer estado parcial, o runbook manda restaurar o backup e a migration é corrigida em seguida |
| Vector de um ambiente lendo logs do outro (mesmo socket Docker) | As rotas do Vector filtram por nome de container com o prefixo do ambiente; as linhas do outro ambiente não casam com nenhuma rota e são descartadas |
| Recuperação da instância Always Free pela Oracle | Backup diário fora da VM; o `provisioning.md` recria tudo do zero (caso de borda da spec) |

## 7. Registro de implementação

### Arquivos criados e alterados

Criados: `supabase/migrations/20261114013039_units_reference_data.sql`; `infra/scripts/{lib,provision-host,provision-env,deploy,backup,restore,grant-admin}.sh`; `infra/supabase/{VERSION,docker-compose.override.yml,env.template}`; `infra/caddy/Caddyfile`; `infra/systemd/estaca-backup@.{service,timer}`; `.github/workflows/deploy.yml`; `docs/runbooks/{provisioning,backup,supabase-down}.md`; `.ai/adrs/0003-hospedagem-supabase-oracle.md`.
Alterados: `supabase/seed.sql` (sem o bloco de `units`); `Makefile` (`lint-infra`); `.github/workflows/ci.yml` (passo `make lint-infra`); `.ai/docs/{SECURITY,ARCHITECTURE,O11Y}.md`; `AGENTS.md`.

### Estado das tarefas

T-01 a T-10 concluídas e verificadas no repositório (2026-11-13). **T-11 (provisionar a VM e rodar o QA) está pendente**: é da sessão principal, com o usuário. Nenhum script foi executado numa VM; só a validação de argumentos, o ShellCheck, o `docker compose config`, o `caddy validate`/`adapt` e o SQL do `grant-admin` contra o Supabase local.

Verificações feitas: `make check` passou (47 testes Jest); `make test-db` passou (59 testes) depois de `supabase db reset` normal; `supabase db reset --no-seed` deixa `units` com 7 linhas; ShellCheck via Docker (`koalaman/shellcheck:stable -x infra/scripts/*.sh`) sem avisos; `make lint-infra` sem ShellCheck local imprime o aviso de RF-18 e sai com 0; `grep` de segredos em `infra/` e `.github/` sem ocorrências; `docker compose config` com o `env.template` preenchido para hml (sparse clone no commit fixado): sem erro, só 3 portas publicadas (8100, 3100, 5532) todas com `host_ip: 127.0.0.1`, nenhuma imagem `latest`, nomes de container `estaca-hml-*` e `realtime-dev.estaca-hml-realtime`, e o `grep 'supabase-'` nos três arquivos depois do `sed` não acha nada; `caddy validate` retorna `Valid configuration` e `caddy adapt` mostra `{env.HML_ANON_KEY}`/`{env.PROD_ANON_KEY}` resolvidos (o placeholder aninhado funciona, sem fallback); `deploy.yml` é YAML válido; SQL do `grant-admin` contra o banco local: `granted`, `already`, `not_found`, `no_profile` (sem gravar nada).

### Desvios do plano

- `API_EXTERNAL_URL` no `.env` = URL pública + `/auth/v1` (RF-04 e o plano dizem "URL pública do ambiente"). O upstream espera esse sufixo (o `.env.example` dele usa `.../auth/v1`) e o override monta `${API_EXTERNAL_URL}/callback`; sem o sufixo o callback OAuth sairia em `/callback` e não passaria pelo allowlist do Caddy. Efeito visível ao usuário: nenhum além de callbacks OAuth corretos.
- `OPENAI_API_KEY` vazio no template (o upstream traz um placeholder `sk-proj-xxxxxxxx`), para o assistente de IA do Studio ficar desligado.
- ShellCheck: cada script ganhou `# shellcheck source-path=SCRIPTDIR source=lib.sh` (o `source=lib.sh` sozinho não resolve quando o ShellCheck roda da raiz), `USAGE_EXTRA` é exportada (senão SC2034) e o `lib.sh` tem `# shellcheck disable=SC2034` no topo (variáveis consumidas pelos scripts que fazem `source`).
- `restore.sh`: o teste "banco já existe" usa `printf ... | db_psql -v db=...` (stdin) em vez do `-c` do plano, porque o `psql -c` não interpola `:'db'`. Nome de banco fora do regex sai com `error: invalid database name` e código 2 (o plano não definia a mensagem).
- `provision-env.sh` e `restore.sh` rodam comandos como o usuário do ambiente por `(cd "$BASE" && sudo -u ...)` e `git -C`, para evitar `dubious ownership` e cwd inacessível.

### Decisões durante a implementação

- `lib.sh` ganhou `restic_env`, que exporta as variáveis do restic a partir do `.env` (usada por `provision-env.sh`, `backup.sh` e `restore.sh`), em vez de repetir o bloco do passo 9 da T-06.
- O `.env` novo é montado num diretório temporário; as substituições usam `awk` com `ENVIRON`, para os valores não aparecerem em `argv`. O `generate-keys.sh` do upstream passa os segredos ao `sed` dele (visível por instantes só para root, durante a primeira execução); aceito.
- Migration de unidades com timestamp `20261114013039`.
- Template do `.env`: `POOLER_TENANT_ID=estaca` e `STUDIO_DEFAULT_*` com nomes do projeto; `PROXY_DOMAIN`/`CERTBOT_EMAIL` com valores inertes (as sobreposições de proxy do upstream não são carregadas).
- Nenhum ADR novo além do 0003 previsto.

### Riscos para a T-11 (observados, não confirmados)

- `backup.sh` roda como `estaca-prod` no pré-deploy: pode não ler `volumes/storage` se os arquivos forem de uma UID do container. Se acontecer, rodar o backup pré-deploy com `sudo` ou ajustar permissões.
- `pg_dump` com `-U supabase_admin` (risco já listado na seção 6).
- A primeira execução de `provision-env.sh` espera o Supabase pull de imagens arm64 e o `--wait`; o timeout padrão do compose pode exigir nova execução.

### CA sem teste automatizado

Os CA abaixo dependem da VM real e ficam para a T-11 (manuais, justificativa na seção 5): CA-01, CA-02, CA-03, CA-04, CA-05, CA-06 (parte de `ss -tlnp` e túnel), CA-07, CA-10, CA-11, CA-12, CA-13 (parte do Environment no GitHub), CA-15, CA-16, CA-17, CA-18, CA-19, CA-20 (parte real com conta sem perfil e `role_grants_log` pelo script), CA-22 (execução no servidor; o comando local já retorna `usage` e código 2), CA-24.

Verificados aqui por comando: CA-08 (grep sem ocorrências; a comparação de nomes com o `.env` real fica para a T-11), CA-09 (`VERSION` com 40 caracteres, `docker compose config` sem `latest`), CA-13 (inspeção de `deploy.yml` e `deploy.sh`), CA-14 (`db reset --no-seed` → 7 unidades; `make test-db` → 59), CA-21 (ShellCheck via Docker sem avisos; `make lint-infra` local e na CI), CA-22 (local), CA-23 (leitura: três runbooks com RF-19/RF-20, ADR 0003, docs sem os "A definir" de RF-21, `SECURITY.md` cita o Resend).
