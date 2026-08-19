'use client'

import { FormEvent, useMemo, useState } from 'react'
import type { MaiState } from '../../lib/v2/state'
import type { Row } from './app-types'
import { MaiIcon } from './MaiIcons'
import styles from './unified.module.css'

const rows = (value: unknown): Row[] => Array.isArray(value) ? value as Row[] : []
const COLORS = [
  ['#60765a', 'Sálvia'], ['#486b8a', 'Azul'], ['#4f5b57', 'Grafite'], ['#9b7757', 'Areia'],
  ['#765d82', 'Ameixa'], ['#a85f4f', 'Terracota'], ['#397b78', 'Petróleo'], ['#a26373', 'Rosa'],
  ['#b38b2e', 'Mostarda'], ['#6f7f9a', 'Ardósia'], ['#3f7a59', 'Floresta'], ['#925d3f', 'Cobre'],
] as const
const ICONS = ['folder', 'work', 'home', 'rocket_launch', 'target', 'school', 'fitness_center', 'payments', 'favorite', 'travel', 'lightbulb', 'inventory_2']

type SectionDraft = { id: string; name: string; original: string }
type Tab = 'details' | 'sections'
type Props = {
  state: MaiState
  commit: (change: (current: MaiState) => MaiState) => void
  onClose: () => void
  onSaved: (id: string) => void
  onRemoved: () => void
  projectId?: string
  parentId?: string
  initialTab?: Tab
}

function descendants(projects: Row[], rootId: string) {
  const result = new Set<string>()
  const walk = (parent: string) => projects.filter(item => String(item.parent_id || '') === parent).forEach(item => {
    const id = String(item.id)
    if (result.has(id)) return
    result.add(id)
    walk(id)
  })
  walk(rootId)
  return result
}

function resizeProjectImage(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = reject
    reader.onload = () => {
      const image = new Image()
      image.onerror = reject
      image.onload = () => {
        const canvas = document.createElement('canvas')
        canvas.width = 320
        canvas.height = 320
        const context = canvas.getContext('2d')
        if (!context) return reject(new Error('Canvas indisponível'))
        const side = Math.min(image.width, image.height)
        context.drawImage(image, (image.width - side) / 2, (image.height - side) / 2, side, side, 0, 0, 320, 320)
        resolve(canvas.toDataURL('image/webp', .84))
      }
      image.src = String(reader.result || '')
    }
    reader.readAsDataURL(file)
  })
}

