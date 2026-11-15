# Conta: login, consentimento, perfil e acessos

> **Status:** Em implementação
> **Área:** abas `sign-in` e `profile`, rotas `/sign-in/*`, `/welcome`, `/profile/*`, `src/features/auth/`, `src/features/account/`, `src/lib/supabase.ts`, `supabase/migrations/`
> **Última atualização:** 2026-11-14

## 0. Skills obrigatórias

| Skill | Quando usar |
| ----- | ----------- |
| `vercel-react-native-skills` | Telas de login, perfil e acessos |
| `ecc:postgres-patterns` | RPCs `grant_role`, `revoke_role`, `export_my_data`, `delete_my_account` e RLS |
| `ecc:accessibility` | Formulários, campo de código e confirmações |
| `ecc:react-testing` | Testes de tela e de fluxo |

## 1. Contexto

Agenda, mural e liderança funcionam sem conta (RN-01), mas anotações, chamados, publicação e preferências exigem identificar a pessoa. A filiação religiosa é dado sensível (RN-10, `SECURITY.md`): a conta nasce com consentimento explícito e a pessoa pode exportar e excluir seus dados. Líderes recebem papéis pela tela Acessos, operada pela liderança da estaca e pelo admin (decisão 7), usando o modelo de `app-foundation`.

## 2. Objetivo

Uma pessoa entra com código por e-mail, aceita o consentimento no primeiro acesso, ajusta nome, unidade e idioma no Perfil, exporta ou exclui a conta, e a liderança da estaca concede e revoga papéis pela tela Acessos, com registro.

## 3. Estado atual

| Item | Situação | Destino |
| ---- | -------- | ------- |
| `src/lib/supabase.ts` | Cliente sem sessão persistida (`app-foundation`); lê `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Alterar: sessão persistida cifrada (RF-01) e variável renomeada (RF-20) |
| Auth do projeto `estaca-criciuma` (Supabase Cloud) | SMTP do Resend configurado (`supabase-cloud`); template padrão em inglês, só com link | Alterar pelo painel: OTP, rate limits e template (RF-21) |
| `profiles`, `memberships`, `role_grants_log` | Criadas em `app-foundation` | Manter; adicionar RPCs desta spec |
| `useViewer()` | Sempre visitante | Alterar: lê a sessão do Supabase Auth |
| Abas `sign-in` e `profile` | Telas provisórias (`design-system`) | Substituir pelas telas desta spec |
| `ScreenHeader showAvatar` | Pronto | Usar |

## 4. Tecnologias e versões

| Tecnologia | Versão | Situação | Uso nesta entrega |
| ---------- | ------ | -------- | ----------------- |
| Supabase Auth (GoTrue) | do stack | via CLI (local) e painel (produção) | OTP por e-mail |
| `expo-secure-store` | do SDK 58 | adicionar | Chave de cifra da sessão |
| `@react-native-async-storage/async-storage` | do SDK 58 | adicionar | Sessão cifrada |
| `expo-crypto` | do SDK 58 | adicionar | Cifra AES-256-GCM da sessão e chave aleatória (decisão 18; substitui `aes-js` + `react-native-get-random-values`) |
| `expo-sharing` + `expo-file-system` | do SDK 58 | adicionar | Exportar dados |

## 5. Restrições e requisitos não funcionais

| ID | Requisito |
| -- | --------- |
| RNF-01 | A sessão (JWT e refresh token) nunca é gravada em texto puro: fica no AsyncStorage cifrada com AES-256-GCM, chave aleatória guardada no `expo-secure-store`. |
| RNF-02 | A resposta ao pedir código é idêntica com e-mail cadastrado ou não (não revela contas). |
| RNF-03 | Rate limits do GoTrue (decisão 17): no máximo 1 envio de código por e-mail a cada 60 s; 30 e-mails por hora no projeto todo; 10 verificações de código por IP a cada 5 min; código válido por 10 min. |
| RNF-04 | Logs e Sentry nunca recebem e-mail, código, token ou nome. Eventos: `user_signed_in` (método), `account_deleted`, `data_exported`, `role_granted`, `role_revoked` (só ids). |
| RNF-05 | `grant_role` e `revoke_role` são RPCs `security definer` que revalidam no banco quem pode conceder o quê (RF-15) e gravam `role_grants_log` na mesma transação. |
| RNF-06 | Exclusão de conta remove `auth.users` e, em cascata, `profiles`, `memberships`, anotações e tokens de push; publicações (eventos, avisos) ficam com autor `null`. |

## 6. Escopo

### 6.1 Incluso

- Sessão persistida e cifrada; `useViewer()` passa a refletir a sessão.
- Aba Entrar: código por e-mail.
- Template do e-mail do código em pt-BR, com o código em destaque (local e produção).
- Variável `EXPO_PUBLIC_SUPABASE_ANON_KEY` renomeada para `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
- Primeiro acesso (`/welcome`): nome, unidade opcional e consentimento.
- Perfil: nome, unidade, idioma, Acessos (só `stake_leader`/`admin`), exportar dados, política de privacidade, sair, excluir conta.
- Tela Acessos: listar, conceder e revogar papéis e grupos de liderança, com registro.
- Avatar no cabeçalho para todo perfil logado (decisão 8).

