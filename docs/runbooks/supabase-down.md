# Runbook: backend fora do ar

Alerta do UptimeRobot em `/healthz/auth` ou `/healthz/rest` (`502` ou sem resposta). Nos comandos, troque `<env>` por `hml` ou `prod`. Entre na VM como o usuário do ambiente (`ssh estaca-<env>@<ip>`) ou como administrador com `sudo`.

Atalho para o Compose do ambiente:

```bash
DC="docker compose -p estaca-<env> --project-directory /opt/estaca/<env>/supabase/docker"
```

## 1. Diagnóstico

1. O que responde? `curl -i https://api-hml.estacacriciuma.com.br/healthz/auth` (e `/healthz/rest`).
   - `502`: o Caddy está de pé, mas o gateway ou o serviço atrás dele não.
   - Sem resposta ou erro de TLS: Caddy ou rede; veja o passo 4.
2. Estado dos containers: `$DC ps`. Procure serviços `unhealthy`, `restarting` ou ausentes. O gateway é o serviço `api-gw` (Envoy); os demais: `auth`, `rest`, `db`, `storage`, `functions`, `realtime`, `studio`, `analytics`, `vector`.
3. Logs do serviço suspeito: `$DC logs --tail 100 <serviço>` (por exemplo, `api-gw`, `auth`, `rest`, `db`).
4. Caddy: `sudo systemctl status caddy` e `sudo journalctl -u caddy -n 50 --no-pager`. Certificado que não renova costuma ser DNS errado ou porta 80 fechada.
5. Recursos: `df -h /opt/estaca`, `free -h`. Disco cheio ou falta de memória derrubam o banco. Com pouca RAM, pare **a homologação primeiro** (`$DC stop` com o `DC` de `hml`) para proteger a produção.

## 2. Reiniciar

1. Um serviço só: `$DC restart <serviço>`.
2. O stack do ambiente: `$DC up -d --wait` (recria o que estiver parado e espera ficar `healthy`).
3. Depois da VM reiniciada: Docker, Caddy e os stacks voltam sozinhos (`restart: unless-stopped`). Se não voltarem, `sudo systemctl status docker caddy` e `$DC up -d --wait`.
4. Confirme: os dois `curl` de `/healthz/*` devolvem `200`.

## 3. Rollback de deploy

Quando o problema começou depois de um deploy, volte para o commit anterior que funcionava:

```bash
ssh estaca-<env>@<ip>
/opt/estaca/<env>/app/infra/scripts/deploy.sh <env> <sha-anterior>
```

O script confere o commit, (em `prod`, faz backup antes), aplica as migrations pendentes e atualiza as Edge Functions. **Migration não tem rollback automático:** o `deploy.sh` de um commit antigo não desfaz uma migration já aplicada. Para reverter o banco, escreva uma migration nova que desfaça a mudança (e faça o deploy dela) ou restaure o backup (`backup.md`).

Uma migration com erro faz o deploy falhar com código diferente de zero; as migrations anteriores continuam aplicadas e a que falhou não fica registrada. Se aparecer estado parcial, restaure o backup e corrija a migration depois.

## 4. Quando restaurar o backup

- Banco corrompido ou dados apagados por engano: siga `backup.md` › Restaurar.
- Disco ou VM perdidos: recrie pela `provisioning.md` e restaure o último snapshot.

Registre o incidente (hora, causa, ação) no issue de manutenção do repositório.
