'use client'

import { FormEvent, ReactNode, useEffect, useRef, useState } from 'react'
import type { MaiState } from '../../lib/v2/state'
import styles from './mai-v2.module.css'

export type SecondaryView = 'habits' | 'goals' | 'notes' | 'finance' | 'health' | 'files'
type Row = Record<string, any>
type Commit = (change: (current: MaiState) => MaiState) => void

type Props = {
  view: SecondaryView
  state: MaiState
  today: string
  commit: Commit
  googleRpc: (method: string, args?: unknown[]) => Promise<any>
}

const rows = (value: unknown): Row[] => Array.isArray(value) ? value as Row[] : []
const id = (prefix: string) => `${prefix}-${crypto.randomUUID()}`
const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
const stripHtml = (value: unknown) => String(value || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()

function fmtDate(value: unknown) {
  const key = String(value || '').slice(0, 10)
  if (!key) return 'Sem data'
  return new Date(`${key}T12:00:00`).toLocaleDateString('pt-BR', { day: 'numeric', month: 'short', year: 'numeric' })
}

function AreaToolbar({ tabs, active, onTab, onAdd, addLabel }: { tabs?: string[]; active?: string; onTab?: (tab: string) => void; onAdd: () => void; addLabel: string }) {
  return <div className={styles.areaToolbar}><div>{tabs?.map(tab => <button key={tab} data-active={active === tab} onClick={() => onTab?.(tab)}>{tab}</button>)}</div><button onClick={onAdd}>＋ {addLabel}</button></div>
}

function Empty({ title, text }: { title: string; text: string }) {
  return <div className={styles.areaEmpty}><strong>{title}</strong><span>{text}</span></div>
}

function Editor({ title, subtitle, onClose, onDelete, children, onSubmit, submitLabel = 'Salvar' }: { title: string; subtitle?: string; onClose: () => void; onDelete?: () => void; children: ReactNode; onSubmit: (event: FormEvent) => void; submitLabel?: string }) {
  return <div className={styles.areaModalLayer} onMouseDown={onClose}><form className={styles.areaEditor} onSubmit={onSubmit} onMouseDown={event => event.stopPropagation()}><header><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div><button type="button" onClick={onClose}>×</button></header><div className={styles.areaEditorBody}>{children}</div><footer>{onDelete ? <button type="button" data-danger onClick={onDelete}>Excluir</button> : <span />}<div><button type="button" onClick={onClose}>Cancelar</button><button type="submit">{submitLabel}</button></div></footer></form></div>
}

function Field({ label, children, wide = false }: { label: string; children: ReactNode; wide?: boolean }) {
  return <label className={styles.areaField} data-wide={wide}><span>{label}</span>{children}</label>
}

function Habits({ state, today, commit }: Pick<Props, 'state' | 'today' | 'commit'>) {
  const habits = rows(state.habits).filter(habit => habit.ativo !== false)
  const entries = rows(state.habitEntries)
  const [draft, setDraft] = useState<Row | null>(null)

  const done = (habitId: unknown) => entries.some(entry => String(entry.habito_id) === String(habitId) && String(entry.data || '').slice(0, 10) === today)

  function toggle(habit: Row) {
    commit(current => {
      const currentEntries = rows(current.habitEntries)
      const exists = currentEntries.some(entry => String(entry.habito_id) === String(habit.id) && String(entry.data || '').slice(0, 10) === today)
      return { ...current, habitEntries: exists ? currentEntries.filter(entry => !(String(entry.habito_id) === String(habit.id) && String(entry.data || '').slice(0, 10) === today)) : [...currentEntries, { id: id('hr'), habito_id: habit.id, data: today, valor: Number(habit.meta || 1), criado_em: new Date().toISOString() }] }
    })
  }

  function save(event: FormEvent) {
    event.preventDefault()
    if (!draft || !String(draft.nome || '').trim()) return
    const next = { id: draft.id || id('hab'), nome: String(draft.nome).trim(), meta: Number(draft.meta || 1), unidade: draft.unidade || '', hora: draft.hora || '', cor_hex: draft.cor_hex || '#718269', icone: draft.icone || 'star', ocultar_agenda: draft.ocultar_agenda === true, ativo: true, criado_em: draft.criado_em || new Date().toISOString() }
    commit(current => ({ ...current, habits: rows(current.habits).some(item => String(item.id) === String(next.id)) ? rows(current.habits).map(item => String(item.id) === String(next.id) ? { ...item, ...next } : item) : [...rows(current.habits), next] }))
    setDraft(null)
  }

  function remove() {
    if (!draft || !confirm('Excluir este hábito e seus registros?')) return
    commit(current => ({ ...current, habits: rows(current.habits).filter(item => String(item.id) !== String(draft.id)), habitEntries: rows(current.habitEntries).filter(item => String(item.habito_id) !== String(draft.id)) }))
    setDraft(null)
  }

  return <>
    <AreaToolbar onAdd={() => setDraft({ meta: 1, cor_hex: '#718269', icone: 'star', hora: '', unidade: '' })} addLabel="Hábito" />
    <div className={styles.areaList}>{habits.map(habit => <div className={styles.areaRow} key={String(habit.id)}><button className={styles.areaCheck} data-done={done(habit.id)} onClick={() => toggle(habit)}>{done(habit.id) ? '✓' : ''}</button><button className={styles.areaRowBody} onClick={() => setDraft({ ...habit })}><strong>{habit.nome || 'Hábito'}</strong><span>{habit.meta || 1} {habit.unidade || 'vez por dia'}{habit.hora ? ` · ${habit.hora}` : ''}</span></button><i style={{ background: habit.cor_hex || '#718269' }} /></div>)}</div>
    {!habits.length && <Empty title="Nenhum hábito" text="Crie rotinas que também poderão aparecer em Hoje." />}
    {draft && <Editor title={draft.id ? 'Editar hábito' : 'Novo hábito'} onClose={() => setDraft(null)} onDelete={draft.id ? remove : undefined} onSubmit={save}><Field label="Nome" wide><input autoFocus value={draft.nome || ''} onChange={event => setDraft({ ...draft, nome: event.target.value })} /></Field><Field label="Meta"><input type="number" min="1" value={draft.meta || 1} onChange={event => setDraft({ ...draft, meta: event.target.value })} /></Field><Field label="Unidade"><input value={draft.unidade || ''} placeholder="vezes, copos..." onChange={event => setDraft({ ...draft, unidade: event.target.value })} /></Field><Field label="Horário"><input type="time" value={draft.hora || ''} onChange={event => setDraft({ ...draft, hora: event.target.value })} /></Field><Field label="Cor"><input type="color" value={draft.cor_hex || '#718269'} onChange={event => setDraft({ ...draft, cor_hex: event.target.value })} /></Field><label className={styles.areaToggle}><input type="checkbox" checked={draft.ocultar_agenda === true} onChange={event => setDraft({ ...draft, ocultar_agenda: event.target.checked })} /><span>Não mostrar em Hoje</span></label></Editor>}
  </>
}

function Goals({ state, commit }: Pick<Props, 'state' | 'commit'>) {
  const goals = rows(state.goals)
  const categories = rows(state.goalCategories)
  const [tab, setTab] = useState('Ativas')
  const [draft, setDraft] = useState<Row | null>(null)
  const [categoryDraft, setCategoryDraft] = useState<Row | null>(null)
  const visible = goals.filter(goal => tab === 'Concluídas' ? goal.status === 'Concluída' : goal.status !== 'Concluída')

  function save(event: FormEvent) {
    event.preventDefault()
    if (!draft || !String(draft.titulo || '').trim()) return
    const milestones = String(draft.milestoneText || '').split('\n').map(value => value.trim()).filter(Boolean).map((titulo, index) => ({ id: draft.milestones?.[index]?.id || id('passo'), titulo, done: draft.milestones?.[index]?.done === true }))
    const next = { ...draft, id: draft.id || id('meta'), titulo: String(draft.titulo).trim(), descricao: draft.descricao || '', categoria: draft.categoria || '', status: draft.status || 'Em Andamento', prazo: draft.prazo || '', progresso_label: milestones.length ? 'passos' : draft.progresso_label || 'Progresso', progresso_atual: milestones.length ? milestones.filter(item => item.done).length : Number(draft.progresso_atual || 0), progresso_total: milestones.length ? milestones.length : Number(draft.progresso_total || 100), milestones, anexos: draft.anexos || [] }
    delete next.milestoneText
    commit(current => ({ ...current, goals: rows(current.goals).some(item => String(item.id) === String(next.id)) ? rows(current.goals).map(item => String(item.id) === String(next.id) ? next : item) : [next, ...rows(current.goals)] }))
    setDraft(null)
  }

  function remove() {
    if (!draft || !confirm('Excluir esta meta permanentemente?')) return
    commit(current => ({ ...current, goals: rows(current.goals).filter(item => String(item.id) !== String(draft.id)) }))
    setDraft(null)
  }

  function advance(goal: Row) {
    const total = Number(goal.progresso_total || 100)
    commit(current => ({ ...current, goals: rows(current.goals).map(item => String(item.id) === String(goal.id) ? { ...item, progresso_atual: Math.min(total, Number(item.progresso_atual || 0) + 1), status: Number(item.progresso_atual || 0) + 1 >= total ? 'Concluída' : item.status } : item) }))
  }

  function saveCategory(event: FormEvent) {
    event.preventDefault()
    if (!categoryDraft || !String(categoryDraft.nome || '').trim()) return
    const next = { ...categoryDraft, id: categoryDraft.id || id('meta-cat'), nome: String(categoryDraft.nome).trim() }
    commit(current => {
      const previous = rows(current.goalCategories).find(item => String(item.id) === String(next.id))
      const nextCategories = rows(current.goalCategories).some(item => String(item.id) === String(next.id)) ? rows(current.goalCategories).map(item => String(item.id) === String(next.id) ? next : item) : [...rows(current.goalCategories), next]
      const nextGoals = previous && previous.nome !== next.nome ? rows(current.goals).map(goal => goal.categoria === previous.nome ? { ...goal, categoria: next.nome } : goal) : current.goals
      return { ...current, goalCategories: nextCategories, goals: nextGoals }
    })
    setCategoryDraft(null)
  }

  function removeCategory() {
    if (!categoryDraft || !confirm('Excluir esta categoria? As metas continuarão existindo.')) return
    commit(current => ({ ...current, goalCategories: rows(current.goalCategories).filter(item => String(item.id) !== String(categoryDraft.id)) }))
    setCategoryDraft(null)
  }

  return <>
    <AreaToolbar tabs={['Ativas', 'Concluídas', 'Categorias']} active={tab} onTab={setTab} onAdd={() => tab === 'Categorias' ? setCategoryDraft({ nome: '' }) : setDraft({ status: 'Em Andamento', progresso_atual: 0, progresso_total: 100, milestones: [] })} addLabel={tab === 'Categorias' ? 'Categoria' : 'Meta'} />
    {tab !== 'Categorias' && <div className={styles.areaList}>{visible.map(goal => { const total = Number(goal.progresso_total || 100); const current = Number(goal.progresso_atual || 0); const percent = total ? Math.min(100, Math.round(current / total * 100)) : 0; return <div className={styles.goalRow} key={String(goal.id)}><button className={styles.areaRowBody} onClick={() => setDraft({ ...goal, milestoneText: rows(goal.milestones).map(item => item.titulo).join('\n') })}><strong>{goal.titulo}</strong><span>{goal.categoria || 'Sem categoria'}{goal.prazo ? ` · ${fmtDate(goal.prazo)}` : ''}</span><div><i style={{ width: `${percent}%` }} /></div></button><b>{percent}%</b>{goal.status !== 'Concluída' && <button onClick={() => advance(goal)}>+1</button>}</div> })}</div>}
    {tab === 'Categorias' && <div className={styles.areaList}>{categories.map(category => <button className={styles.simpleRow} key={String(category.id)} onClick={() => setCategoryDraft({ ...category })}><span><strong>{category.nome}</strong><small>{goals.filter(goal => goal.categoria === category.nome).length} metas</small></span></button>)}</div>}
    {tab !== 'Categorias' && !visible.length && <Empty title="Nenhuma meta aqui" text="Transforme um resultado em progresso visível." />}
    {tab === 'Categorias' && !categories.length && <Empty title="Nenhuma categoria" text="Crie categorias para organizar suas metas." />}
    {draft && <Editor title={draft.id ? 'Editar meta' : 'Nova meta'} onClose={() => setDraft(null)} onDelete={draft.id ? remove : undefined} onSubmit={save}><Field label="Título" wide><input autoFocus value={draft.titulo || ''} onChange={event => setDraft({ ...draft, titulo: event.target.value })} /></Field><Field label="Descrição" wide><textarea rows={4} value={stripHtml(draft.descricao)} onChange={event => setDraft({ ...draft, descricao: event.target.value })} /></Field><Field label="Categoria"><input list="goal-categories" value={draft.categoria || ''} onChange={event => setDraft({ ...draft, categoria: event.target.value })} /><datalist id="goal-categories">{categories.map(category => <option key={String(category.id)} value={category.nome} />)}</datalist></Field><Field label="Status"><select value={draft.status || 'Em Andamento'} onChange={event => setDraft({ ...draft, status: event.target.value })}><option>Em Andamento</option><option>Atenção</option><option>Concluída</option></select></Field><Field label="Prazo"><input type="date" value={String(draft.prazo || '').slice(0, 10)} onChange={event => setDraft({ ...draft, prazo: event.target.value })} /></Field><Field label="Progresso atual"><input type="number" min="0" value={draft.progresso_atual || 0} onChange={event => setDraft({ ...draft, progresso_atual: event.target.value })} /></Field><Field label="Progresso total"><input type="number" min="1" value={draft.progresso_total || 100} onChange={event => setDraft({ ...draft, progresso_total: event.target.value })} /></Field><Field label="Passos, um por linha" wide><textarea rows={5} value={draft.milestoneText || ''} onChange={event => setDraft({ ...draft, milestoneText: event.target.value })} /></Field></Editor>}
    {categoryDraft && <Editor title={categoryDraft.id ? 'Editar categoria' : 'Nova categoria'} onClose={() => setCategoryDraft(null)} onDelete={categoryDraft.id ? removeCategory : undefined} onSubmit={saveCategory}><Field label="Nome" wide><input autoFocus value={categoryDraft.nome || ''} onChange={event => setCategoryDraft({ ...categoryDraft, nome: event.target.value })} /></Field></Editor>}
  </>
}

function Notes({ state, commit, googleRpc }: Pick<Props, 'state' | 'commit' | 'googleRpc'>) {
  const notes = rows(state.notes)
  const [tab, setTab] = useState('Notas')
  const [draft, setDraft] = useState<Row | null>(null)
  const [uploading, setUploading] = useState(false)
  const editorRef = useRef<HTMLDivElement>(null)
  const visible = notes.filter(note => tab === 'Notas' ? note.ativo !== false && note.arquivado !== true : tab === 'Arquivo' ? note.ativo !== false && note.arquivado === true : note.ativo === false)

  function save(event: FormEvent) {
    event.preventDefault()
    if (!draft) return
    const content = editorRef.current?.innerHTML || draft.conteudo || ''
    if (!String(draft.titulo || '').trim() && !stripHtml(content) && !rows(draft.anexos).length) return setDraft(null)
    const next = { ...draft, id: draft.id || id('nota'), titulo: String(draft.titulo || '').trim(), conteudo: content, data: new Date().toISOString(), fixado: draft.fixado === true, tamanho: draft.tamanho || 'normal', ativo: draft.ativo !== false, arquivado: draft.arquivado === true, anexos: rows(draft.anexos), ordem: Number(draft.ordem || 0) }
    commit(current => ({ ...current, notes: rows(current.notes).some(item => String(item.id) === String(next.id)) ? rows(current.notes).map(item => String(item.id) === String(next.id) ? next : item) : [next, ...rows(current.notes)] }))
    setDraft(null)
  }

  function action(kind: 'archive' | 'restore' | 'trash' | 'delete' | 'pin') {
    if (!draft) return
    if (kind === 'delete' && !confirm('Excluir esta nota permanentemente?')) return
    commit(current => ({ ...current, notes: kind === 'delete' ? rows(current.notes).filter(note => String(note.id) !== String(draft.id)) : rows(current.notes).map(note => String(note.id) === String(draft.id) ? { ...note, arquivado: kind === 'archive' ? true : kind === 'restore' ? false : note.arquivado, ativo: kind === 'trash' ? false : kind === 'restore' ? true : note.ativo, fixado: kind === 'pin' ? !note.fixado : note.fixado } : note) }))
    setDraft(null)
  }

  async function upload(file?: File) {
    if (!file || !draft) return
    setUploading(true)
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = reject; reader.readAsDataURL(file) })
      const result = await googleRpc('salvarAnexoDrive', [dataUrl, file.name, file.type])
      const item = result?.item || result
      setDraft(current => current ? { ...current, anexos: [...rows(current.anexos), { idDrive: item.id || item.idDrive, nome: item.name || item.nome || file.name, tipo: item.tipo || file.type, url: item.url || item.webViewLink || '' }] } : current)
    } finally { setUploading(false) }
  }

  return <>
    <AreaToolbar tabs={['Notas', 'Arquivo', 'Lixeira']} active={tab} onTab={setTab} onAdd={() => setDraft({ titulo: '', conteudo: '', ativo: true, arquivado: false, fixado: false, anexos: [] })} addLabel="Nota" />
    <div className={styles.areaList}>{visible.sort((a, b) => Number(b.fixado) - Number(a.fixado) || String(b.data || '').localeCompare(String(a.data || ''))).map(note => <button className={styles.noteRow} key={String(note.id)} onClick={() => setDraft({ ...note })}><span>{note.fixado ? '●' : '○'}</span><span><strong>{note.titulo || 'Sem título'}</strong><small>{stripHtml(note.conteudo).slice(0, 120) || 'Nota sem texto'}{rows(note.anexos).length ? ` · ${rows(note.anexos).length} anexo(s)` : ''}</small></span><time>{fmtDate(note.data)}</time></button>)}</div>
    {!visible.length && <Empty title="Nenhuma nota aqui" text="Registre ideias sem sair do fluxo." />}
    {draft && <Editor title={draft.id ? 'Editar nota' : 'Nova nota'} onClose={() => setDraft(null)} onDelete={draft.id ? () => action(tab === 'Lixeira' ? 'delete' : 'trash') : undefined} onSubmit={save}><Field label="Título" wide><input autoFocus value={draft.titulo || ''} onChange={event => setDraft({ ...draft, titulo: event.target.value })} /></Field><Field label="Conteúdo" wide><div key={String(draft.id || 'new')} ref={editorRef} className={styles.richEditor} contentEditable suppressContentEditableWarning dangerouslySetInnerHTML={{ __html: String(draft.conteudo || '') }} /></Field><div className={styles.noteActions}><button type="button" onClick={() => action('pin')}>{draft.fixado ? 'Desfixar' : 'Fixar'}</button>{draft.ativo === false ? <button type="button" onClick={() => action('restore')}>Restaurar</button> : draft.arquivado ? <button type="button" onClick={() => action('restore')}>Desarquivar</button> : <button type="button" onClick={() => action('archive')}>Arquivar</button>}<label>{uploading ? 'Enviando...' : 'Anexar arquivo'}<input type="file" hidden disabled={uploading} onChange={event => void upload(event.target.files?.[0])} /></label></div>{rows(draft.anexos).length > 0 && <div className={styles.attachmentList}>{rows(draft.anexos).map((file, index) => <div key={`${file.idDrive}-${index}`}><a href={file.url || '#'} target="_blank" rel="noreferrer">{file.nome || 'Arquivo'}</a><button type="button" onClick={() => setDraft({ ...draft, anexos: rows(draft.anexos).filter((_, position) => position !== index) })}>×</button></div>)}</div>}</Editor>}
  </>
}