### 6.2 Não incluso

- Preferências de push e grupos que a pessoa acompanha (`push-notifications` adiciona uma seção no Perfil).
- Login com Google e Apple (decisão 14; entra numa spec futura).
- Login por senha, SMS ou outros provedores.
- Troca de e-mail da conta.
- Texto da política de privacidade (é uma URL configurável; o conteúdo é responsabilidade da estaca).
- Template visual elaborado do e-mail (logo, cores); o template desta entrega é HTML simples (RF-21).

## 7. Especificação funcional

### 7.1 Entrar

| ID | Requisito |
| -- | --------- |
| RF-01 | Sessão persistida conforme RNF-01, com refresh automático; ao abrir o app com sessão válida, a pessoa já está logada. |
| RF-02 | Aba Entrar: título `Entrar`; texto `Entre para fazer anotações, receber avisos da sua ala e, se você serve na liderança, publicar na agenda.`; campo `E-mail`; botão `Receber código`. |
| RF-03 | Campo `E-mail`: obrigatório, `trim` + minúsculas, formato de e-mail, até 254 caracteres. Erros ao tocar em `Receber código`: vazio → `Informe seu e-mail.`; inválido → `Informe um e-mail válido.` |
| RF-04 | Com e-mail válido, envia OTP de 6 dígitos (validade 10 min) e abre `Digite o código` com `Enviamos um código de 6 dígitos para {email}.`, campo `Código` (6 dígitos, teclado numérico, preenchimento automático do sistema), botão `Entrar`, link `Reenviar código` (desabilitado como `Reenviar em {s} s` por 60 s após cada envio) e link `Usar outro e-mail`. |
| RF-05 | Código errado ou expirado → `Código inválido ou expirado. Confira ou peça um novo.`; limite do servidor → `Muitas tentativas. Aguarde alguns minutos e tente de novo.`; sem rede → `Sem conexão. Verifique a internet e tente de novo.` |
| RF-06 | Removido (decisão 14): sem Google e Apple nesta entrega. |
| RF-07 | Após o login: se `profiles.consented_at` é nulo, abre `/welcome`; senão volta para a tela de onde a pessoa veio (ou `/agenda`). |

### 7.2 Primeiro acesso

| ID | Requisito |
| -- | --------- |
| RF-08 | `/welcome`: título `Boas-vindas`; campo `Como podemos chamar você?` (obrigatório, `trim`, 2–60 caracteres); campo `Unidade que você frequenta` com as 6 unidades (ordem de `unitOrder`, sem Estaca) e `Prefiro não informar` (padrão); caixa de consentimento (texto em 7.5); link `Política de privacidade` (abre `EXPO_PUBLIC_PRIVACY_URL`); botão `Começar`. |
| RF-09 | Erros: nome vazio → `Informe como podemos chamar você.`; fora de 2–60 → `Use entre 2 e 60 caracteres.`; consentimento não marcado → `Para usar sua conta, é preciso concordar com o tratamento dos dados.` |
| RF-10 | `Começar` cria ou atualiza `profiles` com `display_name`, `home_unit_id` (ou nulo), `locale` atual e `consented_at = now()`. Sair desta tela sem concluir encerra a sessão (conta sem consentimento não é usada). |

