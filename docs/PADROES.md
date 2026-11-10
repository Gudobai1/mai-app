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
- **Janela do hábito:** só duas áreas. **Esquerda: calendário do mês, navegável** (setas para meses anteriores e seguintes; resumo do mês em texto no cabeçalho — dias feitos, %, falhas, sequência; grade de dias com o valor do dia nos hábitos com meta, círculo de 18px com borda na cor do hábito e só o check; toque alterna vazio → feito → falhou; dias futuros ou fora da frequência desativados). **Direita: configurações** (nome, descrição, meta por dia, unidade). Sem botões de feito/falhou, gráficos nem barras: todo dado fica dentro do calendário.
- **Janelas antigas (criar/editar):** seguem a mesma estrutura da janela de item: conteúdo à esquerda, propriedades à direita (320px) no computador; uma coluna no celular. Lançamento recorrente (fixo) e criação rápida usam essa regra até migrarem para `ItemLayout`.
- **Janela de lançamento financeiro (única):** todo lançamento, em qualquer tela (Hoje, Em breve, busca, Finanças), abre na mesma janela do módulo Finanças (`FinanceItemShell`), montada por `FinanceV4` em modo `popupOnly` quando aberta fora do módulo. Não há segunda versão do popup financeiro.
- **Cartão de hábito (único):** `HabitCard` (`app/v2/habits/HabitCard.tsx`), usado em Hoje, Em breve e Hábitos. **Círculo à esquerda com a borda na cor do hábito**, 18px como o check de tarefa, **só o check por dentro** (sem valor nem número); toque registra o dia, **título na cor do texto** (branco no escuro) com a **descrição embaixo** (valor do dia, descrição ou frequência, cinza 13) e a **sequência à direita** (chama + dias). Mesmas medidas das linhas de tarefa (padding 11/6, gap 12, título 14,5/700, descrição 12,5), divisória fina. Sequência calculada por `habitStreak` (`lib/v2/planner.ts`). Não criar outra versão do cartão de hábito.
- **Cartão de meta (único):** `GoalCard` (`app/v2/goals/GoalCard.tsx`), usado em Metas e Hoje. Check quadrado de 18px na cor da prioridade (conclui/reabre), título normal, embaixo prazo (cor semântica das datas) · "X de Y" · "Pausada", e à direita só a porcentagem em texto. Regras (prazo, progresso, ordem, concluir) em `lib/v2/goals.ts`.
- **Módulo Metas:** `GoalsModern` — blocos "Em andamento" e "Pausadas" só com linhas; criação rápida pela linha "Adicionar meta" (Enter cria); ver/editar sempre no popup global (`GoalDetail`: Status, Prazo, Prioridade, Progresso atual, Alvo, Anexos). Ajustes no botão único: Mostrar concluídos, Situação (todas/em andamento/pausadas) e Classificação (prazo, prioridade, progresso, nome). Sem gaveta de criação própria nem modo "Avançada".
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
