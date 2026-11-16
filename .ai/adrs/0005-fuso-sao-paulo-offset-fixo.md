# 0005. Tratar datas no fuso de Brasília com offset fixo UTC−3

> **Status:** Aceito
> **Data:** 2026-11-15
> **Origem:** `.ai/plans/calendar.md`

## Contexto

`RULES.md` exige gravar as datas em `timestamptz` (UTC) e exibi-las no fuso `America/Sao_Paulo`, seja qual for o fuso do aparelho. A spec `calendar` cobra isso no RNF-04 e no CA-20: um aparelho em Lisboa deve ver o evento às `19:30` de Brasília.

A agenda depende de datas civis em Brasília: o dia selecionado, a grade do mês, a semana, a janela de 06:00 a 22:00 e os eventos de vários dias. Se essas contas usarem os getters locais de `Date`, o resultado muda com o fuso do aparelho e com o fuso da máquina de testes.

`America/Sao_Paulo` não tem horário de verão desde 2019, então o offset é UTC−3 o ano inteiro.

## Opções consideradas

1. **Offset fixo UTC−3 num único módulo de domínio.** `src/domain/time.ts` converte instante em data e hora civil (e o contrário) com aritmética pura. Os rótulos saem de `Intl.DateTimeFormat(locale, { timeZone: 'UTC' })`, aplicado à data civil já convertida.
2. **`Intl.DateTimeFormat` com `timeZone: 'America/Sao_Paulo'` em todo lugar.** Depende do banco de fusos do Hermes em cada plataforma e não serve para a aritmética de datas.
3. **Uma biblioteca com fusos** (`date-fns-tz`, `luxon`, `@js-temporal/polyfill`). Resolve horário de verão, mas é dependência nova e pesada para um único fuso sem horário de verão.

## Decisão

Escolhemos a opção 1, por três motivos:
- É determinística em teste e não depende do Hermes nem do fuso do aparelho (RNF-04, CA-20).
- Não adiciona dependência (`RULES.md`, "Dependências").
- Concentra a regra num lugar só. Se o Brasil voltar a ter horário de verão, basta trocar `src/domain/time.ts` (passando para a opção 3).

## Consequências

### Positivas

- As regras de agenda viram funções puras, testáveis sem mock de relógio.
- A suíte de testes passa a rodar com `TZ=Europe/Lisbon`, o que prova que nada depende do fuso da máquina.

### Negativas

- Se o Brasil reinstituir o horário de verão, os horários ficam 1 h errados até alguém trocar `time.ts`.

### O que muda para quem desenvolve

- Nunca use `getHours`, `getDate`, `getDay` nem os outros getters locais de `Date` em regra de negócio ou na exibição. Use as funções de `src/domain/time.ts`.
- Rótulos de data e hora: `Intl.DateTimeFormat(locale, { ..., timeZone: 'UTC' })` aplicado ao resultado de `toSaoPauloWallTime`.
- `RULES.md` ("Datas e fuso") passa a citar este ADR.