### 7.3 Perfil

| ID | Requisito |
| -- | --------- |
| RF-11 | `/profile` (aba Perfil do Membro; via avatar para todos): `ScreenHeader` `Perfil`; `Avatar large` + nome + e-mail; itens: `Nome`, `Unidade` (valor atual ou `Não informada`), `Idioma` (`Português (Brasil)`, `English (US)`, `Español (México)`), `Acessos` (só `stake_leader`/`admin`), `Exportar meus dados`, `Política de privacidade`, `Sair`, `Excluir conta` (texto `danger`). |
| RF-12 | Editar `Nome` e `Unidade` usa as mesmas regras e mensagens de RF-08/RF-09; salvar mostra o toast `Perfil atualizado`. Quem tem algum acesso (RF-16a) não pode mudar a unidade para `Não informada`, e quem tem papel de unidade não pode mudar para outra unidade; nesses casos, `Para mudar de unidade, peça à liderança da estaca para remover seus acessos primeiro.` (decisão 20; o banco também bloqueia). Mudar `Idioma` troca a interface na hora e grava `profiles.locale`. |
| RF-13 | `Exportar meus dados`: RPC `export_my_data()` retorna JSON com perfil e papéis (as specs `notes` e `push-notifications` acrescentam anotações e preferências de push à mesma função, decisão 16); o app salva `meus-dados-estaca-criciuma.json` e abre o compartilhamento do sistema. Botão em `loading` durante a geração. |
| RF-14 | `Excluir conta`: `Sheet` com título `Excluir conta`, texto `Isso apaga sua conta, suas anotações e suas preferências. Não dá para desfazer. Digite EXCLUIR para confirmar.`, campo de texto e botão `Excluir conta` (`danger`), habilitado só com o texto exatamente `EXCLUIR`. Confirmado: RPC `delete_my_account()` (RNF-06), encerra a sessão, vai para `/agenda` e mostra o toast `Conta excluída.` `Sair` encerra a sessão e vai para `/agenda`. |

### 7.4 Acessos

| ID | Requisito |
| -- | --------- |
| RF-15 | `/profile/access` (só `stake_leader`/`admin`; outros veem `Acesso restrito`): lista agrupada por unidade (ordem `unitOrder`) com nome, e-mail, papel e grupo. Rótulos de papel: `Liderança da unidade` (`unit_leader`), `Publicação da unidade` (`unit_publisher`), `Liderança da estaca` (`stake_leader`), `Administração` (`admin`). Rótulos de grupo: `Presidência da estaca`, `Bispos`, `Presidentes`, `Nenhum`. |
| RF-16 | `Conceder acesso`: campos `E-mail da conta`, `Unidade` (Estaca + 6), `Papel` (só os válidos para a unidade, RF-03 de `app-foundation`; `Administração` só aparece para `admin`), `Grupo de liderança` (`Presidência da estaca` só com Estaca). Botão `Conceder`. Sucesso: toast `Acesso concedido`. E-mail sem conta → `Nenhuma conta com este e-mail. Peça para a pessoa entrar no app primeiro.`; papel já existente → `Esta pessoa já tem este acesso.` |
| RF-17 | Revogar: no item, `Remover acesso` → `ConfirmSheet` `Remover acesso?` / `{nome} deixa de ter "{papel}" em {unidade}.` / `Remover` (`danger`) / `Cancelar`. Ninguém revoga o próprio acesso: `Você não pode remover o próprio acesso.` |
| RF-16a | Unidade de quem recebe o acesso (decisão 19): todo papel, inclusive `Liderança da estaca` e `Administração`, exige que a pessoa tenha informado a unidade que frequenta; `Liderança da unidade` e `Publicação da unidade` só podem ser concedidos na unidade dela. `Liderança da estaca` vale para quem frequenta qualquer unidade. Sem unidade → `Esta pessoa precisa informar a unidade no Perfil antes de receber um acesso.`; papel de unidade em outra unidade → `Esta pessoa frequenta outra unidade. Papéis de unidade só podem ser dados na unidade dela.` O banco valida (`grant_role`). |
| RF-18 | `stake_leader` concede e revoga `unit_leader`, `unit_publisher` e `stake_leader`; só `admin` concede ou revoga `admin`. Toda concessão e revogação grava `role_grants_log` (RNF-05). |

