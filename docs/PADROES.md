# Padrões do aplicativo (Bukid)

Estas regras valem para **toda** mudança, nova ou de correção. Se uma regra atrapalha, a regra é discutida e alterada **aqui primeiro**; ninguém contorna no código.
Status: valores visuais **aprovados** pelo Marcell no quadro de design; falta aplicar módulo a módulo. Itens marcados com **[A DEFINIR]** esperam a escolha dele.

## 1. Regra de ouro
Um conceito = um componente = um lugar no código. Se o mesmo item (tarefa, hábito, evento, lançamento, meta, nota) aparece em duas telas, é o **mesmo componente** nas duas, com o mesmo visual e o mesmo comportamento. Copiar marcação de outra tela é proibido.

## 2. Antes de qualquer mudança (checklist)
1. Procurar se já existe componente para aquilo (tabela da seção 3). Se existe, usar e, se faltar algo, **estender o componente** (todas as telas ganham).
2. Se não existe, criar já no lugar compartilhado e registrar na tabela da seção 3.
3. Conferir tokens (seção 4); nada de cor, tamanho de fonte, raio ou sombra soltos.
4. Conferir comportamento no celular e no computador (seção 5).
5. Rodar a verificação (seção 8) e só então entregar.

## 3. Componentes únicos (alvo) e situação atual
| Conceito | Componente alvo | Situação atual (a corrigir) |
|---|---|---|
| Linha de tarefa | `TaskRow` | 5+ cópias: Hoje, Tarefas, Em breve, Concluídos, Busca, Linha do tempo |
| Linha de hábito | `HabitRow` | Hoje, Hábitos, Em breve, Linha do tempo |
| Linha de compromisso | `EventRow` (hoje `AgendaStrip`) | Hoje, Em breve, Linha do tempo |
| Linha de finanças / meta / nota | `FinanceRow`, `GoalRow`, `NoteRow` | cada módulo com a sua |
| Ver/editar um item (popup) | `ItemDetail` (único) | `ItemDetail`, `ContextDrawer`, `FinanceContextDrawerV4` convivem |
| Criar item | `QuickAdd` (único) | `QuickAdd`, `QuickCreateDrawer`, `TaskQuick`, `SectionInlineAdd` |
| Cabeçalho de página | `PageHeader` (título, navegação de dia, visualização, filtros) | cada tela monta o seu |
| Base de popup | `Popup` (modal centralizado no desktop e no celular; **sem folha de baixo**) | vários `position: fixed` próprios |
| Menu de contexto (toque longo / ⋯) | `QuickMenu` | ok, manter único |
| Confirmação / desfazer | `ConfirmDialog`, `UndoToast` | ok, manter únicos |
| Seletores (data, projeto, prioridade…) | `Pickers` | ok, manter únicos |
| Navegação | `ModernSidebar` (desktop), `ModernBottomNav` (celular) | ok |

