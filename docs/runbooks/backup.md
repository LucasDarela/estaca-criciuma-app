# Runbook: backup e restauração

Cada ambiente tem o próprio repositório restic no Oracle Object Storage (`s3:<endpoint>/<bucket>/<env>`), cifrado no servidor antes do envio. O `backup.sh` roda todo dia às 03:00 (`America/Sao_Paulo`) pelo timer `estaca-backup@<env>.timer`, guarda 30 snapshots diários e avisa o Healthchecks.io.

Cada snapshot tem: `globals.sql` (`pg_dumpall --globals-only`), `postgres.dump` (`pg_dump -Fc` do banco `postgres`) e os arquivos do Storage (`volumes/storage`). A senha do restic (`RESTIC_PASSWORD` no `.env`) também fica no gerenciador de senhas: sem ela os backups não abrem.

## Rodar um backup manual

Na VM, como `root`:

```bash
sudo systemctl start estaca-backup@hml.service
sudo journalctl -u estaca-backup@hml.service -n 30 --no-pager   # termina com "backup ok hml <id>"
```

Ou direto, sem o systemd: `sudo /opt/estaca/hml/app/infra/scripts/backup.sh hml`.

Listar snapshots (as variáveis do restic saem do `.env`; não imprima o arquivo):

```bash
sudo bash -c 'set -a; . <(grep -E "^(OCI_S3_ENDPOINT|OCI_BUCKET|OCI_REGION|RESTIC_PASSWORD|AWS_ACCESS_KEY_ID|AWS_SECRET_ACCESS_KEY)=" /opt/estaca/hml/.env); \
  RESTIC_REPOSITORY="s3:$OCI_S3_ENDPOINT/$OCI_BUCKET/hml" AWS_DEFAULT_REGION="$OCI_REGION" \
  restic -o s3.bucket-lookup=path snapshots'
```

O backup aborta com `error: disk usage above 85%` se o disco estiver cheio: libere espaço (por exemplo, apague `restore/` antigos) e rode de novo.

## Restaurar

A restauração **nunca** sobrescreve o banco `postgres`: ela cria um banco novo no Postgres do mesmo ambiente e desembala o Storage em `/opt/estaca/<env>/restore/<timestamp>/`.

```bash
sudo /opt/estaca/hml/app/infra/scripts/restore.sh hml latest restore_check
# units=7 profiles=<n> memberships=<n>
```

O segundo argumento é `latest` ou o id de um snapshot. O nome do banco precisa ser novo (`[a-z_][a-z0-9_]*`), e `postgres` é recusado com `error: target database must be new and not 'postgres'`. Se aparecer `warn: pg_restore reported errors`, confira: extensões e objetos do sistema que já existem geram erros esperados; compare as contagens impressas com as da origem.

Para voltar ao estado de um backup num incidente real (banco `postgres` perdido ou corrompido):

1. Pare o stack: `docker compose -p estaca-<env> --project-directory /opt/estaca/<env>/supabase/docker stop`.
2. Suba só o banco, restaure num banco novo (acima) e confira os dados.
3. Troque o banco: renomeie `postgres` e o restaurado (`alter database ... rename to ...`, com as conexões encerradas), ou copie os dados necessários. Registre o que foi feito.
4. Suba o stack inteiro (`... up -d --wait`) e confira `/healthz/auth` e `/healthz/rest`.
5. Os arquivos do Storage restaurados estão em `restore/<timestamp>/`; copie para `volumes/storage` se necessário.

Recriar a VM do zero (instância recuperada pela Oracle): siga `provisioning.md` e restaure o último snapshot do mesmo jeito.

## Teste trimestral de restauração

A cada 3 meses (e antes do envio às lojas):

1. `sudo systemctl start estaca-backup@hml.service` e confirme o snapshot novo.
2. `restore.sh hml latest restore_check`.
3. Confira `units=7` e que `profiles` e `memberships` batem com a origem (`select count(*)` no Studio).
4. Apague o banco de teste: `docker exec -i estaca-hml-db psql -h 127.0.0.1 -U supabase_admin -d postgres -c 'drop database restore_check'` (a senha vem do ambiente do container; se pedir, use `PGPASSWORD` do `.env` sem imprimir).
5. Registre a data e o resultado no issue de manutenção do repositório.

## Alerta do Healthchecks.io (`estaca-backup-<env>` sem ping por 26 h, ou `/fail`)

1. Veja o log: `sudo journalctl -u estaca-backup@<env>.service -n 100 --no-pager`.
2. Causas comuns: Object Storage fora do ar ou credencial expirada (confira o console da Oracle e `AWS_*` no `.env`); senha do restic errada; disco acima de 85%; container do banco parado (veja `supabase-down.md`).
3. Corrija e rode o backup manual (acima). O próximo timer tenta de novo sozinho; `Persistent=true` recupera execuções perdidas com a VM desligada.
4. Se o Healthchecks continuar vermelho depois de um backup `ok`, confira `HEALTHCHECKS_URL` no `.env`.
