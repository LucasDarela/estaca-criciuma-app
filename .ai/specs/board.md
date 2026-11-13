# Mural de avisos

> **Status:** Pronta para planejamento
> **Área:** aba `board`, rotas `/board/[id]`, `/board/new`, `/board/[id]/edit`, `src/features/board/`, `supabase/migrations/`, bucket `post-images`
> **Última atualização:** 2026-11-13

## 0. Skills obrigatórias

| Skill | Quando usar |
| ----- | ----------- |
| `vercel-react-native-skills` | Lista com imagens, seleção e compressão de foto |
| `ecc:postgres-patterns` | Tabela `posts`, índice de fixado único, políticas do Storage |
| `ecc:accessibility` | Texto alternativo, cards e formulário |
| `ecc:react-testing` | Ordem do mural, validade, formulário |

## 1. Contexto

Comunicados (batismos, projetos de serviço, conferências) circulam em grupos de mensagem e se perdem. O mural reúne os avisos públicos da estaca e das unidades (RN-01), com destaque para o mais importante de cada unidade e validade para não acumular avisos vencidos. Publicar segue RN-02; avisar por push segue RN-08.

## 2. Objetivo

Qualquer pessoa vê no Mural os avisos válidos, com o fixado de cada unidade no topo, filtra por unidade e abre o aviso; quem pode publicar cria, edita, fixa e exclui avisos da sua unidade, com uma foto opcional e aviso por push.

## 3. Estado atual

| Item | Situação | Destino |
| ---- | -------- | ------- |
| Aba `board` | Tela provisória (`design-system`) | Substituir |
| Cache persistido público, `OfflineBanner` | `calendar` | Usar (chaves `['public','posts',...]`) |
| `AudiencePicker`, `sendPush` | `push-notifications` | Usar |
| Tabela de avisos e Storage | Não existem | Criar |

## 4. Tecnologias e versões

| Tecnologia | Versão | Situação | Uso nesta entrega |
| ---------- | ------ | -------- | ----------------- |
| `expo-image-picker` | do SDK 58 | adicionar | Galeria e câmera |
| `expo-image-manipulator` | do SDK 58 | adicionar | Redimensionar para 1600 px e converter para JPEG |
| `expo-image` | do SDK 58 | adicionar | Exibir com cache |
| Supabase Storage | do stack | via CLI | Bucket `post-images` |

## 5. Restrições e requisitos não funcionais

| ID | Requisito |
| -- | --------- |
| RNF-01 | Escrita em `posts` e no bucket só com `can_publish(unit_id)`; caminho da imagem `{unit_id}/{post_id}.jpg`. |
| RNF-02 | Imagem: jpeg/png/webp de entrada; enviada como JPEG qualidade 0,8, lado maior 1600 px, até 5 MB (o bucket rejeita acima). |
| RNF-03 | Avisos encerrados (`visible_until` antes de hoje) não são retornados para `anon` nem para quem não pode publicar na unidade. |
| RNF-04 | No máximo 1 aviso fixado por unidade (índice único parcial). |
| RNF-05 | Logs `post_created`, `post_updated`, `post_deleted` só com ids. |
| RNF-06 | Permissões de galeria/câmera pedidas só ao tocar em `Adicionar foto`. |

## 6. Escopo

### 6.1 Incluso

- Tabela `posts` e bucket `post-images` com RLS; seed com avisos de exemplo.
- Aba Mural: fixados no topo, lista, filtro por unidade, offline.
- Detalhe do aviso.
- Criar, editar, excluir, fixar e definir validade; 1 foto opcional com texto alternativo; `Notificar`.
- Seção `Encerrados` para quem pode publicar.

### 6.2 Não incluso

- Comentários, curtidas, reações (RN-11).
- Mais de uma foto; vídeo; anexos.
- Agendar publicação para o futuro.

## 7. Especificação funcional

### 7.1 Dados

