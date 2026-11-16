# Notificações push e histórico

> **Status:** Em implementação
> **Área:** rota `/notifications`, seção `Avisos` do Perfil, `src/features/notifications/`, `src/lib/push.ts`, `src/lib/reminderLog.ts`, `src/domain/audience.ts`, `src/components/AudiencePicker.tsx`, `supabase/functions/register-device`, `supabase/functions/send-push`
> **Última atualização:** 2026-11-15

## 0. Skills obrigatórias

| Skill | Quando usar |
| ----- | ----------- |
| `vercel-react-native-skills` | `expo-notifications`, navegação ao tocar na notificação, lista do histórico |
| `ecc:postgres-patterns` | Tabelas de dispositivos, notificações, entregas e leituras; RPC do histórico; RLS |
| `ecc:accessibility` | Histórico, interruptores e seletor de público |
| `ecc:react-testing` | Testes de telas, do seletor de público e das regras de destinatários |

## 1. Contexto

Avisos importantes hoje se perdem em grupos de mensagem. O push leva eventos e avisos do mural para quem se interessa, segmentado por unidade (RN-09) e por público escolhido por quem publica (RN-08). Visitantes sem conta também podem receber avisos (decisão 14). As specs `event-form` e `board` disparam o envio usando o que esta spec entrega.

## 2. Objetivo

O aparelho (com ou sem conta) se registra para receber push das unidades escolhidas, quem publica envia avisos segmentados por público, a pessoa vê os últimos 90 dias na tela Notificações (com lembretes das anotações mesclados), marca como lidos e é levada ao item ao tocar.

## 3. Estado atual

| Item | Situação | Destino |
| ---- | -------- | ------- |
| Sino na Agenda e rota `/notifications` provisória | `calendar` | Alterar: ponto de não lidas e tela real |
| `profiles.organizations`, `memberships.leadership_group` | `app-foundation` | Usar para destinatários |
| Perfil | `auth-account` | Alterar: seção `Avisos` |
| `export_my_data`, `delete_my_account` | `auth-account` (exporta perfil e papéis) | Alterar `export_my_data` para incluir tokens e preferências de push (decisão 16 de `auth-account`); a exclusão já cobre pelo `on delete cascade` |
| `units`, `can_publish` | `app-foundation` | Usar na Edge Function |
| Projeto EAS | Não vinculado (`eas init` pendente) | Pré-requisito: `projectId` em `app.config.ts` para o token Expo |

## 4. Tecnologias e versões

| Tecnologia | Versão | Situação | Uso nesta entrega |
| ---------- | ------ | -------- | ----------------- |
| `expo-notifications` | do SDK 58 | adicionar | Permissão, token, recebimento, toque |
| `expo-device` | do SDK 58 | adicionar | Só registra em aparelho físico |
| Supabase Edge Functions (Deno) | do stack | via CLI | `register-device` e `send-push` |
| Expo Push API | v2 | serviço externo | Envio em lotes de 100 |
| `pg_cron` | do stack | habilitar | Limpeza diária |

## 5. Restrições e requisitos não funcionais

| ID | Requisito |
| -- | --------- |
| RNF-01 | O conteúdo do push nunca tem dado sensível: só título e data/hora/local de evento, ou título e 1ª linha de aviso público. |
| RNF-02 | `register-device` aceita no máximo 10 registros por IP por hora; acima, responde 429 e o app tenta de novo na próxima abertura. |
| RNF-03 | `send-push` revalida no servidor: autenticado, `can_publish(unit do item)`, público válido para a unidade e no máximo 1 envio por item a cada 10 min (429 `Aguarde 10 minutos para avisar de novo sobre este item.`). |
| RNF-04 | Token removido quando a Expo Push API devolve `DeviceNotRegistered` e após 180 dias sem `last_seen_at` (job diário). |
| RNF-05 | Notificações, entregas e leituras com mais de 90 dias são excluídas pelo job diário. |
| RNF-06 | Logs: `device_registered` (com/sem conta), `push_dispatched` (item, total de destinatários), `push_dispatch_failed` (código do erro). Nunca o token completo, e-mail ou nome. |
| RNF-07 | A service role key só existe nos secrets das Edge Functions. |
| RNF-08 | O histórico de visitante é lido pelo próprio token do aparelho; nenhum outro aparelho consegue ler o histórico de outro token. |