## 4. Visual (tokens)
Fonte única da verdade: o quadro "Sistema de design Bukid" (quadros 0 a 12). Os valores abaixo são os aprovados.
- Cores, espaçamentos, raios, sombras, tipografia: **somente** variáveis `--ds-*` de `app/ds/tokens.css`. Hex solto e `px` de fonte soltos são erro.
- **Fonte:** Onest (reserva: system-ui, Segoe UI, Roboto, Arial). Escala: 11 / 13 / 15 / 17 / 22 / 28 / 34. Títulos com espaçamento de letras −0,02em.
- **Raios:** 4 / 6 / 8 / 10 / 12. Círculo só para avatar e ponto de status. **Nada em formato de pílula; sem radio** (seleção única = lista de linhas com visto; checks são quadrados).
- **Divisórias:** linha de 0,5px (`rgba(0,0,0,.06–.08)`; escuro `rgba(255,255,255,.07–.09)`).
- **Cores:** destaque `#DE4C4A` (escuro `#FF7066`); perigo `#D1453B`. Prioridade no check: P1 `#D1453B`, P2 `#EB8909`, P3 `#246FE0`, sem `#808080`.
- **Datas** (13px/600, embaixo do título, à esquerda): hoje amarelo `#D99A00`, atrasada vermelho `#D1453B`, futura verde `#058527`, concluída cinza `#8A8A8A`.
- **Linha de item:** check quadrado à esquerda; título 15/500; data embaixo; à direita **só texto** ("2/5", "40%", valor financeiro verde "+" / vermelho "−"), sem ícone e sem descrição longa.
- **Foco:** o próprio contorno do item, anel de 2px de destaque (`outline:2px solid destaque; outline-offset:-2px`). Botão cheio usa contorno vermelho mais escuro. Nunca por cima ou por dentro do item.
- **Botão:** ícone depois do rótulo (à direita), por exemplo "Adicionar tarefa +", em todo o sistema. Única exceção: a barra lateral do computador, onde o ícone fica à esquerda.
- **Menu:** opções com ícone à direita (visto na escolhida, seta em submenu, lixeira em perigo). Menus não perdem ícones.
- **Ícones:** um só `Icon` (`app/ds/ui.tsx`): traço fino (1,5; 1,75 até 16px), **pontas e cantos retos** (`square`/`miter`), sem preenchimento, e quadradinhos de ícone com canto pequeno (20% do lado). Nada de ícone gordo, cheio ou arredondado em excesso.
- **Aparência personalizável:** Configurações → Aparência (`AppearancePanel`) deixa a pessoa escolher **pacote de ícones** (21 opções em famílias: Linhas = Lucide, Tabler, Remix, Bootstrap, Heroicons; Apple/iOS = contorno, cheio, reto; Material = contorno, reto, suave, cheio, linha; Phosphor fino/regular/forte/duplo; Cheios = Remix, Bootstrap, Heroicons, Font Awesome; os externos carregam sob demanda), **grossura** (1–2,5), **pontas do traço** (retos/arredondados), **fonte**, **paleta de cores** (fundo, superfícies, linhas e texto: 18 opções: Padrão, Grafite, Floresta, Oceano, Areia, Lavanda, Meia-noite, Cereja, Menta, Céu, Âmbar, Ardósia, Terra, Uva, Limão, Petróleo, Rosa, Oliva; `app/ds/palettes.css`, claro e escuro) e **cor de destaque** (separada da paleta). Tudo fica em `state.configs.appearance` (`app/ds/appearance.ts`) e é aplicado no app inteiro por `applyAppearance` (variáveis `--ds-font`, `--ds-accent*` e o estado lido pelo `Icon`). Regra: **nenhum componente decide o desenho do ícone**; só o `Icon` único lê a aparência (por isso `MaiIcon` e o menu só escolhem o nome e chamam o `Icon`). Ícone sem equivalente no pacote escolhido cai no Lucide. Para incluir um pacote novo: acrescente em `ICON_PACKS` (com `family`), registre o módulo em `LOADERS` e, se for do react-icons, a família em `FAMILIES`; o nome do desenho é achado por `resolveFamily` (nome idêntico, tabela `SYNONYMS`, depois aproximação); sem achar, cai no Lucide. Grossura só vale onde `hasStrokeWeight`. Valor padrão = Linhas, 1,5, retos, fonte do sistema, cor do tema. Novas opções de aparência entram no mesmo painel, nunca em telas avulsas.
- **Configurações (janela única, `AppSettingsDrawer`):** abas **Visão geral** (estado de cada parte: sincronização, Google, notificações, aplicativo, cada linha com ponto verde/amarelo/vermelho e botão de ação), **Conta**, **Aparência**, **Barra lateral**, **Notificações**, **Google**, **Dados e backup**. Cada opção existe em **um só lugar** (sincronizar e instalar ficam na Visão geral; não repetir em outra aba). Aparência tem subgrupos Cores (modo, paleta, destaque, estilo), Ícones (pacote, tamanho, grossura, pontas), Texto, Formas. O antigo seletor "Seus temas" (`ThemePicker`) foi removido por duplicar paleta e destaque. Opção nova entra na aba do assunto, nunca em tela avulsa; item novo que possa falhar ganha linha na Visão geral.
- **Itens do menu lateral:** em Configurações → Barra lateral (`SidebarSettings`, regra em `app/v2/shell/sidebar-config.ts`, salvo em `configs.sidebar`): interruptor **Mostrar ícones** e, por item (Buscar, Entrada, Hoje, Em breve, Finanças, Hábitos, Metas, Notas), **ícone próprio** (lista `SIDEBAR_ICON_CHOICES`) e **ocultar**. Vale na barra do computador e no menu "Mais" do celular. A antiga opção "Ocultar Entrada" é só o interruptor da Entrada. Item de menu novo entra em `SIDEBAR_ITEMS`, nunca com ícone fixo.
- **Lembretes e notificações:** regra única em `lib/v2/reminders.ts` (`buildReminders`), usada pelo desktop (avisa a cada 30 s com o app aberto) e pelo celular (agenda 7 dias no sistema). Config em `configs.reminders` (`RemindersSettings`, aba Notificações): tipos que avisam, aviso na hora, antecedência padrão, lembretes próprios do item (`lembretes`), resumo do dia, horário de silêncio, "Testar aviso" e aparência (nome no título, projeto, horário, silencioso, indicador do sino ponto/número/nenhum, painel confortável/compacto, grupos mostrados). Nunca criar outro disparador de aviso fora do motor.
- **Marca do projeto = só a bolinha da cor** (`ProjectMark`, `dotMark`, `projectDot`): barra lateral, menu do celular, Hoje, Tarefas, seletores de projeto, popup do item e atalho de nova tarefa. Nunca ícone, imagem ou letra do projeto (o editor ainda guarda ícone/imagem, mas não são exibidos). A Entrada não é projeto e mantém o ícone de caixa de entrada. O formato (redondo/quadrado) segue `--ds-shape-projects`.
- **Setas de abrir/fechar (padrão único):** use sempre o componente `Disclosure` do DS (`<Disclosure open={estado} />`): fechado = para a direita, aberto = para baixo; desenho próprio, não muda com o pacote de ícones. Vale para grupos recolhíveis, árvores, menus e campos que abrem seletor (perfil, cor, propriedades do popup, projeto pai, atrasadas). Nunca girar com CSS nem usar `Icon` com `expand_more`/`chevron_right` para isso. Setas de navegação (mês/dia anterior e próximo) são outra coisa e continuam esquerda/direita.
- **Tamanho dos ícones:** Pequeno/Normal/Grande/Extra (`iconScale` 0,875–1,3), aplicado só pelo `Icon`.
- **Estilo das cores e formato dos marcadores:** em Aparência, "Estilo das cores de escolha" (12 estilos: Padrão, Pastel, Neon, Terroso, Profundo, Suave, Vivo, Retrô, Sorvete, Quente, Frio, Desbotado; `COLOR_STYLES` em `lib/v2/palette.ts`) muda as cores **oferecidas** em todos os seletores e **regrava no app inteiro** as cores que já eram da paleta (`restyleColors`: projetos, hábitos, categorias…); cores personalizadas ficam como estão. Quem precisa das cores usa `getPalette()`, nunca `PALETTE` direto. "Formato dos marcadores" define redondo ou quadrado por módulo (Tarefas, Hábitos, Projetos) pelas variáveis `--ds-shape-tasks|habits|projects`; marcador novo de módulo usa `border-radius: var(--ds-shape-<módulo>, 50%)`.
- **Seletor de cor:** campos de cor usam só o `input type="color"` nativo. O antigo popover "Escolha uma cor" (UxController, cores Sálvia/Azul/…) foi removido; não recriar interceptação de cliques em campos de cor.
- **Barra lateral:** ordem fixa: **topo** (perfil com seta de menu: Configurações, tema, "Ocultar a barra automaticamente", Sair · sino com ponto quando há itens para hoje/atrasados · botão de ocultar a barra), Buscar, áreas, projetos. Sem marca/logo e sem engrenagem. Recolher: o botão esconde a barra (volta pelo botão flutuante no canto); com **ocultar automaticamente** ligado (menu do perfil ou Configurações → Aparência) a barra some ao tirar o mouse e reaparece ao encostar na borda esquerda; o botão do topo passa a "Fixar". Estado em `configs.sidebarHidden` / `configs.sidebarAutoHide`.
- **Notificações (sino):** painel ao lado do sino (`NotificationPanel`) com **Vencidos** (tarefas, lançamentos e metas atrasados), **Lembretes** (itens com lembrete que já disparou ou dispara hoje) e **Para hoje**. Regra única em `lib/v2/alerts.ts`; o ponto do sino aparece quando há vencidos ou lembretes disparados. Clicar numa linha abre o item no popup padrão.
- **Nome do projeto:** sempre na cor de texto do tema (`--ds-text`, branco no tema escuro); a cor do projeto aparece só na marca (ícone).

