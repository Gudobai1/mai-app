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
  createRequest?: string
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

function Habits({ state, today, commit, createRequest }: Pick<Props, 'state' | 'today' | 'commit' | 'createRequest'>) {
  const habits = rows(state.habits).filter(habit => habit.ativo !== false)
  const entries = rows(state.habitEntries)
  const [draft, setDraft] = useState<Row | null>(null)
  const [selectedDate, setSelectedDate] = useState(today)

  useEffect(() => { if (createRequest?.startsWith('habits:')) setDraft({ meta: 1, cor_hex: '#718269', icone: 'star', hora: '', unidade: '', dias_semana: [0, 1, 2, 3, 4, 5, 6] }) }, [createRequest])
  useEffect(() => { if (today && !selectedDate) setSelectedDate(today) }, [today, selectedDate])

  const done = (habitId: unknown, day = selectedDate) => entries.some(entry => String(entry.habito_id) === String(habitId) && String(entry.data || '').slice(0, 10) === day)
  const valueFor = (habitId: unknown, day = selectedDate) => entries.find(entry => String(entry.habito_id) === String(habitId) && String(entry.data || '').slice(0, 10) === day)?.valor

  function dayOffset(amount: number) { const date = new Date(`${selectedDate}T12:00:00`); date.setDate(date.getDate() + amount); setSelectedDate(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`) }

  function stats(habitId: unknown) {
    const set = new Set(entries.filter(entry => String(entry.habito_id) === String(habitId)).map(entry => String(entry.data).slice(0, 10)))
    let current = 0; const cursor = new Date(`${today}T12:00:00`)
    if (!set.has(today)) cursor.setDate(cursor.getDate() - 1)
    while (set.has(`${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(cursor.getDate()).padStart(2, '0')}`)) { current += 1; cursor.setDate(cursor.getDate() - 1) }
    const sorted = [...set].sort(); let best = 0; let run = 0; let previous = ''
    sorted.forEach(day => { if (!previous) run = 1; else { const diff = (new Date(`${day}T12:00:00`).getTime() - new Date(`${previous}T12:00:00`).getTime()) / 86_400_000; run = diff === 1 ? run + 1 : 1 } best = Math.max(best, run); previous = day })
    const from = new Date(`${today}T12:00:00`); from.setDate(from.getDate() - 29); const rate = Math.round([...set].filter(day => new Date(`${day}T12:00:00`) >= from).length / 30 * 100)
    return { current, best, rate }
  }

  function toggle(habit: Row) {
    const existing = done(habit.id)
    let value = Number(habit.meta || 1)
    if (!existing && (Number(habit.meta || 1) > 1 || habit.unidade)) {
      const answer = prompt(`Valor de “${habit.nome}” em ${new Date(`${selectedDate}T12:00:00`).toLocaleDateString('pt-BR')}:`, String(habit.meta || 1))
      if (answer === null) return
      value = Number(answer) || Number(habit.meta || 1)
    }
    commit(current => {
      const currentEntries = rows(current.habitEntries)
      const exists = currentEntries.some(entry => String(entry.habito_id) === String(habit.id) && String(entry.data || '').slice(0, 10) === selectedDate)
      return { ...current, habitEntries: exists ? currentEntries.filter(entry => !(String(entry.habito_id) === String(habit.id) && String(entry.data || '').slice(0, 10) === selectedDate)) : [...currentEntries, { id: id('hr'), habito_id: habit.id, data: selectedDate, valor: value, criado_em: new Date().toISOString() }] }
    })
  }

  function save(event: FormEvent) {
    event.preventDefault()
    if (!draft || !String(draft.nome || '').trim()) return
    const next = { ...draft, id: draft.id || id('hab'), nome: String(draft.nome).trim(), meta: Number(draft.meta || 1), unidade: draft.unidade || '', hora: draft.hora || '', cor_hex: draft.cor_hex || '#718269', icone: draft.icone || 'star', dias_semana: rows(draft.dias_semana).length ? draft.dias_semana : [0, 1, 2, 3, 4, 5, 6], ocultar_agenda: draft.ocultar_agenda === true, ativo: true, criado_em: draft.criado_em || new Date().toISOString() }
    commit(current => ({ ...current, habits: rows(current.habits).some(item => String(item.id) === String(next.id)) ? rows(current.habits).map(item => String(item.id) === String(next.id) ? { ...item, ...next } : item) : [...rows(current.habits), next] }))
    setDraft(null)
  }

  function remove() {
    if (!draft || !confirm('Excluir este hábito e seus registros?')) return
    commit(current => ({ ...current, habits: rows(current.habits).filter(item => String(item.id) !== String(draft.id)), habitEntries: rows(current.habitEntries).filter(item => String(item.habito_id) !== String(draft.id)) }))
    setDraft(null)
  }

  return <>
    <AreaToolbar onAdd={() => setDraft({ meta: 1, cor_hex: '#718269', icone: 'star', hora: '', unidade: '', dias_semana: [0, 1, 2, 3, 4, 5, 6] })} addLabel="Hábito" />
    <div className={styles.dateNavigator}><button onClick={() => dayOffset(-1)}>‹</button><button onClick={() => setSelectedDate(today)}><strong>{selectedDate === today ? 'Hoje' : fmtDate(selectedDate)}</strong><small>{selectedDate === today ? fmtDate(today) : 'Voltar para hoje'}</small></button><button onClick={() => dayOffset(1)}>›</button></div>
    <div className={styles.areaList}>{habits.map(habit => { const habitStats = stats(habit.id); return <div className={styles.habitFullRow} key={String(habit.id)}><button className={styles.areaCheck} data-done={done(habit.id)} onClick={() => toggle(habit)}>{done(habit.id) ? '✓' : ''}</button><button className={styles.areaRowBody} onClick={() => setDraft({ ...habit })}><strong>{habit.nome || 'Hábito'}</strong><span>{done(habit.id) ? `${valueFor(habit.id)} ${habit.unidade || ''} · ` : ''}{habit.meta || 1} {habit.unidade || 'vez por dia'}{habit.hora ? ` · ${habit.hora}` : ''}</span></button><div className={styles.habitStats}><span><b>{habitStats.current}</b> atual</span><span><b>{habitStats.best}</b> melhor</span><span><b>{habitStats.rate}%</b> 30 dias</span></div><i style={{ background: habit.cor_hex || '#718269' }} /></div> })}</div>
    {!habits.length && <Empty title="Nenhum hábito" text="Crie rotinas que também poderão aparecer em Hoje." />}
    {draft && <Editor title={draft.id ? 'Editar hábito' : 'Novo hábito'} onClose={() => setDraft(null)} onDelete={draft.id ? remove : undefined} onSubmit={save}><Field label="Nome" wide><input autoFocus value={draft.nome || ''} onChange={event => setDraft({ ...draft, nome: event.target.value })} /></Field><Field label="Meta"><input type="number" min="1" value={draft.meta || 1} onChange={event => setDraft({ ...draft, meta: event.target.value })} /></Field><Field label="Unidade"><input value={draft.unidade || ''} placeholder="vezes, copos..." onChange={event => setDraft({ ...draft, unidade: event.target.value })} /></Field><Field label="Horário"><input type="time" value={draft.hora || ''} onChange={event => setDraft({ ...draft, hora: event.target.value })} /></Field><Field label="Ícone"><select value={draft.icone || 'star'} onChange={event => setDraft({ ...draft, icone: event.target.value })}><option value="star">Estrela</option><option value="fitness_center">Treino</option><option value="water_drop">Água</option><option value="menu_book">Leitura</option><option value="self_improvement">Meditação</option></select></Field><Field label="Cor"><input type="color" value={draft.cor_hex || '#718269'} onChange={event => setDraft({ ...draft, cor_hex: event.target.value })} /></Field><Field label="Dias da semana" wide><div className={styles.weekdayPicker}>{['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map((label, day) => <button type="button" key={`${label}-${day}`} data-active={rows(draft.dias_semana).map(Number).includes(day)} onClick={() => setDraft({ ...draft, dias_semana: rows(draft.dias_semana).map(Number).includes(day) ? rows(draft.dias_semana).map(Number).filter(value => value !== day) : [...rows(draft.dias_semana).map(Number), day] })}>{label}</button>)}</div></Field><label className={styles.areaToggle}><input type="checkbox" checked={draft.ocultar_agenda === true} onChange={event => setDraft({ ...draft, ocultar_agenda: event.target.checked })} /><span>Não mostrar em Hoje e Em breve</span></label></Editor>}
  </>
}

function Goals({ state, commit, googleRpc, createRequest }: Pick<Props, 'state' | 'commit' | 'googleRpc' | 'createRequest'>) {
  const goals = rows(state.goals)
  const categories = rows(state.goalCategories)
  const [tab, setTab] = useState('Ativas')
  const [draft, setDraft] = useState<Row | null>(null)
  const [categoryDraft, setCategoryDraft] = useState<Row | null>(null)
  const [uploading, setUploading] = useState(false)
  const visible = goals.filter(goal => tab === 'Concluídas' ? goal.status === 'Concluída' : goal.status !== 'Concluída')

  useEffect(() => { if (createRequest?.startsWith('goals:')) { setTab('Ativas'); setDraft({ status: 'Em Andamento', progresso_atual: 0, progresso_total: 100, milestones: [], anexos: [], icone: 'flag' }) } }, [createRequest])

  function save(event: FormEvent) {
    event.preventDefault()
    if (!draft || !String(draft.titulo || '').trim()) return
    const milestones = rows(draft.milestones).filter(item => String(item.titulo || '').trim()).map(item => ({ ...item, id: item.id || id('passo'), titulo: String(item.titulo).trim(), done: item.done === true }))
    const next: Row = { ...draft, id: draft.id || id('meta'), titulo: String(draft.titulo).trim(), descricao: draft.descricao || '', categoria: draft.categoria || '', status: draft.status || 'Em Andamento', prazo: draft.prazo || '', progresso_label: milestones.length ? 'passos' : draft.progresso_label || 'Progresso', progresso_atual: milestones.length ? milestones.filter(item => item.done).length : Number(draft.progresso_atual || 0), progresso_total: milestones.length ? milestones.length : Number(draft.progresso_total || 100), milestones, anexos: draft.anexos || [] }
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
    const answer = prompt('Quanto deseja adicionar ao progresso?', '1')
    if (answer === null) return
    const amount = Number(answer) || 0
    commit(current => ({ ...current, goals: rows(current.goals).map(item => String(item.id) === String(goal.id) ? { ...item, progresso_atual: Math.max(0, Math.min(total, Number(item.progresso_atual || 0) + amount)), status: Number(item.progresso_atual || 0) + amount >= total ? 'Concluída' : item.status } : item) }))
  }

  function toggleMilestone(goal: Row, milestoneId: unknown) {
    commit(current => ({ ...current, goals: rows(current.goals).map(item => {
      if (String(item.id) !== String(goal.id)) return item
      const milestones = rows(item.milestones).map(milestone => String(milestone.id) === String(milestoneId) ? { ...milestone, done: !milestone.done } : milestone)
      const done = milestones.filter(milestone => milestone.done).length
      return { ...item, milestones, progresso_atual: done, progresso_total: milestones.length || item.progresso_total, status: milestones.length && done === milestones.length ? 'Concluída' : item.status === 'Concluída' ? 'Em Andamento' : item.status }
    }) }))
  }

  async function upload(file?: File) {
    if (!file || !draft) return
    setUploading(true)
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = reject; reader.readAsDataURL(file) })
      const result = await googleRpc('salvarAnexoDrive', [dataUrl, file.name, file.type]); const item = result?.item || result
      setDraft(current => current ? { ...current, anexos: [...rows(current.anexos), { idDrive: item.id, nome: item.name || item.nome || file.name, tipo: item.tipo || file.type, url: item.url || '' }] } : current)
    } finally { setUploading(false) }
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
    <AreaToolbar tabs={['Ativas', 'Concluídas', 'Categorias']} active={tab} onTab={setTab} onAdd={() => tab === 'Categorias' ? setCategoryDraft({ nome: '' }) : setDraft({ status: 'Em Andamento', progresso_atual: 0, progresso_total: 100, milestones: [], anexos: [], icone: 'flag' })} addLabel={tab === 'Categorias' ? 'Categoria' : 'Meta'} />
    {tab !== 'Categorias' && <div className={styles.areaList}>{visible.map(goal => { const total = Number(goal.progresso_total || 100); const current = Number(goal.progresso_atual || 0); const percent = total ? Math.min(100, Math.round(current / total * 100)) : 0; return <div className={styles.goalCard} key={String(goal.id)}><div className={styles.goalRow}><button className={styles.goalIcon}>{goal.icone === 'trophy' ? '★' : goal.icone === 'target' ? '◎' : '⚑'}</button><button className={styles.areaRowBody} onClick={() => setDraft({ ...goal })}><strong>{goal.titulo}</strong><span>{goal.categoria || 'Sem categoria'}{goal.prazo ? ` · ${fmtDate(goal.prazo)}` : ''}{rows(goal.anexos).length ? ` · ${rows(goal.anexos).length} anexo(s)` : ''}</span><div><i style={{ width: `${percent}%` }} /></div></button><b>{percent}%</b>{goal.status !== 'Concluída' && <button onClick={() => advance(goal)}>＋</button>}</div>{rows(goal.milestones).length > 0 && <div className={styles.goalMilestones}>{rows(goal.milestones).map(milestone => <button key={String(milestone.id)} data-done={milestone.done === true} onClick={() => toggleMilestone(goal, milestone.id)}><i>{milestone.done ? '✓' : ''}</i><span>{milestone.titulo}</span></button>)}</div>}</div> })}</div>}
    {tab === 'Categorias' && <div className={styles.areaList}>{categories.map(category => <button className={styles.simpleRow} key={String(category.id)} onClick={() => setCategoryDraft({ ...category })}><span><strong>{category.nome}</strong><small>{goals.filter(goal => goal.categoria === category.nome).length} metas</small></span></button>)}</div>}
    {tab !== 'Categorias' && !visible.length && <Empty title="Nenhuma meta aqui" text="Transforme um resultado em progresso visível." />}
    {tab === 'Categorias' && !categories.length && <Empty title="Nenhuma categoria" text="Crie categorias para organizar suas metas." />}
    {draft && <Editor title={draft.id ? 'Editar meta' : 'Nova meta'} onClose={() => setDraft(null)} onDelete={draft.id ? remove : undefined} onSubmit={save}><Field label="Título" wide><input autoFocus value={draft.titulo || ''} onChange={event => setDraft({ ...draft, titulo: event.target.value })} /></Field><Field label="Descrição" wide><textarea rows={4} value={String(draft.descricao || '')} onChange={event => setDraft({ ...draft, descricao: event.target.value })} /></Field><Field label="Categoria"><input list="goal-categories" value={draft.categoria || ''} onChange={event => setDraft({ ...draft, categoria: event.target.value })} /><datalist id="goal-categories">{categories.map(category => <option key={String(category.id)} value={category.nome} />)}</datalist></Field><Field label="Ícone"><select value={draft.icone || 'flag'} onChange={event => setDraft({ ...draft, icone: event.target.value })}><option value="flag">Bandeira</option><option value="target">Alvo</option><option value="trophy">Troféu</option></select></Field><Field label="Status"><select value={draft.status || 'Em Andamento'} onChange={event => setDraft({ ...draft, status: event.target.value })}><option>Em Andamento</option><option>Atenção</option><option>Concluída</option></select></Field><Field label="Prazo"><input type="date" value={String(draft.prazo || '').slice(0, 10)} onChange={event => setDraft({ ...draft, prazo: event.target.value })} /></Field><Field label="Progresso atual"><input type="number" min="0" value={draft.progresso_atual || 0} onChange={event => setDraft({ ...draft, progresso_atual: event.target.value })} /></Field><Field label="Progresso total"><input type="number" min="1" value={draft.progresso_total || 100} onChange={event => setDraft({ ...draft, progresso_total: event.target.value })} /></Field><Field label="Etapas" wide><div className={styles.milestoneEditor}>{rows(draft.milestones).map((milestone, index) => <div key={String(milestone.id || index)}><input type="checkbox" checked={milestone.done === true} onChange={event => setDraft({ ...draft, milestones: rows(draft.milestones).map((item, position) => position === index ? { ...item, done: event.target.checked } : item) })} /><input value={milestone.titulo || ''} onChange={event => setDraft({ ...draft, milestones: rows(draft.milestones).map((item, position) => position === index ? { ...item, titulo: event.target.value } : item) })} /><button type="button" onClick={() => setDraft({ ...draft, milestones: rows(draft.milestones).filter((_, position) => position !== index) })}>×</button></div>)}<button type="button" onClick={() => setDraft({ ...draft, milestones: [...rows(draft.milestones), { id: id('passo'), titulo: '', done: false }] })}>＋ Adicionar etapa</button></div></Field><Field label="Anexos" wide><div className={styles.attachmentList}>{rows(draft.anexos).map((file, index) => <div key={`${file.idDrive}-${index}`}><a href={file.url || '#'} target="_blank" rel="noreferrer">{file.nome || 'Arquivo'}</a><button type="button" onClick={() => setDraft({ ...draft, anexos: rows(draft.anexos).filter((_, position) => position !== index) })}>×</button></div>)}<label className={styles.uploadInline}>{uploading ? 'Enviando…' : '＋ Anexar arquivo'}<input type="file" hidden disabled={uploading} onChange={event => void upload(event.target.files?.[0])} /></label></div></Field></Editor>}
    {categoryDraft && <Editor title={categoryDraft.id ? 'Editar categoria' : 'Nova categoria'} onClose={() => setCategoryDraft(null)} onDelete={categoryDraft.id ? removeCategory : undefined} onSubmit={saveCategory}><Field label="Nome" wide><input autoFocus value={categoryDraft.nome || ''} onChange={event => setCategoryDraft({ ...categoryDraft, nome: event.target.value })} /></Field></Editor>}
  </>
}

function Notes({ state, commit, googleRpc, createRequest }: Pick<Props, 'state' | 'commit' | 'googleRpc' | 'createRequest'>) {
  const notes = rows(state.notes)
  const [tab, setTab] = useState('Notas')
  const [draft, setDraft] = useState<Row | null>(null)
  const [uploading, setUploading] = useState(false)
  const [query, setQuery] = useState('')
  const editorRef = useRef<HTMLDivElement>(null)
  const visible = notes.filter(note => (tab === 'Notas' ? note.ativo !== false && note.arquivado !== true : tab === 'Arquivo' ? note.ativo !== false && note.arquivado === true : note.ativo === false) && (!query.trim() || `${note.titulo} ${stripHtml(note.conteudo)}`.toLocaleLowerCase('pt-BR').includes(query.trim().toLocaleLowerCase('pt-BR'))))

  useEffect(() => { if (createRequest?.startsWith('notes:')) { setTab('Notas'); setDraft({ titulo: '', conteudo: '', ativo: true, arquivado: false, fixado: false, anexos: [], tamanho: 'normal' }) } }, [createRequest])

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

  function format(command: string, value?: string) {
    editorRef.current?.focus()
    document.execCommand(command, false, value)
  }

  function move(note: Row, direction: number) {
    const ordered = [...notes].sort((a, b) => Number(a.ordem || 0) - Number(b.ordem || 0))
    const index = ordered.findIndex(item => String(item.id) === String(note.id)); const target = index + direction
    if (index < 0 || target < 0 || target >= ordered.length) return
    ;[ordered[index], ordered[target]] = [ordered[target], ordered[index]]
    commit(current => ({ ...current, notes: rows(current.notes).map(item => ({ ...item, ordem: ordered.findIndex(sorted => String(sorted.id) === String(item.id)) })) }))
  }

  async function removeAttachment(file: Row, index: number) {
    if (!draft) return
    const shouldDelete = file.idDrive && confirm('Também mover este arquivo para a lixeira do Google Drive?')
    if (shouldDelete) await googleRpc('trashDriveItem', [file.idDrive]).catch(() => null)
    setDraft({ ...draft, anexos: rows(draft.anexos).filter((_, position) => position !== index) })
  }

  async function renameAttachment(file: Row, index: number) {
    if (!draft || !file.idDrive) return
    const name = prompt('Novo nome do arquivo:', file.nome || '')
    if (!name?.trim()) return
    await googleRpc('renomearDriveItem', [file.idDrive, name.trim()])
    setDraft({ ...draft, anexos: rows(draft.anexos).map((item, position) => position === index ? { ...item, nome: name.trim() } : item) })
  }

  return <>
    <AreaToolbar tabs={['Notas', 'Arquivo', 'Lixeira']} active={tab} onTab={setTab} onAdd={() => setDraft({ titulo: '', conteudo: '', ativo: true, arquivado: false, fixado: false, anexos: [], tamanho: 'normal' })} addLabel="Nota" />
    <label className={styles.areaSearch}><span>⌕</span><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Buscar nas notas" /></label>
    <div className={styles.areaList}>{visible.sort((a, b) => Number(b.fixado) - Number(a.fixado) || Number(a.ordem || 0) - Number(b.ordem || 0) || String(b.data || '').localeCompare(String(a.data || ''))).map(note => <div className={styles.noteListRow} key={String(note.id)}><button className={styles.noteRow} onClick={() => setDraft({ ...note })}><span>{note.fixado ? '●' : '○'}</span><span><strong>{note.titulo || 'Sem título'}</strong><small>{stripHtml(note.conteudo).slice(0, 120) || 'Nota sem texto'}{rows(note.anexos).length ? ` · ${rows(note.anexos).length} anexo(s)` : ''}</small></span><time>{fmtDate(note.data)}</time></button><div><button onClick={() => move(note, -1)}>↑</button><button onClick={() => move(note, 1)}>↓</button></div></div>)}</div>
    {!visible.length && <Empty title="Nenhuma nota aqui" text="Registre ideias sem sair do fluxo." />}
    {draft && <Editor title={draft.id ? 'Editar nota' : 'Nova nota'} onClose={() => setDraft(null)} onDelete={draft.id ? () => action(tab === 'Lixeira' ? 'delete' : 'trash') : undefined} onSubmit={save}><Field label="Título" wide><input autoFocus value={draft.titulo || ''} onChange={event => setDraft({ ...draft, titulo: event.target.value })} /></Field><Field label="Conteúdo" wide><div className={styles.richToolbar}><button type="button" onClick={() => format('bold')}><b>B</b></button><button type="button" onClick={() => format('italic')}><i>I</i></button><button type="button" onClick={() => format('underline')}><u>U</u></button><button type="button" onClick={() => format('insertUnorderedList')}>• Lista</button><button type="button" onClick={() => { const url = prompt('Endereço do link:'); if (url) format('createLink', url) }}>Link</button><select value={draft.tamanho || 'normal'} onChange={event => setDraft({ ...draft, tamanho: event.target.value })}><option value="compacta">Compacta</option><option value="normal">Normal</option><option value="grande">Grande</option></select></div><div key={String(draft.id || 'new')} ref={editorRef} className={styles.richEditor} contentEditable suppressContentEditableWarning dangerouslySetInnerHTML={{ __html: String(draft.conteudo || '') }} /></Field><div className={styles.noteActions}><button type="button" onClick={() => action('pin')}>{draft.fixado ? 'Desfixar' : 'Fixar'}</button>{draft.ativo === false ? <button type="button" onClick={() => action('restore')}>Restaurar</button> : draft.arquivado ? <button type="button" onClick={() => action('restore')}>Desarquivar</button> : <button type="button" onClick={() => action('archive')}>Arquivar</button>}<label>{uploading ? 'Enviando...' : 'Anexar arquivo'}<input type="file" hidden disabled={uploading} onChange={event => void upload(event.target.files?.[0])} /></label></div>{rows(draft.anexos).length > 0 && <div className={styles.attachmentList}>{rows(draft.anexos).map((file, index) => <div key={`${file.idDrive}-${index}`}><a href={file.url || '#'} target="_blank" rel="noreferrer">{file.nome || 'Arquivo'}</a><button type="button" onClick={() => void renameAttachment(file, index)}>Renomear</button><button type="button" onClick={() => void removeAttachment(file, index)}>×</button></div>)}</div>}</Editor>}
  </>
}

function Finance({ state, today, commit, createRequest }: Pick<Props, 'state' | 'today' | 'commit' | 'createRequest'>) {
  const finance = state.finance || {}
  const transactions = rows(finance.transactions)
  const accounts = rows(finance.accounts)
  const cards = rows(finance.cards)
  const categories = rows(finance.categories)
  const fixed = rows(finance.fixed)
  const fixedOccurrences = rows(finance.fixedOccurrences)
  const [tab, setTab] = useState('Lançamentos')
  const [draft, setDraft] = useState<Row | null>(null)
  const [kind, setKind] = useState<'transaction' | 'account' | 'card' | 'category' | 'fixed'>('transaction')
  const [month, setMonth] = useState(today.slice(0, 7))
  const [query, setQuery] = useState('')
  const [accountFilter, setAccountFilter] = useState('')
  const initialBalance = accounts.reduce((sum, account) => sum + Number(account.saldo_inicial || 0), 0)
  const paidAmount = (item: Row) => Number(item.valor_pago ?? (item.status === 'pago' ? item.valor : 0))
  const balance = initialBalance + transactions.filter(item => item.status !== 'cancelado' && !item.ignorar_calculo && !String(item.conta_id || '').startsWith('card|')).reduce((sum, item) => sum + (item.tipo === 'receita' ? paidAmount(item) : -paidAmount(item)), 0)
  const monthly = transactions.filter(item => String(item.data || '').slice(0, 7) === month && (!accountFilter || String(item.conta_id || '') === accountFilter) && (!query.trim() || `${item.titulo} ${item.categoria} ${stripHtml(item.observacao)}`.toLocaleLowerCase('pt-BR').includes(query.trim().toLocaleLowerCase('pt-BR'))))
  const monthIncome = monthly.filter(item => item.tipo === 'receita' && !item.ignorar_calculo).reduce((sum, item) => sum + Number(item.valor || 0), 0)
  const monthExpense = monthly.filter(item => item.tipo !== 'receita' && !item.ignorar_calculo).reduce((sum, item) => sum + Number(item.valor || 0), 0)
  const pending = monthly.reduce((sum, item) => sum + Math.max(0, Number(item.valor || 0) - paidAmount(item)), 0)

  useEffect(() => { if (createRequest?.startsWith('finance:')) { setTab('Lançamentos'); setKind('transaction'); setDraft({ titulo: '', valor: 0, tipo: 'despesa', data: today, status: 'pendente', recorrencia: 'unico', parcelas: 2, intervalo_parcelas: 'mensal', dividir_total: true, pagamentos: [] }) } }, [createRequest])

  function moveMonth(amount: number) { const date = new Date(`${month}-15T12:00:00`); date.setMonth(date.getMonth() + amount); setMonth(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`) }

  function fixedThisMonth(): Row[] {
    return fixed.filter(item => item.ativo !== false && (!item.mes_inicio || String(item.mes_inicio).slice(0, 7) <= month) && (!item.mes_fim || String(item.mes_fim).slice(0, 7) >= month)).map(item => {
      const occurrence = fixedOccurrences.find(value => String(value.fixo_id) === String(item.id) && String(value.competencia).slice(0, 7) === month)
      return { ...item, ...occurrence, occurrenceKey: occurrence?.chave || `${item.id}|${month}`, valor_real: occurrence?.valor_override === '' || occurrence?.valor_override == null ? item.valor : occurrence.valor_override, data_real: occurrence?.data_override || `${month}-${String(Math.min(Number(item.dia_mes || 1), new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate())).padStart(2, '0')}` } as Row
    })
  }

  function accountBalance(account: Row) {
    return Number(account.saldo_inicial || 0) + transactions.filter(item => String(item.conta_id || '') === String(account.id) && !item.ignorar_calculo).reduce((sum, item) => sum + (item.tipo === 'receita' ? paidAmount(item) : -paidAmount(item)), 0)
  }

  function cardInvoice(card: Row) {
    return transactions.filter(item => (String(item.conta_id || '') === `card|${card.id}` || String(item.cartao_id || '') === String(card.id)) && String(item.data || '').slice(0, 7) === month && !item.ignorar_calculo).reduce((sum, item) => sum + Number(item.valor || 0), 0)
  }

  function openNew() {
    if (tab === 'Contas') { setKind('account'); setDraft({ nome: '', saldo_inicial: 0, cor: '#718269' }) }
    else if (tab === 'Cartões') { setKind('card'); setDraft({ nome: '', limite: 0, fechamento: 1, vencimento: 10, cor: '#7b8390' }) }
    else if (tab === 'Categorias') { setKind('category'); setDraft({ nome: '' }) }
    else if (tab === 'Fixos') { setKind('fixed'); setDraft({ titulo: '', valor: 0, tipo: 'despesa', dia_mes: Number(today.slice(8)), mes_inicio: today.slice(0, 7), ativo: true }) }
    else { setKind('transaction'); if (tab === 'Relatórios') setTab('Lançamentos'); setDraft({ titulo: '', valor: 0, tipo: 'despesa', data: today, status: 'pendente', recorrencia: 'unico', parcelas: 2, intervalo_parcelas: 'mensal', dividir_total: true, pagamentos: [] }) }
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
        const quantity = Math.max(2, Number(draft.parcelas || 2)); const lot = id('lote'); const baseDate = new Date(`${draft.data}T12:00:00`); const installmentValue = draft.dividir_total === false ? Number(draft.valor || 0) : Number(draft.valor || 0) / quantity
        const installments = Array.from({ length: quantity }, (_, index) => { const date = new Date(baseDate); if (draft.intervalo_parcelas === 'semanal') date.setDate(date.getDate() + index * 7); else if (draft.intervalo_parcelas === 'quinzenal') date.setDate(date.getDate() + index * 15); else if (draft.intervalo_parcelas === 'anual') date.setFullYear(date.getFullYear() + index); else date.setMonth(date.getMonth() + index); return { ...draft, id: id('fin'), lote_id: lot, parcela_numero: index + 1, parcelas_total: quantity, titulo: `${draft.titulo} (${index + 1}/${quantity})`, valor: installmentValue, data: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`, status: index === 0 ? draft.status : 'pendente', valor_pago: index === 0 && draft.status === 'pago' ? installmentValue : 0 } })
        currentFinance.transactions = [...collection, ...installments]
      } else {
        const prefix = kind === 'transaction' ? 'fin' : kind === 'account' ? 'cta' : kind === 'card' ? 'crd' : kind === 'category' ? 'cat' : 'fix'
        const amountPaid = Number(draft.valor_pago || 0)
        const next: Row = { ...draft, id: draft.id || id(prefix), valor: draft.valor === undefined ? undefined : Number(draft.valor || 0), valor_pago: kind === 'transaction' ? (draft.status === 'pago' ? Number(draft.valor || 0) : amountPaid) : amountPaid, status: kind === 'transaction' ? (draft.status === 'pago' || amountPaid >= Number(draft.valor || 0) ? 'pago' : amountPaid > 0 ? 'parcial' : 'pendente') : draft.status, ignorar_calculo: draft.ignorar_calculo === true }
        delete next.recorrencia; delete next.parcelas; delete next.intervalo_parcelas; delete next.dividir_total
        if (kind === 'fixed') { delete next.occurrenceKey; delete next.valor_real; delete next.data_real; delete next.chave; delete next.competencia; delete next.valor_override; delete next.data_override }
        if (kind === 'category' && draft.id) {
          const previous = collection.find(item => String(item.id) === String(draft.id))
          if (previous && previous.nome !== next.nome) currentFinance.transactions = rows(currentFinance.transactions).map(item => item.categoria === previous.nome ? { ...item, categoria: next.nome } : item)
        }
        currentFinance[key] = collection.some(item => String(item.id) === String(next.id)) ? collection.map(item => String(item.id) === String(next.id) ? next : item) : [...collection, next]
      }
      return { ...current, finance: currentFinance }
    })
    setDraft(null)
  }

  function remove() {
    if (!draft || !confirm('Excluir este registro?')) return
    commit(current => { const next = { ...(current.finance || {}) }; const key = collectionKey(); const deleteLot = kind === 'transaction' && draft.lote_id && confirm('Excluir todas as parcelas deste lançamento? Clique em Cancelar para excluir somente esta parcela.'); next[key] = rows(next[key]).filter(item => deleteLot ? String(item.lote_id) !== String(draft.lote_id) : String(item.id) !== String(draft.id)); if (kind === 'fixed') next.fixedOccurrences = rows(next.fixedOccurrences).filter(item => String(item.fixo_id) !== String(draft.id)); return { ...current, finance: next } })
    setDraft(null)
  }

  function edit(type: typeof kind, item: Row) { setKind(type); setDraft({ ...item }) }
  function togglePaid(item: Row) { commit(current => ({ ...current, finance: { ...(current.finance || {}), transactions: rows(current.finance?.transactions).map(row => String(row.id) === String(item.id) ? { ...row, status: row.status === 'pago' ? 'pendente' : 'pago', valor_pago: row.status === 'pago' ? 0 : Number(row.valor || 0) } : row) } })) }

  function addPayment() {
    if (!draft) return
    const remaining = Math.max(0, Number(draft.valor || 0) - Number(draft.valor_pago || 0)); const answer = prompt(`Valor do pagamento (restante ${money.format(remaining)}):`, String(remaining))
    if (answer === null) return
    const amount = Math.max(0, Number(answer) || 0); if (!amount) return
    setDraft({ ...draft, valor_pago: Math.min(Number(draft.valor || 0), Number(draft.valor_pago || 0) + amount), pagamentos: [...rows(draft.pagamentos), { id: id('pag'), data: today, valor: amount }] })
  }

  function toggleFixedOccurrence(item: Row) {
    commit(current => { const list = rows(current.finance.fixedOccurrences); const next = { chave: item.occurrenceKey, fixo_id: item.id, competencia: month, status: item.status === 'pago' ? 'pendente' : 'pago', valor_pago: item.status === 'pago' ? 0 : Number(item.valor_real || 0), atualizado_em: new Date().toISOString() }; return { ...current, finance: { ...current.finance, fixedOccurrences: list.some(entry => entry.chave === item.occurrenceKey) ? list.map(entry => entry.chave === item.occurrenceKey ? { ...entry, ...next } : entry) : [...list, next] } } })
  }

  function adjustBalance(account: Row) {
    const answer = prompt(`Novo saldo de “${account.nome}”:`, String(accountBalance(account)))
    if (answer === null || !Number.isFinite(Number(answer))) return
    const difference = Number(answer) - accountBalance(account); if (!difference) return
    const adjustment = { id: id('fin'), titulo: 'Ajuste de saldo', valor: Math.abs(difference), valor_pago: Math.abs(difference), tipo: difference >= 0 ? 'receita' : 'despesa', categoria: 'Ajuste', conta_id: account.id, data: today, status: 'pago', criado_em: new Date().toISOString(), observacao: 'Ajuste manual de saldo' }
    commit(current => ({ ...current, finance: { ...current.finance, transactions: [...rows(current.finance.transactions), adjustment] } }))
  }

  const addLabel = tab === 'Lançamentos' || tab === 'Relatórios' ? 'Lançamento' : tab === 'Contas' ? 'Conta' : tab === 'Cartões' ? 'Cartão' : tab === 'Fixos' ? 'Fixo mensal' : 'Categoria'
  return <>
    <div className={styles.financeMonth}><button onClick={() => moveMonth(-1)}>‹</button><button onClick={() => setMonth(today.slice(0, 7))}><strong>{new Date(`${month}-15T12:00:00`).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}</strong><small>{month === today.slice(0, 7) ? 'Mês atual' : 'Voltar ao mês atual'}</small></button><button onClick={() => moveMonth(1)}>›</button></div>
    <div className={styles.financeSummary}><div><span>Saldo total</span><strong>{money.format(balance)}</strong></div><div><span>Receitas do mês</span><strong data-positive>{money.format(monthIncome)}</strong></div><div><span>Despesas do mês</span><strong data-negative>{money.format(monthExpense)}</strong></div><div><span>A receber/pagar</span><strong>{money.format(pending)}</strong></div></div>
    <AreaToolbar tabs={['Lançamentos', 'Fixos', 'Contas', 'Cartões', 'Relatórios', 'Categorias']} active={tab} onTab={setTab} onAdd={openNew} addLabel={addLabel} />
    {tab === 'Lançamentos' && <><div className={styles.financeFilters}><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Buscar lançamento" /><select value={accountFilter} onChange={event => setAccountFilter(event.target.value)}><option value="">Todas as contas</option>{accounts.map(account => <option key={String(account.id)} value={account.id}>{account.nome}</option>)}{cards.map(card => <option key={String(card.id)} value={`card|${card.id}`}>{card.nome}</option>)}</select></div><div className={styles.areaList}>{monthly.sort((a, b) => String(b.data).localeCompare(String(a.data))).map(item => <div className={styles.financeRow} key={String(item.id)}><button data-paid={item.status === 'pago'} data-partial={item.status === 'parcial'} onClick={() => togglePaid(item)}>{item.status === 'pago' ? '✓' : item.status === 'parcial' ? '◐' : ''}</button><button onClick={() => edit('transaction', item)}><strong>{item.titulo}</strong><span>{fmtDate(item.data)} · {item.categoria || 'Sem categoria'}{item.lote_id ? ` · ${item.parcela_numero || ''}/${item.parcelas_total || ''}` : ''}{item.status === 'parcial' ? ` · pago ${money.format(paidAmount(item))}` : ''}</span></button><b data-expense={item.tipo !== 'receita'}>{item.tipo === 'receita' ? '+' : '−'} {money.format(Number(item.valor || 0))}</b></div>)}</div>{!monthly.length && <Empty title="Nenhum lançamento neste mês" text="Mude os filtros ou adicione um lançamento." />}</>}
    {tab === 'Fixos' && <div className={styles.areaList}>{fixedThisMonth().map(item => <div className={styles.financeRow} key={String(item.id)}><button data-paid={item.status === 'pago'} onClick={() => toggleFixedOccurrence(item)}>{item.status === 'pago' ? '✓' : ''}</button><button onClick={() => edit('fixed', item)}><strong>{item.titulo}</strong><span>{fmtDate(item.data_real)} · {item.categoria || 'Sem categoria'} · recorrente</span></button><b data-expense={item.tipo !== 'receita'}>{item.tipo === 'receita' ? '+' : '−'} {money.format(Number(item.valor_real || 0))}</b></div>)}</div>}
    {tab === 'Contas' && <div className={styles.areaList}>{accounts.map(item => <div className={styles.accountRow} key={String(item.id)}><button className={styles.simpleRow} onClick={() => edit('account', item)}><i style={{ background: item.cor || '#718269' }} /><span><strong>{item.nome}</strong><small>Saldo inicial {money.format(Number(item.saldo_inicial || 0))}</small></span><b>{money.format(accountBalance(item))}</b></button><button onClick={() => adjustBalance(item)}>Ajustar</button></div>)}</div>}
    {tab === 'Cartões' && <div className={styles.areaList}>{cards.map(item => { const invoice = cardInvoice(item); return <button className={styles.cardFinanceRow} key={String(item.id)} onClick={() => edit('card', item)}><i style={{ background: item.cor || '#7b8390' }} /><span><strong>{item.nome}</strong><small>Fecha dia {item.fechamento || '—'} · vence dia {item.vencimento || '—'} · limite {money.format(Number(item.limite || 0))}</small></span><span><small>Fatura de {new Date(`${month}-15T12:00:00`).toLocaleDateString('pt-BR', { month: 'short' })}</small><b>{money.format(invoice)}</b></span></button> })}</div>}
    {tab === 'Relatórios' && <div className={styles.reportGrid}><section><h3>Por categoria</h3>{Object.entries(monthly.reduce((map: Record<string, number>, item) => { if (item.tipo !== 'receita' && !item.ignorar_calculo) map[item.categoria || 'Sem categoria'] = (map[item.categoria || 'Sem categoria'] || 0) + Number(item.valor || 0); return map }, {})).sort((a, b) => b[1] - a[1]).map(([name, value]) => <div key={name}><span>{name}</span><i><b style={{ width: `${monthExpense ? value / monthExpense * 100 : 0}%` }} /></i><strong>{money.format(value)}</strong></div>)}</section><section><h3>Por conta</h3>{accounts.map(account => <div key={String(account.id)}><span>{account.nome}</span><strong>{money.format(accountBalance(account))}</strong></div>)}</section></div>}
    {tab === 'Categorias' && <div className={styles.areaList}>{categories.map(item => <button className={styles.simpleRow} key={String(item.id)} onClick={() => edit('category', item)}><span><strong>{item.nome}</strong><small>{transactions.filter(transaction => transaction.categoria === item.nome).length} lançamentos</small></span></button>)}</div>}
    {((tab === 'Lançamentos' && !transactions.length) || (tab === 'Fixos' && !fixed.length) || (tab === 'Contas' && !accounts.length) || (tab === 'Cartões' && !cards.length) || (tab === 'Categorias' && !categories.length)) && <Empty title="Nada cadastrado" text="Adicione o primeiro item desta seção." />}
    {draft && <Editor title={`${draft.id ? 'Editar' : 'Novo'} ${addLabel.toLowerCase()}`} onClose={() => setDraft(null)} onDelete={draft.id ? remove : undefined} onSubmit={save}>
      {(kind === 'transaction' || kind === 'fixed') && <><Field label="Título" wide><input autoFocus value={draft.titulo || ''} onChange={event => setDraft({ ...draft, titulo: event.target.value })} /></Field><Field label="Tipo"><select value={draft.tipo || 'despesa'} onChange={event => setDraft({ ...draft, tipo: event.target.value })}><option value="despesa">Despesa</option><option value="receita">Receita</option></select></Field><Field label="Valor"><input type="number" step="0.01" value={draft.valor || 0} onChange={event => setDraft({ ...draft, valor: event.target.value })} /></Field><Field label="Categoria"><input list="finance-categories" value={draft.categoria || ''} onChange={event => setDraft({ ...draft, categoria: event.target.value })} /><datalist id="finance-categories">{categories.map(category => <option value={category.nome} key={String(category.id)} />)}</datalist></Field><Field label="Conta"><select value={draft.conta_id || ''} onChange={event => setDraft({ ...draft, conta_id: event.target.value })}><option value="">Sem conta</option>{accounts.map(account => <option value={account.id} key={String(account.id)}>{account.nome}</option>)}{cards.map(card => <option value={`card|${card.id}`} key={String(card.id)}>{card.nome}</option>)}</select></Field></>}
      {kind === 'transaction' && <><Field label="Data"><input type="date" value={draft.data || today} onChange={event => setDraft({ ...draft, data: event.target.value })} /></Field><Field label="Status"><select value={draft.status || 'pendente'} onChange={event => setDraft({ ...draft, status: event.target.value })}><option value="pendente">Pendente</option><option value="parcial">Parcial</option><option value="pago">Pago</option></select></Field>{!draft.id && <Field label="Recorrência"><select value={draft.recorrencia || 'unico'} onChange={event => setDraft({ ...draft, recorrencia: event.target.value })}><option value="unico">Único</option><option value="parcelado">Parcelado</option></select></Field>}{draft.recorrencia === 'parcelado' && !draft.id && <><Field label="Parcelas"><input type="number" min="2" value={draft.parcelas || 2} onChange={event => setDraft({ ...draft, parcelas: event.target.value })} /></Field><Field label="Intervalo"><select value={draft.intervalo_parcelas || 'mensal'} onChange={event => setDraft({ ...draft, intervalo_parcelas: event.target.value })}><option value="semanal">Semanal</option><option value="quinzenal">Quinzenal</option><option value="mensal">Mensal</option><option value="anual">Anual</option></select></Field><label className={styles.areaToggle}><input type="checkbox" checked={draft.dividir_total !== false} onChange={event => setDraft({ ...draft, dividir_total: event.target.checked })} /><span>O valor informado é o total da compra</span></label></>}{draft.id && <Field label="Pagamentos" wide><div className={styles.paymentEditor}><div><span>Pago</span><strong>{money.format(Number(draft.valor_pago || 0))} de {money.format(Number(draft.valor || 0))}</strong></div>{rows(draft.pagamentos).map(payment => <small key={String(payment.id)}>{fmtDate(payment.data)} · {money.format(Number(payment.valor || 0))}</small>)}<button type="button" onClick={addPayment}>＋ Registrar pagamento parcial</button></div></Field>}<Field label="Observação" wide><textarea rows={3} value={String(draft.observacao || '')} onChange={event => setDraft({ ...draft, observacao: event.target.value })} /></Field><label className={styles.areaToggle}><input type="checkbox" checked={draft.ignorar_calculo === true} onChange={event => setDraft({ ...draft, ignorar_calculo: event.target.checked })} /><span>Ignorar nos cálculos</span></label></>}
      {kind === 'fixed' && <><Field label="Dia do mês"><input type="number" min="1" max="31" value={draft.dia_mes || 1} onChange={event => setDraft({ ...draft, dia_mes: Number(event.target.value) })} /></Field><Field label="Início"><input type="month" value={draft.mes_inicio || today.slice(0, 7)} onChange={event => setDraft({ ...draft, mes_inicio: event.target.value })} /></Field><Field label="Fim opcional"><input type="month" value={draft.mes_fim || ''} onChange={event => setDraft({ ...draft, mes_fim: event.target.value })} /></Field></>}
      {kind === 'account' && <><Field label="Nome" wide><input autoFocus value={draft.nome || ''} onChange={event => setDraft({ ...draft, nome: event.target.value })} /></Field><Field label="Saldo inicial"><input type="number" step="0.01" value={draft.saldo_inicial || 0} onChange={event => setDraft({ ...draft, saldo_inicial: Number(event.target.value) })} /></Field><Field label="Cor"><input type="color" value={draft.cor || '#718269'} onChange={event => setDraft({ ...draft, cor: event.target.value })} /></Field></>}
      {kind === 'card' && <><Field label="Nome" wide><input autoFocus value={draft.nome || ''} onChange={event => setDraft({ ...draft, nome: event.target.value })} /></Field><Field label="Limite"><input type="number" step="0.01" value={draft.limite || 0} onChange={event => setDraft({ ...draft, limite: Number(event.target.value) })} /></Field><Field label="Fechamento"><input type="number" min="1" max="31" value={draft.fechamento || 1} onChange={event => setDraft({ ...draft, fechamento: Number(event.target.value) })} /></Field><Field label="Vencimento"><input type="number" min="1" max="31" value={draft.vencimento || 10} onChange={event => setDraft({ ...draft, vencimento: Number(event.target.value) })} /></Field><Field label="Conta de pagamento"><select value={draft.conta_id || ''} onChange={event => setDraft({ ...draft, conta_id: event.target.value })}><option value="">Nenhuma</option>{accounts.map(account => <option value={account.id} key={String(account.id)}>{account.nome}</option>)}</select></Field><Field label="Cor"><input type="color" value={draft.cor || '#7b8390'} onChange={event => setDraft({ ...draft, cor: event.target.value })} /></Field></>}
      {kind === 'category' && <Field label="Nome" wide><input autoFocus value={draft.nome || ''} onChange={event => setDraft({ ...draft, nome: event.target.value })} /></Field>}
    </Editor>}
  </>
}

function Health({ state, today, commit, createRequest }: Pick<Props, 'state' | 'today' | 'commit' | 'createRequest'>) {
  const health = state.health || {}
  const trackers = rows(health.trackers)
  const library = rows(health.library)
  const diary = (health.diary || {}) as Record<string, Row>
  const goals = (health.goals || {}) as Row
  const [selectedDate, setSelectedDate] = useState(today)
  const day = diary[selectedDate] || { sono: {}, treinos: [], nutricao: [], suplementos: [], rastreadores: {}, alertas: [] }
  const [tab, setTab] = useState('Diário')
  const [draft, setDraft] = useState<Row | null>(null)
  const [kind, setKind] = useState<'log' | 'tracker' | 'library' | 'goals'>('log')

  useEffect(() => { if (createRequest?.startsWith('health:')) { setTab('Diário'); setKind('log'); setDraft({ modulo: 'nutricao', nome: '', hora: new Date().toTimeString().slice(0, 5), valor: '', quantidade: 1 }) } }, [createRequest])
  useEffect(() => { if (today && !selectedDate) setSelectedDate(today) }, [today, selectedDate])

  function moveDay(amount: number) { const date = new Date(`${selectedDate}T12:00:00`); date.setDate(date.getDate() + amount); setSelectedDate(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`) }

  function openNew() {
    if (tab === 'Diário') { setKind('log'); setDraft({ modulo: 'nutricao', nome: '', hora: new Date().toTimeString().slice(0, 5), valor: '', quantidade: 1 }) }
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
        const allDiary = { ...(currentHealth.diary || {}) }; const currentDay = { ...(allDiary[selectedDate] || { sono: {}, treinos: [], nutricao: [], suplementos: [], rastreadores: {}, alertas: [] }) }
        if (draft.modulo === 'sono') {
          const start = draft.deitar ? new Date(`${selectedDate}T${draft.deitar}:00`) : null; const end = draft.acordar ? new Date(`${selectedDate}T${draft.acordar}:00`) : null; if (start && end && end <= start) end.setDate(end.getDate() + 1); const minutes = start && end ? Math.round((end.getTime() - start.getTime()) / 60_000) : Number(draft.min || 0); const ideal = Number((currentHealth.goals || {}).horasIdeais || 8) * 60; const score = draft.score === '' || draft.score == null ? Math.min(100, Math.round(minutes / Math.max(1, ideal) * 100)) : Number(draft.score)
          currentDay.sono = { ...draft, deitar: draft.deitar || '', acordar: draft.acordar || '', min: minutes, rem: Number(draft.rem || 0), prof: Number(draft.prof || 0), score }
        } else {
          const key = draft.modulo === 'treino' ? 'treinos' : draft.modulo === 'suplemento' ? 'suplementos' : 'nutricao'; const quantity = Number(draft.quantidade || 1); const libraryItem = rows(currentHealth.library).find(item => String(item.id) === String(draft.library_id)); const factor = libraryItem ? quantity / Number(libraryItem.base || 1) : 1
          const log = { ...draft, idLog: draft.idLog || Date.now(), hora: draft.hora, nome: draft.nome || libraryItem?.nome || draft.modulo, valor: draft.valor, quantidade: quantity, kcal: Number(draft.kcal ?? libraryItem?.kcal ?? 0) * factor, p: Number(draft.p ?? libraryItem?.p ?? 0) * factor, c: Number(draft.c ?? libraryItem?.c ?? 0) * factor, g: Number(draft.g ?? libraryItem?.g ?? 0) * factor, fibra: Number(draft.fibra ?? libraryItem?.fibra ?? 0) * factor, sodio: Number(draft.sodio ?? libraryItem?.sodio ?? 0) * factor, acucar: Number(draft.acucar ?? libraryItem?.acucar ?? 0) * factor }
          currentDay[key] = rows(currentDay[key]).some(item => String(item.idLog) === String(log.idLog)) ? rows(currentDay[key]).map(item => String(item.idLog) === String(log.idLog) ? log : item) : [...rows(currentDay[key]), log]
          if (draft.modulo === 'suplemento' && libraryItem?.id && !draft.idLog) currentHealth.library = rows(currentHealth.library).map(item => String(item.id) === String(libraryItem.id) ? { ...item, estoque: Math.max(0, Number(item.estoque || 0) - quantity) } : item)
        }
        allDiary[selectedDate] = currentDay; currentHealth.diary = allDiary
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

  function removeLog(log: Row) {
    if (!confirm('Excluir este registro do diário?')) return
    const key = log.tipo === 'Treino' ? 'treinos' : log.tipo === 'Suplemento' ? 'suplementos' : 'nutricao'
    commit(current => { const health = { ...current.health } as Row; const allDiary = { ...(health.diary || {}) }; const currentDay = { ...(allDiary[selectedDate] || {}) }; currentDay[key] = rows(currentDay[key]).filter(item => String(item.idLog) !== String(log.idLog)); allDiary[selectedDate] = currentDay; health.diary = allDiary; return { ...current, health } })
  }

  function recordTracker(tracker: Row) {
    const currentValue = day.rastreadores?.[tracker.id] ?? ''
    const answer = prompt(`${tracker.nome}${tracker.unidade ? ` (${tracker.unidade})` : ''}:`, String(currentValue))
    if (answer === null) return
    const value = Number(answer)
    commit(current => { const health = { ...current.health } as Row; const allDiary = { ...(health.diary || {}) }; const currentDay = { ...(allDiary[selectedDate] || { sono: {}, treinos: [], nutricao: [], suplementos: [], rastreadores: {}, alertas: [] }) }; currentDay.rastreadores = { ...(currentDay.rastreadores || {}), [tracker.id]: Number.isFinite(value) ? value : answer }; allDiary[selectedDate] = currentDay; health.diary = allDiary; return { ...current, health } })
  }

  const nutritionTotals = rows(day.nutricao).reduce((total, item) => ({ kcal: total.kcal + Number(item.kcal || 0), p: total.p + Number(item.p || 0), c: total.c + Number(item.c || 0), g: total.g + Number(item.g || 0), fibra: total.fibra + Number(item.fibra || 0), sodio: total.sodio + Number(item.sodio || 0), acucar: total.acucar + Number(item.acucar || 0) }), { kcal: 0, p: 0, c: 0, g: 0, fibra: 0, sodio: 0, acucar: 0 })
  const alerts = [nutritionTotals.sodio > Number(goals.sodio || Infinity) ? 'Sódio acima da meta' : '', nutritionTotals.acucar > Number(goals.acucar || Infinity) ? 'Açúcar acima da meta' : '', day.sono?.min && day.sono.min < Number(goals.horasIdeais || 8) * 60 * .75 ? 'Sono abaixo do recomendado' : ''].filter(Boolean)

  const logs: Row[] = [...rows(day.treinos).map(item => ({ ...item, tipo: 'Treino' })), ...rows(day.nutricao).map(item => ({ ...item, tipo: 'Nutrição' })), ...rows(day.suplementos).map(item => ({ ...item, tipo: 'Suplemento' }))]
  logs.sort((a, b) => String(a.hora).localeCompare(String(b.hora)))
  return <>
    <AreaToolbar tabs={['Diário', 'Metas', 'Variáveis', 'Biblioteca']} active={tab} onTab={setTab} onAdd={openNew} addLabel={tab === 'Diário' ? 'Registro' : tab === 'Metas' ? 'Editar metas' : tab === 'Variáveis' ? 'Variável' : 'Item'} />
    {tab === 'Diário' && <><div className={styles.dateNavigator}><button onClick={() => moveDay(-1)}>‹</button><button onClick={() => setSelectedDate(today)}><strong>{selectedDate === today ? 'Hoje' : fmtDate(selectedDate)}</strong><small>{selectedDate === today ? fmtDate(today) : 'Voltar para hoje'}</small></button><button onClick={() => moveDay(1)}>›</button></div><div className={styles.healthOverview}><div><span>Sono</span><strong>{day.sono?.min ? `${Math.floor(day.sono.min / 60)}h ${day.sono.min % 60}min` : '—'}</strong><small>{day.sono?.score ? `${day.sono.score}/100` : 'Sem registro'}</small></div><div><span>Calorias</span><strong>{Math.round(nutritionTotals.kcal)} kcal</strong><small>meta {goals.kcal || '—'}</small></div><div><span>Proteína</span><strong>{Math.round(nutritionTotals.p)} g</strong><small>meta {goals.p || '—'} g</small></div><div><span>Treinos</span><strong>{rows(day.treinos).length}</strong><small>neste dia</small></div></div>{alerts.length > 0 && <div className={styles.healthAlerts}>{alerts.map(alert => <span key={alert}>! {alert}</span>)}</div>}<div className={styles.areaList}>{day.sono?.deitar && <button className={styles.healthRow} onClick={() => { setKind('log'); setDraft({ ...day.sono, modulo: 'sono' }) }}><span>☾</span><span><strong>Sono</strong><small>{day.sono.deitar} → {day.sono.acordar || '—'} · {day.sono.score || 0} pontos · REM {day.sono.rem || 0}min · profundo {day.sono.prof || 0}min</small></span></button>}{logs.map(log => <div className={styles.healthLogRow} key={String(log.idLog)}><button className={styles.healthRow} onClick={() => { setKind('log'); setDraft({ ...log, modulo: log.tipo === 'Treino' ? 'treino' : log.tipo === 'Suplemento' ? 'suplemento' : 'nutricao' }) }}><span>＋</span><span><strong>{log.nome || log.tipo}</strong><small>{log.tipo} · {log.hora || 'Sem horário'}{log.valor ? ` · ${log.valor}` : ''}{log.kcal ? ` · ${Math.round(log.kcal)} kcal` : ''}</small></span></button><button onClick={() => removeLog(log)}>×</button></div>)}{!day.sono?.deitar && !logs.length && <Empty title="Sem registros neste dia" text="Registre sono, treino, nutrição ou suplementos." />}</div></>}
    {tab === 'Metas' && <div className={styles.healthGoals}>{[['Água', goals.agua, 'ml'], ['Calorias', goals.kcal, 'kcal'], ['Proteína', goals.p, 'g'], ['Carboidratos', goals.c, 'g'], ['Gordura', goals.g, 'g'], ['Sono', goals.horasIdeais, 'h']].map(([label, value, unit]) => <div key={String(label)}><span>{label}</span><strong>{value || '—'} <small>{unit}</small></strong></div>)}</div>}
    {tab === 'Variáveis' && <div className={styles.areaList}>{trackers.map(item => <div className={styles.trackerRow} key={String(item.id)}><button className={styles.simpleRow} onClick={() => { setKind('tracker'); setDraft({ ...item }) }}><span><strong>{item.nome}</strong><small>{item.categoria || 'Geral'} · {item.unidade || 'sem unidade'}{item.min !== '' ? ` · mín. ${item.min}` : ''}{item.max !== '' ? ` · máx. ${item.max}` : ''}</small></span><b>{day.rastreadores?.[item.id] ?? '—'}</b></button><button onClick={() => recordTracker(item)}>Registrar</button></div>)}</div>}
    {tab === 'Biblioteca' && <div className={styles.areaList}>{library.map(item => <button className={styles.simpleRow} key={String(item.id)} onClick={() => { setKind('library'); setDraft({ ...item }) }}><span><strong>{item.nome}</strong><small>{item.modulo || 'Item'}{item.kcal ? ` · ${item.kcal} kcal` : ''}{item.estoque ? ` · estoque ${item.estoque}` : ''}</small></span></button>)}</div>}
    {draft && <Editor title={kind === 'log' ? 'Novo registro' : kind === 'goals' ? 'Metas de saúde' : draft.id ? 'Editar item' : 'Novo item'} onClose={() => setDraft(null)} onDelete={draft.id && (kind === 'tracker' || kind === 'library') ? () => remove(kind, draft.id) : undefined} onSubmit={save}>
      {kind === 'log' && <><Field label="Tipo"><select value={draft.modulo || 'nutricao'} onChange={event => setDraft({ ...draft, modulo: event.target.value, library_id: '' })}><option value="sono">Sono</option><option value="treino">Treino</option><option value="nutricao">Nutrição</option><option value="suplemento">Suplemento</option></select></Field>{draft.modulo === 'sono' ? <><Field label="Deitar"><input type="time" value={draft.deitar || ''} onChange={event => setDraft({ ...draft, deitar: event.target.value })} /></Field><Field label="Acordar"><input type="time" value={draft.acordar || ''} onChange={event => setDraft({ ...draft, acordar: event.target.value })} /></Field><Field label="REM (min)"><input type="number" min="0" value={draft.rem || 0} onChange={event => setDraft({ ...draft, rem: Number(event.target.value) })} /></Field><Field label="Profundo (min)"><input type="number" min="0" value={draft.prof || 0} onChange={event => setDraft({ ...draft, prof: Number(event.target.value) })} /></Field><Field label="Pontuação opcional"><input type="number" min="0" max="100" value={draft.score ?? ''} onChange={event => setDraft({ ...draft, score: event.target.value === '' ? '' : Number(event.target.value) })} /></Field></> : <><Field label="Item da biblioteca" wide><select value={draft.library_id || ''} onChange={event => { const item = library.find(value => String(value.id) === event.target.value); setDraft({ ...draft, library_id: event.target.value, nome: item?.nome || draft.nome, quantidade: item?.base || 1 }) }}><option value="">Registro livre</option>{library.filter(item => item.modulo === draft.modulo || (draft.modulo === 'treino' && item.modulo === 'plano_treino')).map(item => <option key={String(item.id)} value={item.id}>{item.nome}</option>)}</select></Field><Field label="Nome" wide><input autoFocus value={draft.nome || ''} onChange={event => setDraft({ ...draft, nome: event.target.value })} /></Field><Field label="Horário"><input type="time" value={draft.hora || ''} onChange={event => setDraft({ ...draft, hora: event.target.value })} /></Field><Field label={draft.modulo === 'treino' ? 'Duração (min)' : draft.modulo === 'nutricao' ? 'Quantidade (g/ml)' : 'Dose/quantidade'}><input type="number" step="0.1" value={draft.quantidade || 1} onChange={event => setDraft({ ...draft, quantidade: Number(event.target.value) })} /></Field><Field label="Detalhes" wide><textarea rows={3} value={draft.valor || ''} onChange={event => setDraft({ ...draft, valor: event.target.value })} /></Field></>}</>}
      {kind === 'goals' && <><Field label="Água (ml)"><input type="number" value={draft.agua || 0} onChange={event => setDraft({ ...draft, agua: Number(event.target.value) })} /></Field><Field label="Calorias"><input type="number" value={draft.kcal || 0} onChange={event => setDraft({ ...draft, kcal: Number(event.target.value) })} /></Field><Field label="Proteína (g)"><input type="number" value={draft.p || 0} onChange={event => setDraft({ ...draft, p: Number(event.target.value) })} /></Field><Field label="Carboidratos (g)"><input type="number" value={draft.c || 0} onChange={event => setDraft({ ...draft, c: Number(event.target.value) })} /></Field><Field label="Gordura (g)"><input type="number" value={draft.g || 0} onChange={event => setDraft({ ...draft, g: Number(event.target.value) })} /></Field><Field label="Fibra (g)"><input type="number" value={draft.fibra || 0} onChange={event => setDraft({ ...draft, fibra: Number(event.target.value) })} /></Field><Field label="Sódio (mg)"><input type="number" value={draft.sodio || 0} onChange={event => setDraft({ ...draft, sodio: Number(event.target.value) })} /></Field><Field label="Açúcar (g)"><input type="number" value={draft.acucar || 0} onChange={event => setDraft({ ...draft, acucar: Number(event.target.value) })} /></Field><Field label="Horas de sono"><input type="number" step="0.5" value={draft.horasIdeais || 8} onChange={event => setDraft({ ...draft, horasIdeais: Number(event.target.value) })} /></Field><Field label="Hora de deitar"><input type="time" value={draft.deitar || ''} onChange={event => setDraft({ ...draft, deitar: event.target.value })} /></Field></>}
      {kind === 'tracker' && <><Field label="Nome" wide><input autoFocus value={draft.nome || ''} onChange={event => setDraft({ ...draft, nome: event.target.value })} /></Field><Field label="Categoria"><input value={draft.categoria || ''} onChange={event => setDraft({ ...draft, categoria: event.target.value })} /></Field><Field label="Unidade"><input value={draft.unidade || ''} onChange={event => setDraft({ ...draft, unidade: event.target.value })} /></Field><Field label="Mínimo"><input type="number" value={draft.min ?? ''} onChange={event => setDraft({ ...draft, min: event.target.value })} /></Field><Field label="Máximo"><input type="number" value={draft.max ?? ''} onChange={event => setDraft({ ...draft, max: event.target.value })} /></Field></>}
      {kind === 'library' && <><Field label="Nome" wide><input autoFocus value={draft.nome || ''} onChange={event => setDraft({ ...draft, nome: event.target.value })} /></Field><Field label="Módulo"><select value={draft.modulo || 'nutricao'} onChange={event => setDraft({ ...draft, modulo: event.target.value })}><option value="nutricao">Nutrição</option><option value="treino">Exercício</option><option value="suplemento">Suplemento</option><option value="plano_treino">Plano de treino</option></select></Field><Field label="Base/dose"><input type="number" value={draft.base || 100} onChange={event => setDraft({ ...draft, base: Number(event.target.value) })} /></Field><Field label="Calorias"><input type="number" value={draft.kcal || 0} onChange={event => setDraft({ ...draft, kcal: Number(event.target.value) })} /></Field><Field label="Proteína"><input type="number" value={draft.p || 0} onChange={event => setDraft({ ...draft, p: Number(event.target.value) })} /></Field><Field label="Carboidratos"><input type="number" value={draft.c || 0} onChange={event => setDraft({ ...draft, c: Number(event.target.value) })} /></Field><Field label="Gordura"><input type="number" value={draft.g || 0} onChange={event => setDraft({ ...draft, g: Number(event.target.value) })} /></Field><Field label="Fibra"><input type="number" value={draft.fibra || 0} onChange={event => setDraft({ ...draft, fibra: Number(event.target.value) })} /></Field><Field label="Sódio"><input type="number" value={draft.sodio || 0} onChange={event => setDraft({ ...draft, sodio: Number(event.target.value) })} /></Field><Field label="Açúcar"><input type="number" value={draft.acucar || 0} onChange={event => setDraft({ ...draft, acucar: Number(event.target.value) })} /></Field><Field label="Estoque"><input type="number" value={draft.estoque || 0} onChange={event => setDraft({ ...draft, estoque: Number(event.target.value) })} /></Field><Field label={draft.modulo === 'plano_treino' ? 'Exercícios, um por linha' : 'Descrição/composição'} wide><textarea rows={5} value={draft.descricao || ''} onChange={event => setDraft({ ...draft, descricao: event.target.value })} /></Field></>}
    </Editor>}
  </>
}

function Files({ googleRpc, createRequest }: Pick<Props, 'googleRpc' | 'createRequest'>) {
  const [folderId, setFolderId] = useState('root')
  const [items, setItems] = useState<Row[]>([])
  const [path, setPath] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState('name')
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  async function load(target = folderId) {
    setLoading(true); setError('')
    try { const result = await googleRpc('getDriveContent', [target]); setItems(rows(result?.items)); setPath(rows(result?.path)) } catch (error: any) { setItems([]); setPath([]); setError(error?.message || 'Não foi possível acessar o Google Drive.') } finally { setLoading(false) }
  }
  useEffect(() => { void load(folderId) }, [folderId])
  useEffect(() => { if (createRequest?.startsWith('files:')) inputRef.current?.click() }, [createRequest])

  async function createFolder() { const name = prompt('Nome da nova pasta:'); if (!name?.trim()) return; setBusy(true); try { await googleRpc('criarPastaDriveHub', [name.trim(), folderId]); await load() } finally { setBusy(false) } }
  async function createText() { const raw = prompt('Nome do novo arquivo de texto:'); if (!raw?.trim()) return; const content = prompt('Conteúdo inicial do arquivo:', '') ?? ''; const name = raw.trim().endsWith('.txt') ? raw.trim() : `${raw.trim()}.txt`; setBusy(true); try { await googleRpc('criarArquivoTextoDriveHub', [name, folderId, content]); await load() } finally { setBusy(false) } }
  async function upload(files?: FileList | null) { if (!files?.length) return; setBusy(true); try { for (const file of Array.from(files)) { const dataUrl = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = reject; reader.readAsDataURL(file) }); await googleRpc('uploadToDriveHub', [dataUrl, file.name, file.type, folderId]) } await load() } finally { setBusy(false); if (inputRef.current) inputRef.current.value = '' } }
  async function trash(item: Row) { if (!confirm(`Mover “${item.name || item.nome}” para a lixeira do Drive?`)) return; setItems(current => current.filter(row => String(row.id) !== String(item.id))); try { await googleRpc('trashDriveItem', [item.id]) } catch { await load() } }
  async function rename(item: Row) { const name = prompt('Novo nome:', item.name || item.nome || ''); if (!name?.trim()) return; setBusy(true); try { await googleRpc('renomearDriveItem', [item.id, name.trim()]); await load() } catch (error: any) { setError(error?.message || 'Não foi possível renomear.') } finally { setBusy(false) } }
  async function moveRoot(item: Row) { if (folderId === 'root' || !confirm(`Mover “${item.name || item.nome}” para Meu Drive?`)) return; setBusy(true); try { await googleRpc('moverDriveItem', [item.id, 'root']); await load() } catch (error: any) { setError(error?.message || 'Não foi possível mover.') } finally { setBusy(false) } }

  const visible = items.filter(item => !query.trim() || String(item.name || item.nome || '').toLocaleLowerCase('pt-BR').includes(query.trim().toLocaleLowerCase('pt-BR'))).sort((a, b) => sort === 'date' ? String(b.modificado || '').localeCompare(String(a.modificado || '')) : sort === 'size' ? Number(b.tamanho || 0) - Number(a.tamanho || 0) : String(a.name || a.nome || '').localeCompare(String(b.name || b.nome || ''), 'pt-BR'))

  return <>
    <div className={styles.driveToolbar}><div className={styles.driveBreadcrumb}><button onClick={() => setFolderId('root')}>Meu Drive</button>{path.map(folder => <span key={String(folder.id)}>› <button onClick={() => setFolderId(String(folder.id))}>{folder.nome || folder.name}</button></span>)}</div><div><button disabled={busy} onClick={createFolder}>＋ Pasta</button><button disabled={busy} onClick={createText}>＋ Texto</button><button disabled={busy} onClick={() => inputRef.current?.click()}>{busy ? 'Enviando...' : 'Enviar arquivo'}</button><input ref={inputRef} type="file" multiple hidden onChange={event => void upload(event.target.files)} /></div></div>
    <div className={styles.driveFilters}><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Buscar nesta pasta" /><select value={sort} onChange={event => setSort(event.target.value)}><option value="name">Nome</option><option value="date">Modificação</option><option value="size">Tamanho</option></select></div>
    {error && <div className={styles.inlineMessage}>{error}<button onClick={() => void load()}>Tentar novamente</button></div>}
    {loading ? <div className={styles.areaEmpty}>Carregando Google Drive...</div> : visible.length ? <div className={styles.driveList}>{visible.map(item => <div key={String(item.id)}><button onClick={() => item.tipo === 'folder' ? setFolderId(String(item.id)) : window.open(String(item.url || '#'), '_blank')}><span>{item.tipo === 'folder' ? '▰' : '▤'}</span><span><strong>{item.name || item.nome}</strong><small>{item.tipo === 'folder' ? 'Pasta' : `${Math.max(0, Number(item.tamanho || 0) / 1024).toFixed(1)} KB`}{item.modificado ? ` · ${fmtDate(item.modificado)}` : ''}</small></span></button><div><button onClick={() => void rename(item)}>Renomear</button>{folderId !== 'root' && <button onClick={() => void moveRoot(item)}>Mover</button>}<button onClick={() => void trash(item)}>×</button></div></div>)}</div> : <Empty title={query ? 'Nenhum arquivo encontrado' : 'Esta pasta está vazia'} text={query ? 'Tente outro nome.' : 'Crie uma pasta, um texto ou envie um arquivo.'} />}
  </>
}

export function AreaView(props: Props) {
  if (props.view === 'habits') return <Habits state={props.state} today={props.today} commit={props.commit} createRequest={props.createRequest} />
  if (props.view === 'goals') return <Goals state={props.state} commit={props.commit} googleRpc={props.googleRpc} createRequest={props.createRequest} />
  if (props.view === 'notes') return <Notes state={props.state} commit={props.commit} googleRpc={props.googleRpc} createRequest={props.createRequest} />
  if (props.view === 'finance') return <Finance state={props.state} today={props.today} commit={props.commit} createRequest={props.createRequest} />
  if (props.view === 'health') return <Health state={props.state} today={props.today} commit={props.commit} createRequest={props.createRequest} />
  return <Files googleRpc={props.googleRpc} createRequest={props.createRequest} />
}
