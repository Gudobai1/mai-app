# MAI — Paridade funcional do legado

Esta etapa restaura na interface V2 as capacidades funcionais do aplicativo original em `legacy-src/` antes de qualquer refatoração estrutural.

## Regra da etapa

- O legado é a fonte de verdade funcional.
- O visual atual da V2 é preservado.
- Recursos novos da V2 também são preservados.
- Banco, sincronização e remoção do legado só serão revistos depois da paridade funcional.
- Quando o gesto antigo não combina com a V2, é aceito um controle equivalente que execute a mesma operação sem perda de dados ou capacidade.

## Módulos igualados

- [x] Tarefas e projetos
- [x] Agenda
- [x] Rotinas
- [x] Metas
- [x] Notas
- [x] Finanças
- [x] Bem-estar
- [x] Arquivos / Google Drive

## Critério de conclusão

Um módulo é considerado concluído quando cada operação relevante disponível no aplicativo original possui um equivalente funcional acessível na V2, mesmo que a apresentação visual seja diferente.

## Paridade entregue

### Tarefas e projetos
- Editor rico de descrição e notas internas.
- Recorrência diária, semanal, mensal, anual, por dias da semana e por intervalo de N dias.
- Subtarefas e etapas internas aninhadas.
- Anexos do Google Drive com upload, abertura, renomeação e remoção.
- Conversão de tarefa em compromisso local, preservando conteúdo, passos e anexos.
- Visão global de concluídas com reabertura.
- Pesquisa e filtro por projeto.
- Hierarquia de projetos, projeto-pai, reordenação e movimentação equivalente aos gestos do legado.
- Ícone, cor e imagem de projeto com redimensionamento para 256 × 256.
- Criação, renomeação, reordenação e exclusão de colunas/seções, preservando as tarefas.

### Agenda
- Dia, semana, mês e ano mantidos na V2.
- Compromissos locais independentes do Google e eventos Google quando conectados.
- Criação, edição, exclusão, conclusão e movimentação de compromissos.
- Descrição rica, subtarefas e bandeja de anexos dos compromissos locais.
- Recorrência de compromissos.
- Filtros por tipo e painel de próximos itens.
- Tarefas e rotinas integradas à agenda.
- Alteração do horário padrão de rotina por controle equivalente ao arrastar na grade antiga.
- Seleção de calendários Google preservada.

### Rotinas
- Criação, edição e exclusão com meta, unidade, horário, dias da semana, cor e opção de ocultar da agenda.
- Paleta completa de ícones do aplicativo original.
- Registro simples, quantitativo e parcial em qualquer data.
- Sequência atual e melhor sequência.
- Taxa de conclusão.
- Gráfico das últimas semanas.
- Heatmap de 90 dias.
- Desempenho por dia da semana.
- Calendário mensal de registros.
- Histórico recente.

### Metas
- Criação, edição, exclusão, status, prazo, categoria, ícone, progresso e marcos.
- Gestão completa de categorias com renomeação refletida nas metas.
- Contextos total, anual e mensal, com navegação de período e filtro por categoria.
- Dashboard de metas do período e progresso global.
- Editor rico de descrição.
- Upload múltiplo de anexos e inserção de anexos/imagens no conteúdo.

### Notas
- Editor rico.
- Fixar, arquivar, desarquivar, lixeira, restaurar e excluir definitivamente.
- Pesquisa.
- Reordenação manual persistida por controles equivalentes ao arrastar.
- Tamanhos Normal, Largo e Grande preservados nos dados.
- Upload múltiplo de anexos.
- Renomeação, remoção e inserção de arquivos/imagens no conteúdo.

### Finanças
- Lançamentos, contas, cartões, categorias e fixos mensais.
- Navegação mensal, busca e resumo financeiro.
- Receitas, despesas, status e ignorar do cálculo.
- Pagamentos parciais, inclusão e remoção de movimentos.
- Parcelamentos/lotes com edição individual de data e valor, parcela extra, exclusão por parcela e exclusão do lote inteiro.
- Filtros persistentes por ordenação, status, categoria e origem.
- Relatórios por categoria e conta.
- Ajuste de saldo por lançamento de ajuste.
- Gestão completa de contas e cartões, incluindo fechamento, vencimento, limite e conta de pagamento.

### Bem-estar
- Navegação por data e análise diária, semanal, mensal, anual e histórica.
- Registro completo de sono com duração, ciclos, REM, profundo, score e dano/privação.
- Sessões compostas de treino com vários exercícios, séries e duração.
- Refeições compostas com vários alimentos e quantidades.
- Tomas compostas com vários suplementos e baixa de estoque.
- Biblioteca de exercícios, alimentos e suplementos.
- Macros, base/dose, estoque, dano inerente e justificativa.
- Vínculos/composições entre itens e músculos/princípios ativos.
- Variáveis/rastreadores com mínimo, máximo, unidade e regras por horário.
- Planos de treino completos com exercícios e séries.
- Metas detalhadas de água, calorias, macros, fibra, sódio, açúcar, sono, REM e sono profundo.
- Motor de conformidade por período com acumuladores, metas, alertas de regras e registro de danos/toxicidade/lesão.

### Arquivos / Google Drive
- Meu Drive, Computadores, Compartilhados, Estrelados e Lixeira.
- Breadcrumb de navegação.
- Quota de armazenamento.
- Pesquisa.
- Criação de pasta e arquivo de texto.
- Upload múltiplo.
- Abertura, renomeação, movimentação e lixeira onde aplicável.

## Validação

- A implementação fica isolada na branch `agent/restore-legacy-function-parity`.
- A branch `main` e a produção não foram alteradas nesta etapa.
- Os blocos finais foram compilados em previews da Vercel com estado `READY` antes da abertura do PR.