| ID | Requisito |
| -- | --------- |
| RF-01 | `posts`: `id`, `unit_id`, `title` (1–80), `body` (1–1000), `image_path null`, `image_alt` (obrigatório com imagem, 1–200), `pinned bool`, `visible_until date null`, `created_by null`, `created_at`, `updated_at`. |

### 7.2 Mural

| ID | Requisito |
| -- | --------- |
| RF-02 | Cabeçalho `Mural`, botão `tune` (filtro), botão `add` (só com `publishableUnits`), avatar quando logado. |
| RF-03 | Ordem: fixados primeiro (Estaca antes das unidades, depois `unitOrder`), depois os demais por `created_at` decrescente. Paginação de 20 em 20 ao rolar. |
| RF-04 | Fixado: card `primary`, overline `FIXADO · {UNIDADE}` com ícone `push_pin`, título serif 21, texto (até 4 linhas). |
| RF-05 | Card comum: foto (16:9, se houver), `UnitTag`, tempo (`agora`, `há {n} min`, `há {n} h`, `ontem`, `{d} {mês abreviado}`), título, texto (até 3 linhas). Tocar abre `/board/[id]`. |
| RF-06 | Filtro `tune` abre `Sheet` `Filtrar por unidade` com `Todas` + 7 unidades; com filtro ativo, o botão fica `primary` e aparece o chip `{unidade}` com `close` acima da lista. |
| RF-07 | Vazio: `Nenhum aviso no momento.` (com filtro: `Nenhum aviso desta unidade no momento.`). Erro sem cache: `Não foi possível carregar o mural.` + `Tentar de novo`. Offline com cache: `OfflineBanner`. |
| RF-08 | Para quem pode publicar: seção `Encerrados` no fim, com os avisos vencidos das suas unidades e a etiqueta `Encerrado`. |

### 7.3 Detalhe

| ID | Requisito |
| -- | --------- |
| RF-09 | `/board/[id]`: foto em largura total (toque abre em tela cheia), `UnitTag`, data `{d} de {mês} de {aaaa}`, título serif 26, texto completo (links `https://` tocáveis), `Exibir até {d} de {mês}` quando houver validade. Com permissão: `Editar`, `Excluir`. Inexistente: `Este aviso não está mais disponível.` + `Ver mural`. |

### 7.4 Formulário

| ID | Campo | Regra | Mensagem |
| -- | ----- | ----- | -------- |
| RF-10 | `Unidade` | `publishableUnits` | — |
| RF-11 | `Título` | Obrigatório, `trim`, 1–80 | `Informe o título do aviso.` / `Use até 80 caracteres.` |
| RF-12 | `Texto` | Obrigatório, `trim`, 1–1000, contador `{n}/1000` | `Escreva o aviso.` / `Use até 1000 caracteres.` |
| RF-13 | `Foto` (botão `Adicionar foto` → `Escolher da galeria` / `Tirar foto`; com foto: `Trocar foto`, `Remover foto`) e `Descrição da foto` | Descrição obrigatória com foto, 1–200; arquivo final ≤ 5 MB | `Descreva a foto para quem usa leitor de tela.` / `A foto é grande demais. Escolha outra.` |
| RF-14 | `Fixar no topo do mural` | Se já há fixado na unidade, ao salvar ele é desafixado; aviso abaixo do campo: `"{título do fixado atual}" deixará de ficar fixado.` | — |
| RF-15 | `Exibir até` (opcional, seletor de data, botão `Sem data`) | Data ≥ hoje | `Escolha hoje ou uma data futura.` |
| RF-16 | `Notificar` + `AudiencePicker` | Igual a `event-form` RF-10 (marcado ao criar, desmarcado ao editar) | `Selecione ao menos um grupo para enviar a notificação.` |

