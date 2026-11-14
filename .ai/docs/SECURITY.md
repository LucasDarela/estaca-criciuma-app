# Segurança e privacidade

Usado pelo `/create-spec` (requisitos RNF de segurança), pelo `/create-plan` e como régua pelo agent `assessor`.

**Premissa:** saber que alguém é membro da Igreja revela **convicção religiosa**, dado pessoal sensível pela LGPD (art. 5º, II). Contas, vínculos com unidades e chamados são tratados como sensíveis.

## Dados tratados

| Dado | Classificação | Onde fica | Base legal (LGPD) | Retenção |
| ---- | ------------- | --------- | ----------------- | -------- |
| Eventos, avisos do mural publicados | Público | Postgres (`events`, `posts`), Storage (imagens) | Legítimo interesse (comunicação institucional) | Enquanto publicados; rascunhos excluídos após 90 dias sem edição (A definir na spec) |
| Organograma: nome e chamado de líderes | Público, com aviso ao líder | `leadership_positions` | Consentimento do líder ao ser cadastrado (art. 11, I) | Até sair do chamado |
| Conta: e-mail, nome, idioma | Pessoal | `auth.users`, `profiles` | Consentimento | Até exclusão da conta |
| Vínculo com unidade e papel | **Sensível** (revela filiação religiosa) | `memberships` | Consentimento específico e destacado (art. 11, I) | Até exclusão da conta |
| Anotações pessoais (texto, desenho, lembretes) | **Sensível** | `notes` | Consentimento | Até a pessoa excluir ou excluir a conta |
| Chamados (pessoa indicada, cargo, etapa) | **Sensível / confidencial** | `calling_processes` | A definir com assessoria jurídica da estaca: legítimo interesse **não** se aplica a dado sensível (art. 11); avaliar consentimento do indicado ou outra hipótese do art. 11, II | Excluir 12 meses após a designação (A definir) |
| E-mail do destinatário do OTP | Pessoal | Resend (EUA), só em trânsito | Consentimento | Não armazenado pelo app; logs do Resend conforme a política do fornecedor |
| Tokens de push e preferências | Pessoal | `push_tokens`, `notification_preferences` | Consentimento (permissão do sistema) | Token removido ao sair, ao desinstalar (erro `DeviceNotRegistered`) ou ao excluir a conta |
| Pauta, decisões e pendências de reuniões | **Confidencial** | `meeting_items` | Mesmo caso dos chamados (pautas podem citar membros): A definir com assessoria jurídica | A definir na spec da agenda |

Direitos do titular (RN-10): **exportar** os próprios dados (JSON) e **excluir a conta** pelo app, com exclusão em cascata de `profiles`, `memberships`, `notes`, `push_tokens`. Controlador: Estaca Criciúma. Encarregado (DPO): A definir com a presidência da estaca antes do lançamento. Política de privacidade publicada (exigida pelas lojas): A definir antes do envio às lojas. **Transferência internacional (LGPD, art. 33):** o Resend, nos EUA, processa o e-mail de quem pede o código de login; isso deve constar na política de privacidade. Todo o resto fica no Brasil (VM e Object Storage da Oracle na região de São Paulo).

## Autenticação e autorização

- **Autenticação:** Supabase Auth (GoTrue) self-hosted. OTP de 6 dígitos por e-mail, Google e "Entrar com a Apple" (obrigatório na App Store quando há login social). Sem senha.
- **Sessão:** JWT do Supabase com refresh token guardado no `expo-secure-store` (Keychain/Keystore), nunca em `AsyncStorage`.
- **Visitante:** sem sessão; usa a anon key e só lê o que é público (RN-01).
- **Modelo de permissão:** "membro" é qualquer conta autenticada e **não** tem linha em `memberships`. Papéis elevados ficam em `memberships(user_id, unit_id, role, leadership_group)`:

  | Papel | Quem é | Publica agenda, mural e liderança | Vê e edita pautas e chamados | Gerencia acessos |
  | ----- | ------ | --------------------------------- | ---------------------------- | ---------------- |
  | `unit_leader` | Bispado/presidência de ramo e secretários | Da própria unidade | Da própria unidade | Não |
  | `unit_publisher` | Presidentes de organizações da unidade | Da própria unidade | **Não** | Não |
  | `stake_leader` | Presidência, sumo conselho e secretários da estaca | Estaca e todas as unidades | Estaca e todas as unidades | Sim, exceto `admin` |
  | `admin` | Responsável técnico | Estaca e todas as unidades | **Não** (RN-04) | Sim, inclusive `admin` |

  `stake_leader` e `admin` só existem com `unit_id = 'estaca'`; `unit_leader` e `unit_publisher`, só em ala ou ramo (constraint `invalid_unit_for_role`).
