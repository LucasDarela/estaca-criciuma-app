# Liderança: organograma, contatos e designações

> **Status:** Pronta para planejamento
> **Área:** aba `leadership`, rotas `/leadership/*`, `src/features/leadership/`, `supabase/migrations/`
> **Última atualização:** 2026-11-13

## 0. Skills obrigatórias

| Skill | Quando usar |
| ----- | ----------- |
| `vercel-react-native-skills` | Listas agrupadas, busca, links `tel:` e WhatsApp |
| `ecc:postgres-patterns` | Posições, contatos separados por RLS, designações |
| `ecc:accessibility` | Organograma navegável por leitor de tela, ações de contato |
| `ecc:react-testing` | Visibilidade do telefone por perfil, edição e designações |

## 1. Contexto

Visitantes e membros não sabem a quem procurar. O organograma mostra quem serve onde, de forma pública (RN-01), e permite que a liderança registre **designações**: quem é responsável por quem e/ou pelo quê (ex.: um sumo conselheiro que acompanha a Ala Içara). Telefones são dado pessoal: só pessoas com conta veem (decisão 25), e a publicação de nome e chamado exige consentimento declarado por quem cadastra (decisão 20).

## 2. Objetivo

Qualquer pessoa navega pela liderança da estaca e das unidades e vê nomes, chamados e designações; quem tem conta vê o telefone e liga ou chama no WhatsApp; a liderança (`can_lead`) cadastra pessoas, telefones e designações da sua unidade.

## 3. Estado atual

| Item | Situação | Destino |
| ---- | -------- | ------- |
| Aba `leadership` | Tela provisória | Substituir |
| Cache público, `OfflineBanner` | `calendar` | Usar (sem telefones no cache) |
| Tabelas do organograma | Não existem | Criar |

## 4. Tecnologias e versões

| Tecnologia | Versão | Situação | Uso nesta entrega |
| ---------- | ------ | -------- | ----------------- |
| `Linking` (React Native) | do RN | instalada | `tel:` e `https://wa.me/` |
| `expo-clipboard` | do SDK 58 | adicionar | Copiar telefone |

## 5. Restrições e requisitos não funcionais

| ID | Requisito |
| -- | --------- |
| RNF-01 | Telefones ficam em `leadership_contacts`, com `select` só para `authenticated`; `anon` nunca recebe telefone (nem pela API). |
| RNF-02 | Telefones não entram no cache persistido (chaves `['private', ...]`). |
| RNF-03 | Escrita em posições, contatos e designações só com `can_lead(unit_id)` (estaca: `stake_leader`). `unit_publisher` e `admin` não editam. |
| RNF-04 | Toda posição tem `consent_declared_by` e `consent_declared_at` não nulos. |
| RNF-05 | Telefone gravado em E.164 (`+55` + DDD + número, 12–13 dígitos). |
| RNF-06 | Logs `leadership_position_saved`, `leadership_position_deleted` só com ids. |

## 6. Escopo

### 6.1 Incluso

- Tabelas `leadership_positions`, `leadership_contacts`, `designations` com RLS; seed fictício.
- Aba Liderança: busca, Presidência da estaca, atalhos de grupos da estaca, lista de unidades.
- Páginas de grupo da estaca, de unidade e ficha da pessoa.
- Telefone com `Ligar`, `WhatsApp` e copiar (só logados).
- Edição: adicionar, editar, reordenar, excluir pessoas; designações.

### 6.2 Não incluso

- Foto das pessoas (iniciais apenas).
- Ligar a posição a uma conta do app.
- E-mail de contato; horários de atendimento.
- Histórico de quem já serviu.

## 7. Especificação funcional

### 7.1 Dados