| ID | Requisito |
| -- | --------- |
| RF-17 | Cabeçalho `Cancelar` · `Novo aviso`/`Editar aviso` · `Publicar`/`Salvar`. Sucesso: `Aviso publicado`, `Aviso salvo` ou `Aviso publicado e enviado`; volta ao detalhe. Envio de foto mostra `Enviando foto...` no botão. |
| RF-18 | Excluir: `ConfirmSheet` `Excluir aviso?` / `"{título}" será removido do mural. Não dá para desfazer.` / `Excluir` / `Cancelar`. Remove a foto do Storage; toast `Aviso excluído.` |
| RF-19 | Descartar alterações: igual a `event-form` RF-13. |

### 7.5 Casos de borda

| Situação | Comportamento |
| -------- | ------------- |
| Upload da foto falha | Aviso não é salvo; toast `Não foi possível enviar a foto. Tente de novo.` |
| Aviso vence com o app aberto | Some na próxima atualização (mudança de dia ou ao puxar para atualizar) |
| Dois líderes fixam avisos da mesma unidade ao mesmo tempo | O último a salvar fica fixado (o banco desafixa o anterior na mesma transação) |
| Permissão de câmera/galeria negada | Toast `Permita o acesso às fotos nas configurações do celular.` |
| Foto sem descrição | `Publicar` desabilitado com a mensagem de RF-13 |

## 8. Especificação de UI/UX

- Como "Mural · público" do design: cards brancos raio 18 com borda `border`; fixado `primary` com texto `onPrimary`/`onPrimaryMuted`.
- Puxar para atualizar na lista.
- Formulário no mesmo padrão visual do `event-form` (blocos brancos raio 16).

## 9. Acessibilidade

| ID | Requisito |
| -- | --------- |
| RNF-07 | Imagens com `accessibilityLabel` = `image_alt`. |
| RNF-08 | Card anuncia `Fixado` quando for o caso, unidade, tempo e título. |
| RNF-09 | Contador de caracteres anunciado só ao passar de 900. |
| RNF-10 | Links no texto são alcançáveis pelo leitor de tela como links. |

## 10. Estrutura de arquivos esperada

```
supabase/migrations/<ts>_posts.sql             # tabela, índice de fixado, RLS, bucket e políticas do Storage, função de fixar
supabase/tests/posts.test.sql
supabase/seed.sql                              # alterar: avisos de exemplo (1 fixado da Estaca)
src/domain/board.ts (+ test)                   # ordem, validade, tempo relativo
src/features/board/BoardScreen.tsx, PostCard.tsx, PinnedPostCard.tsx, PostDetailScreen.tsx, PostFormScreen.tsx, UnitFilterSheet.tsx (+ testes)
src/features/board/api.ts                      # listagem paginada, CRUD, upload
src/app/(tabs)/board.tsx, src/app/board/[id].tsx, src/app/board/new.tsx, src/app/board/[id]/edit.tsx
src/i18n/locales/*.json                        # board.*
```

## 11. Critérios de aceitação

