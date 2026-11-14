# Qualidade e testes

Define o que é "testado o suficiente" neste projeto. O agent `implementer` escreve testes seguindo este arquivo; o `assessor` o usa como régua.

## Comandos

| O quê | Comando |
| ----- | ------- |
| Formatar | `make format` (ou `make format FILE=src/x.ts`) |
| Lint + tipos + formatação | `make lint` |
| Testes unitários e de componentes | `make test` |
| Testes de banco (pgTAP/RLS; precisa de Docker e `supabase start`) | `make test-db` |
| E2E (local, com emulador) | `make test-e2e` |
| Tudo (o que a CI roda) | `make check` |

## Ferramentas

| Função | Ferramenta | Configuração |
| ------ | ---------- | ------------ |
| Formatador | Prettier (Markdown ignorado) | `.prettierrc`, `.prettierignore` |
| Linter | ESLint via `expo lint` (`eslint-config-expo`) | `eslint.config.js` |
| Tipos | TypeScript `tsc --noEmit`, `strict: true` | `tsconfig.json` |
| Testes unitários/componentes | Jest (`jest-expo`) + React Native Testing Library | `jest.config.js`, `jest.setup.ts` (fixa `expo-localization` em pt-BR) |
| Testes de banco (RLS) | Testes SQL com pgTAP via `supabase test db` | `supabase/tests/` |
| Testes e2e | Maestro | `.maestro/*.yaml` |

## Estratégia

| Tipo | Quando usar | Onde fica |
| ---- | ----------- | --------- |
| Unitário | Regras de `src/domain` (permissões, etapas de chamado, agrupamento de agenda, carregar pendências) e utilitários de `src/lib` | `*.test.ts` ao lado do arquivo |
| Componente | Componentes do design system e telas: renderização por estado (vazio, carregando, erro), interação, rótulos de acessibilidade, texto via i18n | `*.test.tsx` ao lado do arquivo |
| Integração | `features/*/api.ts` com cliente Supabase mockado na fronteira (sem rede) | `*.test.ts` ao lado do arquivo |
| Banco / RLS | Toda migration com política nova: quem pode e quem **não** pode ler/escrever (visitante, membro, líder de outra unidade, admin em chamados) | `supabase/tests/*.sql` |
| E2E | Fluxos críticos: agenda pública sem login, login por OTP, líder publica evento com push, anotação com lembrete | `.maestro/` — roda local e antes de release; fora do `make check` por exigir emulador |
| Manual | Visual contra o design, VoiceOver/TalkBack, fonte do sistema em 1.6×, 3 idiomas, push real em aparelho | Roteiro de QA da spec |

## Convenções

- Todo teste ligado a um critério de aceitação inclui o ID no nome: `CA-03: shows error for invalid email`. É isso que permite ao `/assessment-spec` rastrear cobertura. (Nome do teste em inglês, ID em português como na spec.)
- Teste comportamento observável, não detalhes de implementação. Em componentes, busque por papel/rótulo (`getByRole`, `getByLabelText`), não por `testID`, salvo quando não houver alternativa.
- Um teste falha por um motivo só. Nomes descrevem o cenário, não a função.
- Testes não dependem de ordem, de rede externa nem de horário real (use `jest.useFakeTimers` / `now` injetado).
- Testes de componente rodam em pt-BR; a paridade de chaves entre os 3 locales tem um teste próprio (toda chave de pt-BR existe em en-US e es-MX).
- Bug corrigido ganha um teste que falhava antes da correção.

## Cobertura

- Meta: **80% de linhas** em `src/domain/` e `src/lib/` (`coverageThreshold` no `jest.config.js`; a CI falha abaixo disso). O limite só passa a valer quando a pasta existe: o Jest falha com limite para caminho sem arquivos.
- Componentes e telas: sem meta numérica; cada critério de aceitação de UI tem teste de componente ou fluxo Maestro.
- Fora da medição: `src/app/**/_layout.tsx`, arquivos de configuração, `src/i18n/locales/`.
- Toda política RLS tem teste de acesso negado.

## Dados de teste

- Factories em `src/test/factories.ts` (a criar) para `Event`, `Post`, `Note`, `CallingProcess`, `Profile`.
- `supabase/seed.sql` com as 7 unidades reais e pessoas **fictícias** ("Nome Sobrenome"), para dev local e E2E.
- Nunca dados reais de membros, nem em fixture, nem em screenshot de teste.