## 6. Escopo

### 6.1 Incluso

- Tabelas `push_devices`, `notifications`, `notification_deliveries`, `notification_reads` e RLS.
- Edge Functions `register-device` e `send-push`; job diário de limpeza.
- Pedido de permissão e registro do token (visitante e logado); token passa para a conta ao entrar.
- Preferências por unidade (tela Notificações) e grupos acompanhados (Perfil › Avisos).
- Tela Notificações: histórico de 90 dias, não lidas, `Ler todas`, ponto no sino.
- Mescla local dos lembretes de anotações (`reminderLog`).
- `AudiencePicker` e `sendPush()` para uso em `event-form` e `board`.
- Toque na notificação abre o item.

### 6.2 Não incluso

- O botão `Notificar` nos formulários (fica em `event-form` e `board`, usando o `AudiencePicker`).
- Agendar e disparar lembretes de anotações (`notes`; esta spec só lê o `reminderLog`).
- Push por e-mail ou SMS; agendamento de envio para outra data.
- Painel com estatísticas de entrega.

## 7. Especificação funcional

### 7.1 Dados

| ID | Requisito |
| -- | --------- |
| RF-01 | `push_devices`: `token text pk`, `user_id uuid null` → `profiles on delete set null`, `platform` (`ios` \| `android`), `locale`, `units text[]` (unidades assinadas), `last_seen_at`, `created_at`. Sem acesso direto do app: só por `register-device` e pelas RPCs de RF-04. |
| RF-02 | `notifications`: `id`, `kind` (`event` \| `post`), `item_id uuid`, `unit_id`, `audience text[]`, `title`, `body`, `event_starts_at` e `event_location` (só evento; o histórico monta o corpo no idioma do app, decisão P2), `sent_by`, `created_at`. `notification_deliveries`: (`notification_id`, `device_token`, `user_id null`). `notification_reads`: (`notification_id`, `user_id`, `read_at`), só o dono lê e escreve. |
| RF-03 | Padrão de `units` no registro: visitante `['estaca']`; logado `['estaca', home_unit_id]` (ou só `['estaca']` sem unidade). |
| RF-04 | RPCs: `my_notifications(p_device_token text)` → notificações dos últimos 90 dias entregues a esse token ou a qualquer token de `auth.uid()`, com `read` (logado); `set_device_units(p_device_token, p_units text[])`; `mark_notifications_read(p_ids uuid[] \| null)` (nulo = todas). |

### 7.2 Registro e permissão

| ID | Requisito |
| -- | --------- |
| RF-05 | Logado: ao concluir `/welcome`, abre um `Sheet` `Receber avisos?` / `Avisamos sobre eventos e comunicados da estaca e da sua ala. Você escolhe o que receber em Notificações.` / `Ativar avisos` / `Agora não`. `Ativar avisos` pede a permissão do sistema e registra o token. |
| RF-06 | Visitante: a tela Notificações mostra o card `Receba avisos da estaca e das unidades que escolher.` com o botão `Ativar avisos` enquanto não houver permissão. |
| RF-07 | Com permissão concedida, o app registra (ou atualiza `last_seen_at` de) o token a cada abertura, no máximo 1 vez por dia, enviando o JWT quando logado. Ao entrar numa conta, o token passa a ter `user_id`; ao sair, volta a `null` mantendo as unidades. |
| RF-08 | Permissão negada: o card de RF-06 vira `As notificações estão desativadas nas configurações do celular.` com o botão `Abrir configurações`. |

### 7.3 Envio

