# Backend no Supabase Cloud (projeto único de produção)

> **Status:** Concluída
> **Área:** `.github/workflows/`, `supabase/migrations/`, `supabase/seed.sql`, `supabase/snippets/`, `infra/backup/`, `docs/runbooks/`, `.ai/adrs/`, `.ai/docs/`, `AGENTS.md`, `README.md`
> **Última atualização:** 2026-11-14

## 0. Skills obrigatórias

| Skill | Quando usar |
| ----- | ----------- |
| `ecc:deployment-patterns` | Workflows de deploy e de backup, Environments com aprovação, procedimento de rollback |
| `ecc:database-migrations` | `supabase db push` nos projetos remotos e migration de dados das unidades |
| `ecc:security-review` | Revisão final de segredos nos workflows, cifra do backup e acesso ao painel |

## 1. Contexto

Até aqui só existe o Supabase local da CLI. Testar o login no celular (`auth-account`), gerar builds `preview` para os líderes e publicar nas lojas exigem um backend público com TLS, e-mail transacional, backup e alerta.

A primeira tentativa foi o Supabase self-hosted numa VM (ADR 0002 e spec `supabase-self-hosted`). Ela foi arquivada na branch `feat/supabase-self-hosted` sem merge: a VPS disponível é compartilhada com outros projetos, e o stack self-hosted exigia controle do host (proxy, firewall, SSH) e cerca de 12 GB de RAM. O projeto não é monetizado, então a prioridade é custo zero com o mínimo de operação. Por decisão do usuário, o backend passa a rodar no **Supabase Cloud, plano gratuito**.

Limites do plano gratuito que esta spec trata (página de preços do Supabase, consultada em 2026-11-14):

| Limite | Valor | Tratamento |
| ------ | ----- | ---------- |
| Projetos ativos | 2 | Usamos 1: `estaca-criciuma`, a produção (decisão 8). Testes rodam no Supabase local |
| Pausa por inatividade | Projeto pausa depois de 1 semana sem atividade de banco; restaurável no painel por até 90 dias | O backup diário (RF-10) conecta no banco todo dia; se mesmo assim pausar, runbook `supabase-down.md` (RF-17) |
| Backup automático | Não incluso | Backup próprio diário (RF-09 a RF-12) |
| Domínio personalizado | Não disponível | A API usa `https://<project-ref>.supabase.co` |
| Banco / Storage / MAU | 500 MB / 1 GB / 50.000 | Folgado para 6 unidades; sem ação |
| Retenção de logs | 1 dia | Registrado em `O11Y.md` (RF-19) |
| SMTP próprio | Permitido | Resend (RF-03) |

## 2. Objetivo

Um projeto do Supabase Cloud, `estaca-criciuma` (produção, região `us-east-1`), recebe migrations e Edge Functions pelo GitHub Actions, por disparo manual com aprovação e dump prévio. Ele envia o código de login por e-mail a partir de `nao-responda@estacacriciuma.com.br`. O projeto tem backup diário cifrado, com teste de restauração e alerta por e-mail quando falha.

## 3. Estado atual

| Item | Situação | Destino |
| ---- | -------- | ------- |
| `supabase/config.toml`, `supabase/migrations/20261113220132_base_units_profiles_roles.sql`, `supabase/tests/base_rls.test.sql` | Criados em `app-foundation` | Manter |
| `supabase/seed.sql` | Insere as 7 unidades e as 5 contas fictícias `@exemplo.org` | Alterar: as unidades saem para uma migration de dados (RF-02) |
| `supabase/migrations/20261114013039_units_reference_data.sql` | Existe só na branch arquivada `feat/supabase-self-hosted` | Trazer para esta branch sem alteração (RF-02) |
| `supabase/snippets/` | Pasta vazia | Criar `grant_admin.sql` (RF-14) |
| `supabase/functions/` | Não existe | Sem mudança; o deploy trata a pasta ausente ou vazia (RF-04) |
| `.github/workflows/ci.yml` | Jobs `check` e `db` | Manter |
| `.env.example` | Variáveis do app e das Edge Functions | Alterar: comentário com o formato da URL do Supabase Cloud (RF-18) |
| `.ai/adrs/0003-hospedagem-supabase-oracle.md` | Existe só na branch arquivada, com status `Aceito` | Trazer com status `Substituído por 0004` (RF-20) |
| `infra/`, `docs/runbooks/` e workflow de deploy self-hosted | Existem só na branch arquivada | Não trazer; esta spec cria os equivalentes para o Cloud |
| `AGENTS.md`, `README.md`, `ARCHITECTURE.md`, `SECURITY.md`, `O11Y.md` | Descrevem Supabase self-hosted e têm "A definir" em ambientes, backup e alertas | Alterar (RF-19) |