function Finance({ state, today, commit }: Pick<Props, 'state' | 'today' | 'commit'>) {
  const finance = state.finance || {}
  const transactions = rows(finance.transactions)
  const accounts = rows(finance.accounts)
  const cards = rows(finance.cards)
  const categories = rows(finance.categories)
  const fixed = rows(finance.fixed)
  const [tab, setTab] = useState('Lançamentos')
  const [draft, setDraft] = useState<Row | null>(null)
  const [kind, setKind] = useState<'transaction' | 'account' | 'card' | 'category' | 'fixed'>('transaction')
  const balance = transactions.filter(item => item.status === 'pago' && !item.ignorar_calculo).reduce((sum, item) => sum + (item.tipo === 'receita' ? Number(item.valor_pago || item.valor || 0) : -Number(item.valor_pago || item.valor || 0)), 0)

  function openNew() {
    if (tab === 'Contas') { setKind('account'); setDraft({ nome: '', saldo_inicial: 0, cor: '#718269' }) }
    else if (tab === 'Cartões') { setKind('card'); setDraft({ nome: '', limite: 0, fechamento: 1, vencimento: 10, cor: '#7b8390' }) }
    else if (tab === 'Categorias') { setKind('category'); setDraft({ nome: '' }) }
    else if (tab === 'Fixos') { setKind('fixed'); setDraft({ titulo: '', valor: 0, tipo: 'despesa', dia_mes: Number(today.slice(8)), mes_inicio: today.slice(0, 7), ativo: true }) }
    else { setKind('transaction'); setDraft({ titulo: '', valor: 0, tipo: 'despesa', data: today, status: 'pendente', recorrencia: 'unico', parcelas: 2, pagamentos: [] }) }
  }

  function collectionKey() { return kind === 'transaction' ? 'transactions' : kind === 'account' ? 'accounts' : kind === 'card' ? 'cards' : kind === 'category' ? 'categories' : 'fixed' }

  function save(event: FormEvent) {
    event.preventDefault()
    if (!draft || !String(draft.nome || draft.titulo || '').trim()) return
    commit(current => {
      const currentFinance = { ...(current.finance || {}) }
      const key = collectionKey()
      const collection = rows(currentFinance[key])
      if (kind === 'transaction' && draft.recorrencia === 'parcelado' && !draft.id) {
        const quantity = Math.max(2, Number(draft.parcelas || 2)); const lot = id('lote'); const baseDate = new Date(`${draft.data}T12:00:00`)
        const installments = Array.from({ length: quantity }, (_, index) => { const date = new Date(baseDate); date.setMonth(date.getMonth() + index); return { ...draft, id: id('fin'), lote_id: lot, titulo: `${draft.titulo} (${index + 1}/${quantity})`, valor: Number(draft.valor || 0) / quantity, data: date.toISOString().slice(0, 10), status: index === 0 ? draft.status : 'pendente', valor_pago: index === 0 && draft.status === 'pago' ? Number(draft.valor || 0) / quantity : 0 } })
        currentFinance.transactions = [...collection, ...installments]
      } else {
        const prefix = kind === 'transaction' ? 'fin' : kind === 'account' ? 'cta' : kind === 'card' ? 'crd' : kind === 'category' ? 'cat' : 'fix'
        const next = { ...draft, id: draft.id || id(prefix), valor: draft.valor === undefined ? undefined : Number(draft.valor || 0), valor_pago: kind === 'transaction' && draft.status === 'pago' ? Number(draft.valor || 0) : Number(draft.valor_pago || 0), ignorar_calculo: draft.ignorar_calculo === true }
        delete next.recorrencia; delete next.parcelas
        currentFinance[key] = collection.some(item => String(item.id) === String(next.id)) ? collection.map(item => String(item.id) === String(next.id) ? next : item) : [...collection, next]
      }
      return { ...current, finance: currentFinance }
    })
    setDraft(null)
  }

  function remove() {
    if (!draft || !confirm('Excluir este registro?')) return
    commit(current => { const next = { ...(current.finance || {}) }; const key = collectionKey(); next[key] = rows(next[key]).filter(item => String(item.id) !== String(draft.id)); if (kind === 'transaction' && draft.lote_id) next[key] = rows(next[key]).filter(item => String(item.lote_id) !== String(draft.lote_id)); return { ...current, finance: next } })
    setDraft(null)
  }

  function edit(type: typeof kind, item: Row) { setKind(type); setDraft({ ...item }) }
  function togglePaid(item: Row) { commit(current => ({ ...current, finance: { ...(current.finance || {}), transactions: rows(current.finance?.transactions).map(row => String(row.id) === String(item.id) ? { ...row, status: row.status === 'pago' ? 'pendente' : 'pago', valor_pago: row.status === 'pago' ? 0 : Number(row.valor || 0) } : row) } })) }

  const addLabel = tab === 'Lançamentos' ? 'Lançamento' : tab === 'Contas' ? 'Conta' : tab === 'Cartões' ? 'Cartão' : tab === 'Fixos' ? 'Fixo mensal' : 'Categoria'
  return <>
    <div className={styles.balanceLine}><span>Saldo registrado</span><strong>{money.format(balance)}</strong><small>{transactions.filter(item => item.status !== 'pago').length} pendentes</small></div>
    <AreaToolbar tabs={['Lançamentos', 'Fixos', 'Contas', 'Cartões', 'Categorias']} active={tab} onTab={setTab} onAdd={openNew} addLabel={addLabel} />
    {tab === 'Lançamentos' && <div className={styles.areaList}>{transactions.sort((a, b) => String(b.data).localeCompare(String(a.data))).map(item => <div className={styles.financeRow} key={String(item.id)}><button data-paid={item.status === 'pago'} onClick={() => togglePaid(item)}>{item.status === 'pago' ? '✓' : ''}</button><button onClick={() => edit('transaction', item)}><strong>{item.titulo}</strong><span>{fmtDate(item.data)} · {item.categoria || 'Sem categoria'}{item.lote_id ? ' · Parcelado' : ''}</span></button><b data-expense={item.tipo !== 'receita'}>{item.tipo === 'receita' ? '+' : '−'} {money.format(Number(item.valor || 0))}</b></div>)}</div>}
    {tab === 'Fixos' && <div className={styles.areaList}>{fixed.map(item => <button className={styles.simpleRow} key={String(item.id)} onClick={() => edit('fixed', item)}><span><strong>{item.titulo}</strong><small>Todo dia {item.dia_mes || 1} · {item.categoria || 'Sem categoria'}</small></span><b>{money.format(Number(item.valor || 0))}</b></button>)}</div>}
    {tab === 'Contas' && <div className={styles.areaList}>{accounts.map(item => <button className={styles.simpleRow} key={String(item.id)} onClick={() => edit('account', item)}><i style={{ background: item.cor || '#718269' }} /><span><strong>{item.nome}</strong><small>Saldo inicial</small></span><b>{money.format(Number(item.saldo_inicial || 0))}</b></button>)}</div>}
    {tab === 'Cartões' && <div className={styles.areaList}>{cards.map(item => <button className={styles.simpleRow} key={String(item.id)} onClick={() => edit('card', item)}><i style={{ background: item.cor || '#7b8390' }} /><span><strong>{item.nome}</strong><small>Fecha dia {item.fechamento || '—'} · vence dia {item.vencimento || '—'}</small></span><b>{money.format(Number(item.limite || 0))}</b></button>)}</div>}
    {tab === 'Categorias' && <div className={styles.areaList}>{categories.map(item => <button className={styles.simpleRow} key={String(item.id)} onClick={() => edit('category', item)}><span><strong>{item.nome}</strong><small>{transactions.filter(transaction => transaction.categoria === item.nome).length} lançamentos</small></span></button>)}</div>}
    {((tab === 'Lançamentos' && !transactions.length) || (tab === 'Fixos' && !fixed.length) || (tab === 'Contas' && !accounts.length) || (tab === 'Cartões' && !cards.length) || (tab === 'Categorias' && !categories.length)) && <Empty title="Nada cadastrado" text="Adicione o primeiro item desta seção." />}
    {draft && <Editor title={`${draft.id ? 'Editar' : 'Novo'} ${addLabel.toLowerCase()}`} onClose={() => setDraft(null)} onDelete={draft.id ? remove : undefined} onSubmit={save}>
      {(kind === 'transaction' || kind === 'fixed') && <><Field label="Título" wide><input autoFocus value={draft.titulo || ''} onChange={event => setDraft({ ...draft, titulo: event.target.value })} /></Field><Field label="Tipo"><select value={draft.tipo || 'despesa'} onChange={event => setDraft({ ...draft, tipo: event.target.value })}><option value="despesa">Despesa</option><option value="receita">Receita</option></select></Field><Field label="Valor"><input type="number" step="0.01" value={draft.valor || 0} onChange={event => setDraft({ ...draft, valor: event.target.value })} /></Field><Field label="Categoria"><input list="finance-categories" value={draft.categoria || ''} onChange={event => setDraft({ ...draft, categoria: event.target.value })} /><datalist id="finance-categories">{categories.map(category => <option value={category.nome} key={String(category.id)} />)}</datalist></Field><Field label="Conta"><select value={draft.conta_id || ''} onChange={event => setDraft({ ...draft, conta_id: event.target.value })}><option value="">Sem conta</option>{accounts.map(account => <option value={account.id} key={String(account.id)}>{account.nome}</option>)}{cards.map(card => <option value={`card|${card.id}`} key={String(card.id)}>{card.nome}</option>)}</select></Field></>}
      {kind === 'transaction' && <><Field label="Data"><input type="date" value={draft.data || today} onChange={event => setDraft({ ...draft, data: event.target.value })} /></Field><Field label="Status"><select value={draft.status || 'pendente'} onChange={event => setDraft({ ...draft, status: event.target.value })}><option value="pendente">Pendente</option><option value="pago">Pago</option></select></Field>{!draft.id && <Field label="Recorrência"><select value={draft.recorrencia || 'unico'} onChange={event => setDraft({ ...draft, recorrencia: event.target.value })}><option value="unico">Único</option><option value="parcelado">Parcelado</option></select></Field>}{draft.recorrencia === 'parcelado' && !draft.id && <Field label="Parcelas"><input type="number" min="2" value={draft.parcelas || 2} onChange={event => setDraft({ ...draft, parcelas: event.target.value })} /></Field>}<Field label="Observação" wide><textarea rows={3} value={stripHtml(draft.observacao)} onChange={event => setDraft({ ...draft, observacao: event.target.value })} /></Field><label className={styles.areaToggle}><input type="checkbox" checked={draft.ignorar_calculo === true} onChange={event => setDraft({ ...draft, ignorar_calculo: event.target.checked })} /><span>Ignorar nos cálculos</span></label></>}
      {kind === 'fixed' && <><Field label="Dia do mês"><input type="number" min="1" max="31" value={draft.dia_mes || 1} onChange={event => setDraft({ ...draft, dia_mes: Number(event.target.value) })} /></Field><Field label="Início"><input type="month" value={draft.mes_inicio || today.slice(0, 7)} onChange={event => setDraft({ ...draft, mes_inicio: event.target.value })} /></Field><Field label="Fim opcional"><input type="month" value={draft.mes_fim || ''} onChange={event => setDraft({ ...draft, mes_fim: event.target.value })} /></Field></>}
      {kind === 'account' && <><Field label="Nome" wide><input autoFocus value={draft.nome || ''} onChange={event => setDraft({ ...draft, nome: event.target.value })} /></Field><Field label="Saldo inicial"><input type="number" step="0.01" value={draft.saldo_inicial || 0} onChange={event => setDraft({ ...draft, saldo_inicial: Number(event.target.value) })} /></Field><Field label="Cor"><input type="color" value={draft.cor || '#718269'} onChange={event => setDraft({ ...draft, cor: event.target.value })} /></Field></>}
      {kind === 'card' && <><Field label="Nome" wide><input autoFocus value={draft.nome || ''} onChange={event => setDraft({ ...draft, nome: event.target.value })} /></Field><Field label="Limite"><input type="number" step="0.01" value={draft.limite || 0} onChange={event => setDraft({ ...draft, limite: Number(event.target.value) })} /></Field><Field label="Fechamento"><input type="number" min="1" max="31" value={draft.fechamento || 1} onChange={event => setDraft({ ...draft, fechamento: Number(event.target.value) })} /></Field><Field label="Vencimento"><input type="number" min="1" max="31" value={draft.vencimento || 10} onChange={event => setDraft({ ...draft, vencimento: Number(event.target.value) })} /></Field><Field label="Conta de pagamento"><select value={draft.conta_id || ''} onChange={event => setDraft({ ...draft, conta_id: event.target.value })}><option value="">Nenhuma</option>{accounts.map(account => <option value={account.id} key={String(account.id)}>{account.nome}</option>)}</select></Field><Field label="Cor"><input type="color" value={draft.cor || '#7b8390'} onChange={event => setDraft({ ...draft, cor: event.target.value })} /></Field></>}
      {kind === 'category' && <Field label="Nome" wide><input autoFocus value={draft.nome || ''} onChange={event => setDraft({ ...draft, nome: event.target.value })} /></Field>}
    </Editor>}
  </>
}

