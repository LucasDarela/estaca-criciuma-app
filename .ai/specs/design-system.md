# Design system: componentes, ícones e navegação por abas

> **Status:** Aguardando assessment
> **Área:** `src/components/`, `src/components/icons/`, `src/app/(tabs)/`, `src/app/dev/`
> **Última atualização:** 2026-11-13

## 0. Skills obrigatórias

| Skill | Quando usar |
| ----- | ----------- |
| `vercel-react-native-skills` | Componentes, `Pressable`, listas e performance de render |
| `ecc:accessibility` | Rótulos, papéis, alvos de toque e escala de fonte de cada componente |
| `ecc:react-testing` | Testes de componente por papel e rótulo |
| `ecc:postgres-patterns` | Não há banco nesta entrega; não carregar |

## 1. Contexto

`DESIGN_SYSTEM.md` especifica 15 componentes e a barra inferior por perfil, mas nenhum existe em código. Toda tela das próximas specs depende deles. Esta entrega constrói os componentes sobre os tokens de `src/theme/theme.ts`, os ícones do design e a navegação por abas que muda conforme o perfil (`useViewer()` de `app-foundation`).

## 2. Objetivo

Os componentes de `DESIGN_SYSTEM.md` existem em `src/components/` com testes, um catálogo visual em `/dev/components` (só em desenvolvimento) mostra todas as variantes, e o app abre numa barra de abas que muda para Visitante, Membro e Líder.

## 3. Estado atual

| Item | Situação | Destino |
| ---- | -------- | ------- |
| `src/theme/theme.ts` | Tokens completos | Manter; adicionar só tokens que faltarem, com comentário `derived` |
| `src/app/index.tsx` + `src/features/home/` | Tela provisória com a assinatura | Remover; `/` redireciona para `/agenda` |
| `useViewer()` | Criado em `app-foundation` | Usar para escolher as abas |
| `.ai/docs/DESIGN_SYSTEM.md` | Especifica componentes como "a criar" | Alterar: coluna "Onde está" com os caminhos reais |

## 4. Tecnologias e versões

| Tecnologia | Versão | Situação | Uso nesta entrega |
| ---------- | ------ | -------- | ----------------- |
| `react-native-svg` | versão do SDK 58 (`npx expo install`) | adicionar | Ícones |
| Material Symbols Rounded (Google, Apache 2.0) | peso 400, opsz 24, FILL 0 e 1 | adicionar (SVGs gerados) | Ícones |
| expo-router | 58 | instalada | Abas `(tabs)` |
| `react-native-safe-area-context` | do SDK | instalada | Área segura da barra e dos cabeçalhos |

## 5. Restrições e requisitos não funcionais

| ID | Requisito |
| -- | --------- |
| RNF-01 | Nenhum valor de cor, espaçamento, raio ou fonte escrito à mão nos componentes: só tokens de `theme.ts`. |
| RNF-02 | Nenhum texto de UI literal: rótulos vêm de props ou de `t()`, com chaves nos 3 locales. |
| RNF-03 | Componentes de `src/components/` não importam `features/`, `lib/` nem Supabase (ARCHITECTURE.md). |
| RNF-04 | Os ícones são SVGs do Material Symbols Rounded convertidos para componentes; o arquivo de licença Apache 2.0 acompanha a pasta. |
| RNF-05 | A rota `/dev/components` só é acessível com `__DEV__ === true`; em produção redireciona para `/agenda`. |

## 6. Escopo

### 6.1 Incluso

- Componentes: `Button`, `TextField`, `SearchField`, `FilterChip`, `UnitTag`, `StatusTag`, `Badge`, `Segmented`, `EventCard`, `ListItem`, `Avatar`, `Switch`, `Toast` (+ `useToast`), `TabBar`, `ScreenHeader`, `Sheet` e `ConfirmSheet`, `EmptyState`, `OfflineBanner`, `Skeleton`, `Icon`.
- Ícones: os nomes da tabela 7.3, nas versões contornada e preenchida.
- Abas por perfil (tabela 7.4) com telas provisórias e redirecionamento de `/` para `/agenda`.
- Catálogo `/dev/components`.
- Atualização de `DESIGN_SYSTEM.md` com os caminhos.

