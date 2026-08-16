/**
 * ==========================================
 * BACKEND MASTER UNIFICADO (BLINDADO V6)
 * Módulos: Agenda, Saúde, Finanças, Hábitos, Tarefas, Metas, Notas, Drive
 * ==========================================
 */

function doGet(e) {
  return HtmlService.createTemplateFromFile('index').evaluate().setTitle('Meu Sistema')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function include(filename) { try { return HtmlService.createHtmlOutputFromFile(filename).getContent(); } catch(e) { return "Módulo não encontrado."; } }
function getScriptUrl() { return ScriptApp.getService().getUrl(); }

function vincularPlanilhaOriginal() {
  const ID_DA_PLANILHA = "1hOO2tmRKvpGFZnVARO6DsCUjQDkrX3IwOjSpWcNh-Dw"; 
  PropertiesService.getScriptProperties().setProperty('SHEET_ID', ID_DA_PLANILHA); return "Planilha vinculada com sucesso!";
}

function getSpreadsheet() { return SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty('SHEET_ID')); }

function setup() {
  const ss = getSpreadsheet();
  const schemas = {
    'habitos': ['id', 'nome', 'icone', 'cor_hex', 'meta', 'unidade', 'ativo', 'criado_em', 'ocultar_agenda', 'hora'],
    'registros': ['id', 'habito_id', 'data', 'valor', 'criado_em'],
    'notas': ['id', 'titulo', 'conteudo', 'data', 'ativo', 'fixado', 'tamanho', 'arquivado', 'ordem', 'anexos'],
    'tarefas_tarefas': ['id', 'titulo', 'descricao', 'notas', 'data_vencimento', 'prioridade', 'concluida', 'criado_em', 'projeto_id', 'anexos', 'subtarefas', 'repeticao', 'secao', 'ocultar_agenda', 'ordem'],
    'projetos_tarefas': ['id', 'nome', 'secoes', 'parent_id', 'ordem', 'icone', 'cor', 'imagem_id', 'imagem_nome', 'imagem_mime', 'imagem_url'],
    'agenda_eventos': ['id', 'titulo', 'descricao', 'data_inicio', 'hora_inicio', 'hora_fim', 'repeticao', 'dia_inteiro', 'cor', 'criado_em', 'anexos'],
    'agenda_conclusoes': ['chave', 'evento_id', 'data', 'hora', 'tipo', 'titulo', 'concluida', 'atualizado_em'],
    'financeiro_transacoes': ['id', 'titulo', 'valor', 'valor_pago', 'tipo', 'categoria', 'conta_id', 'data', 'status', 'criado_em', 'observacao', 'lote_id', 'pagamentos', 'ignorar_calculo'],
    'financeiro_categorias': ['id', 'nome'],
    'financeiro_contas': ['id', 'nome', 'saldo_inicial', 'cor'],
    'financeiro_cartoes': ['id', 'nome', 'limite', 'fechamento', 'vencimento', 'conta_id', 'cor'],
    'financeiro_fixos': ['id', 'grupo_id', 'titulo', 'valor', 'tipo', 'categoria', 'conta_id', 'dia_mes', 'mes_inicio', 'mes_fim', 'ativo', 'observacao', 'ignorar_calculo', 'criado_em', 'atualizado_em'],
    'financeiro_fixos_ocorrencias': ['chave', 'fixo_id', 'competencia', 'status', 'valor_override', 'data_override', 'ignorado', 'pagamentos', 'valor_pago', 'ignorar_calculo', 'atualizado_em'],
    'Metas': ['id', 'titulo', 'categoria', 'icone', 'status', 'prazo', 'descricao', 'progresso_label', 'progresso_atual', 'progresso_total', 'milestones', 'anexos'],
    'metas_categorias': ['id', 'nome'],
    'saude_rastreadores': ['id', 'categoria', 'nome', 'json_dados'],
    'saude_biblioteca': ['id', 'modulo', 'nome', 'json_dados'],
    'saude_diario': ['data', 'json_dados', 'atualizado_em'],
    'saude_metas': ['id', 'json_dados'] 
  };
  for (let sheetName in schemas) {
    let sheet = ss.getSheetByName(sheetName);
    if(!sheet) { sheet = ss.insertSheet(sheetName); sheet.appendRow(schemas[sheetName]); sheet.getRange(1, 1, 1, schemas[sheetName].length).setFontWeight("bold").setBackground("#e0e0e0"); sheet.setFrozenRows(1); }
  }
}

function formatarHoraPlanilha(value) {
  if (value === null || value === undefined || value === '') return '';
  const tz = getSpreadsheet().getSpreadsheetTimeZone() || Session.getScriptTimeZone();
  if (value instanceof Date && !isNaN(value.getTime())) return Utilities.formatDate(value, tz, 'HH:mm');
  const str = String(value).trim();
  const match = str.match(/(?:T|\s)(\d{1,2}):(\d{2})(?::\d{2})?/i) || str.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (match) return String(match[1]).padStart(2, '0') + ':' + match[2];
  return str;
}

function selectAll(sheetName) {
  const sheet = getSpreadsheet().getSheetByName(sheetName); if(!sheet) return [];
  const data = sheet.getDataRange().getValues(); if (data.length <= 1) return [];
  const headers = data[0]; const tz = getSpreadsheet().getSpreadsheetTimeZone() || Session.getScriptTimeZone();
  return data.slice(1).map(row => {
    let obj = {};
    headers.forEach((h, i) => {
      let value = row[i];
      if (value instanceof Date) {
        const header = String(h || '').toLowerCase();
        const isHora = header === 'hora' || header.startsWith('hora_') || header.endsWith('_hora');
        value = isHora ? formatarHoraPlanilha(value) : Utilities.formatDate(value, tz, "yyyy-MM-dd");
      }
      obj[h] = value;
    });
    return obj;
  });
}

function safeParseJSON(str) { try { if (str && String(str).trim() !== "" && String(str).length > 2) return JSON.parse(str); } catch(e) {} return []; }
function safeGetCol(sheet, headers, colName) { let idx = headers.indexOf(colName); if (idx === -1) { headers.push(colName); idx = headers.length - 1; sheet.getRange(1, idx + 1).setValue(colName).setFontWeight('bold'); } return idx + 1; }

// ==========================================
// MÓDULO: AGENDA & DRAG AND DROP
// ==========================================
function getConfigsAgenda() { const res = PropertiesService.getUserProperties().getProperty('agenda_calendarios_visiveis'); return { calendarios: res ? JSON.parse(res) : [] }; }
function salvarConfigsAgenda(calendariosIds) { PropertiesService.getUserProperties().setProperty('agenda_calendarios_visiveis', JSON.stringify(calendariosIds)); return { ok: true }; }
function getListaCalendarios() {
  try { const calendars = CalendarApp.getAllCalendars(); let prefs = { calendarios: [] }; try { prefs = getConfigsAgenda(); } catch(e) {}
    return calendars.map(cal => ({ id: cal.getId(), nome: cal.getName(), cor: cal.getColor(), selecionado: prefs.calendarios.length > 0 ? prefs.calendarios.indexOf(cal.getId()) > -1 : cal.isMyPrimaryCalendar() }));
  } catch (e) { return []; }
}


function garantirAgendaConclusoes_() {
  const ss = getSpreadsheet();
  let sheet = ss.getSheetByName('agenda_conclusoes');
  const headersNecessarios = ['chave', 'evento_id', 'data', 'hora', 'tipo', 'titulo', 'concluida', 'atualizado_em'];

  if (!sheet) {
    sheet = ss.insertSheet('agenda_conclusoes');
    sheet.appendRow(headersNecessarios);
    return sheet;
  }

  let values = sheet.getDataRange().getValues();
  let headers = values[0] || [];
  headersNecessarios.forEach(col => safeGetCol(sheet, headers, col));
  return sheet;
}

function chaveConclusaoEvento_(eventoId, data, tipo) {
  return [
    String(tipo || 'evento').trim() || 'evento',
    String(eventoId || '').trim(),
    String(data || '').split('T')[0]
  ].join('|');
}

function getConclusoesAgenda_(dataInicio, dataFim) {
  try {
    const sheet = garantirAgendaConclusoes_();
    const values = sheet.getDataRange().getValues();
    if (values.length < 2) return [];

    const headers = values[0].map(String);
    const idx = {};
    headers.forEach((h, i) => idx[h] = i);

    const inicio = String(dataInicio || '').split('T')[0];
    const fim = String(dataFim || '').split('T')[0];

    return values.slice(1).map(row => ({
      chave: String(row[idx.chave] || ''),
      evento_id: String(row[idx.evento_id] || ''),
      data: row[idx.data] instanceof Date
        ? Utilities.formatDate(row[idx.data], Session.getScriptTimeZone(), 'yyyy-MM-dd')
        : String(row[idx.data] || '').split('T')[0],
      hora: String(row[idx.hora] || ''),
      tipo: String(row[idx.tipo] || 'evento'),
      titulo: String(row[idx.titulo] || 'Compromisso'),
      concluida: String(row[idx.concluida]) === 'true' || row[idx.concluida] === true,
      atualizado_em: String(row[idx.atualizado_em] || '')
    })).filter(item => {
      if (!item.evento_id || !item.data || !item.concluida) return false;
      if (inicio && item.data < inicio) return false;
      if (fim && item.data > fim) return false;
      return true;
    });
  } catch (e) {
    return [];
  }
}

function getTodosCompromissosConcluidos_() {
  return getConclusoesAgenda_('', '');
}