- **Adicionar vários:** formulários de adicionar (`QuickAdd`, subtarefas, passos, hábito, meta) **continuam abertos e vazios** depois de adicionar (data, projeto e conta ficam); Esc/Cancelar fecha.
- **Popup e janela:** opções em linhas (texto à esquerda, valor + ícone à direita), sem caixas de campo. Campo (caixa) só em tela cheia e formulário longo. Diálogo 340 (celular 300); popup 360 / 440 / 640; botão 36 (celular 40); cabeçalho/rodapé 56/64; fundo escurecido 40% (escuro 60%); sombra `0 12px 40px 18%`; movimento 250ms entrada / 200ms saída.
- **Botão de ajustes (único):** `SettingsButton` do DS (ícone `tune`, 40px, canto direito do cabeçalho). **Toda** opção de visualização (lista, linha do tempo, semana, mês, quadro), ordem, agrupamento e filtro abre a partir dele, em todos os módulos. Nada de abas, seletores ou botões de filtro soltos no cabeçalho, nem segundo botão de opções. Em Hoje, Finanças e módulos simples ele vem do `AppTopBar`; em Tarefas e Em breve, do próprio módulo, com o mesmo componente. Tela nova = usar `SettingsButton`.
- **Barra inferior (celular):** Hoje, Em breve, Pesquisa, **Mais**. Sem botão "Novo" (criar fica no botão principal de cada tela). "Mais" abre tela cheia com os módulos **em lista** (um por linha) e Ajustes.
- **Menu Mais:** linhas simples (ícone outline cinza à esquerda, texto, chevron à direita), divisória entre linhas, rótulo de grupo 12px cinza; **sem** blocos coloridos nem ícones em quadrado. Ativo = texto e ícone na cor de destaque.
- **Configurações do app:** **abas** no topo (Conta, Aparência, Notificações, Calendários, Dados e backup), um assunto por vez; sem menu lateral nem página rolando por todos os assuntos.
- **Busca:** tela cheia no celular, com botão de fechar sempre visível; o gesto/botão voltar do sistema fecha a busca.
- **Cabeçalho:** título 28/700 com subtítulo 13 cinza; à direita só o botão de visualização (ajustes, abre menu) e o botão principal. Celular rolando: título compacto 17/600 centralizado.
- **Navegação:** celular com 4 itens, barra de 56px: **Hoje** (ícone mostra o dia do mês), **Em breve**, **Pesquisar**, **Mais** (Caixa, Projetos e Finanças ficam em Mais). Computador: barra lateral de 220px com ícone à esquerda, contador à direita.
- **Janela de item (padrão global):** todo item (tarefa, compromisso, hábito, lançamento, meta, nota) abre em **popup de tamanho fixo no computador** (acima de 900px, centralizado, com fundo escurecido) e em **tela cheia no celular**. A estrutura interna é a mesma nos dois. Cabeçalho (48px) com tipo e caminho + fechar; **conteúdo à esquerda** (título, descrição, blocos do tipo); **propriedades à direita** (320px; no celular viram ícones no topo do conteúdo); **rodapé** com Excluir à esquerda e status + Cancelar / Salvar à direita. Todo tipo monta o corpo por `ItemLayout` em `app/v2/detail/ItemDetail.tsx`; o visual vive num bloco só de `ItemDetail.module.css`. Tipo novo = usar `ItemLayout`, nunca criar janela própria. As janelas antigas de criar/editar (`mai-*-drawer`) seguem a mesma regra por um bloco final de `app/v2/shell/detail-popup.css`. **Nenhuma folha de baixo** em lugar nenhum. **Vale para todo pop-up de formulário ou conteúdo** (configurações, projeto, categorias, conexão, pré-visualização de anexo): tela cheia, cabeçalho 48px, conteúdo numa coluna centrada de até 880px, rodapé fixo com ações à direita, abaixo de 900px margens de 16px. Ficam fora da regra só confirmações (`ConfirmDialog`), menus (`QuickMenu`, menu de contexto) e seletores ancorados (cor, data), que são pequenos e centrados ou colados ao gatilho.
- **Tarefas — ajustes por projeto:** ordenação, filtro de prioridade e **Mostrar concluídos** do módulo Tarefas valem para cada projeto/lista separadamente (`configs.taskScopeSettings[project:ID | inbox | …]`); sem ajuste próprio vale o padrão antigo.
- **Offline:** o app funciona sem internet. `public/sw.js` guarda as páginas e os arquivos `/_next/static` (cache primeiro para os arquivos com hash; rede com 4 s de espera e cópia guardada para as páginas); os dados ficam no aparelho e sincronizam quando a internet volta (`lib/v2/sync`). Ao mudar o shell, aumente `SHELL_CACHE`.
- **Menu Mais (celular):** a barra inferior permanece visível com o menu aberto; no lugar de "Tarefas" há Entrada + Projetos (árvore), como no menu do desktop.
- **Sincronizar (MeuPluggy):** o botão abre a página da conexão numa janela chamada `meu-pluggy-<item>`; o script opcional `scripts/meupluggy-atualizar-e-fechar.user.js` (Tampermonkey) clica em "Atualizar" e fecha a janela. Ao fechar, o Bukid lê de novo o que a Pluggy atualizou.
- **Sem sublinhado no hover:** nenhum item (link, botão, linha, cartão) é sublinhado ao passar o mouse; a regra global fica em `app/ds/no-underline.css`. Não crie `text-decoration: underline` em `:hover`.
- **Tokens de janela em todo popup:** fundo (`--ds-popup-scrim`), canto (`--ds-popup-r`) e sombra (`--ds-popup-shadow`) valem para todas as janelas, inclusive Finanças (`FinanceItemShell`), Novo (QuickAdd), confirmações e editores. Só o tamanho de captura rápida/confirmação é menor; qualquer janela de item usa 960×720.
- **Janela única (cartões e popups):** **uma só aparência** em todo o app, definida pelos tokens `--ds-popup-w/h/r/scrim/shadow` (960×720, canto 10, fundo escurecido 45%). Computador (acima de 900px): popup centralizado de tamanho fixo. Celular: tela cheia. Vale para cartões de item (tarefa, compromisso, hábito, lançamento, meta, nota) **e** para configurações, projeto, categorias, conexão e notas. Cabeçalho 48px, conteúdo rolável, rodapé 56px com ações à direita. Nada de tamanho, canto ou sombra próprios por módulo; para mudar a janela de todo o app, mudar os tokens.
- **Estados:** vazio, carregando, erro: ícone 40, título 17/600, texto 13, no máximo uma ação; carregando com linhas fantasmas, sem spinner de tela. Aviso (`UndoToast`) escuro, 340, canto 10, some em 4s (8s com ação). Faixa só para estados que duram.
- **Telas do celular:** três esqueletos: lista, detalhe (barra de topo 48: Voltar / título / Salvar) e formulário longo (mais de 4 campos). Cadastro curto = popup.
- **Interruptor:** retangular, 40×24, trilho com canto 6 e peça com canto 4. Sem círculo.
- **Ícones:** Ionicons (licença MIT), um só conjunto (`Icon` do DS). Contorno por padrão, preenchido = ativo. Tamanhos 16 / 20 / 24, cor herdada do texto. Sem emoji como ícone. Manter o aviso de licença MIT no repositório.
- Estados: normal, hover, foco visível, desativado, carregando, vazio e erro existem em todo componente interativo.

