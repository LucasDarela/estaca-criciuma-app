# Assessment: Notificações push e histórico

> **Spec:** `.ai/specs/push-notifications.md`
> **Plano:** `.ai/plans/push-notifications.md`
> **Veredito atual:** PASS_WITH_GAPS

<!--
O cabeçalho acima é criado na rodada 1 e só o "Veredito atual" muda depois.
Cada execução de /assessment-spec acrescenta uma seção "Rodada N" no fim do arquivo.
O agent assessor devolve exatamente a seção abaixo, preenchida.
-->

---

## Rodada 1 — 2026-11-16

**Veredito:** PASS_WITH_GAPS
**Resumo:** `make check` e `make test-db` passam, e nenhum CA está ❌. Os pendentes são o que depende de aparelho físico e de credenciais: CA-05, CA-17 com o app fechado e CA-24 com leitor de tela. O mesmo vale para a T-14 (`eas init`, APNs/FCM, QA em iOS e Android), que ficou aberta e é requisito do DoD da spec.

### Verificações objetivas

| Comando | Resultado | Observação |
| ------- | --------- | ---------- |
| `make lint` | ✅ | Roda dentro do `make check` (exit 0) |
| `make test` | ✅ | 79 suítes, 679 testes, 0 falhas |
| `make build` | ✅ | Bundles iOS e Android exportados. Aviso na saída: `Could not parse Expo config: android.googleServicesFile: "./google-services.json"` (arquivo ausente, ver lacuna 4) |
| `make check` | ✅ | exit 0 |
| `make test-db` | ✅ | Docker e supabase local disponíveis. 5 arquivos, 295 asserções, `Result: PASS`, incluindo `push.test.sql` |

### Critérios de aceitação

| CA | Status | Evidência |
| -- | ------ | --------- |
| CA-01 | ✅ | `supabase/tests/push.test.sql:31-66`. A recebe só as suas entregas, B só as suas, e nenhuma coluna devolvida contém token. `anon` e `authenticated` levam `42501` ao ler `push_devices`, `notifications` e `notification_deliveries`. Passou em `make test-db`. |
| CA-02 | ✅ | `push.test.sql:72-80` e `src/lib/push.test.ts:121`. |
| CA-03 | ✅ | `push.test.sql:82-101` (user_id vai e volta, `units` fica). `push.test.ts:143` e `PushEffects.test.tsx:133` (registro forçado ao trocar de usuário). |
| CA-04 | ✅ | `push.test.sql:126-135` e `_shared/registerDevice.test.ts`. A 11ª tentativa recebe 429 e nada é gravado. |
| CA-05 | ⚠️ | O código está coberto por `EnablePushSheet.test.tsx:46`, `PushEffects.test.tsx:208` e `push.test.ts:85`. O diálogo real do sistema só se confere em aparelho (T-14, não feita). |
| CA-06 | ✅ | `NotificationsScreen.test.tsx:226`. Copy conferida em `pt-BR.json`: `notifications.card.disabled` e `openSettings` batem com a spec. |
| CA-07 | ✅ | `AudiencePicker.test.tsx` e `audience.test.ts`. `push.audience.summary.everyone.ward` = "Todos os membros da ala com o app receberão o aviso." |
| CA-08 | ✅ | `AudiencePicker.test.tsx` e `audience.test.ts`. Texto igual ao da spec. |
| CA-09 | ✅ | `push.test.sql:246-257` (banco) e `audience.test.ts` (espelho `isRecipient`). |
| CA-10 | ✅ | `push.test.sql:259-265` e `audience.test.ts`. |
| CA-11 | ✅ | `notifications.test.ts`, `_shared/pushContent.test.ts` e `_shared/sendPush.test.ts` (título, corpo e `data`). |
| CA-12 | ✅ | `push.test.sql:301` (`forbidden`), `sendPush.test.ts` (403) e `push.test.ts` (`PushError('forbidden')`). Mensagem igual à da spec. |
| CA-13 | ✅ | `push.test.sql:347-362` (rate limit e liberação após `push_discard`), `sendPush.test.ts` (429) e `push.test.ts`. Mensagem igual à da spec. |
| CA-14 | ✅ | `push.test.sql:364-370` e `sendPush.test.ts` (`DeviceNotRegistered` chama `removeDevices`). |
| CA-15 | ✅ | `NotificationsScreen.test.tsx:102` e `notifications.test.ts:43`. As 3 seções aparecem e a de 100 dias fica de fora. |
| CA-16 | ✅ | `NotificationsScreen.test.tsx:158`, `notificationInbox.test.tsx:176` e `AgendaScreen.test.tsx:196` (ponto e rótulo do sino). |
| CA-17 | ⚠️ | Listener e `getLastNotificationResponseAsync` têm teste (`PushEffects.test.tsx:157,179`), e a lista também (`NotificationsScreen.test.tsx:171`). O toque real no banner com o app fechado é manual (T-14, não feita). |
| CA-18 | ✅ | `push.test.sql:137-147`, `notifications.test.ts:106`, `NotificationPrefsCard.test.tsx:74` e `notifications/api.test.ts:27`. |
| CA-19 | ✅ | `NotificationsScreen.test.tsx:132`, `notificationInbox.test.tsx:100` e `notifications.test.ts:90`. |
| CA-20 | ✅ | `push.test.sql:154-162`, `NoticesSection.test.tsx:68` e `account/api.test.ts:114`. |
| CA-21 | ✅ | `push.test.sql:208-235` (91 dias apaga notificação, entregas e leituras; 89 dias fica; job `push-cleanup` agendado). |
| CA-22 | ✅ | `_shared/sendPush.test.ts:304,340` e `_shared/registerDevice.test.ts:150`. Os logs não têm token, IP, e-mail nem nome, e têm os campos obrigatórios. `index.ts` só faz `console.log(JSON.stringify(entry))`. |
| CA-23 | ✅ | `sendPush.test.ts:215,227` (502 `push_unavailable` e `discard`) e `push.test.ts:187` (`PushError('unavailable')` com a mensagem da spec). A tela do formulário é de `event-form` e `board`. |
| CA-24 | ⚠️ | Parcial. Há testes de rótulo para `Não lida` (`NotificationsScreen.test.tsx:150`, RNF-09), interruptores (`NotificationPrefsCard.test.tsx:89`, RNF-10), `checkbox` e `checked` (`AudiencePicker.test.tsx:79`), anúncio do resumo (`:85`) e sino "há não lidas" (`AgendaScreen.test.tsx:196`). A navegação com VoiceOver e TalkBack não foi feita (T-14). |

