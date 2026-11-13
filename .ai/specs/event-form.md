# Criar, editar e excluir eventos, com pauta de reunião

> **Status:** Pronta para planejamento
> **Área:** rotas `/event/new`, `/event/[id]/edit`, botão `+` da Agenda, detalhe do evento, `src/features/events/`, `supabase/migrations/`
> **Última atualização:** 2026-11-13

## 0. Skills obrigatórias

| Skill | Quando usar |
| ----- | ----------- |
| `vercel-react-native-skills` | Formulário longo, seletores de data/hora, sheet da pauta |
| `ecc:postgres-patterns` | RLS de escrita em `events`, tabela `meeting_items`, função de pendências |
| `ecc:accessibility` | Formulário, chips, sheet com abas e mensagens de erro |
| `ecc:react-testing` | Validação, permissões por unidade e fluxo de pauta |

## 1. Contexto

Para a agenda ser a fonte da verdade (métrica principal), líderes precisam publicar eventos no app em menos tempo do que num grupo de mensagem. Conselhos de ala e de estaca também precisam de pauta, decisões e pendências que passam de uma reunião para a seguinte (RN-07), visíveis só à liderança (RN-04). Publicar segue RN-02 e avisar segue RN-08.

## 2. Objetivo

Quem pode publicar numa unidade cria, edita e exclui eventos dessa unidade pelo formulário do design, opcionalmente avisando por push um público escolhido. Em reuniões, a liderança registra pauta, decisões e pendências, e as pendências entram sozinhas na pauta da próxima reunião da mesma série.

## 3. Estado atual

| Item | Situação | Destino |
| ---- | -------- | ------- |
| `events` (leitura pública) | `calendar` | Alterar: políticas de escrita (`can_publish`) |
| Agenda e detalhe do evento | `calendar` | Alterar: botão `+`, `Editar`, `Excluir`, card `Pauta da reunião` |
| `AudiencePicker`, `sendPush` | `push-notifications` | Usar |
| `ConfirmSheet`, `Sheet`, `TextField`, `FilterChip`, `Segmented`, `useToast` | `design-system` | Usar |
| Pauta da reunião | Não existe | Criar |

## 4. Tecnologias e versões

| Tecnologia | Versão | Situação | Uso nesta entrega |
| ---------- | ------ | -------- | ----------------- |
| `@react-native-community/datetimepicker` | do SDK 58 | adicionar | Data e hora nativos |
| TanStack Query | 5.x | instalada | Mutações e invalidação da agenda |

## 5. Restrições e requisitos não funcionais

| ID | Requisito |
| -- | --------- |
| RNF-01 | `insert`/`update`/`delete` em `events` só com `can_publish(unit_id)`; mudar `unit_id` exige `can_publish` na unidade antiga e na nova. |
| RNF-02 | `meeting_items` só para `can_lead(unit do evento)`; nunca entram no cache persistido nem em push. |
| RNF-03 | A cópia de pendências acontece no banco (função `carry_pending_items(event_id)` chamada na criação), numa transação. |
| RNF-04 | Logs `event_created`, `event_updated`, `event_deleted` só com ids. |
| RNF-05 | Datas digitadas no fuso `America/Sao_Paulo`, gravadas em UTC. |

## 6. Escopo

### 6.1 Incluso

- Botão `+` na Agenda para quem pode publicar em alguma unidade.
- Formulário `Novo evento` / `Editar evento` com todos os campos do design.
- `Editar` e `Excluir` no detalhe, para quem pode publicar na unidade.
- `Notificar` com `AudiencePicker` e envio após salvar.
- Pauta da reunião (Pauta, Decisões, Pendências) para eventos `Reunião`, visível e editável só por `can_lead`.
- Cópia automática de pendências para a próxima reunião da série.
- Card `Pauta da reunião` no detalhe do evento (só `can_lead`).

### 6.2 Não incluso

