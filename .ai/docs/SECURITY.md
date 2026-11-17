# Segurança e privacidade

Usado pelo `/create-spec` (requisitos RNF de segurança), pelo `/create-plan` e como régua pelo agent `assessor`.

**Premissa:** saber que alguém é membro da Igreja revela **convicção religiosa**, dado pessoal sensível pela LGPD (art. 5º, II). Contas, vínculos com unidades e chamados são tratados como sensíveis.

## Dados tratados

| Dado | Classificação | Onde fica | Base legal (LGPD) | Retenção |
| ---- | ------------- | --------- | ----------------- | -------- |
| Eventos, avisos do mural publicados | Público | Postgres (`events`, `posts`), Storage (imagens) | Legítimo interesse (comunicação institucional) | Enquanto publicados; rascunhos excluídos após 90 dias sem edição (A definir na spec) |
| Organograma: nome e chamado de líderes | Público, com consentimento do líder | `member_calls` (pessoas com conta, via `org_chart_members()`); os vínculos de acompanhamento ficam em `high_council_links`, `high_council_units` e `unit_org_links` | Consentimento do líder (art. 11, I): quem tem conta aceita no Perfil (`org_chart_consent = 'accepted'`) e pode desligar a qualquer momento; mudar o catálogo nunca publica ninguém | Até sair do chamado ou desligar |
| Conta: e-mail, nome, idioma | Pessoal | `auth.users`, `profiles` | Consentimento | Até exclusão da conta |
| Telefone da pessoa | Pessoal | `profile_phones` (só o dono lê); exposto só por `org_chart_phones()` | Consentimento: a pessoa informa no Perfil e liga `Mostrar meu telefone no organograma` | Até a pessoa remover o telefone ou excluir a conta (cascata). Só quem tem conta vê, e só com o switch ligado |
| Chamados da pessoa (cargo e unidade) e acesso derivado | **Sensível** (revela filiação religiosa) | `member_calls` (chamados) e `memberships` (só `admin`); catálogo público em `calling_catalog` | Consentimento específico e destacado (art. 11, I) | Até a liderança remover o chamado ou a pessoa excluir a conta (cascata) |
| Anotações pessoais (texto, desenho, lembretes) | **Sensível** | `notes` | Consentimento | Até a pessoa excluir ou excluir a conta |
| Chamados (pessoa indicada, cargo, etapa) | **Sensível / confidencial** | `calling_processes` | A definir com assessoria jurídica da estaca: legítimo interesse **não** se aplica a dado sensível (art. 11); avaliar consentimento do indicado ou outra hipótese do art. 11, II | Excluir 12 meses após a designação (A definir) |
| Aparelho para push: token Expo, unidades assinadas, idioma e plataforma (também de **visitante**, sem conta) | Pessoal | `push_devices` | Consentimento (permissão do sistema; visitante liga em Notificações) | Token removido ao responder `DeviceNotRegistered`, após 180 dias sem uso (job diário) ou, na conta, o vínculo (`user_id`) vira nulo ao excluí-la |
| Histórico de notificações (título, evento ou 1ª linha do aviso), entregas por aparelho e leituras por pessoa | Pessoal (o conteúdo é público) | `notifications`, `notification_deliveries`, `notification_reads` | Consentimento | 90 dias (job diário `push-cleanup`); as leituras vão junto ou na exclusão da conta (cascata) |
| Tentativas de registro de aparelho: hash SHA-256 do IP | Pessoal | `push_register_attempts` | Legítimo interesse (anti-abuso, RNF-02) | 1 dia (job diário) |
| Lembretes de anotações que já dispararam (`reminderLog`) | **Sensível** (título da anotação) | Aparelho: `AsyncStorage` **cifrado** com a chave do `secureSessionStorage` | Consentimento | Até a anotação ser excluída; nunca sobe ao servidor |
| Pauta, decisões e pendências de reuniões | **Confidencial** | `meeting_items` (lida só por `can_lead` da unidade do evento; chave de cache `['meeting', id]`, nunca persistida) | Mesmo caso dos chamados (pautas podem citar membros): A definir com assessoria jurídica | A definir (a spec `event-form` não decide a retenção; os itens somem junto com o evento) |

**Cache no aparelho:** só dado público vai para o disco do aparelho (AsyncStorage, em texto): as queries com chave `['public', ...]` (hoje, os eventos da agenda), por 7 dias (RNF-01, RNF-02). Perfil, chamados, acessos, anotações e pautas usam outras chaves e nunca são persistidos; a sessão continua só no `secureSessionStorage`. `src/lib/queryPersistence.test.ts` (CA-19) falha se uma chave que não seja `public` for aceita.

