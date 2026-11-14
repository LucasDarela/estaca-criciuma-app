# Contexto de negócio

## Produto

App mobile (iOS e Android) da Estaca Criciúma (SC) de A Igreja de Jesus Cristo dos Santos dos Últimos Dias. Centraliza o que hoje se espalha em grupos de mensagem e avisos no púlpito: a **agenda** da estaca e das 6 unidades, o **mural** de avisos, o **organograma da liderança**, **anotações pessoais** dos membros, o **acompanhamento de chamados** pelos líderes e **notificações push** segmentadas por unidade e organização.

Agenda, mural e liderança são públicos: um visitante entende o que acontece e onde, sem conta. Estágio: **MVP para as lojas** (App Store e Google Play), com todas as áreas acima no escopo da primeira versão. Interface em pt-BR (padrão), en-US e es-MX.

## Pessoas usuárias

| Persona | Objetivo | Dor atual |
| ------- | -------- | --------- |
| Visitante / amigo da Igreja | Saber o que acontece, quando e onde, e quem procurar | Informação só circula em grupos fechados de mensagem |
| Membro | Ver a agenda da ala e da estaca, receber avisos relevantes, fazer anotações (reuniões, ministração) | Avisos chegam por vários grupos, muitos irrelevantes; datas e locais incompletos |
| Líder de unidade (bispado / presidência de ramo, secretários) | Publicar eventos e avisos da unidade, conduzir reuniões com pauta, acompanhar chamados | Pautas e pendências em papel ou planilhas; chamados acompanhados de memória |
| Liderança da estaca (presidência, sumo conselho, secretários) | Publicar para a estaca e todas as unidades, coordenar conferências e caravanas | Sem canal único para todas as unidades; difícil saber o que cada ala publicou |
| Admin (técnico) | Manter unidades, papéis e contas | Sem ferramenta própria; não deve ver dados confidenciais (chamados) |

## Métricas de sucesso

- **Principal:** 80% dos eventos da estaca e das unidades publicados no app em até 3 meses após o lançamento nas lojas (medido contra o calendário informado pelos secretários executivos).
- Secundárias (acompanhar, sem meta no MVP): membros com push ativo por unidade; avisos do mural por semana; reuniões com pauta registrada.

## Regras de negócio

| ID | Regra | Motivo |
| -- | ----- | ------ |
| RN-01 | Eventos, avisos do mural e liderança **publicados** são visíveis sem login. Rascunhos não. | Acolhimento: visitantes entendem o que acontece sem criar conta |
| RN-02 | Líder de unidade publica eventos, avisos, liderança e push **só da própria unidade**. Liderança da estaca publica para a estaca e todas as unidades. Admin, para todas. | Cada unidade é responsável pelo próprio conteúdo |
| RN-03 | Anotações são **privadas do autor**. Ninguém mais as lê, nem admin. | Anotações têm impressões pessoais e espirituais |
| RN-04 | Chamados são visíveis só ao bispado/presidência de ramo e secretários da unidade, e à liderança da estaca. Admin técnico **não** vê. | Informação confidencial sobre membros |
| RN-05 | Um chamado passa pelas etapas, nesta ordem: Proposto → Aprovado → Entrevista → Apoio → Designação. | Segue o processo da Igreja para chamados |
| RN-06 | Evento tem exatamente um tipo (Atividade, Reunião, Treinamento, Conferência, Caravana) e uma unidade (Estaca ou uma das 6 unidades). | Filtros e cores dependem disso |
| RN-07 | Só eventos do tipo **Reunião** têm pauta, decisões e pendências. Pendências de uma reunião entram automaticamente na pauta da próxima reunião da mesma série. | Continuidade entre conselhos. A definir na spec da agenda: como identificar a "série" (unidade + nome? recorrência?) |
| RN-08 | Push só é enviado se quem publica marcar "Notificar" e escolher ao menos um público (ex.: Toda a estaca, Bispos, Primária). | Evita notificação acidental em massa |
| RN-09 | Cada pessoa escolhe de quais origens recebe push (Estaca, minha unidade, outras unidades). Padrão: Estaca e minha unidade ligados; outras unidades desligadas. | Notificação irrelevante leva a desinstalar |
| RN-10 | Criar conta exige consentimento explícito para o tratamento de dados (LGPD). A pessoa pode exportar e excluir a conta pelo app. | Filiação religiosa é dado sensível (ver `SECURITY.md`) |
| RN-11 | Nada de curtidas, contadores de popularidade ou gamificação. | Princípio "Centrado em Cristo" do design |
| RN-12 | Textos seguem o guia de comunicação da Igreja: nome completo na primeira menção, sem "SUD", "LDS" ou "mórmon"; símbolo oficial só com aprovação do VIO. | Guia de Comunicação da Igreja |

