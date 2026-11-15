# Chamados: acompanhamento restrito à liderança

> **Status:** Pronta para planejamento
> **Área:** aba `callings`, rotas `/callings/*`, `src/features/callings/`, `supabase/migrations/`
> **Última atualização:** 2026-11-13

## 0. Skills obrigatórias

| Skill | Quando usar |
| ----- | ----------- |
| `vercel-react-native-skills` | Lista, detalhe e linha do tempo |
| `ecc:postgres-patterns` | Tabelas, RLS de `can_lead`, RPC de etapas e retenção com `pg_cron` |
| `ecc:accessibility` | Barra de progresso e ações de etapa |
| `ecc:react-testing` | Regras de etapa e de acesso |

## 1. Contexto

Bispados e a presidência da estaca acompanham chamados de memória ou em papel. O processo tem etapas fixas (RN-05) e é confidencial: só a liderança da unidade e a da estaca veem (RN-04), nem o admin técnico. Por ser dado sensível, chamados concluídos e cancelados são apagados automaticamente (decisão 23).

## 2. Objetivo

A liderança (`can_lead`) cria chamados da unidade, avança e volta etapas com data e autor registrados, cancela ou conclui, e os dados somem sozinhos 12 meses após a Designação (30 dias após cancelar), sem que ninguém fora da liderança tenha acesso.

## 3. Estado atual

| Item | Situação | Destino |
| ---- | -------- | ------- |
| Aba `callings` | Tela provisória (só Líder) | Substituir |
| `can_lead`, `leadableUnits` | `app-foundation` | Usar |
| Tabelas de chamados | Não existem | Criar |

## 4. Tecnologias e versões

| Tecnologia | Versão | Situação | Uso nesta entrega |
| ---------- | ------ | -------- | ----------------- |
| `pg_cron` | do stack | habilitado em `push-notifications` | Retenção diária |
| TanStack Query | 5.x | instalada | Lista e mutações (sem persistência) |

## 5. Restrições e requisitos não funcionais

| ID | Requisito |
| -- | --------- |
| RNF-01 | `calling_processes` e `calling_stage_events` com RLS só para `can_lead(unit_id)`; `admin` e `unit_publisher` sem acesso. |
| RNF-02 | Mudança de etapa só pela RPC `move_calling_stage(id, direction)` (`forward` \| `back`), que valida a sequência e grava o evento na mesma transação. |
| RNF-03 | Retenção: job diário apaga `completed` com `completed_at` > 12 meses e `cancelled` com `cancelled_at` > 30 dias (com os eventos em cascata). |
| RNF-04 | Nada de chamados no cache persistido, em push ou em logs (logs só `calling_created`, `calling_stage_moved`, `calling_deleted` com ids). |
| RNF-05 | Dados mínimos: cargo e nome da pessoa; sem campo de observações. |

## 6. Escopo

### 6.1 Incluso

- Tabelas `calling_processes` e `calling_stage_events`, RPC de etapas, job de retenção.
- Aba Chamados: filtro `Em andamento`/`Concluídos`, seletor de unidade para `stake_leader`, cards com progresso.
- Novo chamado, detalhe com linha do tempo, avançar, voltar, cancelar, excluir.
- Tela `Acesso restrito` para quem chega sem permissão (link direto).

### 6.2 Não incluso

- Desobrigação de chamados; lembretes de entrevista; integração com sistemas oficiais.
- Observações livres ou anexos.
- Exportação.

## 7. Especificação funcional

### 7.1 Dados

