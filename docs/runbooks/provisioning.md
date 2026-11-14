# Runbook: provisionar o Supabase self-hosted (homologação e produção)

Do zero até a homologação no ar. Os itens seguem a ordem; cada um diz onde rodar. Nada de segredo vai para o repositório, para o chat ou para logs: segredos ficam no servidor (`/opt/estaca/<env>/.env`, modo 600) e no gerenciador de senhas do admin técnico.

Valores por ambiente:

| | hml | prod |
| --- | --- | --- |
| URL | `https://api-hml.estacacriciuma.com.br` | `https://api.estacacriciuma.com.br` |
| Usuário Linux / projeto Compose | `estaca-hml` | `estaca-prod` |
| Portas em `127.0.0.1` (gateway / Studio / Postgres) | 8100 / 3100 / 5532 | 8000 / 3000 / 5432 |

Pré-requisito: VM Oracle Ampere A1 (arm64) com Ubuntu 24.04 LTS (22.04 aceito), pelo menos 12 GB de RAM, IP público e acesso SSH como o usuário padrão da imagem (com `sudo`). Daqui em diante `<ip>` é o IP público da VM.

## a) Domínio e DNS

1. Registre `estacacriciuma.com.br` no registro.br.
2. Crie os registros `A`: `api-hml` e `api` apontando para `<ip>`. Confira: `dig +short api-hml.estacacriciuma.com.br`.
3. Os registros SPF e DKIM do Resend entram no item (e).

## b) Security List da Oracle

No console da Oracle, na Security List (ou NSG) da sub-rede da VM, mantenha só estas entradas de ingresso TCP vindas de `0.0.0.0/0`: **22**, **80** e **443**. Remova qualquer outra.

## c) Preparar a VM (`provision-host.sh`)

```bash
ssh ubuntu@<ip>
sudo apt-get update && sudo apt-get install -y git
git clone https://github.com/LucasDarela/estaca-criciuma-app.git ~/estaca-app
sudo ~/estaca-app/infra/scripts/provision-host.sh
```

O script aborta com `error: at least 12 GB of RAM required` se a VM tiver menos RAM. Ele é idempotente: pode rodar de novo.

Chaves de deploy, uma por ambiente (na sua máquina, não na VM):

```bash
ssh-keygen -t ed25519 -C deploy-hml -N '' -f ./deploy-hml
ssh-keygen -t ed25519 -C deploy-prod -N '' -f ./deploy-prod
```

Na VM, ponha as chaves públicas (`deploy-<env>.pub`) em `~estaca-<env>/.ssh/authorized_keys` (inclua também a sua chave pessoal para o túnel do Studio):

```bash
sudo tee -a ~estaca-hml/.ssh/authorized_keys < deploy-hml.pub
sudo tee -a ~estaca-prod/.ssh/authorized_keys < deploy-prod.pub
```

Cadastre a chave **privada** no secret `DEPLOY_SSH_KEY` do Environment correspondente (item g) e apague os arquivos da chave privada da sua máquina depois.

Depois do `provision-host.sh`, o login de `root` e por senha estão desligados: confirme que sua chave funciona antes de fechar a sessão.

## d) Bucket e chave do Object Storage

1. No console da Oracle (região de São Paulo), crie um bucket privado, por exemplo `estaca-backups`.
2. Em Perfil › Minha conta › Chaves secretas do cliente, gere uma chave. Anote o id e o segredo (o segredo aparece uma vez).
3. O endpoint S3 é `https://<namespace>.compat.objectstorage.sa-saopaulo-1.oraclecloud.com` (o `namespace` está em Administração › Tenancy).

Esses valores vão para as variáveis `OCI_S3_ENDPOINT`, `OCI_REGION` (`sa-saopaulo-1`), `OCI_BUCKET`, `AWS_ACCESS_KEY_ID` e `AWS_SECRET_ACCESS_KEY` no item (f).

## e) Resend

1. Crie a conta no Resend e adicione o domínio `estacacriciuma.com.br`.
2. Crie no DNS os registros SPF e DKIM que o Resend mostrar e espere o domínio ficar `Verified`.
3. Crie uma chave de API (permissão de envio). Ela vai para `SMTP_PASS` no item (f). O remetente é `nao-responda@estacacriciuma.com.br`.

O Resend (EUA) processa o e-mail de quem pede o código de login: está registrado em `SECURITY.md` e deve constar na política de privacidade.

## f) Subir o ambiente (`provision-env.sh`)

Rode **duas vezes**. A primeira cria o `.env` com segredos gerados e para, listando o que falta:

```bash
sudo /home/ubuntu/estaca-app/infra/scripts/provision-env.sh hml
# error: fill SMTP_PASS, OCI_S3_ENDPOINT, OCI_REGION, OCI_BUCKET, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, HEALTHCHECKS_URL in /opt/estaca/hml/.env and run again
```