- **Linha de lista (tarefa, compromisso, hábito, lançamento):** mesmas medidas em todo o app, pelos tokens `--ds-row-*`: padding 11/6, intervalo 12, marcador à esquerda de 18px (check, círculo do hábito, bolinha do compromisso centrada nos 18px), título 14,5 com peso normal (`--ds-row-weight`, 400), linha de baixo 12,5 cinza também normal; valores, datas e sequência seguem o mesmo peso. Negrito só em títulos de bloco ("Agenda", "Hábitos", "Finanças") e cabeçalhos. As colunas ficam alinhadas entre blocos; nunca definir tamanho próprio por módulo.
- **Popup do hábito (único):** o módulo Hábitos não tem painel próprio; toda linha abre o `HabitDetail` do `ItemDetail` (calendário do mês à esquerda; Nome, Descrição, Meta, Unidade, Horário, Frequência, Cor e Hoje e Agenda à direita como linhas `Prop` com seletor flutuante — mesmo padrão de tarefa/evento —, e Anexos abaixo do calendário).
- **Janela do hábito:** só duas áreas. **Esquerda: calendário do mês, navegável** (setas para meses anteriores e seguintes; resumo do mês em texto no cabeçalho — dias feitos, %, falhas, sequência; grade de dias com o valor do dia nos hábitos com meta, círculo de 18px com borda na cor do hábito e só o check; toque alterna vazio → feito → falhou; dias futuros ou fora da frequência desativados). **Direita: configurações** (nome, descrição, meta por dia, unidade). Sem botões de feito/falhou, gráficos nem barras: todo dado fica dentro do calendário. Navegação de mês igual à do seletor de data: título à esquerda ("Novembro 2026", só a primeira letra maiúscula) e as setas juntas à direita. Clicar no **número** do dia o seleciona; clicar no **círculo** marca/alterna o hábito. Abaixo do calendário vão os **comentários + arquivos do dia selecionado** (`CommentsSection`, ícone de anexar; cada comentário guarda `dia`); dias com comentário ganham um marcador quadrado no canto. Não há bloco "Arquivos" avulso.
- **Janelas antigas (criar/editar):** seguem a mesma estrutura da janela de item: conteúdo à esquerda, propriedades à direita (320px) no computador; uma coluna no celular. Lançamento recorrente (fixo) e criação rápida usam essa regra até migrarem para `ItemLayout`.
- **Janela de lançamento financeiro (única):** todo lançamento, em qualquer tela (Hoje, Em breve, busca, Finanças), abre na mesma janela do módulo Finanças (`FinanceItemShell`), montada por `FinanceV4` em modo `popupOnly` quando aberta fora do módulo. Não há segunda versão do popup financeiro.
- **Cartão de hábito (único):** `HabitCard` (`app/v2/habits/HabitCard.tsx`), usado em Hoje, Em breve e Hábitos. **Círculo à esquerda com a borda na cor do hábito**, 18px como o check de tarefa, **só o check por dentro** (sem valor nem número); toque registra o dia, **título na cor do texto** (branco no escuro) com a **descrição embaixo** (valor do dia, descrição ou frequência, cinza 13) e a **sequência à direita** (chama + dias). Mesmas medidas das linhas de tarefa (padding 11/6, gap 12, título 14,5/700, descrição 12,5), divisória fina. Sequência calculada por `habitStreak` (`lib/v2/planner.ts`). Não criar outra versão do cartão de hábito.
- **Cartão de meta (único):** `GoalCard` (`app/v2/goals/GoalCard.tsx`), usado em Metas, Hoje e Em breve. Círculo de 18px na **cor da meta** (só o check por dentro; conclui/reabre), título na cor do texto, embaixo o prazo (cor semântica das datas) e "Pausada"; à direita a porcentagem e, embaixo, o detalhe do tipo ("R$ 400 de R$ 1.000", "3 de 5 passos", "3 de 10 livros"). Regras (prazo, progresso, ordem, concluir) em `lib/v2/goals.ts`.
- **Tipos de meta:** Porcentagem, Valor (R$), Quantidade (com unidade) e Passos. Em Passos, **cada passo é uma tarefa de verdade** (campo `meta_id`), igual às subtarefas: mesma linha (`SubtaskCard`), mesmo "Adicionar passo" (`QuickAdd` com `metaId`), abre o próprio popup de tarefa; o progresso vem das tarefas feitas (`withSteps` em `lib/v2/goals.ts`) e concluir a meta conclui os passos (`toggleGoalInState`). Excluir a meta mantém as tarefas (só solta o `meta_id`). A **conclusão (%)** é uma linha da coluna lateral, logo depois do Status. Rodapé do popup: arquivos e comentários como no popup de tarefa (`CommentsSection`, ícone de anexar).
- **Metas em Hoje e Em breve:** Hoje mostra metas abertas com prazo até hoje (concluídas do dia ficam no lugar quando "Mostrar concluídos" está ligado); Em breve mostra as metas no dia do prazo (lista, semana, mês e linha do tempo), com o filtro "Metas" no botão de ajustes.
- **Módulo Metas:** `GoalsModern` — blocos "Em andamento" e "Pausadas" só com linhas; criação rápida pela linha "Adicionar meta" (Enter cria); ver/editar sempre no popup global (`GoalDetail`: Status, Prazo, Prioridade, Progresso atual, Alvo, Anexos). Ajustes no botão único: Mostrar concluídos, Situação (todas/em andamento/pausadas) e Classificação (prazo, prioridade, progresso, nome). Sem gaveta de criação própria nem modo "Avançada". Visualizações: **Lista** (agrupar por Situação, Tipo ou Prazo) e **Quadro** (colunas Em andamento, Pausadas e, com "Mostrar concluídos", Concluídas). Filtros: Situação, Tipo, Prioridade. Tudo no menu de ajustes único.
- **Visualização de quadro (mãozinha):** todo quadro (Tarefas, Metas…) (Tarefas, Metas…) usa `useDragScroll` (`app/ds/useDragScroll.ts`) + `data-grab`: no desktop, arrastar em qualquer ponto do quadro (cabeçalhos, linhas, espaços vazios) rola para o lado com cursor de mão; só os cartões arrastáveis (mover tarefa de coluna) e campos de texto mantêm o próprio gesto; no celular só o deslize do dedo. Não criar outra versão.
- **Concluídos:** não existe módulo, aba, filtro nem seção chamada "Concluídos". Cada módulo (Hoje, Em breve, Tarefas, Metas, Finanças) tem no próprio menu de ajustes a opção **Mostrar concluídos**, desligada por padrão (exceto **Hoje** e **Em breve**, onde o concluído permanece no lugar e a opção vem ligada). Ligada, o concluído aparece **no lugar onde estava** (mesmo grupo, mesmo dia, mesmo projeto), sempre **abaixo dos não concluídos**; ao reabrir volta à posição normal (`showCompleted`, `configs.showCompletedByModule`).
- **Módulos do app:** Hoje, Em breve, Tarefas, Finanças, Hábitos, Metas, Notas. O módulo Arquivos foi removido; anexos continuam dentro dos itens.

