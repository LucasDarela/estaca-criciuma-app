# Regras de código

Só regras que o linter e o formatador não garantem. Cada uma com o motivo.

## Princípios

- Siga o padrão do código ao redor antes de qualquer preferência pessoal. Consistência vale mais que a "melhor" solução isolada.
- Mudança mínima que resolve o problema. Refatorações oportunistas vão para uma spec própria.
- Código é lido muito mais vezes do que escrito: nomes explícitos, funções curtas, sem esperteza.
- Erros nunca são engolidos em silêncio. Ou são tratados com um comportamento definido na spec, ou propagados.

## Idioma

- **Código em inglês (en-US)**: identificadores, comentários, nomes de arquivo, tabelas/colunas, chaves de i18n, eventos de log e mensagens de commit. Motivo: padrão do time e do ecossistema; evita mistura "getEventos".
- **Termos de domínio** usam o nome em inglês do glossário de `BUSINESS.md` (`calling`, `ward`, `sustaining`), nunca tradução livre.
- **Interface**: pt-BR padrão, en-US e es-MX. Todo texto visível vem de `t('feature.key')`. Motivo: string solta no componente não é traduzida e quebra os outros idiomas.
- Nomes próprios (unidades, "Estaca Criciúma") não são traduzidos.

## Nomes

| Elemento | Convenção | Exemplo |
| -------- | --------- | ------- |
| Componentes React (arquivo e export) | `PascalCase.tsx` | `EventCard.tsx` |
| Hooks | `useCamelCase` em `hooks.ts` ou `useX.ts` | `useUnitEvents` |
| Outros arquivos TS | `camelCase.ts` | `permissions.ts` |
| Rotas expo-router | `kebab-case` | `app/(tabs)/agenda.tsx`, `event/[id].tsx` |
| Funções e variáveis | `camelCase`, verbo para funções | `canPublishTo(unit)` |
| Tipos | `PascalCase`, sem prefixo `I` | `CallingStage` |
| Tabelas e colunas | `snake_case`, tabelas no plural | `calling_processes.current_stage` |
| Funções SQL | `snake_case` | `has_role(unit_id, role)` |
| Chaves i18n | `feature.screen.element` | `calendar.empty.day` |
| Testes | `*.test.ts(x)` ao lado do arquivo | `permissions.test.ts` |

## Estrutura

Ver `ARCHITECTURE.md`. Em resumo: rotas em `src/app`, uma pasta por feature em `src/features`, design system em `src/components`, regras puras em `src/domain`, infra em `src/lib`, SQL em `supabase/migrations`.

## Proibido

| Proibido | Motivo | Em vez disso |
| -------- | ------ | ------------ |
| `any` e `@ts-ignore` | Esconde erros que o compilador pegaria | `unknown` + narrowing; `@ts-expect-error` com comentário do porquê |
| Cor, espaçamento, raio ou fonte escritos à mão | Quebra a consistência do design system | Tokens de `src/theme/theme.ts` |
| Texto de UI literal em componente | Não é traduzido | `t('chave')` com entrada nos 3 locales |
| Tabela sem RLS ou política `using (true)` em dado não público | Expõe dados confidenciais (chamados, anotações) | RLS + políticas por `has_role` / `auth.uid()` |
| Service role key no app | Ignora a RLS | Edge Function com a chave no servidor |
| Chamar Supabase de dentro de `components/` | Acopla o design system ao backend | `features/*/api.ts` + props |
| Teste, helper ou componente dentro de `src/app` | O expo-router empacota todo arquivo da pasta: o teste vai para o app e quebra o build | Tela em `src/features/<x>/`, rota só re-exporta |
| Importar fonte pela raiz do pacote (`@expo-google-fonts/noto-sans`) | Empacota os ~36 arquivos de fonte (~15 MB) | Import por peso: `@expo-google-fonts/noto-sans/400Regular` |
| Import entre features | Acoplamento circular | Subir o código comum para `domain`/`lib`/`components` |
| Datas com `new Date()` direto em regra de negócio | Testes dependem do relógio real | Receber `now` como parâmetro |
| Guardar dado pessoal em `AsyncStorage` sem necessidade | LGPD: dado sensível fora do controle | Cache do TanStack só do que a tela precisa; sessão no `expo-secure-store` |
| "SUD", "LDS", "mórmon" em textos | Guia de comunicação da Igreja | Ver `DESIGN_SYSTEM.md` › Voz |

## Datas e fuso

- Datas gravadas em `timestamptz` (UTC). Exibição no fuso `America/Sao_Paulo` e no formato do idioma ativo (`Intl.DateTimeFormat`). Motivo: eventos são presenciais em SC, mesmo vistos de fora.

## Comentários e documentação

- Comente o **porquê**, nunca o **o quê**. Se precisa explicar o que o código faz, renomeie ou simplifique.
- Funções públicas de módulos compartilhados têm docstring com contrato (entradas, saídas, erros).

## Dependências

- Dependência nova só quando prevista na spec ou no plano, com versão fixada.
- Antes de adicionar, verifique se algo já instalado resolve.
- Pacotes nativos: prefira os do SDK Expo (`npx expo install`) para versões compatíveis.