function acaoEventoAgenda(dados) {
  const lock = LockService.getScriptLock();

  try {
    lock.waitLock(10000);

    const eventoId = String(dados && dados.id || '').trim();
    const data = String(dados && dados.data || '').split('T')[0];
    const hora = String(dados && dados.hora || '').trim();
    const tipo = String(dados && dados.tipo || 'evento').trim() || 'evento';
    const titulo = String(dados && dados.titulo || 'Compromisso').trim() || 'Compromisso';
    const concluida = dados && (dados.concluida === true || String(dados.concluida) === 'true');

    if (!eventoId || !data) {
      return { ok: false, erro: 'Compromisso ou data inválidos.' };
    }

    const sheet = garantirAgendaConclusoes_();
    const values = sheet.getDataRange().getValues();
    const headers = values[0].map(String);
    const idx = {};
    headers.forEach((h, i) => idx[h] = i);

    const chave = chaveConclusaoEvento_(eventoId, data, tipo);
    let rowIndex = -1;

    for (let i = 1; i < values.length; i++) {
      if (String(values[i][idx.chave] || '') === chave) {
        rowIndex = i + 1;
        break;
      }
    }

    if (!concluida) {
      if (rowIndex > 0) sheet.deleteRow(rowIndex);
      SpreadsheetApp.flush();
      return { ok: true, concluida: false, chave: chave };
    }

    const registro = {
      chave: chave,
      evento_id: eventoId,
      data: data,
      hora: hora,
      tipo: tipo,
      titulo: titulo,
      concluida: true,
      atualizado_em: new Date().toISOString()
    };

    const rowData = headers.map(h => registro[h] !== undefined ? registro[h] : '');

    if (rowIndex > 0) {
      sheet.getRange(rowIndex, 1, 1, rowData.length).setValues([rowData]);
    } else {
      sheet.appendRow(rowData);
    }

    SpreadsheetApp.flush();
    return { ok: true, concluida: true, chave: chave, registro: registro };
  } catch (e) {
    return { ok: false, erro: e.message || String(e) };
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
}


function agendaDateKey_(value, tz) {
  if (!value) return '';
  if (value instanceof Date) return Utilities.formatDate(value, tz, 'yyyy-MM-dd');
  const text = String(value);
  const match = text.match(/^\d{4}-\d{2}-\d{2}/);
  return match ? match[0] : '';
}

function agendaTimeKey_(value, tz) {
  if (!value) return '';
  if (value instanceof Date) return Utilities.formatDate(value, tz, 'HH:mm');
  const text = String(value);
  const match = text.match(/(\d{2}):(\d{2})/);
  return match ? match[1] + ':' + match[2] : '';
}

function agendaRecurringRelevant_(baseDate, repetition, startKey, endKey) {
  if (!baseDate) return false;
  if (baseDate > endKey) return false;
  if (String(repetition || '').trim()) return true;
  return baseDate >= startKey && baseDate <= endKey;
}

function getAgendaPlannerInterno(dataInicio, dataFim) {
  try {
    const ss = getSpreadsheet();
    const tz = ss.getSpreadsheetTimeZone() || Session.getScriptTimeZone();
    const startKey = String(dataInicio || '').split('T')[0];
    const endKey = String(dataFim || '').split('T')[0];

    const result = {
      ok: true,
      eventos: [],
      tarefas: [],
      projetos: [{ id: 'entrada', nome: 'Entrada' }],
      habitos: [],
      registros: [],
      conclusoes: []
    };

    // Eventos locais: somente dados necessários ao calendário/editor.
    try {
      const sheet = ss.getSheetByName('agenda_eventos');
      if (sheet) {
        const values = sheet.getDataRange().getValues();
        const headers = (values[0] || []).map(String);
        const idx = {};
        headers.forEach((h, i) => idx[h] = i);

        for (let r = 1; r < values.length; r++) {
          const row = values[r];
          const id = String(row[idx.id] || '').trim();
          if (!id) continue;

          const date = agendaDateKey_(row[idx.data_inicio], tz);
          const repetition = String(row[idx.repeticao] || '');
          if (!agendaRecurringRelevant_(date, repetition, startKey, endKey)) continue;

          result.eventos.push({
            id,
            titulo: String(row[idx.titulo] || ''),
            descricao: String(row[idx.descricao] || ''),
            data_inicio: date,
            hora_inicio: agendaTimeKey_(row[idx.hora_inicio], tz),
            hora_fim: agendaTimeKey_(row[idx.hora_fim], tz),
            dia_inteiro: row[idx.dia_inteiro] === true || String(row[idx.dia_inteiro]) === 'true',
            cor: String(row[idx.cor] || 'var(--accent)'),
            repeticao: repetition,
            tipo: 'evento'
          });
        }
      }
    } catch (e) {}

    // Projetos: só id + nome para a classificação visual da Agenda.
    const projectNames = { entrada: 'Entrada' };
    try {
      const sheet = ss.getSheetByName('projetos_tarefas');
      if (sheet) {
        const values = sheet.getDataRange().getValues();
        const headers = (values[0] || []).map(String);
        const idxId = headers.indexOf('id');
        const idxNome = headers.indexOf('nome');

        for (let r = 1; r < values.length; r++) {
          const id = String(values[r][idxId] || '').trim();
          if (!id) continue;
          const nome = String(values[r][idxNome] || id);
          projectNames[id] = nome;
          result.projetos.push({ id, nome });
        }
      }
    } catch (e) {}

    // Tarefas leves. Descrição, anexos e notas não são lidos para o calendário.
    try {
      const sheet = ss.getSheetByName('tarefas_tarefas');
      if (sheet) {
        const values = sheet.getDataRange().getValues();
        const headers = (values[0] || []).map(String);
        const idx = {};
        headers.forEach((h, i) => idx[h] = i);

        for (let r = 1; r < values.length; r++) {
          const row = values[r];
          const id = String(row[idx.id] || '').trim();
          if (!id) continue;

          const rawDue = row[idx.data_vencimento];
          const dueDate = agendaDateKey_(rawDue, tz);
          const dueTime = typeof rawDue === 'string' && String(rawDue).includes('T')
            ? agendaTimeKey_(String(rawDue).split('T')[1], tz)
            : '';

          const repetition = String(row[idx.repeticao] || '');
          const hidden = row[idx.ocultar_agenda] === true || String(row[idx.ocultar_agenda]) === 'true';
          if (!hidden && agendaRecurringRelevant_(dueDate, repetition, startKey, endKey)) {
            result.tarefas.push({
              id,
              titulo: String(row[idx.titulo] || ''),
              data_vencimento: dueDate,
              hora_inicio: dueTime,
              prioridade: Number(row[idx.prioridade]) || 4,
              concluida: row[idx.concluida] === true || String(row[idx.concluida]) === 'true',
              projeto_id: String(row[idx.projeto_id] || 'entrada').trim() || 'entrada',
              secao: String(row[idx.secao] || '').trim(),
              repeticao: repetition,
              ocultar_agenda: false
            });
          }

          // Subtarefas entram já achatadas, sem carregar o restante da tarefa no cliente.
          try {
            const subtasks = safeParseJSON(row[idx.subtarefas]);
            if (Array.isArray(subtasks)) {
              subtasks.forEach((sub, subIndex) => {
                if (!sub || sub.concluida) return;
                const subDate = agendaDateKey_(sub.data_vencimento, tz);
                const subTime = String(sub.data_vencimento || '').includes('T')
                  ? agendaTimeKey_(String(sub.data_vencimento).split('T')[1], tz)
                  : '';
                const subRep = String(sub.repeticao || '');
                if (!agendaRecurringRelevant_(subDate, subRep, startKey, endKey)) return;

                result.tarefas.push({
                  id: String(sub.id || (id + '-sub-' + subIndex)),
                  titulo: '↳ ' + String(sub.titulo || ''),
                  data_vencimento: subDate,
                  hora_inicio: subTime,
                  prioridade: Number(sub.prioridade) || 4,
                  concluida: false,
                  projeto_id: String(row[idx.projeto_id] || 'entrada').trim() || 'entrada',
                  secao: String(row[idx.secao] || '').trim(),
                  repeticao: subRep,
                  ocultar_agenda: false,
                  subtarefa: true,
                  parent_id: id
                });
              });
            }
          } catch (e) {}
        }
      }
    } catch (e) {}

    // Hábitos leves.
    try {
      const sheet = ss.getSheetByName('habitos');
      if (sheet) {
        const values = sheet.getDataRange().getValues();
        const headers = (values[0] || []).map(String);
        const idx = {};
        headers.forEach((h, i) => idx[h] = i);

        for (let r = 1; r < values.length; r++) {
          const row = values[r];
          const id = String(row[idx.id] || '').trim();
          if (!id) continue;

          const active = row[idx.ativo] === true || String(row[idx.ativo]) === 'true';
          const hidden = row[idx.ocultar_agenda] === true || String(row[idx.ocultar_agenda]) === 'true';
          if (!active || hidden) continue;

          const criadoEm = agendaDateKey_(row[idx.criado_em], tz) || startKey;
          const horaHabito = agendaTimeKey_(row[idx.hora], tz);

          result.habitos.push({
            id,
            nome: String(row[idx.nome] || ''),
            titulo: String(row[idx.nome] || ''),
            cor_hex: String(row[idx.cor_hex] || 'var(--success)'),
            cor: String(row[idx.cor_hex] || 'var(--success)'),
            meta: Number(row[idx.meta]) || 1,
            unidade: String(row[idx.unidade] || ''),
            ativo: true,
            ocultar_agenda: false,
            hora: horaHabito,
            hora_inicio: horaHabito,
            criado_em: criadoEm,
            data_inicio: criadoEm,
            repeticao: 'diariamente',
            tipo: 'habito',
            habit_id: id
          });
        }
      }
    } catch (e) {}

    // Registros de hábitos somente do intervalo carregado.
    try {
      const sheet = ss.getSheetByName('registros');
      if (sheet) {
        const values = sheet.getDataRange().getValues();
        const headers = (values[0] || []).map(String);
        const idx = {};
        headers.forEach((h, i) => idx[h] = i);

        for (let r = 1; r < values.length; r++) {
          const date = agendaDateKey_(values[r][idx.data], tz);
          if (!date || date < startKey || date > endKey) continue;

          result.registros.push({
            habito_id: String(values[r][idx.habito_id] || ''),
            data: date,
            valor: Number(values[r][idx.valor]) || 0
          });
        }
      }
    } catch (e) {}

    result.conclusoes = getConclusoesAgenda_(startKey, endKey);
    return result;
  } catch (e) {
    return { ok: false, erro: e && e.message ? e.message : String(e) };
  }
}

function getGoogleCalendarPeriodo(dataInicioISO, dataFimISO) {
  try {
    const tz = Session.getScriptTimeZone();
    const inicio = new Date(dataInicioISO);
    const fim = new Date(dataFimISO);
    const eventos = [];

    const configs = getConfigsAgenda();
    const calendarios = configs && Array.isArray(configs.calendarios) ? configs.calendarios : [];

    calendarios.forEach(calId => {
      try {
        const cal = CalendarApp.getCalendarById(calId);
        if (!cal) return;

        cal.getEvents(inicio, fim).forEach(evento => {
          eventos.push({
            id: evento.getId(),
            id_base: evento.getId().split('_')[0],
            titulo: evento.getTitle(),
            descricao: evento.getDescription() || '',
            data_inicio: Utilities.formatDate(evento.getStartTime(), tz, 'yyyy-MM-dd'),
            hora_inicio: evento.isAllDayEvent() ? '' : Utilities.formatDate(evento.getStartTime(), tz, 'HH:mm'),
            hora_fim: evento.isAllDayEvent() ? '' : Utilities.formatDate(evento.getEndTime(), tz, 'HH:mm'),
            dia_inteiro: evento.isAllDayEvent(),
            cor: cal.getColor() || 'var(--accent)',
            tipo: 'gcalendar',
            repeticao: evento.isRecurringEvent() ? 'sim' : ''
          });
        });
      } catch (e) {}
    });

    return { ok: true, eventos };
  } catch (e) {
    return { ok: false, erro: e && e.message ? e.message : String(e), eventos: [] };
  }
}


function getDadosAgendaCompleta(dataInicioISO, dataFimISO) {
  try {
    const tz = Session.getScriptTimeZone();
    const inicio = new Date(dataInicioISO);
    const fim = new Date(dataFimISO);
    const startKey = Utilities.formatDate(inicio, tz, 'yyyy-MM-dd');
    const endKey = Utilities.formatDate(fim, tz, 'yyyy-MM-dd');

    const interno = getAgendaPlannerInterno(startKey, endKey);
    const google = getGoogleCalendarPeriodo(dataInicioISO, dataFimISO);

    return JSON.stringify({
      ok: true,
      eventos: [
        ...((google && google.ok && google.eventos) ? google.eventos : []),
        ...((interno && interno.ok && interno.eventos) ? interno.eventos : [])
      ],
      tarefas: interno && interno.ok ? (interno.tarefas || []) : [],
      habitos: interno && interno.ok ? (interno.habitos || []) : [],
      conclusoes: interno && interno.ok ? (interno.conclusoes || []) : []
    });
  } catch (e) {
    return JSON.stringify({ ok: false, erro: e && e.message ? e.message : String(e) });
  }
}



function getResumoHoje() {
  try {
    const ss = getSpreadsheet();
    const tz = ss.getSpreadsheetTimeZone() || Session.getScriptTimeZone();
    const agora = new Date();
    const hoje = Utilities.formatDate(agora, tz, "yyyy-MM-dd");

    const inicio = new Date(agora.getTime());
    inicio.setHours(0, 0, 0, 0);
    const fim = new Date(agora.getTime());
    fim.setHours(23, 59, 59, 999);

    let agenda = { eventos: [], tarefas: [], habitos: [], conclusoes: [] };
    try {
      const interno = getAgendaPlannerInterno(hoje, hoje);
      const google = getGoogleCalendarPeriodo(inicio.toISOString(), fim.toISOString());

      agenda = {
        eventos: [
          ...((google && google.ok && google.eventos) ? google.eventos : []),
          ...((interno && interno.ok && interno.eventos) ? interno.eventos : [])
        ],
        tarefas: interno && interno.ok ? (interno.tarefas || []) : [],
        habitos: interno && interno.ok ? (interno.habitos || []) : [],
        conclusoes: interno && interno.ok ? (interno.conclusoes || []) : []
      };
    } catch (e) {}

    let tarefasDetalhadas = [];
    let projetos = [];
    try {
      const rawTarefas = getDadosTarefas();
      const dadosTarefas = typeof rawTarefas === 'string' ? JSON.parse(rawTarefas) : rawTarefas;
      if (dadosTarefas && dadosTarefas.ok) {
        tarefasDetalhadas = dadosTarefas.tarefas || [];
        projetos = dadosTarefas.projetos || [];
      }
    } catch (e) {}

    let registros = [];
    try {
      const resRegistros = getRegistrosDoPeriodo(hoje, hoje);
      if (resRegistros && resRegistros.ok) registros = resRegistros.data || [];
    } catch (e) {}

    let financeiro = [];
    try {
      const rawFinanceiro = getDadosFinanceiro();
      const dadosFinanceiro = typeof rawFinanceiro === 'string' ? JSON.parse(rawFinanceiro) : rawFinanceiro;
      if (dadosFinanceiro && dadosFinanceiro.ok) {
        financeiro = (dadosFinanceiro.transacoes || [])
          .filter(t => {
            const status = String(t.status || '').trim().toLowerCase();
            const quitado = ['pago', 'paga', 'quitado', 'quitada', 'concluido', 'concluída', 'concluida'].includes(status);
            const saldo = Math.max(0, Number(t.valor || 0) - Number(t.valor_pago || 0));
            return !quitado && saldo > 0 && t.data && String(t.data).split('T')[0] <= hoje;
          })
          .sort((a, b) => String(a.data || '').localeCompare(String(b.data || '')));
      }
    } catch (e) {}

    let metas = [];
    try {
      const rawMetas = getDadosMetas();
      const dadosMetas = typeof rawMetas === 'string' ? JSON.parse(rawMetas) : rawMetas;
      if (dadosMetas && dadosMetas.ok) {
        metas = (dadosMetas.metas || [])
          .filter(m => {
            const status = String(m.status || '').trim().toLowerCase();
            return !['concluída', 'concluida', 'concluido', 'concluído'].includes(status);
          })
          .sort((a, b) => {
            const pa = String(a.prazo || '9999-12-31').split('T')[0];
            const pb = String(b.prazo || '9999-12-31').split('T')[0];
            return pa.localeCompare(pb);
          });
      }
    } catch (e) {}

    let saude = {};
    try {
      const rawSaude = getDadosSaude();
      const dadosSaude = typeof rawSaude === 'string' ? JSON.parse(rawSaude) : rawSaude;
      if (dadosSaude && dadosSaude.ok && dadosSaude.diarioDB) {
        saude = dadosSaude.diarioDB[hoje] || {};
      }
    } catch (e) {}

    return {
      ok: true,
      hoje: hoje,
      agenda: agenda,
      tarefasDetalhadas: tarefasDetalhadas,
      projetos: projetos,
      registros: registros,
      financeiro: financeiro,
      metas: metas,
      saude: saude
    };
  } catch (e) {
    return { ok: false, erro: e && e.message ? e.message : String(e) };
  }
}

function salvarEventoAgenda(dados) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000); const ss = getSpreadsheet(); let sheet = ss.getSheetByName('agenda_eventos');
    if (!sheet) { sheet = ss.insertSheet('agenda_eventos'); sheet.appendRow(['id', 'titulo', 'descricao', 'data_inicio', 'hora_inicio', 'hora_fim', 'repeticao', 'dia_inteiro', 'cor', 'criado_em', 'anexos']); }
    let data = sheet.getDataRange().getValues(); let headers = data[0];
    const colunasNecessarias = ['id', 'titulo', 'descricao', 'data_inicio', 'hora_inicio', 'hora_fim', 'repeticao', 'dia_inteiro', 'cor', 'criado_em', 'anexos'];
    colunasNecessarias.forEach(col => safeGetCol(sheet, headers, col));
    
    const rowIndex = dados.id ? data.findIndex(row => String(row[0]).trim() === String(dados.id).trim()) : -1;
    const rowData = headers.map(h => {
      if (h === 'id') return dados.id || 'ev-' + Utilities.getUuid(); if (h === 'titulo') return dados.titulo; if (h === 'descricao') return dados.descricao; if (h === 'data_inicio') return dados.data_inicio; if (h === 'hora_inicio') return dados.dia_inteiro ? '' : dados.hora_inicio; if (h === 'hora_fim') return dados.dia_inteiro ? '' : (dados.hora_fim || ''); if (h === 'repeticao') return dados.repeticao; if (h === 'dia_inteiro') return dados.dia_inteiro; if (h === 'anexos') return JSON.stringify(dados.anexos || []); if (h === 'cor') return dados.cor || 'var(--accent)'; if (h === 'criado_em') return rowIndex > 0 ? data[rowIndex][headers.indexOf('criado_em')] : new Date().toISOString(); return '';
    });
    if (rowIndex > 0) sheet.getRange(rowIndex + 1, 1, 1, rowData.length).setValues([rowData]); else sheet.appendRow(rowData);

    try {
      const statusSheet = garantirAgendaConclusoes_();
      const statusValues = statusSheet.getDataRange().getValues();
      const statusHeaders = statusValues[0].map(String);
      const idxEvento = statusHeaders.indexOf('evento_id');
      const idxTitulo = statusHeaders.indexOf('titulo');
      if (idxEvento >= 0 && idxTitulo >= 0) {
        for (let i = 1; i < statusValues.length; i++) {
          if (String(statusValues[i][idxEvento] || '') === String(dados.id || '')) {
            statusSheet.getRange(i + 1, idxTitulo + 1).setValue(dados.titulo || 'Compromisso');
          }
        }
      }
    } catch (e) {}

    SpreadsheetApp.flush(); return { ok: true };
  } catch (e) { return { ok: false, erro: e.message }; } finally { lock.releaseLock(); }
}

function excluirEventoAgenda(id) {
  const lock = LockService.getScriptLock();
  try { lock.waitLock(10000); const sheet = getSpreadsheet().getSheetByName('agenda_eventos'); const data = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]).trim() === String(id).trim()) {
        sheet.deleteRow(i + 1);

        try {
          const statusSheet = garantirAgendaConclusoes_();
          const statusValues = statusSheet.getDataRange().getValues();
          const statusHeaders = statusValues[0].map(String);
          const idxEvento = statusHeaders.indexOf('evento_id');

          for (let r = statusValues.length - 1; r >= 1; r--) {
            if (idxEvento >= 0 && String(statusValues[r][idxEvento] || '') === String(id)) {
              statusSheet.deleteRow(r + 1);
            }
          }
        } catch (e) {}

        SpreadsheetApp.flush();
        return { ok: true };
      }
    }
    return { ok: false };
  } catch (e) { return { ok: false }; } finally { lock.releaseLock(); }
}