## 5. Comportamento
- Toque/clique no corpo da linha abre `ItemDetail`; o círculo conclui/registra; toque longo ou ⋯ abre `QuickMenu`. Igual em **todas** as telas.
- Criar sempre pelo mesmo `QuickAdd`; os padrões (projeto, data) vêm de quem chamou, o visual não muda.
- Popup no computador e no celular: modal centralizado (no celular, margem de 16px), rolável e **acima do teclado**. **Nenhuma folha subindo do fundo** em lugar nenhum do app.
- Celular = até 900px. Alvo de toque ≥ 40px. Respeitar área segura (entalhe e barra inferior).
- Teclado (Android): a página encolhe; nenhum campo fica coberto.
- Desfazer: ações destrutivas ou em lote têm `UndoToast`.
- Textos em português do Brasil; datas e valores no mesmo formato em todo lugar (R$ 1.234,56; "sábado, 7 de novembro").

## 6. Regras de dados
- Cada regra de "o que aparece" (filtros, "somente o próximo", finanças vencidas, metas) vive **uma vez** em `lib/v2/` e é usada por todas as telas. Tela não reimplementa filtro.
- Mudou uma regra → uma alteração só, vale para Hoje, Em breve, Linha do tempo e Busca.

## 7. Estrutura do código
- Tela (`app/v2/<módulo>`) só **monta**; peças reutilizáveis ficam em `app/v2/shared` (a criar) ou `app/ds`.
- Arquivo com mais de ~600 linhas pede divisão antes de crescer.
- CSS em módulo por componente; nada de CSS global novo para uma tela.

