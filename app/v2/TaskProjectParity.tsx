'use client'

import { FormEvent, ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import { createTask, dateKey, LegacyTask, loadState, MaiState, persistState } from '../../lib/v2/state'

type Row = Record<string, any>
type Tab = 'active' | 'completed' | 'projects'
type Props = { onChanged: () => void }

const rows = (value: unknown): Row[] => Array.isArray(value) ? value as Row[] : []
const uid = (prefix: string) => `${prefix}-${crypto.randomUUID()}`
const button = { border: '1px solid var(--divider)', background: 'var(--bg-card)', color: 'var(--text-primary)', borderRadius: 9, padding: '8px 10px', cursor: 'pointer', font: 'inherit' } as const
const input = { border: '1px solid var(--divider)', background: 'var(--bg-primary)', color: 'var(--text-primary)', borderRadius: 9, padding: '9px 10px', width: '100%', font: 'inherit' } as const
const card = { border: '1px solid var(--divider)', background: 'var(--bg-primary)', borderRadius: 12, padding: 12 } as const
const modal = { position: 'fixed', inset: 0, zIndex: 10100, background: 'rgba(20,22,20,.52)', display: 'grid', placeItems: 'center', padding: 18 } as const
const sheet = { width: 'min(1020px,96vw)', maxHeight: '90vh', overflow: 'auto', background: 'var(--bg-card)', color: 'var(--text-primary)', border: '1px solid var(--divider)', borderRadius: 18, padding: 20, boxShadow: '0 28px 80px rgba(0,0,0,.28)' } as const

function projectName(project: Row) { return String(project.nome || project.name || 'Projeto sem nome') }
function projectId(project: Row) { return String(project.id || '') }
function taskDay(task: LegacyTask) { return String(task.data_vencimento || '').slice(0, 10) }
function cleanText(value: unknown) { return String(value || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim() }
function localDateLabel(value: unknown) { const key = String(value || '').slice(0, 10); return key ? new Date(`${key}T12:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }) : 'Sem data' }

function RichEditor({ value, onChange, minHeight = 110 }: { value: string; onChange: (value: string) => void; minHeight?: number }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => { if (ref.current && ref.current.innerHTML !== value) ref.current.innerHTML = value }, [value])
  const command = (name: string, arg?: string) => { ref.current?.focus(); document.execCommand(name, false, arg); onChange(ref.current?.innerHTML || '') }
  return <div><div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 6 }}><button type="button" style={button} onClick={() => command('bold')}><b>B</b></button><button type="button" style={button} onClick={() => command('italic')}><i>I</i></button><button type="button" style={button} onClick={() => command('underline')}><u>U</u></button><button type="button" style={button} onClick={() => command('strikeThrough')}><s>S</s></button><button type="button" style={button} onClick={() => command('insertUnorderedList')}>• Lista</button><button type="button" style={button} onClick={() => command('insertOrderedList')}>1. Lista</button><button type="button" style={button} onClick={() => { const url = prompt('Endereço do link:'); if (url) command('createLink', url) }}>Link</button><button type="button" style={button} onClick={() => command('removeFormat')}>Limpar</button></div><div ref={ref} contentEditable suppressContentEditableWarning onInput={event => onChange(event.currentTarget.innerHTML)} style={{ ...input, minHeight, overflow: 'auto', lineHeight: 1.55 }} /></div>
}

function resizeProjectImage(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = reject
    reader.onload = () => {
      const image = new Image()
      image.onerror = reject
      image.onload = () => {
        const canvas = document.createElement('canvas'); canvas.width = 256; canvas.height = 256
        const context = canvas.getContext('2d'); if (!context) return reject(new Error('Canvas indisponível'))
        const side = Math.min(image.width, image.height); const sx = (image.width - side) / 2; const sy = (image.height - side) / 2
        context.drawImage(image, sx, sy, side, side, 0, 0, 256, 256)
        resolve(canvas.toDataURL('image/webp', .82))
      }
      image.src = String(reader.result || '')
    }
    reader.readAsDataURL(file)
  })
}

function fileData(file: File) { return new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onerror = reject; reader.onload = () => resolve(String(reader.result || '')); reader.readAsDataURL(file) }) }

export function TaskProjectParity({ onChanged }: Props) {
  const [open, setOpen] = useState(false)
  const [snapshot, setSnapshot] = useState<MaiState>(() => loadState())
  const [tab, setTab] = useState<Tab>('active')
  const [query, setQuery] = useState('')
  const [filterProject, setFilterProject] = useState('all')
  const [taskDraft, setTaskDraft] = useState<LegacyTask | null>(null)
  const [projectDraft, setProjectDraft] = useState<Row | null>(null)
  const [newSection, setNewSection] = useState('')
  const [noteDraft, setNoteDraft] = useState('')
  const [intervalDays, setIntervalDays] = useState(2)
  const [weekdays, setWeekdays] = useState<number[]>([1, 2, 3, 4, 5])
  const [busy, setBusy] = useState(false)
  const dirty = useRef(false)

  const projects = useMemo(() => rows(snapshot.projects).filter(project => project.ativo !== false && projectId(project) !== 'entrada').sort((a, b) => Number(a.ordem || 0) - Number(b.ordem || 0)), [snapshot.projects])
  const activeTasks = snapshot.tasks.filter(task => !task.concluida)
  const completedTasks = snapshot.tasks.filter(task => task.concluida)
  const filteredTasks = (tab === 'completed' ? completedTasks : activeTasks).filter(task => {
    if (filterProject !== 'all' && String(task.projeto_id || 'entrada') !== filterProject) return false
    const q = query.trim().toLocaleLowerCase('pt-BR'); if (!q) return true
    return `${task.titulo} ${cleanText(task.descricao)} ${rows(task.notas).map(note => cleanText(note.texto || note.text || note)).join(' ')}`.toLocaleLowerCase('pt-BR').includes(q)
  })

  function apply(change: (current: MaiState) => MaiState) {
    setSnapshot(current => { const next = persistState(change(current)); dirty.current = true; return next })
  }
  function show() { setSnapshot(loadState()); setOpen(true) }
  function close() { setTaskDraft(null); setProjectDraft(null); setOpen(false); if (dirty.current) { dirty.current = false; onChanged() } }
  function updateDraft(patch: Partial<LegacyTask>) { if (taskDraft) setTaskDraft({ ...taskDraft, ...patch }) }

  function newTask() {
    const base = createTask('')
    setTaskDraft({ ...base, titulo: '', data_vencimento: '', projeto_id: filterProject !== 'all' ? filterProject : 'entrada', notas: [], anexos: [], subtarefas: [] })
    setNoteDraft('')
  }
  function editTask(task: LegacyTask) { setTaskDraft({ ...task, notas: [...rows(task.notas)], anexos: [...rows(task.anexos)], subtarefas: [...rows(task.subtarefas)] }); setNoteDraft('') }
  function saveTask(event: FormEvent) {
    event.preventDefault(); if (!taskDraft || !taskDraft.titulo.trim()) return
    const next = { ...taskDraft, titulo: taskDraft.titulo.trim(), projeto_id: taskDraft.projeto_id || 'entrada', prioridade: Number(taskDraft.prioridade || 4), notas: rows(taskDraft.notas), anexos: rows(taskDraft.anexos), subtarefas: rows(taskDraft.subtarefas), criado_em: taskDraft.criado_em || new Date().toISOString(), ordem: Number(taskDraft.ordem ?? Date.now()) }
    apply(current => ({ ...current, tasks: current.tasks.some(task => task.id === next.id) ? current.tasks.map(task => task.id === next.id ? next : task) : [...current.tasks, next] }))
    setTaskDraft(null)
  }
  function removeTask() { if (!taskDraft || !confirm('Excluir esta tarefa permanentemente?')) return; apply(current => ({ ...current, tasks: current.tasks.filter(task => task.id !== taskDraft.id) })); setTaskDraft(null) }
  function reopen(task: LegacyTask) { apply(current => ({ ...current, tasks: current.tasks.map(item => item.id === task.id ? { ...item, concluida: false, concluida_em: '' } : item) })) }
  function complete(task: LegacyTask) { apply(current => ({ ...current, tasks: current.tasks.map(item => item.id === task.id ? { ...item, concluida: true, concluida_em: new Date().toISOString() } : item) })) }

  function addSubtask() { if (!taskDraft) return; setTaskDraft({ ...taskDraft, subtarefas: [...rows(taskDraft.subtarefas), { id: uid('sub'), titulo: '', concluida: false, descricao: '', subtarefas: [] }] }) }
  function updateSubtask(index: number, patch: Row) { if (!taskDraft) return; setTaskDraft({ ...taskDraft, subtarefas: rows(taskDraft.subtarefas).map((item, i) => i === index ? { ...item, ...patch } : item) }) }
  function removeSubtask(index: number) { if (!taskDraft) return; setTaskDraft({ ...taskDraft, subtarefas: rows(taskDraft.subtarefas).filter((_, i) => i !== index) }) }
  function addNested(index: number) { if (!taskDraft) return; const parent = rows(taskDraft.subtarefas)[index]; updateSubtask(index, { subtarefas: [...rows(parent.subtarefas), { id: uid('sub'), titulo: 'Nova etapa', concluida: false }] }) }

  function addNote() { if (!taskDraft || !cleanText(noteDraft)) return; setTaskDraft({ ...taskDraft, notas: [...rows(taskDraft.notas), { id: uid('tn'), texto: noteDraft, data: new Date().toISOString() }] }); setNoteDraft('') }
  function removeNote(index: number) { if (!taskDraft) return; setTaskDraft({ ...taskDraft, notas: rows(taskDraft.notas).filter((_, i) => i !== index) }) }

  async function googleRpc(method: string, args: unknown[] = []) {
    const response = await fetch('/api/google/rpc', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ method, args }) })
    const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Falha no Google'); return data.payload
  }
  async function uploadAttachments(files: FileList | null) {
    if (!taskDraft || !files?.length) return; setBusy(true)
    try {
      const added: Row[] = []
      for (const file of Array.from(files)) { const data = await fileData(file); const result = await googleRpc('salvarAnexoDrive', [data, file.name, file.type]); const item = result?.item || result; added.push({ idDrive: item.id || item.idDrive, nome: item.name || item.nome || file.name, tipo: item.tipo || item.mimeType || file.type, url: item.url || item.webViewLink || '' }) }
      setTaskDraft({ ...taskDraft, anexos: [...rows(taskDraft.anexos), ...added] })
    } catch (error: any) { alert(error?.message || 'Não foi possível anexar o arquivo.') } finally { setBusy(false) }
  }
  async function renameAttachment(index: number) { if (!taskDraft) return; const file = rows(taskDraft.anexos)[index]; const name = prompt('Novo nome:', String(file.nome || '')); if (!name?.trim()) return; if (file.idDrive) await googleRpc('renomearDriveItem', [file.idDrive, name.trim()]).catch(() => null); setTaskDraft({ ...taskDraft, anexos: rows(taskDraft.anexos).map((item, i) => i === index ? { ...item, nome: name.trim() } : item) }) }
  async function removeAttachment(index: number) { if (!taskDraft) return; const file = rows(taskDraft.anexos)[index]; if (file.idDrive && confirm('Também mover o arquivo para a lixeira do Google Drive?')) await googleRpc('trashDriveItem', [file.idDrive]).catch(() => null); setTaskDraft({ ...taskDraft, anexos: rows(taskDraft.anexos).filter((_, i) => i !== index) }) }

  function taskToLocalEvent() {
    if (!taskDraft || !confirm('Transformar esta tarefa em compromisso local?')) return
    const date = taskDay(taskDraft) || dateKey(); const time = String(taskDraft.data_vencimento || '').includes('T') ? String(taskDraft.data_vencimento).slice(11, 16) : ''
    const event = { id: uid('local-event'), tipo: 'local', titulo: taskDraft.titulo, descricao: taskDraft.descricao || '', data_inicio: date, hora_inicio: time || '09:00', hora_fim: '', dia_inteiro: !time, repeticao: taskDraft.repeticao || '', subtarefas: rows(taskDraft.subtarefas).map(item => ({ ...item, done: item.concluida === true })), anexos: rows(taskDraft.anexos), cor: '#718269' }
    apply(current => ({ ...current, events: [...rows(current.events), event], tasks: current.tasks.filter(task => task.id !== taskDraft.id) })); setTaskDraft(null)
  }

  function seedProject(): Row { return { id: '', nome: '', cor: '#73866c', icone: 'folder', parent_id: '', ordem: projects.length, secoes: [], imagem_url: '', imagem_nome: '', imagem_mime: '', ativo: true } }
  function saveProject(event: FormEvent) {
    event.preventDefault(); if (!projectDraft || !String(projectDraft.nome || '').trim()) return
    const next = { ...projectDraft, id: projectDraft.id || uid('p'), nome: String(projectDraft.nome).trim(), ordem: Number(projectDraft.ordem ?? projects.length), secoes: rows(projectDraft.secoes).map(String).filter(Boolean), ativo: true }
    apply(current => ({ ...current, projects: rows(current.projects).some(item => projectId(item) === String(next.id)) ? rows(current.projects).map(item => projectId(item) === String(next.id) ? next : item) : [...rows(current.projects), next] })); setProjectDraft(null)
  }
  function deleteProject() {
    if (!projectDraft?.id || !confirm('Excluir este projeto? As tarefas irão para a Entrada e os subprojetos para a raiz.')) return
    const id = String(projectDraft.id)
    apply(current => ({ ...current, projects: rows(current.projects).filter(item => projectId(item) !== id).map(item => String(item.parent_id || '') === id ? { ...item, parent_id: '' } : item), tasks: current.tasks.map(task => String(task.projeto_id || '') === id ? { ...task, projeto_id: 'entrada', secao: '' } : task) })); setProjectDraft(null)
  }
  function moveProject(id: string, amount: number) {
    const ordered = [...projects]; const index = ordered.findIndex(item => projectId(item) === id); const target = index + amount; if (index < 0 || target < 0 || target >= ordered.length) return
    ;[ordered[index], ordered[target]] = [ordered[target], ordered[index]]
    apply(current => ({ ...current, projects: rows(current.projects).map(item => ({ ...item, ordem: ordered.findIndex(sorted => projectId(sorted) === projectId(item)) >= 0 ? ordered.findIndex(sorted => projectId(sorted) === projectId(item)) : Number(item.ordem || 0) })) }))
  }
  async function chooseProjectImage(file?: File) { if (!file || !projectDraft) return; try { const data = await resizeProjectImage(file); setProjectDraft({ ...projectDraft, imagem_url: data, imagem_nome: file.name, imagem_mime: 'image/webp' }) } catch { alert('Não foi possível processar a imagem.') } }
  function addSection() { if (!projectDraft || !newSection.trim()) return; setProjectDraft({ ...projectDraft, secoes: [...rows(projectDraft.secoes).map(String), newSection.trim()] }); setNewSection('') }
  function updateSection(index: number, value: string) { if (!projectDraft) return; const old = String(rows(projectDraft.secoes)[index] || ''); const nextSections = rows(projectDraft.secoes).map(String).map((item, i) => i === index ? value : item); setProjectDraft({ ...projectDraft, secoes: nextSections }); if (old !== value && projectDraft.id) apply(current => ({ ...current, tasks: current.tasks.map(task => String(task.projeto_id) === String(projectDraft.id) && String(task.secao || '') === old ? { ...task, secao: value } : task) })) }
  function removeSection(index: number) { if (!projectDraft) return; const name = String(rows(projectDraft.secoes)[index] || ''); if (!confirm(`Excluir a seção “${name}”? As tarefas permanecem no projeto.`)) return; setProjectDraft({ ...projectDraft, secoes: rows(projectDraft.secoes).filter((_, i) => i !== index) }); if (projectDraft.id) apply(current => ({ ...current, tasks: current.tasks.map(task => String(task.projeto_id) === String(projectDraft.id) && String(task.secao || '') === name ? { ...task, secao: '' } : task) })) }
  function moveSection(index: number, amount: number) { if (!projectDraft) return; const list = rows(projectDraft.secoes).map(String); const target = index + amount; if (target < 0 || target >= list.length) return; [list[index], list[target]] = [list[target], list[index]]; setProjectDraft({ ...projectDraft, secoes: list }) }

  function applyInterval() { updateDraft({ repeticao: `intervalo:${Math.max(1, intervalDays)}` }) }
  function applyWeekdays() { if (!weekdays.length) return; updateDraft({ repeticao: `semanal:${[...weekdays].sort().join(',')}` }) }

  function projectDepth(project: Row) { let depth = 0, parent = String(project.parent_id || ''); const seen = new Set<string>(); while (parent && depth < 5 && !seen.has(parent)) { seen.add(parent); depth += 1; parent = String(projects.find(item => projectId(item) === parent)?.parent_id || '') } return depth }

  return <>
    <button onClick={show} style={{ position: 'fixed', right: 22, bottom: 22, zIndex: 8050, ...button, fontWeight: 700, boxShadow: '0 8px 24px rgba(0,0,0,.14)' }}>Tarefas originais +</button>
    {open && <div style={modal} onMouseDown={close}><section style={sheet} onMouseDown={event => event.stopPropagation()}>
      <header style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}><div><h2 style={{ margin: 0 }}>Funções completas de Tarefas e Projetos</h2><p style={{ margin: '4px 0 0', opacity: .65, fontSize: 12 }}>Paridade com o aplicativo original: editor rico, recorrência personalizada, concluídas globais, hierarquia, imagens e colunas.</p></div><button style={button} onClick={close}>Fechar</button></header>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, margin: '16px 0' }}>{([['active','Tarefas ativas'],['completed','Concluídas'],['projects','Projetos']] as const).map(([key,label]) => <button key={key} style={{ ...button, background: tab === key ? 'var(--bg-hover)' : 'var(--bg-card)' }} onClick={() => setTab(key)}>{label}</button>)}</div>

      {tab !== 'projects' && <div style={{ display: 'grid', gap: 12 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(180px,1fr) minmax(160px,240px) auto', gap: 8 }}><input style={input} placeholder="Pesquisar tarefas, descrição e notas" value={query} onChange={event => setQuery(event.target.value)} /><select style={input} value={filterProject} onChange={event => setFilterProject(event.target.value)}><option value="all">Todos os projetos</option><option value="entrada">Entrada</option>{projects.map(project => <option value={projectId(project)} key={projectId(project)}>{projectName(project)}</option>)}</select>{tab === 'active' && <button style={button} onClick={newTask}>＋ Nova tarefa</button>}</div>
        <div style={{ display: 'grid', gap: 7 }}>{filteredTasks.sort((a,b) => Number(a.ordem || 0)-Number(b.ordem || 0)).map(task => { const project = projects.find(item => projectId(item) === String(task.projeto_id || '')); return <div key={task.id} style={{ ...card, display: 'grid', gridTemplateColumns: '30px minmax(0,1fr) auto', gap: 10, alignItems: 'center' }}><button style={{ ...button, width: 30, height: 30, padding: 0, borderRadius: 99 }} onClick={() => task.concluida ? reopen(task) : complete(task)}>{task.concluida ? '✓' : '○'}</button><button style={{ border: 0, background: 'transparent', color: 'inherit', textAlign: 'left', cursor: 'pointer', minWidth: 0 }} onClick={() => editTask(task)}><strong style={{ display: 'block' }}>{task.titulo}</strong><small style={{ display: 'block', opacity: .6, marginTop: 3 }}>{localDateLabel(task.data_vencimento)}{project ? ` · ${projectName(project)}` : ' · Entrada'}{task.secao ? ` · ${task.secao}` : ''}{task.repeticao ? ` · ${task.repeticao}` : ''}{task.descricao ? ` · ${cleanText(task.descricao).slice(0,70)}` : ''}</small></button><button style={button} onClick={() => editTask(task)}>Editar</button></div> })}{!filteredTasks.length && <div style={{ ...card, opacity: .65, textAlign: 'center' }}>{tab === 'completed' ? 'Nenhuma tarefa concluída neste filtro.' : 'Nenhuma tarefa ativa neste filtro.'}</div>}</div>
      </div>}

      {tab === 'projects' && <div style={{ display: 'grid', gap: 12 }}><div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><span style={{ fontSize: 12, opacity: .65 }}>Use ↑ ↓ para reordenar. O recuo mostra a hierarquia de projetos.</span><button style={button} onClick={() => { setProjectDraft(seedProject()); setNewSection('') }}>＋ Novo projeto</button></div><div style={{ display: 'grid', gap: 6 }}>{projects.map((project,index) => <div key={projectId(project)} style={{ ...card, display: 'grid', gridTemplateColumns: '44px minmax(0,1fr) auto', gap: 10, alignItems: 'center', marginLeft: projectDepth(project) * 18 }}><div style={{ width: 42, height: 42, borderRadius: 10, background: project.imagem_url ? `center/cover url(${project.imagem_url})` : String(project.cor || '#73866c'), display: 'grid', placeItems: 'center', color: '#fff' }}>{project.imagem_url ? '' : String(project.icone || '●').slice(0,2)}</div><button style={{ border: 0, background: 'transparent', color: 'inherit', textAlign: 'left', cursor: 'pointer' }} onClick={() => { setProjectDraft({ ...project, secoes: [...rows(project.secoes)] }); setNewSection('') }}><strong>{projectName(project)}</strong><small style={{ display: 'block', opacity: .6 }}>{snapshot.tasks.filter(task => String(task.projeto_id) === projectId(project)).length} tarefas · {rows(project.secoes).length} seções</small></button><span style={{ display: 'flex', gap: 5 }}><button style={button} disabled={index===0} onClick={() => moveProject(projectId(project),-1)}>↑</button><button style={button} disabled={index===projects.length-1} onClick={() => moveProject(projectId(project),1)}>↓</button><button style={button} onClick={() => { setProjectDraft({ ...project, secoes: [...rows(project.secoes)] }); setNewSection('') }}>Editar</button></span></div>)}</div></div>}

      {taskDraft && <div style={{ ...modal, zIndex: 10120 }} onMouseDown={() => setTaskDraft(null)}><form style={{ ...sheet, width: 'min(900px,96vw)', display: 'grid', gridTemplateColumns: 'minmax(0,1.6fr) minmax(240px,.7fr)', gap: 18 }} onSubmit={saveTask} onMouseDown={event => event.stopPropagation()}>
        <div style={{ display: 'grid', gap: 12, alignContent: 'start' }}><h3 style={{ margin: 0 }}>{snapshot.tasks.some(task => task.id === taskDraft.id) ? 'Editar tarefa' : 'Nova tarefa'}</h3><input autoFocus style={{ ...input, fontSize: 20, fontWeight: 750 }} placeholder="Título da tarefa" value={taskDraft.titulo} onChange={event => updateDraft({ titulo: event.target.value })} /><div><span style={{ fontSize: 11, fontWeight: 700 }}>Descrição</span><RichEditor value={String(taskDraft.descricao || '')} onChange={value => updateDraft({ descricao: value })} /></div>
          <section style={card}><div style={{ display: 'flex', justifyContent: 'space-between' }}><strong>Passos / subtarefas</strong><button type="button" style={button} onClick={addSubtask}>＋ Passo</button></div><div style={{ display: 'grid', gap: 7, marginTop: 8 }}>{rows(taskDraft.subtarefas).map((sub,index) => <div key={String(sub.id||index)} style={{ borderTop: index ? '1px solid var(--divider)' : '0', paddingTop: index ? 8 : 0 }}><div style={{ display: 'grid', gridTemplateColumns: '28px 1fr auto auto', gap: 6, alignItems: 'center' }}><input type="checkbox" checked={sub.concluida===true} onChange={event => updateSubtask(index,{concluida:event.target.checked})}/><input style={input} value={String(sub.titulo||'')} onChange={event => updateSubtask(index,{titulo:event.target.value})}/><button type="button" style={button} onClick={() => addNested(index)}>＋ etapa</button><button type="button" style={button} onClick={() => removeSubtask(index)}>×</button></div>{rows(sub.subtarefas).length>0&&<div style={{ display:'grid',gap:5,margin:'7px 0 0 35px' }}>{rows(sub.subtarefas).map((nested,nestedIndex)=><div key={String(nested.id||nestedIndex)} style={{display:'grid',gridTemplateColumns:'24px 1fr 28px',gap:5}}><input type="checkbox" checked={nested.concluida===true} onChange={event=>updateSubtask(index,{subtarefas:rows(sub.subtarefas).map((item,i)=>i===nestedIndex?{...item,concluida:event.target.checked}:item)})}/><input style={input} value={String(nested.titulo||'')} onChange={event=>updateSubtask(index,{subtarefas:rows(sub.subtarefas).map((item,i)=>i===nestedIndex?{...item,titulo:event.target.value}:item)})}/><button type="button" style={button} onClick={()=>updateSubtask(index,{subtarefas:rows(sub.subtarefas).filter((_,i)=>i!==nestedIndex)})}>×</button></div>)}</div>}</div>)}</div></section>
          <section style={card}><strong>Notas rápidas</strong><div style={{ display:'grid',gap:7,marginTop:8 }}>{rows(taskDraft.notas).map((note,index)=><div key={String(note.id||index)} style={{...card,padding:9}}><div dangerouslySetInnerHTML={{__html:String(note.texto||note.text||note)}}/><button type="button" style={{...button,marginTop:6}} onClick={()=>removeNote(index)}>Excluir nota</button></div>)}</div><div style={{ marginTop: 10 }}><RichEditor value={noteDraft} onChange={setNoteDraft} minHeight={70}/><button type="button" style={{...button,marginTop:6}} onClick={addNote}>Adicionar nota</button></div></section>
          <section style={card}><div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}><strong>Anexos</strong><label style={button}>{busy?'Enviando…':'Anexar arquivos'}<input hidden type="file" multiple disabled={busy} onChange={event=>void uploadAttachments(event.target.files)}/></label></div><div style={{display:'grid',gap:6,marginTop:8}}>{rows(taskDraft.anexos).map((file,index)=><div key={String(file.idDrive||index)} style={{display:'flex',justifyContent:'space-between',gap:8,alignItems:'center'}}><a href={String(file.url||'#')} target="_blank" rel="noreferrer" style={{color:'inherit'}}>{String(file.nome||'Arquivo')}</a><span style={{display:'flex',gap:5}}><button type="button" style={button} onClick={()=>void renameAttachment(index)}>Renomear</button><button type="button" style={button} onClick={()=>void removeAttachment(index)}>×</button></span></div>)}</div></section>
        </div>
        <aside style={{ display:'grid',gap:10,alignContent:'start' }}><strong style={{fontSize:11,textTransform:'uppercase',opacity:.6}}>Organização</strong><label>Projeto<select style={input} value={String(taskDraft.projeto_id||'entrada')} onChange={event=>updateDraft({projeto_id:event.target.value,secao:''})}><option value="entrada">Entrada</option>{projects.map(project=><option key={projectId(project)} value={projectId(project)}>{projectName(project)}</option>)}</select></label><label>Seção<select style={input} value={String(taskDraft.secao||'')} onChange={event=>updateDraft({secao:event.target.value})}><option value="">Sem seção</option>{rows(projects.find(project=>projectId(project)===String(taskDraft.projeto_id))?.secoes).map(section=><option key={String(section)}>{String(section)}</option>)}</select></label><label>Data e horário<input style={input} type="datetime-local" value={taskDraft.data_vencimento?String(taskDraft.data_vencimento).includes('T')?String(taskDraft.data_vencimento).slice(0,16):`${taskDay(taskDraft)}T09:00`:''} onChange={event=>updateDraft({data_vencimento:event.target.value})}/></label><label>Prioridade<select style={input} value={Number(taskDraft.prioridade||4)} onChange={event=>updateDraft({prioridade:Number(event.target.value)})}><option value={1}>P1 · Urgente</option><option value={2}>P2 · Alta</option><option value={3}>P3 · Média</option><option value={4}>P4 · Normal</option></select></label><label>Repetição<select style={input} value={['','diariamente','semanalmente','mensalmente','anualmente'].includes(String(taskDraft.repeticao||''))?String(taskDraft.repeticao||''):'custom'} onChange={event=>event.target.value!=='custom'&&updateDraft({repeticao:event.target.value})}><option value="">Não repete</option><option value="diariamente">Diariamente</option><option value="semanalmente">Semanalmente</option><option value="mensalmente">Mensalmente</option><option value="anualmente">Anualmente</option><option value="custom">Personalizada</option></select></label><div style={card}><small style={{fontWeight:700}}>Regra personalizada</small><div style={{marginTop:8}}><span style={{fontSize:11,opacity:.6}}>Dias da semana</span><div style={{display:'flex',gap:4,marginTop:5}}>{['D','S','T','Q','Q','S','S'].map((label,day)=><button type="button" key={`${label}-${day}`} style={{...button,padding:'6px 8px',background:weekdays.includes(day)?'var(--bg-hover)':'var(--bg-card)'}} onClick={()=>setWeekdays(value=>value.includes(day)?value.filter(item=>item!==day):[...value,day])}>{label}</button>)}</div><button type="button" style={{...button,width:'100%',marginTop:6}} onClick={applyWeekdays}>Aplicar dias</button></div><div style={{display:'grid',gridTemplateColumns:'1fr auto',gap:5,marginTop:10}}><input style={input} type="number" min="1" value={intervalDays} onChange={event=>setIntervalDays(Number(event.target.value)||1)}/><button type="button" style={button} onClick={applyInterval}>A cada N dias</button></div><small style={{display:'block',marginTop:7,opacity:.6}}>Regra atual: {taskDraft.repeticao||'nenhuma'}</small></div><label style={{display:'flex',gap:7,alignItems:'center'}}><input type="checkbox" checked={taskDraft.ocultar_agenda===true} onChange={event=>updateDraft({ocultar_agenda:event.target.checked})}/> Não mostrar na agenda</label><button type="button" style={button} onClick={taskToLocalEvent}>Transformar em compromisso local</button><footer style={{display:'flex',justifyContent:'space-between',gap:6,marginTop:8}}><span>{snapshot.tasks.some(task=>task.id===taskDraft.id)&&<button type="button" style={{...button,color:'var(--mai-danger)'}} onClick={removeTask}>Excluir</button>}</span><span style={{display:'flex',gap:6}}><button type="button" style={button} onClick={()=>setTaskDraft(null)}>Cancelar</button><button type="submit" style={button}>Salvar</button></span></footer></aside>
      </form></div>}

      {projectDraft && <div style={{ ...modal, zIndex: 10120 }} onMouseDown={() => setProjectDraft(null)}><form style={{ ...sheet, width:'min(760px,96vw)', display:'grid', gap:12 }} onSubmit={saveProject} onMouseDown={event=>event.stopPropagation()}><header style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}><h3 style={{margin:0}}>{projectDraft.id?'Editar projeto':'Novo projeto'}</h3><button type="button" style={button} onClick={()=>setProjectDraft(null)}>Fechar</button></header><input autoFocus style={{...input,fontSize:19,fontWeight:750}} placeholder="Nome do projeto" value={String(projectDraft.nome||'')} onChange={event=>setProjectDraft({...projectDraft,nome:event.target.value})}/><div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:8}}><label>Projeto pai<select style={input} value={String(projectDraft.parent_id||'')} onChange={event=>setProjectDraft({...projectDraft,parent_id:event.target.value})}><option value="">Nenhum</option>{projects.filter(item=>projectId(item)!==String(projectDraft.id)).map(item=><option key={projectId(item)} value={projectId(item)}>{projectName(item)}</option>)}</select></label><label>Ícone<select style={input} value={String(projectDraft.icone||'folder')} onChange={event=>setProjectDraft({...projectDraft,icone:event.target.value})}>{['folder','work','home','favorite','rocket_launch','school','fitness_center','attach_money','palette','travel_explore','code','psychology'].map(icon=><option key={icon}>{icon}</option>)}</select></label><label>Cor<input style={input} type="color" value={String(projectDraft.cor||'#73866c')} onChange={event=>setProjectDraft({...projectDraft,cor:event.target.value})}/></label></div><section style={card}><strong>Imagem do projeto</strong><div style={{display:'flex',gap:12,alignItems:'center',marginTop:8}}><div style={{width:82,height:82,borderRadius:12,background:projectDraft.imagem_url?`center/cover url(${projectDraft.imagem_url})`:String(projectDraft.cor||'#73866c'),display:'grid',placeItems:'center',color:'#fff'}}>{projectDraft.imagem_url?'':String(projectDraft.icone||'folder')}</div><div><label style={button}>Escolher JPG, PNG ou WebP<input hidden type="file" accept="image/png,image/jpeg,image/webp" onChange={event=>void chooseProjectImage(event.target.files?.[0])}/></label>{projectDraft.imagem_url&&<button type="button" style={{...button,marginLeft:6}} onClick={()=>setProjectDraft({...projectDraft,imagem_url:'',imagem_nome:'',imagem_mime:''})}>Remover imagem</button>}<small style={{display:'block',marginTop:7,opacity:.6}}>A imagem é reduzida para 256 × 256 antes de salvar.</small></div></div></section><section style={card}><div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}><strong>Colunas / seções</strong><span style={{display:'flex',gap:5}}><input style={{...input,width:180}} value={newSection} onChange={event=>setNewSection(event.target.value)} placeholder="Nova seção"/><button type="button" style={button} onClick={addSection}>Adicionar</button></span></div><div style={{display:'grid',gap:6,marginTop:8}}>{rows(projectDraft.secoes).map((section,index)=><div key={`${section}-${index}`} style={{display:'grid',gridTemplateColumns:'1fr auto auto auto',gap:5}}><input style={input} value={String(section)} onChange={event=>updateSection(index,event.target.value)}/><button type="button" style={button} disabled={index===0} onClick={()=>moveSection(index,-1)}>←</button><button type="button" style={button} disabled={index===rows(projectDraft.secoes).length-1} onClick={()=>moveSection(index,1)}>→</button><button type="button" style={button} onClick={()=>removeSection(index)}>Excluir</button></div>)}</div></section><footer style={{display:'flex',justifyContent:'space-between',gap:8}}><span>{projectDraft.id&&<button type="button" style={{...button,color:'var(--mai-danger)'}} onClick={deleteProject}>Excluir projeto</button>}</span><span style={{display:'flex',gap:6}}><button type="button" style={button} onClick={()=>setProjectDraft(null)}>Cancelar</button><button type="submit" style={button}>Salvar projeto</button></span></footer></form></div>}
    </section></div>}
  </>
}
