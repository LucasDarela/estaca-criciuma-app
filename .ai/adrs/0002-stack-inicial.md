# 0002. Usar Expo + Supabase self-hosted como stack inicial

> **Status:** Aceito
> **Data:** 2026-11-12
> **Origem:** `/bootstrap-project`

## Contexto

- App mobile para iOS e Android da Estaca Criciúma (7 unidades), lançado como MVP nas lojas, mantido por poucas pessoas voluntárias.
- O design (claude.ai/design, "Design System" v1.0) já prevê React Native com Expo, expo-router, Supabase com RLS, TanStack Query e Skia.
- Dados sensíveis pela LGPD (filiação religiosa, chamados, anotações): controle de onde os dados ficam e autorização no banco são requisitos, não preferências.
- Partes públicas (agenda, mural, liderança) e privadas por papel e por unidade.
- Interface em pt-BR (padrão), en-US e es-MX; código em inglês.
- Push segmentado por unidade e organização; desenho à mão livre nas anotações; uso offline razoável.

## Opções consideradas

1. **Expo (React Native) + Supabase self-hosted**
2. **Expo + Supabase Cloud**
3. **Flutter + Firebase**
4. **Apps nativos (Swift + Kotlin) + backend próprio**

## Decisão

Escolhemos a **opção 1**:

- **Expo + expo-router + TypeScript:** um código para iOS e Android, EAS Build/Submit sem manter Xcode/Android Studio na CI, OTA updates para correções; é a stack do design. Mantenedores voluntários → menos superfície.
- **Supabase self-hosted:** Postgres com **RLS** implementa direto o modelo `memberships(user_id, unit_id, role)` + `has_role()` (autorização no banco, não só no app); Auth (GoTrue) com OTP por e-mail, Google e Apple alimenta `auth.uid()` sem sincronizar usuários; self-hosted mantém os dados sensíveis sob controle da estaca e com custo fixo. Supabase Cloud (opção 2) seria mais simples de operar, mas foi preterido pelo controle dos dados; o cliente é o mesmo, então migrar depois é barato.
- **TanStack Query** para cache e leitura offline; **Skia** para desenho com traços vetoriais em JSON; **expo-notifications** + Edge Function para push.
- **i18next + react-i18next + expo-localization** para 3 idiomas desde o início (adicionar depois custaria reescrever todos os textos).
- **Qualidade:** ESLint (`eslint-config-expo`), Prettier, `tsc` strict, Jest (`jest-expo`) + React Native Testing Library, Maestro para E2E (YAML simples, sem build nativo especial na CI), pgTAP para testar RLS.
- **Sentry** para crashes; logs do backend no próprio Supabase.
- Flutter + Firebase (opção 3) perde em RLS/SQL relacional para o modelo de papéis por unidade e não é o que o design prevê. Nativo (opção 4) dobra o esforço para um time pequeno.

## Consequências

### Positivas

- Autorização centralizada e testável no banco (RLS + pgTAP).
- Um código, duas lojas; builds e envio às lojas pela EAS.
- Dados sensíveis sob controle da estaca.

### Negativas

- Operar o Supabase self-hosted (Docker, TLS, backups, atualizações, monitoramento) fica com o time — ver `SECURITY.md` › Infra self-hosted e `O11Y.md` › Alertas.
- Dependência do Expo Push Service (terceiro) para entregar notificações; o conteúdo do push deve ser curto e sem dado sensível.
- Skia e módulos nativos exigem dev client (não roda tudo no Expo Go).
- E2E com Maestro precisa de emulador; fica fora do `make check` e roda antes de cada release.

### O que muda para quem desenvolve

- Toda tabela nasce com RLS e teste de acesso negado (`SECURITY.md`, `QA.md`).
- Só `features/*/api.ts` e `src/lib` falam com o Supabase; nunca a service role key no app (`ARCHITECTURE.md`, `RULES.md`).
- Pacotes nativos via `npx expo install` para versões compatíveis com o SDK.
- Todo texto de UI via `t()` com chave nos 3 locales; código, comentários e commits em inglês.
- Versões ficam fixadas no `package.json` gerado no scaffolding.