## 8. Entrega
- Passa no typecheck da Vercel (não há `node_modules` local confiável): conferir o deploy **depois** do merge.
- Conferir visualmente no desktop **e** no celular (captura de tela) antes de dizer que ficou pronto.
- Mudança que cria ou altera um padrão **atualiza este arquivo** no mesmo PR.
- PR descreve: o que mudou, quais telas foram afetadas, o que ficou fora.

## 9. Plano de padronização (aprovado: padronizar tudo antes de novidades)
1. Fechar as **[A DEFINIR]** (referência visual, tabela de tipografia/raios).
2. Criar os componentes únicos (seção 3), começando por `TaskRow`, `ItemDetail`/`Sheet`, `PageHeader`.
3. Trocar módulo a módulo: Hoje → Tarefas → Em breve → Concluídos → Busca → Hábitos → Finanças → Metas → Notas.
4. Remover os componentes antigos e CSS morto.
5. Só depois voltar às funções novas.

## Layout do desktop (Aparência → Layout)

- Escolha única em `Appearance.layout` (`left` padrão, `right`, `compact`, `top`, `bottom`, `dock`; lista em `LAYOUTS`, `app/ds/appearance.ts`). `applyAppearance` grava `html[data-mai-layout]` (ausente = esquerda).
- É a **mesma** barra (`ModernSidebar`) que muda de lugar por CSS (bloco "Layout do desktop" no fim de `ModernShell.module.css`, só ≥ 901px). **Não** crie outra barra nem copie marcação; item novo de menu aparece em todos os layouts sozinho.
- Nos layouts compacta/superior/inferior/dock os projetos aparecem só como bolinha (nome no `title`); no celular nada muda (barra de baixo própria).
- Mudou algo na barra? Teste os 6 layouts.