function atualizarDataHoraArrastar(id, tipo, novaData, novaHora) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(5000); const ss = getSpreadsheet();
    if (tipo === 'evento') {
      let sheet = ss.getSheetByName('agenda_eventos'); let data = sheet.getDataRange().getValues(); let h = data[0];
      for(let i=1; i<data.length; i++) {
        if(String(data[i][0]).trim() === String(id).trim()) {
          sheet.getRange(i+1, safeGetCol(sheet, h, 'data_inicio')).setValue(novaData);
          if (novaHora !== undefined && novaHora !== null) {
             let hOld = data[i][h.indexOf('hora_inicio')]; let hFim = data[i][h.indexOf('hora_fim')];
             sheet.getRange(i+1, safeGetCol(sheet, h, 'hora_inicio')).setValue(novaHora); sheet.getRange(i+1, safeGetCol(sheet, h, 'dia_inteiro')).setValue(false);
             if(hOld && hFim && String(hOld).includes(':') && String(hFim).includes(':')) {
                 let mI = parseInt(String(hOld).split(':')[0])*60 + parseInt(String(hOld).split(':')[1]); let mF = parseInt(String(hFim).split(':')[0])*60 + parseInt(String(hFim).split(':')[1]); let dur = mF - mI;
                 if(dur > 0) { let nI = parseInt(novaHora.split(':')[0])*60 + parseInt(novaHora.split(':')[1]); let nF = nI + dur; sheet.getRange(i+1, safeGetCol(sheet, h, 'hora_fim')).setValue(`${String(Math.floor(nF/60)).padStart(2,'0')}:${String(nF%60).padStart(2,'0')}`); }
             }
          }
          return {ok: true};
        }
      }
    } else if (tipo === 'tarefa') {
      let sheet = ss.getSheetByName('tarefas_tarefas'); let data = sheet.getDataRange().getValues(); let h = data[0];
      for(let i=1; i<data.length; i++) {
        if(String(data[i][0]).trim() === String(id).trim()) { sheet.getRange(i+1, safeGetCol(sheet, h, 'data_vencimento')).setValue(novaHora ? `${novaData}T${novaHora}` : novaData); return {ok: true}; }
        let idxSub = h.indexOf('subtarefas');
        if (idxSub > -1 && data[i][idxSub]) {
           try { let subs = JSON.parse(data[i][idxSub]); let found = false; subs.forEach(s => { if (String(s.id).trim() === String(id).trim()) { s.data_vencimento = novaHora ? `${novaData}T${novaHora}` : novaData; found = true; } }); if (found) { sheet.getRange(i+1, safeGetCol(sheet, h, 'subtarefas')).setValue(JSON.stringify(subs)); return {ok: true}; } } catch(err) {}
        }
      }
    } else if (tipo === 'habito' && novaHora) {
      let sheet = ss.getSheetByName('habitos'); let data = sheet.getDataRange().getValues(); let h = data[0];
      for(let i=1; i<data.length; i++) { if(String(data[i][0]).trim() === String(id).trim()) { sheet.getRange(i+1, safeGetCol(sheet, h, 'hora')).setValue(novaHora); return {ok: true}; } }
    }
    return {ok: false};
  } catch(e) { return {ok:false, erro: e.message}; } finally { lock.releaseLock(); }
}

// ==========================================
// APOIO: PROJETOS HIERÁRQUICOS DE TAREFAS
// ==========================================
function garantirSchemaProjetosTarefas_(sheet) {
  if (!sheet) throw new Error('A aba projetos_tarefas não existe. Execute setup().');
  let headers = sheet.getDataRange().getValues()[0] || [];
  ['id', 'nome', 'secoes', 'parent_id', 'ordem', 'icone', 'cor', 'imagem_id', 'imagem_nome', 'imagem_mime', 'imagem_url'].forEach(coluna => safeGetCol(sheet, headers, coluna));
  return sheet.getDataRange().getValues()[0];
}

function lerProjetosTarefas_(sheet) {
  const headers = garantirSchemaProjetosTarefas_(sheet);
  const data = sheet.getDataRange().getValues();
  const idx = {};
  headers.forEach((h, i) => idx[String(h)] = i);

  return data.slice(1).map((row, index) => {
    const id = String(row[idx.id] || '').trim();
    if (!id) return null;

    let parentId = String(row[idx.parent_id] || '').trim();
    if (parentId === 'entrada' || parentId === id) parentId = '';

    const ordemRaw = Number(row[idx.ordem]);
    return {
      id: id,
      nome: String(row[idx.nome] || 'Sem nome').trim() || 'Sem nome',
      secoes: safeParseJSON(row[idx.secoes]),
      parent_id: parentId,
      ordem: isFinite(ordemRaw) ? ordemRaw : index,
      icone: String(row[idx.icone] || 'folder').trim() || 'folder',
      cor: String(row[idx.cor] || '#8A8A8A').trim() || '#8A8A8A',
      imagem_id: String(row[idx.imagem_id] || '').trim(),
      imagem_nome: String(row[idx.imagem_nome] || '').trim(),
      imagem_mime: String(row[idx.imagem_mime] || '').trim(),
      imagem_url: String(row[idx.imagem_url] || '').trim()
    };
  }).filter(Boolean);
}


function obterImagemProjetoDataUrl_(imagemId) {
  const id = String(imagemId || '').trim();
  if (!id) return '';

  const cacheKey = 'mai_project_image_' + id;

  try {
    const cache = CacheService.getScriptCache();
    const cached = cache.get(cacheKey);
    if (cached) return cached;
  } catch (cacheReadError) {}

  try {
    const file = DriveApp.getFileById(id);
    const blob = file.getBlob();
    const bytes = blob.getBytes();

    if (!bytes || !bytes.length || bytes.length > 4 * 1024 * 1024) return '';

    const mime = String(blob.getContentType() || 'image/jpeg');
    if (!/^image\//i.test(mime)) return '';

    const dataUrl = 'data:' + mime + ';base64,' + Utilities.base64Encode(bytes);

    try {
      if (dataUrl.length < 95000) {
        CacheService.getScriptCache().put(cacheKey, dataUrl, 21600);
      }
    } catch (cacheWriteError) {}

    return dataUrl;
  } catch (e) {
    return '';
  }
}


function getImagemProjeto(imagemId) {
  try {
    const id = String(imagemId || '').trim();
    if (!id) return { ok: false, erro: 'Imagem inválida.' };
    const dataUrl = obterImagemProjetoDataUrl_(id);
    return dataUrl
      ? { ok: true, imagemId: id, dataUrl: dataUrl }
      : { ok: false, erro: 'Imagem não encontrada.' };
  } catch (e) {
    return { ok: false, erro: e.message || String(e) };
  }
}

function limparCacheImagemProjeto_(imagemId) {
  const id = String(imagemId || '').trim();
  if (!id) return;
  try {
    CacheService.getScriptCache().remove('mai_project_image_' + id);
  } catch (e) {}
}

function mapaProjetosTarefas_(projetos) {
  const mapa = {};
  (projetos || []).forEach(p => mapa[String(p.id)] = p);
  return mapa;
}

function projetoCriaCiclo_(projetos, projetoId, novoParentId) {
  const id = String(projetoId || '').trim();
  let atual = String(novoParentId || '').trim();
  if (!id || !atual) return false;
  if (id === atual) return true;

  const mapa = mapaProjetosTarefas_(projetos);
  const visitados = {};
  while (atual) {
    if (atual === id) return true;
    if (visitados[atual]) return true;
    visitados[atual] = true;
    atual = mapa[atual] ? String(mapa[atual].parent_id || '').trim() : '';
  }
  return false;
}

function proximaOrdemProjeto_(projetos, parentId) {
  const pai = String(parentId || '').trim();
  let maior = -1;
  (projetos || []).forEach(p => {
    if (String(p.parent_id || '').trim() === pai) {
      const valor = Number(p.ordem);
      if (isFinite(valor) && valor > maior) maior = valor;
    }
  });
  return maior + 1;
}

// ==========================================
// MÓDULO: TAREFAS (COM NOTAS)
// ==========================================
function getDadosTarefas() {
  try {
    const ss = getSpreadsheet();
    const projetos = [{ id: 'entrada', nome: 'Entrada', secoes: [], parent_id: '', ordem: -1, icone: 'inbox', cor: '#8A8A8A', imagem_id: '', imagem_nome: '', imagem_mime: '', imagem_url: '' }];
    const tarefas = [];

    const sheetP = ss.getSheetByName('projetos_tarefas');
    if (sheetP) {
      const projetosSalvos = lerProjetosTarefas_(sheetP);
      const ids = {};
      projetosSalvos.forEach(p => ids[String(p.id)] = true);

      projetosSalvos.forEach(p => {
        if (p.parent_id && !ids[String(p.parent_id)]) p.parent_id = '';

        // A listagem recebe apenas os metadados. A imagem é carregada
        // separadamente pelo navegador e mantida no IndexedDB local.
        p.imagem_url = '';
        projetos.push(p);
      });
    }

    const sheetT = ss.getSheetByName('tarefas_tarefas');
    if (sheetT) {
      let dataT = sheetT.getDataRange().getValues();
      const cabecalhoAtual = dataT[0] || [];
      if (cabecalhoAtual.indexOf('ordem') === -1) {
        safeGetCol(sheetT, cabecalhoAtual, 'ordem');
        dataT = sheetT.getDataRange().getValues();
      }
      if (dataT.length > 1) {
        const headT = dataT[0];
        const tz = Session.getScriptTimeZone();
        const index = {};
        headT.forEach((h, i) => index[String(h)] = i);

        for (let i = 1; i < dataT.length; i++) {
          const tId = dataT[i][index.id];
          if (!tId) continue;

          const val = dataT[i][index.data_vencimento];
          let dataV = '';
          if (val instanceof Date) {
            dataV = Utilities.formatDate(val, tz, 'yyyy-MM-dd');
          } else if (val) {
            dataV = String(val);
          }

          tarefas.push({
            id: String(tId),
            titulo: String(dataT[i][index.titulo] || ''),
            descricao: String(dataT[i][index.descricao] || ''),
            notas: safeParseJSON(dataT[i][index.notas]),
            data_vencimento: dataV,
            prioridade: Number(dataT[i][index.prioridade]) || 4,
            concluida: String(dataT[i][index.concluida]) === 'true',
            projeto_id: String(dataT[i][index.projeto_id] || 'entrada').trim() || 'entrada',
            secao: String(dataT[i][index.secao] || '').trim(),
            repeticao: String(dataT[i][index.repeticao] || ''),
            anexos: safeParseJSON(dataT[i][index.anexos]),
            subtarefas: safeParseJSON(dataT[i][index.subtarefas]),
            ocultar_agenda: String(dataT[i][index.ocultar_agenda]) === 'true',
            ordem: index.ordem !== undefined && index.ordem > -1 && isFinite(Number(dataT[i][index.ordem]))
              ? Number(dataT[i][index.ordem])
              : i
          });
        }
      }
    }

    const eventosConcluidos = getTodosCompromissosConcluidos_();

    return JSON.stringify({
      ok: true,
      tarefas: tarefas,
      projetos: projetos,
      eventos_concluidos: eventosConcluidos
    });
  } catch (e) {
    return JSON.stringify({ ok: false, erro: e.message });
  }
}

function salvarTarefa(dados) { 
  const lock = LockService.getScriptLock(); 
  try { 
    lock.waitLock(10000); const ss = getSpreadsheet(); let sheet = ss.getSheetByName('tarefas_tarefas'); const data = sheet.getDataRange().getValues(); let headers = data[0]; 
    safeGetCol(sheet, headers, 'notas'); // GARANTE QUE A NOVA COLUNA DE NOTAS EXISTA
    safeGetCol(sheet, headers, 'ordem');
    
    const rowIndex = dados.id ? data.findIndex(row => String(row[0]).trim() === String(dados.id).trim()) : -1;
    const ordemCol = headers.indexOf('ordem');
    let ordemTarefa = Number(dados && dados.ordem);
    if (!isFinite(ordemTarefa)) {
      const ordemExistente = rowIndex > 0 && ordemCol > -1 ? Number(data[rowIndex][ordemCol]) : NaN;
      ordemTarefa = isFinite(ordemExistente) ? ordemExistente : new Date().getTime();
    }
    const rowData = headers.map(h => { 
        if (h === 'id') return dados.id || 't-' + Utilities.getUuid(); 
        if (h === 'titulo') return dados.titulo; 
        if (h === 'descricao') return dados.descricao || ''; 
        if (h === 'notas') return JSON.stringify(dados.notas || []); // SALVA O ARRAY DE NOTAS
        if (h === 'data_vencimento') return dados.data_vencimento || ''; 
        if (h === 'prioridade') return dados.prioridade || 4; 
        if (h === 'concluida') return dados.concluida || false; 
        if (h === 'projeto_id') return dados.projeto_id || 'entrada'; 
        if (h === 'secao') return dados.secao || ''; 
        if (h === 'repeticao') return dados.repeticao || ''; 
        if (h === 'anexos') return JSON.stringify(dados.anexos || []); 
        if (h === 'subtarefas') return JSON.stringify(dados.subtarefas || []); 
        if (h === 'ocultar_agenda') return dados.ocultar_agenda || false;
        if (h === 'ordem') return ordemTarefa;
        if (h === 'criado_em') return rowIndex > 0 ? data[rowIndex][headers.indexOf('criado_em')] : new Date().toISOString(); 
        return ''; 
    }); 
    if (rowIndex > 0) sheet.getRange(rowIndex + 1, 1, 1, headers.length).setValues([rowData]); else sheet.appendRow(rowData); return { ok: true }; 
  } catch (e) { return { ok: false, erro: e.message }; } finally { lock.releaseLock(); } 
}


function atualizarOrdemTarefasProjeto(movimentos) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    if (!Array.isArray(movimentos) || !movimentos.length) return { ok: true };

    const sheet = getSpreadsheet().getSheetByName('tarefas_tarefas');
    if (!sheet) return { ok: false, erro: 'A aba tarefas_tarefas não existe.' };

    const headers = sheet.getDataRange().getValues()[0] || [];
    const colProjeto = safeGetCol(sheet, headers, 'projeto_id');
    const colSecao = safeGetCol(sheet, headers, 'secao');
    const colOrdem = safeGetCol(sheet, headers, 'ordem');
    const data = sheet.getDataRange().getValues();
    const idIndex = data[0].indexOf('id');
    const linhas = {};

    for (let i = 1; i < data.length; i++) {
      const id = String(data[i][idIndex] || '').trim();
      if (id) linhas[id] = i + 1;
    }

    movimentos.forEach((movimento, index) => {
      const id = String(movimento && movimento.id || '').trim();
      const linha = linhas[id];
      if (!linha) return;

      const projetoId = String(movimento.projeto_id || 'entrada').trim() || 'entrada';
      const secao = String(movimento.secao || '').trim();
      const ordem = isFinite(Number(movimento.ordem)) ? Number(movimento.ordem) : index;

      sheet.getRange(linha, colProjeto).setValue(projetoId);
      sheet.getRange(linha, colSecao).setValue(secao);
      sheet.getRange(linha, colOrdem).setValue(ordem);
    });

    SpreadsheetApp.flush();
    return { ok: true };
  } catch (e) {
    return { ok: false, erro: e.message };
  } finally {
    lock.releaseLock();
  }
}