| ID | Cobre | Dado | Quando | Então |
| -- | ----- | ---- | ------ | ----- |
| CA-01 | RF-01, RNF-01 | `publicador.icara` | insere aviso em `criciuma1` pela API | negado |
| CA-02 | RF-03, RF-04 | fixados da Estaca e de Içara e 3 avisos comuns | abro o Mural | Estaca fixado, Içara fixado, depois os comuns do mais novo ao mais antigo |
| CA-03 | RF-05 | aviso de 2 h atrás com foto | olho o card | foto, `UnitTag`, `há 2 h`, título e 3 linhas |
| CA-04 | RF-06 | filtro `Ala Içara` | aplico | só avisos de Içara e o chip `Ala Içara` com `close` |
| CA-05 | RF-07 | nenhum aviso | abro | `Nenhum aviso no momento.` |
| CA-06 | RF-08, RNF-03 | aviso de Içara vencido ontem | visitante e `publicador.icara` abrem o Mural | o visitante não vê; o publicador vê em `Encerrados` com a etiqueta |
| CA-07 | RF-09 | aviso com validade e link | abro o detalhe | `Exibir até ...` e o link abre no navegador |
| CA-08 | RF-11, RF-12 | formulário novo | publico vazio | mensagens de título e texto |
| CA-09 | RF-13, RNF-02 | foto de 4000×3000 | escolho e publico | Storage recebe JPEG com lado maior 1600 px |
| CA-10 | RF-13 | foto sem descrição | tento publicar | `Descreva a foto para quem usa leitor de tela.` |
| CA-11 | RF-14, RNF-04 | Içara já tem fixado `A` | publico `B` fixado | aviso de RF-14 no formulário; depois só `B` está fixado |
| CA-12 | RF-15 | `Exibir até` ontem | salvo | `Escolha hoje ou uma data futura.` |
| CA-13 | RF-16, RF-17 | `Notificar` com `Todos da ala` | publico | `Aviso publicado e enviado` e `sendPush({kind:'post'})` |
| CA-14 | RF-18 | aviso com foto | excluo | aviso e foto removidos; `Aviso excluído.` |
| CA-15 | RF-19 | formulário alterado | `Cancelar` | `Descartar alterações?` |
| CA-16 | RF-07 | Mural carregado e modo avião | reabro | avisos e `OfflineBanner` |
| CA-17 | 7.5 | upload falha | publico | aviso não salvo e `Não foi possível enviar a foto. Tente de novo.` |
| CA-18 | RNF-07 a RNF-10 | Mural com VoiceOver/TalkBack | navego | descrição da foto, `Fixado` e links anunciados |
| CA-19 | RF-02, RF-10 | visitante e `publicador.icara` | abrem o Mural e, o publicador, o formulário | só o publicador vê o botão `add`; o campo `Unidade` lista só `Ala Içara` |

## 12. Roteiro de QA

| Passo | Ação | Resultado esperado |
| ----- | ---- | ------------------ |
| 1 | Visitante abre o Mural | Fixados no topo, depois avisos |
| 2 | Filtra `Ramo Gaivota` | Só avisos do ramo |
| 3 | `publicador.icara`: novo aviso com foto da câmera, descrição, fixado, validade amanhã, notificar | Publicado; push chega; aparece fixado |
| 4 | Edita e desmarca `Fixar` | Volta para a lista comum |
| 5 | Muda a data do aparelho para depois da validade | Some para o visitante; aparece em `Encerrados` para o publicador |
| 6 | Exclui | Some do mural |
| 7 | Modo avião | Cache + banner |

## 13. Definition of Done

- [ ] `make check` e `make test-db` passam
- [ ] Todo `CA` tem teste automatizado com o ID no nome, ou justificativa de teste manual no plano (CA-18 manual)
- [ ] Roteiro de QA executado sem divergências em iOS e Android
- [ ] Registro de implementação preenchido no plano
- [ ] Nenhum segredo, dado pessoal ou log sensível introduzido (ver `.ai/docs/SECURITY.md`)
- [ ] `app.config.ts` com textos de permissão de câmera e galeria (`Para adicionar fotos aos avisos do mural.`)

## 14. Decisões em aberto

Nenhuma decisão em aberto.

| # | Pergunta | Decisão | Origem |
| - | -------- | ------- | ------ |
| 10 | Offline | Cache público persistido | usuário |
| 17 | Foto | 1 opcional, 1600 px, até 5 MB, descrição obrigatória | usuário |
| 18 | Fixar e validade | 1 fixado por unidade; `Exibir até` opcional; vencidos visíveis para quem publica | usuário |
| A1 | Limites | Título 80, texto 1000 | padrão do projeto |
| A2 | Paginação | 20 por página | padrão do projeto |
| A3 | Botão de criar | `add` no cabeçalho, ao lado de `tune` | padrão do projeto |

## 15. Próximos passos (fora desta entrega)

- Agendar publicação; várias fotos.
