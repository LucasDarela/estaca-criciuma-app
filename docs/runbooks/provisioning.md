# Runbook: provisionar o backend no Supabase Cloud (projeto único de produção)

Do zero até o projeto no ar, com deploy, e-mail de login e backup. Os itens seguem a ordem; cada um diz onde fazer (painel, terminal local ou GitHub). Nenhum segredo vai para o repositório, para o chat ou para logs: segredos ficam nos Environments do GitHub, nos painéis e no gerenciador de senhas do admin técnico.

Há um projeto só, que é a produção (spec, decisão 8). Não existe homologação remota: testes rodam no Supabase local e na CI.

| | Valor |
| --- | --- |
| Projeto no Supabase | `estaca-criciuma` |
| Região | `us-east-1` (spec, decisão 9) |
| URL da API | `https://<project-ref>.supabase.co` |
| Environments do GitHub | `production` (deploy) e `production-backup` (backup agendado) |
| Chave do Resend | `estaca-criciuma` |

## a) Domínio e DNS (registro.br e Cloudflare)

1. No registro.br, registre `estacacriciuma.com.br`.
2. Crie a conta na Cloudflare (plano Free), adicione o domínio e, no registro.br, troque os servidores DNS pelos dois nameservers que a Cloudflare indicar. A partir daqui **todos os registros DNS ficam na Cloudflare**.
3. Confira a propagação: `dig +short NS estacacriciuma.com.br` deve listar os nameservers da Cloudflare.

## b) Conta e organização do Supabase