### 7.4.1 Configuração

| ID | Requisito |
| -- | --------- |
| RF-20 | A variável do app `EXPO_PUBLIC_SUPABASE_ANON_KEY` passa a se chamar `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (o Supabase chama a antiga anon key de publishable key, `sb_publishable_...`). `src/lib/supabase.ts`, testes, `.env.example` e docs usam o nome novo. A mensagem de erro de configuração cita o nome novo. |
| RF-21 | E-mail do código: assunto `Seu código de acesso`; corpo HTML simples em pt-BR: `Use este código para entrar no app da Estaca Criciúma:`, o código `{{ .Token }}` em destaque (fonte grande, espaçada), `O código vale por 10 minutos. Se você não pediu, ignore este e-mail.`; sem link de login. O mesmo assunto e corpo valem para os templates `Magic Link` e `Confirm signup` (o GoTrue usa o segundo no primeiro código de um e-mail novo). Local: `supabase/templates/magic_link.html` referenciado no `config.toml` pelos dois templates, que também fixa OTP de 6 dígitos, validade de 600 s e os rate limits de RNF-03. Produção: o mesmo assunto, corpo, OTP e rate limits aplicados no painel (Authentication › Emails e › Rate Limits), em passos novos do item (e) de `docs/runbooks/provisioning.md`. |

### 7.5 Texto de consentimento (pt-BR, literal)

`Autorizo a Estaca Criciúma a tratar meu nome, meu e-mail e, se eu informar, a unidade que frequento — dado que revela minha crença religiosa — para me identificar no app, me enviar avisos e guardar minhas anotações. Posso exportar ou excluir meus dados a qualquer momento em Perfil.`

### 7.6 Casos de borda

| Situação | Comportamento |
| -------- | ------------- |
| Toque duplo em `Receber código` ou `Entrar` | Botão em `loading`; só uma requisição |
| E-mail não cadastrado pede código | Conta criada no primeiro login bem-sucedido; resposta igual (RNF-02) |
| Sessão expirada sem refresh possível | Volta a visitante e mostra o toast `Sua sessão terminou. Entre de novo.` |
| Papel revogado enquanto a pessoa usa o app | Na próxima carga do viewer (ao voltar ao app ou a cada 5 min), abas e permissões se ajustam (RF-19 de `design-system`) |
| Último `admin` tenta excluir a própria conta | Bloqueado: `Transfira a administração para outra pessoa antes de excluir sua conta.` |
| Falha de rede ao exportar ou excluir | Toast `Sem conexão. Verifique a internet e tente de novo.`; nada é excluído |

## 8. Especificação de UI/UX

- Entrar: logotipo tipográfico (assinatura positiva, "Estaca Criciúma" + `SANTA CATARINA · BRASIL`) no topo; texto de RF-02; campo e botão `primary`.
- Código: 6 caixas de 48×56 que representam um único campo; colar um código de 6 dígitos preenche tudo.
- `/welcome` e formulários do Perfil: `TextField`, seleção de unidade em `Sheet` com `ListItem` + ponto de cor da unidade.
- Perfil: `ListItem` com chevron; `Excluir conta` separado no fim da lista.
- Acessos: `ListItem` com `Avatar`, botão `Conceder acesso` (`primary`) fixo no rodapé.

## 9. Acessibilidade

| ID | Requisito |
| -- | --------- |
| RNF-07 | Campo de código anunciado como um campo `Código de 6 dígitos`, com `textContentType="oneTimeCode"` (iOS) e `autoComplete="sms-otp"` (Android). |
| RNF-08 | Erros anunciados ao aparecer e o foco vai para o primeiro campo inválido. |
| RNF-09 | O contador `Reenviar em {s} s` não é anunciado a cada segundo; só `Reenviar código` quando habilitar. |
| RNF-10 | A caixa de consentimento é um `checkbox` com o texto completo como rótulo. |

## 10. Estrutura de arquivos esperada

```
src/lib/supabase.ts                           # alterar: storage cifrado (RF-01)
src/lib/secureSessionStorage.ts               # LargeSecureStore
src/features/viewer/ViewerProvider.tsx        # alterar: sessão do Supabase Auth
src/features/auth/SignInScreen.tsx, OtpScreen.tsx, WelcomeScreen.tsx (+ testes)
src/features/auth/api.ts                      # OTP e perfil inicial
src/features/account/ProfileScreen.tsx, AccessScreen.tsx, GrantAccessSheet.tsx, DeleteAccountSheet.tsx (+ testes)
src/features/account/api.ts                   # perfil, export, delete, grant/revoke
src/app/(tabs)/sign-in.tsx, src/app/(tabs)/profile.tsx, src/app/sign-in/code.tsx, src/app/welcome.tsx, src/app/profile/access.tsx
supabase/migrations/<ts>_account_rpcs.sql     # export_my_data, delete_my_account, grant_role, revoke_role
supabase/tests/account.test.sql
supabase/config.toml                          # alterar: OTP 6 dígitos/10 min, rate limits, template local
supabase/templates/magic_link.html            # template pt-BR com {{ .Token }} (RF-21)
docs/runbooks/provisioning.md                 # alterar: item de Auth com OTP, rate limits e template no painel (RF-21)
.env.example                                  # alterar: EXPO_PUBLIC_PRIVACY_URL; ANON_KEY → PUBLISHABLE_KEY (RF-20)
src/i18n/locales/*.json                       # chaves auth.*, account.*
```

## 11. Critérios de aceitação

| ID | Cobre | Dado | Quando | Então |
| -- | ----- | ---- | ------ | ----- |
| CA-01 | RF-01, RNF-01 | login concluído | inspeciono o AsyncStorage | a sessão está cifrada (não contém o JWT legível) e a chave está no SecureStore |
| CA-02 | RF-01 | sessão válida | fecho e reabro o app | continuo logado |
| CA-03 | RF-02, RF-03 | a aba Entrar | toco em `Receber código` vazio e depois com `abc@` | vejo `Informe seu e-mail.` e depois `Informe um e-mail válido.` |
| CA-04 | RF-04, RNF-02 | um e-mail válido, cadastrado ou não | toco em `Receber código` | abre `Digite o código` com o e-mail na frase e `Reenviar em 60 s` |
| CA-05 | RF-05 | a tela de código | digito um código errado | vejo `Código inválido ou expirado. Confira ou peça um novo.` |
| CA-06 | RF-05, RNF-03 | o limite de verificações por IP atingido (10 em 5 min; servidor responde 429) | tento outro código | vejo `Muitas tentativas. Aguarde alguns minutos e tente de novo.` |
| CA-07 | RF-02, decisão 14 | iOS e Android | abro a aba Entrar | não há botão de Google nem de Apple; só o campo `E-mail` e `Receber código` |
| CA-08 | RF-20 | o repositório | busco `SUPABASE_ANON_KEY` em `src/`, `.env.example` e docs | nenhuma ocorrência; o cliente lê `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` |
| CA-09 | RF-07, RF-08, RF-09, RF-10 | primeiro login | toco em `Começar` sem marcar o consentimento | vejo a mensagem de RF-09; marcando, o perfil é salvo com `consented_at` e vou para a Agenda |
| CA-10 | RF-10 | a tela `/welcome` | saio sem concluir | a sessão é encerrada |
| CA-11 | RF-11, RF-12 | perfil de membro | mudo o idioma para `English (US)` | a interface muda na hora e `profiles.locale = 'en-US'` |
| CA-12 | RF-13 | perfil com papéis | toco em `Exportar meus dados` | abre o compartilhamento com `meus-dados-estaca-criciuma.json` contendo perfil e papéis |
| CA-13 | RF-14, RNF-06 | o sheet de exclusão | digito `excluir` (minúsculo) | o botão continua desabilitado; com `EXCLUIR`, a conta e as anotações são apagadas, vou para a Agenda e vejo `Conta excluída.` |
| CA-14 | RF-15 | conta `membro` | abro `/profile/access` | vejo `Acesso restrito` |
| CA-15 | RF-16, RF-18 | conta `estaca` | concedo `Liderança da unidade` em `Ala Içara` com grupo `Bispos` a `membro@exemplo.org` | toast `Acesso concedido`, a linha aparece na lista e em `role_grants_log` |
| CA-16 | RF-16 | conta `estaca` | concedo a um e-mail sem conta | vejo `Nenhuma conta com este e-mail. Peça para a pessoa entrar no app primeiro.` |
| CA-17 | RF-16, RF-18 | conta `estaca` | abro a lista de papéis | `Administração` não aparece; para `admin`, aparece |
| CA-18 | RF-17 | conta `estaca` | tento remover meu próprio acesso | vejo `Você não pode remover o próprio acesso.` |
| CA-19 | RF-18, RNF-05 | conta `estaca` | chamo `grant_role` direto pela API para `admin` | o banco nega |
| CA-20 | 7.6 | último `admin` | tento excluir a conta | vejo `Transfira a administração para outra pessoa antes de excluir sua conta.` |
| CA-21 | RNF-04 | o fluxo completo | busco e-mail, código e token nos logs e no Sentry | nenhuma ocorrência |
| CA-23 | RF-21 | o Supabase local e a produção | peço um código | o e-mail chega em pt-BR, assunto `Seu código de acesso`, com os 6 dígitos em destaque e sem link de login; na produção, SPF, DKIM e DMARC `pass` |
| CA-24 | RF-16a | conta `estaca`; pessoa que frequenta `Criciúma 1` | concedo `Liderança da unidade` em `Criciúma 2`; depois em `Criciúma 1`; depois `Liderança da estaca` | a primeira é negada com a mensagem de unidade; as outras duas são concedidas |
| CA-25 | RF-16a | conta `estaca`; pessoa com unidade `Não informada` | concedo qualquer papel, inclusive `Liderança da estaca` | negado com `Esta pessoa precisa informar a unidade no Perfil antes de receber um acesso.`; o `grant_admin.sql` também recusa |
| CA-26 | RF-12 | pessoa com `Liderança da unidade` em `Criciúma 1` | mudo minha unidade para `Criciúma 2` ou `Não informada` no Perfil | vejo `Para mudar de unidade, peça à liderança da estaca para remover seus acessos primeiro.` e a unidade não muda |
| CA-22 | RNF-07 a RNF-10 | as telas com VoiceOver/TalkBack | navego | campos, erros e a caixa de consentimento são anunciados; o código é sugerido pelo teclado do sistema |

## 12. Roteiro de QA

| Passo | Ação | Resultado esperado |
| ----- | ---- | ------------------ |
| 1 | Como visitante, toque em `Entrar` e peça código para um e-mail novo | Código chega (Inbucket local: `http://localhost:54324`) |
| 2 | Digite o código | Abre `Boas-vindas` |
| 3 | Preencha o nome, escolha `Ala Içara`, marque o consentimento e toque em `Começar` | Barra de Membro com 5 abas; avatar no cabeçalho |
| 4 | Feche e reabra o app | Continua logado |
| 5 | Perfil › Idioma › `Español (México)` | Interface em espanhol |
| 6 | Perfil › `Exportar meus dados` | Compartilhamento com o JSON |
| 7 | Entre como `estaca@exemplo.org` › Perfil › Acessos › conceda `Liderança da unidade` em `Ala Içara` à conta do passo 3 | Toast; a conta do passo 3, ao reabrir, mostra a aba Chamados |
| 8 | Remova esse acesso | A conta volta à barra de Membro |
| 9 | Na conta do passo 3, `Excluir conta` com `EXCLUIR` | Volta à Agenda como visitante, toast `Conta excluída.` |
| 10 | No app apontando para a produção, entrar com o e-mail do admin técnico e concluir `Boas-vindas` informando a unidade (RF-16a); depois rodar `supabase/snippets/grant_admin.sql` no SQL Editor com esse e-mail | O e-mail do código chega em pt-BR (CA-23); o snippet retorna `granted` (fecha o CA-12 de `supabase-cloud`); a aba Acessos aparece no Perfil |

## 13. Definition of Done

- [ ] `make check` e `make test-db` passam
- [ ] Todo `CA` tem teste automatizado com o ID no nome, ou justificativa de teste manual no plano (CA-01, CA-07, CA-22, CA-23 e o passo 10 podem ser manuais)
- [ ] Roteiro de QA executado sem divergências em iOS e Android
- [ ] Registro de implementação preenchido no plano
- [ ] Nenhum segredo, dado pessoal ou log sensível introduzido (ver `.ai/docs/SECURITY.md`)
- [ ] `config.toml` com OTP, rate limits e template; as mesmas configurações aplicadas no painel da produção pelo runbook

## 14. Decisões em aberto

Nenhuma decisão em aberto.

| # | Pergunta | Decisão | Origem |
| - | -------- | ------- | ------ |
| 5 | Unidade no cadastro | Opcional, com `Prefiro não informar` | usuário |
| 6 | Papéis de unidade | `unit_leader` e `unit_publisher` | usuário |
| 7 | Como atribuir papéis | Tela Acessos para `stake_leader` e `admin`, com registro | usuário |
| 8 | Acesso ao Perfil do Líder | Avatar no cabeçalho | usuário |
| 13 | Grupos de liderança | Definidos em Acessos junto com o papel | usuário |
| A1 | Métodos de login | Código por e-mail (Google e Apple saíram pela decisão 14) | padrão do projeto, ajustado |
| A2 | Código | 6 dígitos, 10 min, reenvio após 60 s | padrão do projeto |
| A3 | Idioma do e-mail de código | pt-BR (GoTrue não tem template por idioma); texto em RF-21 | padrão do projeto |
| A4 | Armazenamento da sessão | AES-256-GCM no AsyncStorage + chave no SecureStore | padrão do projeto, ajustado pela decisão 18 |
| A5 | Exclusão de conta | Imediata, digitando `EXCLUIR` | padrão do projeto (DESIGN.md) |
| A6 | Formato da exportação | JSON pelo compartilhamento do sistema | padrão do projeto |
| 14 | Google e Apple | Fora desta entrega; só código por e-mail (2026-11-14) | usuário |
| 16 | Exportação com dados de specs futuras | `export_my_data` sai com perfil e papéis; `notes` e `push-notifications` estendem a função. A exclusão já cobre as tabelas futuras pelo `on delete cascade` (2026-11-14) | usuário |
| 17 | Rate limits possíveis no GoTrue | RNF-03 usa o que o Supabase Auth oferece: 60 s por e-mail, 30 e-mails/h no projeto, 10 verificações por IP a cada 5 min. Sem bloqueio próprio por e-mail (2026-11-14) | usuário (`/create-plan`) |
| 19 | Unidade de quem recebe papel | Todo papel exige unidade informada; papéis de unidade só na unidade da pessoa; `stake_leader` vale para qualquer unidade (2026-11-15, QA) | usuário |
| 20 | Troca de unidade com acesso | Bloqueada enquanto o acesso existir; a liderança remove o acesso antes (2026-11-15, QA) | usuário |
| 21 | Lista completa de grupos de liderança | Fora desta entrega: spec própria, que também alimenta organograma e avisos; aqui ficam os 3 grupos atuais (2026-11-15, QA) | usuário |
| 18 | Biblioteca de cifra da sessão | `expo-crypto` (AES-256-GCM nativo, do SDK, funciona no Expo Go) no lugar de `aes-js` + `react-native-get-random-values` (2026-11-14) | usuário (`/create-plan`) |
| 15 | Template do e-mail e nome da chave | Template pt-BR com código em destaque e `PUBLISHABLE_KEY`, pendências levadas de `supabase-cloud` (assessment G-04, plano QA da T-09) (2026-11-14) | usuário |

## 15. Próximos passos (fora desta entrega)

- Spec de grupos de liderança (decisão 21): lista completa de grupos, usada por Acessos, organograma e avisos.

- `push-notifications` adiciona a seção `Avisos` (preferências e grupos acompanhados) no Perfil.
- Troca do e-mail da conta.
- Login com Google e Apple (decisão 14): `expo-web-browser`, `expo-apple-authentication`, credenciais OAuth e provedores no painel.