## 4. Tecnologias e versões

| Tecnologia | Versão | Situação | Uso nesta entrega |
| ---------- | ------ | -------- | ----------------- |
| Supabase Cloud | plano Free | adicionar (conta da organização da estaca) | Projeto `estaca-criciuma`, região `us-east-1` (decisão 9) |
| Supabase CLI | 2.84.2 (mesma do job `db` da CI) | existente na CI | `link`, `db push`, `functions deploy`, `db dump` nos workflows |
| `supabase/setup-cli` | `v1` | existente na CI | Instalar a CLI nos workflows |
| GitHub Actions + Environments | — | existente | Deploy (`production`) e backup agendado (`production-backup`) |
| `actions/upload-artifact` | `v4` | adicionar no workflow | Guardar o backup cifrado por 30 dias |
| `age` | do apt do runner `ubuntu-latest` | adicionar no workflow | Cifra do backup com chave pública (X25519) |
| ShellCheck | pré-instalado no runner `ubuntu-latest` | CI | Lint de `infra/backup/dump.sh` |
| Resend | plano gratuito (3.000 e-mails/mês) | adicionar (conta) | SMTP do código de login |
| Registro.br | domínio `.com.br` (~R$ 40/ano) | adicionar | `estacacriciuma.com.br`, só para o remetente de e-mail nesta entrega |

## 5. Restrições e requisitos não funcionais

| ID | Requisito |
| -- | --------- |
| RNF-01 | O projeto fica na região `us-east-1` (decisão 9: São Paulo não estava disponível na criação pelo plano Free). A região não muda depois da criação; trocar exige criar outro projeto e migrar os dados. |
| RNF-02 | Custo recorrente da infra: só o domínio. Nenhum recurso pago do Supabase, do GitHub ou do Resend é habilitado (sem add-ons, sem Pro, sem compute extra). |
| RNF-03 | Segredos ficam só em: secrets de Environment do GitHub, painel do Supabase, painel do Resend e gerenciador de senhas do admin técnico. Nunca no repositório, em log de workflow ou em variável `EXPO_PUBLIC_*` (exceto a URL e a anon key, que são públicas). |
| RNF-04 | A chave privada do `age` existe só no gerenciador de senhas do admin técnico. O repositório guarda só a chave pública (`infra/backup/age-recipients.txt`). |
| RNF-05 | Os workflows usam secrets de **Environment** (`production`, `production-backup`), nunca secrets do repositório, para que só jobs ligados a um Environment leiam os segredos da produção. |
| RNF-06 | O seed com contas fictícias roda só no Supabase local (`supabase db reset`). Nem o deploy nem o runbook o executam no projeto remoto, que só tem dado real. |
| RNF-07 | Acesso ao painel do Supabase e ao Resend: só o admin técnico, com 2FA ligado nas duas contas. A organização do Supabase pertence a uma conta de e-mail da estaca, não a um e-mail pessoal. |
| RNF-08 | Backup da produção: diário às 06:00 UTC (03:00 em `America/Sao_Paulo`), cifrado no runner antes do upload, retenção de 30 dias (`retention-days: 30`). O arquivo enviado nunca contém o dump em texto claro. |
| RNF-09 | Transferência internacional: banco e Storage ficam nos EUA (`us-east-1`). Operadores, registrados em `SECURITY.md` › Dados tratados: Supabase Inc. (EUA), que opera e armazena o projeto, e Resend (EUA), que processa o e-mail de quem pede o código. O backup cifrado fica no GitHub (EUA). A política de privacidade (spec futura) informa a transferência. |
| RNF-10 | Os workflows conectam no banco pelo projeto ligado (`supabase link` + `--linked`), que usa o pooler IPv4 do Supabase. A conexão direta do plano gratuito só aceita IPv6, que os runners do GitHub não têm. Se o `--linked` falhar por IPv6, a alternativa é `DB_URL` com a URL do session pooler (porta `5432`, painel › Connect › Session pooler). |
| RNF-11 | Nenhum workflow imprime segredo ou URL de conexão com senha. Os workflows usam `::add-mask::` em todo valor derivado de secret. |