- **Funções SQL de permissão** (todas `security definer`, `stable`, `set search_path = public`): `has_role(unit, roles[])`, `can_publish(unit)` (líder ou publicador da unidade, qualquer `stake_leader` ou `admin`), `can_lead(unit)` (`unit_leader` da unidade ou qualquer `stake_leader`; nunca `admin` nem `unit_publisher`), `is_admin()` e `is_stake_leader()`. As mesmas regras existem em `src/domain/permissions.ts` para a UI; o banco é a barreira real.
- `memberships` e `role_grants_log` **não têm política de escrita**: concessão e revogação de papéis só por RPCs `security definer` que gravam `role_grants_log` na mesma transação. Leitura de `memberships`: as próprias linhas, ou todas para `stake_leader` e `admin`. Leitura de `role_grants_log`: `stake_leader` e `admin`.
- **RLS ligada em todas as tabelas**, sem exceção. Regras-chave:
  - `events`, `posts`, `leadership_positions`: `select` público só onde `published = true`; escrita conforme RN-02.
  - `notes`: todas as operações só com `user_id = auth.uid()` (RN-03). Nenhuma política para admin.
  - `calling_processes`, `meeting_items`: usam `can_lead(unit_id)` (só `unit_leader` da unidade e `stake_leader`, RN-04). `admin` **não** tem política.
  - `push_tokens`, `notification_preferences`: só o dono; leitura em massa só pela Edge Function com service role.
- **Admin** gerencia unidades e papéis; promover alguém a `unit_leader`/`stake_leader` só por `stake_leader` ou `admin`, via RPC auditada.
- Envio de push: só pela Edge Function `send-push`, que revalida no servidor se quem publicou tem papel na unidade e se o público escolhido é permitido (RN-02, RN-08).

## Segredos

- Segredos só em variáveis de ambiente ou no cofre de segredos do ambiente (EAS Secrets, secrets das Edge Functions, GitHub Actions). Nunca no código, em logs, em testes ou em commits.
- `EXPO_PUBLIC_*` vai para dentro do app e é **público**: só URL do Supabase, anon key e DSN do Sentry. Service role key, `EXPO_ACCESS_TOKEN`, `SENTRY_AUTH_TOKEN` jamais com esse prefixo.
- `.env.example` documenta toda variável necessária, com valor fictício.
- Agentes de IA não leem `.env*` (bloqueado em `.claude/settings.json`).
- Segredo vazado é revogado e trocado na hora; remover do histórico não basta. Para JWT secret do Supabase, isso invalida todas as sessões.

## Infra self-hosted

- Hospedagem: uma VM Oracle Cloud Ampere A1 (Brasil) com dois stacks Supabase isolados (homologação e produção), decisão em [ADR 0003](../adrs/0003-hospedagem-supabase-oracle.md). Passo a passo em `docs/runbooks/provisioning.md`.
- Portas públicas: só 22, 80 e 443 (Security List da Oracle e `ufw`). Todas as portas dos containers fazem bind em `127.0.0.1`; o Caddy (TLS, HSTS) encaminha ao gateway (Envoy) só `/auth/v1/`, `/rest/v1/`, `/storage/v1/`, `/functions/v1/` e `/realtime/v1/`; o resto responde 404.
- Postgres e Supabase Studio só por túnel SSH (`ssh -L`), nunca públicos. SSH só por chave, sem login de root, `fail2ban` e `unattended-upgrades` ativos.
- Isolamento entre ambientes: usuário Linux, diretório, projeto Compose, rede, volumes, segredos, senha do restic e check de backup próprios. Risco residual aceito: quem tem `root` ou acesso ao daemon Docker da VM alcança os dois ambientes.
- Segredos em `/opt/estaca/<env>/.env` (modo 600, dono `estaca-<env>`), gerados no servidor e copiados para o gerenciador de senhas do admin técnico.
- Backup diário às 03:00 (`America/Sao_Paulo`) com restic, cifrado no servidor, para o Oracle Object Storage (repositório por ambiente), retenção de 30 diários e teste de restauração trimestral (`docs/runbooks/backup.md`).
- Atualizações de segurança do stack Supabase (commit fixado em `infra/supabase/VERSION`, aplicado primeiro na homologação) e do SO aplicadas mensalmente.

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