| ID | Requisito |
| -- | --------- |
| RF-01 | `calling_processes`: `id`, `unit_id`, `calling_title` (2–80), `person_name` (2–80), `stage` (`proposed` \| `approved` \| `interview` \| `sustaining` \| `set_apart`), `status` (`active` \| `completed` \| `cancelled`), `completed_at null`, `cancelled_at null`, `created_by`, `created_at`, `updated_at`. |
| RF-02 | `calling_stage_events`: `id`, `process_id` → `on delete cascade`, `from_stage null`, `to_stage`, `action` (`created` \| `forward` \| `back` \| `cancelled`), `actor_id`, `created_at`. |
| RF-03 | Etapas e rótulos: `Proposto`, `Aprovado`, `Entrevista`, `Apoio`, `Designação`. Avançar a partir de `Apoio` leva a `Designação` e marca `completed`. Voltar não sai de `Proposto`; voltar de um `completed` reabre como `active` em `Apoio`. |

### 7.2 Lista

| ID | Requisito |
| -- | --------- |
| RF-04 | Cabeçalho: overline com o nome da unidade em maiúsculas (ex.: `ALA CRICIÚMA 1`), título `Chamados`, `add` (`Novo chamado`), avatar. Com mais de uma unidade em `leadableUnits` (`stake_leader`), o overline vira seletor (`expand_more`) com Estaca e as 6 unidades; padrão: a unidade frequentada se estiver na lista, senão Estaca. |
| RF-05 | Chips `Em andamento · {n}` (padrão) e `Concluídos` (concluídos e cancelados, mais recentes primeiro). |
| RF-06 | Card: cargo (15/600), pessoa (13 `textMuted`), `StatusTag` com a etapa atual (`Proposto` neutro, `Aprovado`/`Entrevista` aviso, `Apoio` info, `Designação` sucesso; cancelado: `Cancelado` neutro), barra de 5 segmentos (preenchidos até a etapa atual) e rótulos das 5 etapas abaixo. |
| RF-07 | Rodapé fixo da lista: ícone `lock` + `Visível apenas à liderança desta unidade e à presidência da estaca. Dados confidenciais.` |
| RF-08 | Vazio: `Nenhum chamado em andamento.` / `Nenhum chamado concluído nos últimos 12 meses.` |

### 7.3 Novo e detalhe

| ID | Requisito |
| -- | --------- |
| RF-09 | `Novo chamado` (`Sheet`): `Chamado` (2–80, placeholder `Ex.: Presidente da Primária`), `Pessoa indicada` (2–80, placeholder `Nome e sobrenome`), unidade = a selecionada na lista (não editável no sheet). Mensagens: `Informe o chamado.`, `Informe o nome da pessoa.`, `Use entre 2 e 80 caracteres.` Salvar cria em `Proposto` com evento `created`; toast `Chamado criado`. Ajuste de `roles-of-leadership` (2026-11-15): `Chamado` vira uma lista do catálogo (ativos, compatíveis com a unidade, com busca `Buscar chamado`) mais `Outro chamado`, que abre o texto livre (2–80); grava `calling_id text null` → `calling_catalog` ou `title`. |
| RF-10 | Detalhe `/callings/[id]`: cargo (serif 22), pessoa, unidade, `StatusTag`, barra de progresso, linha do tempo (`{etapa} · {d} {mês abreviado} {aaaa} · {nome de quem fez}`; `Excluído` se a conta do autor foi apagada), e ações: `Avançar para {próxima etapa}` (`primary`), `Voltar etapa` (`outline`), `Cancelar chamado` (`ghost` `danger`), `Excluir` (no cabeçalho). Concluído: só `Voltar etapa` e `Excluir`. Cancelado: só `Excluir`. |
| RF-11 | `Cancelar chamado` → `ConfirmSheet` `Cancelar este chamado?` / `O chamado sai da lista em andamento e é apagado em 30 dias.` / `Cancelar chamado` (`danger`) / `Voltar`. Toast `Chamado cancelado`. |
| RF-12 | `Excluir` → `ConfirmSheet` `Excluir chamado?` / `O chamado e o histórico serão apagados. Não dá para desfazer.` / `Excluir` (`danger`) / `Cancelar`. Toast `Chamado excluído.` |
| RF-13 | Avançar mostra o toast `Etapa: {nova etapa}`; ao chegar em `Designação`, `Chamado concluído`. |
| RF-14 | Quem abre `/callings` ou `/callings/[id]` sem `can_lead`: tela `Acesso restrito` com ícone `lock` 72, título `Acesso restrito`, texto `Esta área é usada por bispados, presidência de ramo e presidência da estaca para acompanhar chamados.` e botão `Voltar para a agenda`. |