## 6. Escopo

### 6.1 Incluso

- Projeto `estaca-criciuma` no Supabase Cloud, plano Free, região `us-east-1`, criado pelo runbook.
- Configuração de Auth no projeto: Site URL, redirect do app e SMTP do Resend.
- Domínio `estacacriciuma.com.br` com os registros SPF, DKIM e DMARC do Resend.
- Workflow `deploy.yml`: deploy da produção por disparo manual com aprovação e dump prévio.
- Migration de dados com as 7 unidades e a remoção delas do `seed.sql`.
- Snippet SQL para conceder o primeiro admin.
- Workflow `backup.yml`: dump diário da produção, cifrado com `age`, guardado como artefato por 30 dias, com alerta por e-mail do GitHub quando falha.
- Teste de restauração do backup num Supabase local.
- Runbooks `provisioning.md`, `backup.md` e `supabase-down.md`.
- ADR `0004` (Supabase Cloud), ADR `0003` com status `Substituído por 0004` e atualização de `AGENTS.md`, `README.md`, `ARCHITECTURE.md`, `SECURITY.md`, `O11Y.md` e `.env.example`.

### 6.2 Não incluso

- Credenciais OAuth de Google e Apple, parâmetros de OTP (tamanho, validade, rate limit) e templates de e-mail (`auth-account`).
- `eas init`, variáveis de ambiente da EAS e builds `preview` (`push-notifications` e specs seguintes).
- Edge Functions de negócio e `pg_cron` (`push-notifications`).
- Página e URL da política de privacidade (o domínio fica disponível para ela).
- Monitor externo de uptime (o Supabase opera a disponibilidade; decisão 5).
- Projeto de homologação remoto (decisão 8) e ping agendado contra a pausa.
- Qualquer plano pago, domínio personalizado do Supabase ou PITR.

## 7. Especificação funcional

### 7.1 Projetos e configuração

| ID | Requisito |
| -- | --------- |
| RF-01 | Existe um projeto na organização do Supabase da estaca: `estaca-criciuma`, plano Free, região `us-east-1`, com senha de banco de pelo menos 32 caracteres gerada pelo gerenciador de senhas. O `project-ref`, a URL `https://<project-ref>.supabase.co`, a anon key e a senha do banco ficam no gerenciador de senhas do admin técnico. |
| RF-02 | `supabase/migrations/20261114013039_units_reference_data.sql` (trazida da branch arquivada, sem alteração) insere as 7 unidades com `on conflict (id) do nothing`; o bloco de `units` sai do `seed.sql`, que passa a começar com o comentário `-- Local seed: fictitious accounts only (no real member data). Units come from a migration.`. `make test-db` continua passando. |
| RF-03 | Auth no projeto (Authentication › URL Configuration e › SMTP Settings): Site URL `estacacriciuma://`; Redirect URLs `estacacriciuma://auth-callback`; SMTP próprio ligado com host `smtp.resend.com`, porta `465`, usuário `resend`, senha = chave da API do Resend `estaca-criciuma`, remetente `nao-responda@estacacriciuma.com.br`, nome `Estaca Criciúma`. Provedores Google e Apple ficam desligados. |

### 7.2 Deploy

| ID | Requisito |
| -- | --------- |
| RF-04 | `.github/workflows/deploy.yml` tem um job, `deploy-prod`, com os passos: checkout do commit, `supabase/setup-cli@v1` com `version: 2.84.2`, `supabase link --project-ref "$SUPABASE_PROJECT_ID"`, `supabase db push --linked --yes` e, se `supabase/functions/` existir e tiver pelo menos uma subpasta, `supabase functions deploy --project-ref "$SUPABASE_PROJECT_ID"`. Pasta de functions ausente ou vazia não é erro. Nenhum job roda o seed. |
| RF-05 | `deploy-prod` (Environment `production`, com **Required reviewers** de pelo menos 1 pessoa) roda só por `workflow_dispatch` com o input obrigatório `ref` (branch, tag ou SHA); merge na `main` não dispara deploy. Usa só os secrets de Environment `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD` e `SUPABASE_PROJECT_ID`, com `concurrency: deploy-prod` e `cancel-in-progress: false`. |
| RF-06 | Uma migration com erro faz o `supabase db push` sair com código ≠ 0 e o job falhar. As migrations anteriores continuam aplicadas, e a que falhou não fica registrada em `supabase_migrations.schema_migrations`. O GitHub envia o e-mail de falha a quem disparou. |
| RF-07 | Antes de `deploy-prod` aplicar migrations, o job roda o mesmo dump cifrado do backup (RF-09) e o envia como artefato `pre-deploy-<run_id>` com `retention-days: 30`. Se o dump falhar, o job para antes do `db push`, com a mensagem `error: pre-deploy backup failed`. |
| RF-08 | Uma migration já aplicada nunca é editada. Rollback de migration = nova migration que desfaz a mudança, pelo fluxo normal de PR. Restaurar backup só em perda de dados (`backup.md`). |

