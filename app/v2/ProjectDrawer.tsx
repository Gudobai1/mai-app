'use client'

import { useMemo, useRef, useState } from 'react'
import type { MaiState } from '../../lib/v2/state'
import type { Row } from './app-types'
import { drivePreviewUrl, trashDriveAsset, uploadDataUrlToDrive } from './DriveAsset'
import { MaiIcon } from './MaiIcons'
import styles from './unified.module.css'
import { useAutosaveDraft } from './useAutosaveDraft'

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

export function ProjectDrawer({ state, commit, onClose, onRemoved, projectId, parentId, initialTab = 'details' }: Props) {
  const projects = rows(state.projects)
  const existing = projects.find(item => String(item.id) === String(projectId || ''))
  const [tab, setTab] = useState<Tab>(initialTab)
  const [draft, setDraft] = useState<Row>(() => existing ? {
    ...existing,
    parent_id: existing.parent_id || '',
    cor: existing.cor || '#60765a',
    icone: existing.icone || 'folder',
    imagem_url: existing.imagem_url || '',
    _persisted: true,
  } : { id:`p-${crypto.randomUUID()}`, nome: '', cor: '#60765a', icone: 'folder', imagem_url: '', parent_id: parentId || '', _persisted:false })
  const [sectionDrafts, setSectionDrafts] = useState<SectionDraft[]>(() => rows(existing?.secoes).map((name, index) => ({ id: `saved-${index}`, name: String(name), original: String(name) })))
  const lastSectionsRef = useRef(new Map(sectionDrafts.map(item => [item.id, item.name])))
  const [sectionName, setSectionName] = useState('')
  const [imageBusy, setImageBusy] = useState(false)

  const blockedParents = useMemo(() => existing ? descendants(projects, String(existing.id)) : new Set<string>(), [projects, existing])
  const parentOptions = projects.filter(item => item.ativo !== false && String(item.id) !== String(draft.id || '') && !blockedParents.has(String(item.id)))

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
    const previous = String(draft.imagem_url || '')
    try {
      const dataUrl = await resizeProjectImage(file)
      const baseName = String(draft.nome || file.name.replace(/\.[^.]+$/, '') || 'Projeto').trim().replace(/[^a-zA-Z0-9À-ÿ _-]+/g, '').slice(0, 70) || 'Projeto'
      const asset = await uploadDataUrlToDrive(dataUrl, `MAI - Projeto - ${baseName}.webp`, 'image/webp')
      setDraft(current => ({ ...current, imagem_url: drivePreviewUrl(asset.idDrive) }))
      if (previous) void trashDriveAsset(previous)
    } finally { setImageBusy(false) }
  }

  function selectIcon(icon: string) {
    const previous = String(draft.imagem_url || '')
    setDraft(current => ({ ...current, icone: icon, imagem_url: '' }))
    if (previous) void trashDriveAsset(previous)
  }

  function clearImage() {
    const previous = String(draft.imagem_url || '')
    setDraft(current => ({ ...current, imagem_url: '' }))
    if (previous) void trashDriveAsset(previous)
  }

  function persistProject(snapshot:{project:Row;sections:SectionDraft[]}) {
    const name = String(snapshot.project.nome || '').trim()
    if (!name) return
    const cleanSections = snapshot.sections.map(item => ({ ...item, name: item.name.trim() })).filter(item => item.name)
    const uniqueSections = cleanSections.filter((item, index, list) => list.findIndex(candidate => candidate.name.toLocaleLowerCase('pt-BR') === item.name.toLocaleLowerCase('pt-BR')) === index)
    const id = String(snapshot.project.id)
    const {_persisted:_ignored,...cleanProject}=snapshot.project
    const nextProject = { ...cleanProject, id, nome: name, cor: cleanProject.cor || '#60765a', icone: cleanProject.icone || 'folder', imagem_url: cleanProject.imagem_url || '', parent_id: cleanProject.parent_id || '', ordem: Number(cleanProject.ordem ?? projects.filter(item => item.ativo !== false).length), secoes: uniqueSections.map(item => item.name), ativo: true }
    const previousSections = new Map(lastSectionsRef.current)
    const nextSections = new Map(uniqueSections.map(item => [item.id,item.name]))
    const renameMap = new Map<string,string>()
    const removed = new Set<string>()
    previousSections.forEach((oldName,sectionId) => {
      const nextName=nextSections.get(sectionId)
      if(nextName == null) removed.add(oldName)
      else if(nextName!==oldName) renameMap.set(oldName,nextName)
    })

    commit(current => {
      const currentProjects = rows(current.projects)
      const nextProjects = currentProjects.some(item=>String(item.id)===id) ? currentProjects.map(item => String(item.id) === id ? { ...item, ...nextProject } : item) : [...currentProjects,nextProject]
      const nextTasks = current.tasks.map(task => {
        if (String(task.projeto_id || '') !== id || !task.secao) return task
        const currentSection = String(task.secao)
        if (renameMap.has(currentSection)) return { ...task, secao: renameMap.get(currentSection) || '' }
        if (removed.has(currentSection)) return { ...task, secao: '' }
        return task
      })
      return { ...current, projects: nextProjects, tasks: nextTasks }
    })
    lastSectionsRef.current=nextSections
    if(snapshot.project._persisted===false)setDraft(current=>current&&String(current.id)===id?{...current,_persisted:true}:current)
  }

  useAutosaveDraft({value:{project:draft,sections:sectionDrafts},identity:String(draft.id||''),enabled:Boolean(draft),save:persistProject})

  function archive() {
    if (!existing && draft._persisted===false) return
    if (!confirm(`Arquivar “${draft.nome}”? As tarefas permanecem salvas.`)) return
    commit(current => ({ ...current, projects: rows(current.projects).map(item => String(item.id) === String(draft.id) ? { ...item, ativo: false } : item) }))
    onRemoved()
  }

  function remove() {
    if ((!existing && draft._persisted===false) || !confirm(`Excluir “${draft.nome}”? As tarefas serão movidas para Entrada.`)) return
    const id = String(draft.id)
    const fallbackParent = String(draft.parent_id || '')
    const image = String(draft.imagem_url || '')
    commit(current => ({ ...current, projects: rows(current.projects).filter(item => String(item.id) !== id).map(item => String(item.parent_id || '') === id ? { ...item, parent_id: fallbackParent } : item), tasks: current.tasks.map(task => String(task.projeto_id || '') === id ? { ...task, projeto_id: 'entrada', secao: '' } : task) }))
    if (image) void trashDriveAsset(image)
    onRemoved()
  }

  return <div className={styles.modalLayer} onMouseDown={onClose}>
    <form className={`${styles.modalCard} mai-project-settings-drawer`} onSubmit={event=>event.preventDefault()} onMouseDown={event => event.stopPropagation()}>
      <header className={styles.modalHeader}><div><h2>{existing ? 'Configurar projeto' : parentId ? 'Novo subprojeto' : 'Novo projeto'}</h2></div><button type="button" onClick={onClose}>×</button></header>
      <div className="mai-project-settings-tabs"><button type="button" data-active={tab === 'details'} onClick={() => setTab('details')}>Geral</button><button type="button" data-active={tab === 'sections'} onClick={() => setTab('sections')}>Seções <span>{sectionDrafts.length || ''}</span></button></div>

      {tab === 'details' ? <div className="mai-project-settings-body">
        <div className="mai-project-identity-preview"><div className="mai-project-avatar" style={{ background: draft.cor || '#60765a' }}>{draft.imagem_url ? <img src={draft.imagem_url} alt="" /> : <MaiIcon name={String(draft.icone || 'folder')} size={28} />}</div><div><strong>{draft.nome || 'Novo projeto'}</strong><span>{draft.parent_id ? 'Subprojeto' : 'Projeto'}</span></div></div>
        <label className="mai-project-field"><span>Nome</span><input autoFocus value={draft.nome || ''} onChange={event => setDraft({ ...draft, nome: event.target.value })} placeholder="Nome do projeto" /></label>
        <label className="mai-project-field"><span>Projeto pai</span><select value={draft.parent_id || ''} onChange={event => setDraft({ ...draft, parent_id: event.target.value })}><option value="">Nenhum — projeto principal</option>{parentOptions.map(item => <option key={String(item.id)} value={item.id}>{item.nome}</option>)}</select></label>
        <section className="mai-project-config-section"><header><strong>Cor</strong><span>Escolha uma cor pronta</span></header><div className="mai-project-color-grid">{COLORS.map(([color, label]) => <button type="button" key={color} title={label} data-active={String(draft.cor) === color} onClick={() => setDraft({ ...draft, cor: color })}><i style={{ background: color }} /><span>{label}</span></button>)}</div></section>
        <section className="mai-project-config-section"><header><strong>Ícone</strong><span>Identidade visual do projeto</span></header><div className="mai-project-icon-grid">{ICONS.map(icon => <button type="button" key={icon} data-active={String(draft.icone) === icon && !draft.imagem_url} onClick={() => selectIcon(icon)}><MaiIcon name={icon} size={19} /></button>)}</div></section>
        <section className="mai-project-config-section"><header><strong>Imagem</strong><span>Opcional; arquivo no Google Drive, referência no MAI</span></header><div className="mai-project-image-actions"><label>{imageBusy ? 'Enviando…' : 'Escolher imagem'}<input hidden type="file" accept="image/*" disabled={imageBusy} onChange={event => { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ''; void chooseImage(file) }} /></label>{draft.imagem_url ? <button type="button" onClick={clearImage}>Remover imagem</button> : null}</div></section>
      </div> : <div className="mai-project-settings-body"><section className="mai-project-config-section mai-sections-manager"><header><strong>Seções do projeto</strong><span>Use seções para organizar a lista e o quadro.</span></header><div className="mai-add-section"><input value={sectionName} onChange={event => setSectionName(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); addSection() } }} placeholder="Nova seção" /><button type="button" onClick={addSection}>Adicionar</button></div><div className="mai-section-list">{sectionDrafts.map((section, index) => <div key={section.id}><span className="mai-section-grip">⋮⋮</span><input value={section.name} onChange={event => renameSection(section.id, event.target.value)} /><div><button type="button" disabled={index === 0} onClick={() => moveSection(section.id, -1)}>↑</button><button type="button" disabled={index === sectionDrafts.length - 1} onClick={() => moveSection(section.id, 1)}>↓</button><button type="button" className="mai-section-remove" onClick={() => removeSection(section.id)}>×</button></div></div>)}</div>{!sectionDrafts.length ? <div className="mai-project-empty-sections"><strong>Sem seções</strong><span>Você pode continuar usando uma lista simples ou criar seções aqui.</span></div> : null}</section></div>}

      <footer className="mai-project-settings-footer"><div>{draft._persisted!==false ? <><button type="button" onClick={archive}>Arquivar</button><button type="button" className={styles.dangerButton} onClick={remove}>Excluir</button></> : <span />}</div><span className="mai-autosave-status">Alterações salvas automaticamente</span></footer>
    </form>
  </div>
}