### 6.2 Não incluso

- Conteúdo real das abas (cada feature tem sua spec).
- Tema escuro.
- Animações além do feedback de toque (opacidade 0,7 ao pressionar) e da entrada/saída do `Sheet` e do `Toast`.

## 7. Especificação funcional

### 7.1 Componentes

As medidas e cores estão em `DESIGN_SYSTEM.md` › Componentes; os requisitos abaixo fecham o comportamento.

| ID | Requisito |
| -- | --------- |
| RF-01 | `Button`: props `variant` (`primary` \| `secondary` \| `outline` \| `ghost` \| `danger`), `size` (`default` 52 \| `compact` 44), `label`, `icon?`, `loading?`, `disabled?`, `onPress`. Com `loading`, mostra `ActivityIndicator` no lugar do ícone, mantém o rótulo e ignora toques. Desabilitado: `surfaceDisabled` + `textDisabled`. |
| RF-02 | `TextField`: `label` visível acima, `value`, `onChangeText`, `error?` (texto abaixo em `danger`), `hint?`, `multiline?`, `maxLength?`. Estados: padrão (borda `borderStrong`), foco (borda 1,5 `primary` + anel 4 `focusRing`), erro (borda `danger`). |
| RF-03 | `SearchField`: ícone `search`, placeholder, botão `cancel` que limpa o texto quando há conteúdo; `size` `default` 44 \| `compact` 40. |
| RF-04 | `FilterChip`: `label`, `selected`, `dotColor?`, `icon?`, `onPress`. Selecionado: fundo `primary`, texto e ponto brancos. |
| RF-05 | `UnitTag` recebe `unitId` e usa `units[unitId]` (`tint` + `text`, rótulo `label`). `StatusTag` recebe `tone` (`neutral` \| `info` \| `success` \| `warning`) e `label`. |
| RF-06 | `Badge`: número; acima de 99 mostra `99+`. |
| RF-07 | `Segmented`: 2 a 3 opções `{ value, label, icon?, count? }`, `value`, `onChange`. |
| RF-08 | `EventCard`: `title`, `timeLabel`, `typeIcon?`, `place?`, `unitId`, `onPress`. Barra lateral 4 px `units[unitId].dot`. |
| RF-09 | `ListItem`: `title`, `subtitle?`, `leading?` (avatar, ícone ou ponto de unidade), `trailing?` (`chevron` \| texto de contagem \| `Switch`), `onPress?`. |
| RF-10 | `Avatar`: `name` → iniciais (primeira letra do primeiro e do último nome, maiúsculas; um nome só → 1 letra); `size` `default` 44 \| `large` 64. |
| RF-11 | `Switch`: controlado, `value`, `onValueChange`, `label` obrigatório para acessibilidade; `size` `default` 51×31 \| `compact` 46×28. |
| RF-12 | `Toast` via `useToast().show({ message, actionLabel?, onAction?, tone? })`: um por vez, some em 4 s (6 s com ação); um novo substitui o atual. |
| RF-13 | `ScreenHeader`: `title` (serif 28), `overline?`, `onBack?`, `actions?` (até 2 botões circulares 44), `showAvatar?`. Com `showAvatar` e viewer logado, mostra `Avatar` 36 com as iniciais de `profile.display_name`, que navega para `/profile`. |
| RF-14 | `Sheet`: bottom sheet modal com alça, raio 24 no topo, fundo `scrim`, fecha ao tocar no fundo ou arrastar para baixo. `ConfirmSheet`: `title`, `message`, `confirmLabel`, `confirmVariant` (`primary` \| `danger`), `cancelLabel`. |
| RF-15 | `EmptyState`: ícone opcional, `message`, ação opcional; borda tracejada `borderStrong`, raio 14. `OfflineBanner`: faixa com o texto `Sem conexão. Mostrando a última versão salva.` `Skeleton`: blocos `surfaceDisabled` com as dimensões recebidas. |

### 7.2 Textos fixos dos componentes