| ID | Requisito |
| -- | --------- |
| RF-09 | Públicos (`src/domain/audience.ts`). Item da **Estaca**: `all` `Toda a estaca`, `stake_presidency` `Presidência`, `bishops` `Bispos`, `presidents` `Presidentes`, `leaders` `Líderes`, `relief_society` `Sociedade de Socorro`, `elders_quorum` `Quórum de Élderes`, `young_women` `Moças`, `young_men` `Rapazes`, `primary` `Primária`, `temple_family_history` `Templo e História da Família`. Item de **unidade**: `all` `Todos da ala` (ramo: `Todos do ramo`), `leaders` `Todos os líderes` e as 6 organizações. Ajuste de `roles-of-leadership` (2026-11-15): `stake_presidency`, `bishops` e `presidents` saem; entram os 13 grupos de RF-04 de `roles-of-leadership` (no item de unidade, todos menos `stake_presidency` e `high_council`). `leaders` e as organizações continuam. |
| RF-10 | Destinatários = aparelhos com `item.unit_id` em `units` **e** (`all` no público, ou, só para aparelhos com conta: organização em `profiles.organizations`, ou `leadership_group` da pessoa no público, ou `leaders` no público e a pessoa com papel elevado na unidade do item — para Estaca, em qualquer unidade). Aparelhos sem conta só recebem `all`. Cada aparelho recebe no máximo 1 vez. Ajuste de `roles-of-leadership`: "`leadership_group` da pessoa no público" passa a ser "algum chamado da pessoa (`member_calls`) com `notify_group` no público e, no item de unidade, na mesma unidade". |
| RF-11 | Conteúdo: evento → título `{título do evento}`, corpo `{Dia da semana}, {d} de {mês} · {início} · {local}`; aviso → título `{título do aviso}`, corpo `{1ª linha do texto, até 120 caracteres}`. Dados: `{ kind, itemId }`. Idioma do corpo segue `push_devices.locale`. |
| RF-12 | `sendPush({ kind, itemId, audience })` (`src/lib/push.ts`) chama `send-push` e retorna `{ recipients }`; erros: 403 `Você não tem permissão para avisar esta unidade.`, 429 de RNF-03, rede `Sem conexão. Verifique a internet e tente de novo.` |
| RF-13 | `AudiencePicker` (`src/components`): título `ENVIAR PARA · ESTACA` ou `ENVIAR PARA · {UNIDADE}`; chips de RF-09 (ícone `groups` no 1º, `add`/`check` nos demais); tocar no 1º marca ou desmarca todos; marcar todos os outros marca o 1º; resumo: nenhum → `Selecione ao menos um grupo para enviar a notificação.`; com o 1º → `Todos os membros da estaca com o app receberão o aviso.` (unidade: `da ala`/`do ramo`); senão `Push para: {grupos separados por vírgula}.` |

### 7.4 Tela Notificações

| ID | Requisito |
| -- | --------- |
| RF-14 | `/notifications`: voltar, título `Notificações`, ação `Ler todas` (só com não lidas). Seções `HOJE`, `ESTA SEMANA`, `ANTERIORES` (até 90 dias). |
| RF-15 | Item: círculo 40 com ícone (`event` em `primary` para evento; `campaign` em `successSubtle`/`success` para aviso; `alarm` em `warningSubtle`/`warningText` para lembrete), título, corpo (2 linhas), `{unidade} · {HH:mm}` (lembrete: `Minhas anotações · {dia abreviado}`). Não lida: fundo `primarySubtle` e ponto `primary`. |
| RF-16 | Tocar marca como lido e abre `/event/{id}` ou `/board/{id}` (lembrete: `/notes/{id}`). Item removido: toast `Este item não está mais disponível.` |
| RF-17 | Card `Receber avisos de` (com permissão): logado com unidade → `Estaca`, `Minha ala · {unidade}` (ou `Meu ramo · ...`), `Outras unidades` (liga/desliga as outras 5 juntas); logado sem unidade e visitante → `Estaca` + um interruptor por unidade. Cada mudança chama `set_device_units`. |
| RF-18 | Vazio: `Nenhuma notificação nos últimos 90 dias.` |
| RF-19 | Sino da Agenda: ponto `danger` quando há não lidas (logado: `notification_reads`; visitante e lembretes: ids lidos guardados no aparelho). |
| RF-20 | Lembretes: entradas do `reminderLog` (`{ noteId, title, fireAt }`) com `fireAt` ≤ agora e nos últimos 90 dias entram na lista na ordem de data; leitura guardada no aparelho. |

