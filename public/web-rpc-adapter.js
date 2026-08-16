(() => {
  'use strict';

  const KEY = 'mai-faithful-port-state-v1';
  const VERSION_KEY = 'mai-faithful-port-version-v1';
  const nowIso = () => new Date().toISOString();
  const id = prefix => `${prefix}-${crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2)}`;
  const dateKey = d => {
    const x = d instanceof Date ? d : new Date(d || Date.now());
    const y=x.getFullYear(), m=String(x.getMonth()+1).padStart(2,'0'), day=String(x.getDate()).padStart(2,'0');
    return `${y}-${m}-${day}`;
  };
  const clone = value => JSON.parse(JSON.stringify(value));
  const asJson = value => JSON.stringify(value);

  function seed() {
    const today = dateKey(new Date());
    return {
      version: 1,
      configs: { calendarios: [] },
      projects: [],
      tasks: [],
      habits: [],
      habitEntries: [],
      notes: [],
      events: [],
      eventCompletions: [],
      finance: { transactions: [], categories: [], accounts: [], cards: [], fixed: [], fixedOccurrences: [] },
      goals: [],
      goalCategories: [],
      health: {
        trackers: [], library: [], diary: {},
        goals: { kcal:2000, agua:2500, p:160, c:250, g:60, fibra:30, sodio:2000, acucar:40, deitar:'22:30', horasIdeais:8, blocosIdeais:5, rem:90, profundo:90 }
      },
      drive: { items: [] },
      meta: { createdAt: nowIso(), updatedAt: nowIso(), today }
    };
  }

  let state;
  try { state = JSON.parse(localStorage.getItem(KEY) || 'null') || seed(); }
  catch { state = seed(); }

  function persist() {
    state.meta = state.meta || {};
    state.meta.updatedAt = nowIso();
    state.version = Number(state.version || 0) + 1;
    localStorage.setItem(KEY, JSON.stringify(state));
    localStorage.setItem(VERSION_KEY, String(state.version));
    queueRemoteSync();
  }

  let syncTimer = null;
  function queueRemoteSync() {
    clearTimeout(syncTimer);
    syncTimer = setTimeout(async () => {
      try {
        const res = await fetch('/api/state', {
          method: 'PUT', headers: { 'content-type': 'application/json', ...(localStorage.getItem('mai-supabase-access-token') ? { Authorization: `Bearer ${localStorage.getItem('mai-supabase-access-token')}` } : {}) },
          body: JSON.stringify({ data: state })
        });
        if (!res.ok && res.status !== 401 && res.status !== 503) console.warn('[MAI] sync remoto:', await res.text());
      } catch (_) {}
    }, 250);
  }

  async function hydrateRemote() {
    try {
      const token = localStorage.getItem('mai-supabase-access-token');
      const res = await fetch('/api/state', { cache: 'no-store', headers: token ? { Authorization: `Bearer ${token}` } : {} });
      if (!res.ok) return;
      const payload = await res.json();
      if (payload && payload.data && Number(payload.data.version || 0) > Number(state.version || 0)) {
        state = payload.data;
        localStorage.setItem(KEY, JSON.stringify(state));
        window.dispatchEvent(new CustomEvent('mai:data-changed', { detail: { method: 'hydrateRemote', at: Date.now() } }));
      }
    } catch (_) {}
  }
  setTimeout(hydrateRemote, 600);

  function projectList() {
    return [{ id:'entrada', nome:'Entrada', secoes:[], parent_id:'', ordem:-1, icone:'inbox', cor:'#8A8A8A', imagem_id:'', imagem_nome:'', imagem_mime:'', imagem_url:'' },
      ...state.projects.map(p => ({ secoes:[], parent_id:'', ordem:0, icone:'folder', cor:'#8A8A8A', imagem_id:'', imagem_nome:'', imagem_mime:'', imagem_url:'', ...clone(p), imagem_url: p.imagem_url || '' }))];
  }

  function nextRepeat(value, rule) {
    const hasTime = String(value || '').includes('T');
    const d = new Date(hasTime ? value : `${value || dateKey(new Date())}T12:00:00`);
    if (rule === 'diariamente') d.setDate(d.getDate()+1);
    else if (rule === 'semanalmente') d.setDate(d.getDate()+7);
    else if (rule === 'mensalmente') d.setMonth(d.getMonth()+1);
    else if (rule === 'anualmente') d.setFullYear(d.getFullYear()+1);
    else if (String(rule).startsWith('intervalo:')) d.setDate(d.getDate()+(parseInt(String(rule).split(':')[1],10)||1));
    else if (String(rule).startsWith('semanal:')) {
      const days=String(rule).split(':')[1].split(',').map(Number); let add=1;
      while(add<=7 && !days.includes((d.getDay()+add)%7)) add++;
      d.setDate(d.getDate()+add);
    }
    const dk=dateKey(d);
    return hasTime ? `${dk}T${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}` : dk;
  }

  function taskPayload(d={}) {
    const existing = state.tasks.find(x => String(x.id) === String(d.id));
    return {
      id: d.id || id('t'), titulo: d.titulo || '', descricao: d.descricao || '', notas: Array.isArray(d.notas)?d.notas:(existing?.notas||[]),
      data_vencimento: d.data_vencimento || '', prioridade: Number(d.prioridade)||4, concluida: d.concluida === true,
      criado_em: existing?.criado_em || nowIso(), projeto_id: d.projeto_id || existing?.projeto_id || 'entrada', anexos: d.anexos || existing?.anexos || [],
      subtarefas: d.subtarefas || existing?.subtarefas || [], repeticao: d.repeticao || '', secao: d.secao || '', ocultar_agenda: d.ocultar_agenda === true,
      ordem: Number.isFinite(Number(d.ordem)) ? Number(d.ordem) : (existing?.ordem ?? Date.now())
    };
  }

  function agendaPlanner(start, end) {
    const s=String(start||'0000-00-00').slice(0,10), e=String(end||'9999-99-99').slice(0,10);
    const inRange = d => d && String(d).slice(0,10) >= s && String(d).slice(0,10) <= e;
    const tasks=[];
    for (const t of state.tasks) {
      const due=String(t.data_vencimento||'');
      if (!t.ocultar_agenda && inRange(due)) tasks.push({ ...clone(t), hora_inicio: due.includes('T') ? due.split('T')[1].slice(0,5) : '' });
      for (let i=0;i<(t.subtarefas||[]).length;i++) {
        const sub=t.subtarefas[i]; if(sub?.concluida || !inRange(sub?.data_vencimento)) continue;
        tasks.push({ id:String(sub.id || `${t.id}-sub-${i}`), titulo:sub.titulo||'', data_vencimento:String(sub.data_vencimento||'').slice(0,10), hora_inicio:String(sub.data_vencimento||'').includes('T')?String(sub.data_vencimento).split('T')[1].slice(0,5):'', prioridade:Number(sub.prioridade||t.prioridade||4), concluida:false, projeto_id:t.projeto_id||'entrada', secao:t.secao||'', repeticao:sub.repeticao||'', ocultar_agenda:false, parent_task_id:t.id });
      }
    }
    const habits = state.habits.filter(h => h.ativo !== false && !h.ocultar_agenda).map(h => ({ id:h.id, nome:h.nome, icone:h.icone, cor_hex:h.cor_hex, meta:h.meta, unidade:h.unidade, hora:h.hora||'' }));
    return { ok:true, eventos: state.events.filter(ev => inRange(ev.data_inicio)), tarefas:tasks, habitos:habits, conclusoes: state.eventCompletions.filter(c=>inRange(c.data)) };
  }

  function stats(habitId) {
    const dates=[...new Set(state.habitEntries.filter(r=>String(r.habito_id)===String(habitId)).map(r=>r.data))].sort().reverse();
    const set=new Set(dates); const today=dateKey(new Date()); const y=new Date(); y.setDate(y.getDate()-1); const yd=dateKey(y);
    let current=0; let cursor=set.has(today)?new Date(`${today}T12:00:00`):(set.has(yd)?new Date(`${yd}T12:00:00`):null);
    while(cursor && set.has(dateKey(cursor))) { current++; cursor.setDate(cursor.getDate()-1); }
    let best=0, run=0, prev=null;
    for(const ds of dates){const d=new Date(`${ds}T12:00:00`); if(!prev)run=1; else {const diff=(prev-d)/86400000; run=diff===1?run+1:1;} best=Math.max(best,run); prev=d;}
    return { ok:true, data:{ streakAtual:current, melhorStreak:best, taxa:dates.length } };
  }

  const handlers = {
    getScriptUrl: () => location.origin,
    getConfigsAgenda: () => ({ ok:true, calendarios: clone(state.configs.calendarios||[]) }),
    salvarConfigsAgenda: configs => {
      const next = Array.isArray(configs) ? { calendarios: configs.map(String) } : (configs || {});
      state.configs = { ...state.configs, ...next };
      persist();
      return {ok:true};
    },
    getListaCalendarios: () => [],
    getGoogleCalendarPeriodo: () => ({ok:true,eventos:[]}),
    getAgendaPlannerInterno: (s,e) => agendaPlanner(s,e),
    getDadosAgendaCompleta: (s,e) => asJson({ ...agendaPlanner(String(s||'').slice(0,10), String(e||'').slice(0,10)) }),
    salvarEventoAgenda: d => { const item={ id:d.id||id('ev'), titulo:d.titulo||'', descricao:d.descricao||'', data_inicio:d.data_inicio||'', hora_inicio:d.dia_inteiro?'':(d.hora_inicio||''), hora_fim:d.dia_inteiro?'':(d.hora_fim||''), repeticao:d.repeticao||'', dia_inteiro:d.dia_inteiro===true, cor:d.cor||'var(--accent)', criado_em:nowIso(), anexos:d.anexos||[] }; const i=state.events.findIndex(x=>String(x.id)===String(item.id)); if(i>=0)item.criado_em=state.events[i].criado_em||item.criado_em, state.events[i]=item; else state.events.push(item); persist(); return {ok:true,id:item.id}; },
    excluirEventoAgenda: eventId => { state.events=state.events.filter(x=>String(x.id)!==String(eventId)); state.eventCompletions=state.eventCompletions.filter(x=>String(x.evento_id)!==String(eventId)); persist(); return {ok:true}; },
    acaoEventoAgenda: d => { const key=d.chave||`${d.evento_id}|${d.data}|${d.hora||''}`; const existing=state.eventCompletions.find(x=>x.chave===key); if(d.acao==='desfazer'||d.concluida===false){state.eventCompletions=state.eventCompletions.filter(x=>x.chave!==key);} else if(existing){existing.concluida=true;existing.atualizado_em=nowIso();} else state.eventCompletions.push({chave:key,evento_id:d.evento_id,data:d.data,hora:d.hora||'',tipo:d.tipo||'evento',titulo:d.titulo||'',concluida:true,atualizado_em:nowIso()}); persist(); return {ok:true}; },
    atualizarDataHoraArrastar: (itemId,tipo,novaData,novaHora) => { if(tipo==='evento'){const x=state.events.find(v=>String(v.id)===String(itemId)); if(x){x.data_inicio=novaData;if(novaHora!=null){x.hora_inicio=novaHora;x.dia_inteiro=false;}}} else {const x=state.tasks.find(v=>String(v.id)===String(itemId));if(x)x.data_vencimento=novaHora?`${novaData}T${novaHora}`:novaData;} persist(); return {ok:true}; },

    getDadosTarefas: () => asJson({ok:true,tarefas:clone(state.tasks),projetos:projectList(),eventos_concluidos:clone(state.eventCompletions)}),
    salvarTarefa: d => { const item=taskPayload(d); const i=state.tasks.findIndex(x=>String(x.id)===String(item.id)); if(i>=0)state.tasks[i]=item; else state.tasks.push(item); persist(); return {ok:true,id:item.id}; },
    atualizarOrdemTarefasProjeto: moves => { (moves||[]).forEach((m,n)=>{const t=state.tasks.find(x=>String(x.id)===String(m.id));if(t){t.projeto_id=m.projeto_id||'entrada';t.secao=m.secao||'';t.ordem=Number.isFinite(Number(m.ordem))?Number(m.ordem):n;}});persist();return{ok:true}; },
    acaoTarefa: (taskId,action) => { const i=state.tasks.findIndex(x=>String(x.id)===String(taskId)); if(i<0)return{ok:false}; const t=state.tasks[i]; if(action==='deletar'){state.tasks.splice(i,1);} else if(action==='reabrir'||action==='desfazer'){t.concluida=false;} else if(action==='concluir'){if(t.repeticao&&t.data_vencimento){t.data_vencimento=nextRepeat(t.data_vencimento,t.repeticao);t.concluida=false;(t.subtarefas||[]).forEach(s=>s.concluida=false);}else t.concluida=true;} persist();return{ok:true}; },
    salvarProjeto: d => { const existing=state.projects.find(x=>String(x.id)===String(d.id)); const item={id:d.id||id('proj'),nome:String(d.nome||existing?.nome||'').trim(),secoes:Array.isArray(d.secoes)?d.secoes:(existing?.secoes||[]),parent_id:Object.prototype.hasOwnProperty.call(d,'parent_id')?(d.parent_id||''):(existing?.parent_id||''),ordem:Number.isFinite(Number(d.ordem))?Number(d.ordem):(existing?.ordem??state.projects.length),icone:d.icone||existing?.icone||'folder',cor:d.cor||existing?.cor||'#8A8A8A',imagem_id:d.imagem_id||existing?.imagem_id||'',imagem_nome:d.imagem_nome||existing?.imagem_nome||'',imagem_mime:d.imagem_mime||existing?.imagem_mime||'',imagem_url:d.imagem_url||existing?.imagem_url||''}; if(!item.nome)return{ok:false,erro:'Informe o nome do projeto.'}; const i=state.projects.findIndex(x=>String(x.id)===String(item.id)); if(i>=0)state.projects[i]=item;else state.projects.push(item);persist();return{ok:true,id:item.id,projeto:clone(item)}; },
    salvarProjetoCompleto: (d,img) => { const r=handlers.salvarProjeto(d); if(r.ok&&img&&img.base64Data) handlers.salvarImagemProjeto(r.id,img.base64Data,img.fileName,img.mimeType,img.imagemAnteriorId); return r; },
    moverProjeto: (projectId,parentId,ordem) => {const p=state.projects.find(x=>String(x.id)===String(projectId));if(!p)return{ok:false};p.parent_id=parentId||'';p.ordem=Number(ordem)||0;persist();return{ok:true};},
    salvarEstruturaProjetos: list => {(list||[]).forEach(m=>{const p=state.projects.find(x=>String(x.id)===String(m.id));if(p){p.parent_id=m.parent_id||'';p.ordem=Number(m.ordem)||0;}});persist();return{ok:true};},
    excluirProjeto: projectId => {state.projects=state.projects.filter(x=>String(x.id)!==String(projectId));state.tasks.forEach(t=>{if(String(t.projeto_id)===String(projectId)){t.projeto_id='entrada';t.secao='';}});persist();return{ok:true};},
    getImagemProjeto: projectId => {const p=state.projects.find(x=>String(x.id)===String(projectId));return{ok:true,dataUrl:p?.imagem_url||'',id:p?.imagem_id||'',nome:p?.imagem_nome||'',mime:p?.imagem_mime||''};},
    salvarImagemProjeto: (projectId,base64,fileName,mime) => {const p=state.projects.find(x=>String(x.id)===String(projectId));if(!p)return{ok:false};p.imagem_id=id('img');p.imagem_nome=fileName||'imagem';p.imagem_mime=mime||'image/jpeg';p.imagem_url=String(base64||'').startsWith('data:')?base64:`data:${p.imagem_mime};base64,${base64}`;persist();return{ok:true,id:p.imagem_id,url:p.imagem_url};},
    removerImagemProjeto: projectId => {const p=state.projects.find(x=>String(x.id)===String(projectId));if(p){p.imagem_id='';p.imagem_nome='';p.imagem_mime='';p.imagem_url='';persist();}return{ok:true};},

    getHabitos: () => ({ok:true,data:clone(state.habits)}),
    criarHabito: d => {const h={id:d.id||id('hab'),nome:d.nome||'',icone:d.icone||'check_circle',cor_hex:d.cor_hex||d.cor||'#448AFF',meta:Number(d.meta)||1,unidade:d.unidade||'',ativo:d.ativo!==false,criado_em:nowIso(),ocultar_agenda:d.ocultar_agenda===true,hora:d.hora||''};state.habits.push(h);persist();return{ok:true,id:h.id};},
    editarHabito: d => {const h=state.habits.find(x=>String(x.id)===String(d.id));if(!h)return{ok:false};Object.assign(h,d);persist();return{ok:true};},
    excluirHabito: habitId => {state.habits=state.habits.filter(x=>String(x.id)!==String(habitId));state.habitEntries=state.habitEntries.filter(x=>String(x.habito_id)!==String(habitId));persist();return{ok:true};},
    getRegistrosDoPeriodo: (start,end) => ({ok:true,data:clone(state.habitEntries.filter(r=>String(r.data)>=String(start)&&String(r.data)<=String(end)))}),
    marcarHabito: (habitId,data,valor) => {const existing=state.habitEntries.find(r=>String(r.habito_id)===String(habitId)&&r.data===data);if(existing)existing.valor=Number(valor)||1;else state.habitEntries.push({id:id('reg'),habito_id:habitId,data,valor:Number(valor)||1,criado_em:nowIso()});persist();return{ok:true};},
    desmarcarHabito: (habitId,data) => {state.habitEntries=state.habitEntries.filter(r=>!(String(r.habito_id)===String(habitId)&&r.data===data));persist();return{ok:true};},
    getEstatisticas: habitId => stats(habitId),

    getNotas: () => ({ok:true,data:clone(state.notes).sort((a,b)=>(a.ordem??999)-(b.ordem??999))}),
    salvarNota: d => {const existing=state.notes.find(x=>String(x.id)===String(d.id));const item={id:d.id||id('note'),titulo:d.titulo||'',conteudo:d.conteudo||'',data:existing?.data||nowIso(),ativo:existing?.ativo!==false,fixado:d.fixado===true,tamanho:d.tamanho||'normal',arquivado:existing?.arquivado===true,ordem:existing?.ordem??0,anexos:d.anexos||[]};const i=state.notes.findIndex(x=>String(x.id)===String(item.id));if(i>=0)state.notes[i]=item;else state.notes.push(item);persist();return{ok:true,id:item.id};},
    atualizarOrdemNotas: ids => {(ids||[]).forEach((nid,n)=>{const x=state.notes.find(v=>String(v.id)===String(nid));if(x)x.ordem=n;});persist();return{ok:true};},
    acaoNota: (noteId,action) => {const i=state.notes.findIndex(x=>String(x.id)===String(noteId));if(i<0)return{ok:false};if(action==='deletar')state.notes.splice(i,1);else if(action==='lixeira')state.notes[i].ativo=false;else if(action==='restaurar')state.notes[i].ativo=true;else if(action==='arquivar')state.notes[i].arquivado=true;else if(action==='desarquivar')state.notes[i].arquivado=false;persist();return{ok:true};},

    getDadosFinanceiro: () => asJson({ok:true,transacoes:clone(state.finance.transactions),categorias:clone(state.finance.categories),contas:clone(state.finance.accounts),cartoes:clone(state.finance.cards),fixos:clone(state.finance.fixed),fixo_ocorrencias:clone(state.finance.fixedOccurrences)}),
    salvarTransacao: d => {const list=Array.isArray(d)?d:[d];list.forEach(x=>{const existing=state.finance.transactions.find(v=>String(v.id)===String(x.id));const item={id:x.id||id('fin'),titulo:x.titulo||'',valor:Number(x.valor)||0,valor_pago:Number(x.valor_pago)||0,tipo:x.tipo||'despesa',categoria:x.categoria||'',conta_id:x.conta_id||'',data:String(x.data||'').split('T')[0],status:x.status||'pendente',criado_em:existing?.criado_em||nowIso(),observacao:x.observacao||'',lote_id:x.lote_id||'',pagamentos:x.pagamentos||[],ignorar_calculo:x.ignorar_calculo===true};const i=state.finance.transactions.findIndex(v=>String(v.id)===String(item.id));if(i>=0)state.finance.transactions[i]=item;else state.finance.transactions.push(item);});persist();return{ok:true};},
    excluirTransacao: tid => {const n=state.finance.transactions.length;state.finance.transactions=state.finance.transactions.filter(x=>String(x.id)!==String(tid));persist();return{ok:state.finance.transactions.length<n};},
    excluirLoteFinanceiro: lot => {const n=state.finance.transactions.length;state.finance.transactions=state.finance.transactions.filter(x=>String(x.lote_id)!==String(lot));persist();return{ok:state.finance.transactions.length<n};},
    salvarContaFinanceiro: d => {const item={id:d.id||id('cta'),nome:d.nome||'',saldo_inicial:Number(d.saldo_inicial)||0,cor:d.cor||'#448AFF'};const i=state.finance.accounts.findIndex(x=>String(x.id)===String(item.id));if(i>=0)state.finance.accounts[i]=item;else state.finance.accounts.push(item);persist();return{ok:true,id:item.id};},
    excluirContaFinanceiro: cid => {state.finance.accounts=state.finance.accounts.filter(x=>String(x.id)!==String(cid));persist();return{ok:true};},
    salvarCartaoFinanceiro: d => {const item={id:d.id||id('crd'),nome:d.nome||'',limite:Number(d.limite)||0,fechamento:d.fechamento||1,vencimento:d.vencimento||1,conta_id:d.conta_id||'',cor:d.cor||'#448AFF'};const i=state.finance.cards.findIndex(x=>String(x.id)===String(item.id));if(i>=0)state.finance.cards[i]=item;else state.finance.cards.push(item);persist();return{ok:true,id:item.id};},
    excluirCartaoFinanceiro: cid => {state.finance.cards=state.finance.cards.filter(x=>String(x.id)!==String(cid));persist();return{ok:true};},
    salvarCategoriaFinanceiro: d => {const item={id:d.id||id('cat'),nome:d.nome||''};const i=state.finance.categories.findIndex(x=>String(x.id)===String(item.id));if(i>=0)state.finance.categories[i]=item;else state.finance.categories.push(item);persist();return{ok:true,...item};},
    excluirCategoriaFinanceiro: cid => {state.finance.categories=state.finance.categories.filter(x=>String(x.id)!==String(cid));persist();return{ok:true};},
    salvarFixoFinanceiro: d => {const existing=state.finance.fixed.find(x=>String(x.id)===String(d.id));const item={id:d.id||id('fix'),grupo_id:d.grupo_id||d.id||'',titulo:d.titulo||'',valor:Number(d.valor)||0,tipo:d.tipo||'despesa',categoria:d.categoria||'',conta_id:d.conta_id||'',dia_mes:Math.min(31,Math.max(1,parseInt(d.dia_mes,10)||1)),mes_inicio:String(d.mes_inicio||'').slice(0,7),mes_fim:String(d.mes_fim||'').slice(0,7),ativo:d.ativo!==false,observacao:d.observacao||'',ignorar_calculo:d.ignorar_calculo===true,criado_em:existing?.criado_em||nowIso(),atualizado_em:nowIso()};if(!item.titulo||!item.mes_inicio)return{ok:false,erro:'Título e mês inicial são obrigatórios.'};if(!item.grupo_id)item.grupo_id=item.id;const i=state.finance.fixed.findIndex(x=>String(x.id)===String(item.id));if(i>=0)state.finance.fixed[i]=item;else state.finance.fixed.push(item);persist();return{ok:true,id:item.id,fixo:item};},
    salvarOcorrenciaFixoFinanceiro: d => {const item={chave:d.chave||`${d.fixo_id}|${String(d.competencia||'').slice(0,7)}`,fixo_id:d.fixo_id,competencia:String(d.competencia||'').slice(0,7),status:d.status||'pendente',valor_override:d.valor_override??'',data_override:String(d.data_override||'').split('T')[0],ignorado:d.ignorado===true,pagamentos:d.pagamentos||[],valor_pago:Number(d.valor_pago)||0,ignorar_calculo:d.ignorar_calculo===true,atualizado_em:nowIso()};const i=state.finance.fixedOccurrences.findIndex(x=>x.chave===item.chave);if(i>=0)state.finance.fixedOccurrences[i]=item;else state.finance.fixedOccurrences.push(item);persist();return{ok:true,chave:item.chave};},
    excluirFixoFinanceiro: fid => {state.finance.fixed=state.finance.fixed.filter(x=>String(x.id)!==String(fid));state.finance.fixedOccurrences=state.finance.fixedOccurrences.filter(x=>String(x.fixo_id)!==String(fid));persist();return{ok:true};},

    getDadosMetas: () => asJson({ok:true,metas:clone(state.goals),categorias:clone(state.goalCategories)}),
    salvarMeta: d => {const item={...clone(d),id:d.id||id('meta'),milestones:d.milestones||[],anexos:d.anexos||[]};const i=state.goals.findIndex(x=>String(x.id)===String(item.id));if(i>=0)state.goals[i]=item;else state.goals.push(item);persist();return{ok:true,id:item.id};},
    excluirMeta: gid => {state.goals=state.goals.filter(x=>String(x.id)!==String(gid));persist();return{ok:true};},
    salvarCategoriaMeta: d => {const item={id:d.id||id('mcat'),nome:d.nome||''};const i=state.goalCategories.findIndex(x=>String(x.id)===String(item.id));if(i>=0)state.goalCategories[i]=item;else state.goalCategories.push(item);persist();return{ok:true,id:item.id,nome:item.nome};},
    renomearCategoriaMeta: (cid,name) => {const c=state.goalCategories.find(x=>String(x.id)===String(cid));if(c)c.nome=name;state.goals.forEach(g=>{if(String(g.categoria)===String(cid)||g.categoria===c?.nome){} });persist();return{ok:!!c};},
    excluirCategoriaMeta: cid => {state.goalCategories=state.goalCategories.filter(x=>String(x.id)!==String(cid));persist();return{ok:true};},

    getDadosSaude: () => asJson({ok:true,rastreadores:clone(state.health.trackers),biblioteca:clone(state.health.library),diarioDB:clone(state.health.diary),metas:clone(state.health.goals)}),
    salvarMetasSaude: d => {state.health.goals=clone(d||{});persist();return{ok:true};},
    salvarRastreadorSaude: d => {const item={...clone(d),id:d.id||id('trk')};const i=state.health.trackers.findIndex(x=>String(x.id)===String(item.id));if(i>=0)state.health.trackers[i]=item;else state.health.trackers.push(item);persist();return{ok:true,id:item.id};},
    excluirRastreadorSaude: rid => {state.health.trackers=state.health.trackers.filter(x=>String(x.id)!==String(rid));persist();return{ok:true};},
    salvarBibliotecaSaude: d => {const item={...clone(d),id:d.id||id('lib')};const i=state.health.library.findIndex(x=>String(x.id)===String(item.id));if(i>=0)state.health.library[i]=item;else state.health.library.push(item);persist();return{ok:true,id:item.id};},
    excluirBibliotecaSaude: rid => {state.health.library=state.health.library.filter(x=>String(x.id)!==String(rid));persist();return{ok:true};},
    salvarDiarioSaude: (data,dados) => {if(typeof data==='object'){dados=data.dados||data.json_dados||data;data=data.data||dateKey(new Date());}state.health.diary[String(data||dateKey(new Date())).slice(0,10)]=clone(dados||{});persist();return{ok:true};},

    getDriveContent: folderId => {const parent=folderId&&folderId!=='root'?folderId:'root';const items=state.drive.items.filter(x=>(x.parent_id||'root')===parent&&!x.trashed);return{ok:true,items:clone(items),folders:clone(items.filter(x=>x.tipo==='folder')),files:clone(items.filter(x=>x.tipo!=='folder')),quota:{used:0,total:0}};},
    criarPastaDriveHub: (name,parentFolderId) => {const item={id:id('folder'),name:name||'Nova pasta',nome:name||'Nova pasta',tipo:'folder',parent_id:parentFolderId||'root',modificado:nowIso(),url:'#'};state.drive.items.push(item);persist();return{ok:true,item};},
    criarArquivoTextoDriveHub: (name,parentFolderId) => {const final=String(name||'arquivo').toLowerCase().endsWith('.txt')?String(name):`${name||'arquivo'}.txt`;const item={id:id('file'),name:final,nome:final,tipo:'text/plain',parent_id:parentFolderId||'root',tamanho:0,modificado:nowIso(),url:'#',conteudo:''};state.drive.items.push(item);persist();return{ok:true,item};},
    uploadToDriveHub: (base64,fileName,mime,parentFolderId) => {const item={id:id('file'),name:fileName||'arquivo',nome:fileName||'arquivo',tipo:mime||'application/octet-stream',parent_id:parentFolderId||'root',tamanho:String(base64||'').length,modificado:nowIso(),url:String(base64||'').startsWith('data:')?base64:`data:${mime||'application/octet-stream'};base64,${base64}`};state.drive.items.push(item);persist();return{ok:true,item};},
    salvarAnexoDrive: (base64,fileName,mime) => handlers.uploadToDriveHub(base64,fileName,mime,'root'),
    trashDriveItem: driveId => {const x=state.drive.items.find(v=>String(v.id)===String(driveId));if(x)x.trashed=true;persist();return{ok:true};},
    deletarArquivoDrive: driveId => handlers.trashDriveItem(driveId),
  };

  handlers.getResumoHoje = () => {
    const today=dateKey(new Date()); const ag=agendaPlanner(today,today);
    const finance=state.finance.transactions.filter(t=>{const status=String(t.status||'').toLowerCase();const paid=['pago','paga','quitado','quitada','concluido','concluída','concluida'].includes(status);return !paid && Math.max(0,Number(t.valor||0)-Number(t.valor_pago||0))>0 && t.data && String(t.data).slice(0,10)<=today;}).sort((a,b)=>String(a.data).localeCompare(String(b.data)));
    const goals=state.goals.filter(g=>!['concluída','concluida','concluido','concluído'].includes(String(g.status||'').toLowerCase())).sort((a,b)=>String(a.prazo||'9999-12-31').localeCompare(String(b.prazo||'9999-12-31')));
    return {ok:true,hoje:today,agenda:ag,tarefasDetalhadas:clone(state.tasks),projetos:projectList(),registros:clone(state.habitEntries.filter(r=>r.data===today)),financeiro:clone(finance),metas:clone(goals),saude:clone(state.health.diary[today]||{})};
  };

  handlers.maiRpc = (method,args) => {
    const fn=handlers[String(method)]; if(!fn) return {__mai_rpc__:true,payload:{ok:false,erro:`Método não implementado: ${method}`},version:state.version,serverCache:false};
    return {__mai_rpc__:true,payload:fn(...(Array.isArray(args)?args:[])),version:state.version,serverCache:false};
  };

  function invoke(method,args,cb,fail,userObject){
    Promise.resolve().then(()=>{
      const fn=handlers[method];
      if(!fn) throw new Error(`Função não implementada no port: ${method}`);
      return fn(...args);
    }).then(result=>setTimeout(()=>cb?.(clone(result),userObject),0)).catch(err=>setTimeout(()=>fail?.(err,userObject),0));
  }

  function runner(config={}) {
    return new Proxy({}, { get(_t, prop) {
      if(prop==='withSuccessHandler') return cb=>runner({...config,success:cb});
      if(prop==='withFailureHandler') return cb=>runner({...config,failure:cb});
      if(prop==='withUserObject') return obj=>runner({...config,userObject:obj});
      if(prop==='then') return undefined;
      if(typeof prop!=='string') return undefined;
      return (...args)=>invoke(prop,args,config.success,config.failure,config.userObject);
    }});
  }

  window.google = window.google || {};
  window.google.script = window.google.script || {};
  window.google.script.run = runner();
  window.MAIPort = {
    exportState: () => clone(state),
    reset: () => { state=seed(); persist(); location.reload(); },
    importState: data => { state=clone(data||seed()); persist(); location.reload(); },
    handlers
  };
})();
