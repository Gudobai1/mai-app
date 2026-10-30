'use client'

import { DEFAULT_COLOR } from '../../../lib/v2/palette'
import { ColorField } from '../detail/ColorField'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { MaiState } from '../../../lib/v2/state'
import { Icon } from '../../ds'
import type { Row } from '../app-types'
import { Floating, OptionList, type PickerOption } from '../detail/Pickers'
import { driveAssetUrl, drivePreviewUrl, trashDriveAsset, uploadDataUrlToDrive } from '../DriveAsset'
import { askConfirm } from '../shell/ConfirmDialog'
import styles from './ProjectEditor.module.css'

/* MAI — criar e editar projeto (popup no computador, folha no celular). */

type Props = {
  state: MaiState
  commit: (change: (current: MaiState) => MaiState) => void
  projectId?: string
  parentId?: string
  initialTab?: 'details' | 'sections'
  onClose: () => void
  onSaved: (id: string) => void
  onRemoved: () => void
}

type SectionDraft = { id: string; name: string; original: string }

const rows = (value: unknown): Row[] => (Array.isArray(value) ? (value as Row[]) : [])
const COLORS = [DEFAULT_COLOR]
const ICONS = ['folder', 'work', 'home', 'rocket_launch', 'target', 'school', 'fitness_center', 'payments', 'favorite', 'flight', 'lightbulb', 'inventory_2', 'shopping_cart', 'groups', 'code', 'brush']

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

function resizeImage(file: File) {
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
        resolve(canvas.toDataURL('image/webp', 0.84))
      }
      image.src = String(reader.result || '')
    }
    reader.readAsDataURL(file)
  })
}