### 7.3 Backup e restauração

| ID | Requisito |
| -- | --------- |
| RF-09 | `infra/backup/dump.sh` faz o dump da produção: roda `supabase db dump` quatro vezes (com `--role-only`, sem flag, com `--data-only --use-copy` e com `--data-only --use-copy -s public`), gerando `roles.sql`, `schema.sql`, `data.sql` e `data-public.sql` (este último para a restauração no lugar, só do schema `public`); empacota os quatro num `tar.gz`, cifra com `age -R infra/backup/age-recipients.txt` e deixa só o arquivo `.tar.gz.age`. A conexão é a do projeto ligado por `supabase link` (`--linked`, RNF-10); `DB_URL`, opcional, troca por `--db-url` (testes locais). Os arquivos em texto claro são apagados ao final, em sucesso e em falha (via `trap`). O script é Bash com `set -euo pipefail` e passa no ShellCheck. |
| RF-10 | `.github/workflows/backup.yml` usa o Environment `production-backup` (mesmos três secrets da produção, sem revisor obrigatório, porque um job agendado não pode esperar aprovação), roda em `schedule: cron '0 6 * * *'` e por `workflow_dispatch`, executa `dump.sh` e envia o arquivo como artefato `backup-prod-<AAAA-MM-DD>` com `retention-days: 30`. |
| RF-11 | Alerta: quando o `backup.yml` falha por qualquer motivo (projeto pausado, senha errada, falha de cifra, falha de upload), o GitHub envia e-mail ao admin técnico. O runbook `backup.md` explica como garantir esse e-mail: ligar as notificações de Actions por e-mail em Settings › Notifications da conta do admin e manter o admin técnico como quem fez a última alteração no `cron` do workflow (o GitHub notifica esse usuário em execuções agendadas). |
| RF-12 | Restauração (`docs/runbooks/backup.md`): baixar o artefato, decifrar com `age -d -i <chave-privada>`, extrair e restaurar num Supabase local (`supabase start` e `supabase db reset --no-seed`), aplicando `roles.sql`, `schema.sql` e `data.sql` com `psql` na ordem da documentação do Supabase para restaurar dumps da CLI. O runbook termina com `select count(*)` em `public.units`, `public.profiles` e `public.memberships`. Restaurar por cima da produção é uma seção separada do runbook, só para perda de dados, com um dump `pre-restore` antes. |

### 7.4 Administração

| ID | Requisito |
| -- | --------- |
| RF-13 | O `supabase/seed.sql` roda só no Supabase local. O runbook avisa que ele nunca é aplicado no projeto remoto; as unidades chegam ao remoto pela migration de RF-02. |
| RF-14 | `supabase/snippets/grant_admin.sql` roda pelo SQL Editor do painel. O e-mail fica num CTE no topo (`with target as (select 'pessoa@exemplo.org'::text as email)`), que o admin edita antes de rodar. Numa transação, o snippet concede `admin` em `estaca` ao usuário com esse e-mail e grava `role_grants_log` (`action = 'granted'`, `actor_id = null`). Usuário inexistente: erro `no user with this email`. Usuário sem linha em `profiles`: erro `user has no profile yet`, sem gravar nada. Usuário já admin: não grava nada e retorna `already admin`. |

### 7.5 Documentação