### Requisitos, escopo e restrições

| Item | Status | Evidência |
| ---- | ------ | --------- |
| RF-05, RF-06, RF-08, RF-13, RF-14, RF-18, RF-21, RF-12, RNF-03 e 7.7 (copy literal) | ✅ | Conferido caractere por caractere em `pt-BR.json`: chaves `push.*`, `notifications.*`, `calendar.notificationsUnread` ("Notificações, há não lidas") e `account.profile.notices|groups|groupsHint`. |
| Rótulos de RF-09 | ✅ (desvio previsto) | Os grupos de liderança usam `callings.groups.*`, conforme o ajuste de `roles-of-leadership` na própria spec (RF-09 e 2.7 do plano). |
| RF-01 a RF-04, RF-10 | ✅ | Migration `20261116021430_push.sql` e `push.test.sql` (295 asserções passaram). |
| RF-07, RF-22, RF-16, RF-19, RF-20 | ✅ | `push.ts`, `PushEffects.tsx`, `notificationInbox.ts` e `AgendaScreen.tsx`, com testes. |
| Escopo: nada fora da spec | ✅ | Não há botão `Notificar` em formulário nem agendamento de lembretes. `/dev/push` é só `__DEV__` e o plano a prevê. `post` responde `unsupported_kind` (P3 da spec). |
| Restrições (seção 5) e RULES.md | ✅ | A service role só aparece nos `index.ts` das Edge Functions (`SUPABASE_SERVICE_ROLE_KEY` via `Deno.env`). As 4 tabelas de dados e a de tentativas ficam sem política e com `revoke`. Dependências novas: só `expo-notifications` e `expo-device`, previstas. |
| Plano: tarefas concluídas e desvios registrados | ⚠️ | T-01 a T-13 marcadas e 11 desvios justificados. T-14 aberta. |
| Segurança | ✅ | Sem segredos no código. `google-services.json` está no `.gitignore`. Hash do IP no lugar do IP. O export não traz token. Lembretes cifrados no aparelho. |
| DoD da spec | ⚠️ | Itens abertos: roteiro de QA em iOS e Android, `eas init` com `projectId` em `app.config.ts`, credenciais APNs/FCM. `make check` e `make test-db` passam. |

### Lacunas

| # | ID | Bloqueante | O que está errado | Evidência | O que precisa acontecer |
| - | -- | ---------- | ----------------- | --------- | ----------------------- |
| 1 | T-14 / DoD | não para o veredito; sim para fechar a spec | `eas init` não foi feito: sem `extra.eas.projectId`, `getDevicePushToken()` devolve `null` e nada registra. Credenciais APNs/FCM e `EXPO_ACCESS_TOKEN` nos secrets também não foram configurados. | Plano 4, T-14 sem `[x]`. `app.config.ts` não tem `extra.eas.projectId`. | O usuário faz o passo a passo da T-14 (1 a 4) e registra o resultado no Registro de implementação. |
| 2 | CA-05, CA-17 | não | Verificação só por teste unitário. O diálogo real de permissão e o toque com o app fechado nunca foram vistos em aparelho. | `EnablePushSheet.test.tsx:46`, `PushEffects.test.tsx:179`. O plano declara os dois como manuais. | Rodar os passos 1 a 8 do roteiro de QA da spec em iOS e Android, num build de desenvolvimento. Registrar o resultado no plano. |
| 3 | CA-24 | não | Só os rótulos têm teste. Falta a navegação com VoiceOver e TalkBack, que a spec aceita como manual. | Testes citados na tabela de CAs. | Executar a verificação com leitor de tela em aparelho e registrar no plano. |
| 4 | RF-07 / build | não | `make build` imprime `Could not parse Expo config: android.googleServicesFile: "./google-services.json"` quando o arquivo não existe. O build passa, mas o build Android da EAS vai falhar sem a variável `GOOGLE_SERVICES_JSON`. | Saída de `make build`. `app.config.ts`: `googleServicesFile: process.env.GOOGLE_SERVICES_JSON ?? './google-services.json'`. | Configurar `GOOGLE_SERVICES_JSON` como variável de arquivo na EAS (parte da T-14). Opcional: só definir `googleServicesFile` quando a variável ou o arquivo existir, para tirar o aviso do `make build` na CI. |

### Rodadas anteriores

Primeira rodada. Não há lacunas anteriores.
