# 0003. Hospedar o Supabase self-hosted numa VM Oracle com dois stacks isolados

> **Status:** Aceito
> **Data:** 2026-11-13
> **Origem:** `.ai/plans/supabase-self-hosted.md`

## Contexto

- O ADR 0002 escolheu o Supabase **self-hosted** para manter sob controle da estaca os dados sensíveis (filiação religiosa, chamados, anotações; ver `SECURITY.md`).
- O time é voluntário e pequeno, sem equipe de operações: a solução precisa de poucos componentes, ser recriável por runbook e ter custo próximo de zero.
- A estaca já tem uma VM Oracle Cloud Ampere A1 (arm64, Always Free) na região do Brasil.
- Testes no celular e builds `preview` exigem um backend público com TLS, e-mail transacional, backup e monitoramento, antes mesmo da produção existir.
- Dados pessoais devem ficar no Brasil sempre que possível (LGPD).

## Opções consideradas

1. **Uma VM Oracle, dois stacks Supabase isolados** (homologação e produção) com Docker Compose, Caddy na frente.
2. **Uma VM por ambiente.**
3. **Supabase Cloud** (gerenciado).

## Decisão

Escolhemos a opção 1: uma única VM Oracle Ampere A1 com dois projetos Compose (`estaca-hml`, `estaca-prod`), cada um com usuário Linux, diretório, rede, volumes, segredos e repositório de backup próprios.

- Custo: a VM Always Free cobre os dois ambientes; duas VMs ou o Supabase Cloud teriam custo recorrente para um time voluntário.
- Dados no Brasil: VM e Object Storage na região de São Paulo; no Supabase Cloud o dado sensível ficaria sob controle de um terceiro, contra o motivo do ADR 0002.
- Operação simples: o compose oficial do Supabase, sem fork, fixado por commit em `infra/supabase/VERSION`, mais um override pequeno nosso.
- Caddy no host cuida de TLS (Let's Encrypt) e só deixa passar os prefixos da API ao gateway Envoy do upstream (padrão do `self-hosted/v0.8.4`; o Kong não é usado).
- Deploy por GitHub Actions + SSH, sem credencial do GitHub na VM (o repositório é público).

## Consequências

### Positivas

- Custo próximo de zero e controle total sobre os dados sensíveis.
- Homologação e produção rodam os mesmos scripts e runbooks; a produção sobe depois, pelo mesmo roteiro.
- Backup cifrado (restic) fora da VM, por ambiente, com teste de restauração.

### Negativas

- **Risco residual de isolamento:** quem tem `root` ou acesso ao daemon Docker da VM alcança os dois ambientes. Aceito pela estaca (decisão 9 da spec).
- **Ponto único de falha:** não há alta disponibilidade nem réplica; a recuperação é recriar a VM pelo `provisioning.md` e restaurar o último backup.
- **Instância Always Free:** a Oracle pode recuperar instâncias ociosas; o backup diário fora da VM é a mitigação.
- **Imagens arm64:** toda imagem do stack precisa ter variante arm64; uma atualização do upstream pode quebrar isso (a atualização vai primeiro à homologação).
- Os dois stacks com Analytics exigem pelo menos 12 GB de RAM; se faltar memória, a homologação é parada primeiro.
- Dependência do gateway Envoy do upstream e de três arquivos com nomes de container fixos, que o `provision-env.sh` reescreve; mudanças do upstream podem exigir ajuste.

### O que muda para quem desenvolve

- Toda mudança de servidor passa por `infra/` e pelos runbooks em `docs/runbooks/`; nada é configurado só à mão na VM.
- Migrations chegam à homologação a cada merge na `main` e à produção por disparo manual com aprovação; migration não tem rollback automático.
- Scripts de `infra/scripts/` seguem `set -euo pipefail`, passam no ShellCheck (`make lint-infra`) e nunca imprimem segredos.
