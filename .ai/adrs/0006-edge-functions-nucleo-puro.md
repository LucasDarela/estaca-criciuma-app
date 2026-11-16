# 0006. Edge Functions finas, com núcleo puro testado no Jest e regras no Postgres

> **Status:** Aceito
> **Data:** 2026-11-15
> **Origem:** `.ai/plans/push-notifications.md`

## Contexto

A spec `push-notifications` traz as primeiras Edge Functions do projeto (`register-device` e `send-push`). Depois delas vêm `board` e outras que também vão precisar de servidor.

Restrições:
- O runtime das Edge Functions é Deno. O Deno não está instalado nas máquinas de dev nem na CI, e o `make check` só conhece Jest, ESLint, `tsc` e Prettier.
- As regras de autorização já vivem no Postgres (`can_publish`, `can_lead`, `my_accesses()`), e todas dependem de `auth.uid()`.
- O projeto usa as chaves novas do Supabase (`sb_publishable_…`, `sb_secret_…`). A publishable key não é um JWT, então o `verify_jwt` padrão do gateway recusaria chamadas de visitante.
- `QA.md` exige teste automatizado por critério de aceitação, e `SECURITY.md` exige que toda autorização seja verificada no servidor.

## Opções consideradas

1. **Função fina + núcleo puro + regras em SQL.** O `index.ts` de cada função (Deno) só liga HTTP, `supabase-js` e `fetch`. A lógica de requisição (validar entrada, mapear erros, montar mensagens, dividir lotes, logs) fica em módulos TypeScript sem imports em `supabase/functions/_shared/`, testados pelo Jest com dependências injetadas. Regras de dados (permissão, destinatários, rate limit, gravação) ficam em funções SQL `security definer` executáveis só pela `service_role`, testadas por pgTAP.
2. **Tudo no Deno, testado com `deno test`.** Exige instalar o Deno na CI e localmente, mais um alvo no Makefile e um segundo runner de testes. As regras de permissão seriam reescritas em TypeScript, duplicando o que o banco já garante.
3. **Sem Edge Function: só RPCs.** Não serve: chamar a Expo Push API com o `EXPO_ACCESS_TOKEN` e ler o IP da requisição exigem código de servidor fora do Postgres.

## Decisão

Escolhemos a opção 1, por quatro motivos:
- Não adiciona ferramenta: o núcleo roda no Jest e as regras no pgTAP, que já estão no `make check` e no `make test-db`.
- As permissões continuam num lugar só, o banco.
- A função não confia em nada do app: ela verifica o JWT, e o banco decide.
- O `index.ts`, que fica sem teste automatizado, é pequeno o bastante para ser conferido no roteiro de QA.

## Consequências

### Positivas

- Cada regra nova de servidor ganha teste com as ferramentas que o time já usa.
- `board` e as próximas funções seguem o mesmo molde.

### Negativas

- O `index.ts` não tem teste automatizado. Ele é conferido com `supabase functions serve` e no roteiro de QA.
- Quando uma regra de formatação precisa existir no app e na função (ex.: o corpo do push de evento), ela é escrita duas vezes, com os mesmos vetores de teste nos dois lados.

### O que muda para quem desenvolve

- `supabase/functions/<nome>/index.ts`: só `Deno.serve`, criação dos clientes, `fetch`, `crypto` e a chamada ao núcleo. Imports do npm sempre com versão fixa (`npm:@supabase/supabase-js@2.119.0`).
- `supabase/functions/_shared/<nome>.ts`: TypeScript puro, **sem nenhum import**. O Deno exige extensão `.ts` nos imports relativos e o `tsc` do app a recusa; sem imports, os dois aceitam o arquivo. As dependências (banco, rede, relógio, log) entram como parâmetro. O teste fica ao lado (`*.test.ts`) e roda no Jest.
- `tsconfig.json` e `eslint.config.js` ignoram só `supabase/functions/*/index.ts`, e não a pasta inteira.
- Toda função tem `verify_jwt = false` no `supabase/config.toml` e verifica o chamador por conta própria: sem `Authorization` ou com a publishable key, é visitante; com um JWT, chama `auth.getUser(jwt)` e, se falhar, responde 401.
- Regras de dados ficam em funções SQL `security definer` com `execute` revogado de `public`, `anon` e `authenticated` e concedido só à `service_role`. Quando precisam das funções de permissão, recebem `p_actor uuid` e fazem `set_config('request.jwt.claims', json_build_object('sub', p_actor, 'role', 'authenticated')::text, true)` antes de chamar `can_publish`. É o mesmo mecanismo que os testes pgTAP usam.
- Logs: uma linha JSON por evento, com `timestamp`, `level`, `event`, `request_id` e, quando houver, `user_id` (`O11Y.md`). Nunca token, e-mail ou nome. O teste do núcleo confere isso.
- O deploy já ignora pastas que começam com `_` (`.github/workflows/deploy.yml`).
