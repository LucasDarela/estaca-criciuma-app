# Design de produto e UX

Fonte visual: projeto **Design System** no claude.ai/design (telas e componentes). Tokens e componentes ficam em `DESIGN_SYSTEM.md`.

## Princípios

1. **Centrado em Cristo.** Tudo aponta para servir, reunir e ministrar. Sem curtidas, contadores de popularidade ou gamificação.
2. **Acolhedor.** Agenda, mural e liderança funcionam sem conta. Login só é pedido quando a ação exige (anotações, publicar, chamados).
3. **Uma ação principal por tela.** Um único botão primário; o resto é secundário, texto ou ícone.
4. **Data e local sempre explícitos.** Todo evento e aviso mostra dia da semana, data, horário e local por extenso; nunca "em breve" ou "no lugar de sempre".
5. **Reverente e luminoso.** Muito espaço em branco, azuis e neutros claros; cor de destaque (unidades, vermelho) com moderação.

## Plataformas e breakpoints

| Nome | Largura | Prioridade |
| ---- | ------- | ---------- |
| Celular (iOS e Android) | < 600 dp | **Principal** — o design é feito em 360 pt |
| Tablet | ≥ 600 dp | Secundária: mesmo layout, conteúdo centralizado com largura máx. 640 dp |
| Web / desktop | — | Fora do MVP |

Orientação retrato apenas. Áreas seguras (notch, barra de gestos) respeitadas com `react-native-safe-area-context`.

## Idioma e tom de voz

- Idiomas: **pt-BR (padrão)**, en-US e es-MX. Idioma segue o aparelho (`expo-localization`) e pode ser trocado no Perfil; idioma não suportado cai para pt-BR.
- Tratamento por **"você"** (es-MX: "tú"/"usted" — A definir com um falante nativo antes do lançamento). Tom caloroso, direto, frases curtas.
- Convites, não pressão: "Venha participar", "Todos são bem-vindos". Nunca "Imperdível!", "Últimas vagas!!!".
- Nome da Igreja completo na primeira menção ("A Igreja de Jesus Cristo dos Santos dos Últimos Dias"), depois "a Igreja". Nunca "SUD", "LDS", "mórmon".
- Datas no formato do idioma: pt-BR "Sábado, 14 de novembro · 09:00"; en-US "Saturday, November 14 · 9:00 AM"; es-MX "Sábado, 14 de noviembre · 09:00".

| Situação | Escreva | Não escreva |
| -------- | ------- | ----------- |
| Erro de validação | `Informe um título para o evento.` | `Campo obrigatório!!!` |
| Ação concluída | `Anotação salva` (toast com "Desfazer") | `Sucesso!` |
| Estado vazio | `Nenhum evento neste dia com os filtros atuais.` | `Nada aqui :(` |
| Acesso restrito | `Esta área é usada por bispados e pela presidência da estaca para acompanhar chamados.` | `Acesso negado` |
| Erro de rede | `Sem conexão. Mostrando a última versão salva.` | `Erro 500` |

## Padrões de interação

- **Carregamento:** esqueleto no formato do conteúdo (cards da agenda/mural); nunca tela branca. Dados em cache aparecem na hora e atualizam em segundo plano (TanStack Query).
- **Offline:** agenda, mural, liderança e anotações abrem com a última versão salva e um aviso discreto; ações de escrita ficam desabilitadas com explicação.
- **Erros:** mensagem no próprio lugar do conteúdo com "Tentar de novo"; erro de campo abaixo do campo, em `danger`, anunciado ao leitor de tela.
- **Confirmações destrutivas:** excluir (anotação, evento, aviso) pede confirmação em bottom sheet com o nome do item; excluir anotação também oferece "Desfazer" no toast. Excluir conta exige digitar "EXCLUIR".
- **Formulários:** salvar no cabeçalho ("Cancelar" / título / "Salvar"); "Salvar" desabilitado até os campos obrigatórios serem válidos; sair com alterações pede confirmação.
- **Push:** quem publica escolhe explicitamente o público e vê o resumo ("Push para: Bispos, Presidentes") antes de salvar. Tocar na notificação abre o item.
- **Login sob demanda:** ação que exige conta abre a tela "Entrar" e volta para a ação após o login.

## Acessibilidade

- Base: WCAG 2.2 nível AA, aplicada a mobile (guia W3C de WCAG para mobile).
- Todo elemento interativo com `accessibilityRole` e `accessibilityLabel` traduzido; ícones só decorativos ficam ocultos do leitor de tela.
- Alvos de toque mínimos de 44×44 pt (iOS) e 48×48 dp (Android).
- Contraste mínimo de 4.5:1 para texto e 3:1 para componentes. Cor de unidade nunca é a única forma de identificar a unidade (sempre com o nome).
- Fonte do sistema respeitada (Dynamic Type / escala do Android); rótulos da barra inferior limitados a 1.6×. Layout testado em 1.6× sem cortar texto.
- Campos com label visível; erros ligados ao campo e anunciados.
- Respeitar "Reduzir movimento" do sistema (`useReducedMotion`): sem animações de deslocamento.
- Público inclui membros idosos: preferir texto a ícone sozinho; nada de gestos ocultos como única forma de ação.

## Fluxos principais

1. **Ver a agenda sem conta:** abrir o app → aba Agenda (mês) → filtrar por unidade/tipo ou buscar → tocar no evento → detalhe com local, mapa, "Adicionar à agenda" e "Compartilhar".
2. **Entrar:** aba Entrar → e-mail → código de 6 dígitos (ou Google/Apple) → consentimento LGPD (primeiro acesso) → escolher unidade → preferências de push.
3. **Líder publica evento:** Agenda → botão "+" → nome, datas, tipo, unidade, local, notas, links → (Reunião: pauta, decisões, pendências) → "Notificar" + público → Salvar → push enviado.
4. **Fazer anotação com lembrete:** aba Anotações → "+" → Lembrete/Texto/Desenho → para lembrete, data e hora → Salvar → notificação local na hora marcada.
5. **Acompanhar chamado:** aba Chamados (líder) → "+" → cargo e pessoa → avançar etapas (Proposto → … → Designação).
