# Design system

Fonte de verdade visual: projeto **Design System** no claude.ai/design (`Design System.dc.html`, v1.0, nov/2026). Fonte de verdade dos **valores**: `src/theme/theme.ts`. Este doc diz onde estão e como usar, para que o agente não invente cores e espaçamentos.

> Estado: tokens e componentes implementados em `src/components/` (spec `design-system`). Catálogo visual em `/dev/components` (só em `__DEV__`). Todo texto dos componentes vem do i18n (pt-BR, en-US, es-MX); nomes de unidades não são traduzidos.

## Base

| Item | Valor |
| ---- | ----- |
| Plataforma | React Native (Expo) · iOS + Android |
| Biblioteca de componentes | Própria (ver "Componentes") |
| Arquivo de tokens / tema | `src/theme/theme.ts` |
| Ícones | Material Symbols Rounded, 24 px, peso 400. Ativo = preenchido (`FILL 1`), inativo = contornado. SVGs de `@material-symbols/svg-400` (devDependency) convertidos por `npm run icons` em `src/components/icons/glyphs.ts` e desenhados com `react-native-svg` pelo componente `Icon`. Licença Apache 2.0 em `src/components/icons/LICENSE` |
| Fontes | Noto Serif (substitui McKay Pro) e Noto Sans (substitui Zoram), via `@expo-google-fonts/*`. Noto Sans Mono só em material técnico |
| Temas suportados | Claro (escuro não está no design v1.0) |

## Regras de uso

- Use apenas tokens do tema; nenhum valor de cor, espaçamento ou raio escrito à mão. A paleta crua `colors` só é usada dentro de `theme.ts`.
- Antes de criar um componente, procure um existente na biblioteca e no projeto.
- Componente novo reutilizável vai para a pasta de componentes compartilhados com variantes documentadas aqui.
- Uma ação principal por tela (um único `Button` primário).
- Cor de destaque com moderação; muito espaço em branco, azuis e neutros claros.
- Cor de unidade (`units.*.dot`) só como marcador (ponto, barra). Texto de etiqueta usa sempre `units.*.text` (contraste AA).
- Respeite Dynamic Type / escala de fonte do Android (`allowFontScaling`); rótulos da TabBar com `maxFontSizeMultiplier = maxFontScale.tabLabel` (1.6).
- Alvos de toque mínimos: 44×44 pt (iOS) / 48×48 dp (Android) — `size.touchMin*`.

### Marca

- O símbolo e o logotipo da Igreja **não** são usados sem aprovação do Escritório de Identidade Visual (VIO). O app usa a **assinatura tipográfica**: "Estaca Criciúma" em Noto Serif 600 + "SANTA CATARINA · BRASIL" (sans 600, 12, tracking 2.4).
  - Positiva: Azul 35 sobre branco. Invertida: branco sobre Azul 35 (subtítulo `#D6EBF1`).
- Monograma "EC" em Noto Serif 600, branco sobre Azul 35. iOS: cantos 26/112; Android adaptativo: círculo. Ícone de push: mono (`notifications`).
- Nunca usar a pedra de esquina, o arco do *Christus* ou formas que lembrem o símbolo.
- Splash: fundo Azul 35, assinatura invertida centralizada ligeiramente acima do centro (47/53).

### Voz (copy)

| Faça | Evite |
| ---- | ----- |
| "A Igreja de Jesus Cristo dos Santos dos Últimos Dias" na primeira menção; depois "a Igreja" | "SUD", "LDS", "mórmon" |
| "Membros da Igreja", "santos dos últimos dias" | Fontes decorativas para o nome da Igreja |
| "Jesus Cristo" sempre na mesma linha (use espaço não separável) | Empilhar/estilizar o nome imitando o símbolo |
| Convites: "Venha participar", "Todos são bem-vindos" | Tom urgente: "Imperdível!", "Últimas vagas!!!" |

Sem gamificação, curtidas ou contadores de popularidade. Datas e locais sempre explícitos.

## Tokens

Valores em `src/theme/theme.ts`. "Derivado" = criado para UI digital; validar com o arquivo oficial do VIO.