### 7.5 Perfil › Avisos

| ID | Requisito |
| -- | --------- |
| RF-21 | Seção `Avisos` no Perfil: `Notificações` (abre `/notifications`) e `Grupos que acompanho` com chips das 6 organizações (RF-09), texto `Você recebe avisos enviados para os grupos marcados.` Grava `profiles.organizations`. |

### 7.6 Toque e primeiro plano

| ID | Requisito |
| -- | --------- |
| RF-22 | Notificação tocada com o app fechado ou em segundo plano abre o item (RF-16). Com o app aberto, a notificação aparece como banner do sistema. |

### 7.7 Casos de borda

| Situação | Comportamento |
| -------- | ------------- |
| Simulador / sem aparelho físico | Não registra; card mostra `Avisos só funcionam em um celular.` |
| Público vazio | `AudiencePicker` inválido; o formulário não deixa salvar com `Notificar` marcado |
| Aparelho logado que sai da conta | Mantém as unidades, perde `user_id`; passa a receber só `all` |
| Conta excluída | `user_id` vira `null` nos aparelhos (RF-01) e leituras são apagadas |
| Expo Push API fora do ar | `send-push` responde 502; formulário mostra `O item foi salvo, mas o aviso não foi enviado. Tente avisar de novo em instantes.` |
| Dois envios do mesmo item em 10 min | O 2º recebe 429 (RNF-03) |

## 8. Especificação de UI/UX

- Tela como a "Notificações · push" do design: cabeçalho com voltar, título serif 22 e `Ler todas` em `primary`; itens com padding 12×16; card de preferências branco, raio 16, no fim da lista.
- `AudiencePicker`: chips 32, selecionado com fundo `primarySubtle`, borda e texto `primary`.

## 9. Acessibilidade

| ID | Requisito |
| -- | --------- |
| RNF-09 | Item não lido anuncia `Não lida` antes do título. |
| RNF-10 | Interruptores com rótulo da unidade (`Receber avisos da Estaca`). |
| RNF-11 | Chips do `AudiencePicker` são `checkbox` com `checked`; o resumo é anunciado ao mudar. |
| RNF-12 | O ponto do sino é refletido no rótulo `Notificações, há não lidas`. |

## 10. Estrutura de arquivos esperada

```
supabase/migrations/<ts>_push.sql                 # tabelas, RPCs, RLS, pg_cron
supabase/functions/register-device/index.ts
supabase/functions/send-push/index.ts            # destinatários (RF-10), lotes, recibos
supabase/tests/push.test.sql
src/domain/audience.ts (+ test)                  # opções, rótulos, resumo, regra de destinatários espelhada para teste
src/lib/push.ts (+ test)                         # permissão, registro, sendPush
src/lib/reminderLog.ts (+ test)                  # leitura/escrita local de lembretes
src/components/AudiencePicker.tsx (+ test)
src/features/notifications/NotificationsScreen.tsx, NotificationPrefsCard.tsx, EnablePushSheet.tsx, api.ts (+ testes)
src/features/account/ProfileScreen.tsx           # alterar: seção Avisos
src/features/calendar/AgendaScreen.tsx           # alterar: ponto no sino
src/app/notifications.tsx, src/app/_layout.tsx   # tela e listener de toque
app.config.ts                                    # plugin expo-notifications, projectId EAS
.env.example                                     # EXPO_ACCESS_TOKEN já documentado
```

## 11. Critérios de aceitação

