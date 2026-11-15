# AGENTS.md

Contexto para agentes de IA (Claude Code, Cursor, Codex e outros). Este arquivo é carregado em toda sessão, então fica curto: fatos essenciais e ponteiros. O detalhe mora em `.ai/docs/` e é lido só quando a tarefa pede.

## Projeto

App mobile (iOS e Android) da **Estaca Criciúma** de A Igreja de Jesus Cristo dos Santos dos Últimos Dias: estaca + 6 unidades (Alas Criciúma 1, 2 e 3, Içara, Araranguá e Ramo Gaivota). Reúne agenda das unidades, mural de avisos, organograma da liderança, anotações pessoais, acompanhamento de chamados e notificações push. Agenda, mural e liderança são públicos; o resto exige login e papel. Estágio: **MVP para as lojas**. O app Expo está criado (base: rotas, fontes, i18n, tokens, testes); nenhuma feature implementada ainda.

## Stack

- TypeScript 6.0 (strict) · **Expo SDK 58** (React Native 0.88, React 19.3) · **expo-router** (rotas em `src/app`)
- **Supabase Cloud (plano Free, região us-east-1)**: Postgres com RLS, Auth (OTP por e-mail), Edge Functions; cliente `@supabase/supabase-js`
- TanStack Query (cache offline) · `@shopify/react-native-skia` (desenho) · `expo-notifications` (push e lembretes locais)
- i18n: `i18next` + `react-i18next` + `expo-localization` — **pt-BR (padrão), en-US, es-MX**
- Qualidade: ESLint (`eslint-config-expo`) + Prettier + `tsc` · Jest (`jest-expo`) + React Native Testing Library · Maestro (E2E)
- Erros: Sentry (`@sentry/react-native`) · Builds de loja: EAS Build · Node 26 LTS (`.nvmrc`; use `nvm use` na pasta) · npm

Detalhes e motivos: `.ai/docs/ARCHITECTURE.md` e `.ai/adrs/0002-stack-inicial.md`.

## Comandos

Todos os comandos passam pelo `Makefile`, que é a interface estável entre agentes, CI e a stack real. Enquanto não existir `package.json`, os alvos avisam e saem com sucesso.

| Comando | O que faz |
| --- | --- |
| `make setup` | `npm ci` |
| `make dev` | `expo start` (Expo Go / dev client) |
| `make format` | Prettier (aceita `FILE=caminho`) |
| `make lint` | `expo lint` + `tsc --noEmit` + `prettier --check` |
| `make test` | Jest com cobertura |
| `make test-db` | pgTAP/RLS (`supabase/tests/`); precisa de Docker e `supabase start`; fora do `check` |
| `make db-types` | Gera `src/lib/database.types.ts` a partir do banco local |
| `make test-e2e` | Maestro (`.maestro/`), precisa de emulador; fora do `check` |
| `make build` | `expo export` iOS + Android (bundle de produção, sem credenciais) |
| `make check` | `lint` + `test` + `build`. É o que a CI roda e o que define "pronto". |

## Idiomas

- **Código em inglês (en-US)**: identificadores, comentários, nomes de arquivos, tabelas, commits e mensagens de log.
- **Interface em pt-BR por padrão**, com en-US e es-MX. Nenhum texto de UI escrito direto no componente: tudo via `t('chave')`.
- Docs de `.ai/` em português.

## Como trabalhar aqui

- O fluxo de features é orientado a specs: `/create-spec` → `/create-plan` → `/implement-me` → `/assessment-spec`. Regras completas, status e IDs em `.ai/WORKFLOW.md`.
- Antes de escrever código de uma feature, leia a spec e o plano dela. O que não está na spec está fora do escopo.
- Rode `make check` antes de dizer que algo está pronto. Se falhar, diga que falhou e mostre a saída.
- Decisões de arquitetura novas viram ADR em `.ai/adrs/`.
- Toda tabela nova no Supabase nasce com RLS ligada e políticas explícitas (ver `SECURITY.md`).
- UI usa só tokens de `src/theme/theme.ts` e componentes de `DESIGN_SYSTEM.md`.
- `src/app` só tem arquivos de rota (re-export de telas de `src/features`): o expo-router empacota tudo que está lá, inclusive testes.

## Onde está cada coisa

Leia sob demanda, conforme a tarefa:

| Preciso de... | Leia |
| --- | --- |
| Regras de negócio, personas, glossário do domínio | `.ai/docs/BUSINESS.md` |
| Estrutura de pastas, camadas, padrões, integrações | `.ai/docs/ARCHITECTURE.md` |
| Convenções de código, nomes, proibições | `.ai/docs/RULES.md` |
| Estratégia de testes, cobertura, formatação | `.ai/docs/QA.md` |
| Segurança, segredos, autenticação, LGPD | `.ai/docs/SECURITY.md` |
| Logs, métricas, traces, alertas | `.ai/docs/O11Y.md` |
| Princípios de UX, fluxos, copy | `.ai/docs/DESIGN.md` |
| Tokens, componentes, temas | `.ai/docs/DESIGN_SYSTEM.md` |
| Decisões de arquitetura já tomadas | `.ai/adrs/` |

## Limites

- Não leia nem escreva arquivos `.env*` ou `secrets/`. Use `.env.example` para documentar variáveis.
- Não adicione dependências sem que a spec ou o plano prevejam.
- Não faça `git push --force` nem reescreva histórico compartilhado.
- Não use o símbolo/logotipo oficial da Igreja nem as abreviações "SUD", "LDS" ou "mórmon" (ver `DESIGN_SYSTEM.md`).
- Em caso de ambiguidade que mude o comportamento do produto, pergunte em vez de supor.