function acaoTarefa(id, acao) { 
  const lock = LockService.getScriptLock(); 
  try { 
      lock.waitLock(5000); const ss = getSpreadsheet(); const sheet = ss.getSheetByName('tarefas_tarefas'); const data = sheet.getDataRange().getValues(); let headers = data[0]; 
      for (let i = 1; i < data.length; i++) { 
          if (String(data[i][0]).trim() === String(id).trim()) { 
              if (acao === 'deletar') { sheet.deleteRow(i + 1); }
              else if (acao === 'reabrir') {
                  sheet.getRange(i + 1, safeGetCol(sheet, headers, 'concluida')).setValue(false);
              }
              else if (acao === 'concluir') { 
                  let repRule = headers.indexOf('repeticao') > -1 ? String(data[i][headers.indexOf('repeticao')] || '') : ''; 
                  let valDB = headers.indexOf('data_vencimento') > -1 ? data[i][headers.indexOf('data_vencimento')] : null; 
                  
                  if (repRule && valDB) { 
                      let strDB = String(valDB); let isObjDate = valDB instanceof Date;
                      let hasTime = strDB.includes('T') || (isObjDate && (valDB.getHours() !== 0 || valDB.getMinutes() !== 0));
                      let nextDate;
                      
                      if (isObjDate) { nextDate = new Date(valDB.getTime()); } 
                      else { nextDate = new Date(strDB.includes('T') ? strDB : strDB + 'T12:00:00'); }
                      
                      if (isNaN(nextDate.getTime())) nextDate = new Date(); 
                      
                      if (repRule === 'diariamente') nextDate.setDate(nextDate.getDate() + 1); 
                      else if (repRule === 'semanalmente') nextDate.setDate(nextDate.getDate() + 7); 
                      else if (repRule === 'mensalmente') nextDate.setMonth(nextDate.getMonth() + 1); 
                      else if (repRule === 'anualmente') nextDate.setFullYear(nextDate.getFullYear() + 1); 
                      else if (repRule.startsWith('intervalo:')) { nextDate.setDate(nextDate.getDate() + parseInt(repRule.split(':')[1])); } 
                      else if (repRule.startsWith('semanal:')) { let diasEscolhidos = repRule.split(':')[1].split(',').map(Number); let diaDaSemanaAtual = nextDate.getDay(); let diasParaAdicionar = 1; while (diasParaAdicionar <= 7) { if (diasEscolhidos.includes((diaDaSemanaAtual + diasParaAdicionar) % 7)) break; diasParaAdicionar++; } nextDate.setDate(nextDate.getDate() + diasParaAdicionar); } 
                      
                      let tz = Session.getScriptTimeZone(); 
                      let formatoVencimento = hasTime ? "yyyy-MM-dd'T'HH:mm" : "yyyy-MM-dd";
                      sheet.getRange(i + 1, safeGetCol(sheet, headers, 'data_vencimento')).setValue(Utilities.formatDate(nextDate, tz, formatoVencimento)); 
                      sheet.getRange(i + 1, safeGetCol(sheet, headers, 'concluida')).setValue(false); 
                      let idxSubs = headers.indexOf('subtarefas'); if(idxSubs > -1 && data[i][idxSubs]) { try { let subs = JSON.parse(data[i][idxSubs]); subs.forEach(s => s.concluida = false); sheet.getRange(i + 1, safeGetCol(sheet, headers, 'subtarefas')).setValue(JSON.stringify(subs)); } catch(e){} } 
                  } else { sheet.getRange(i + 1, safeGetCol(sheet, headers, 'concluida')).setValue(true); } 
              } else if (acao === 'desfazer') { sheet.getRange(i + 1, safeGetCol(sheet, headers, 'concluida')).setValue(false); } 
              return { ok: true }; 
          } 
      } return { ok: false }; 
  } catch (e) { return { ok: false }; } finally { lock.releaseLock(); } 
}

function salvarProjeto(dados) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    const sheet = getSpreadsheet().getSheetByName('projetos_tarefas');
    const headers = garantirSchemaProjetosTarefas_(sheet);
    const data = sheet.getDataRange().getValues();
    const idx = {};
    headers.forEach((h, i) => idx[String(h)] = i);

    const projetos = lerProjetosTarefas_(sheet);
    const idInformado = String(dados && dados.id || '').trim();
    const existente = idInformado ? projetos.find(p => String(p.id) === idInformado) : null;
    const id = existente ? existente.id : (idInformado || 'proj-' + Utilities.getUuid());
    const nome = String(dados && dados.nome || (existente && existente.nome) || '').trim();
    if (!nome) return { ok: false, erro: 'Informe o nome do projeto.' };

    let parentId;
    if (dados && Object.prototype.hasOwnProperty.call(dados, 'parent_id')) {
      parentId = String(dados.parent_id || '').trim();
    } else {
      parentId = existente ? String(existente.parent_id || '').trim() : '';
    }
    if (parentId === 'entrada') parentId = '';

    const parentExiste = !parentId || projetos.some(p => String(p.id) === parentId);
    if (!parentExiste) parentId = '';
    if (projetoCriaCiclo_(projetos, id, parentId)) {
      return { ok: false, erro: 'Não é possível mover um projeto para dentro dele mesmo ou de um descendente.' };
    }

    const secoes = Array.isArray(dados && dados.secoes)
      ? dados.secoes.map(s => String(s || '').trim()).filter(Boolean)
      : (existente && Array.isArray(existente.secoes) ? existente.secoes : []);

    const valorOuExistente = (chave, padrao) => {
      if (dados && Object.prototype.hasOwnProperty.call(dados, chave)) {
        return String(dados[chave] || '').trim();
      }
      if (existente && existente[chave] !== undefined && existente[chave] !== null) {
        return String(existente[chave] || '').trim();
      }
      return padrao;
    };

    const icone = valorOuExistente('icone', 'folder') || 'folder';
    let cor = valorOuExistente('cor', '#8A8A8A') || '#8A8A8A';
    if (!/^#[0-9a-fA-F]{6}$/.test(cor)) cor = '#8A8A8A';

    const imagemId = valorOuExistente('imagem_id', '');
    const imagemNome = valorOuExistente('imagem_nome', '');
    const imagemMime = valorOuExistente('imagem_mime', '');
    const imagemUrl = valorOuExistente('imagem_url', '');

    let ordem;
    if (dados && dados.ordem !== undefined && dados.ordem !== null && dados.ordem !== '') {
      ordem = Number(dados.ordem);
    } else if (existente && String(existente.parent_id || '') === parentId) {
      ordem = Number(existente.ordem);
    } else {
      ordem = proximaOrdemProjeto_(projetos.filter(p => String(p.id) !== id), parentId);
    }
    if (!isFinite(ordem)) ordem = proximaOrdemProjeto_(projetos.filter(p => String(p.id) !== id), parentId);

    let rowIndex = -1;
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][idx.id] || '').trim() === id) {
        rowIndex = i;
        break;
      }
    }

    const row = rowIndex > 0 ? data[rowIndex].slice() : new Array(headers.length).fill('');
    row[idx.id] = id;
    row[idx.nome] = nome;
    row[idx.secoes] = JSON.stringify(secoes);
    row[idx.parent_id] = parentId;
    row[idx.ordem] = ordem;
    row[idx.icone] = icone;
    row[idx.cor] = cor;
    row[idx.imagem_id] = imagemId;
    row[idx.imagem_nome] = imagemNome;
    row[idx.imagem_mime] = imagemMime;
    row[idx.imagem_url] = imagemUrl;

    if (rowIndex > 0) {
      sheet.getRange(rowIndex + 1, 1, 1, headers.length).setValues([row]);
    } else {
      sheet.appendRow(row);
    }

    SpreadsheetApp.flush();
    return {
      ok: true,
      projeto: {
        id: id,
        nome: nome,
        secoes: secoes,
        parent_id: parentId,
        ordem: ordem,
        icone: icone,
        cor: cor,
        imagem_id: imagemId,
        imagem_nome: imagemNome,
        imagem_mime: imagemMime,
        imagem_url: imagemUrl
      }
    };
  } catch (e) {
    return { ok: false, erro: e.message };
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
}

function moverProjeto(id, novoParentId) {
  try {
    const sheet = getSpreadsheet().getSheetByName('projetos_tarefas');
    const projetos = lerProjetosTarefas_(sheet);
    const projeto = projetos.find(p => String(p.id) === String(id));
    if (!projeto) return { ok: false, erro: 'Projeto não encontrado.' };
    projeto.parent_id = String(novoParentId || '').trim();
    projeto.ordem = null;
    return salvarProjeto(projeto);
  } catch (e) {
    return { ok: false, erro: e.message };
  }
}


function salvarEstruturaProjetos(estrutura) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    if (!Array.isArray(estrutura)) return { ok: false, erro: 'Estrutura inválida.' };

    const sheet = getSpreadsheet().getSheetByName('projetos_tarefas');
    if (!sheet) return { ok: false, erro: 'A aba projetos_tarefas não existe.' };

    const headers = garantirSchemaProjetosTarefas_(sheet);
    const data = sheet.getDataRange().getValues();
    const idx = {};
    headers.forEach((h, i) => idx[String(h)] = i);

    const atuais = lerProjetosTarefas_(sheet);
    const mapa = {};
    atuais.forEach(projeto => {
      mapa[String(projeto.id)] = {
        id: String(projeto.id),
        parent_id: String(projeto.parent_id || '').trim(),
        ordem: Number(projeto.ordem) || 0
      };
    });

    estrutura.forEach((item, index) => {
      const id = String(item && item.id || '').trim();
      if (!id || !mapa[id]) return;
      let parentId = String(item.parent_id || '').trim();
      if (parentId === 'entrada' || !mapa[parentId]) parentId = '';
      mapa[id].parent_id = parentId;
      mapa[id].ordem = isFinite(Number(item.ordem)) ? Number(item.ordem) : index;
    });

    Object.keys(mapa).forEach(id => {
      const visitados = {};
      let atual = id;
      while (atual) {
        if (visitados[atual]) throw new Error('Não é possível criar um ciclo entre projetos.');
        visitados[atual] = true;
        atual = mapa[atual] ? String(mapa[atual].parent_id || '').trim() : '';
      }
    });

    const linhas = {};
    for (let i = 1; i < data.length; i++) {
      const id = String(data[i][idx.id] || '').trim();
      if (id) linhas[id] = i + 1;
    }

    Object.keys(mapa).forEach(id => {
      const linha = linhas[id];
      if (!linha) return;
      sheet.getRange(linha, idx.parent_id + 1).setValue(mapa[id].parent_id);
      sheet.getRange(linha, idx.ordem + 1).setValue(mapa[id].ordem);
    });

    SpreadsheetApp.flush();
    return { ok: true };
  } catch (e) {
    return { ok: false, erro: e.message };
  } finally {
    lock.releaseLock();
  }
}

function excluirProjeto(id) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    const ss = getSpreadsheet();
    const sheetP = ss.getSheetByName('projetos_tarefas');
    if (!sheetP) return { ok: false, erro: 'A aba projetos_tarefas não existe.' };

    const headers = garantirSchemaProjetosTarefas_(sheetP);
    const dataP = sheetP.getDataRange().getValues();
    const idx = {};
    headers.forEach((h, i) => idx[String(h)] = i);

    const targetId = String(id || '').trim();
    let targetRow = -1;
    let parentId = '';
    let imagemIdProjeto = '';
    for (let i = 1; i < dataP.length; i++) {
      if (String(dataP[i][idx.id] || '').trim() === targetId) {
        targetRow = i + 1;
        parentId = String(dataP[i][idx.parent_id] || '').trim();
        imagemIdProjeto = String(dataP[i][idx.imagem_id] || '').trim();
        break;
      }
    }
    if (targetRow < 0) return { ok: false, erro: 'Projeto não encontrado.' };

    /* Subprojetos diretos sobem um nível; nenhum projeto fica órfão. */
    for (let i = 1; i < dataP.length; i++) {
      if (String(dataP[i][idx.parent_id] || '').trim() === targetId) {
        sheetP.getRange(i + 1, idx.parent_id + 1).setValue(parentId);
      }
    }

    const sheetT = ss.getSheetByName('tarefas_tarefas');
    if (sheetT) {
      const dataT = sheetT.getDataRange().getValues();
      const headT = dataT[0] || [];
      const projIdx = headT.indexOf('projeto_id');
      if (projIdx > -1) {
        for (let i = 1; i < dataT.length; i++) {
          if (String(dataT[i][projIdx] || '').trim() === targetId) {
            sheetT.getRange(i + 1, projIdx + 1).setValue('entrada');
          }
        }
      }
    }

    sheetP.deleteRow(targetRow);

    if (imagemIdProjeto) {
      limparCacheImagemProjeto_(imagemIdProjeto);
      try { DriveApp.getFileById(imagemIdProjeto).setTrashed(true); } catch (erroImagem) {}
    }

    SpreadsheetApp.flush();
    return { ok: true, parent_id: parentId };
  } catch (e) {
    return { ok: false, erro: e.message };
  } finally {
    lock.releaseLock();
  }
}



