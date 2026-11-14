# Runbook: backup e restauração da produção

O plano Free do Supabase não inclui backup. O backup é nosso: `.github/workflows/backup.yml` roda todo dia às 06:00 UTC (03:00 em `America/Sao_Paulo`), faz o dump com `infra/backup/dump.sh`, cifra com `age` e guarda o arquivo como artefato do GitHub por 30 dias. O arquivo contém `roles.sql`, `schema.sql`, `data.sql` e `data-public.sql` e só pode ser lido com a chave privada `age`.

## Backup manual

Actions › Backup › Run workflow. O artefato é `backup-prod-<AAAA-MM-DD>`. O deploy de produção também gera um backup antes do `db push` (`pre-deploy-<run_id>`).

## Baixar o artefato

Pela interface: Actions › execução › Artifacts. Pela linha de comando:

```bash
gh run download <run-id> -n <nome-do-artefato>
```

## Decifrar e extrair

A chave privada vem do gerenciador de senhas; salve-a num arquivo temporário e apague-o ao final.

```bash
age -d -i <arquivo-da-chave-privada> -o backup.tar.gz <artefato>.tar.gz.age
mkdir restore && tar -xzf backup.tar.gz -C restore
```

## A) Testar a restauração num Supabase local novo

Serve para o teste trimestral e para conferir um backup. Não toca na produção.

```bash
supabase stop                                  # na pasta do projeto, se estiver rodando
tmp="$(mktemp -d)" && (cd "$tmp" && supabase init && supabase start)
psql --single-transaction --variable ON_ERROR_STOP=1 \
  --file restore/roles.sql --file restore/schema.sql \
  --command 'SET session_replication_role = replica' \
  --file restore/data.sql \
  --dbname 'postgresql://supabase_admin:postgres@127.0.0.1:54322/postgres'
psql 'postgresql://postgres:postgres@127.0.0.1:54322/postgres' -c \
  "select (select count(*) from public.units) units, (select count(*) from public.profiles) profiles, (select count(*) from public.memberships) memberships;"
(cd "$tmp" && supabase stop --no-backup) && rm -rf "$tmp" restore backup.tar.gz
```

Por que `supabase_admin` e não `postgres`: o `data.sql` inclui tabelas do schema `storage`, e no Supabase local o usuário `postgres` não tem permissão de escrita em todas (erro `permission denied for table buckets_vectors`). `supabase_admin` é superusuário do banco local.

Confira que `units`, `profiles` e `memberships` batem com a produção no momento do dump. Depois, `supabase start` de novo na pasta do projeto, se você o usava.

## B) Restauração no lugar (só perda de dados em produção)

**Só use em perda de dados** (linhas apagadas, migration que destruiu dados). Queda ou projeto pausado **não** é perda de dados: veja `supabase-down.md`. Esta restauração apaga o conteúdo atual de `public` e o substitui pelo do backup.

1. Actions › Backup › Run workflow, para ter um dump `pre-restore` do estado atual. Baixe-o e guarde.
2. Decifre e extraia o backup que será restaurado (seção acima).
3. Rode, com a URL do session pooler da produção (painel › Connect › Session pooler):

```bash
psql "<url-session-pooler-prod>" --single-transaction --variable ON_ERROR_STOP=1 \
  --command 'SET session_replication_role = replica' \
  --command "do \$\$ begin execute (select 'truncate table ' || string_agg(format('%I.%I', schemaname, tablename), ', ') || ' cascade' from pg_tables where schemaname = 'public'); end \$\$;" \
  --file restore/data-public.sql
```

Tudo roda numa transação: se algo falhar, nada muda. Confira as contagens depois e apague os arquivos extraídos.

## Teste trimestral

A cada 3 meses, baixe o último backup e faça o procedimento A. Anote a data e as contagens na tabela abaixo.

## E-mail de falha

Quando o `backup.yml` falha (projeto pausado, senha errada, falha de cifra, falha de upload), o GitHub envia um e-mail de falha. Para garantir que o admin técnico receba:

1. Em Settings › Notifications da conta do GitHub do admin, ligue as notificações de **Actions** por e-mail.
2. Mantenha o admin técnico como quem fez a última alteração no `cron` de `backup.yml`: o GitHub notifica esse usuário nas execuções agendadas.

### O que fazer ao receber o e-mail de falha

- **Projeto pausado** (erro no `supabase link` ou na conexão): reative pelo painel, conforme `supabase-down.md`, e rode o backup de novo.
- **Senha do banco mudou** (erro de autenticação): atualize `SUPABASE_DB_PASSWORD` nos Environments `production` e `production-backup`.
- **Access token expirado ou revogado** (falha no `supabase link`): gere outro em Account › Access Tokens e atualize `SUPABASE_ACCESS_TOKEN` nos dois Environments (`production` e `production-backup`).
- **Secret ausente:** confira se os três secrets existem em `production-backup`.

## Workflow agendado desativado

O GitHub desativa workflows agendados depois de 60 dias sem atividade no repositório (ele avisa por e-mail antes). Para reativar: Actions › Backup › Enable workflow.

## Chave `age` perdida

Os backups existentes ficam ilegíveis. Gere um par novo (`age-keygen`, item g de `provisioning.md`), troque a linha pública em `infra/backup/age-recipients.txt` por PR, guarde a chave privada nova no gerenciador de senhas e dispare um backup na hora.

## Histórico de testes

| Data | Artefato | `units` | `profiles` | `memberships` | Quem |
| --- | --- | --- | --- | --- | --- |