**Operadores e transferência internacional:** o banco e o Storage ficam nos EUA (Supabase Cloud, região `us-east-1`, ADR 0004), o que é transferência internacional de dados pessoais (LGPD, art. 33). Os operadores são empresas dos EUA: Supabase Inc. (opera e armazena o projeto), Resend (processa o e-mail de quem pede o código de login) e GitHub (guarda o backup cifrado com `age`). A política de privacidade deve informar esses operadores e a transferência internacional.

Direitos do titular (RN-10): **exportar** os próprios dados (JSON, inclui `calls`, `push_devices` e `phone`) e **excluir a conta** pelo app, com exclusão em cascata de `profiles`, `memberships`, `member_calls` (com os vínculos de acompanhamento que a citam), `profile_phones`, `notes`, `notification_reads`; `push_devices` e `notification_deliveries` perdem o vínculo (`user_id` nulo). A exportação inclui `push_devices` (plataforma, idioma, unidades) **sem o token**. Controlador: Estaca Criciúma. Encarregado (DPO): A definir com a presidência da estaca antes do lançamento. Política de privacidade publicada (exigida pelas lojas): A definir antes do envio às lojas.

## Autenticação e autorização

- **Autenticação:** Supabase Auth (Supabase Cloud). Só OTP de 6 dígitos por e-mail, sem senha. Google e "Entrar com a Apple" ficam para uma spec futura (decisão 14 de `auth-account`); a Apple passa a ser obrigatória na App Store quando houver login social.
- **Rate limits do login (RNF-03):** 1 envio de código por e-mail a cada 60 s, 30 e-mails por hora no projeto, 10 verificações por IP a cada 5 min, código válido por 10 min. Local no `supabase/config.toml`; na produção, aplicados no painel (`docs/runbooks/provisioning.md`, item e).
- **Sessão:** JWT e refresh token ficam no `AsyncStorage` **cifrados com AES-256-GCM** (`expo-crypto`); a chave aleatória fica no `expo-secure-store` (Keychain/Keystore). Adaptador: `src/lib/secureSessionStorage.ts` (decisão 18). Se não decifrar, o item é apagado e a pessoa entra de novo. Nunca em texto puro.
- **Visitante:** sem sessão; usa a anon key e só lê o que é público (RN-01).
- **Modelo de permissão (por chamado, spec `roles-of-leadership`):** "membro" é qualquer conta autenticada. O acesso de uma pessoa é a **soma** dos níveis (`access`) dos chamados ativos dela (`member_calls` → `calling_catalog.access`), mais o `admin`, que **não** é chamado e fica em `memberships` (a tabela só aceita `role = 'admin'`, constraint `memberships_admin_only`). O catálogo de chamados (128 iniciais, 3 idiomas) é público para leitura e editável só pelo `admin`, por `save_calling`.

  | Nível (`access`) | Quem tem (exemplos) | Publica agenda, mural e liderança | Vê e edita pautas e chamados | Gerencia acessos |
  | ---------------- | ------------------- | --------------------------------- | ---------------------------- | ---------------- |
  | `unit_leader` | Bispado/presidência de ramo e secretários da unidade | Da própria unidade | Da própria unidade | Não |
  | `unit_publisher` | Presidentes de organizações da unidade | Da própria unidade | **Não** | Não |
  | `stake_publisher` | Presidências de organizações da estaca (ex.: Sociedade de Socorro da Estaca) | **Só a Estaca** | **Não** | Não |
  | `stake_leader` | Presidência, sumo conselho e secretários da estaca | Estaca e todas as unidades | Estaca e todas as unidades | Sim, exceto `admin` |
  | `admin` (`memberships`) | Responsável técnico | Estaca e todas as unidades | **Não** (RN-04) | Sim, inclusive `admin` |

  Chamados de nível `stake` só existem em `estaca`; os de `ward`, `branch` ou `ward_branch`, só na unidade em que a pessoa frequenta (`profiles.home_unit_id`, erros `no_home_unit`, `wrong_unit`, `invalid_unit_for_calling`). Um chamado com `access = 'none'` (ex.: Professor da Escola Dominical) não dá acesso. Mudar o `access` de um chamado vale na hora, para todos que o têm.
