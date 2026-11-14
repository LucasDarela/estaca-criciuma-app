# Infraestrutura do Supabase self-hosted (homologação e produção)

> **Status:** Em implementação
> **Área:** `infra/`, `.github/workflows/deploy.yml`, `docs/runbooks/`, `supabase/migrations/`, `supabase/seed.sql`, `Makefile`, `.ai/docs/`
> **Última atualização:** 2026-11-14
>
> **Arquivada em 2026-11-14:** substituída pela spec `supabase-cloud` (decisão do usuário: Supabase Cloud gratuito em vez de self-hosted). T-01 a T-10 implementadas e verificadas; T-11 nunca executada. Mantida nesta branch só como referência para uma eventual volta ao self-hosted.

## 0. Skills obrigatórias

| Skill | Quando usar |
| ----- | ----------- |
| `ecc:docker-patterns` | Override do Compose do Supabase, volumes, redes e bind de portas |
| `ecc:deployment-patterns` | Workflow de deploy, health checks e procedimento de rollback |
| `ecc:security-review` | Revisão final de hardening, segredos e superfície exposta |
| `ecc:database-migrations` | Aplicação de migrations no servidor e migration de dados das unidades |

## 1. Contexto

O ADR 0002 escolheu o Supabase **self-hosted** para manter sob controle da estaca os dados sensíveis (filiação religiosa, chamados, anotações; ver `SECURITY.md`). Até aqui só existe o Supabase local da CLI. Testar o login no celular (`auth-account`), gerar builds `preview` para os líderes e, depois, publicar nas lojas exigem um backend com endereço público, TLS, e-mail transacional, backup e monitoramento. `SECURITY.md` › Infra self-hosted e `O11Y.md` › Alertas deixam vários desses pontos como "A definir"; esta spec os resolve.

## 2. Objetivo

A homologação (`https://api-hml.estacacriciuma.com.br`) roda o stack Supabase numa VM Oracle Ampere A1 no Brasil, recebe migrations e Edge Functions automaticamente a cada merge na `main`, envia o OTP por e-mail e tem backup diário cifrado testado por restauração e monitoramento com alerta. Os mesmos scripts e runbooks sobem a produção (`https://api.estacacriciuma.com.br`) na mesma VM, num stack isolado, quando ela for necessária.

## 3. Estado atual

| Item | Situação | Destino |
| ---- | -------- | ------- |
| VM Oracle Cloud Ampere A1 (arm64), região Brasil | Existe, do usuário | Usar para os dois ambientes |
| Domínio `estacacriciuma.com.br` | Não registrado | Registrar no registro.br (passo manual do runbook) |
| `supabase/config.toml`, `supabase/migrations/`, `supabase/tests/` | Criados em `app-foundation` | Manter |
| `supabase/seed.sql` | Insere as 7 unidades e as contas fictícias | Alterar: as unidades saem para uma migration de dados (RF-14) |
| `supabase/functions/` | Não existe | Sem mudança (o deploy trata a pasta ausente ou vazia) |
| `.github/workflows/ci.yml` | Jobs `check` e `db` | Alterar: passo `make lint-infra` no job `check` |
| `Makefile` | Sem alvos de infra | Alterar: alvo `lint-infra` |
| `.env.example` | Variáveis do app e das Edge Functions | Manter (variáveis do servidor ficam em `infra/supabase/env.template`) |
| `infra/`, `docs/runbooks/`, workflow de deploy | Não existem | Criar |

## 4. Tecnologias e versões