### 7.4 Casos de borda

| Situação | Comportamento |
| -------- | ------------- |
| Toque duplo em `Avançar` | Um único avanço (botão em `loading`; RPC compara a etapa esperada e rejeita se já mudou) |
| Outro líder moveu a etapa antes | RPC rejeita; toast `Este chamado foi atualizado por outra pessoa.` e o detalhe recarrega |
| Papel revogado com a tela aberta | Próxima ação negada; tela vira `Acesso restrito` |
| Chamado apagado pela retenção com o detalhe aberto | `Este chamado não está mais disponível.` + voltar |
| Sem conexão | Toast `Sem conexão. Verifique a internet e tente de novo.`; nada é mostrado do cache |

## 8. Especificação de UI/UX

- Como "Chamados · restrito por papel" do design: cards brancos raio 14; segmentos de 4 px com gap 4 (`primary` preenchido, `borderStrong` vazio); rótulos 10,5 `textSubtle`.
- Linha do tempo vertical com pontos `primary` e texto `caption`.

## 9. Acessibilidade

| ID | Requisito |
| -- | --------- |
| RNF-06 | A barra de progresso é um único elemento com rótulo `Etapa {n} de 5: {etapa}`. |
| RNF-07 | Cards anunciados como `{cargo}, {pessoa}, {etapa}`. |
| RNF-08 | Botões de ação com o nome da etapa no rótulo (`Avançar para Entrevista`). |

## 10. Estrutura de arquivos esperada

```
supabase/migrations/<ts>_callings.sql         # tabelas, RLS, move_calling_stage, pg_cron de retenção
supabase/tests/callings.test.sql
src/domain/callings.ts (+ test)               # etapas, rótulos, tons, próxima/anterior, progresso
src/features/callings/CallingsScreen.tsx, CallingCard.tsx, NewCallingSheet.tsx, CallingDetailScreen.tsx, RestrictedScreen.tsx (+ testes)
src/features/callings/api.ts
src/app/(tabs)/callings.tsx, src/app/callings/[id].tsx
src/i18n/locales/*.json                       # callings.*
```

## 11. Critérios de aceitação

| ID | Cobre | Dado | Quando | Então |
| -- | ----- | ---- | ------ | ----- |
| CA-01 | RF-01, RF-02, RNF-01 | chamados de Criciúma 1 | `admin`, `publicador.icara` e `membro` leem pela API | 0 linhas para os três; `bispo.criciuma1` e `estaca` leem |
| CA-02 | RF-04 | `bispo.criciuma1` | abro a aba | overline `ALA CRICIÚMA 1`, sem seletor |
| CA-03 | RF-04 | `estaca` | toco no overline | seletor com Estaca e 6 unidades |
| CA-04 | RF-05, RF-06 | 1 em `Entrevista` | olho o card | tag `Entrevista`, 3 segmentos preenchidos, 5 rótulos |
| CA-05 | RF-07 | a lista | olho o rodapé | o texto de RF-07 com o cadeado |
| CA-06 | RF-09 | sheet de novo chamado | salvo vazio | `Informe o chamado.` e `Informe o nome da pessoa.` |
| CA-07 | RF-09, RF-02 | dados válidos | salvo | chamado em `Proposto`, evento `created`, toast `Chamado criado` |
| CA-08 | RF-03, RF-10, RF-13, RNF-02 | chamado em `Apoio` | toco em `Avançar para Designação` | `completed`, toast `Chamado concluído`, vai para `Concluídos` |
| CA-09 | RF-03 | chamado em `Proposto` | olho o detalhe | `Voltar etapa` não aparece; a RPC com `back` é rejeitada |
| CA-10 | RF-03 | chamado concluído | `Voltar etapa` | volta a `Apoio`, `active` |
| CA-11 | RF-10 | detalhe com 3 mudanças | olho a linha do tempo | 3 entradas com etapa, data e nome de quem fez |
| CA-12 | RF-11 | chamado ativo | cancelo e confirmo | `cancelled`, aparece em `Concluídos` com tag `Cancelado` |
| CA-13 | RF-12 | qualquer chamado | excluo e confirmo | chamado e eventos apagados; `Chamado excluído.` |
| CA-14 | RF-14 | `membro` | abro `/callings` por link | `Acesso restrito` e `Voltar para a agenda` |
| CA-15 | RNF-03 | concluído há 12 meses e 1 dia, cancelado há 31 dias, concluído há 11 meses | o job roda | os dois primeiros são apagados; o terceiro fica |
| CA-16 | 7.4 | dois líderes no mesmo chamado | ambos tocam em `Avançar` | só um avanço; o outro vê `Este chamado foi atualizado por outra pessoa.` |
| CA-17 | RNF-04 | uso completo | inspeciono cache persistido e logs | nenhum dado de chamado |
| CA-18 | RNF-06 a RNF-08 | VoiceOver/TalkBack | navego | rótulos de RNF-06 a RNF-08 |
| CA-19 | RF-08 | unidade sem chamados | abro `Em andamento` e `Concluídos` | `Nenhum chamado em andamento.` e `Nenhum chamado concluído nos últimos 12 meses.` |