| ID | Requisito |
| -- | --------- |
| RF-15 | `docs/runbooks/provisioning.md`: passos numerados, do zero, para (a) registrar o domínio no registro.br e delegar o DNS à Cloudflare (plano Free); (b) criar a organização do Supabase com o e-mail da estaca e ligar 2FA; (c) criar `estaca-criciuma` (Free, `us-east-1`); (d) criar a conta no Resend, verificar o domínio (SPF, DKIM e DMARC no DNS da Cloudflare, registros só DNS, sem proxy) e criar uma chave de API `estaca-criciuma` com permissão só de envio; (e) configurar Auth (RF-03); (f) criar o access token do Supabase e os Environments `production` e `production-backup` com seus secrets; (g) gerar o par de chaves `age` (`age-keygen`), guardar a privada no gerenciador de senhas e commitar a pública em `infra/backup/age-recipients.txt`; (h) aviso de que o seed não roda no remoto (RF-13); (i) primeiro deploy da produção; (j) conceder o primeiro admin (RF-14); (k) disparar o `backup.yml` manualmente e fazer o teste de restauração (RF-12). |
| RF-16 | `docs/runbooks/backup.md`: rodar backup manual, restaurar (RF-12), teste trimestral de restauração, configuração do e-mail de falha (RF-11) e o que fazer quando o e-mail de falha chega (verificar se o projeto pausou, se a senha do banco mudou, se o secret existe). |
| RF-17 | `docs/runbooks/supabase-down.md`: diagnóstico pelo status do projeto no painel e por `https://status.supabase.com`; reativar projeto pausado (restaurável no painel até 90 dias depois da pausa); rollback de deploy (RF-08); e quando restaurar backup. |
| RF-18 | `.env.example`: o comentário acima de `EXPO_PUBLIC_SUPABASE_URL` informa os dois valores possíveis: `http://localhost:54321` (local) e `https://<project-ref>.supabase.co` (preview e produção), sem o `project-ref` real. |
| RF-19 | Documentos: `AGENTS.md` e `README.md` trocam "Supabase self-hosted" por "Supabase Cloud (plano Free, região us-east-1)"; `ARCHITECTURE.md` › Stack, Integrações externas e Ambientes sem "A definir" (URLs no formato de RF-18 e os dois workflows); `SECURITY.md` › a seção "Infra self-hosted" vira "Infra (Supabase Cloud)" com backup (RF-09 a RF-12) e acesso ao painel (RNF-07), e › Dados tratados registra os operadores fora do Brasil (RNF-09); `O11Y.md` › Ferramentas (logs no painel do Supabase, retenção de 1 dia) e › Alertas (backend fora do ar e backup não executado apontando para os runbooks e para o e-mail do GitHub). |
| RF-20 | ADR `0004-supabase-cloud.md` (formato de `.ai/adrs/_template.md`): contexto (VPS compartilhada, custo zero, time voluntário), opções (self-hosted na VPS, Supabase Cloud Free, Postgres puro com API própria), decisão e consequências (pausa por inatividade, sem backup nativo, dados armazenados e operados nos EUA, sem domínio próprio na API, volta ao self-hosted possível porque o cliente e as migrations são os mesmos). O ADR 0004 substitui o 0003 e a parte de hospedagem self-hosted do 0002. O ADR 0003 é trazido da branch arquivada com `Status: Substituído por 0004`. |

### 7.6 Casos de borda

| Situação | Comportamento |
| -------- | ------------- |
| Produção pausada | O `backup.yml` falha e o GitHub envia e-mail de falha em até 24 h; reativar pelo `supabase-down.md` |
| Dois disparos seguidos do deploy | `concurrency: deploy-prod` sem cancelar; o segundo espera o primeiro |
| `deploy-prod` com `ref` inexistente | O checkout falha e o job para antes de qualquer `db push` |
| Senha do banco trocada no painel sem atualizar o secret | `db push` e backup falham com erro de autenticação; o runbook manda atualizar `SUPABASE_DB_PASSWORD` nos Environments |
| Access token do Supabase expirado ou revogado | `supabase link` falha; o runbook manda gerar outro token e atualizar os dois Environments |
| Chave privada do `age` perdida | Os backups existentes ficam ilegíveis. O runbook manda gerar um par novo, trocar `age-recipients.txt` e disparar um backup na hora |
| Artefato de backup baixado por terceiros (repositório público) | O arquivo é cifrado com `age`; sem a chave privada não há como ler (RNF-04, RNF-08) |
| Resend fora do ar | O código de login não chega; o Auth registra o erro de SMTP nos logs do painel. Sem fallback nesta entrega |
| Migration nova quebra em produção | Não há homologação remota (decisão 8): a migration passa antes pelo `make test-db` local e pela CI; se falhar no deploy, vale RF-06 e o dump `pre-deploy` (RF-07) |

## 8. Especificação de UI/UX