## Avisos (sino)

- Não há ícone de sino. Havendo avisos, aparece só uma bolinha no canto superior direito do avatar do perfil (`profileDot`); clicar abre a lista. Sem avisos, nada aparece. Aparência da bolinha (ponto ou contagem) segue Configurações → Lembretes.
- Layouts sem texto (compacta, superior, inferior, dock) mantêm o "+" de adicionar projeto, só com o ícone.

## Barra lateral: abrir e fechar
- No menu do perfil: **Notificações** (abre o painel de avisos, com contagem) e **Abrir/Fechar a barra**. Aberta = ícone + nome; fechada = só ícones (trilho compacto de 56px). Estado em `appearance.rail`; vale nas laterais esquerda e direita (nos outros layouts o item não aparece).
- Não há botão de ocultar no topo da barra. "Ocultar a barra automaticamente" fica só em Configurações.

## Ajustes dos módulos (botão do canto superior direito)
- Painel único do design system (`app/ds/options.tsx`): `OptionsPanel` (título, **Redefinir**, fechar; fecha clicando fora ou Esc), `OptionsGroup` (Visualização → Mostrar → Filtrar → Ordenar → Avançado, pela prop `order`), `OptionsSegment` (escolha única: segmentado até 3 opções curtas, senão fichas), `OptionsSelect` (linha com valor à direita), `OptionsSwitch` (liga/desliga) e `OptionsSwitchMove` (liga/desliga + mudar ordem). Nada de caixas de seleção soltas nem botões de filtro fora dele.
- O botão (`SettingsButton`) mostra uma bolinha quando há filtro/ordem diferente do padrão; **Redefinir** volta o módulo ao padrão.
- Hoje, Em breve, Hábitos, Metas, Notas e Finanças montam o painel em `AppTopBar`; Tarefas usa os mesmos componentes dentro do `Floating`. Opção nova = novo `PanelSection` no módulo certo, nunca tela avulsa.
- Abas/filtros de situação (Todos/Hoje/Pendentes, Tudo/Atrasadas/…) não existem mais na tela dos módulos: ficam em "Mostrar".

## Painel de notificações
- Regra única em `lib/v2/alerts.ts` (`buildAlerts`): **Vencidos**, **Próximos** (com horário nas próximas 4 h, inclui compromissos e o que está rolando), **Lembretes** e **Para hoje**. "Próximos" segue a opção "Para hoje" de Configurações → Notificações.
- `NotificationPanel`: abas por tipo com contagem, linhas com ações rápidas (concluir, adiar para amanhã, dispensar), "Dispensar tudo" e atalho para as configurações. Dispensar vale só no dia (`loadDismissed`/`saveDismissed`, neste navegador) e some também da contagem da bolinha.
- Abre pelo menu do perfil (Notificações) ou clicando na bolinha do avatar.