| ID | Requisito |
| -- | --------- |
| RF-01 | `leadership_positions`: `id`, `unit_id`, `group` (estaca: `stake_presidency`, `high_council`, `stake_clerks`, `stake_organizations`; unidade: `bishopric`, `unit_clerks`, `unit_organizations`), `title` (2–80, ex.: `Presidente da Estaca`, `1º Conselheiro`), `person_name` (2–80), `organization null` (as 6 de `push-notifications` RF-09, para grupos de organizações), `sort_order`, `consent_declared_by`, `consent_declared_at`, `updated_at`. Leitura pública. |
| RF-02 | `leadership_contacts`: `position_id pk` → posição `on delete cascade`, `phone_e164`. Leitura só `authenticated`. |
| RF-03 | `designations`: `id`, `position_id` → posição `on delete cascade`, `description` (1–120), `target_type null` (`unit` \| `organization` \| `position`), `target_id text null`, `sort_order`. Leitura pública. |
| RF-04 | Rótulos de grupo: `Presidência da estaca`, `Sumo conselho`, `Secretários da estaca`, `Organizações da estaca`, `Bispado` (ala) / `Presidência do ramo` (ramo), `Secretários`, `Organizações`. |

### 7.2 Navegação

| ID | Requisito |
| -- | --------- |
| RF-05 | Aba: título `Liderança`, busca `Buscar nome ou chamado`, overline `PRESIDÊNCIA DA ESTACA` com o presidente (avatar `large`, nome, chamado) e os demais da presidência em grade de 2; lista com `badge` `Secretários e Sumo Conselho` (contagem) e `groups` `Organizações da Estaca` (contagem); overline `UNIDADES` com as 6 unidades (ponto, nome, `{rótulo do grupo principal} · {n}`). |
| RF-06 | Busca: a partir de 2 caracteres, ignorando maiúsculas e acentos, por nome e chamado em toda a estaca; resultados como `ListItem` (`Avatar`, nome, `{chamado} · {unidade}`); vazio `Ninguém encontrado para "{termo}".` |
| RF-07 | Página da unidade (`/leadership/unit/[id]`): título com o nome da unidade, grupos em ordem (principal, secretários, organizações), cada pessoa como `ListItem`; seção `Acompanhada por` com as pessoas que têm designação com alvo nesta unidade (`{nome} ({chamado})`). |
| RF-08 | Página de grupo da estaca (`/leadership/stake/[group]`): título do grupo e as pessoas em `sort_order`. `Secretários e Sumo Conselho` mostra os dois grupos em sequência. |
| RF-09 | Ficha (`/leadership/person/[id]`): `Avatar large`, nome, chamado, unidade; `Designações` (descrição + alvo como link para a página do alvo: unidade, organização da mesma unidade ou pessoa); para logados com telefone: o número formatado (`(48) 99999-0000`) e os botões `Ligar` e `WhatsApp`; toque longo no número copia e mostra `Telefone copiado`. Visitante: no lugar do telefone, `Entre para ver o telefone.` com link para Entrar. |
| RF-10 | Página de organização (alvo de designação): pessoas do grupo de organizações com aquela `organization` e a seção `Acompanhada por`. |

### 7.3 Edição (só `can_lead` da unidade)

| ID | Requisito |
| -- | --------- |
| RF-11 | Nas páginas de unidade e de grupo, botão `Editar` no cabeçalho ativa o modo de edição: cada grupo ganha `Adicionar pessoa`; cada pessoa ganha setas `Mover para cima`/`Mover para baixo` e abre o formulário ao toque. `Concluir` sai do modo. |
| RF-12 | Formulário `Pessoa`: `Nome` (2–80), `Chamado` (2–80, placeholder `Ex.: 1º Conselheiro`), `Grupo` (só os do nível), `Organização` (só no grupo de organizações), `Telefone` (opcional; máscara `(00) 00000-0000`; 10 ou 11 dígitos), caixa obrigatória `A pessoa autorizou a publicação do nome, do chamado e do telefone.` Mensagens: `Informe o nome.`, `Informe o chamado.`, `Use entre 2 e 80 caracteres.`, `Informe um telefone com DDD.`, `Confirme que a pessoa autorizou a publicação.` |
| RF-13 | `Designações` no formulário: lista com `Adicionar designação` → `Descrição` (1–120, placeholder `Ex.: Responsável pela Ala Içara`) e `Vínculo` (`Nenhum`, `Unidade`, `Organização`, `Pessoa` → lista correspondente da estaca). Mensagens: `Descreva a designação.`, `Use até 120 caracteres.` Cada designação tem `Remover`. |
| RF-14 | Salvar: toast `Pessoa salva`; grava `consent_declared_by = auth.uid()` e `consent_declared_at = now()` a cada salvamento. Excluir: `ConfirmSheet` `Remover da liderança?` / `{nome} deixa de aparecer no organograma.` / `Remover` / `Cancelar`; toast `Pessoa removida.` |
| RF-15 | Designações que apontam para uma pessoa removida são apagadas junto (alvo inexistente). |