// ==========================================
// MÓDULOS INTACTOS DE APOIO
// ==========================================
function calcularStreakAtual_(datasEntrada) {
  const tz = Session.getScriptTimeZone();
  const datas = new Set((datasEntrada || []).map(valor => {
    if (valor instanceof Date) return Utilities.formatDate(valor, tz, 'yyyy-MM-dd');
    return String(valor || '').split('T')[0];
  }).filter(Boolean));

  const hoje = new Date();
  const hojeStr = Utilities.formatDate(hoje, tz, 'yyyy-MM-dd');
  const ontem = new Date(hoje.getTime());
  ontem.setDate(ontem.getDate() - 1);
  const ontemStr = Utilities.formatDate(ontem, tz, 'yyyy-MM-dd');
  const base = datas.has(hojeStr) ? hojeStr : (datas.has(ontemStr) ? ontemStr : '');
  if (!base) return 0;

  let streak = 0;
  const cursor = new Date(base + 'T12:00:00');
  while (datas.has(Utilities.formatDate(cursor, tz, 'yyyy-MM-dd'))) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

function getHabitos() {
  try {
    const habitos = selectAll('habitos')
      .filter(h => h.ativo === true || h.ativo === 'true')
      .map(h => ({ ...h, hora: formatarHoraPlanilha(h.hora) }));

    const registrosPorHabito = {};
    selectAll('registros').forEach(registro => {
      const id = String(registro.habito_id || '');
      if (!id) return;
      if (!registrosPorHabito[id]) registrosPorHabito[id] = [];
      registrosPorHabito[id].push(registro.data);
    });

    habitos.forEach(habito => {
      habito.streakAtual = calcularStreakAtual_(registrosPorHabito[String(habito.id)] || []);
    });

    return { ok: true, data: habitos };
  } catch (e) {
    return { ok: false, erro: e.message };
  }
}
function criarHabito(dados) { const lock = LockService.getScriptLock(); try { lock.waitLock(5000); const sheet = getSpreadsheet().getSheetByName('habitos'); const headers = sheet.getDataRange().getValues()[0]; safeGetCol(sheet, headers, 'hora'); const novoHabito = { id: String(dados && dados.id || '').trim() || Utilities.getUuid(), nome: dados.nome, icone: dados.icone || 'star', cor_hex: dados.cor_hex || "#2979FF", meta: dados.meta || 1, unidade: dados.unidade || "", ativo: true, criado_em: dados.criado_em || new Date().toISOString(), ocultar_agenda: dados.ocultar_agenda || false, hora: dados.hora || '' }; sheet.appendRow(headers.map(h => novoHabito[h] !== undefined ? novoHabito[h] : '')); return { ok: true, data: novoHabito }; } catch (e) { return { ok: false, erro: e.message }; } finally { lock.releaseLock(); } }
function editarHabito(id, dados) { const lock = LockService.getScriptLock(); try { lock.waitLock(5000); const sheet = getSpreadsheet().getSheetByName('habitos'); const data = sheet.getDataRange().getValues(); const h = data[0]; for (let i = 1; i < data.length; i++) { if (String(data[i][0]).trim() === String(id).trim()) { if (dados.nome !== undefined) sheet.getRange(i+1, safeGetCol(sheet, h, 'nome')).setValue(dados.nome); if (dados.icone !== undefined) sheet.getRange(i+1, safeGetCol(sheet, h, 'icone')).setValue(dados.icone); if (dados.cor_hex !== undefined) sheet.getRange(i+1, safeGetCol(sheet, h, 'cor_hex')).setValue(dados.cor_hex); if (dados.meta !== undefined) sheet.getRange(i+1, safeGetCol(sheet, h, 'meta')).setValue(dados.meta); if (dados.unidade !== undefined) sheet.getRange(i+1, safeGetCol(sheet, h, 'unidade')).setValue(dados.unidade); if (dados.ocultar_agenda !== undefined) sheet.getRange(i+1, safeGetCol(sheet, h, 'ocultar_agenda')).setValue(dados.ocultar_agenda); if (dados.hora !== undefined) sheet.getRange(i+1, safeGetCol(sheet, h, 'hora')).setValue(dados.hora); return { ok: true }; } } return { ok: false, erro: "Não encontrado." }; } catch (e) { return { ok: false, erro: e.message }; } finally { lock.releaseLock(); } }
function excluirHabito(id) { const lock = LockService.getScriptLock(); try { lock.waitLock(5000); const sheet = getSpreadsheet().getSheetByName('habitos'); const data = sheet.getDataRange().getValues(); for (let i = 1; i < data.length; i++) { if (String(data[i][0]).trim() === String(id).trim()) { sheet.getRange(i+1, safeGetCol(sheet, data[0], 'ativo')).setValue(false); return { ok: true }; } } return { ok: false }; } catch (e) { return { ok: false }; } finally { lock.releaseLock(); } }
function getRegistrosDoPeriodo(dataInicio, dataFim) { try { return { ok: true, data: selectAll('registros').filter(r => r.data >= dataInicio && r.data <= dataFim) }; } catch (e) { return { ok: false }; } }
function marcarHabito(habitoId, dataStr, valorNum) { const lock = LockService.getScriptLock(); try { lock.waitLock(5000); const sheet = getSpreadsheet().getSheetByName('registros'); const data = sheet.getDataRange().getValues(); const h = data[0]; const tz = Session.getScriptTimeZone(); for (let i = 1; i < data.length; i++) { let rD = data[i][2]; if (rD instanceof Date) rD = Utilities.formatDate(rD, tz, "yyyy-MM-dd"); else if (typeof rD === 'string') rD = rD.split('T')[0]; if (data[i][1] === habitoId && rD === dataStr) { sheet.getRange(i + 1, safeGetCol(sheet, h, 'valor')).setValue(valorNum); return { ok: true }; } } sheet.appendRow([Utilities.getUuid(), habitoId, dataStr, valorNum, new Date().toISOString()]); return { ok: true }; } catch (e) { return { ok: false }; } finally { lock.releaseLock(); } }
function desmarcarHabito(habitoId, dataStr) { const lock = LockService.getScriptLock(); try { lock.waitLock(5000); const sheet = getSpreadsheet().getSheetByName('registros'); const data = sheet.getDataRange().getValues(); const tz = Session.getScriptTimeZone(); for (let i = data.length - 1; i >= 1; i--) { let rD = data[i][2]; if (rD instanceof Date) rD = Utilities.formatDate(rD, tz, "yyyy-MM-dd"); else if (typeof rD === 'string') rD = rD.split('T')[0]; if (data[i][1] === habitoId && rD === dataStr) { sheet.deleteRow(i + 1); return { ok: true }; } } return { ok: true }; } catch (e) { return { ok: false }; } finally { lock.releaseLock(); } }
function getEstatisticas(habitoId) { try { const registros = selectAll('registros').filter(r => r.habito_id === habitoId).map(r => r.data).sort((a, b) => new Date(b).getTime() - new Date(a).getTime()); let streakAtual = 0; let melhorStreak = 0; const tz = Session.getScriptTimeZone(); const hojeStr = Utilities.formatDate(new Date(), tz, "yyyy-MM-dd"); const ontem = new Date(); ontem.setDate(ontem.getDate() - 1); const ontemStr = Utilities.formatDate(ontem, tz, "yyyy-MM-dd"); const datasSet = new Set(registros); let diaBase = datasSet.has(hojeStr) ? hojeStr : (datasSet.has(ontemStr) ? ontemStr : null); if (diaBase) { let dataCheck = new Date(diaBase + "T12:00:00"); while (datasSet.has(dataCheck.toISOString().split('T')[0])) { streakAtual++; dataCheck.setDate(dataCheck.getDate() - 1); } } let tempStreak = 0; let dataAnterior = null; registros.forEach(dataStr => { if (!dataAnterior) { tempStreak = 1; dataAnterior = new Date(dataStr + "T12:00:00"); } else { let atual = new Date(dataStr + "T12:00:00"); let diffDias = (dataAnterior - atual) / (1000 * 60 * 60 * 24); if (diffDias === 1) { tempStreak++; } else if (diffDias > 1) { tempStreak = 1; } dataAnterior = atual; } if (tempStreak > melhorStreak) melhorStreak = tempStreak; }); return { ok: true, data: { streakAtual, melhorStreak, taxa: registros.length } }; } catch (e) { return { ok: false }; } }

function getNotas() { try { const sheet = getSpreadsheet().getSheetByName('notas'); if (!sheet) return { ok: true, data: [] }; const data = sheet.getDataRange().getValues(); if (data.length <= 1) return { ok: true, data: [] }; const headers = data[0]; const notas = []; for (let i = 1; i < data.length; i++) { let row = data[i]; notas.push({ id: row[headers.indexOf('id')], titulo: row[headers.indexOf('titulo')], conteudo: row[headers.indexOf('conteudo')], data: row[headers.indexOf('data')], fixado: row[headers.indexOf('fixado')] || false, tamanho: row[headers.indexOf('tamanho')] || 'normal', ativo: row[headers.indexOf('ativo')] !== false, arquivado: row[headers.indexOf('arquivado')] === true, ordem: row[headers.indexOf('ordem')] === "" ? 999 : Number(row[headers.indexOf('ordem')]), anexos: safeParseJSON(row[headers.indexOf('anexos')]) }); } return { ok: true, data: notas.sort((a, b) => a.ordem - b.ordem) }; } catch (e) { return { ok: false, erro: e.message }; } }
function salvarNota(dados) { const lock = LockService.getScriptLock(); try { lock.waitLock(5000); const ss = getSpreadsheet(); let sheet = ss.getSheetByName('notas'); const data = sheet.getDataRange().getValues(); let headers = data[0]; let isEdit = false; if (dados.id) { for (let i = 1; i < data.length; i++) { if (String(data[i][0]).trim() === String(dados.id).trim()) { sheet.getRange(i + 1, safeGetCol(sheet, headers, 'titulo')).setValue(dados.titulo); sheet.getRange(i + 1, safeGetCol(sheet, headers, 'conteudo')).setValue(dados.conteudo); sheet.getRange(i + 1, safeGetCol(sheet, headers, 'fixado')).setValue(dados.fixado); sheet.getRange(i + 1, safeGetCol(sheet, headers, 'tamanho')).setValue(dados.tamanho); sheet.getRange(i + 1, safeGetCol(sheet, headers, 'anexos')).setValue(JSON.stringify(dados.anexos || [])); isEdit = true; break; } } } if (!isEdit) { const novaLinha = headers.map(h => { if(h==='id') return dados.id || Utilities.getUuid(); if(h==='titulo') return dados.titulo; if(h==='conteudo') return dados.conteudo; if(h==='data') return new Date().toISOString(); if(h==='ativo') return true; if(h==='fixado') return dados.fixado||false; if(h==='tamanho') return dados.tamanho||'normal'; if(h==='arquivado') return false; if(h==='ordem') return 0; if(h==='anexos') return JSON.stringify(dados.anexos||[]); return '';}); sheet.appendRow(novaLinha); } return { ok: true }; } catch (e) { return { ok: false, erro: e.message }; } finally { lock.releaseLock(); } }
function atualizarOrdemNotas(idsArray) { const lock = LockService.getScriptLock(); try { lock.waitLock(5000); const sheet = getSpreadsheet().getSheetByName('notas'); const data = sheet.getDataRange().getValues(); const colOrdem = data[0].indexOf('ordem'); if (colOrdem === -1) return { ok: false }; const mapaLinhas = {}; for (let i = 1; i < data.length; i++) { mapaLinhas[data[i][0]] = i + 1; } idsArray.forEach((id, index) => { if (mapaLinhas[id]) sheet.getRange(mapaLinhas[id], colOrdem + 1).setValue(index); }); return { ok: true }; } catch(e) { return { ok: false }; } finally { lock.releaseLock(); } }
function acaoNota(id, acao) { const lock = LockService.getScriptLock(); try { lock.waitLock(5000); const sheet = getSpreadsheet().getSheetByName('notas'); const data = sheet.getDataRange().getValues(); const headers = data[0]; for (let i = 1; i < data.length; i++) { if (String(data[i][0]).trim() === String(id).trim()) { if (acao === 'deletar') { sheet.deleteRow(i + 1); } else if (acao === 'lixeira') { sheet.getRange(i + 1, safeGetCol(sheet, headers, 'ativo')).setValue(false); } else if (acao === 'restaurar') { sheet.getRange(i + 1, safeGetCol(sheet, headers, 'ativo')).setValue(true); } else if (acao === 'arquivar') { sheet.getRange(i + 1, safeGetCol(sheet, headers, 'arquivado')).setValue(true); } else if (acao === 'desarquivar') { sheet.getRange(i + 1, safeGetCol(sheet, headers, 'arquivado')).setValue(false); } return { ok: true }; } } return { ok: false }; } catch (e) { return { ok: false, erro: e.toString() }; } finally { lock.releaseLock(); } }

function garantirFinanceiroFixos_() {
  const ss = getSpreadsheet();
  const schemas = {
    financeiro_fixos: ['id', 'grupo_id', 'titulo', 'valor', 'tipo', 'categoria', 'conta_id', 'dia_mes', 'mes_inicio', 'mes_fim', 'ativo', 'observacao', 'ignorar_calculo', 'criado_em', 'atualizado_em'],
    financeiro_fixos_ocorrencias: ['chave', 'fixo_id', 'competencia', 'status', 'valor_override', 'data_override', 'ignorado', 'pagamentos', 'valor_pago', 'ignorar_calculo', 'atualizado_em']
  };

  Object.keys(schemas).forEach(nome => {
    let sheet = ss.getSheetByName(nome);
    if (!sheet) {
      sheet = ss.insertSheet(nome);
      sheet.appendRow(schemas[nome]);
      sheet.getRange(1, 1, 1, schemas[nome].length).setFontWeight('bold').setBackground('#e0e0e0');
      sheet.setFrozenRows(1);
      return;
    }

    const values = sheet.getDataRange().getValues();
    const headers = values[0] || [];
    schemas[nome].forEach(col => safeGetCol(sheet, headers, col));
  });
}

function getFinanceiroFixos_() {
  garantirFinanceiroFixos_();
  return selectAll('financeiro_fixos').map(item => ({
    id: String(item.id || ''),
    grupo_id: String(item.grupo_id || item.id || ''),
    titulo: String(item.titulo || ''),
    valor: parseFloat(item.valor) || 0,
    tipo: String(item.tipo || 'despesa'),
    categoria: String(item.categoria || ''),
    conta_id: String(item.conta_id || ''),
    dia_mes: Math.min(31, Math.max(1, parseInt(item.dia_mes, 10) || 1)),
    mes_inicio: String(item.mes_inicio || '').slice(0, 7),
    mes_fim: String(item.mes_fim || '').slice(0, 7),
    ativo: String(item.ativo) !== 'false',
    observacao: String(item.observacao || ''),
    ignorar_calculo: String(item.ignorar_calculo) === 'true' || item.ignorar_calculo === true,
    criado_em: String(item.criado_em || ''),
    atualizado_em: String(item.atualizado_em || '')
  })).filter(item => item.id && item.mes_inicio);
}

function getFinanceiroFixoOcorrencias_() {
  garantirFinanceiroFixos_();
  return selectAll('financeiro_fixos_ocorrencias').map(item => ({
    chave: String(item.chave || ''),
    fixo_id: String(item.fixo_id || ''),
    competencia: String(item.competencia || '').slice(0, 7),
    status: String(item.status || 'pendente'),
    valor_override: item.valor_override === '' || item.valor_override == null ? '' : (parseFloat(item.valor_override) || 0),
    data_override: String(item.data_override || '').split('T')[0],
    ignorado: String(item.ignorado) === 'true' || item.ignorado === true,
    pagamentos: safeParseJSON(item.pagamentos),
    valor_pago: parseFloat(item.valor_pago) || 0,
    ignorar_calculo: String(item.ignorar_calculo) === 'true' || item.ignorar_calculo === true,
    atualizado_em: String(item.atualizado_em || '')
  })).filter(item => item.fixo_id && item.competencia);
}

function getDadosFinanceiro() {
  try {
    const ss = getSpreadsheet();
    const tz = Session.getScriptTimeZone();

    let sheetF = ss.getSheetByName('financeiro_transacoes');
    let dataF = sheetF.getDataRange().getValues();
    let headF = dataF[0];
    ['ignorar_calculo'].forEach(col => safeGetCol(sheetF, headF, col));

    dataF = sheetF.getDataRange().getValues();
    headF = dataF[0];
    const idx = {};
    headF.forEach((h, i) => idx[h] = i);

    const transacoes = dataF.slice(1).map(row => {
      if (!row[idx.id]) return null;
      const dt = row[idx.data];

      return {
        id: String(row[idx.id]),
        titulo: String(row[idx.titulo] || ''),
        valor: parseFloat(row[idx.valor]) || 0,
        valor_pago: parseFloat(row[idx.valor_pago]) || 0,
        tipo: String(row[idx.tipo] || ''),
        categoria: String(row[idx.categoria] || ''),
        conta_id: String(row[idx.conta_id] || ''),
        data: dt instanceof Date ? Utilities.formatDate(dt, tz, 'yyyy-MM-dd') : String(dt || '').split('T')[0],
        status: String(row[idx.status] || 'pendente'),
        observacao: String(row[idx.observacao] || ''),
        lote_id: String(row[idx.lote_id] || ''),
        pagamentos: safeParseJSON(row[idx.pagamentos]),
        ignorar_calculo: String(row[idx.ignorar_calculo]) === 'true'
      };
    }).filter(Boolean);

    return JSON.stringify({
      ok: true,
      transacoes,
      categorias: selectAll('financeiro_categorias'),
      contas: selectAll('financeiro_contas'),
      cartoes: selectAll('financeiro_cartoes'),
      fixos: getFinanceiroFixos_(),
      fixo_ocorrencias: getFinanceiroFixoOcorrencias_()
    });
  } catch (e) {
    return JSON.stringify({ ok: false, erro: e.message });
  }
}

function salvarFixoFinanceiro(dados) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    garantirFinanceiroFixos_();

    const sheet = getSpreadsheet().getSheetByName('financeiro_fixos');
    const data = sheet.getDataRange().getValues();
    const headers = data[0];

    const id = String(dados.id || ('fix-' + Utilities.getUuid()));
    const existingIndex = data.findIndex((row, index) => index > 0 && String(row[headers.indexOf('id')]) === id);
    const existingCreated = existingIndex > 0 ? data[existingIndex][headers.indexOf('criado_em')] : '';

    const payload = {
      id,
      grupo_id: String(dados.grupo_id || id),
      titulo: String(dados.titulo || ''),
      valor: parseFloat(dados.valor) || 0,
      tipo: String(dados.tipo || 'despesa'),
      categoria: String(dados.categoria || ''),
      conta_id: String(dados.conta_id || ''),
      dia_mes: Math.min(31, Math.max(1, parseInt(dados.dia_mes, 10) || 1)),
      mes_inicio: String(dados.mes_inicio || '').slice(0, 7),
      mes_fim: String(dados.mes_fim || '').slice(0, 7),
      ativo: dados.ativo !== false,
      observacao: String(dados.observacao || ''),
      ignorar_calculo: dados.ignorar_calculo === true,
      criado_em: existingCreated || new Date().toISOString(),
      atualizado_em: new Date().toISOString()
    };

    if (!payload.titulo || !payload.mes_inicio) {
      return { ok: false, erro: 'Título e mês inicial são obrigatórios.' };
    }

    const row = headers.map(h => Object.prototype.hasOwnProperty.call(payload, h) ? payload[h] : '');

    if (existingIndex > 0) {
      sheet.getRange(existingIndex + 1, 1, 1, headers.length).setValues([row]);
    } else {
      sheet.getRange(sheet.getLastRow() + 1, 1, 1, headers.length).setValues([row]);
    }

    SpreadsheetApp.flush();
    return { ok: true, id, fixo: payload };
  } catch (e) {
    return { ok: false, erro: e.message };
  } finally {
    lock.releaseLock();
  }
}