| Tecnologia | Versão | Situação | Uso nesta entrega |
| ---------- | ------ | -------- | ----------------- |
| Ubuntu Server | 24.04 LTS arm64 (22.04 LTS aceito) | na VM | Sistema da VM |
| Docker Engine + Compose plugin | estável mais recente do repositório oficial Docker | adicionar na VM | Stacks Supabase |
| Supabase self-hosted (`supabase/supabase`, pasta `docker/`) | commit fixado em `infra/supabase/VERSION` | adicionar na VM | Postgres, GoTrue, PostgREST, Storage, Edge Runtime, gateway Envoy, Studio, Analytics |
| Supabase CLI | 2.84.2 (mesma da CI) | adicionar na VM | `supabase db push` no deploy |
| Caddy | 2.x do repositório oficial | adicionar na VM | Proxy reverso e TLS automático (Let's Encrypt) |
| restic | do apt do Ubuntu | adicionar na VM | Backup cifrado (AES-256) para Object Storage S3-compatível |
| Oracle Object Storage | API compatível com S3 | adicionar (conta Oracle) | Destino dos backups |
| Resend | SMTP | adicionar (conta) | Envio do OTP pelo GoTrue |
| UptimeRobot, Healthchecks.io | planos gratuitos | adicionar (contas) | Uptime e heartbeat de backup |
| GitHub Actions + Environments | — | existente | Deploy (`hml` e `production`) |
| ShellCheck | pré-instalado no runner `ubuntu-latest` | CI | Lint dos scripts de `infra/` |

## 5. Restrições e requisitos não funcionais

| ID | Requisito |
| -- | --------- |
| RNF-01 | Portas públicas da VM: só 22 (SSH), 80 e 443 (Caddy), fechadas tanto na Security List/NSG da Oracle quanto no `ufw` da VM. Todas as portas publicadas pelos containers fazem bind em `127.0.0.1`. |
| RNF-02 | SSH só por chave; `PasswordAuthentication no`, `PermitRootLogin no`; `fail2ban` ativo para `sshd`; `unattended-upgrades` ativo para atualizações de segurança. |
| RNF-03 | O Caddy só encaminha ao gateway da API (Envoy, serviço `api-gw`) os prefixos `/auth/v1/`, `/rest/v1/`, `/storage/v1/`, `/functions/v1/` e `/realtime/v1/`, além dos health checks de RF-07. Qualquer outro caminho (inclusive `/`, `/pg/` e o Studio) responde `404`. |
| RNF-04 | Studio e Postgres só são acessíveis por túnel SSH (`ssh -L`); nunca pela internet. |
| RNF-05 | HTTPS obrigatório: HTTP redireciona para HTTPS (`308`), certificado Let's Encrypt válido, TLS ≥ 1.2 e cabeçalho `Strict-Transport-Security: max-age=31536000`. |
| RNF-06 | Isolamento entre ambientes: cada um tem usuário Linux (`estaca-hml`, `estaca-prod`), diretório (`/opt/estaca/hml`, `/opt/estaca/prod`), projeto Compose (`estaca-hml`, `estaca-prod`), rede e volumes Docker, segredos, senha do restic, prefixo de backup e check do Healthchecks próprios. Nenhum segredo é compartilhado entre ambientes. Risco residual aceito (decisão 9): quem tem `root` ou acesso ao daemon Docker alcança os dois ambientes. |
| RNF-07 | Segredos (JWT secret, anon key, service role key, senha do Postgres, senha do Studio, chave SMTP, credenciais do Object Storage, senha do restic, URL do Healthchecks) são gerados ou colados **só no servidor**, em `/opt/estaca/<env>/.env` com permissão `600` e dono `estaca-<env>`, e copiados para o gerenciador de senhas do admin técnico. Nunca vão para o repositório, para logs do GitHub Actions nem para variável `EXPO_PUBLIC_*` (exceto URL e anon key, que são públicas). |
| RNF-08 | A versão do Supabase é fixada por commit em `infra/supabase/VERSION`; nenhuma imagem usa a tag `latest`. Atualizar é uma mudança explícita no repositório, aplicada primeiro na homologação. |
| RNF-09 | O seed com contas fictícias (`supabase/seed.sql`) roda só na homologação, uma vez, no provisionamento. Nem o deploy nem o provisionamento da produção o executam. |
| RNF-10 | Backup: diário às 03:00 (`America/Sao_Paulo`), cifrado no servidor pelo restic antes do envio, retenção de 30 snapshots diários (`--keep-daily 30`), repositórios separados por ambiente. |
| RNF-11 | Dados ficam no Brasil (VM e Object Storage na região brasileira da Oracle). Exceção registrada: o Resend (EUA) processa o e-mail do destinatário do OTP; isso entra em `SECURITY.md` › Dados tratados como transferência internacional, a citar na política de privacidade. UptimeRobot e Healthchecks.io não recebem dado pessoal. |
| RNF-12 | Os scripts de `infra/scripts/` são Bash com `set -euo pipefail`, passam no ShellCheck sem avisos e nunca imprimem segredos. |
| RNF-13 | A VM tem pelo menos 12 GB de RAM para rodar os dois stacks. `provision-host.sh` aborta com `error: at least 12 GB of RAM required` abaixo disso (o mínimo vem da variável `MIN_RAM_GB`, padrão `12`). |

## 6. Escopo

### 6.1 Incluso

- Scripts versionados para preparar a VM (`provision-host.sh`), subir um ambiente (`provision-env.sh <hml|prod>`), publicar (`deploy.sh`), fazer backup (`backup.sh`), restaurar (`restore.sh`) e conceder o primeiro admin (`grant-admin.sh`).
- Override do Compose, template de variáveis (`env.template`), `Caddyfile` e units do systemd do backup.
- Homologação provisionada e funcionando em `https://api-hml.estacacriciuma.com.br`, com seed fictício.
- Workflow `deploy.yml`: homologação automática no merge na `main`; produção por disparo manual com aprovação.
- Migration de dados com as 7 unidades e a remoção delas do `seed.sql`.
- SMTP do Resend no GoTrue (domínio verificado) e variáveis de URL e redirect do app.
- Backup diário cifrado no Oracle Object Storage, com teste de restauração.
- Monitores do UptimeRobot e check do Healthchecks.io para a homologação.
- Runbooks `provisioning.md`, `backup.md` e `supabase-down.md` em `docs/runbooks/`.
- Atualização de `SECURITY.md`, `ARCHITECTURE.md`, `O11Y.md`, `AGENTS.md` e o ADR `0003` de hospedagem.

### 6.2 Não incluso

- Provisionar a produção (os scripts a suportam; ela sobe pelo runbook antes do envio às lojas).
- Credenciais OAuth de Google e Apple, parâmetros de OTP (tamanho, validade, rate limit) e templates de e-mail (`auth-account`).
- `eas init`, variáveis de ambiente da EAS e builds `preview` (`push-notifications` e specs seguintes).
- Edge Functions de negócio (`register-device`, `send-push`, `health`) e `pg_cron` (`push-notifications`).
- Página e URL da política de privacidade.
- Alta disponibilidade, réplica do Postgres ou failover.

## 7. Especificação funcional

### 7.1 Servidor e ambientes

| ID | Requisito |
| -- | --------- |
| RF-01 | `infra/scripts/provision-host.sh` (roda como `root`, idempotente) instala Docker, Compose, Caddy, restic e Supabase CLI 2.84.2; cria os usuários `estaca-hml` e `estaca-prod` com SSH só por chave; configura `ufw` (22, 80, 443), `fail2ban`, `unattended-upgrades` e o fuso `America/Sao_Paulo`; aplica RNF-02 e RNF-13. Rodar duas vezes termina com código 0 sem alterar o que já está configurado. |
| RF-02 | `infra/scripts/provision-env.sh <hml\|prod>` (como `root`, idempotente) cria `/opt/estaca/<env>`, baixa a pasta `docker/` do Supabase no commit de `infra/supabase/VERSION`, aplica `infra/supabase/docker-compose.override.yml`, gera os segredos que ainda não existem no `.env` (nunca sobrescreve os existentes), sobe o projeto Compose `estaca-<env>` e espera os containers ficarem `healthy`. Só para `hml`, aplica as migrations e o `seed.sql` uma única vez (marcador `/opt/estaca/hml/.seeded`). Argumento diferente de `hml` ou `prod` sai com código 2 e `usage: provision-env.sh <hml\|prod>`. |
| RF-03 | Portas no `127.0.0.1` por ambiente: gateway da API (Envoy) `8100` (hml) / `8000` (prod); Studio `3100` / `3000`; Postgres `5532` / `5432`. As demais portas do stack não são publicadas no host. |
| RF-04 | Variáveis do GoTrue por ambiente: `API_EXTERNAL_URL` = URL pública do ambiente; `SITE_URL = estacacriciuma://`; `ADDITIONAL_REDIRECT_URLS = estacacriciuma://auth-callback`; SMTP `smtp.resend.com:465`, usuário `resend`, senha = chave da API do Resend, remetente `nao-responda@estacacriciuma.com.br`, nome `Estaca Criciúma`. As variáveis de Google e Apple existem no `env.template` com valores vazios e provedores desligados. |
| RF-05 | `infra/supabase/env.template` lista **todas** as variáveis do `.env` do servidor, com valores fictícios e um comentário em inglês por variável dizendo quem a gera (script ou colagem manual). |

### 7.2 Proxy, TLS e health checks

| ID | Requisito |
| -- | --------- |
| RF-06 | `infra/caddy/Caddyfile` define `api-hml.estacacriciuma.com.br` → gateway (Envoy) `127.0.0.1:8100` e `api.estacacriciuma.com.br` → gateway (Envoy) `127.0.0.1:8000`, com o allowlist de RNF-03, o HSTS de RNF-05 e TLS automático. O site de produção pode ficar no arquivo antes de a produção existir; sem DNS para ele, o Caddy só registra falha de certificado para esse host, sem afetar a homologação. |
| RF-07 | Em cada domínio, `GET /healthz/auth` responde o status do `/auth/v1/health` do GoTrue e `GET /healthz/rest` o do `/rest/v1/` do PostgREST (o Caddy injeta o cabeçalho `apikey` com a anon key do ambiente). Saudável = `200`; caído = `502`. |

### 7.3 Deploy

| ID | Requisito |
| -- | --------- |
| RF-08 | `infra/scripts/deploy.sh <hml\|prod> <git-sha>` (como `estaca-<env>`): atualiza `/opt/estaca/<env>/app` para o commit informado, aplica as migrations pendentes com `supabase db push --db-url` apontando para o Postgres local do ambiente, copia `supabase/functions/*` para o volume de functions do stack e reinicia o serviço `functions`. Pasta de functions ausente ou vazia não é erro. Nunca roda o seed (RNF-09). |
| RF-09 | Para `prod`, `deploy.sh` roda `backup.sh prod` antes das migrations; se o backup falhar, o deploy para com `error: pre-deploy backup failed` e código 1, sem aplicar nada. |
| RF-10 | `.github/workflows/deploy.yml`: no `push` para `main`, depois de o job `check` passar, o job `deploy-hml` (Environment `hml`) faz SSH na VM como `estaca-hml` e roda `deploy.sh hml ${{ github.sha }}`. Um `workflow_dispatch` com input `ref` roda o job `deploy-prod` (Environment `production`, que exige aprovação de pelo menos 1 revisor) como `estaca-prod`. Os jobs usam só os secrets de Environment `DEPLOY_HOST`, `DEPLOY_SSH_KEY` e `DEPLOY_KNOWN_HOSTS`. |
| RF-11 | Uma migration com erro faz o `deploy.sh` sair com código ≠ 0 e o job falhar; as migrations anteriores continuam aplicadas e a que falhou não fica registrada como aplicada. |

### 7.4 Backup, restauração e administração

| ID | Requisito |
| -- | --------- |
| RF-12 | `infra/scripts/backup.sh <hml\|prod>`: gera `pg_dumpall --globals-only` e `pg_dump -Fc` do banco `postgres` do ambiente; junta o diretório de arquivos do Storage; envia tudo como um snapshot restic para `s3:<endpoint Oracle>/<bucket>/<env>`; roda `restic forget --keep-daily 30 --prune`; ao final faz ping em `HEALTHCHECKS_URL` (sucesso) ou em `HEALTHCHECKS_URL/fail` (qualquer falha, via `trap`). Arquivos temporários são apagados em sucesso e em falha. |
| RF-13 | `infra/systemd/estaca-backup@.service` e `estaca-backup@.timer` agendam `backup.sh %i` diariamente às 03:00 (`America/Sao_Paulo`), com `Persistent=true`. A homologação habilita `estaca-backup@hml.timer`. |
| RF-14 | Migration `supabase/migrations/<ts>_units_reference_data.sql` insere as 7 unidades de RF-01 de `app-foundation` com `on conflict (id) do nothing`; o bloco de `units` sai do `seed.sql`. `make test-db` continua passando. |
| RF-15 | `infra/scripts/restore.sh <hml\|prod> <snapshot\|latest> <banco-destino>` restaura o snapshot num banco **novo** com o nome informado, no Postgres do mesmo ambiente, e os arquivos do Storage em `/opt/estaca/<env>/restore/<timestamp>/`. Ele nunca sobrescreve o banco `postgres`: se `<banco-destino>` for `postgres` ou já existir, sai com código 1 e `error: target database must be new and not 'postgres'`. Ao final, imprime a contagem de linhas de `units`, `profiles` e `memberships` do banco restaurado. |
| RF-16 | `infra/scripts/grant-admin.sh <hml\|prod> <email>` (como `estaca-<env>`) concede `admin` em `estaca` ao usuário com esse e-mail em `auth.users`, numa transação que também grava `role_grants_log` (`action = 'granted'`, `actor_id = null`). Usuário inexistente: código 1 e `error: no user with this email`. Usuário sem linha em `profiles` (ainda não passou pela tela de boas-vindas de `auth-account`): código 1 e `error: user has no profile yet`, sem gravar nada. Usuário já admin: código 0 e `already admin`. O e-mail não é impresso em nenhuma saída. |
| RF-17 | UptimeRobot: dois monitores HTTP(S) da homologação (`/healthz/auth` e `/healthz/rest`), intervalo de 5 min, alerta por e-mail ao admin técnico depois de 3 falhas seguidas. Healthchecks.io: um check `estaca-backup-hml` com período de 1 dia e tolerância de 2 h (alerta se faltar ping por 26 h), alerta por e-mail. |

### 7.5 Qualidade e documentação

| ID | Requisito |
| -- | --------- |
| RF-18 | `make lint-infra` roda `shellcheck infra/scripts/*.sh`; sem `shellcheck` instalado, avisa `[make lint-infra] shellcheck não encontrado: nada a fazer` e sai com 0 (mesmo padrão de `REQUIRE_APP`). O job `check` da CI roda `make lint-infra`. |
| RF-19 | `docs/runbooks/provisioning.md`: passos numerados, do zero, para (a) registrar o domínio e criar os registros DNS (`A` de `api-hml`/`api`, registros SPF/DKIM do Resend); (b) abrir 80/443 na Security List da Oracle; (c) rodar `provision-host.sh`; (d) criar o bucket e a chave S3-compatível do Object Storage; (e) verificar o domínio no Resend; (f) rodar `provision-env.sh`; (g) configurar Environments e secrets do GitHub; (h) criar os monitores e o check; (i) conceder o primeiro admin; (j) abrir o Studio por túnel SSH; (k) as mesmas etapas para a produção. |
| RF-20 | `docs/runbooks/backup.md` (rodar backup manual, restaurar, teste trimestral de restauração e o que fazer com alerta do Healthchecks) e `docs/runbooks/supabase-down.md` (diagnóstico com `docker compose ps`/`logs`, reinício do stack, rollback de deploy com `deploy.sh <env> <sha-anterior>` e quando restaurar backup). |
| RF-21 | Documentos: `SECURITY.md` › Infra self-hosted sem "A definir" (destino do backup, acesso ao Studio, isolamento e risco residual de RNF-06) e › Dados tratados com a linha do Resend (RNF-11); `ARCHITECTURE.md` › Ambientes com as URLs e o deploy; `O11Y.md` › Alertas com ferramentas e runbooks; `AGENTS.md` com `make lint-infra`; ADR `0003-hospedagem-supabase-oracle.md` com a decisão de hospedagem e os trade-offs (VM única, Always Free, ARM). |

### 7.6 Casos de borda

| Situação | Comportamento |
| -------- | ------------- |
| `provision-env.sh` rodado de novo num ambiente existente | Não regenera segredos nem roda o seed de novo; só aplica o override e garante os containers no ar |
| Dois deploys da homologação ao mesmo tempo (merges seguidos) | O workflow usa `concurrency: deploy-<env>` sem cancelar o que está rodando; o segundo espera o primeiro |
| Deploy de um `sha` que não existe no repositório | `deploy.sh` sai com código 1 e `error: unknown commit`, sem mudar nada |
| Object Storage fora do ar durante o backup | `backup.sh` falha, pinga `/fail`, o Healthchecks alerta; o próximo timer tenta de novo |
| Disco da VM acima de 85% | `backup.sh` aborta antes do dump com `error: disk usage above 85%` e pinga `/fail` |
| Certificado não renova (DNS errado, porta 80 fechada) | O Caddy tenta de novo sozinho; o monitor do UptimeRobot alerta quando o HTTPS falhar |
| VM reiniciada | Docker, Caddy e os stacks voltam sozinhos (`restart: unless-stopped`, serviços habilitados no systemd); o timer de backup recupera execução perdida (`Persistent=true`) |
| Oracle recupera a instância Always Free por ociosidade | Recriar a VM pelo `provisioning.md` e restaurar o último backup (`backup.md`) |

## 8. Especificação de UI/UX

Não se aplica: entrega de infraestrutura, sem telas.

## 9. Acessibilidade

Não se aplica: entrega de infraestrutura, sem telas.

## 10. Estrutura de arquivos esperada

```
infra/
  supabase/VERSION                      # commit fixado do supabase/supabase (pasta docker/)
  supabase/docker-compose.override.yml  # bind em 127.0.0.1, portas por ambiente, restart policy
  supabase/env.template                 # todas as variáveis do servidor, valores fictícios
  caddy/Caddyfile                       # dois sites, allowlist, HSTS, /healthz/*
  scripts/provision-host.sh             # preparo da VM (uma vez)
  scripts/provision-env.sh              # sobe um ambiente
  scripts/deploy.sh                     # migrations + functions
  scripts/backup.sh                     # dump + storage → restic → Object Storage
  scripts/restore.sh                    # restauração num banco novo
  scripts/grant-admin.sh                # primeiro admin
  systemd/estaca-backup@.service
  systemd/estaca-backup@.timer
.github/workflows/deploy.yml            # deploy-hml (auto) e deploy-prod (manual + aprovação)
.github/workflows/ci.yml                # alterar: make lint-infra no job check
docs/runbooks/provisioning.md
docs/runbooks/backup.md
docs/runbooks/supabase-down.md
supabase/migrations/<ts>_units_reference_data.sql
supabase/seed.sql                       # alterar: sem o bloco de units
Makefile                                # alterar: lint-infra
.ai/adrs/0003-hospedagem-supabase-oracle.md
.ai/docs/SECURITY.md, ARCHITECTURE.md, O11Y.md e AGENTS.md  # alterar (RF-21)
```

## 11. Critérios de aceitação

Os CA marcados como **manual** dependem da VM real e são verificados no roteiro de QA; o plano registra a justificativa.

| ID | Cobre | Dado | Quando | Então |
| -- | ----- | ---- | ------ | ----- |
| CA-01 | RF-01, RNF-01 | a homologação provisionada | rodo `nmap -Pn -p- api-hml.estacacriciuma.com.br` de fora da VM (manual) | só 22, 80 e 443 aparecem abertas |
| CA-02 | RF-01, RNF-02 | a VM provisionada | tento `ssh -o PubkeyAuthentication=no estaca-hml@<ip>` e `ssh root@<ip>` (manual) | os dois são recusados |
| CA-03 | RF-01 | a VM provisionada | rodo `provision-host.sh` uma segunda vez (manual) | termina com código 0; `sshd_config`, regras do `ufw` e `jail.local` do `fail2ban` ficam iguais (mesmo `sha256sum`) |
| CA-04 | RF-06, RNF-05 | a homologação no ar | `curl -I http://api-hml.estacacriciuma.com.br/rest/v1/` e o mesmo com `https://` (manual) | HTTP responde `308` para HTTPS; HTTPS tem certificado Let's Encrypt válido e `Strict-Transport-Security: max-age=31536000` |
| CA-05 | RF-06, RNF-03, RNF-04 | a homologação no ar | peço `/`, `/pg/meta/default/tables` e `/project/default` pela internet (manual) | todos `404`; `GET /rest/v1/units` com a anon key retorna as 7 unidades |
| CA-06 | RNF-04, RF-03 | a homologação no ar | abro `ssh -L 3100:127.0.0.1:3100 estaca-hml@<ip>` e acesso `http://localhost:3100` (manual) | o Studio abre; `ss -tlnp` na VM não mostra nenhuma porta em `0.0.0.0`/`[::]` além de 22, 80 e 443 |
| CA-07 | RNF-06, RNF-07 | a homologação provisionada | confiro `/opt/estaca/hml/.env` (manual) | permissão `600`, dono `estaca-hml`; o usuário `estaca-prod` não consegue lê-lo |
| CA-08 | RNF-07, RF-05 | o repositório | rodo `grep -rEn 'eyJ[A-Za-z0-9_-]{20,}\|re_[A-Za-z0-9]{20,}' infra/ .github/` | nenhuma ocorrência; `env.template` tem o mesmo conjunto de nomes de variável do `.env` da homologação |
| CA-09 | RF-02, RNF-08 | o repositório | leio `infra/supabase/VERSION` e o override | `VERSION` tem um SHA de 40 caracteres; nenhuma imagem no override usa `latest` |
| CA-10 | RF-02, RNF-09 | a homologação recém-provisionada | consulto `auth.users` pelo Studio e rodo `provision-env.sh hml` de novo (manual) | as 5 contas `@exemplo.org` existem uma vez só; o `.env` não mudou (mesmo `sha256sum`) |
| CA-11 | RF-08, RF-10 | um PR com uma migration nova mergeado na `main` | o workflow `deploy` termina (manual) | `deploy-hml` passou e `supabase migration list` na homologação mostra a migration aplicada |
| CA-12 | RF-11 | uma migration com SQL inválido numa branch de teste | rodo `deploy.sh hml <sha>` (manual) | código ≠ 0; `supabase migration list` não lista a migration com erro e as anteriores continuam |
| CA-13 | RF-10, RF-09 | o repositório e as configurações do GitHub | inspeciono `deploy.yml` e o Environment `production` (manual) | `deploy-prod` só roda por `workflow_dispatch`, usa o Environment `production`, que exige 1 revisor; `deploy.sh` chama `backup.sh` antes das migrations quando o ambiente é `prod` |
| CA-14 | RF-14 | um banco local | `supabase db reset --no-seed` e depois `make test-db` (com `supabase db reset` normal antes dos testes) | após o reset sem seed, `units` tem as 7 linhas com os nomes de RF-01 de `app-foundation`; `make test-db` passa |
| CA-15 | RF-12, RF-13, RNF-10 | a homologação no ar | `systemctl start estaca-backup@hml` (manual) | `restic snapshots` lista um snapshot novo com o dump e o Storage; o check `estaca-backup-hml` registra sucesso; o objeto no bucket não contém texto legível do dump (`strings` não acha `CREATE TABLE`) |
| CA-16 | RF-12, RF-17 | a homologação no ar | coloco uma senha errada do restic no `.env` e rodo o backup (manual) | o backup sai com código ≠ 0, o Healthchecks recebe `/fail` e envia e-mail ao admin |
| CA-17 | RF-15 | um snapshot da homologação | `restore.sh hml latest restore_check` (manual) | cria o banco `restore_check` com 7 unidades e as mesmas contagens de `profiles` e `memberships` da origem; `restore.sh hml latest postgres` sai com código 1 e a mensagem de RF-15 |
| CA-18 | RF-07, RF-17 | a homologação no ar | `curl` em `/healthz/auth` e `/healthz/rest`, depois `docker compose -p estaca-hml stop api-gw` por 20 min (manual) | antes: `200` nos dois; parado: `502` e o UptimeRobot envia e-mail de alerta |
| CA-19 | RF-04 | a homologação no ar e um e-mail real de teste | `POST /auth/v1/otp` com esse e-mail e a anon key (manual) | o e-mail chega de `Estaca Criciúma <nao-responda@estacacriciuma.com.br>` com SPF e DKIM `pass` nos cabeçalhos; o `.env` contém `ADDITIONAL_REDIRECT_URLS=estacacriciuma://auth-callback` |
| CA-20 | RF-16 | a conta `membro@exemplo.org` do seed (tem perfil) e uma conta que fez login por OTP sem perfil | `grant-admin.sh hml membro@exemplo.org` duas vezes, depois com um e-mail inexistente e com a conta sem perfil (manual) | 1ª: membership `admin` em `estaca` e uma linha em `role_grants_log`; 2ª: `already admin`, sem linha nova; inexistente: código 1 e `error: no user with this email`; conta sem perfil: código 1 e `error: user has no profile yet` |
| CA-21 | RF-18, RNF-12 | o repositório | `make lint-infra` (local com ShellCheck e na CI) | passa sem avisos; sem ShellCheck local, imprime a mensagem de RF-18 e sai com 0 |
| CA-22 | RF-02 | a VM | `provision-env.sh staging` (manual) | código 2 e `usage: provision-env.sh <hml\|prod>` |
| CA-23 | RF-19, RF-20, RF-21, RNF-11 | o repositório | leio os runbooks, o ADR 0003 e os docs alterados | os 3 runbooks têm todos os itens de RF-19/RF-20; `SECURITY.md`, `ARCHITECTURE.md` e `O11Y.md` não têm mais "A definir" nos pontos de RF-21; `SECURITY.md` cita o Resend como transferência internacional |
| CA-24 | RNF-13 | a VM | rodo `MIN_RAM_GB=1024 provision-host.sh` (manual) | sai com código 1 e `error: at least 1024 GB of RAM required`, sem instalar nada |

## 12. Roteiro de QA

| Passo | Ação | Resultado esperado |
| ----- | ---- | ------------------ |
| 1 | Seguir `docs/runbooks/provisioning.md` itens (a) a (j) para a homologação | Cada item conclui sem passo não documentado; desvios anotados no plano |
| 2 | CA-01, CA-02 e CA-06 de uma máquina fora da VM | Portas e acessos como descrito |
| 3 | CA-04 e CA-05 com `curl` | Redirecionamento, HSTS, `404` fora do allowlist e as 7 unidades |
| 4 | CA-19 com um e-mail pessoal de teste | E-mail chega com SPF/DKIM `pass` |
| 5 | Mergear na `main` um PR com uma migration inofensiva (ex.: `comment on table units`) | `deploy-hml` aplica a migration (CA-11) |
| 6 | CA-12 com uma migration inválida, direto no servidor | Falha sem estado parcial |
| 7 | CA-15, CA-16 e CA-17 | Backup cifrado, alerta de falha e restauração conferida |
| 8 | CA-18 parando o gateway (`api-gw`) por 20 min | Alerta do UptimeRobot por e-mail; subir o gateway e ver o monitor voltar |
| 9 | CA-20 com `membro@exemplo.org` e com uma conta real que só pediu o OTP | Admin concedido e auditado; conta sem perfil recusada |
| 10 | Reiniciar a VM (`sudo reboot`) | Em até 5 min, `/healthz/auth` e `/healthz/rest` voltam a `200` sem intervenção |
| 11 | `make check`, `make test-db` e `make lint-infra` no repositório | Passam |

## 13. Definition of Done

- [ ] `make check` passa (lint, tipos, testes, build)
- [ ] `make test-db` e `make lint-infra` passam localmente e na CI
- [ ] Todo `CA` tem teste automatizado com o ID no nome, ou justificativa de teste manual no plano
- [ ] Roteiro de QA executado sem divergências na homologação
- [ ] Registro de implementação preenchido no plano
- [ ] Nenhum segredo, dado pessoal ou log sensível introduzido (ver `.ai/docs/SECURITY.md`)
- [ ] Segredos da homologação guardados no gerenciador de senhas do admin técnico
- [ ] ADR 0003 criado e docs de RF-21 atualizados

## 14. Decisões em aberto

Nenhuma decisão em aberto.

| # | Pergunta | Decisão | Origem |
| - | -------- | ------- | ------ |
| 1 | Ambientes provisionados nesta entrega | Homologação agora; produção depois, pelo mesmo roteiro | usuário |
| 2 | Hospedagem | VM Oracle Cloud Ampere A1 (arm64) que o usuário já tem, região Brasil | usuário |
| 3 | Um servidor por ambiente? | Escolhido inicialmente; substituído pela decisão 9 | usuário |
| 4 | Domínio | Registrar `.com.br` novo | usuário |
| 5 | Ambiente da VM existente | Recebe homologação e produção | usuário |
| 6 | Nome do domínio | `estacacriciuma.com.br`; API em `api-hml.` e `api.` | usuário |
| 7 | SMTP do OTP | Resend | usuário |
| 8 | Destino do backup | Oracle Object Storage, cifrado com restic, 30 dias | usuário |
| 9 | Isolamento na mesma VM | Mesma VM, dois stacks isolados (usuário, Compose, rede, volumes, segredos); risco residual de root/Docker aceito | usuário |
| 10 | Deploy | GitHub Actions: hml automático na `main`, produção manual com aprovação | usuário |
| 11 | Monitoramento | UptimeRobot (uptime) + Healthchecks.io (backup), alerta por e-mail | usuário |
| 12 | Skills obrigatórias | `ecc:docker-patterns`, `ecc:deployment-patterns`, `ecc:security-review`, `ecc:database-migrations` | usuário |
| A1 | Sistema operacional e RAM mínima | Ubuntu LTS arm64; mínimo 12 GB para os dois stacks | padrão do projeto |
| A2 | Proxy e TLS | Caddy com Let's Encrypt; só 22/80/443 abertas | padrão do projeto |
| A3 | Acesso ao Studio | Só por túnel SSH (`SECURITY.md`) | padrão do projeto |
| A4 | Guarda de segredos | `.env` 600 no servidor + gerenciador de senhas do admin técnico | padrão do projeto |
| A5 | Versão do Supabase | Fixada por commit em `infra/supabase/VERSION` | padrão do projeto |
| A6 | Unidades na produção | Migration de dados; contas fictícias só no seed da homologação | padrão do projeto |
| A7 | Primeiro admin | Script `grant-admin.sh` por SSH, auditado em `role_grants_log` | padrão do projeto |
| A8 | Health check | `/healthz/auth` e `/healthz/rest` via Caddy | padrão do projeto |
| A9 | Google/Apple e EAS | Fora desta spec (`auth-account` e specs seguintes) | padrão do projeto |
| A10 | Runbooks | `docs/runbooks/` (caminho previsto em `O11Y.md`) | padrão do projeto |
| P1 | Gateway da API | Envoy (serviço `api-gw`), padrão do `self-hosted/v0.8.4`; Kong não é usado | usuário (no `/create-plan`) |
| P2 | `grant-admin.sh` para usuário sem perfil | Erro `error: user has no profile yet`; CA-20 verificado com conta do seed | usuário (no `/create-plan`) |

## 15. Próximos passos (fora desta entrega)

- `auth-account`: credenciais Google/Apple no GoTrue da homologação, parâmetros de OTP e templates de e-mail.
- `push-notifications`: `eas init`, variáveis da EAS por perfil (`preview` → homologação), Edge Functions e `pg_cron`.
- Provisionar a produção pelo `provisioning.md` (item k) antes do envio às lojas, com os monitores e o check de backup de produção.
- Teste trimestral de restauração (`backup.md`).