- **Funções SQL de permissão** (todas `security definer`, `stable`, `set search_path = public`, mesmos nomes e assinaturas de antes): `has_role(unit, roles[])`, `can_publish(unit)` (`unit_leader` ou `unit_publisher` da unidade, qualquer `stake_leader`, `stake_publisher` só em `estaca`, ou `admin`), `can_lead(unit)` (`unit_leader` da unidade ou qualquer `stake_leader`; nunca `admin`, `unit_publisher` nem `stake_publisher`), `is_admin()`, `is_stake_leader()` e `is_stake_publisher()`. Todas derivam do helper privado `my_accesses()` (execute revogado da API). As mesmas regras existem em `src/domain/permissions.ts` e `src/domain/callings.ts` para a UI; o banco é a barreira real.
- `calling_catalog`, `calling_catalog_log`, `member_calls`, `memberships` e `role_grants_log` **não têm política de escrita** (e o privilégio de escrita é revogado nas três primeiras): concessão e revogação só por RPCs `security definer` que gravam o log na mesma transação (`role_grants_log` com `calling_id`; `calling_catalog_log` com `before` e `after`). Leitura de `calling_catalog`: pública (só ativos; o `admin` lê também os inativos). Leitura de `member_calls` e `memberships`: as próprias linhas, ou todas para `stake_leader` e `admin`. `role_grants_log`: `stake_leader` e `admin`. `calling_catalog_log`: `admin`.
- **RLS ligada em todas as tabelas**, sem exceção. Regras-chave:
  - `events`, `posts`: `select` público só onde `published = true`; escrita conforme RN-02. Em `events`, `insert`/`update`/`delete` só com `can_publish(unit_id)` (mudar a unidade exige `can_publish` nas duas), e `anon` sem privilégio de escrita. O app escreve por RPCs `security definer` (`create_event` idempotente pelo id gerado no aparelho, `update_event`, `delete_event`), com erros curtos em `message` (`forbidden`, `not_found`, `invalid_items`); a pauta (`meeting_items`) nunca usa `admin`. `meeting_items` não aceita `update` e o cliente não consegue forjar `carried_from_*`.
  - `profile_phones`: as 4 operações só com `user_id = auth.uid()`, `anon` sem acesso; a escrita do app passa por `set_my_phone`. `high_council_links`, `high_council_units` e `unit_org_links`: RLS ligada, **sem política** e com `revoke all` para `anon` e `authenticated`; só as RPCs `security definer` as alcançam.
  - `notes`: todas as operações só com `user_id = auth.uid()` (RN-03). Nenhuma política para admin.
  - `calling_processes`, `meeting_items`: usam `can_lead(unit_id)` (só `unit_leader` da unidade e `stake_leader`, RN-04). `admin` **não** tem política.
  - `push_devices`, `push_register_attempts`, `notifications`, `notification_deliveries`: RLS ligada, **sem política** e com `revoke all` para `anon` e `authenticated`. Só as funções `security definer` as alcançam: `register-device` e `send-push` (service role) e as RPCs `my_notifications`, `my_device_units` e `set_device_units`. **O token Expo é a credencial do aparelho** (decisão P1 de `push-notifications`): nenhuma tabela, RPC, resposta ou log o devolve, e o histórico de um visitante só é lido por quem já tem o token. `notification_reads`: só o dono lê e insere.
- **Admin** gerencia unidades, o catálogo de chamados e a Administração; dar um chamado (de qualquer nível) só por `stake_leader` ou `admin`, via RPC auditada.
- **RPCs auditadas de `auth-account`** (`security definer`, `search_path = public`, `execute` só para `authenticated`; a primeira instrução exige `auth.uid()`; erros são códigos curtos em `message`): `complete_welcome` (perfil e consentimento com o relógio do servidor), `export_my_data`, `delete_my_account` (bloqueia o último `admin`), `list_access` (chamados e `admin`). Testes em `supabase/tests/account.test.sql`.
- **RPCs de `roles-of-leadership`** (mesmo padrão): `grant_calling` e `revoke_calling` (só `stake_leader` e `admin`; ninguém remove o próprio chamado; gravam `role_grants_log` com `calling_id`), `grant_admin` e `revoke_admin` (só `admin`), `set_org_chart_consent` (só o dono do chamado), `save_calling` e `calling_holder_count` (só `admin`; `save_calling` recusa mudar o nível ou desativar um chamado que alguém tem) e `org_chart_members()` (pública; só chamados ativos com seção do organograma e consentimento `accepted`; nunca devolve e-mail, `user_id` nem telefone). `grant_role` e `revoke_role` deixaram de existir. `export_my_data` inclui `calls`. Testes em `supabase/tests/callings.test.sql`.
- **RPCs de `leadership`** (mesmo padrão): `set_my_phone` (a própria pessoa; E.164 brasileiro, erro `invalid_phone`), `org_chart_phones()` (só `authenticated`; telefone só de quem aparece no organograma e ligou o switch; visitante recebe `42501`), `set_high_councilor_links` (só `stake_leader`) e `set_unit_org_counselor` (só `can_lead` da unidade; nunca `admin`) e `org_chart_links()` (pública; nunca devolve o `member_call_id` do conselheiro, `user_id`, e-mail nem telefone; um sumo conselheiro que não aparece no organograma não aparece nos vínculos). `org_chart_counselor_call` é auxiliar privado, sem `execute` para a API. `export_my_data` inclui `phone`. Testes em `supabase/tests/leadership.test.sql`.
- Envio de push: só pela Edge Function `send-push`, que verifica o JWT e chama `push_prepare`; o banco revalida se quem publicou tem `can_publish(unit do item)`, se o público é válido para a unidade e o limite de 1 envio por item a cada 10 minutos (RN-02, RN-08, RNF-03). `register-device` aceita visitante (publishable key) e limita 10 registros por IP por hora (hash do IP). As duas funções têm `verify_jwt = false` e verificam o chamador por conta própria (ADR 0006). A service role key só existe nos secrets das Edge Functions.