function salvarOcorrenciaFixoFinanceiro(dados) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    garantirFinanceiroFixos_();

    const sheet = getSpreadsheet().getSheetByName('financeiro_fixos_ocorrencias');
    const data = sheet.getDataRange().getValues();
    const headers = data[0];

    const fixoId = String(dados.fixo_id || '');
    const competencia = String(dados.competencia || '').slice(0, 7);
    if (!fixoId || !competencia) return { ok: false, erro: 'Fixo e competência são obrigatórios.' };

    const chave = String(dados.chave || (fixoId + '|' + competencia));
    const existingIndex = data.findIndex((row, index) => index > 0 && String(row[headers.indexOf('chave')]) === chave);

    const payload = {
      chave,
      fixo_id: fixoId,
      competencia,
      status: String(dados.status || 'pendente'),
      valor_override: dados.valor_override === '' || dados.valor_override == null ? '' : (parseFloat(dados.valor_override) || 0),
      data_override: String(dados.data_override || '').split('T')[0],
      ignorado: dados.ignorado === true,
      pagamentos: JSON.stringify(Array.isArray(dados.pagamentos) ? dados.pagamentos : []),
      valor_pago: parseFloat(dados.valor_pago) || 0,
      ignorar_calculo: dados.ignorar_calculo === true,
      atualizado_em: new Date().toISOString()
    };

    const row = headers.map(h => Object.prototype.hasOwnProperty.call(payload, h) ? payload[h] : '');

    if (existingIndex > 0) {
      sheet.getRange(existingIndex + 1, 1, 1, headers.length).setValues([row]);
    } else {
      sheet.getRange(sheet.getLastRow() + 1, 1, 1, headers.length).setValues([row]);
    }

    SpreadsheetApp.flush();
    return { ok: true, chave };
  } catch (e) {
    return { ok: false, erro: e.message };
  } finally {
    lock.releaseLock();
  }
}

function excluirFixoFinanceiro(id) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    garantirFinanceiroFixos_();

    const ss = getSpreadsheet();
    const fixosSheet = ss.getSheetByName('financeiro_fixos');
    const fixosData = fixosSheet.getDataRange().getValues();
    const fixoHeaders = fixosData[0];
    const idCol = fixoHeaders.indexOf('id');

    for (let i = fixosData.length - 1; i >= 1; i--) {
      if (String(fixosData[i][idCol]) === String(id)) {
        fixosSheet.deleteRow(i + 1);
      }
    }

    const occSheet = ss.getSheetByName('financeiro_fixos_ocorrencias');
    const occData = occSheet.getDataRange().getValues();
    const occHeaders = occData[0];
    const fixoCol = occHeaders.indexOf('fixo_id');

    for (let i = occData.length - 1; i >= 1; i--) {
      if (String(occData[i][fixoCol]) === String(id)) {
        occSheet.deleteRow(i + 1);
      }
    }

    SpreadsheetApp.flush();
    return { ok: true };
  } catch (e) {
    return { ok: false, erro: e.message };
  } finally {
    lock.releaseLock();
  }
}

function salvarTransacao(dados) { const lock = LockService.getScriptLock(); try { lock.waitLock(15000); const sheet = getSpreadsheet().getSheetByName('financeiro_transacoes'); let head = sheet.getDataRange().getValues()[0]; const req = ['id', 'titulo', 'valor', 'tipo', 'categoria', 'data', 'status', 'criado_em', 'observacao', 'valor_pago', 'conta_id', 'lote_id', 'pagamentos', 'ignorar_calculo']; req.forEach(col => safeGetCol(sheet, head, col)); const data = sheet.getDataRange().getValues(); const headers = data[0]; const lista = Array.isArray(dados) ? dados : [dados]; const rowsToAppend = []; lista.forEach(item => { const rowIndex = item.id ? data.findIndex(row => String(row[0]) === String(item.id)) : -1; const rowData = headers.map(h => { if (h === 'id') return item.id || 'fin-' + Utilities.getUuid(); if (h === 'lote_id') return item.lote_id || ''; if (h === 'titulo') return item.titulo || ''; if (h === 'valor') return parseFloat(item.valor) || 0; if (h === 'valor_pago') return parseFloat(item.valor_pago) || 0; if (h === 'tipo') return item.tipo || 'despesa'; if (h === 'categoria') return item.categoria || ''; if (h === 'conta_id') return item.conta_id || ''; if (h === 'data') return item.data || ''; if (h === 'status') return item.status || 'pendente'; if (h === 'observacao') return item.observacao || ''; if (h === 'pagamentos') return JSON.stringify(item.pagamentos || []); if (h === 'ignorar_calculo') return item.ignorar_calculo === true; if (h === 'criado_em') return rowIndex > 0 ? data[rowIndex][headers.indexOf('criado_em')] : new Date().toISOString(); return ''; }); if (rowIndex > 0) sheet.getRange(rowIndex + 1, 1, 1, headers.length).setValues([rowData]); else rowsToAppend.push(rowData); }); if(rowsToAppend.length > 0) sheet.getRange(sheet.getLastRow() + 1, 1, rowsToAppend.length, headers.length).setValues(rowsToAppend); SpreadsheetApp.flush(); return { ok: true }; } catch (e) { return { ok: false, erro: e.message }; } finally { lock.releaseLock(); } }
function excluirTransacao(id) { const lock = LockService.getScriptLock(); try { lock.waitLock(10000); const sheet = getSpreadsheet().getSheetByName('financeiro_transacoes'); const data = sheet.getDataRange().getValues(); for (let i = 1; i < data.length; i++) { if (String(data[i][0]).trim() === String(id).trim()) { sheet.deleteRow(i + 1); SpreadsheetApp.flush(); return { ok: true }; } } return { ok: false }; } catch (e) { return { ok: false, erro: e.message }; } finally { lock.releaseLock(); } }
function excluirLoteFinanceiro(lote_id) { const lock = LockService.getScriptLock(); try { lock.waitLock(10000); const sheet = getSpreadsheet().getSheetByName('financeiro_transacoes'); const data = sheet.getDataRange().getValues(); const colLote = data[0].indexOf('lote_id'); if (colLote === -1) return { ok: false }; let apagou = false; for (let i = data.length - 1; i >= 1; i--) { if (String(data[i][colLote]).trim() === String(lote_id).trim()) { sheet.deleteRow(i + 1); apagou = true; } } if (apagou) SpreadsheetApp.flush(); return { ok: apagou }; } catch (e) { return { ok: false }; } finally { lock.releaseLock(); } }
function salvarContaFinanceiro(dados) { const lock = LockService.getScriptLock(); try { lock.waitLock(5000); const sheet = getSpreadsheet().getSheetByName('financeiro_contas'); const data = sheet.getDataRange().getValues(); let rowIndex = dados.id ? data.findIndex(row => String(row[0]) === String(dados.id)) : -1; const rowData = [dados.id || 'cta-' + Utilities.getUuid(), dados.nome, parseFloat(dados.saldo_inicial) || 0, dados.cor || '#448AFF']; if(rowIndex > 0) sheet.getRange(rowIndex + 1, 1, 1, 4).setValues([rowData]); else sheet.appendRow(rowData); SpreadsheetApp.flush(); return { ok: true }; } catch (e) { return { ok: false }; } finally { lock.releaseLock(); } }
function excluirContaFinanceiro(id) { const lock = LockService.getScriptLock(); try { lock.waitLock(5000); const sheet = getSpreadsheet().getSheetByName('financeiro_contas'); const data = sheet.getDataRange().getValues(); for (let i = 1; i < data.length; i++) { if (String(data[i][0]).trim() === String(id).trim()) { sheet.deleteRow(i + 1); return { ok: true }; } } return { ok: false }; } catch (e) { return { ok: false }; } finally { lock.releaseLock(); } }
function salvarCartaoFinanceiro(dados) { const lock = LockService.getScriptLock(); try { lock.waitLock(5000); const sheet = getSpreadsheet().getSheetByName('financeiro_cartoes'); const data = sheet.getDataRange().getValues(); let rowIndex = dados.id ? data.findIndex(row => String(row[0]) === String(dados.id)) : -1; const rowData = [dados.id || 'crd-' + Utilities.getUuid(), dados.nome, parseFloat(dados.limite)||0, dados.fechamento, dados.vencimento, dados.conta_id, dados.cor]; if(rowIndex > 0) sheet.getRange(rowIndex + 1, 1, 1, 7).setValues([rowData]); else sheet.appendRow(rowData); return { ok: true }; } catch (e) { return { ok: false }; } finally { lock.releaseLock(); } }
function excluirCartaoFinanceiro(id) { const lock = LockService.getScriptLock(); try { lock.waitLock(5000); const sheet = getSpreadsheet().getSheetByName('financeiro_cartoes'); const data = sheet.getDataRange().getValues(); for (let i = 1; i < data.length; i++) { if (String(data[i][0]).trim() === String(id).trim()) { sheet.deleteRow(i + 1); return { ok: true }; } } return { ok: false }; } catch (e) { return { ok: false }; } finally { lock.releaseLock(); } }
function salvarCategoriaFinanceiro(dados) { const lock = LockService.getScriptLock(); try { lock.waitLock(5000); const sheet = getSpreadsheet().getSheetByName('financeiro_categorias'); const data = sheet.getDataRange().getValues(); let rowIndex = dados.id ? data.findIndex(row => String(row[0]) === String(dados.id)) : -1; const id = dados.id || 'cat-' + Utilities.getUuid(); if (rowIndex > 0) { sheet.getRange(rowIndex + 1, 1, 1, 2).setValues([[id, dados.nome]]); } else { sheet.appendRow([id, dados.nome]); } return { ok: true, id: id, nome: dados.nome }; } catch (e) { return { ok: false }; } finally { lock.releaseLock(); } }
function excluirCategoriaFinanceiro(id) { const lock = LockService.getScriptLock(); try { lock.waitLock(5000); const sheet = getSpreadsheet().getSheetByName('financeiro_categorias'); const data = sheet.getDataRange().getValues(); for (let i = 1; i < data.length; i++) { if (String(data[i][0]).trim() === String(id).trim()) { sheet.deleteRow(i + 1); return { ok: true }; } } return { ok: false }; } catch (e) { return { ok: false }; } finally { lock.releaseLock(); } }