| Token (`theme.*`) | Base | Uso |
| ----------------- | ---- | --- |
| `primary` | Azul 35 `#005175` | Ação principal, item ativo, cor da marca |
| `primaryPressed` | Azul 40 | Estado pressionado do primário |
| `primarySubtle` | Azul 5 (derivado) | Botão secundário, avatar, notificação não lida, anel de foco |
| `link` / `info` | Azul 30 | Links e informação |
| `success` / `successSubtle` | Verde 40 | Confirmação, status "Aprovado" |
| `warning` / `warningText` / `warningSubtle` | Amarelo 20 / 40 | Avisos; texto sempre em `warningText` |
| `danger` / `dangerSubtle` | Vermelho 20 | Ações destrutivas, erros, badge de contagem |
| `heading` | Azul 40 | Títulos grandes em serifa |
| `text` | Neutro 50 | Texto principal |
| `textBody` | `#3A3D40` | Parágrafos longos |
| `textMuted` | Neutro 40 | Secundário, legendas |
| `textSubtle` | `#6B6F73` | Timestamps, placeholder, ícone inativo |
| `textDisabled` | Neutro 30 | Texto de controle inativo |
| `bg` / `surface` | Neutro 5 / branco | Fundo de tela / cards e barras |
| `surfaceMuted` | `#F0F2F2` | SearchField, botão de ícone neutro |
| `surfaceDisabled` | `#ECEEEE` | Botão inativo, trilho do Segmented |
| `border` / `borderStrong` / `divider` | `#E3E5E5` / Neutro 10 / `#EEF0F0` | Borda de card / botão secundário e chip / separador de lista |
| `toastBg` / `toastAccent` | Neutro 50 / Azul 10 | Toast in-app |

Tokens de `size` e `type` adicionados por `auth-account` (todos derivados): `size.codeBoxWidth` 48 e `size.codeBoxHeight` 56 (caixa de um dígito do código), `size.checkbox` 24 (caixa de consentimento), `size.checkboxForm` 22 e `radius.checkbox` 6 (checkbox de formulário), `size.fab` 56 e `radius.fab` 18 (botão flutuante `+` da Agenda), `type.signatureName` (serifa 26/32) e `type.signatureTagline` (sans 12/16, espaçamento 2.4) da assinatura tipográfica da tela Entrar.

### Cores das unidades (`units`)

| Unidade | `dot` | `tint` | `text` |
| ------- | ----- | ------ | ------ |
| Estaca | Azul 35 | `#E6F2F5` | Azul 35 |
| Ala Criciúma 1 | Azul 30 | `#E3F3F8` | `#00607F` |
| Ala Criciúma 2 | Verde 40 | `#E7F0EA` | Verde 40 |
| Ala Criciúma 3 | Amarelo 20 | `#FDEEDF` | Amarelo 40 |
| Ala Içara | Vermelho 20 | `#F8E3EC` | `#9A0047` |
| Ala Araranguá | Verde 20 | `#EDF6E7` | Verde 40 |
| Ramo Gaivota | Vermelho 40 | `#F3E4EA` | Vermelho 40 |

Ordem de exibição: `unitOrder`.

## Escala de espaçamento e tipografia

**Espaçamento** (`space`, base 4): `xs 4` · `sm 8` · `md 12` · `lg 16` (margem lateral de tela) · `xl 24` (entre seções) · `xxl 32`.

**Raios** (`radius`): `tag 6` · `input 12` · `button 14` · `card 16` · `sheet 24` · `pill 999`.

**Elevação** (`elevation`): `0` plano + borda `theme.border` (padrão) · `1` cards elevados, push in-app · `2` bottom sheet, modal.

**Tipografia** (`type`) — serifa para títulos e reflexão; sem serifa para interface e leitura:

| Estilo | Tamanho/linha | Família | Uso |
| ------ | ------------- | ------- | --- |
| `display` | 34/40 | Serif 600 | Título de destaque |
| `title` | 26/32 | Serif 600 | Título de tela (cabeçalho usa 28) |
| `headline` | 20/26 | Sans 600 | Cabeçalho de grupo (ex.: data) |
| `body` | 16/24 | Sans 400 | Corpo |
| `callout` | 15/22 | Sans 600 | Local, destaque curto |
| `caption` | 13/18 | Sans 500 | Metadados |
| `overline` | 11/14 +1.2 | Sans 700, maiúsculas | Rótulo de seção (cor `primary`) |
| `reading` | 16/26 | Serif 400 | Texto de anotação |
| `button` | 16/22 | Sans 600 | Rótulo de botão |
| `tabLabel` | 10.5/14 | Sans 500 (700 ativo) | Rótulo da TabBar |

## Componentes

Medidas vêm de `size`, `radius`, `space`, `stroke` e `motion`. Valores que o design usa e que não tinham nome entraram em `theme.ts` com o comentário `derived`.

| Componente | Onde está | Variantes | Observações |
| ---------- | --------- | --------- | ----------- |
| `Button` | `src/components/Button.tsx` | `primary` (fundo `primary`, pressionado `primaryPressed`), `secondary` (`primarySubtle` + texto `primary`), `outline` (borda 1.5 `borderStrong`), `ghost` (texto `primary`), `danger`, `disabled` (`surfaceDisabled` + `textDisabled`); tamanhos `default` 52 e `compact` 44 | Raio 14 (compact 12). Rótulo `type.button` (compact 15) |
| `TextField` | `src/components/TextField.tsx` | `default`, `focused` (borda 1.5 `primary` + anel 4 `focusRing`), `error` (borda `danger` + mensagem 12.5 `danger` abaixo) | Altura 52, raio 12, padding 14. Rótulo 13/600 acima, gap 6 |
| `SearchField` | `src/components/SearchField.tsx` | `default` 44, `compact` 40 | Fundo `surfaceMuted`, sem borda, ícone `search` 20, placeholder `textSubtle` |
| `FilterChip` | `src/components/FilterChip.tsx` | `selected` (fundo `primary`, texto branco), `unselected` (borda 1 `borderStrong`) | Altura 36, pill, ponto 8 da cor da unidade. `role="radio"` para escolha única dentro de um `ChipGroup` (RNF-07) |
| `UnitTag` | `src/components/UnitTag.tsx` | uma por `UnitId` | Padding 3×8, raio 6, 12/700, `units[id].tint` + `units[id].text` |
| `StatusTag` | `src/components/StatusTag.tsx` | `neutral`, `info`, `success`, `warning` | Mesma forma da `UnitTag` |
| `Badge` | `src/components/Badge.tsx` | contagem | Mín. 20×20, pill, `danger` + branco, 11.5/700 |
| `Segmented` | `src/components/Segmented.tsx` | 2–3 opções, com ou sem ícone | Trilho `surfaceDisabled` padding 3 raio 12; opção ativa branca, raio 9, sombra leve, 600 |
| `EventCard` | `src/components/EventCard.tsx` | — | Borda `border`, raio 16, padding 14. Barra lateral 4 px `units[id].dot`; horário 13/600 `primary`; título 16/600; local 13 `textMuted` com ícone `location_on`; `UnitTag`. Toque abre detalhe (mapa, "Adicionar à agenda", "Compartilhar") |
| `ListItem` | `src/components/ListItem.tsx` | com avatar, ícone ou ponto de unidade; com chevron, `check`, carregando, contagem ou `Switch`; `selected` marca a opção escolhida de uma lista | Padding vertical 10–12, separador `divider`; título 15/600, subtítulo 13 `textMuted`; chevron `iconMuted` |
| `Avatar` | `src/components/Avatar.tsx` | `small` 36 (cabeçalho, mesmas cores do `default`), `default` 44 (`primarySubtle` + iniciais `primary`), `large` 64 (`primary` + iniciais em serifa branca) | Iniciais, sem foto no v1.0 |
| `Switch` | `src/components/Switch.tsx` | on (`primary`), off (`borderStrong`) | 51×31 (compacto 46×28), polegar branco |
| `Checkbox` | `src/components/Checkbox.tsx` | marcado (`primary` + `check` branco), desmarcado (borda 1.5 `borderStrong`), `disabled` | Caixa 22, raio 6; rótulo `listTitle` e dica `caption` `textMuted`; papel `checkbox` |
| `ChipGroup` | `src/components/ChipGroup.tsx` | `radiogroup` (escolha única) ou `list` | Rótulo de campo acima dos chips, gap 8 |
| `Toast` | `src/components/toast/ToastProvider.tsx` (`ToastProvider`, `useToast`) | sucesso com ação | Fundo `toastBg`, raio 14, ícone e ação em `toastAccent`. Ex.: "Anotação salva · Desfazer" |
| `TabBar` | `src/components/TabBar.tsx` | por perfil (abaixo) | Altura 84 com área segura, fundo `surface`, borda superior `border`. Ativo: `primary`, ícone preenchido, rótulo 700. Inativo: `textSubtle`, contornado, 500. Máx. 5 destinos, ícone + rótulo sempre visíveis |
| `ScreenHeader` | `src/components/ScreenHeader.tsx` | título grande + ação circular 44 (`primary` com `add`, ou `surfaceMuted`); com voltar | Fundo `surface`, borda inferior `border`, título serif 28/600. Com `showAvatar`, mostra `Avatar` `small` do viewer (via `HeaderAvatarProvider`) que abre `/profile` |
| `Icon` | `src/components/icons/Icon.tsx` | contornado (padrão) e preenchido (`filled`); tamanho padrão 24 | Nomes em `icons/glyphs.ts` (tipo `IconName`). Sempre oculto do leitor de tela: o elemento tocável dá o rótulo |
| `EmptyState` | `src/components/EmptyState.tsx` | ícone e ação opcionais | Borda tracejada `borderStrong`, raio 14 |
| `OfflineBanner` | `src/components/OfflineBanner.tsx` | — | Faixa `warningSubtle` com `common.offline`, `accessibilityRole="alert"` |
| `Skeleton` | `src/components/Skeleton.tsx` | largura, altura e raio | Bloco `surfaceDisabled` |
| `UnitPickerSheet` | `src/components/UnitPickerSheet.tsx` | escolha única de unidade, com opção "nenhuma" no topo | `Sheet` com `ListItem` (ponto de cor da unidade, `check` na escolhida). Não importa `features/` nem `lib/` |
| `Sheet` / `ConfirmSheet` | `src/components/Sheet.tsx`, `src/components/ConfirmSheet.tsx` | `Sheet` livre; `ConfirmSheet` com `primary` ou `danger` | Modal com alça, sobe acima do teclado no iOS, raio 24 no topo, fundo `scrim`; fecha ao tocar no fundo ou arrastar para baixo; `heightRatio` fixa a altura como fração da janela (ex.: 0,82 na pauta da reunião). Entra em 250 ms; com "Reduzir movimento", fade de 150 ms |

### TabBar por perfil

| Perfil | Abas |
| ------ | ---- |
| Visitante | Agenda (`calendar_month`) · Mural (`campaign`) · Liderança (`account_tree`) · Entrar (`login`) |
| Membro | Agenda · Mural · Liderança · Anotações (`edit_note`) · Perfil (`account_circle`) |
| Líder | Agenda · Mural · Liderança · Anotações · Chamados (`assignment_ind`) |

### Regras verificadas por teste

`src/components/designRules.test.ts` falha se um componente tiver cor literal (`#RRGGBB`, `rgb(`) ou texto de UI literal entre tags JSX. Componentes não importam `features/`, `lib/` nem Supabase; o avatar do cabeçalho e as abas por perfil entram por contexto e por `src/features/navigation/`.

### Telas de referência (seção 07 do design)

Agenda (mês/semana/dia, filtros por unidade, tipo e busca), Novo evento (com pauta para reuniões), Mural, Liderança (organograma), Minhas anotações (lembrete/texto/desenho), Chamados (restrito por papel) e Notificações. Cada uma vira uma feature com spec própria (`/create-spec`); use o design como referência visual.
