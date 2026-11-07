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
- **Cabeçalho:** título 28/700 com subtítulo 13 cinza; à direita só o botão de visualização (ajustes, abre menu) e o botão principal. Celular rolando: título compacto 17/600 centralizado.
- **Navegação:** celular com 4 itens, barra de 56px: **Hoje** (ícone mostra o dia do mês), **Em breve**, **Pesquisar**, **Mais** (Caixa, Projetos e Finanças ficam em Mais). Computador: barra lateral de 220px com ícone à esquerda, contador à direita.
- **Estados:** vazio, carregando, erro: ícone 40, título 17/600, texto 13, no máximo uma ação; carregando com linhas fantasmas, sem spinner de tela. Aviso (`UndoToast`) escuro, 340, canto 10, some em 4s (8s com ação). Faixa só para estados que duram.
- **Telas do celular:** três esqueletos: lista, detalhe (barra de topo 48: Voltar / título / Salvar) e formulário longo (mais de 4 campos). Cadastro curto = popup.
- **Interruptor:** retangular, 40×24, trilho com canto 6 e peça com canto 4. Sem círculo.
- **Ícones:** Ionicons (licença MIT), um só conjunto (`Icon` do DS). Contorno por padrão, preenchido = ativo. Tamanhos 16 / 20 / 24, cor herdada do texto. Sem emoji como ícone. Manter o aviso de licença MIT no repositório.
- Estados: normal, hover, foco visível, desativado, carregando, vazio e erro existem em todo componente interativo.

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