## 12. Roteiro de QA

| Passo | Ação | Resultado esperado |
| ----- | ---- | ------------------ |
| 1 | `bispo.criciuma1` abre Chamados | Lista da Ala Criciúma 1 |
| 2 | Cria `Presidente da Primária` para `Nome Sobrenome` | Aparece em `Proposto` |
| 3 | Avança até `Designação` | Concluído, em `Concluídos` |
| 4 | Volta uma etapa | Em andamento, `Apoio` |
| 5 | Cancela | `Cancelado` em `Concluídos` |
| 6 | `estaca` troca para `Ala Içara` e Estaca | Listas corretas por unidade |
| 7 | `admin` e `publicador.icara` tentam abrir `/callings` | `Acesso restrito` |
| 8 | Ajuste datas no banco local e rode o job | Retenção de RNF-03 aplicada |

## 13. Definition of Done

- [ ] `make check` e `make test-db` passam
- [ ] Todo `CA` tem teste automatizado com o ID no nome, ou justificativa de teste manual no plano (CA-18 manual)
- [ ] Roteiro de QA executado sem divergências em iOS e Android
- [ ] Registro de implementação preenchido no plano
- [ ] Nenhum segredo, dado pessoal ou log sensível introduzido (ver `.ai/docs/SECURITY.md`)
- [ ] `SECURITY.md` › Dados tratados com a retenção de chamados definida (12 meses / 30 dias)

## 14. Decisões em aberto

Nenhuma decisão em aberto.

| # | Pergunta | Decisão | Origem |
| - | -------- | ------- | ------ |
| 6 | Quem vê chamados | `unit_leader` da unidade e `stake_leader`; não `unit_publisher` nem `admin` | usuário |
| 23 | Retenção | 12 meses após Designação; 30 dias após cancelar | usuário |
| 24 | Etapas | Avançar/voltar uma por vez, com data e autor; cancelar | usuário |
| A1 | Campos | Só cargo e pessoa (dado mínimo) | padrão do projeto |
| A2 | Unidade padrão do `stake_leader` | A frequentada, se liderável; senão Estaca | padrão do projeto |
| A3 | Texto do rodapé | Genérico para ala, ramo e estaca | padrão do projeto |
| 25 | Cargo do chamado | Do catálogo (`roles-of-leadership`) + `Outro chamado` em texto livre (2026-11-15) | usuário |

## 15. Próximos passos (fora desta entrega)

- Desobrigações; lembretes de entrevista e de apoio no domingo.