| Chave | pt-BR |
| ----- | ----- |
| `common.offline` | `Sem conexão. Mostrando a última versão salva.` |
| `common.back` | `Voltar` |
| `common.clear` | `Limpar` |
| `common.close` | `Fechar` |
| `common.cancel` | `Cancelar` |
| `common.comingSoon` | `Esta área chega em breve.` |
| `common.profile` | `Abrir perfil` |

### 7.3 Ícones

| ID | Requisito |
| -- | --------- |
| RF-16 | `Icon` recebe `name`, `filled?` (padrão `false`), `size?` (padrão 24), `color?` (padrão `theme.text`). Nomes disponíveis: `calendar_month`, `campaign`, `account_tree`, `edit_note`, `assignment_ind`, `login`, `account_circle`, `notifications`, `notifications_active`, `search`, `cancel`, `expand_more`, `chevron_left`, `chevron_right`, `location_on`, `add`, `check`, `check_circle`, `close`, `arrow_back`, `arrow_forward`, `push_pin`, `tune`, `lock`, `badge`, `groups`, `event`, `alarm`, `notes`, `draw`, `delete`, `format_bold`, `format_italic`, `format_list_bulleted`, `checklist`, `link`, `calendar_today`, `celebration`, `forum`, `school`, `podium`, `directions_bus`, `apps`, `call`, `chat`, `share`, `map`, `edit`, `logout`, `language`, `download`, `person`, `image`, `visibility`. |

### 7.4 Navegação

| ID | Requisito |
| -- | --------- |
| RF-17 | `TabBar` (altura 84 incluindo área segura): abas conforme `useViewer().kind`: |

| Perfil | Abas (rota · ícone · rótulo) |
| ------ | ---------------------------- |
| `visitor` | `agenda` · `calendar_month` · `Agenda`; `board` · `campaign` · `Mural`; `leadership` · `account_tree` · `Liderança`; `sign-in` · `login` · `Entrar` |
| `member` | `agenda`, `board`, `leadership`; `notes` · `edit_note` · `Anotações`; `profile` · `account_circle` · `Perfil` |
| `leader` | `agenda`, `board`, `leadership`, `notes`; `callings` · `assignment_ind` · `Chamados` |

| ID | Requisito |
| -- | --------- |
| RF-18 | Aba ativa: ícone preenchido e rótulo 700 em `primary`; inativa: contornado, 500, `textSubtle`. Rótulos com `maxFontSizeMultiplier = 1.6`. |
| RF-19 | Rotas que não estão nas abas do perfil atual continuam existindo (ex.: `/profile` para o Líder, via avatar). Se o perfil muda e a aba atual some, o app vai para `/agenda`. |
| RF-20 | Cada aba ainda sem feature mostra `ScreenHeader` com o rótulo da aba e `EmptyState` com `Esta área chega em breve.` `/` redireciona para `/agenda`. |
| RF-21 | `/dev/components` lista cada componente com todas as variantes e estados (padrão, pressionado não se aplica, desabilitado, carregando, erro) e todos os ícones de RF-16, nas versões contornada e preenchida. |

### 7.5 Casos de borda

| Situação | Comportamento |
| -------- | ------------- |
| Nome com acentos ou um só nome em `Avatar` | `Ângela` → `Â`; `maria da silva` → `MS` |
| Rótulo longo em `Button` | Quebra em até 2 linhas, centralizado; nunca corta |
| Fonte do sistema em 1,6× | Componentes crescem em altura sem cortar texto; `TabBar` respeita o limite de RF-18 |
| Dois toques rápidos em `Button` com `loading` | O segundo é ignorado |
| `Badge` com 0 | Não renderiza |

## 8. Especificação de UI/UX

- Medidas, raios, cores e tipografia exatamente como em `DESIGN_SYSTEM.md` › Componentes e `theme.ts`.
- Feedback de toque: opacidade 0,7 enquanto pressionado, em todos os elementos tocáveis.
- `Sheet` entra deslizando de baixo em 250 ms; com "Reduzir movimento" ativo, aparece com fade de 150 ms.
- `Toast` fica 16 px acima da `TabBar` (ou da área segura, sem barra).
- Só tema claro.

## 9. Acessibilidade