export function ProjectEditor({ state, commit, projectId, parentId, initialTab = 'details', onClose, onSaved, onRemoved }: Props) {
  const projects = rows(state.projects)
  const existing = projects.find(item => String(item.id) === String(projectId || ''))
  const [tab, setTab] = useState(initialTab)
  const [draft, setDraft] = useState<Row>(() => existing
    ? { ...existing, parent_id: existing.parent_id || '', cor: existing.cor || COLORS[0], icone: existing.icone || 'folder', imagem_url: existing.imagem_url || '' }
    : { id: `p-${crypto.randomUUID()}`, nome: '', cor: COLORS[0], icone: 'folder', imagem_url: '', parent_id: parentId || '', favorito: false })
  const [persisted, setPersisted] = useState(Boolean(existing))
  const [sections, setSections] = useState<SectionDraft[]>(() => rows(existing?.secoes).map((name, index) => ({ id: `saved-${index}`, name: String(name), original: String(name) })))
  const savedSections = useRef(new Map(sections.map(item => [item.id, item.name])))
  const [newSection, setNewSection] = useState('')
  const [imageBusy, setImageBusy] = useState(false)
  const [parentOpen, setParentOpen] = useState(false)
  const parentRef = useRef<HTMLButtonElement | null>(null)

  const blocked = useMemo(() => existing ? descendants(projects, String(existing.id)) : new Set<string>(), [projects, existing])
  const parentChoices = projects.filter(item => item.ativo !== false && String(item.id) !== String(draft.id) && !blocked.has(String(item.id)))
  const parent = projects.find(item => String(item.id) === String(draft.parent_id || ''))

  /* ---------------------------------------------------------- Gravação */

  const persist = useCallback((project: Row, sectionList: SectionDraft[]) => {
    const name = String(project.nome || '').trim()
    if (!name) return false
    const clean = sectionList.map(item => ({ ...item, name: item.name.trim() })).filter(item => item.name)
    const unique = clean.filter((item, index, list) => list.findIndex(other => other.name.toLocaleLowerCase('pt-BR') === item.name.toLocaleLowerCase('pt-BR')) === index)
    const id = String(project.id)
    const next = { ...project, id, nome: name, cor: project.cor || COLORS[0], icone: project.icone || 'folder', imagem_url: project.imagem_url || '', parent_id: project.parent_id || '', ordem: Number(project.ordem ?? projects.filter(item => item.ativo !== false).length), secoes: unique.map(item => item.name), ativo: true }
    const previous = new Map(savedSections.current)
    const current = new Map(unique.map(item => [item.id, item.name]))
    const renames = new Map<string, string>()
    const removed = new Set<string>()
    previous.forEach((oldName, sectionId) => {
      const nextName = current.get(sectionId)
      if (nextName == null) removed.add(oldName)
      else if (nextName !== oldName) renames.set(oldName, nextName)
    })
    commit(state => {
      const list = rows(state.projects)
      const projectsNext = list.some(item => String(item.id) === id) ? list.map(item => String(item.id) === id ? { ...item, ...next } : item) : [...list, next]
      const tasks = state.tasks.map(task => {
        if (String(task.projeto_id || '') !== id || !task.secao) return task
        const section = String(task.secao)
        if (renames.has(section)) return { ...task, secao: renames.get(section) || '' }
        if (removed.has(section)) return { ...task, secao: '' }
        return task
      })
      return { ...state, projects: projectsNext, tasks }
    })
    savedSections.current = current
    return true
  }, [commit, projects])

  const timer = useRef<number | null>(null)
  const latest = useRef({ draft, sections })
  latest.current = { draft, sections }
  useEffect(() => {
    if (!persisted && !String(draft.nome || '').trim()) return
    if (timer.current) window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => {
      if (persist(latest.current.draft, latest.current.sections)) setPersisted(true)
    }, 400)
    return () => { if (timer.current) window.clearTimeout(timer.current) }
  }, [draft, sections]) // eslint-disable-line react-hooks/exhaustive-deps

  const close = useCallback(() => {
    if (timer.current) window.clearTimeout(timer.current)
    const ok = persist(latest.current.draft, latest.current.sections)
    if (ok && !existing) onSaved(String(latest.current.draft.id))
    else onClose()
  }, [persist, existing, onSaved, onClose])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') close() }
    window.addEventListener('keydown', onKey)
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = previous }
  }, [close])

  /* --------------------------------------------------------- Imagem */

  async function chooseImage(file?: File) {
    if (!file) return
    setImageBusy(true)
    const previous = String(draft.imagem_url || '')
    try {
      const dataUrl = await resizeImage(file)
      const baseName = String(draft.nome || file.name.replace(/\.[^.]+$/, '') || 'Projeto').trim().replace(/[^a-zA-Z0-9À-ÿ _-]+/g, '').slice(0, 70) || 'Projeto'
      const asset = await uploadDataUrlToDrive(dataUrl, `MAI - Projeto - ${baseName}.webp`, 'image/webp')
      setDraft(current => ({ ...current, imagem_url: drivePreviewUrl(asset.idDrive) }))
      if (previous) void trashDriveAsset(previous)
    } finally { setImageBusy(false) }
  }

  function clearImage() {
    const previous = String(draft.imagem_url || '')
    setDraft(current => ({ ...current, imagem_url: '' }))
    if (previous) void trashDriveAsset(previous)
  }

  /* --------------------------------------------------------- Seções */

  function addSection() {
    const name = newSection.trim()
    if (!name || sections.some(item => item.name.toLocaleLowerCase('pt-BR') === name.toLocaleLowerCase('pt-BR'))) return
    setSections(current => [...current, { id: `new-${crypto.randomUUID()}`, name, original: '' }])
    setNewSection('')
  }

  function moveSection(id: string, delta: number) {
    setSections(current => {
      const index = current.findIndex(item => item.id === id)
      const target = Math.max(0, Math.min(current.length - 1, index + delta))
      if (index < 0 || index === target) return current
      const next = [...current]
      const [moved] = next.splice(index, 1)
      next.splice(target, 0, moved)
      return next
    })
  }

  async function removeSection(item: SectionDraft) {
    const count = state.tasks.filter(task => String(task.projeto_id || '') === String(draft.id) && String(task.secao || '') === item.original && !task.concluida).length
    if (count && !(await askConfirm({ title: 'Excluir seção?', message: `“${item.name}” tem ${count} tarefa${count === 1 ? '' : 's'} aberta${count === 1 ? '' : 's'}. Elas continuam no projeto, sem seção.` }))) return
    setSections(current => current.filter(section => section.id !== item.id))
  }

  /* ---------------------------------------------------- Arquivar/excluir */

  async function archive() {
    if (!(await askConfirm({ title: 'Arquivar projeto?', message: `“${draft.nome}” sai das abas. As tarefas continuam salvas.`, confirmLabel: 'Arquivar', icon: 'archive' }))) return
    if (timer.current) window.clearTimeout(timer.current)
    commit(current => ({ ...current, projects: rows(current.projects).map(item => String(item.id) === String(draft.id) ? { ...item, ativo: false } : item) }))
    onRemoved()
  }

  async function remove() {
    if (!(await askConfirm({ title: 'Excluir projeto?', message: `“${draft.nome}” será excluído e as tarefas dele vão para a Entrada. Não dá para desfazer.` }))) return
    if (timer.current) window.clearTimeout(timer.current)
    const id = String(draft.id)
    const fallbackParent = String(draft.parent_id || '')
    const image = String(draft.imagem_url || '')
    commit(current => ({
      ...current,
      projects: rows(current.projects).filter(item => String(item.id) !== id).map(item => String(item.parent_id || '') === id ? { ...item, parent_id: fallbackParent } : item),
      tasks: current.tasks.map(task => String(task.projeto_id || '') === id ? { ...task, projeto_id: 'entrada', secao: '' } : task),
    }))
    if (image) void trashDriveAsset(image)
    onRemoved()
  }

  /* -------------------------------------------------------------- Tela */

  const parentOptions: PickerOption[] = [
    { value: '', label: 'Nenhum (projeto principal)', icon: 'folder_off' },
    ...parentChoices.map(item => ({ value: String(item.id), label: String(item.nome || 'Projeto'), image: item.imagem_url ? driveAssetUrl(item.imagem_url) : undefined, color: String(item.cor || COLORS[0]) })),
  ]
  const heading = existing ? 'Projeto' : draft.parent_id ? 'Novo subprojeto' : 'Novo projeto'
  const visual = draft.imagem_url
    ? <img className={styles.avatar} src={driveAssetUrl(draft.imagem_url)} alt="" />
    : <span className={styles.avatar} style={{ background: String(draft.cor) }}><Icon name={String(draft.icone || 'folder')} size={30} /></span>

  if (typeof document === 'undefined') return null
  return createPortal(
    <div className={styles.layer} onClick={event => { if (event.target === event.currentTarget) close() }}>
      <section className={styles.panel} role="dialog" aria-modal="true" aria-label={heading}>
        <div className={styles.handle} aria-hidden="true" />
        <header className={styles.header}>
          <span className={styles.kind}><Icon name="folder" size={15} className={styles.kindIcon} />{heading}</span>
          <button type="button" className={styles.iconButton} onClick={close} aria-label="Fechar"><Icon name="close" size={18} filled={false} /></button>
        </header>

        <div className={styles.identity}>
          {visual}
          <div className={styles.identityText}>
            <input
              className={styles.name}
              value={String(draft.nome || '')}
              placeholder="Nome do projeto"
              autoFocus={!existing}
              onChange={event => setDraft(current => ({ ...current, nome: event.target.value }))}
            />
            <span>{parent ? <>Subprojeto de <strong>{String(parent.nome)}</strong></> : 'Projeto principal'}</span>
          </div>
          <button type="button" className={styles.favorite} data-on={draft.favorito || undefined} onClick={() => setDraft(current => ({ ...current, favorito: !current.favorito }))} aria-pressed={Boolean(draft.favorito)} aria-label="Favorito" title="Favorito">
            <Icon name="star" size={20} filled={Boolean(draft.favorito)} />
          </button>
        </div>

        <div className={styles.tabs} role="tablist">
          <button type="button" role="tab" data-active={tab === 'details' || undefined} onClick={() => setTab('details')}>Geral</button>
          <button type="button" role="tab" data-active={tab === 'sections' || undefined} onClick={() => setTab('sections')}>Seções{sections.length ? <small>{sections.length}</small> : null}</button>
        </div>

        <div className={styles.scroll}>
          {tab === 'details' ? (
            <>
              <div className={styles.field}>
                <span className={styles.label}>Dentro de</span>
                <button ref={parentRef} type="button" className={styles.select} onClick={() => setParentOpen(true)}>
                  {parent ? (parent.imagem_url ? <img src={driveAssetUrl(parent.imagem_url)} alt="" /> : <i style={{ background: String(parent.cor || COLORS[0]) }} />) : <Icon name="folder_off" size={18} />}
                  <span>{parent ? String(parent.nome) : 'Nenhum (projeto principal)'}</span>
                  <Icon name="expand_more" size={18} filled={false} />
                </button>
                {parentOpen ? (
                  <Floating anchor={parentRef} title="Dentro de" width={300} onClose={() => setParentOpen(false)}>
                    <OptionList options={parentOptions} value={String(draft.parent_id || '')} onSelect={value => { setParentOpen(false); setDraft(current => ({ ...current, parent_id: value })) }} />
                  </Floating>
                ) : null}
              </div>

              <div className={styles.field}>
                <span className={styles.label}>Cor</span>
                <ColorField value={draft.cor} onChange={color => setDraft(current => ({ ...current, cor: color }))} />
              </div>

              <div className={styles.field}>
                <span className={styles.label}>Ícone</span>
                <div className={styles.icons}>
                  {ICONS.map(icon => (
                    <button key={icon} type="button" className={styles.iconChoice} data-active={(!draft.imagem_url && String(draft.icone) === icon) || undefined} onClick={() => { if (draft.imagem_url) clearImage(); setDraft(current => ({ ...current, icone: icon })) }} aria-label={icon}>
                      <Icon name={icon} size={20} />
                    </button>
                  ))}
                </div>
              </div>

              <div className={styles.field}>
                <span className={styles.label}>Imagem</span>
                <div className={styles.imageRow}>
                  <label className={styles.button} data-busy={imageBusy || undefined}>
                    <Icon name="image" size={18} />{imageBusy ? 'Enviando…' : draft.imagem_url ? 'Trocar imagem' : 'Escolher imagem'}
                    <input hidden type="file" accept="image/*" disabled={imageBusy} onChange={event => { void chooseImage(event.target.files?.[0]); event.currentTarget.value = '' }} />
                  </label>
                  {draft.imagem_url ? <button type="button" className={styles.buttonGhost} onClick={clearImage}>Remover</button> : null}
                </div>
                <small className={styles.hint}>A imagem fica guardada no seu Google Drive.</small>
              </div>
            </>
          ) : (
            <div className={styles.sections}>
              {sections.map((item, index) => (
                <div key={item.id} className={styles.sectionRow}>
                  <Icon name="drag_indicator" size={18} className={styles.sectionGrip} />
                  <input value={item.name} onChange={event => setSections(current => current.map(section => section.id === item.id ? { ...section, name: event.target.value } : section))} aria-label="Nome da seção" />
                  <button type="button" onClick={() => moveSection(item.id, -1)} disabled={index === 0} aria-label="Subir"><Icon name="arrow_upward" size={17} filled={false} /></button>
                  <button type="button" onClick={() => moveSection(item.id, 1)} disabled={index === sections.length - 1} aria-label="Descer"><Icon name="arrow_downward" size={17} filled={false} /></button>
                  <button type="button" data-danger onClick={() => void removeSection(item)} aria-label="Excluir seção"><Icon name="delete" size={17} filled={false} /></button>
                </div>
              ))}
              {!sections.length ? <p className={styles.hint}>Seções organizam a lista e viram colunas no Quadro.</p> : null}
              <div className={styles.addSection}>
                <Icon name="add" size={18} filled={false} />
                <input value={newSection} placeholder="Nova seção" enterKeyHint="done" onChange={event => setNewSection(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); addSection() } }} />
                <button type="button" disabled={!newSection.trim()} onClick={addSection}>Adicionar</button>
              </div>
            </div>
          )}
        </div>

        <footer className={styles.footer}>
          {persisted ? (
            <span className={styles.footerActions}>
              <button type="button" className={styles.buttonGhost} onClick={() => void archive()}><Icon name="archive" size={17} filled={false} />Arquivar</button>
              <button type="button" className={styles.danger} onClick={() => void remove()}><Icon name="delete" size={17} filled={false} />Excluir</button>
            </span>
          ) : <span className={styles.hint}>Dê um nome para criar.</span>}
          <button type="button" className={styles.done} onClick={close}>{existing ? 'Pronto' : 'Criar'}</button>
        </footer>
      </section>
    </div>,
    document.body,
  )
}