function Health({ state, today, commit }: Pick<Props, 'state' | 'today' | 'commit'>) {
  const health = state.health || {}
  const trackers = rows(health.trackers)
  const library = rows(health.library)
  const diary = (health.diary || {}) as Record<string, Row>
  const goals = (health.goals || {}) as Row
  const day = diary[today] || { sono: {}, treinos: [], nutricao: [], suplementos: [], alertas: [] }
  const [tab, setTab] = useState('Diário')
  const [draft, setDraft] = useState<Row | null>(null)
  const [kind, setKind] = useState<'log' | 'tracker' | 'library' | 'goals'>('log')

  function openNew() {
    if (tab === 'Diário') { setKind('log'); setDraft({ modulo: 'nutricao', nome: '', hora: new Date().toTimeString().slice(0, 5), valor: '' }) }
    else if (tab === 'Variáveis') { setKind('tracker'); setDraft({ nome: '', categoria: 'Geral', unidade: '', min: '', max: '' }) }
    else if (tab === 'Biblioteca') { setKind('library'); setDraft({ nome: '', modulo: 'nutricao', base: 100, kcal: 0, p: 0, c: 0, g: 0, estoque: 0, composicao: [] }) }
    else { setKind('goals'); setDraft({ ...goals }) }
  }

  function save(event: FormEvent) {
    event.preventDefault()
    if (!draft) return
    commit(current => {
      const currentHealth = { ...(current.health || {}) } as Row
      if (kind === 'goals') currentHealth.goals = { ...draft }
      if (kind === 'tracker') { const list = rows(currentHealth.trackers); const next = { ...draft, id: draft.id || id('rast') }; currentHealth.trackers = list.some(item => String(item.id) === String(next.id)) ? list.map(item => String(item.id) === String(next.id) ? next : item) : [...list, next] }
      if (kind === 'library') { const list = rows(currentHealth.library); const next = { ...draft, id: draft.id || id('bib') }; currentHealth.library = list.some(item => String(item.id) === String(next.id)) ? list.map(item => String(item.id) === String(next.id) ? next : item) : [...list, next] }
      if (kind === 'log') {
        const allDiary = { ...(currentHealth.diary || {}) }; const currentDay = { ...(allDiary[today] || { sono: {}, treinos: [], nutricao: [], suplementos: [], alertas: [] }) }
        if (draft.modulo === 'sono') currentDay.sono = { deitar: draft.deitar || '', acordar: draft.acordar || '', min: Number(draft.min || 0), rem: Number(draft.rem || 0), prof: Number(draft.prof || 0), score: Number(draft.score || 0) }
        else { const key = draft.modulo === 'treino' ? 'treinos' : draft.modulo === 'suplemento' ? 'suplementos' : 'nutricao'; currentDay[key] = [...rows(currentDay[key]), { idLog: Date.now(), hora: draft.hora, nome: draft.nome, valor: draft.valor, itens: draft.itens || [] }] }
        allDiary[today] = currentDay; currentHealth.diary = allDiary
      }
      return { ...current, health: currentHealth }
    })
    setDraft(null)
  }

  function remove(type: 'tracker' | 'library', itemId: unknown) {
    if (!confirm('Excluir este item?')) return
    commit(current => ({ ...current, health: { ...(current.health || {}), [type === 'tracker' ? 'trackers' : 'library']: rows((current.health || {})[type === 'tracker' ? 'trackers' : 'library']).filter(item => String(item.id) !== String(itemId)) } }))
    setDraft(null)
  }

  const logs = [...rows(day.treinos).map(item => ({ ...item, tipo: 'Treino' })), ...rows(day.nutricao).map(item => ({ ...item, tipo: 'Nutrição' })), ...rows(day.suplementos).map(item => ({ ...item, tipo: 'Suplemento' }))].sort((a, b) => String(a.hora).localeCompare(String(b.hora)))
  return <>
    <AreaToolbar tabs={['Diário', 'Metas', 'Variáveis', 'Biblioteca']} active={tab} onTab={setTab} onAdd={openNew} addLabel={tab === 'Diário' ? 'Registro' : tab === 'Metas' ? 'Editar metas' : tab === 'Variáveis' ? 'Variável' : 'Item'} />
    {tab === 'Diário' && <div className={styles.areaList}>{day.sono?.deitar && <div className={styles.healthRow}><span>☾</span><span><strong>Sono</strong><small>{day.sono.deitar} → {day.sono.acordar || '—'} · {day.sono.score || 0} pontos</small></span></div>}{logs.map(log => <div className={styles.healthRow} key={String(log.idLog)}><span>＋</span><span><strong>{log.nome || log.tipo}</strong><small>{log.tipo} · {log.hora || 'Sem horário'}{log.valor ? ` · ${log.valor}` : ''}</small></span></div>)}{!day.sono?.deitar && !logs.length && <Empty title="Sem registros hoje" text="Registre sono, treino, nutrição ou suplementos." />}</div>}
    {tab === 'Metas' && <div className={styles.healthGoals}>{[['Água', goals.agua, 'ml'], ['Calorias', goals.kcal, 'kcal'], ['Proteína', goals.p, 'g'], ['Carboidratos', goals.c, 'g'], ['Gordura', goals.g, 'g'], ['Sono', goals.horasIdeais, 'h']].map(([label, value, unit]) => <div key={String(label)}><span>{label}</span><strong>{value || '—'} <small>{unit}</small></strong></div>)}</div>}
    {tab === 'Variáveis' && <div className={styles.areaList}>{trackers.map(item => <button className={styles.simpleRow} key={String(item.id)} onClick={() => { setKind('tracker'); setDraft({ ...item }) }}><span><strong>{item.nome}</strong><small>{item.categoria || 'Geral'} · {item.unidade || 'sem unidade'}{item.min !== '' ? ` · mín. ${item.min}` : ''}{item.max !== '' ? ` · máx. ${item.max}` : ''}</small></span></button>)}</div>}
    {tab === 'Biblioteca' && <div className={styles.areaList}>{library.map(item => <button className={styles.simpleRow} key={String(item.id)} onClick={() => { setKind('library'); setDraft({ ...item }) }}><span><strong>{item.nome}</strong><small>{item.modulo || 'Item'}{item.kcal ? ` · ${item.kcal} kcal` : ''}{item.estoque ? ` · estoque ${item.estoque}` : ''}</small></span></button>)}</div>}
    {draft && <Editor title={kind === 'log' ? 'Novo registro' : kind === 'goals' ? 'Metas de saúde' : draft.id ? 'Editar item' : 'Novo item'} onClose={() => setDraft(null)} onDelete={draft.id && (kind === 'tracker' || kind === 'library') ? () => remove(kind, draft.id) : undefined} onSubmit={save}>
      {kind === 'log' && <><Field label="Tipo"><select value={draft.modulo || 'nutricao'} onChange={event => setDraft({ ...draft, modulo: event.target.value })}><option value="sono">Sono</option><option value="treino">Treino</option><option value="nutricao">Nutrição</option><option value="suplemento">Suplemento</option></select></Field>{draft.modulo === 'sono' ? <><Field label="Deitar"><input type="time" value={draft.deitar || ''} onChange={event => setDraft({ ...draft, deitar: event.target.value })} /></Field><Field label="Acordar"><input type="time" value={draft.acordar || ''} onChange={event => setDraft({ ...draft, acordar: event.target.value })} /></Field><Field label="Pontuação"><input type="number" min="0" max="100" value={draft.score || 0} onChange={event => setDraft({ ...draft, score: Number(event.target.value) })} /></Field></> : <><Field label="Nome" wide><input autoFocus value={draft.nome || ''} onChange={event => setDraft({ ...draft, nome: event.target.value })} /></Field><Field label="Horário"><input type="time" value={draft.hora || ''} onChange={event => setDraft({ ...draft, hora: event.target.value })} /></Field><Field label="Quantidade/detalhe"><input value={draft.valor || ''} onChange={event => setDraft({ ...draft, valor: event.target.value })} /></Field></>}</>}
      {kind === 'goals' && <><Field label="Água (ml)"><input type="number" value={draft.agua || 0} onChange={event => setDraft({ ...draft, agua: Number(event.target.value) })} /></Field><Field label="Calorias"><input type="number" value={draft.kcal || 0} onChange={event => setDraft({ ...draft, kcal: Number(event.target.value) })} /></Field><Field label="Proteína (g)"><input type="number" value={draft.p || 0} onChange={event => setDraft({ ...draft, p: Number(event.target.value) })} /></Field><Field label="Carboidratos (g)"><input type="number" value={draft.c || 0} onChange={event => setDraft({ ...draft, c: Number(event.target.value) })} /></Field><Field label="Gordura (g)"><input type="number" value={draft.g || 0} onChange={event => setDraft({ ...draft, g: Number(event.target.value) })} /></Field><Field label="Fibra (g)"><input type="number" value={draft.fibra || 0} onChange={event => setDraft({ ...draft, fibra: Number(event.target.value) })} /></Field><Field label="Sódio (mg)"><input type="number" value={draft.sodio || 0} onChange={event => setDraft({ ...draft, sodio: Number(event.target.value) })} /></Field><Field label="Açúcar (g)"><input type="number" value={draft.acucar || 0} onChange={event => setDraft({ ...draft, acucar: Number(event.target.value) })} /></Field><Field label="Horas de sono"><input type="number" step="0.5" value={draft.horasIdeais || 8} onChange={event => setDraft({ ...draft, horasIdeais: Number(event.target.value) })} /></Field><Field label="Hora de deitar"><input type="time" value={draft.deitar || ''} onChange={event => setDraft({ ...draft, deitar: event.target.value })} /></Field></>}
      {kind === 'tracker' && <><Field label="Nome" wide><input autoFocus value={draft.nome || ''} onChange={event => setDraft({ ...draft, nome: event.target.value })} /></Field><Field label="Categoria"><input value={draft.categoria || ''} onChange={event => setDraft({ ...draft, categoria: event.target.value })} /></Field><Field label="Unidade"><input value={draft.unidade || ''} onChange={event => setDraft({ ...draft, unidade: event.target.value })} /></Field><Field label="Mínimo"><input type="number" value={draft.min ?? ''} onChange={event => setDraft({ ...draft, min: event.target.value })} /></Field><Field label="Máximo"><input type="number" value={draft.max ?? ''} onChange={event => setDraft({ ...draft, max: event.target.value })} /></Field></>}
      {kind === 'library' && <><Field label="Nome" wide><input autoFocus value={draft.nome || ''} onChange={event => setDraft({ ...draft, nome: event.target.value })} /></Field><Field label="Módulo"><select value={draft.modulo || 'nutricao'} onChange={event => setDraft({ ...draft, modulo: event.target.value })}><option value="nutricao">Nutrição</option><option value="treino">Treino</option><option value="suplemento">Suplemento</option><option value="plano_treino">Plano de treino</option></select></Field><Field label="Base"><input type="number" value={draft.base || 100} onChange={event => setDraft({ ...draft, base: Number(event.target.value) })} /></Field><Field label="Calorias"><input type="number" value={draft.kcal || 0} onChange={event => setDraft({ ...draft, kcal: Number(event.target.value) })} /></Field><Field label="Proteína"><input type="number" value={draft.p || 0} onChange={event => setDraft({ ...draft, p: Number(event.target.value) })} /></Field><Field label="Carboidratos"><input type="number" value={draft.c || 0} onChange={event => setDraft({ ...draft, c: Number(event.target.value) })} /></Field><Field label="Gordura"><input type="number" value={draft.g || 0} onChange={event => setDraft({ ...draft, g: Number(event.target.value) })} /></Field><Field label="Estoque"><input type="number" value={draft.estoque || 0} onChange={event => setDraft({ ...draft, estoque: Number(event.target.value) })} /></Field></>}
    </Editor>}
  </>
}