| ID | Requisito |
| -- | --------- |
| RNF-07 | Todo componente tocável tem `accessibilityRole` (`button`, `tab`, `switch`, `search`, `header`...) e `accessibilityLabel`; estados em `accessibilityState` (`selected`, `disabled`, `checked`, `busy`). |
| RNF-08 | Alvo de toque mínimo 44×44 pt; elementos menores (chips de 32, `Badge`) usam `hitSlop` até 44. |
| RNF-09 | `TextField` com erro anuncia a mensagem (`accessibilityHint` com o erro e `AccessibilityInfo.announceForAccessibility` ao aparecer). |
| RNF-10 | Ícones decorativos ficam ocultos do leitor de tela (`accessibilityElementsHidden` / `importantForAccessibility="no"`); ícones sozinhos em botão exigem `accessibilityLabel`. |
| RNF-11 | `Toast` é anunciado (`accessibilityLiveRegion="polite"` no Android; `announceForAccessibility` no iOS). |
| RNF-12 | Contraste de texto ≥ 4,5:1 e de componentes ≥ 3:1 com os tokens usados (verificado no catálogo). |

## 10. Estrutura de arquivos esperada

```
src/components/<Componente>.tsx            # um arquivo por componente de RF-01 a RF-15
src/components/<Componente>.test.tsx
src/components/icons/Icon.tsx              # mapa nome → SVG
src/components/icons/svg/*.tsx             # gerados (contornado e preenchido)
src/components/icons/LICENSE               # Apache 2.0 do Material Symbols
src/components/toast/ToastProvider.tsx
src/app/(tabs)/_layout.tsx                 # Tabs + TabBar por perfil
src/app/(tabs)/{agenda,board,leadership,notes,callings,profile,sign-in}.tsx   # re-export das telas
src/features/placeholder/ComingSoonScreen.tsx
src/app/index.tsx                          # alterar: Redirect para /agenda
src/app/dev/components.tsx                 # re-export do catálogo
src/features/dev/ComponentCatalogScreen.tsx
src/features/home/                         # remover
src/i18n/locales/*.json                    # chaves common.* e tabs.*
```

## 11. Critérios de aceitação

| ID | Cobre | Dado | Quando | Então |
| -- | ----- | ---- | ------ | ----- |
| CA-01 | RF-01 | um `Button` com `loading` | toco nele duas vezes | `onPress` não é chamado e `accessibilityState.busy` é `true` |
| CA-02 | RF-01 | um `Button` `disabled` | toco | `onPress` não é chamado e `accessibilityState.disabled` é `true` |
| CA-03 | RF-02, RNF-09 | um `TextField` com `error="Informe seu e-mail."` | renderizo | o texto aparece abaixo do campo e o campo expõe o erro ao leitor de tela |
| CA-04 | RF-03 | um `SearchField` com texto | toco no botão limpar | `onChangeText('')` é chamado |
| CA-05 | RF-04, RF-07 | um `FilterChip` e um `Segmented` | toco num item não selecionado | o callback recebe o valor e o item tem `accessibilityState.selected` quando selecionado |
| CA-06 | RF-05 | `UnitTag unitId="icara"` | renderizo | mostra `Içara` com as cores `units.icara` |
| CA-07 | RF-06 | `Badge` com 0, 5 e 150 | renderizo | nada, `5` e `99+` |
| CA-08 | RF-08, RF-09 | um `EventCard` e um `ListItem` com chevron | toco | `onPress` é chamado e o rótulo acessível contém título e subtítulo |
| CA-09 | RF-10 | nomes `Maria da Silva`, `Ângela`, ` joão  pedro ` | renderizo `Avatar` | `MS`, `Â`, `JP` |
| CA-10 | RF-11 | um `Switch` | toco | `onValueChange(!value)` e `accessibilityRole="switch"` |
| CA-11 | RF-12, RNF-11 | `useToast().show` chamado duas vezes | aguardo | só o segundo aparece e some após 4 s (6 s com ação) |
| CA-12 | RF-13 | `ScreenHeader showAvatar` com viewer logado `Maria Souza` | toco no avatar | navega para `/profile` |
| CA-13 | RF-14 | um `ConfirmSheet` aberto | toco no fundo | fecha sem confirmar |
| CA-14 | RF-15 | `OfflineBanner` | renderizo | mostra `Sem conexão. Mostrando a última versão salva.` |
| CA-15 | RF-16, RNF-04 | `Icon name="calendar_month"` com e sem `filled` | renderizo | SVGs diferentes; um nome fora da lista não compila (tipo) |
| CA-16 | RF-17, RF-18 | viewer `visitor`, `member` e `leader` | renderizo o layout de abas | as abas e a ordem batem com a tabela de RF-17; a ativa tem `accessibilityState.selected` |
| CA-17 | RF-19 | viewer `leader` na aba Chamados | o viewer muda para `member` | o app vai para `/agenda` |
| CA-18 | RF-20 | qualquer perfil | abro uma aba sem feature | vejo o título da aba e `Esta área chega em breve.`; `/` abre `/agenda` |
| CA-19 | RF-21, RNF-05 | build de produção | navego para `/dev/components` | sou redirecionado para `/agenda`; em dev, o catálogo mostra todos os componentes e ícones |
| CA-20 | RNF-01, RNF-02 | o código de `src/components` | rodo o lint e uma busca por `#[0-9A-Fa-f]{6}` e por texto literal em JSX | nenhuma cor literal; nenhum texto de UI literal |
| CA-21 | RNF-07, RNF-08, RNF-12 | o catálogo em aparelho, com VoiceOver/TalkBack e fonte em 1,6× | percorro todos os componentes | cada um é anunciado com papel e rótulo, nada é cortado e os alvos têm ≥ 44 pt |