## Atalhos de teclado
- Regra única em `lib/v2/shortcuts.ts` (padrões, normalização, `matchShortcut`); config em `configs.shortcuts` editada em Configurações → Atalhos (`ShortcutsSettings`). Padrões: **Q** = novo item do módulo aberto, **F** = pesquisar, configurações sem tecla. Fixos: Ctrl+Espaço, Ctrl+Z, Esc. Uma tecla simples por ação; tecla repetida é recusada. Atalho novo = nova ação em `SHORTCUT_ACTIONS` e tratamento no `onKey` de `UnifiedAppUx`.
- A dica na linha "Buscar" da barra lateral mostra a tecla configurada.
- A busca não tem mais o bloco "Ir para" (navegação é pela barra).

## Botão "Novo" fixo
- O header dos módulos tem só título, subtítulo e o botão de ajustes; **não há botão "Adicionar" no header**. A criação é um botão permanente da navegação (`newBtn` em `ModernSidebar`, `newTab` em `ModernBottomNav`) que chama `contextualAdd` e muda de nome pelo módulo (`app/v2/shell/new-label.ts`: Nova tarefa, Novo hábito, Nova meta, Nova nota, Novo lançamento).
- Desktop: sempre junto do perfil, em qualquer layout (abaixo na lateral; só "+" na compacta; ao lado na superior, na inferior e no dock). Celular: item "+" no centro da barra de baixo, **dentro** da barra (não flutua). Atalho configurável (padrão Q) aparece no botão.
- Layouts superior, inferior e dock: **tudo fica dentro da barra**, na ordem do menu lateral: perfil, Novo (+), Buscar (ícone), depois os itens (separador antes dos projetos). Nada flutua fora da barra.

## Cabeçalho dos módulos (modelo único)
Todo módulo abre com o mesmo cabeçalho, montado só por `AppTopBar`: título 28/700 (22 no celular), abaixo subtítulo 13 cinza (Hoje: "Quarta, 11 de novembro · 3 tarefas"; demais módulos: contagem), e à direita só o botão de ajustes com a bolinha quando há personalização. Nenhum módulo cria cabeçalho próprio. O painel de ajustes (`OptionsPanel`) tem fundo sólido (`--ds-bg`) e grupos que não encolhem (`flex: none`), para nunca ficar transparente nem sobrepor linhas.
- Aparência do "Novo": **sem fundo**, ícone + e nome em vermelho (`--ds-accent`), sem contorno, altura 36px; ao passar o mouse só o cinza de hover. No celular é uma aba comum da barra, também em vermelho.
- **Buscar e abrir/fechar a barra (laterais):** o Buscar é um ícone (`searchTop`) ao lado do perfil, fixo no topo da lateral ao rolar; não é mais uma linha do menu. O Novo fica sozinho logo abaixo do perfil. Abrir/fechar a barra fica só no menu do perfil. Com a barra fechada, o ícone de Buscar fica fora do trilho, no canto do topo da página, e rola junto com ela. Nas barras superior, inferior e dock o Buscar segue como item da barra.
- Bolinha de cor do projeto no cabeçalho de Hoje (`projectHeadDot`) é sempre círculo (50%); a opção de forma "quadrado" vale só para ícones/imagens.
- Botão abrir/fechar a barra: sem contorno; com a barra aberta o perfil (e o botão) ficam fixos no topo ao rolar a lista; fechada, o botão fica fixo na borda do trilho.
- Celular: o "Novo" da barra de baixo é uma aba comum (`tab`: ícone + rótulo "Novo"), só que na cor de destaque; sem pílula nem tamanho próprio.
- Com a barra fechada, o ícone de Buscar é renderizado direto no body (portal) com position: absolute no topo da página, ao lado do trilho.

## Grupos da barra lateral (só espaço)
- Os grupos da barra (Planejar, Acompanhar, Projetos) se separam **só por espaço** (16px): sem linha divisória, sem contador ao lado do título e sem marca. O título é cinza, pequeno, em caixa alta, peso médio.
- Barra fechada (só ícones): sem títulos e sem linha; um respiro de 14px entre os grupos. Nas barras superior, inferior e dock os grupos seguem em linha, sem títulos.

## Adicionar por Novo / atalho Q (padrão único)
- O botão Novo e o atalho Q abrem sempre o mesmo `QuickAdd`, com as abas **Tarefa, Compromisso e Lançamento** (a ordem muda pela tela). Lançamento é criado ali mesmo, como os outros; não redireciona para outra tela. Na tela de um projeto só aparece Tarefa. Em Finanças o Novo abre o QuickAdd já em Lançamento. Hábitos, Metas e Notas seguem pelo próprio formulário.
- Barra lateral: perfil, Novo e Buscar ficam a 2px um do outro (como os itens); entre Buscar e o menu há um respiro maior (16px; 14px na barra fechada), igual ao espaço entre os grupos.

- **Painel de ajustes (portal):** `OptionsPanel` é desenhado direto no `body` (portal) com `position: fixed`, ancorado ao botão de ajustes, fundo sólido `--ds-bg` e z-index 900. Assim nenhuma regra antiga de tela, `sticky` ou filtro do cabeçalho consegue deixá-lo transparente ou sobreposto.