- Recorrência; duplicar evento; rascunhos; anexos.
- Responsável e prazo por item de pauta.
- Exportar ata em PDF.

## 7. Especificação funcional

### 7.1 Acesso

| ID | Requisito |
| -- | --------- |
| RF-01 | Botão flutuante `+` (56, raio 18, `primary`, rótulo acessível `Novo evento`) na Agenda, visível só com `publishableUnits` não vazio. |
| RF-02 | No detalhe, com `canPublish(unit_id)`: ações `Editar` e `Excluir` no cabeçalho. |

### 7.2 Formulário

Cabeçalho: `Cancelar` · `Novo evento` (ou `Editar evento`) · `Salvar` (`primary` compacto).

| ID | Campo | Regra | Mensagem |
| -- | ----- | ----- | -------- |
| RF-03 | `Nome do evento` (placeholder `Ex.: Noite cultural da ala`) | Obrigatório, `trim`, 1–80 | `Informe o nome do evento.` / `Use até 80 caracteres.` |
| RF-04 | `Somente nesta data` (marcado por padrão), `Início` (data + hora), `Fim` (hora; desmarcado: data + hora) | Fim > início. Padrão novo: próximo horário cheio + 1 h; fim = início + 2 h | `O fim precisa ser depois do início.` |
| RF-05 | `Tipo` | Um dos 5 tipos (`calendar` RF-02); padrão `Atividade` | — |
| RF-06 | `Unidade` | Só `publishableUnits` (ordem `unitOrder`); padrão: a única ou a 1ª | — |
| RF-07 | `Local` (placeholder `Capela, endereço ou link`) | Opcional, `trim`, até 160 | `Use até 160 caracteres.` |
| RF-08 | `Notas` (placeholder `Informações para os participantes`) | Opcional, até 1000 | `Use até 1000 caracteres.` |
| RF-09 | `Links` (campo `https://` + `Adicionar`; cada link com `close` para remover) | Até 5; começa com `https://`; até 500 | `Informe um link que comece com https://.` / `Use até 5 links.` |
| RF-10 | `Notificar` (`Envia push ao salvar o evento`) | Novo: marcado por padrão; edição: desmarcado. Marcado: `AudiencePicker` da unidade, padrão = 1º público (`all`). Nenhum público com `Notificar` marcado impede salvar | `Selecione ao menos um grupo para enviar a notificação.` |

| ID | Requisito |
| -- | --------- |
| RF-11 | `Salvar` fica desabilitado até o formulário ser válido; erros aparecem ao sair do campo. Durante o envio: `Salvando...` e os campos desabilitados. |
| RF-12 | Sucesso: volta ao detalhe e mostra `Evento salvo` (sem push) ou `Evento salvo e aviso enviado` (com push, RF-12 de `push-notifications`). Falha só do push: mantém o evento salvo e mostra a mensagem de push de `push-notifications` › 7.7. |
| RF-13 | `Cancelar` sem alterações volta direto; com alterações abre `ConfirmSheet` `Descartar alterações?` / `Você tem alterações não salvas.` / `Descartar` (`danger`) / `Continuar editando`. |
| RF-14 | Trocar a unidade limpa o público escolhido. |

### 7.3 Excluir

| ID | Requisito |
| -- | --------- |
| RF-15 | `Excluir` → `ConfirmSheet` `Excluir evento?` / `"{nome}" será removido da agenda. Não dá para desfazer.` / `Excluir` (`danger`) / `Cancelar`. Confirmado: exclui o evento e seus itens de pauta, volta à Agenda e mostra `Evento excluído.` |

### 7.4 Pauta da reunião