export function ProjectDrawer({ state, commit, onClose, onSaved, onRemoved, projectId, parentId, initialTab = 'details' }: Props) {
  const projects = rows(state.projects)
  const existing = projects.find(item => String(item.id) === String(projectId || ''))
  const [tab, setTab] = useState<Tab>(initialTab)
  const [draft, setDraft] = useState<Row>(() => existing ? {
    ...existing,
    parent_id: existing.parent_id || '',
    cor: existing.cor || '#60765a',
    icone: existing.icone || 'folder',
    imagem_url: existing.imagem_url || '',
  } : { nome: '', cor: '#60765a', icone: 'folder', imagem_url: '', parent_id: parentId || '' })
  const [sectionDrafts, setSectionDrafts] = useState<SectionDraft[]>(() => rows(existing?.secoes).map((name, index) => ({ id: `saved-${index}`, name: String(name), original: String(name) })))
  const [sectionName, setSectionName] = useState('')
  const [imageBusy, setImageBusy] = useState(false)

  const blockedParents = useMemo(() => existing ? descendants(projects, String(existing.id)) : new Set<string>(), [projects, existing])
  const parentOptions = projects.filter(item => item.ativo !== false && String(item.id) !== String(existing?.id || '') && !blockedParents.has(String(item.id)))

  function addSection() {
    const name = sectionName.trim()
    if (!name || sectionDrafts.some(item => item.name.toLocaleLowerCase('pt-BR') === name.toLocaleLowerCase('pt-BR'))) return
    setSectionDrafts(current => [...current, { id: `new-${crypto.randomUUID()}`, name, original: '' }])
    setSectionName('')
  }

  function renameSection(id: string, name: string) { setSectionDrafts(current => current.map(item => item.id === id ? { ...item, name } : item)) }
  function removeSection(id: string) { setSectionDrafts(current => current.filter(item => item.id !== id)) }
  function moveSection(id: string, delta: number) {
    setSectionDrafts(current => {
      const index = current.findIndex(item => item.id === id)
      const target = Math.max(0, Math.min(current.length - 1, index + delta))
      if (index < 0 || index === target) return current
      const next = [...current]
      const [moved] = next.splice(index, 1)
      next.splice(target, 0, moved)
      return next
    })
  }

  async function chooseImage(file?: File) {
    if (!file) return
    setImageBusy(true)
    try {
      const imagem_url = await resizeProjectImage(file)
      setDraft(current => ({ ...current, imagem_url }))
    } finally { setImageBusy(false) }
  }

  function save(event: FormEvent) {
    event.preventDefault()
    const name = String(draft.nome || '').trim()
    if (!name) return
    const cleanSections = sectionDrafts.map(item => ({ ...item, name: item.name.trim() })).filter(item => item.name)
    const uniqueSections = cleanSections.filter((item, index, list) => list.findIndex(candidate => candidate.name.toLocaleLowerCase('pt-BR') === item.name.toLocaleLowerCase('pt-BR')) === index)
    const id = String(existing?.id || `p-${crypto.randomUUID()}`)
    const nextProject = { ...existing, ...draft, id, nome: name, cor: draft.cor || '#60765a', icone: draft.icone || 'folder', imagem_url: draft.imagem_url || '', parent_id: draft.parent_id || '', ordem: Number(existing?.ordem ?? projects.filter(item => item.ativo !== false).length), secoes: uniqueSections.map(item => item.name), ativo: true }

    commit(current => {
      const currentProjects = rows(current.projects)
      const nextProjects = existing ? currentProjects.map(item => String(item.id) === id ? nextProject : item) : [...currentProjects, nextProject]
      const originalNames = new Set(rows(existing?.secoes).map(String))
      const renameMap = new Map(uniqueSections.filter(item => item.original).map(item => [item.original, item.name]))
      const nextTasks = existing ? current.tasks.map(task => {
        if (String(task.projeto_id || '') !== id || !task.secao) return task
        const currentSection = String(task.secao)
        if (renameMap.has(currentSection)) return { ...task, secao: renameMap.get(currentSection) || '' }
        if (originalNames.has(currentSection)) return { ...task, secao: '' }
        return task
      }) : current.tasks
      return { ...current, projects: nextProjects, tasks: nextTasks }
    })
    onSaved(id)
  }

  function archive() {
    if (!existing || !confirm(`Arquivar “${existing.nome}”? As tarefas permanecem salvas.`)) return
    commit(current => ({ ...current, projects: rows(current.projects).map(item => String(item.id) === String(existing.id) ? { ...item, ativo: false } : item) }))
    onRemoved()
  }

  function remove() {
    if (!existing || !confirm(`Excluir “${existing.nome}”? As tarefas serão movidas para Entrada.`)) return
    const id = String(existing.id)
    const fallbackParent = String(existing.parent_id || '')
    commit(current => ({ ...current, projects: rows(current.projects).filter(item => String(item.id) !== id).map(item => String(item.parent_id || '') === id ? { ...item, parent_id: fallbackParent } : item), tasks: current.tasks.map(task => String(task.projeto_id || '') === id ? { ...task, projeto_id: 'entrada', secao: '' } : task) }))
    onRemoved()
  }

  return <div className={styles.modalLayer} onMouseDown={onClose}>
    <form className={`${styles.modalCard} mai-project-settings-drawer`} onSubmit={save} onMouseDown={event => event.stopPropagation()}>
      <header className={styles.modalHeader}><div><h2>{existing ? 'Configurar projeto' : parentId ? 'Novo subprojeto' : 'Novo projeto'}</h2></div><button type="button" onClick={onClose}>×</button></header>
      <div className="mai-project-settings-tabs"><button type="button" data-active={tab === 'details'} onClick={() => setTab('details')}>Geral</button><button type="button" data-active={tab === 'sections'} onClick={() => setTab('sections')}>Seções <span>{sectionDrafts.length || ''}</span></button></div>

      {tab === 'details' ? <div className="mai-project-settings-body">
        <div className="mai-project-identity-preview"><div className="mai-project-avatar" style={{ background: draft.cor || '#60765a' }}>{draft.imagem_url ? <img src={draft.imagem_url} alt="" /> : <MaiIcon name={String(draft.icone || 'folder')} size={28} />}</div><div><strong>{draft.nome || 'Novo projeto'}</strong><span>{draft.parent_id ? 'Subprojeto' : 'Projeto'}</span></div></div>
        <label className="mai-project-field"><span>Nome</span><input autoFocus value={draft.nome || ''} onChange={event => setDraft({ ...draft, nome: event.target.value })} placeholder="Nome do projeto" /></label>
        <label className="mai-project-field"><span>Projeto pai</span><select value={draft.parent_id || ''} onChange={event => setDraft({ ...draft, parent_id: event.target.value })}><option value="">Nenhum — projeto principal</option>{parentOptions.map(item => <option key={String(item.id)} value={item.id}>{item.nome}</option>)}</select></label>
        <section className="mai-project-config-section"><header><strong>Cor</strong><span>Escolha uma cor pronta</span></header><div className="mai-project-color-grid">{COLORS.map(([color, label]) => <button type="button" key={color} title={label} data-active={String(draft.cor) === color} onClick={() => setDraft({ ...draft, cor: color })}><i style={{ background: color }} /><span>{label}</span></button>)}</div></section>
        <section className="mai-project-config-section"><header><strong>Ícone</strong><span>Identidade visual do projeto</span></header><div className="mai-project-icon-grid">{ICONS.map(icon => <button type="button" key={icon} data-active={String(draft.icone) === icon && !draft.imagem_url} onClick={() => setDraft({ ...draft, icone: icon, imagem_url: '' })}><MaiIcon name={icon} size={19} /></button>)}</div></section>
        <section className="mai-project-config-section"><header><strong>Imagem</strong><span>Opcional; substitui o ícone</span></header><div className="mai-project-image-actions"><label>{imageBusy ? 'Processando…' : 'Escolher imagem'}<input hidden type="file" accept="image/*" disabled={imageBusy} onChange={event => void chooseImage(event.target.files?.[0])} /></label>{draft.imagem_url ? <button type="button" onClick={() => setDraft({ ...draft, imagem_url: '' })}>Remover imagem</button> : null}</div></section>
      </div> : <div className="mai-project-settings-body"><section className="mai-project-config-section mai-sections-manager"><header><strong>Seções do projeto</strong><span>Use seções para organizar a lista e o quadro.</span></header><div className="mai-add-section"><input value={sectionName} onChange={event => setSectionName(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); addSection() } }} placeholder="Nova seção" /><button type="button" onClick={addSection}>Adicionar</button></div><div className="mai-section-list">{sectionDrafts.map((section, index) => <div key={section.id}><span className="mai-section-grip">⋮⋮</span><input value={section.name} onChange={event => renameSection(section.id, event.target.value)} /><div><button type="button" disabled={index === 0} onClick={() => moveSection(section.id, -1)}>↑</button><button type="button" disabled={index === sectionDrafts.length - 1} onClick={() => moveSection(section.id, 1)}>↓</button><button type="button" className="mai-section-remove" onClick={() => removeSection(section.id)}>×</button></div></div>)}</div>{!sectionDrafts.length ? <div className="mai-project-empty-sections"><strong>Sem seções</strong><span>Você pode continuar usando uma lista simples ou criar seções aqui.</span></div> : null}</section></div>}

      <footer className="mai-project-settings-footer"><div>{existing ? <><button type="button" onClick={archive}>Arquivar</button><button type="button" className={styles.dangerButton} onClick={remove}>Excluir</button></> : <span />}</div><div><button type="button" className={styles.secondaryButton} onClick={onClose}>Cancelar</button><button className={styles.primaryButton}>{existing ? 'Salvar alterações' : 'Criar projeto'}</button></div></footer>
    </form>
  </div>
}