| ID | Cobre | Dado | Quando | Então |
| -- | ----- | ---- | ------ | ----- |
| CA-01 | RF-01, RF-02, RF-04, RNF-08 | dois aparelhos visitantes A e B com entregas diferentes | A chama `my_notifications` com o próprio token; e qualquer pessoa tenta ler `push_devices`, `notifications` ou `notification_deliveries` pela API | A recebe só as próprias entregas; a leitura direta é negada e nenhuma resposta contém um token (o token é a credencial do aparelho, decisão P1) |
| CA-02 | RF-03, RF-07 | visitante com permissão | abre o app | o token é registrado com `units = ['estaca']` e `user_id` nulo |
| CA-03 | RF-07 | visitante registrado | entra numa conta com unidade `icara` | o mesmo token passa a ter `user_id`; ao sair, volta a `null` mantendo `units` |
| CA-04 | RNF-02 | o mesmo IP | faz 11 registros em 1 hora | o 11º recebe 429 |
| CA-05 | RF-05 | primeiro acesso concluído | toco em `Ativar avisos` | o sistema pede permissão; concedida, o token é registrado |
| CA-06 | RF-06, RF-08 | visitante com permissão negada | abro Notificações | vejo `As notificações estão desativadas nas configurações do celular.` e `Abrir configurações` |
| CA-07 | RF-09, RF-13 | `AudiencePicker` de unidade `icara` | toco em `Todos da ala` | todos os chips ficam marcados e o resumo é `Todos os membros da ala com o app receberão o aviso.` |
| CA-08 | RF-13 | `AudiencePicker` sem seleção | olho o resumo | `Selecione ao menos um grupo para enviar a notificação.` |
| CA-09 | RF-10 | aparelhos: visitante Estaca; membro com `primary`; bispo com chamado de grupo `bishoprics`; membro só de `criciuma1` | aviso da Estaca para `primary` + `bishoprics` | recebem o membro com `primary` e o bispo; não recebem o visitante nem o de `criciuma1` |
| CA-10 | RF-10 | visitante assinando `icara` | aviso de `icara` para `all` | o visitante recebe |
| CA-11 | RF-11, RNF-01 | evento `Batismo` em 21/11 15:00 na `Capela do Ramo Gaivota` | envio | título `Batismo`, corpo `Sábado, 21 de novembro · 15:00 · Capela do Ramo Gaivota`, dados `{kind:'event', itemId}` |
| CA-12 | RF-12, RNF-03 | conta `publicador.icara` | envia para um item de `criciuma1` | 403 e a mensagem de RF-12 |
| CA-13 | RNF-03 | um item já avisado há 2 min | envio de novo | 429 e `Aguarde 10 minutos para avisar de novo sobre este item.` |
| CA-14 | RNF-04 | a Expo responde `DeviceNotRegistered` para um token | o envio termina | o token é removido de `push_devices` |
| CA-15 | RF-14, RF-15, RF-18 | 3 notificações (hoje, 3 dias, 20 dias) e 1 de 100 dias | abro Notificações | aparecem em `HOJE`, `ESTA SEMANA`, `ANTERIORES`; a de 100 dias não aparece |
| CA-16 | RF-14, RF-19 | logado com 2 não lidas | toco em `Ler todas` | o fundo azul e os pontos somem; o ponto do sino some |
| CA-17 | RF-16, RF-22 | notificação de evento | toco (lista ou banner do sistema) | abre `/event/{id}` e o item fica lido |
| CA-18 | RF-17 | logado com unidade `icara` | desligo `Outras unidades` | `units` = `['estaca','icara']` |
| CA-19 | RF-20 | `reminderLog` com um lembrete que já passou | abro Notificações | vejo `Minhas anotações · {dia}` com ícone `alarm`; um lembrete futuro não aparece |
| CA-20 | RF-21 | Perfil › Avisos | marco `Primária` | `profiles.organizations` contém `primary` |
| CA-21 | RNF-05 | notificações de 91 dias | o job diário roda | são excluídas com entregas e leituras |
| CA-22 | RNF-06 | um envio | busco tokens completos, e-mails e nomes nos logs | nenhuma ocorrência |
| CA-23 | 7.7 | Expo Push API indisponível | um formulário envia | mostra `O item foi salvo, mas o aviso não foi enviado. Tente avisar de novo em instantes.` |
| CA-24 | RNF-09 a RNF-12 | tela e seletor com VoiceOver/TalkBack | navego | `Não lida`, rótulos dos interruptores, chips como checkbox e o sino com `há não lidas` |