| ID | Requisito |
| -- | --------- |
| RF-16 | `meeting_items`: `id`, `event_id` → `events on delete cascade`, `kind` (`agenda` \| `decision` \| `pending`), `text` (1–300), `position int`, `carried_from_event_id uuid null`, `carried_from_date date null`, `created_by`, `created_at`. |
| RF-17 | Com tipo `Reunião` e `canLead(unidade)`: card `Pauta da reunião` (fundo `primary`, ícone `checklist`, resumo `{n} na pauta · {n} decisões · {n} pendentes`) no formulário e no detalhe; abre o `Sheet` da pauta (82% da altura). `unit_publisher` não vê o card. |
| RF-18 | Sheet: overline `REUNIÃO`, título = nome do evento (ou `Reunião`), botão `Concluir`; `Segmented` `Pauta` / `Decisões` / `Pendências` com contagem; dica por aba: `Assuntos a tratar. Pendências da reunião anterior entram aqui automaticamente.` / `O que foi decidido. Preencha durante ou depois da reunião.` / `O que fica para a próxima reunião — será levado para a pauta dela.` |
| RF-19 | Lista: Pauta numerada (`1`, `2`...); Decisões com ícone `check` (`successSubtle`); Pendências com `arrow_forward` (`warningSubtle`) e etiqueta `Vai para a próxima reunião`; itens trazidos com etiqueta `Pendente da reunião de {dd/mm}`. Cada item tem `close` para remover. Campo no rodapé com placeholder `Novo assunto da pauta` / `Registrar decisão` / `Nova pendência` e botão `+`; `Enter` também adiciona; texto vazio não adiciona. |
| RF-20 | Em evento novo, os itens ficam no formulário e são gravados ao salvar; em evento existente, cada item adicionado ou removido é gravado na hora. |
| RF-21 | Série: ao **criar** uma Reunião, `carry_pending_items` encontra a reunião anterior mais recente (início antes do da nova) da mesma unidade com nome igual após `lower`, sem acentos e espaços colapsados, e copia as pendências dela como itens de pauta (no início da lista) com `carried_from_*`. Editar o nome depois não copia de novo. |

### 7.5 Casos de borda

| Situação | Comportamento |
| -------- | ------------- |
| Toque duplo em `Salvar` | Um único evento criado |
| Papel revogado com o formulário aberto | O banco nega; toast `Você não tem mais permissão para publicar nesta unidade.` e volta ao detalhe |
| Evento excluído por outra pessoa durante a edição | Toast `Este evento não está mais disponível.` e volta à Agenda |
| Mudar tipo de `Reunião` para outro com itens de pauta | `ConfirmSheet` `Remover a pauta?` / `Os itens da pauta, decisões e pendências serão apagados.` / `Remover` / `Cancelar` |
| Reunião anterior da série sem pendências | Nada é copiado |
| Duas reuniões futuras da mesma série criadas em sequência | Cada uma copia da anterior mais recente na hora da criação |
| Sem conexão ao salvar | Toast `Sem conexão. Verifique a internet e tente de novo.`; formulário mantém o que foi digitado |

## 8. Especificação de UI/UX

- Formulário como `EventFormScreen.dc.html`: blocos brancos raio 16 sobre `bg`; campos com fundo `surfaceMuted`, raio 10; checkbox 22 raio 6; chips de tipo 34 com ícone; chips de unidade 32 roláveis com ponto de cor.
- Detalhe do evento: `Editar` (ícone `edit`) e `Excluir` (ícone `delete`) como botões circulares no cabeçalho.
- Seletores de data e hora nativos (modal no iOS, diálogo no Android).

## 9. Acessibilidade

| ID | Requisito |
| -- | --------- |
| RNF-06 | Checkboxes (`Somente nesta data`, `Notificar`) com papel `checkbox` e `checked`. |
| RNF-07 | Chips de tipo e unidade como `radio` dentro de um grupo rotulado (`Tipo`, `Unidade`). |
| RNF-08 | Botões de data/hora anunciam o valor (`Início, sexta, 13 de novembro, 19:30`). |
| RNF-09 | Itens da pauta anunciam a etiqueta (`Pendente da reunião de 15/10`) e o botão remover tem rótulo `Remover "{texto}"`. |
| RNF-10 | Erros anunciados e foco no primeiro campo inválido ao tentar salvar. |