Edite `/opt/estaca/hml/.env` (`sudo nano`) e preencha essas variáveis com os valores dos itens (d), (e) e (h). Não altere as outras. Depois:

```bash
sudo /home/ubuntu/estaca-app/infra/scripts/provision-env.sh hml
```

A segunda execução baixa as imagens, sobe os containers (espera ficarem `healthy`), cria o repositório do restic, aplica as migrations e o seed fictício (só em `hml`, uma vez) e habilita o timer de backup. Copie o `.env` para o gerenciador de senhas (por exemplo, `sudo cat /opt/estaca/hml/.env` numa sessão que você não grava).

Verifique:

```bash
curl -s -o /dev/null -w '%{http_code}\n' https://api-hml.estacacriciuma.com.br/healthz/auth   # 200
curl -s -o /dev/null -w '%{http_code}\n' https://api-hml.estacacriciuma.com.br/healthz/rest   # 200
```

Rodar o script de novo num ambiente existente não regenera segredos nem repete o seed.

## g) GitHub: Environments e secrets

No repositório, em Settings › Environments, crie:

- `hml`: sem revisor obrigatório.
- `production`: **Required reviewers** com pelo menos 1 revisor.

Em cada Environment, cadastre os secrets (valores diferentes por ambiente):

| Secret | Valor |
| --- | --- |
| `DEPLOY_HOST` | `<ip>` da VM |
| `DEPLOY_SSH_KEY` | conteúdo da chave privada `deploy-<env>` |
| `DEPLOY_KNOWN_HOSTS` | saída de `ssh-keyscan <ip>` |

O workflow `Deploy` roda sozinho depois do CI verde a cada merge na `main` (homologação). A produção só sobe por **Actions › Deploy › Run workflow** (campo `ref`), com aprovação.

## h) Monitores e check de backup

1. **Healthchecks.io:** crie o check `estaca-backup-hml` com período de 1 dia e tolerância de 2 h (alerta se faltar ping por 26 h), com alerta por e-mail. Copie a URL de ping para `HEALTHCHECKS_URL` no `.env` de `hml` (item f).
2. **UptimeRobot:** crie dois monitores HTTP(S) para a homologação, `https://api-hml.estacacriciuma.com.br/healthz/auth` e `/healthz/rest`, intervalo de 5 min, alerta por e-mail ao admin técnico depois de 3 falhas seguidas.

Se você preencher `HEALTHCHECKS_URL` depois do item (f), reinicie nada: o `backup.sh` lê o `.env` a cada execução.

## i) Primeiro admin

A pessoa precisa ter entrado no app uma vez (OTP) e passado pela tela de boas-vindas, para existir um `profile`. Depois, na VM:

```bash
ssh estaca-hml@<ip>
/opt/estaca/hml/app/infra/scripts/grant-admin.sh hml <email-do-admin>
# granted
```

Respostas possíveis: `granted`, `already admin`, `error: no user with this email`, `error: user has no profile yet`. A concessão fica registrada em `role_grants_log`. Na homologação, as contas fictícias do seed (`membro@exemplo.org`, etc.) servem para testar.

## j) Abrir o Studio por túnel SSH

O Studio nunca é público. Na sua máquina:

```bash
ssh -L 3100:127.0.0.1:3100 estaca-hml@<ip>
```

Abra `http://localhost:3100`. Usuário `estaca` e senha `DASHBOARD_PASSWORD` do `.env` (em produção, a porta é 3000 e o usuário é `estaca-prod`). Postgres, se precisar: `ssh -L 5532:127.0.0.1:5532 estaca-hml@<ip>`.

## k) Produção

As mesmas etapas, trocando `hml` por `prod`:

1. DNS do `api` (item a) e certificado: o Caddy emite sozinho quando o DNS apontar.
2. `provision-env.sh prod` duas vezes (item f). A produção **não** recebe o seed; as 7 unidades vêm da migration.
3. Prefixo de backup `prod` no mesmo bucket, com senha do restic própria (gerada pelo script).
4. Environment `production` (item g) com os secrets de `estaca-prod`.
5. Check `estaca-backup-prod` no Healthchecks.io e monitores do UptimeRobot para `https://api.estacacriciuma.com.br` (item h).
6. Primeiro admin da produção (item i).
7. Antes do envio às lojas: teste de restauração (`backup.md`) e um deploy de produção de teste.

## Atualizar o Supabase upstream

Mude `infra/supabase/VERSION` (commit do `supabase/supabase`) num PR, valide na homologação (`sudo provision-env.sh hml`) e só então na produção. Se aparecer `error: container name rewrite incomplete`, o upstream mudou os nomes de container: ajuste o override e o `provision-env.sh`.