1. No painel (https://supabase.com/dashboard), crie a conta com o **e-mail da estaca**, não um e-mail pessoal, e crie a organização no plano Free.
2. Ligue o **2FA** da conta (Account › Security).
3. Mantenha o admin técnico como único membro da organização.

## c) Criar os projetos (painel do Supabase)

Crie o projeto `estaca-criciuma` na organização, plano Free:

- **Região: `us-east-1`.** São Paulo não estava disponível no plano Free (spec, decisão 9). A região é irreversível: trocar depois exige outro projeto e migração dos dados.
- Senha do banco: gere no gerenciador de senhas, com 32 caracteres só com letras e números.
- Anote no gerenciador de senhas: `project-ref` (Project Settings › General), URL (`https://<project-ref>.supabase.co`), anon key (Project Settings › API) e a senha do banco.

## d) Resend (e-mail do código de login)

1. Crie a conta no Resend, se ainda não existir, com o e-mail da estaca e **2FA** ligado.
2. Em Domains, adicione `estacacriciuma.com.br` (região `sa-east-1` se o Resend oferecer; ela vale só para o envio de e-mail).
3. Na **Cloudflare** (DNS › Records), crie os registros que o Resend mostrar: SPF (TXT), DKIM (TXT ou CNAME) e o MX de retorno. Deixe todos em modo **DNS only** (nuvem cinza, sem proxy).
4. Crie também o registro DMARC, TXT em `_dmarc`: `v=DMARC1; p=none; rua=mailto:<e-mail do admin técnico>`.
5. No Resend, clique em Verify e espere o domínio ficar `Verified` (pode levar de minutos a horas).
6. Crie a chave de API `estaca-criciuma`, com permissão **Sending access** apenas. Guarde as chaves no gerenciador de senhas.

## e) Configurar o Auth (painel do Supabase)

Em `estaca-criciuma`:

1. Authentication › URL Configuration:
   - Site URL: `estacacriciuma://`
   - Redirect URLs: `estacacriciuma://auth-callback`
2. Authentication › SMTP Settings, ligue o SMTP próprio:
   - Host: `smtp.resend.com`
   - Porta: `465`
   - Usuário: `resend`
   - Senha: a chave de API `estaca-criciuma` do Resend (começa com `re_`)
   - Remetente: `nao-responda@estacacriciuma.com.br`
   - Nome: `Estaca Criciúma`
3. Authentication › Sign In / Providers: Google e Apple **desligados** (entram na spec `auth-account`).

## f) Token do Supabase e Environments do GitHub

1. Painel do Supabase › Account › Access Tokens: gere um token (`github-actions`) e guarde no gerenciador de senhas.
2. No GitHub, Settings › Environments, crie dois Environments:
   - `production`, com **Required reviewers** (pelo menos 1 pessoa)
   - `production-backup`, **sem** revisor (job agendado não espera aprovação)
3. Nos dois Environments, crie os mesmos três secrets (Environment secrets, nunca secrets do repositório):

| Secret | Valor |
| --- | --- |
| `SUPABASE_ACCESS_TOKEN` | o token do passo 1 |
| `SUPABASE_DB_PASSWORD` | a senha do banco de `estaca-criciuma` |
| `SUPABASE_PROJECT_ID` | o `project-ref` de `estaca-criciuma` |

## g) Chave `age` do backup (terminal local)

```bash
brew install age            # ou apt-get install age
age-keygen -o estaca-backup.key
```

1. Guarde o conteúdo de `estaca-backup.key` (a linha que começa com `AGE-SECRET`) no gerenciador de senhas do admin técnico. **A chave privada nunca vai para o repositório.**
2. Copie a chave pública (a linha `# public key: age1...`, também mostrada por `age-keygen -y estaca-backup.key`) para `infra/backup/age-recipients.txt`, numa linha própria, e abra um PR.
3. Apague o arquivo local: `rm estaca-backup.key`.

## h) Seed (não roda no remoto)

O `supabase/seed.sql` tem só contas fictícias e roda **apenas no Supabase local** (`supabase db reset`). Nunca o aplique em `estaca-criciuma`: as 7 unidades chegam ao projeto pela migration `20261114013039_units_reference_data.sql`, no primeiro deploy.

## i) Primeiro deploy da produção (GitHub)

1. Faça o merge do PR na `main` e espere o CI verde. Merge não faz deploy.
2. Actions › Deploy › Run workflow, com `ref=main`.
3. O job espera a aprovação de um revisor do Environment `production`. Aprove.
4. Confira que o artefato `pre-deploy-<run_id>` foi enviado antes do `db push` e que o job terminou verde.

## j) Primeiro admin (painel do Supabase)

1. A pessoa pede o código de login pelo app (ou por `POST /auth/v1/otp`) e entra uma vez, para existir `auth.users` e `profiles`.
2. No SQL Editor do projeto, cole `supabase/snippets/grant_admin.sql`, troque o e-mail no topo (`select 'pessoa@exemplo.org'`) e rode.
3. Leia a coluna `result`: `granted`, `already admin`, `error: no user with this email` ou `error: user has no profile yet`. Nos erros, nada é gravado.

## k) Backup manual e teste de restauração (GitHub e terminal)

1. Actions › Backup › Run workflow. Confira o artefato `backup-prod-<AAAA-MM-DD>`.
2. Siga o procedimento A (restaurar num Supabase local) de `docs/runbooks/backup.md` e registre a data e as contagens na tabela "Histórico de testes".

## Onde está cada segredo

| Segredo | Onde fica |
| --- | --- |
| Senha do banco (`estaca-criciuma`) | Gerenciador de senhas; Environment do GitHub (`SUPABASE_DB_PASSWORD`) |
| `project-ref` do projeto | Gerenciador de senhas; Environment do GitHub (`SUPABASE_PROJECT_ID`) |
| Anon key do projeto | Painel do Supabase; gerenciador de senhas; variável da EAS (spec futura) |
| Access token do Supabase | Gerenciador de senhas; Environments do GitHub (`SUPABASE_ACCESS_TOKEN`) |
| Chave de API do Resend (`estaca-criciuma`) | Painel do Resend; gerenciador de senhas; SMTP Settings do projeto no Supabase |
| Chave privada `age` | Só no gerenciador de senhas |
| Chave pública `age` | `infra/backup/age-recipients.txt` (pública) |