function getDadosMetas() { try { const sheet = getSpreadsheet().getSheetByName('Metas'); if (!sheet) return JSON.stringify({ ok: true, metas: [], categorias: [] }); const data = sheet.getDataRange().getValues(); const metas = []; if (data.length > 1) { const headers = data[0]; for (let i = 1; i < data.length; i++) { let meta = {}; headers.forEach((h, j) => { let val = data[i][j]; if (h === 'milestones' || h === 'anexos') { try { val = val ? JSON.parse(val) : []; } catch(e) { val = []; } } meta[h] = val; }); metas.push(meta); } } let sheetC = getSpreadsheet().getSheetByName('metas_categorias'); let categorias = []; if (sheetC) { const dataC = sheetC.getDataRange().getValues(); for (let i = 1; i < dataC.length; i++) { if(dataC[i][0]) categorias.push({ id: String(dataC[i][0]), nome: String(dataC[i][1]) }); } } return JSON.stringify({ ok: true, metas: metas, categorias: categorias }); } catch (e) { return JSON.stringify({ ok: false, erro: e.message }); } }
function salvarMeta(dados) { const lock = LockService.getScriptLock(); try { lock.waitLock(5000); const ss = getSpreadsheet(); let sheet = ss.getSheetByName('Metas'); const data = sheet.getDataRange().getValues(); const headers = data[0]; let rowIndex = -1; for (let i = 1; i < data.length; i++) { if (String(data[i][0]) === String(dados.id)) { rowIndex = i + 1; break; } } const rowData = headers.map(h => { let val = dados[h]; if (h === 'milestones' || h === 'anexos') val = JSON.stringify(val || []); return val !== undefined ? val : ""; }); if (rowIndex > -1) sheet.getRange(rowIndex, 1, 1, headers.length).setValues([rowData]); else sheet.appendRow(rowData); return { ok: true }; } catch (e) { return { ok: false, erro: e.message }; } finally { lock.releaseLock(); } }
function excluirMeta(id) { const lock = LockService.getScriptLock(); try { lock.waitLock(5000); const sheet = getSpreadsheet().getSheetByName('Metas'); const data = sheet.getDataRange().getValues(); for (let i = 1; i < data.length; i++) { if (String(data[i][0]).trim() === String(id).trim()) { sheet.deleteRow(i + 1); return { ok: true }; } } return { ok: false }; } catch (e) { return { ok: false, erro: e.message }; } finally { lock.releaseLock(); } }
function getDadosSaude() { try { const ss = getSpreadsheet(); const rastreadores = selectAll('saude_rastreadores').map(r => { let j = safeParseJSON(r.json_dados); return { id: r.id, categoria: r.categoria, nome: r.nome, ...j }; }); const biblioteca = selectAll('saude_biblioteca').map(b => { let j = safeParseJSON(b.json_dados); return { id: b.id, modulo: b.modulo, nome: b.nome, ...j }; }); let diarioDB = {}; selectAll('saude_diario').forEach(d => { diarioDB[d.data] = safeParseJSON(d.json_dados); }); let metas = { kcal: 2000, agua: 2500, p: 160, c: 250, g: 60, fibra: 30, sodio: 2000, acucar: 40, deitar: '22:30', horasIdeais: 8, blocosIdeais: 5, rem: 90, profundo: 90 }; const sheetMetas = ss.getSheetByName('saude_metas'); if (sheetMetas) { const dataMetas = sheetMetas.getDataRange().getValues(); for (let i = 1; i < dataMetas.length; i++) { if (dataMetas[i][0] === 'config_metas') { try { let parsed = JSON.parse(dataMetas[i][1]); if (parsed && Object.keys(parsed).length > 0) metas = parsed; } catch(e){} break; } } } return JSON.stringify({ ok: true, rastreadores, biblioteca, diarioDB, metas }); } catch (e) { return JSON.stringify({ ok: false, erro: e.message }); } }
function salvarMetasSaude(novasMetas) { const lock = LockService.getScriptLock(); try { lock.waitLock(5000); const ss = getSpreadsheet(); let sheet = ss.getSheetByName('saude_metas'); const data = sheet.getDataRange().getValues(); let rowIndex = -1; for (let i = 1; i < data.length; i++) { if (data[i][0] === 'config_metas') { rowIndex = i + 1; break; } } const jsonStr = JSON.stringify(novasMetas); if (rowIndex > -1) sheet.getRange(rowIndex, 2).setValue(jsonStr); else sheet.appendRow(['config_metas', jsonStr]); return { ok: true }; } catch (e) { return { ok: false, erro: e.toString() }; } finally { lock.releaseLock(); } }
function salvarRastreadorSaude(dados) { const lock = LockService.getScriptLock(); try { lock.waitLock(5000); const sheet = getSpreadsheet().getSheetByName('saude_rastreadores'); const data = sheet.getDataRange().getValues(); const headers = data[0]; let rowIndex = data.findIndex(row => String(row[0]) === String(dados.id)); let jDados = { ...dados }; delete jDados.id; delete jDados.categoria; delete jDados.nome; const rowData = headers.map(h => { if(h === 'id') return dados.id; else if(h === 'categoria') return dados.categoria; else if(h === 'nome') return dados.nome; else if(h === 'json_dados') return JSON.stringify(jDados); else return ''; }); if(rowIndex > 0) sheet.getRange(rowIndex + 1, 1, 1, headers.length).setValues([rowData]); else sheet.appendRow(rowData); return { ok: true }; } catch (e) { return { ok: false, erro: e.message }; } finally { lock.releaseLock(); } }
function excluirRastreadorSaude(id) { const lock = LockService.getScriptLock(); try { lock.waitLock(5000); const sheet = getSpreadsheet().getSheetByName('saude_rastreadores'); const data = sheet.getDataRange().getValues(); for(let i=1; i<data.length; i++) { if(String(data[i][0]) === String(id)) { sheet.deleteRow(i+1); return {ok: true}; } } return { ok: false }; } catch (e) { return { ok: false, erro: e.message }; } finally { lock.releaseLock(); } }
function salvarBibliotecaSaude(dados) { const lock = LockService.getScriptLock(); try { lock.waitLock(5000); const sheet = getSpreadsheet().getSheetByName('saude_biblioteca'); const data = sheet.getDataRange().getValues(); const headers = data[0]; let rowIndex = data.findIndex(row => String(row[0]) === String(dados.id)); let jDados = { ...dados }; delete jDados.id; delete jDados.modulo; delete jDados.nome; const rowData = headers.map(h => { if(h === 'id') return dados.id; else if(h === 'modulo') return dados.modulo; else if(h === 'nome') return dados.nome; else if(h === 'json_dados') return JSON.stringify(jDados); else return ''; }); if(rowIndex > 0) sheet.getRange(rowIndex + 1, 1, 1, headers.length).setValues([rowData]); else sheet.appendRow(rowData); return { ok: true }; } catch (e) { return { ok: false, erro: e.message }; } finally { lock.releaseLock(); } }
function excluirBibliotecaSaude(id) { const lock = LockService.getScriptLock(); try { lock.waitLock(5000); const sheet = getSpreadsheet().getSheetByName('saude_biblioteca'); const data = sheet.getDataRange().getValues(); for(let i=1; i<data.length; i++) { if(String(data[i][0]) === String(id)) { sheet.deleteRow(i+1); return {ok: true}; } } return { ok: false }; } catch (e) { return { ok: false, erro: e.message }; } finally { lock.releaseLock(); } }
function salvarDiarioSaude(dataStr, objDiario) { const lock = LockService.getScriptLock(); try { lock.waitLock(5000); const sheet = getSpreadsheet().getSheetByName('saude_diario'); const data = sheet.getDataRange().getValues(); const tz = Session.getScriptTimeZone(); for(let i=1; i<data.length; i++) { let dt = data[i][0]; if(dt instanceof Date) dt = Utilities.formatDate(dt, tz, "yyyy-MM-dd"); if(dt === dataStr) { sheet.getRange(i+1, 2).setValue(JSON.stringify(objDiario)); sheet.getRange(i+1, 3).setValue(new Date().toISOString()); return { ok: true }; } } sheet.appendRow([dataStr, JSON.stringify(objDiario), new Date().toISOString()]); return { ok: true }; } catch (e) { return { ok: false, erro: e.message }; } finally { lock.releaseLock(); } }

function getDriveContent(folderId, viewType) {
  try {
    let files = []; let folders = []; let path = [];
    if (viewType === 'meudrive' || (folderId && folderId !== 'root')) {
      let folder = (!folderId || folderId === 'root') ? DriveApp.getRootFolder() : DriveApp.getFolderById(folderId); let current = folder; let rootId = DriveApp.getRootFolder().getId();
      while (current.getId() !== rootId) { path.unshift({ id: current.getId(), name: current.getName() }); let parents = current.getParents(); if (parents.hasNext()) { current = parents.next(); } else { break; } }
      path.unshift({ id: rootId, name: 'Meu Drive' }); let fldrs = folder.getFolders(); while (fldrs.hasNext()) { let f = fldrs.next(); folders.push({ id: f.getId(), name: f.getName(), tipo: 'folder' }); } let fls = folder.getFiles(); while (fls.hasNext()) { let f = fls.next(); files.push({ id: f.getId(), name: f.getName(), tipo: f.getMimeType(), tamanho: f.getSize(), modificado: f.getLastUpdated().toISOString(), url: f.getUrl() }); }
    } else if (viewType === 'computadores') {
      path.push({ id: 'computers', name: 'Computadores' }); const ID_DO_COMPUTADOR = '1VhXboG5bRDmzT4Zh7-5s3rVUkm0idgtH'; 
      try { let folder = DriveApp.getFolderById(ID_DO_COMPUTADOR); let fldrs = folder.getFolders(); while (fldrs.hasNext()) { let f = fldrs.next(); folders.push({ id: f.getId(), name: f.getName(), tipo: 'folder' }); } let fls = folder.getFiles(); while (fls.hasNext()) { let f = fls.next(); files.push({ id: f.getId(), name: f.getName(), tipo: f.getMimeType(), tamanho: f.getSize(), modificado: f.getLastUpdated().toISOString(), url: f.getUrl() }); } } catch(e) {}
    } else {
      let query = ''; if (viewType === 'compartilhados') { path.push({ id: 'shared', name: 'Compartilhados' }); query = 'sharedWithMe = true and trashed = false'; } else if (viewType === 'estrelas') { path.push({ id: 'starred', name: 'Com Estrela' }); query = 'starred = true and trashed = false'; } else if (viewType === 'lixeira') { path.push({ id: 'trashed', name: 'Lixeira' }); query = 'trashed = true'; }
      if (query) { let fldrs = DriveApp.searchFolders(query); while (fldrs.hasNext()) { let f = fldrs.next(); folders.push({ id: f.getId(), name: f.getName(), tipo: 'folder' }); } let fls = DriveApp.searchFiles(query); while (fls.hasNext()) { let f = fls.next(); files.push({ id: f.getId(), name: f.getName(), tipo: f.getMimeType(), tamanho: f.getSize(), modificado: f.getLastUpdated().toISOString(), url: f.getUrl() }); } }
    }
    folders.sort((a, b) => a.name.localeCompare(b.name)); files.sort((a, b) => new Date(b.modificado) - new Date(a.modificado));
    return JSON.stringify({ ok: true, files: files, folders: folders, path: path, storage: { used: DriveApp.getStorageUsed(), limit: DriveApp.getStorageLimit() } });
  } catch (e) { return JSON.stringify({ ok: false, erro: e.message }); }
}
function uploadToDriveHub(base64Data, fileName, mimeType, folderId) { try { const pasta = (!folderId || folderId === 'root') ? DriveApp.getRootFolder() : DriveApp.getFolderById(folderId); const contentType = base64Data.substring(5, base64Data.indexOf(';')); const bytes = Utilities.base64Decode(base64Data.split(',')[1]); const blob = Utilities.newBlob(bytes, contentType, fileName); const file = pasta.createFile(blob); return { ok: true, item: { id: file.getId(), name: file.getName(), tipo: file.getMimeType(), tamanho: file.getSize(), modificado: file.getLastUpdated().toISOString(), url: file.getUrl() } }; } catch (e) { return { ok: false, erro: e.toString() }; } }
function trashDriveItem(id, isFolder) { try { if (isFolder) { DriveApp.getFolderById(id).setTrashed(true); } else { DriveApp.getFileById(id).setTrashed(true); } return { ok: true }; } catch (e) { return { ok: false, erro: e.toString() }; } }
function criarPastaDriveHub(nomePasta, parentFolderId) { try { const parent = (!parentFolderId || parentFolderId === 'root') ? DriveApp.getRootFolder() : DriveApp.getFolderById(parentFolderId); const folder = parent.createFolder(nomePasta); return { ok: true, item: { id: folder.getId(), name: folder.getName(), tipo: 'folder' } }; } catch (e) { return { ok: false, erro: e.toString() }; } }
function criarArquivoTextoDriveHub(nomeArquivo, parentFolderId) { try { const parent = (!parentFolderId || parentFolderId === 'root') ? DriveApp.getRootFolder() : DriveApp.getFolderById(parentFolderId); const finalName = String(nomeArquivo || '').toLowerCase().endsWith('.txt') ? String(nomeArquivo) : String(nomeArquivo) + '.txt'; const file = parent.createFile(finalName, '', MimeType.PLAIN_TEXT); return { ok: true, item: { id: file.getId(), name: file.getName(), tipo: file.getMimeType(), tamanho: file.getSize(), modificado: file.getLastUpdated().toISOString(), url: file.getUrl() } }; } catch (e) { return { ok: false, erro: e.toString() }; } }

// ==========================================
// IMAGENS DOS PROJETOS
// Pasta escolhida pelo usuário:
// https://drive.google.com/open?id=1rlfxlz568HNNf1iYUtlGMtrRNygvaqSr
// ==========================================
const MAI_PROJECT_IMAGES_FOLDER_ID_ = '1rlfxlz568HNNf1iYUtlGMtrRNygvaqSr';



// =============================================================
// CAMADA RPC LOCAL-FIRST
// Todas as telas usam uma única rota, com cache curto no servidor.
// O navegador mantém uma cópia persistente em IndexedDB e revalida
// silenciosamente em segundo plano.
// =============================================================
function maiIsReadMethod_(method) {
  return [
    'getScriptUrl',
    'getConfigsAgenda',
    'getListaCalendarios',
    'getDadosAgendaCompleta',
    'getAgendaPlannerInterno',
    'getGoogleCalendarPeriodo',
    'getResumoHoje',
    'getDadosTarefas',
    'getImagemProjeto',
    'getHabitos',
    'getRegistrosDoPeriodo',
    'getEstatisticas',
    'getNotas',
    'getDadosFinanceiro',
    'getDadosMetas',
    'getDadosSaude',
    'getDriveContent'
  ].indexOf(String(method || '')) > -1;
}

function maiCacheVersion_() {
  const props = PropertiesService.getUserProperties();
  const atual = Number(props.getProperty('mai_cache_version') || 1);
  return isFinite(atual) && atual > 0 ? atual : 1;
}

function maiBumpCacheVersion_() {
  const props = PropertiesService.getUserProperties();
  const proxima = maiCacheVersion_() + 1;
  props.setProperty('mai_cache_version', String(proxima));
  return proxima;
}

function maiCacheKey_(method, args, version) {
  const raw = String(method || '') + '|' + JSON.stringify(args || []);
  const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, raw, Utilities.Charset.UTF_8);
  const hash = Utilities.base64EncodeWebSafe(digest).replace(/=+$/g, '').substring(0, 38);
  return 'mai_rpc_' + String(version) + '_' + hash;
}

function maiCacheTtl_(method) {
  const ttl = {
    getResumoHoje: 30,
    getDadosAgendaCompleta: 35,
    getAgendaPlannerInterno: 60,
    getGoogleCalendarPeriodo: 120,
    getDadosTarefas: 45,
    getHabitos: 90,
    getRegistrosDoPeriodo: 60,
    getEstatisticas: 90,
    getNotas: 90,
    getDadosFinanceiro: 60,
    getDadosMetas: 90,
    getDadosSaude: 60,
    getDriveContent: 20,
    getListaCalendarios: 300,
    getConfigsAgenda: 300,
    getScriptUrl: 300
  };
  return ttl[String(method || '')] || 45;
}