Não se aplica: entrega de infraestrutura, sem telas.

## 9. Acessibilidade

Não se aplica: entrega de infraestrutura, sem telas.

## 10. Estrutura de arquivos esperada

```
.github/workflows/deploy.yml               # deploy-prod (manual + aprovação + dump prévio)
.github/workflows/backup.yml               # dump diário da produção, cifrado, artefato 30 dias
infra/backup/dump.sh                       # roles + schema + data → tar.gz → age
infra/backup/age-recipients.txt            # chave pública age (nunca a privada)
supabase/migrations/20261114013039_units_reference_data.sql   # trazida da branch arquivada
supabase/seed.sql                          # alterar: sem o bloco de units
supabase/snippets/grant_admin.sql          # primeiro admin pelo SQL Editor
docs/runbooks/provisioning.md
docs/runbooks/backup.md
docs/runbooks/supabase-down.md
.ai/adrs/0003-hospedagem-supabase-oracle.md  # trazido da branch arquivada, status "Substituído por 0004"
.ai/adrs/0004-supabase-cloud.md
.ai/docs/ARCHITECTURE.md, SECURITY.md, O11Y.md   # alterar (RF-19)
AGENTS.md, README.md, .env.example               # alterar (RF-18, RF-19)
```

## 11. Critérios de aceitação

Os CA marcados como **manual** dependem dos projetos reais e são verificados no roteiro de QA; o plano registra a justificativa.

| ID | Cobre | Dado | Quando | Então |
| -- | ----- | ---- | ------ | ----- |
| CA-01 | RF-01, RNF-01, RNF-02 | o projeto criado | abro Project Settings › General (manual) | nome `estaca-criciuma`, região `us-east-1`, plano Free; a organização não tem add-on pago |
| CA-02 | RF-02 | um banco local | `supabase db reset --no-seed` e consulto `units`; depois `supabase db reset` e `make test-db` | sem seed, `units` tem as 7 linhas (`estaca`, `criciuma1`, `criciuma2`, `criciuma3`, `icara`, `ararangua`, `ramoGaivota`); `make test-db` passa; `seed.sql` não tem `insert into public.units` |
| CA-03 | RF-03 | o projeto configurado e um e-mail real de teste | peço o código com `POST https://<project-ref>.supabase.co/auth/v1/otp` e a anon key (manual) | o e-mail chega de `Estaca Criciúma <nao-responda@estacacriciuma.com.br>` com SPF, DKIM e DMARC `pass` nos cabeçalhos; Site URL e Redirect URLs no painel são os de RF-03; Google e Apple desligados |
| CA-04 | RF-04, RF-05 | um PR com uma migration nova e inofensiva (ex.: `comment on table public.units is 'Stake and its units'`) mergeado na `main` | o CI termina verde; depois disparo `deploy-prod` com `ref=main` e aprovo (manual) | o merge sozinho não dispara deploy; depois do disparo, o job passa e `supabase migration list --linked` mostra a migration |
| CA-05 | RF-06 | uma migration com SQL inválido numa branch de teste e o Supabase local com as migrations anteriores aplicadas | rodo `supabase db push --local` (manual, nunca contra a produção) | código ≠ 0; `supabase migration list --local` não lista a migration com erro e as anteriores continuam |
| CA-06 | RF-05, RF-07 | o repositório e as configurações do GitHub | disparo `deploy-prod` com `ref=main` (manual) | o job espera aprovação de 1 revisor do Environment `production`; depois de aprovado, sobe o artefato `pre-deploy-<run_id>` antes do `db push` |
| CA-07 | RNF-03, RNF-05, RNF-11 | o repositório | `grep -rEn 'eyJ[A-Za-z0-9_-]{20,}\|re_[A-Za-z0-9]{20,}\|sbp_[A-Za-z0-9]{20,}\|AGE-SECRET-KEY' .github/ infra/ docs/ supabase/` e inspeção de `deploy.yml` e `backup.yml` | nenhuma ocorrência; todo secret é lido de `secrets.*` dentro de um job com `environment:`; nenhum secret de repositório é usado |
| CA-08 | RF-09, RF-10, RNF-08, RNF-10 | a produção no ar | disparo `backup.yml` manualmente (manual) | o job passa; existe o artefato `backup-prod-<data>` com retenção de 30 dias contendo só um `.tar.gz.age`; `strings` no arquivo baixado não encontra `CREATE TABLE` |
| CA-09 | RF-11, RNF-11 | a produção no ar | troco temporariamente `SUPABASE_DB_PASSWORD` do Environment `production-backup` por um valor errado e disparo o backup (manual) | o job falha e o admin técnico recebe o e-mail de falha do GitHub; o log não mostra a senha; restauro o secret depois |
| CA-10 | RF-12 | um artefato de backup da produção | sigo `backup.md` › Restaurar num Supabase local (manual) | o banco local tem as mesmas contagens de `units`, `profiles` e `memberships` da produção no momento do dump |
| CA-11 | RF-13, RNF-06 | a produção com o primeiro deploy feito | consulto `public.units` e `auth.users` no SQL Editor (manual) | `units` tem as 7 linhas; nenhuma conta `@exemplo.org` existe |
| CA-12 | RF-14 | o Supabase local com o seed (`membro@exemplo.org` tem perfil) e um usuário criado só em `auth.users` (sem perfil); depois, a produção com a conta do admin técnico logada uma vez | rodo o snippet no local duas vezes com `membro@exemplo.org`, depois com um e-mail inexistente e com o usuário sem perfil; na produção, com o e-mail do admin técnico (manual) | local, 1ª: membership `admin` em `estaca` e uma linha em `role_grants_log`; 2ª: `already admin`, sem linha nova; inexistente: erro `no user with this email`; sem perfil: erro `user has no profile yet`, sem gravar nada; produção: `granted` |
| CA-13 | RNF-07 | as contas criadas | confiro as configurações de conta do Supabase e do Resend (manual) | 2FA ligado nas duas; a organização do Supabase tem só o admin técnico como membro |
| CA-14 | RF-08, RF-15, RF-16, RF-17, RF-18, RF-19, RF-20, RNF-09 | o repositório | leio os runbooks, os ADRs e os docs alterados | os 3 runbooks têm todos os itens de RF-15 a RF-17, e `supabase-down.md` descreve o rollback por migration nova de RF-08; `ARCHITECTURE.md`, `SECURITY.md` e `O11Y.md` não têm "A definir" nos pontos de RF-19; `SECURITY.md` cita Supabase e Resend como operadores nos EUA; nenhum doc fora de `.ai/adrs/` e `.ai/specs/` descreve o backend como self-hosted; o ADR 0003 tem `Status: Substituído por 0004` |
| CA-15 | RF-09 | o repositório | `shellcheck infra/backup/dump.sh` e leitura do script | passa sem avisos; o script tem `set -euo pipefail` e `trap` que apaga os arquivos em texto claro |
| CA-16 | RF-04 | o repositório sem a pasta `supabase/functions/` | `deploy-prod` roda (manual, junto com CA-04) | o passo de functions é pulado e o job passa |

