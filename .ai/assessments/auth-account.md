# Assessment: Conta — login, consentimento, perfil e acessos

> **Spec:** `.ai/specs/auth-account.md`
> **Plano:** `.ai/plans/auth-account.md`
> **Veredito atual:** PASS_WITH_GAPS

---

## Rodada 1 — 2026-11-15

**Veredito:** PASS_WITH_GAPS
**Resumo:** `make check` e `make test-db` passam, e nenhum CA está ❌. Os CA-01 (aparelho), CA-22, CA-23 e o passo 10 seguem ⚠️ porque a T-13 está pendente, como já declarado. Não há problema de segurança nem item fora do escopo. O veredito não é PASS porque a spec (seção 13) exige o roteiro de QA completo e esses itens não têm evidência.

### Verificações objetivas

| Comando | Resultado | Observação |
| ------- | --------- | ---------- |
| `make lint` | ✅ | `expo lint`, `tsc` e `prettier --check` sem erros |
| `make test` | ✅ | 43 suites, 256 testes, 0 falhas; cobertura de `src/lib` 80,45% (`appFocus.ts` 0%, mas o agregado fica acima do mínimo de 80%) |
| `make build` | ✅ | `expo export` gerou o bundle iOS (1505 módulos) e o Android (1500 módulos) |
| `make check` | ✅ | Rodou os três acima |
| `make test-db` | ✅ | Supabase local ativo. `account.test.sql` e `base_rls.test.sql`, 107 testes, `Result: PASS` |

### Critérios de aceitação

| CA | Status | Evidência |
| -- | ------ | --------- |
| CA-01 | ⚠️ | O teste `CA-01` em `src/lib/secureSessionStorage.test.ts` mostra que o JWT não aparece no AsyncStorage e que a chave está no SecureStore. A inspeção no aparelho (T-13) não foi feita. |
| CA-02 | ✅ | `src/lib/authSession.test.tsx` (CA-02, `getSession` leva a `signedIn`). O usuário relata ter fechado e reaberto o app logado no iPhone, mas sem evidência além da conversa. |
| CA-03 | ✅ | `SignInScreen.test.tsx` e `email.test.ts` (vazio e `abc@`). As mensagens em `pt-BR.json` batem com a spec. |
| CA-04 | ✅ | `SignInScreen.test.tsx` (toque duplo chama `requestCode` uma vez) e `OtpScreen.test.tsx` (e-mail na frase, `Reenviar em 60 s`). |
| CA-05 | ✅ | `OtpScreen.test.tsx` (CA-05). |
| CA-06 | ✅ | `OtpScreen.test.tsx` (CA-06, `rate_limited`) e `api.test.ts` (429). `config.toml` tem `token_verifications = 10`, `email_sent = 30`, `max_frequency = "60s"`, `otp_expiry = 600` e `otp_length = 6`. |
| CA-07 | ✅ | `SignInScreen.test.tsx` (CA-07, sem Google/Apple). A conferência visual em iOS/Android é manual. |
| CA-08 | ✅ | `src/lib/envNames.test.ts` passa. O grep de `SUPABASE_ANON_KEY` em `src`, `.env.example`, `docs`, `.ai/docs`, `README.md` e `AGENTS.md` não achou nada. |
| CA-09 | ✅ | `WelcomeScreen.test.tsx` (CA-09) e pgTAP de `complete_welcome` em `account.test.sql`. O bug de logout após `Começar` foi corrigido em a20f746, com regressão em `SessionEffects.test.tsx`. |
| CA-10 | ✅ | `WelcomeScreen.test.tsx` (CA-10, `onBack` chama `signOut`). |
| CA-11 | ✅ | `ProfileScreen.test.tsx` (CA-11, `English (US)` troca a interface na hora e chama `updateProfile` com `en-US`). |
| CA-12 | ✅ | `account/api.test.ts` (grava `meus-dados-estaca-criciuma.json` e chama `shareAsync`) e pgTAP de `export_my_data`. |
| CA-13 | ✅ | `DeleteAccountSheet.test.tsx` (`excluir` mantém o botão desabilitado; `EXCLUIR` exclui) e pgTAP de `delete_my_account`. |
| CA-14 | ✅ | `AccessScreen.test.tsx` (CA-14). |
| CA-15 | ✅ | `GrantAccessSheet.test.tsx` (CA-15) e pgTAP (linha em `memberships` e `role_grants_log` com `actor_id`). |
| CA-16 | ✅ | `GrantAccessSheet.test.tsx` e pgTAP (`no_account`). |
| CA-17 | ✅ | `GrantAccessSheet.test.tsx` e `access.test.ts`. |
| CA-18 | ✅ | `AccessScreen.test.tsx` e pgTAP (`cannot_revoke_self`). |
| CA-19 | ✅ | pgTAP: `stake_leader` concedendo `admin` retorna `not_authorized`, e a migration revalida no banco (`grant_role`, `p_role = 'admin' and not is_admin()`). |
| CA-20 | ✅ | `DeleteAccountSheet.test.tsx` e pgTAP (`last_admin`). |
| CA-21 | ✅ (app) / ⚠️ (logs do Supabase) | O teste do `OtpScreen` usa spy em `track` e `console`. `telemetry.ts` só aceita ids. A busca nos logs do Supabase e do Sentry é manual (T-13). |
| CA-22 | ⚠️ | Não testado com VoiceOver/TalkBack. O código tem `accessibilityLabel` no `CodeField`, `textContentType="oneTimeCode"`, `autoComplete="sms-otp"` e o checkbox com `role=checkbox`, mas a verificação é manual. |
| CA-23 | ⚠️ | O template local está correto: `magic_link.html` com `{{ .Token }}` em 32 px e `letter-spacing: 6px`, sem link, e os dois templates (`magic_link` e `confirmation`) no `config.toml`. O plano registra o e-mail conferido no Mailpit. Produção e SPF/DKIM/DMARC não foram verificados. |
| CA-24 | ✅ | pgTAP em `account.test.sql`: `wrong_unit`, concessão em `criciuma1` e `stake_leader`. `grant_role` em `20261115173955_role_home_unit.sql` (`wrong_unit` depois de `no_home_unit`). Teste de componente em `GrantAccessSheet.test.tsx`. |
| CA-25 | ✅ | pgTAP (`no_home_unit`, inclusive para `stake_leader` e `admin`). `grant_admin.sql` devolve `error: user has no home unit`. Componente testado. |
| CA-26 | ✅ | Trigger `profiles_guard_home_unit` e pgTAP (`home_unit_locked` para outra unidade e para null com `unit_leader`; só `stake_leader` muda entre alas e é bloqueado para null). `ProfileScreen.test.tsx` cobre a mensagem. |

