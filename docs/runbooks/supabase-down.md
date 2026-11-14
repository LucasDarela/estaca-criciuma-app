# Runbook: backend fora do ar ou projeto pausado

Use quando o app não consegue falar com o Supabase, quando `deploy.yml` ou `backup.yml` falha ao conectar, ou quando chega o e-mail de falha do GitHub Actions.

## 1. Diagnóstico

1. Painel do Supabase: veja o status do projeto (`estaca-criciuma`). `Paused` significa pausa por inatividade.
2. Status geral da plataforma: https://status.supabase.com
3. Health check do Auth (deve responder `200`):

```bash
curl -s -o /dev/null -w '%{http_code}' https://<ref>.supabase.co/auth/v1/health
```

4. Logs: painel › Logs (retenção de 1 dia no plano Free).

## 2. Projeto pausado

O plano Free pausa o projeto depois de 1 semana sem atividade de banco. Reative em Restore project, no painel; é possível por até 90 dias depois da pausa. Nenhum dado se perde.

Depois de reativar: Actions › Backup › Run workflow, para confirmar que o backup volta a funcionar. Se um deploy tinha falhado, rode-o de novo (Actions › Deploy › Re-run).

## 3. Plataforma fora do ar

Se o status do Supabase indicar incidente, aguarde: não há ação do nosso lado. O código de login depende também do Resend (https://resend.com/status); sem fallback nesta entrega.

## 4. Rollback de deploy

Uma migration já aplicada **nunca é editada**. Para desfazer uma mudança, crie uma **nova migration** que a desfaz, pelo fluxo normal de PR: depois do merge, ela chega à produção por `deploy-prod`, com aprovação e dump prévio.

## 5. Quando restaurar backup

Restaurar backup é só para **perda de dados** (linhas apagadas, migration que destruiu dados), nunca para queda ou pausa. Procedimentos em `docs/runbooks/backup.md` (restauração no lugar, seção B).
