# Estaca Criciúma Mobile App

App mobile (iOS e Android) da Estaca Criciúma de A Igreja de Jesus Cristo dos Santos dos Últimos Dias.

## Sobre este projeto

Reúne em um só lugar a **agenda** da estaca e das unidades (Alas Criciúma 1, 2 e 3, Içara, Araranguá e Ramo Gaivota), o **mural** de avisos, o **organograma da liderança**, **anotações pessoais**, o **acompanhamento de chamados** pelos líderes e **notificações push** por unidade. Agenda, mural e liderança são públicos; o restante exige login.

- **Stack:** Expo (React Native) + TypeScript, expo-router, Supabase Cloud (plano Free, região us-east-1; Postgres + RLS, Auth, Edge Functions), TanStack Query, Skia, i18next.
- **Idiomas:** interface em pt-BR (padrão), en-US e es-MX; código em inglês.
- **Estágio:** MVP para App Store e Google Play.
- **Contexto completo:** [`AGENTS.md`](AGENTS.md) e [`.ai/docs/`](.ai/docs/). Design: projeto "Design System" no claude.ai/design.

O projeto usa desenvolvimento assistido por IA com fluxo orientado a specs, portões de qualidade automáticos e rastreabilidade do requisito ao teste.

## Começando

Pré-requisitos: Node 26 LTS (`.nvmrc`; rode `nvm use` na pasta), [Supabase CLI](https://supabase.com/docs/guides/local-development) e Docker para o backend local, Maestro para E2E.

```bash
cp .env.example .env      # preencha com os valores locais
make setup                # npm ci
supabase start            # Supabase local (Postgres, Auth, Storage)
make dev                  # Expo dev server
make check                # lint + test + build, o mesmo que a CI
```

Comandos e convenções: [`AGENTS.md`](AGENTS.md).

## Fluxo de uma feature

| # | Comando | O que acontece | Resultado |
| - | ------- | -------------- | --------- |
| 1 | `/create-spec <descrição>` | Lê o projeto, levanta todas as ambiguidades e pergunta em blocos, sempre com recomendação | `.ai/specs/<slug>.md` |
| 2 | `/create-plan <slug>` | Decide o "como": contratos, tarefas pequenas, padrões de referência, cobertura por critério | `.ai/plans/<slug>.md` |
| 3 | `/implement-me <slug>` | Agent `implementer` escreve testes a partir dos critérios e depois o código | código + testes |
| 4 | `/assessment-spec <slug>` | Agent `assessor`, isolado e só leitura, valida critério por critério com evidência | `.ai/assessments/<slug>.md` |
| 5 | PR | Template linka spec, plano e assessment; CI roda `make check` | merge |

Se o assessment der `FAIL`, rode `/implement-me` de novo: ele corrige só as lacunas apontadas. Depois de 3 rodadas, a spec fica `Bloqueada` para decisão humana. Detalhes em [`.ai/WORKFLOW.md`](.ai/WORKFLOW.md).

## Estrutura

```
AGENTS.md                 Contexto curto para qualquer agente (Claude, Cursor, Codex...)
CLAUDE.md                 Importa AGENTS.md + notas do Claude Code
Makefile                  Interface única de comandos: setup, dev, format, lint, test, build, check
.env.example              Variáveis de ambiente documentadas (valores fictícios)
.claude/
  settings.json           Permissões (bloqueia .env, push --force...) e hooks
  hooks/                  Formata ao editar; roda lint antes de encerrar
  agents/                 implementer (Sonnet), assessor (Sonnet, só leitura)
  skills/                 bootstrap-project, create-spec, create-plan, implement-me, assessment-spec
.ai/
  WORKFLOW.md             Etapas, status, IDs, ciclo de correção — fonte única de verdade do fluxo
  docs/                   BUSINESS, ARCHITECTURE, RULES, QA, SECURITY, O11Y, DESIGN, DESIGN_SYSTEM
  specs/                  _template.md + _example-reset-password.md
  plans/                  _template.md + _example-reset-password.md
  assessments/            _template.md
  adrs/                   _template.md (MADR) + 0001-fluxo-orientado-a-specs.md
.github/
  workflows/ci.yml        make check em todo PR
  pull_request_template.md
```

## Princípios por trás da base

- **Contexto em camadas.** `AGENTS.md` é curto e sempre carregado; os docs são lidos sob demanda. Contexto demais dilui a atenção do modelo tanto quanto contexto de menos.
- **Prompts pedem, hooks garantem.** O que não pode falhar (formatação, lint, acesso a segredos) é aplicado por hooks, permissões e CI, não por instruções.
- **Artefatos, não conversas.** Cada etapa grava um arquivo. Qualquer etapa pode ser retomada por outra sessão, outro modelo ou outra pessoa.
- **Quem implementa não valida.** O assessment roda em contexto isolado e precisa de evidência por critério.
- **Exemplos ensinam mais que regras.** Os arquivos `_example-*` mostram o nível de detalhe esperado.
- **Rastreabilidade por ID.** `RF` → `CA` → teste (`CA-03: ...`) → assessment.

## Personalizando

- **Modelos:** troque `model:` em `.claude/agents/*.md` (ex.: `opus` no `implementer` para features complexas).
- **Comandos:** edite só o corpo dos alvos do `Makefile`; os nomes são o contrato com hooks e CI.
- **Outros agentes de IA:** `AGENTS.md` é lido nativamente por Cursor, Codex e outros. As skills são específicas do Claude Code.