function maiDispatch_(method, args) {
  switch (String(method || '')) {
    case 'getScriptUrl': return getScriptUrl.apply(null, args);
    case 'vincularPlanilhaOriginal': return vincularPlanilhaOriginal.apply(null, args);
    case 'getConfigsAgenda': return getConfigsAgenda.apply(null, args);
    case 'salvarConfigsAgenda': return salvarConfigsAgenda.apply(null, args);
    case 'getListaCalendarios': return getListaCalendarios.apply(null, args);
    case 'getDadosAgendaCompleta': return getDadosAgendaCompleta.apply(null, args);
    case 'getAgendaPlannerInterno': return getAgendaPlannerInterno.apply(null, args);
    case 'getGoogleCalendarPeriodo': return getGoogleCalendarPeriodo.apply(null, args);
    case 'getResumoHoje': return getResumoHoje.apply(null, args);
    case 'salvarEventoAgenda': return salvarEventoAgenda.apply(null, args);
    case 'excluirEventoAgenda': return excluirEventoAgenda.apply(null, args);
    case 'acaoEventoAgenda': return acaoEventoAgenda.apply(null, args);
    case 'atualizarDataHoraArrastar': return atualizarDataHoraArrastar.apply(null, args);
    case 'getImagemProjeto': return getImagemProjeto.apply(null, args);
    case 'getDadosTarefas': return getDadosTarefas.apply(null, args);
    case 'salvarTarefa': return salvarTarefa.apply(null, args);
    case 'atualizarOrdemTarefasProjeto': return atualizarOrdemTarefasProjeto.apply(null, args);
    case 'acaoTarefa': return acaoTarefa.apply(null, args);
    case 'salvarProjeto': return salvarProjeto.apply(null, args);
    case 'moverProjeto': return moverProjeto.apply(null, args);
    case 'salvarEstruturaProjetos': return salvarEstruturaProjetos.apply(null, args);
    case 'excluirProjeto': return excluirProjeto.apply(null, args);
    case 'getHabitos': return getHabitos.apply(null, args);
    case 'criarHabito': return criarHabito.apply(null, args);
    case 'editarHabito': return editarHabito.apply(null, args);
    case 'excluirHabito': return excluirHabito.apply(null, args);
    case 'getRegistrosDoPeriodo': return getRegistrosDoPeriodo.apply(null, args);
    case 'marcarHabito': return marcarHabito.apply(null, args);
    case 'desmarcarHabito': return desmarcarHabito.apply(null, args);
    case 'getEstatisticas': return getEstatisticas.apply(null, args);
    case 'getNotas': return getNotas.apply(null, args);
    case 'salvarNota': return salvarNota.apply(null, args);
    case 'atualizarOrdemNotas': return atualizarOrdemNotas.apply(null, args);
    case 'acaoNota': return acaoNota.apply(null, args);
    case 'getDadosFinanceiro': return getDadosFinanceiro.apply(null, args);
    case 'salvarFixoFinanceiro': return salvarFixoFinanceiro.apply(null, args);
    case 'salvarOcorrenciaFixoFinanceiro': return salvarOcorrenciaFixoFinanceiro.apply(null, args);
    case 'excluirFixoFinanceiro': return excluirFixoFinanceiro.apply(null, args);
    case 'salvarTransacao': return salvarTransacao.apply(null, args);
    case 'excluirTransacao': return excluirTransacao.apply(null, args);
    case 'excluirLoteFinanceiro': return excluirLoteFinanceiro.apply(null, args);
    case 'salvarContaFinanceiro': return salvarContaFinanceiro.apply(null, args);
    case 'excluirContaFinanceiro': return excluirContaFinanceiro.apply(null, args);
    case 'salvarCartaoFinanceiro': return salvarCartaoFinanceiro.apply(null, args);
    case 'excluirCartaoFinanceiro': return excluirCartaoFinanceiro.apply(null, args);
    case 'salvarCategoriaFinanceiro': return salvarCategoriaFinanceiro.apply(null, args);
    case 'excluirCategoriaFinanceiro': return excluirCategoriaFinanceiro.apply(null, args);
    case 'getDadosMetas': return getDadosMetas.apply(null, args);
    case 'salvarMeta': return salvarMeta.apply(null, args);
    case 'excluirMeta': return excluirMeta.apply(null, args);
    case 'getDadosSaude': return getDadosSaude.apply(null, args);
    case 'salvarMetasSaude': return salvarMetasSaude.apply(null, args);
    case 'salvarRastreadorSaude': return salvarRastreadorSaude.apply(null, args);
    case 'excluirRastreadorSaude': return excluirRastreadorSaude.apply(null, args);
    case 'salvarBibliotecaSaude': return salvarBibliotecaSaude.apply(null, args);
    case 'excluirBibliotecaSaude': return excluirBibliotecaSaude.apply(null, args);
    case 'salvarDiarioSaude': return salvarDiarioSaude.apply(null, args);
    case 'getDriveContent': return getDriveContent.apply(null, args);
    case 'uploadToDriveHub': return uploadToDriveHub.apply(null, args);
    case 'trashDriveItem': return trashDriveItem.apply(null, args);
    case 'criarPastaDriveHub': return criarPastaDriveHub.apply(null, args);
    case 'criarArquivoTextoDriveHub': return criarArquivoTextoDriveHub.apply(null, args);
    case 'salvarProjetoCompleto': return salvarProjetoCompleto.apply(null, args);
    case 'salvarImagemProjeto': return salvarImagemProjeto.apply(null, args);
    case 'removerImagemProjeto': return removerImagemProjeto.apply(null, args);
    case 'salvarAnexoDrive': return salvarAnexoDrive.apply(null, args);
    case 'deletarArquivoDrive': return deletarArquivoDrive.apply(null, args);
    default: throw new Error('Método não autorizado: ' + String(method || ''));
  }
}

function maiRpc(method, args) {
  const nome = String(method || '');
  const parametros = Array.isArray(args) ? args : [];
  const leitura = maiIsReadMethod_(nome);
  let version = maiCacheVersion_();

  try {
    if (leitura && nome !== 'getImagemProjeto') {
      const cache = CacheService.getUserCache();
      const key = maiCacheKey_(nome, parametros, version);
      const cached = cache.get(key);
      if (cached) {
        const parsed = JSON.parse(cached);
        return {
          __mai_rpc__: true,
          payload: parsed.payload,
          version: version,
          serverCache: true
        };
      }

      const result = maiDispatch_(nome, parametros);
      const payload = result === undefined ? null : result;
      const serialized = JSON.stringify({ payload: payload });
      if (serialized.length < 88000) {
        cache.put(key, serialized, maiCacheTtl_(nome));
      }

      return {
        __mai_rpc__: true,
        payload: payload,
        version: version,
        serverCache: false
      };
    }

    const result = maiDispatch_(nome, parametros);
    const payload = result === undefined ? null : result;

    if (!leitura) version = maiBumpCacheVersion_();

    return {
      __mai_rpc__: true,
      payload: payload,
      version: version,
      serverCache: false
    };
  } catch (e) {
    throw new Error(e && e.message ? e.message : String(e));
  }
}

function salvarProjetoCompleto(dados, imagemPayload) {
  try {
    const resultadoProjeto = salvarProjeto(dados);
    if (!resultadoProjeto || !resultadoProjeto.ok || !resultadoProjeto.projeto) {
      return resultadoProjeto || { ok: false, erro: 'Não foi possível salvar o projeto.' };
    }

    const projetoId = String(resultadoProjeto.projeto.id || '').trim();
    const payload = imagemPayload || {};
    const acao = String(payload.acao || 'nenhuma');

    if (acao === 'enviar') {
      const resultadoImagem = salvarImagemProjeto(
        projetoId,
        payload.base64Data,
        payload.fileName,
        payload.mimeType,
        payload.imagemAnteriorId
      );

      if (!resultadoImagem || !resultadoImagem.ok) {
        return {
          ok: false,
          projeto_salvo: true,
          projeto: resultadoProjeto.projeto,
          erro: (resultadoImagem && resultadoImagem.erro) || 'O projeto foi salvo, mas a imagem não foi enviada.'
        };
      }

      resultadoProjeto.projeto.imagem_id = resultadoImagem.imagem_id || '';
      resultadoProjeto.projeto.imagem_nome = resultadoImagem.imagem_nome || '';
      resultadoProjeto.projeto.imagem_mime = resultadoImagem.imagem_mime || '';
      resultadoProjeto.projeto.imagem_url = resultadoImagem.imagem_id
        ? obterImagemProjetoDataUrl_(resultadoImagem.imagem_id)
        : '';

      return resultadoProjeto;
    }

    if (acao === 'remover') {
      const resultadoRemocao = removerImagemProjeto(
        projetoId,
        payload.imagemAnteriorId
      );

      if (!resultadoRemocao || !resultadoRemocao.ok) {
        return {
          ok: false,
          projeto_salvo: true,
          projeto: resultadoProjeto.projeto,
          erro: (resultadoRemocao && resultadoRemocao.erro) || 'O projeto foi salvo, mas a imagem não foi removida.'
        };
      }

      resultadoProjeto.projeto.imagem_id = '';
      resultadoProjeto.projeto.imagem_nome = '';
      resultadoProjeto.projeto.imagem_mime = '';
      resultadoProjeto.projeto.imagem_url = '';
    }

    return resultadoProjeto;
  } catch (e) {
    return { ok: false, erro: e.message || String(e) };
  }
}

function salvarImagemProjeto(projetoId, base64Data, fileName, mimeType, imagemAnteriorId) {
  const lock = LockService.getScriptLock();
  let novoArquivo = null;

  try {
    lock.waitLock(10000);

    const idProjeto = String(projetoId || '').trim();
    if (!idProjeto) return { ok: false, erro: 'Projeto inválido.' };
    if (!base64Data || String(base64Data).indexOf(',') < 0) {
      return { ok: false, erro: 'Imagem inválida.' };
    }

    const tipo = String(mimeType || 'image/jpeg').trim();
    if (!/^image\/(jpeg|jpg|png|webp)$/i.test(tipo)) {
      return { ok: false, erro: 'Use uma imagem JPG, PNG ou WebP.' };
    }

    const pasta = DriveApp.getFolderById(MAI_PROJECT_IMAGES_FOLDER_ID_);
    const bytes = Utilities.base64Decode(String(base64Data).split(',')[1]);
    if (bytes.length > 3 * 1024 * 1024) {
      return { ok: false, erro: 'A imagem processada ultrapassou 3 MB.' };
    }

    const nomeSeguro = String(fileName || ('projeto-' + idProjeto + '.jpg'))
      .replace(/[^a-zA-Z0-9._-]+/g, '-')
      .slice(0, 120);

    const blob = Utilities.newBlob(bytes, tipo, nomeSeguro);
    novoArquivo = pasta.createFile(blob);


    const imagemId = novoArquivo.getId();
    const imagemUrl = 'drive-file:' + imagemId;

    const sheet = getSpreadsheet().getSheetByName('projetos_tarefas');
    const headers = garantirSchemaProjetosTarefas_(sheet);
    const data = sheet.getDataRange().getValues();
    const idx = {};
    headers.forEach((h, i) => idx[String(h)] = i);

    let linha = -1;
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][idx.id] || '').trim() === idProjeto) {
        linha = i + 1;
        break;
      }
    }

    if (linha < 0) {
      try { novoArquivo.setTrashed(true); } catch (erroLixeira) {}
      return { ok: false, erro: 'Projeto não encontrado.' };
    }

    sheet.getRange(linha, idx.imagem_id + 1).setValue(imagemId);
    sheet.getRange(linha, idx.imagem_nome + 1).setValue(nomeSeguro);
    sheet.getRange(linha, idx.imagem_mime + 1).setValue(tipo);
    sheet.getRange(linha, idx.imagem_url + 1).setValue(imagemUrl);

    const anterior = String(imagemAnteriorId || '').trim();
    if (anterior && anterior !== imagemId) {
      limparCacheImagemProjeto_(anterior);
      try { DriveApp.getFileById(anterior).setTrashed(true); } catch (erroAnterior) {}
    }

    limparCacheImagemProjeto_(imagemId);
    SpreadsheetApp.flush();
    return {
      ok: true,
      imagem_id: imagemId,
      imagem_nome: nomeSeguro,
      imagem_mime: tipo,
      imagem_url: imagemUrl
    };
  } catch (e) {
    if (novoArquivo) {
      try { novoArquivo.setTrashed(true); } catch (erroLixeira) {}
    }
    return { ok: false, erro: e.message || String(e) };
  } finally {
    try { lock.releaseLock(); } catch (erroLock) {}
  }
}

function removerImagemProjeto(projetoId, imagemId) {
  const lock = LockService.getScriptLock();

  try {
    lock.waitLock(10000);

    const idProjeto = String(projetoId || '').trim();
    const sheet = getSpreadsheet().getSheetByName('projetos_tarefas');
    const headers = garantirSchemaProjetosTarefas_(sheet);
    const data = sheet.getDataRange().getValues();
    const idx = {};
    headers.forEach((h, i) => idx[String(h)] = i);

    let linha = -1;
    let idAtual = '';
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][idx.id] || '').trim() === idProjeto) {
        linha = i + 1;
        idAtual = String(data[i][idx.imagem_id] || '').trim();
        break;
      }
    }

    if (linha < 0) return { ok: false, erro: 'Projeto não encontrado.' };

    sheet.getRange(linha, idx.imagem_id + 1).clearContent();
    sheet.getRange(linha, idx.imagem_nome + 1).clearContent();
    sheet.getRange(linha, idx.imagem_mime + 1).clearContent();
    sheet.getRange(linha, idx.imagem_url + 1).clearContent();

    const arquivoId = String(imagemId || idAtual || '').trim();
    if (arquivoId) {
      limparCacheImagemProjeto_(arquivoId);
      try { DriveApp.getFileById(arquivoId).setTrashed(true); } catch (erroArquivo) {}
    }

    SpreadsheetApp.flush();
    return { ok: true };
  } catch (e) {
    return { ok: false, erro: e.message || String(e) };
  } finally {
    try { lock.releaseLock(); } catch (erroLock) {}
  }
}

function salvarAnexoDrive(base64Data, fileName, mimeType) {
  try {
    const idDaSuaPasta = "1knWuc8XYRSTlaYssXFxQJcKopoxUJGOf";
    const folder = DriveApp.getFolderById(idDaSuaPasta);
    const contentType = base64Data.substring(5, base64Data.indexOf(';'));
    const bytes = Utilities.base64Decode(base64Data.split(',')[1]);
    const blob = Utilities.newBlob(bytes, contentType, fileName);
    const arquivo = folder.createFile(blob);
    arquivo.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    return { ok: true, idDrive: arquivo.getId(), nome: fileName, tipo: mimeType, url: arquivo.getUrl(), directUrl: "https://drive.google.com/uc?export=view&id=" + arquivo.getId() };
  } catch (e) { return { ok: false, erro: e.toString() }; }
}
function deletarArquivoDrive(id) { trashDriveItem(id, false); }

function salvarCategoriaMeta(dados) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(5000);
    const sheet = getSpreadsheet().getSheetByName('metas_categorias');
    if (!sheet) return { ok: false, erro: 'A aba metas_categorias não existe.' };

    const obj = (dados && typeof dados === 'object')
      ? dados
      : { nome: String(dados || '') };

    const id = String(obj.id || '').trim() || ('mcat-' + Utilities.getUuid());
    const nome = String(obj.nome || '').trim();
    if (!nome) return { ok: false, erro: 'Nome inválido.' };

    const data = sheet.getDataRange().getValues();
    const rowIndex = data.findIndex((row, index) => index > 0 && String(row[0]) === id);

    if (rowIndex > 0) sheet.getRange(rowIndex + 1, 1, 1, 2).setValues([[id, nome]]);
    else sheet.appendRow([id, nome]);

    return { ok: true, id: id, nome: nome };
  } catch (e) {
    return { ok: false, erro: e.message };
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
}

function renomearCategoriaMeta(id, novoNome) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(5000);

    const ss = getSpreadsheet();
    const sheetC = ss.getSheetByName('metas_categorias');
    const sheetM = ss.getSheetByName('Metas');
    if (!sheetC) return { ok: false, erro: 'A aba metas_categorias não existe.' };

    const dataC = sheetC.getDataRange().getValues();
    let nomeAntigo = '';

    for (let i = 1; i < dataC.length; i++) {
      if (String(dataC[i][0]) === String(id)) {
        nomeAntigo = String(dataC[i][1] || '');
        sheetC.getRange(i + 1, 2).setValue(novoNome);
        break;
      }
    }

    if (sheetM && nomeAntigo) {
      const dataM = sheetM.getDataRange().getValues();
      const headers = dataM[0] || [];
      const idxCat = headers.indexOf('categoria');

      if (idxCat >= 0) {
        for (let i = 1; i < dataM.length; i++) {
          if (String(dataM[i][idxCat] || '') === nomeAntigo) {
            sheetM.getRange(i + 1, idxCat + 1).setValue(novoNome);
          }
        }
      }
    }

    return { ok: true };
  } catch (e) {
    return { ok: false, erro: e.message };
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
}

function excluirCategoriaMeta(id) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(5000);
    const sheet = getSpreadsheet().getSheetByName('metas_categorias');
    if (!sheet) return { ok: false, erro: 'A aba metas_categorias não existe.' };

    const data = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]) === String(id)) {
        sheet.deleteRow(i + 1);
        return { ok: true };
      }
    }

    return { ok: false, erro: 'Categoria não encontrada.' };
  } catch (e) {
    return { ok: false, erro: e.message };
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
}