## 12. Roteiro de QA

| Passo | Ação | Resultado esperado |
| ----- | ---- | ------------------ |
| 1 | Seguir `docs/runbooks/provisioning.md` itens (a) a (g) | Cada item conclui sem passo não documentado; desvios anotados no plano |
| 2 | CA-01 e CA-13 | Projetos e contas como descrito |
| 3 | Item (i) do runbook e CA-11 | Unidades na produção; nenhuma conta fictícia |
| 4 | CA-03 com um e-mail pessoal de teste | E-mail chega com SPF, DKIM e DMARC `pass` |
| 5 | Mergear na `main` o PR com a migration inofensiva e disparar o deploy | CA-04, CA-06 e CA-16 |
| 6 | CA-05 com uma migration inválida, no Supabase local | Falha sem estado parcial |
| 7 | Revisar o log do passo 5 (CA-06) | Aprovação exigida e dump prévio enviado antes do `db push` |
| 8 | Item (j) do runbook e CA-12 | Admin concedido e auditado |
| 9 | CA-08, CA-09 e CA-10 | Backup cifrado, alerta de falha recebido e restauração conferida |
| 10 | CA-02, CA-07, CA-14 e CA-15 no repositório; `make check` e `make test-db` | Passam |

## 13. Definition of Done

- [x] `make check` passa (lint, tipos, testes, build)
- [x] `make test-db` passa localmente e na CI
- [x] Todo `CA` tem teste automatizado com o ID no nome, ou justificativa de teste manual no plano
- [x] Roteiro de QA executado; divergências registradas no plano (restauração exigiu fixar versões, corrigido em `backup.md`; CA-12 em produção adiado, decisão 11)
- [x] Registro de implementação preenchido no plano
- [x] Nenhum segredo, dado pessoal ou log sensível introduzido (ver `.ai/docs/SECURITY.md`)
- [x] Project refs, senhas do banco, chaves do Resend, access token do Supabase e chave privada do `age` guardados no gerenciador de senhas do admin técnico
- [x] ADRs 0003 e 0004 e docs de RF-19 atualizados