## 12. Roteiro de QA

| Passo | Ação | Resultado esperado |
| ----- | ---- | ------------------ |
| 1 | `make dev` e abra o app | Abre na aba Agenda, barra de Visitante com 4 abas |
| 2 | Toque em cada aba | Título da aba e `Esta área chega em breve.` |
| 3 | Abra `/dev/components` | Todos os componentes e ícones, comparáveis lado a lado com o design |
| 4 | Ative VoiceOver (iOS) e TalkBack (Android) e percorra o catálogo | Papel e rótulo anunciados em cada item |
| 5 | Fonte do sistema no máximo e repita o passo 3 | Nada cortado; rótulos da barra limitados |
| 6 | Ative "Reduzir movimento" e abra um `Sheet` | Aparece com fade, sem deslizar |
| 7 | Gere o build de produção (`make build`) e tente `/dev/components` num preview | Redireciona para a Agenda |

## 13. Definition of Done

- [ ] `make check` passa (lint, tipos, testes, build)
- [ ] Todo `CA` tem teste automatizado com o ID no nome, ou justificativa de teste manual no plano (CA-21 é manual)
- [ ] Roteiro de QA executado sem divergências, em iOS e Android
- [ ] Registro de implementação preenchido no plano
- [ ] Nenhum segredo, dado pessoal ou log sensível introduzido (ver `.ai/docs/SECURITY.md`)
- [ ] `DESIGN_SYSTEM.md` com os caminhos reais na coluna "Onde está"

## 14. Decisões em aberto

Nenhuma decisão em aberto.

| # | Pergunta | Decisão | Origem |
| - | -------- | ------- | ------ |
| 3 | Como desenhar os ícones | SVGs do Material Symbols Rounded via `react-native-svg` | usuário |
| 4 | Skills | vercel-react-native-skills, ecc:react-testing, ecc:postgres-patterns, ecc:accessibility | usuário |
| 8 | Onde o Líder acessa o Perfil | Avatar no cabeçalho (`ScreenHeader showAvatar`) | usuário |
| A1 | Abas por perfil | Tabela do `TabBar.dc.html` do design | padrão do projeto |
| A2 | Onde fica `unit_publisher` | Barra do Membro (`viewerKind` = `member`) | padrão do projeto |
| A3 | Catálogo de componentes | `/dev/components` só em `__DEV__` | padrão do projeto |
| A4 | Tema escuro | Fora (design v1.0 só claro) | padrão do projeto |

## 15. Próximos passos (fora desta entrega)

- `auth-account` preenche as abas Entrar e Perfil.
- Cada feature substitui a tela provisória da sua aba.