function Files({ googleRpc }: Pick<Props, 'googleRpc'>) {
  const [folderId, setFolderId] = useState('root')
  const [items, setItems] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  async function load(target = folderId) {
    setLoading(true)
    try { const result = await googleRpc('getDriveContent', [target]); setItems(rows(result?.items)) } catch { setItems([]) } finally { setLoading(false) }
  }
  useEffect(() => { void load(folderId) }, [folderId])

  async function createFolder() { const name = prompt('Nome da nova pasta:'); if (!name?.trim()) return; setBusy(true); try { await googleRpc('criarPastaDriveHub', [name.trim(), folderId]); await load() } finally { setBusy(false) } }
  async function createText() { const raw = prompt('Nome do novo arquivo de texto:'); if (!raw?.trim()) return; const name = raw.trim().endsWith('.txt') ? raw.trim() : `${raw.trim()}.txt`; setBusy(true); try { await googleRpc('criarArquivoTextoDriveHub', [name, folderId]); await load() } finally { setBusy(false) } }
  async function upload(files?: FileList | null) { if (!files?.length) return; setBusy(true); try { for (const file of Array.from(files)) { const dataUrl = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = reject; reader.readAsDataURL(file) }); await googleRpc('uploadToDriveHub', [dataUrl, file.name, file.type, folderId]) } await load() } finally { setBusy(false); if (inputRef.current) inputRef.current.value = '' } }
  async function trash(item: Row) { if (!confirm(`Mover “${item.name || item.nome}” para a lixeira do Drive?`)) return; setItems(current => current.filter(row => String(row.id) !== String(item.id))); try { await googleRpc('trashDriveItem', [item.id]) } catch { await load() } }

  return <>
    <div className={styles.driveToolbar}><div><button disabled={folderId === 'root'} onClick={() => setFolderId('root')}>Meu Drive</button>{folderId !== 'root' && <span>/ Pasta</span>}</div><div><button disabled={busy} onClick={createFolder}>＋ Pasta</button><button disabled={busy} onClick={createText}>＋ Texto</button><button disabled={busy} onClick={() => inputRef.current?.click()}>{busy ? 'Enviando...' : 'Enviar arquivo'}</button><input ref={inputRef} type="file" multiple hidden onChange={event => void upload(event.target.files)} /></div></div>
    {loading ? <div className={styles.areaEmpty}>Carregando Google Drive...</div> : items.length ? <div className={styles.driveList}>{items.map(item => <div key={String(item.id)}><button onClick={() => item.tipo === 'folder' ? setFolderId(String(item.id)) : window.open(String(item.url || '#'), '_blank')}><span>{item.tipo === 'folder' ? '▰' : '▤'}</span><span><strong>{item.name || item.nome}</strong><small>{item.tipo === 'folder' ? 'Pasta' : `${Math.max(0, Number(item.tamanho || 0) / 1024).toFixed(1)} KB`}</small></span></button><button onClick={() => void trash(item)}>×</button></div>)}</div> : <Empty title="Esta pasta está vazia" text="Crie uma pasta, um texto ou envie um arquivo." />}
  </>
}

export function AreaView(props: Props) {
  if (props.view === 'habits') return <Habits state={props.state} today={props.today} commit={props.commit} />
  if (props.view === 'goals') return <Goals state={props.state} commit={props.commit} />
  if (props.view === 'notes') return <Notes state={props.state} commit={props.commit} googleRpc={props.googleRpc} />
  if (props.view === 'finance') return <Finance state={props.state} today={props.today} commit={props.commit} />
  if (props.view === 'health') return <Health state={props.state} today={props.today} commit={props.commit} />
  return <Files googleRpc={props.googleRpc} />
}