## 10. Estrutura de arquivos esperada

```
supabase/migrations/<ts>_events_write_meeting_items.sql   # RLS de escrita, meeting_items, carry_pending_items
supabase/tests/events_write.test.sql
src/domain/eventForm.ts (+ test)                           # validação, padrões de data, normalização do nome da série
src/features/events/EventFormScreen.tsx, MeetingAgendaSheet.tsx, MeetingAgendaCard.tsx (+ testes)
src/features/events/api.ts                                 # create/update/delete, itens de pauta
src/features/calendar/AgendaScreen.tsx                     # alterar: botão +
src/features/calendar/EventDetailScreen.tsx                # alterar: Editar, Excluir, card da pauta
src/app/event/new.tsx, src/app/event/[id]/edit.tsx
src/i18n/locales/*.json                                    # events.*
```

## 11. Critérios de aceitação

| ID | Cobre | Dado | Quando | Então |
| -- | ----- | ---- | ------ | ----- |
| CA-01 | RF-01 | visitante, membro e `publicador.icara` | abrem a Agenda | só o publicador vê `+` |
| CA-02 | RF-02 | `publicador.icara` | abre um evento de Içara e um de Criciúma 1 | `Editar`/`Excluir` só no de Içara |
| CA-03 | RF-03, RF-11 | formulário novo | deixo o nome vazio e saio do campo | `Informe o nome do evento.` e `Salvar` desabilitado |
| CA-04 | RF-04 | início 19:30 | escolho fim 19:00 | `O fim precisa ser depois do início.` |
| CA-05 | RF-04 | `Somente nesta data` desmarcado | escolho fim em outro dia | o campo de data do fim aparece e o evento é salvo cobrindo os dias |
| CA-06 | RF-06, RNF-01 | `publicador.icara` | abro o seletor de unidade | só `Ala Içara`; uma chamada direta à API com `criciuma1` é negada |
| CA-07 | RF-09 | o campo de link | adiciono `http://x.org` | `Informe um link que comece com https://.` |
| CA-08 | RF-10 | `Notificar` marcado | desmarco todos os públicos | `Selecione ao menos um grupo para enviar a notificação.` e `Salvar` desabilitado |
| CA-09 | RF-12 | formulário válido com `Notificar` | salvo | volto ao detalhe, toast `Evento salvo e aviso enviado` e `sendPush` chamado com o público escolhido |
| CA-10 | RF-12 | `sendPush` falha | salvo | evento salvo e a mensagem de falha de push aparece |
| CA-11 | RF-13 | formulário alterado | toco em `Cancelar` | `Descartar alterações?`; `Continuar editando` mantém os dados |
| CA-12 | RF-14 | público escolhido para Içara (stake_leader) | troco a unidade para Estaca | o público é limpo e as opções viram as da Estaca |
| CA-13 | RF-15 | um evento com pauta | excluo e confirmo | evento e itens apagados, volto à Agenda com `Evento excluído.` |
| CA-14 | RF-16, RF-17, RNF-02 | evento Reunião de Içara | `publicador.icara` abre o detalhe; `membro` lê `meeting_items` pela API | o publicador não vê o card; a API retorna 0 itens para o membro |
| CA-15 | RF-17, RF-18 | `bispo.criciuma1` em Reunião de Criciúma 1 | abro `Pauta da reunião` | sheet com as 3 abas, contagens e dicas de RF-18 |
| CA-16 | RF-19, RF-20 | o sheet de evento existente | adiciono `Oração` em Pauta e removo um item | gravados na hora; a pauta mostra `1 Oração` |
| CA-17 | RF-21, RNF-03 | `Conselho da ala` (Criciúma 1, 15/10) com a pendência `Definir recepção` | crio `conselho da  ALA` em 12/11 para Criciúma 1 | a nova pauta começa com `Definir recepção` e a etiqueta `Pendente da reunião de 15/10` |
| CA-18 | RF-21 | o mesmo cenário em `Ala Içara` | crio a reunião | nada é copiado (unidade diferente) |
| CA-19 | 7.5 | Reunião com itens | mudo o tipo para `Atividade` | `Remover a pauta?`; confirmando, os itens são apagados ao salvar |
| CA-20 | RNF-05 | aparelho em outro fuso | crio evento às 19:30 | gravado como 22:30 UTC e exibido como 19:30 |
| CA-21 | 7.5 | toque duplo em `Salvar` | aguardo | um único evento |
| CA-22 | RNF-06 a RNF-10 | formulário e sheet com VoiceOver/TalkBack | navego | papéis, valores de data/hora e etiquetas anunciados; foco no primeiro erro |
| CA-23 | RF-05, RF-07, RF-08 | formulário com tipo `Treinamento`, local de 160 caracteres e notas de 1001 | tento salvar e depois reduzo as notas para 1000 | primeiro `Use até 1000 caracteres.`; depois salva com `type = 'training'` e o local completo |