Presidentes de organizações da unidade (Sociedade de Socorro, Quórum de Élderes, Primária, Moças, Rapazes) são `unit_publisher`: publicam eventos e avisos da própria unidade e não veem pautas nem chamados.

## Entidades principais

- **Unit** (unidade): a estaca ou uma das 6 unidades (alas e ramo). Tem cor fixa (`units` em `src/theme/theme.ts`).
- **Profile** (perfil): uma pessoa com conta (`auth.users` 1–1 `profiles`). Tem N **Memberships**.
- **Membership**: liga Profile a Unit com um **Role** (`unit_leader`, `unit_publisher`, `stake_leader`, `admin`) e, opcionalmente, um `leadership_group` (`stake_presidency`, `bishops`, `presidents`). Membro comum não tem Membership: é só uma conta autenticada. Uma pessoa pode ter papéis em unidades diferentes.
- **Event**: pertence a 1 Unit; tem tipo, início/fim, local, notas, links e opcionalmente público de push. Evento do tipo Reunião tem N **MeetingItems** (`agenda` | `decision` | `pending`).
- **Post** (aviso do mural): pertence a 1 Unit; pode ser fixado; pode ter imagem.
- **LeadershipPosition**: posição no organograma (unidade, chamado/cargo, nome exibido, ordem). Não precisa estar ligada a um Profile.
- **Note**: pertence a 1 Profile; tipo `reminder` (com data/hora e lembrete local), `text` ou `drawing` (traços vetoriais em JSON).
- **CallingProcess** (chamado): pertence a 1 Unit; cargo, pessoa indicada, etapa atual (RN-05).
- **PushToken** e **NotificationPreference**: tokens do aparelho e origens que a pessoa aceita (RN-09). **Notification**: histórico exibido na tela de notificações.

## Glossário

| Termo | Significado | Nome no código | Não confundir com |
| ----- | ----------- | -------------- | ----------------- |
| Estaca | Conjunto das 6 unidades; também é uma "unidade" para fins de publicação | `stake` (unit com `kind = 'stake'`) | — |
| Unidade | Ala ou ramo (ou a estaca) | `unit` | — |
| Ala / Ramo | Congregação local; ramo é a de menor porte | `ward` / `branch` (`unit.kind`) | — |
| Agenda | Calendário de eventos | `calendar`, `events` | **Pauta** |
| Pauta | Lista de assuntos de uma reunião | `meeting_items` com `kind = 'agenda'` | **Agenda** (calendário) |
| Pendência | Assunto não resolvido que vai para a próxima reunião | `meeting_items` com `kind = 'pending'` | Lembrete de anotação |
| Mural | Avisos publicados pelas unidades | `board`, `posts` | Notificação push |
| Chamado | Designação de um membro para uma função, e o processo para isso | `calling`, `calling_processes` | Chamado de suporte técnico |
| Apoio | Etapa em que a congregação apoia o chamado (no domingo) | `sustaining` | — |
| Designação | Etapa final em que a pessoa é designada | `set_apart` | — |
| Bispado / Presidência de ramo | Liderança de uma ala / de um ramo | `unit_leader` (role) | Liderança da estaca |
| Publicador de unidade | Presidente de organização que publica pela própria unidade, sem ver pautas e chamados | `unit_publisher` (role) | Bispado (`unit_leader`) |
| Liderança | Organograma público de quem serve onde | `leadership_positions` | Role / papel de acesso |
| Perfil (de acesso) | Visitante, Membro, Líder (no design) | `role` (visitante = sem sessão) | `profiles` (dados da pessoa) |
| Organizações | Sociedade de Socorro, Quórum de Élderes, Moças, Rapazes, Primária | `organization` (`relief_society`, `elders_quorum`, `young_women`, `young_men`, `primary`) | Unidade |
| Anotação | Nota pessoal privada | `note` | Notas do evento (`event.notes`) |

## Fora do produto

- Não substitui os sistemas oficiais da Igreja (Ferramentas do Membro, LCR): não guarda registros de membros, dízimo, recomendações para o templo nem frequência.
- Sem chat, comentários ou curtidas.
- Sem pagamentos ou inscrições pagas.
- Sem área web ou painel administrativo no MVP (administração pelo próprio app ou Supabase Studio).
- Não usa o símbolo ou logotipo oficial da Igreja sem aprovação do VIO.
