# 0004. Hospedar o backend no Supabase Cloud (plano Free)

> **Status:** Aceito
> **Data:** 2026-11-14
> **Origem:** `.ai/plans/supabase-cloud.md`

## Contexto

- O ADR 0002 escolheu o Supabase; o ADR 0003 detalhou a hospedagem self-hosted numa VM Oracle. Essa tentativa foi arquivada sem merge (branch `feat/supabase-self-hosted`): a VPS disponível é compartilhada com outros projetos, e o stack self-hosted exigia controle do host (proxy, firewall, SSH) e cerca de 12 GB de RAM.
- O time é voluntário e pequeno, sem equipe de operações: a solução precisa de poucas peças e de custo zero. O projeto não é monetizado.
- Testes no celular, builds `preview` e as lojas exigem um backend público com TLS, e-mail transacional, backup e alerta.
- Dados pessoais deveriam ficar no Brasil sempre que possível (LGPD), mas a região São Paulo não estava disponível ao criar o projeto no plano Free (2026-11-14).

## Opções consideradas

1. **Supabase self-hosted na VPS compartilhada** (ADR 0003).
2. **Supabase Cloud, plano Free**, um projeto (`estaca-criciuma`, produção) em `us-east-1`.
3. **Postgres puro com API própria**, sem Supabase.

## Decisão

Escolhemos a opção 2.

- Custo e operação: o Supabase opera banco, Auth, API e TLS; o único custo recorrente é o domínio (`estacacriciuma.com.br`), usado só como remetente do e-mail de login via Resend.
- Região: `us-east-1`, porque São Paulo não estava disponível no plano Free. Os dados ficam nos EUA, sob a Supabase Inc.; a transferência internacional está registrada em `SECURITY.md`.
- Um projeto só (produção): o segundo projeto gratuito fica livre; testes rodam no Supabase local e na CI.
- Sem mudar o código: o cliente `@supabase/supabase-js`, as migrations e as políticas de RLS são os mesmos da opção 1; voltar ao self-hosted continua possível.
- A opção 3 descarta Auth, RLS e Edge Functions prontos e obriga a escrever e manter uma API, sem ganho para o MVP.
- Deploy por GitHub Actions (`deploy.yml`) e backup próprio diário (`backup.yml`), porque o plano Free não inclui backup.

## Consequências

### Positivas

- Custo recorrente de infra zero (só o domínio) e quase nenhuma operação de servidor.
- Secrets da produção só em Environments do GitHub (`production`, `production-backup`).
- Backup cifrado com `age` e teste de restauração documentado (`docs/runbooks/backup.md`).

### Negativas

- **Pausa por inatividade:** o projeto pausa depois de 1 semana sem atividade de banco (restaurável no painel por até 90 dias). O backup diário falha e avisa; o runbook `supabase-down.md` descreve a reativação.
- **Sem backup nativo no plano Free:** o backup próprio (artefato do GitHub, 30 dias) é a única cópia fora do Supabase.
- **Dados armazenados e operados nos EUA** (Supabase em `us-east-1`, Resend, GitHub para o backup cifrado): transferência internacional que a política de privacidade precisa informar. Cada chamada do app tem mais latência do que teria em São Paulo.
- **Sem homologação remota:** toda mudança chega direto à produção, protegida por CI, `make test-db` local, aprovação manual e dump prévio. Builds `preview` usam o backend de produção.
- **Sem domínio próprio na API:** a URL é `https://<project-ref>.supabase.co`.
- Limites do plano Free (500 MB de banco, 1 GB de Storage, 50.000 MAU, logs com 1 dia de retenção) e sem monitor externo de uptime.

### O que muda para quem desenvolve

- Migrations e Edge Functions só chegam ao projeto remoto pelo `deploy.yml`, por disparo manual com aprovação e dump prévio. Merge na `main` não faz deploy. Nada é aplicado à mão.
- Migration já aplicada nunca é editada; rollback é uma migration nova por PR.
- Migrations novas não podem depender de dado de seed: o seed fictício existe só no Supabase local. Teste toda migration com `make test-db` antes do PR.
- Backup diário da produção e alerta por e-mail de falha do GitHub Actions; procedimentos em `docs/runbooks/`.