### 7.4 Casos de borda

| Situação | Comportamento |
| -------- | ------------- |
| Unidade sem pessoas | `Nenhuma pessoa cadastrada nesta unidade ainda.` |
| WhatsApp não instalado | Abre `https://wa.me/{número}` no navegador |
| Telefone com 10 dígitos (fixo) | Aceito; botão WhatsApp oculto |
| Visitante chama a API de contatos | 0 linhas (RNF-01) |
| Dois líderes reordenam ao mesmo tempo | Vale o último salvamento; a lista é recarregada ao concluir |
| Offline | Organograma do cache sem telefones; ficha mostra `Telefone disponível com conexão.` |

## 8. Especificação de UI/UX

- Como "Liderança (organograma)" do design: overlines `primary` 11/700; cartão do presidente centralizado; grade 2×1 dos conselheiros; listas em blocos brancos raio 16.
- Modo de edição com faixa `primarySubtle` no topo `Modo de edição` e botão `Concluir`.
- Botões `Ligar` (`secondary`, ícone `call`) e `WhatsApp` (`outline`, ícone `chat`) lado a lado.

## 9. Acessibilidade

| ID | Requisito |
| -- | --------- |
| RNF-07 | Pessoas anunciadas como `{nome}, {chamado}`; grupos como cabeçalhos. |
| RNF-08 | Ações de reordenar com rótulos `Mover {nome} para cima`/`para baixo` (sem arrastar como única forma). |
| RNF-09 | Telefone anunciado dígito a dígito (formatado com espaços para o leitor). |

## 10. Estrutura de arquivos esperada

```
supabase/migrations/<ts>_leadership.sql        # posições, contatos, designações, RLS
supabase/tests/leadership.test.sql
supabase/seed.sql                              # alterar: organograma fictício completo
src/domain/leadership.ts (+ test)              # agrupamento, ordem, busca, telefone (máscara/E.164), "acompanhada por"
src/features/leadership/LeadershipScreen.tsx, UnitLeadershipScreen.tsx, StakeGroupScreen.tsx, OrganizationScreen.tsx, PersonScreen.tsx, PersonFormScreen.tsx, DesignationEditor.tsx (+ testes)
src/features/leadership/api.ts
src/app/(tabs)/leadership.tsx, src/app/leadership/unit/[id].tsx, src/app/leadership/stake/[group].tsx, src/app/leadership/organization/[unit]/[org].tsx, src/app/leadership/person/[id].tsx, src/app/leadership/person/edit.tsx
src/i18n/locales/*.json                        # leadership.*
```

## 11. Critérios de aceitação