## 14. Decisões em aberto

Nenhuma decisão em aberto.

| # | Pergunta | Decisão | Origem |
| - | -------- | ------- | ------ |
| 1 | Hospedagem do backend | Supabase Cloud, plano Free (substitui o self-hosted, arquivado em `feat/supabase-self-hosted`) | usuário |
| 2 | Projetos criados agora | Substituída pela decisão 8 | usuário |
| 3 | E-mail do código de login | Domínio `estacacriciuma.com.br` + Resend; remetente `nao-responda@` | usuário |
| 4 | Destino do backup | Artefato do GitHub Actions, cifrado com `age`, 30 dias | usuário |
| 5 | Alertas | E-mail de falha do GitHub Actions; sem monitor externo de uptime | usuário |
| 6 | Código self-hosted já feito | Arquivado na branch `feat/supabase-self-hosted`, sem PR | usuário |
| A1 | Região | Substituída pela decisão 9 | padrão do projeto |
| A2 | Deploy | GitHub Actions: produção manual com aprovação e dump prévio | padrão do projeto, ajustado pela decisão 8 |
| A3 | Conexão dos workflows com o banco | Session pooler (IPv4), porque a conexão direta do plano Free é só IPv6 | padrão do projeto |
| A4 | Backup de qual ambiente | O único projeto (produção) | padrão do projeto |
| A5 | Dump antes do deploy de produção | Sim, como artefato `pre-deploy-<run_id>` | padrão do projeto (spec arquivada) |
| A6 | Unidades e seed | Unidades por migration (trazida da branch arquivada); seed fictício só no Supabase local | padrão do projeto, ajustado pela decisão 8 |
| A7 | Primeiro admin | Snippet SQL no SQL Editor, auditado em `role_grants_log` | padrão do projeto |
| A8 | Configuração de Auth | Pelo painel, seguindo o runbook; Google e Apple em `auth-account` | padrão do projeto |
| A9 | Acesso ao painel | Só o admin técnico, 2FA, organização com e-mail da estaca | padrão do projeto |
| A10 | ADRs | 0004 novo; 0003 trazido com status `Substituído por 0004` | padrão do projeto |
| 7 | DNS do domínio | Registrado no registro.br com DNS delegado à Cloudflare (feito pelo usuário em 2026-11-14) | usuário |
| 8 | Ambientes remotos | Um projeto só, `estaca-criciuma`, que é a produção. Sem homologação remota; testes no Supabase local e na CI (2026-11-14) | usuário |
| 9 | Região | `us-east-1`: São Paulo não estava disponível ao criar o projeto no plano Free. Dados ficam nos EUA, com transferência internacional registrada em `SECURITY.md` (2026-11-14) | usuário |
| 10 | Dump do backup | `--linked` (projeto ligado) em vez de URL montada dos secrets, e 4 arquivos (com `data-public.sql`); funcionou nos runs reais (assessment rodada 1, G-02) | usuário (2026-11-14) |
| 11 | CA-12 em produção | Adiado para `auth-account`, que cria `profiles`; os 4 casos locais passaram (assessment rodada 1, G-01) | usuário (2026-11-14) |
| A11 | Skills | `ecc:deployment-patterns`, `ecc:database-migrations`, `ecc:security-review` | padrão do projeto |

## 15. Próximos passos (fora desta entrega)

- `auth-account`: Google e Apple no Auth do projeto, parâmetros de OTP e templates de e-mail.
- `push-notifications`: `eas init`, variáveis da EAS por perfil (`preview` e `production` apontam para o mesmo projeto), Edge Functions e `pg_cron`.
- Página da política de privacidade em `estacacriciuma.com.br` (pode ser estática e gratuita).
- Teste trimestral de restauração (`backup.md`).
- Reavaliar o plano Pro se o banco passar de 400 MB, se a pausa da produção virar problema ou se for preciso migrar para São Paulo.
- Criar um projeto de homologação remoto (o segundo projeto gratuito) se testar só no local deixar de bastar.