## 12. Roteiro de QA

| Passo | Ação | Resultado esperado |
| ----- | ---- | ------------------ |
| 1 | Em aparelho físico, como visitante, abra Notificações e toque em `Ativar avisos` | Permissão do sistema; card de preferências aparece |
| 2 | Ligue `Ala Içara` | Preferência salva |
| 3 | Em outro aparelho, como `publicador.icara`, chame `sendPush` para um evento de Içara com `all` (pela tela de teste do plano ou pelo formulário de `event-form` quando existir) | O aparelho do passo 1 recebe o push com o texto de RF-11 |
| 4 | Toque no push | Abre o evento |
| 5 | Entre numa conta no aparelho do passo 1 e marque `Primária` em Perfil › Avisos | Envio da Estaca para `Primária` chega |
| 6 | Desligue `Estaca` | Envios da Estaca não chegam mais |
| 7 | `Ler todas` | Não lidas somem e o ponto do sino some |
| 8 | Repita 1 e 4 em iOS e Android | Mesmo comportamento |

## 13. Definition of Done

- [ ] `make check` e `make test-db` passam
- [ ] Todo `CA` tem teste automatizado com o ID no nome, ou justificativa de teste manual no plano (CA-05, CA-17 com app fechado e CA-24 podem ser manuais)
- [ ] Roteiro de QA executado em aparelhos físicos iOS e Android
- [ ] Registro de implementação preenchido no plano
- [ ] Nenhum segredo, dado pessoal ou log sensível introduzido (ver `.ai/docs/SECURITY.md`)
- [ ] `eas init` feito e `projectId` em `app.config.ts`; credenciais APNs/FCM configuradas na EAS
- [ ] `SECURITY.md` › Dados tratados atualizado com tokens de visitante e histórico

## 14. Decisões em aberto

Nenhuma decisão em aberto.

| # | Pergunta | Decisão | Origem |
| - | -------- | ------- | ------ |
| 13 | Públicos por organização e liderança | Organizações por tópico no Perfil; grupos de liderança via Acessos | usuário |
| 14 | Push para visitantes | Sim, sem conta | usuário |
| 15 | Lembretes no histórico | Sim, mesclados no aparelho | usuário |
| 16 | Retenção e leitura | 90 dias, lido por pessoa, `Ler todas`, ponto no sino | usuário |
| 28 | Anti-abuso de visitante | 10 registros/IP/hora; expira em 180 dias; passa para a conta ao entrar | usuário |
| A1 | Preferências por aparelho ou por conta | Por aparelho (`push_devices.units`), igual para visitante e logado | padrão do projeto |
| A2 | Quando pedir permissão | Logado: após `Boas-vindas`; visitante: botão na tela Notificações | padrão do projeto |
| A3 | Limite de reenvio | 1 envio por item a cada 10 min | padrão do projeto |
| A4 | Conteúdo do push | Título + data/hora/local ou 1ª linha (sem dado sensível) | padrão do projeto |
| 29 | Grupos de liderança no aviso | Vêm do `notify_group` do chamado (`roles-of-leadership`), 13 grupos fixos (2026-11-15) | usuário |
| P1 | Histórico de visitante x CA-01 (no plano) | O token Expo é a credencial do aparelho: nenhuma tabela, RPC ou log o expõe; CA-01 reescrito | usuário (2026-11-15) |
| P2 | Idioma do corpo no histórico (no plano) | `notifications` guarda `event_starts_at`/`event_location` e o app monta o corpo no idioma atual | usuário (2026-11-15) |
| P3 | Aviso do mural (`kind = 'post'`) | Contrato pronto, mas `send-push` responde `unsupported_kind` até a `board` criar `posts` e estender `push_item` | plano (consequência: `posts` não existe) |

## 15. Próximos passos (fora desta entrega)

- `event-form` e `board` usam `AudiencePicker` e `sendPush`.
- `notes` grava o `reminderLog`.
- Estatísticas de entrega para a liderança.