## 12. Roteiro de QA

| Passo | Ação | Resultado esperado |
| ----- | ---- | ------------------ |
| 1 | Entre como `bispo.criciuma1`, toque em `+` | Formulário com unidade `Ala Criciúma 1` |
| 2 | Crie `Conselho da ala` (Reunião), adicione 2 pendências na pauta, salve sem notificar | `Evento salvo`; card da pauta no detalhe |
| 3 | Crie outro `Conselho da ala` uma semana depois | Pauta já traz as 2 pendências com a etiqueta |
| 4 | Crie uma `Atividade` com `Notificar` para `Todos da ala` | Push chega num aparelho que assina Criciúma 1 |
| 5 | Edite o evento do passo 4, mude o horário e salve | Agenda mostra o novo horário; sem push |
| 6 | Exclua o evento | `Evento excluído.` e some da Agenda |
| 7 | Entre como `publicador.icara` | Só Içara no seletor; sem card de pauta em reuniões |
| 8 | VoiceOver/TalkBack no formulário | Itens de RNF-06 a RNF-10 |

## 13. Definition of Done

- [ ] `make check` e `make test-db` passam
- [ ] Todo `CA` tem teste automatizado com o ID no nome, ou justificativa de teste manual no plano (CA-22 manual)
- [ ] Fluxo Maestro `.maestro/lider-publica-evento.yaml` passa localmente
- [ ] Roteiro de QA executado sem divergências em iOS e Android
- [ ] Registro de implementação preenchido no plano
- [ ] Nenhum segredo, dado pessoal ou log sensível introduzido (ver `.ai/docs/SECURITY.md`)
- [ ] `BUSINESS.md` RN-07 atualizado com a regra de série de RF-21

## 14. Decisões em aberto

Nenhuma decisão em aberto.

| # | Pergunta | Decisão | Origem |
| - | -------- | ------- | ------ |
| 6 | `unit_publisher` vê pauta? | Não; só `can_lead` | usuário |
| 11 | Editar e excluir | Sim, para quem pode publicar na unidade | usuário |
| 12 | Série de reuniões | Mesmo nome normalizado + mesma unidade, cópia na criação | usuário |
| 13 | Públicos do push | `AudiencePicker` de `push-notifications` | usuário |
| A1 | `Notificar` padrão | Marcado ao criar; desmarcado ao editar | padrão do projeto |
| A2 | Gravação dos itens de pauta | Na hora em evento existente; ao salvar em evento novo | padrão do projeto |
| A3 | Limites | Nome 80, local 160, notas 1000, até 5 links, item de pauta 300 | padrão do projeto |

## 15. Próximos passos (fora desta entrega)

- Responsável e prazo por item de pauta; ata em PDF.
- Eventos recorrentes.