### Requisitos, escopo e restrições

| Item | Status | Evidência |
| ---- | ------ | --------- |
| RF-01 a RF-05, RF-07 a RF-18, RF-16a (copy literal) | ✅ | Conferi em `pt-BR.json`, caractere por caractere, as seções `auth.*` e `account.*` contra a spec. Cobrem os textos de RF-02/03/04/05, RF-08/09, RF-11, RF-12 (`unitLocked`), RF-14, RF-15, RF-16/16a, RF-17 e 7.5, mais `sessionExpired` e `lastAdmin`. Nenhuma divergência. |
| RF-20 / RF-21 | ✅ | O nome novo da variável está em uso, e `config.toml`, `magic_link.html` e o runbook conferem. A aplicação no painel de produção está pendente (T-13). |
| Escopo: nada fora da spec | ✅ | Sem Google/Apple, sem troca de e-mail e sem preferências de push. Os commits 775564e e 6da399f só alteram `.ai/specs/*.md`, sem código. |
| Restrições (seção 5) e RULES.md | ✅ | RNF-01 e RNF-05 conferem no código, e o `track` não recebe e-mail nem nome. Os desvios do plano (`ListItem`, `Sheet`, `Viewer.loaded`, chaves extras de i18n) estão registrados e justificados. |
| Plano: tarefas concluídas e desvios registrados | ⚠️ | T-01 a T-12 e T-14 estão marcadas. A T-13 está `[ ]`, o que é esperado. O Registro de implementação está preenchido. |
| Segurança | ✅ | Não encontrei segredos. As RPCs são `security definer` com `search_path` fixo e validam o chamador. O trigger cobre atualizações diretas pela API e o `on conflict` do `complete_welcome`. O `npm audit` aponta `deepmerge` via `jest`, anterior a esta spec e registrado no plano. |
| DoD (seção 13) | ⚠️ | `make check`, `make test-db` e o registro de implementação estão ✅. O roteiro de QA em iOS e Android, a verificação do Android e a aplicação da config no painel de produção estão pendentes. |

### Lacunas

| # | ID | Bloqueante | O que está errado | Evidência | O que precisa acontecer |
| - | -- | ---------- | ----------------- | --------- | ----------------------- |
| 1 | T-13 / roteiro de QA | não (para merge condicionado ao QA) | O QA em aparelho está incompleto. Passos 1 a 9 só em iPhone contra o Supabase local, sem registro. Falta Android. As regras de T-14 não foram testadas no aparelho. | Plano `[ ] T-13`; contexto da rodada | Executar nos dois sistemas, incluindo CA-24, CA-25 e CA-26 no aparelho, e registrar o resultado no plano. |
| 2 | CA-01 (aparelho) | não | A inspeção do AsyncStorage no aparelho não foi feita. | Só o teste unitário em `secureSessionStorage.test.ts` | Ler o AsyncStorage pelo depurador e confirmar que não há JWT legível e que a chave está no SecureStore. |
| 3 | CA-22 | não | A verificação com VoiceOver/TalkBack não foi feita. | Nenhum registro | Navegar pelas telas de Entrar, Código, Boas-vindas e Perfil com os dois leitores. Confirmar o anúncio dos campos, dos erros e do consentimento, e a sugestão do código pelo teclado. |
| 4 | CA-23 e passo 10 | não, mas bloqueia o fechamento da spec | A produção não foi verificada: o painel (passos 4 a 6 do runbook, item e), o e-mail em pt-BR com SPF/DKIM/DMARC `pass` e o `grant_admin.sql` com `granted`. A migration `role_home_unit` ainda precisa ser publicada pelo `deploy.yml`. | Plano T-13 | Depois do merge e do deploy, aplicar a config no painel e executar o passo 10. A aba Acessos deve aparecer. Isso também fecha o CA-12 de `supabase-cloud`. |
| 5 | CA-21 (logs) | não | A busca nos logs do Supabase e no Sentry está pendente. | Teste só no app | Buscar e-mail, código e token nos logs depois do QA. |
| 6 | CA-21 / rastreabilidade | não, menor | O ID `CA-21` aparece em poucos testes. O teste automatizado é de uma única ocorrência, o que dificulta a rastreabilidade. | `OtpScreen.test.tsx` | Opcional: garantir que o nome do teste contenha `CA-21` explicitamente, se ainda não contiver. |

### Rodadas anteriores

Primeira rodada.