## Segredos

- Segredos só em variáveis de ambiente ou no cofre de segredos do ambiente (EAS Secrets, secrets das Edge Functions, GitHub Actions). Nunca no código, em logs, em testes ou em commits.
- `EXPO_PUBLIC_*` vai para dentro do app e é **público**: só URL do Supabase, anon key e DSN do Sentry. Service role key, `EXPO_ACCESS_TOKEN`, `SENTRY_AUTH_TOKEN` jamais com esse prefixo.
- `.env.example` documenta toda variável necessária, com valor fictício.
- Agentes de IA não leem `.env*` (bloqueado em `.claude/settings.json`).
- Segredo vazado é revogado e trocado na hora; remover do histórico não basta. Para JWT secret do Supabase, isso invalida todas as sessões.

## Infra (Supabase Cloud)

- O Postgres só é acessível pela API do Supabase e pelo session pooler, com senha de banco de 32 caracteres.
- Painel do Supabase e do Resend só para o admin técnico, com 2FA ligado (organização do Supabase com e-mail da estaca).
- Backup diário da produção, cifrado com `age` antes do upload, artefato de 30 dias, com teste de restauração trimestral (`docs/runbooks/backup.md`). A chave privada existe só no gerenciador de senhas do admin técnico.
- Segredos só em Environments do GitHub (`production`, `production-backup`), nos painéis e no gerenciador de senhas; nunca no repositório nem em log de workflow.

## Checklist para toda feature

Baseado no OWASP Top 10 e OWASP MASVS. O assessor verifica estes itens no diff.

- [ ] Toda tabela nova tem RLS ligada e políticas para cada operação, com teste de acesso **negado** (`supabase/tests/`).
- [ ] Toda ação verifica **autorização** no banco (RLS/RPC), não só escondendo botão no app: a pessoa pode agir sobre **este** recurso desta **unidade**?
- [ ] Toda entrada externa é validada no servidor (constraints/`check` no Postgres, validação na RPC/Edge Function) com tipo, formato e tamanho, mesmo que o app também valide.
- [ ] Consultas parametrizadas; nada de SQL montado com concatenação em RPC ou Edge Function.
- [ ] Links de eventos aceitam só `https://`; conteúdo do usuário nunca é renderizado como HTML/WebView.
- [ ] Mensagens de erro não expõem stack trace, SQL ou a existência de contas (ex.: OTP responde igual para e-mail cadastrado ou não).
- [ ] Login por OTP e envio de push têm rate limit (GoTrue e Edge Function).
- [ ] Nenhum dado pessoal, conteúdo de anotação ou chamado em log ou no Sentry (ver `O11Y.md`).
- [ ] Uploads (imagens do mural) validam tipo (jpeg/png/webp) e tamanho (máx. 5 MB) no bucket do Storage.
- [ ] Dado sensível novo atualiza a tabela "Dados tratados" acima e a exportação/exclusão de conta.
- [ ] Dependências novas sem vulnerabilidades conhecidas (`npm audit --omit=dev`).

## Reporte de vulnerabilidades

Enviar para o admin técnico do app (A definir: e-mail de contato publicado na página de suporte das lojas). Não abrir issue pública. Resposta em até 7 dias.