| ID | Cobre | Dado | Quando | Então |
| -- | ----- | ---- | ------ | ----- |
| CA-01 | RF-01, RF-02, RNF-01 | o seed | `anon` lê posições e contatos | lê posições; contatos retornam 0 linhas |
| CA-02 | RF-04, RF-05 | a aba | abro | presidência, os 2 atalhos com contagem e as 6 unidades com `Bispado · 3` ou `Presidência do ramo · 3` |
| CA-03 | RF-06 | busca `secretario` | digito | aparecem os secretários com `{chamado} · {unidade}` |
| CA-04 | RF-07, RF-10 | sumo conselheiro com designação alvo `Ala Içara` | abro a Ala Içara | `Acompanhada por` mostra `{nome} (Sumo Conselheiro)` |
| CA-05 | RF-09 | logado | abro uma ficha com telefone | vejo o número e `Ligar`/`WhatsApp`; `Ligar` abre `tel:+55...` |
| CA-06 | RF-09 | visitante | abro a mesma ficha | vejo `Entre para ver o telefone.` |
| CA-07 | RF-09 | logado | toque longo no número | `Telefone copiado` |
| CA-08 | RF-11, RNF-03 | `publicador.icara` e `bispo.criciuma1` | abrem a página de Criciúma 1 | só o bispo vê `Editar` |
| CA-09 | RF-12, RNF-04 | formulário sem a caixa de autorização | salvo | `Confirme que a pessoa autorizou a publicação.` |
| CA-10 | RF-12, RNF-05 | telefone `48999990000` | salvo | grava `+5548999990000` e exibe `(48) 99999-0000` |
| CA-11 | RF-03, RF-13 | designação vazia | salvo | `Descreva a designação.` |
| CA-12 | RF-11, RF-14 | modo de edição | movo uma pessoa para cima e concluo | a ordem persiste após recarregar |
| CA-13 | RF-14, RF-15 | pessoa alvo de uma designação | removo | some do organograma e a designação que apontava para ela também |
| CA-14 | 7.4 | telefone fixo de 10 dígitos | abro a ficha (logado) | `Ligar` sim, `WhatsApp` não |
| CA-15 | RNF-02, 7.4 | organograma carregado, offline | reabro e abro uma ficha | organograma do cache, telefone `Telefone disponível com conexão.`; cache sem telefones |
| CA-16 | RNF-07 a RNF-09 | VoiceOver/TalkBack | navego e reordeno | anúncios e ações de RNF-07 a RNF-09 |
| CA-17 | RF-08 | o seed | abro `Secretários e Sumo Conselho` | `Secretários da estaca` e `Sumo conselho` em sequência, cada um em `sort_order` |

## 12. Roteiro de QA

| Passo | Ação | Resultado esperado |
| ----- | ---- | ------------------ |
| 1 | Visitante abre Liderança e a Ala Içara | Nomes e chamados; sem telefones |
| 2 | Abre uma ficha | `Entre para ver o telefone.` |
| 3 | Entra como membro e abre a mesma ficha | Telefone, `Ligar`, `WhatsApp` |
| 4 | `estaca@exemplo.org`: em `Sumo conselho`, adiciona pessoa com telefone, autorização e designação `Responsável pela Ala Içara` → `Unidade: Ala Içara` | Salva; a Ala Içara mostra `Acompanhada por` |
| 5 | Reordena e remove a pessoa | Ordem persiste; remoção apaga a designação |
| 6 | `bispo.criciuma1` edita só Criciúma 1 | `Editar` não aparece em outras unidades |

## 13. Definition of Done

- [ ] `make check` e `make test-db` passam
- [ ] Todo `CA` tem teste automatizado com o ID no nome, ou justificativa de teste manual no plano (CA-16 manual)
- [ ] Roteiro de QA executado sem divergências em iOS e Android
- [ ] Registro de implementação preenchido no plano
- [ ] Nenhum segredo, dado pessoal ou log sensível introduzido (ver `.ai/docs/SECURITY.md`)
- [ ] `SECURITY.md` › Dados tratados com telefones de líderes (pessoal, só logados, consentimento declarado)

## 14. Decisões em aberto

Nenhuma decisão em aberto.

| # | Pergunta | Decisão | Origem |
| - | -------- | ------- | ------ |
| 19 | Contato e designações | Logados veem telefone; visitantes, nome, chamado e designações; bispado, presidência e secretários cadastram designações | usuário |
| 20 | Consentimento do líder | Declaração obrigatória de quem cadastra, com autor e data | usuário |
| 25 | Quem vê telefone | Qualquer pessoa logada | usuário |
| 26 | Formato da designação | Texto (até 120) + vínculo opcional a unidade, organização ou pessoa | usuário |
| 27 | Ações do telefone | `Ligar`, `WhatsApp` e copiar; E.164 | usuário |
| A1 | Grupos do organograma | Lista fixa de RF-01/RF-04 | padrão do projeto |
| A2 | Quem edita | `can_lead` (bispado/secretários da unidade; liderança da estaca para tudo) | padrão do projeto |
| A3 | Reordenar | Setas para cima/baixo (sem arrastar) | padrão do projeto |

## 15. Próximos passos (fora desta entrega)

- Ligar posição a conta do app; foto opcional; horários de atendimento.
