'use client'

import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState, type DragEvent, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react'
import { addDays } from '../../../lib/v2/planner'
import type { LegacyTask, MaiState } from '../../../lib/v2/state'
import { Icon } from '../../ds'
import type { AppView, Row, TaskModuleScope } from '../app-types'
import type { InspectableItem } from '../ContextDrawer'
import { DatePicker, Floating, OptionList, type PickerOption } from '../detail/Pickers'
import { driveAssetUrl } from '../DriveAsset'
import { askConfirm } from '../shell/ConfirmDialog'
import { QuickAdd } from '../shell/QuickAdd'
import { useQuickMenu, type QuickMenuConfig } from '../shell/QuickMenu'
import styles from './TasksModern.module.css'

/*
 * MAI — módulo Tarefas (visual Moderno).
 * Projetos em abas no topo; lista por seções ou quadro (kanban).
 */

type Props = {
  state: MaiState
  today: string
  scope: TaskModuleScope
  commit: (change: (current: MaiState) => MaiState) => void
  inspect: (item: InspectableItem) => void
  onScopeChange: (scope: TaskModuleScope) => void
  navigate: (view: AppView) => void
  onAdd: () => void
  onNewProject: (parentId?: string) => void
  onEditProject: (id: string) => void
  onManageSections: (id: string) => void
}

type SortMode = 'manual' | 'date' | 'priority' | 'project' | 'name'
type Group = { id: string; label: string; tasks: LegacyTask[]; addDate?: string; section?: string; tone?: 'danger'; projectId?: string; canAdd?: boolean }

const rows = (value: unknown): Row[] => (Array.isArray(value) ? (value as Row[]) : [])
const dayOf = (task: Row) => String(task.data_vencimento || '').slice(0, 10)
const timeOf = (task: Row) => (String(task.data_vencimento || '').includes('T') ? String(task.data_vencimento).slice(11, 16) : '')
const standalone = (task: LegacyTask) => !task.parent_id || Boolean(dayOf(task))
const uid = (prefix: string) => `${prefix}-${crypto.randomUUID()}`
const plainText = (value: unknown) => String(value || '').replace(/<br\s*\/?>|<\/(p|div|li)>/gi, ' ').replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim()
function renderDescription(text: string): ReactNode[] {
  return text.split(/(https?:\/\/[^\s]+)/g).map((part, index) => /^https?:\/\//.test(part)
    ? <a key={index} className={styles.descLink} href={part} target="_blank" rel="noopener noreferrer" onClick={event => event.stopPropagation()}>{part}</a>
    : part)
}
const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`

const PRIORITIES: PickerOption[] = [
  { value: '1', label: 'Alta', icon: 'flag', color: 'var(--ds-rose-fg)' },
  { value: '2', label: 'Média', icon: 'flag', color: 'var(--ds-peach-fg)' },
  { value: '3', label: 'Baixa', icon: 'flag', color: 'var(--ds-sky-fg)' },
  { value: '4', label: 'Sem prioridade', icon: 'outlined_flag', color: 'var(--ds-muted)' },
]
const PRIORITY_COLOR: Record<number, string> = { 1: 'var(--ds-rose-fg)', 2: 'var(--ds-peach-fg)', 3: 'var(--ds-sky-fg)' }

function naturalDate(key: string, today: string) {
  if (!key) return 'Sem data'
  if (key === today) return 'Hoje'
  if (key === addDays(today, 1)) return 'Amanhã'
  if (key === addDays(today, -1)) return 'Ontem'
  const date = new Date(`${key}T12:00:00`)
  const diff = Math.round((date.getTime() - new Date(`${today}T12:00:00`).getTime()) / 86400000)
  if (diff > 1 && diff < 7) return date.toLocaleDateString('pt-BR', { weekday: 'long' }).replace(/^./, letter => letter.toLocaleUpperCase('pt-BR'))
  return date.toLocaleDateString('pt-BR', { weekday: 'short', day: 'numeric', month: 'short', ...(key.slice(0, 4) === today.slice(0, 4) ? {} : { year: 'numeric' }) }).replace(/\./g, '').replace(/^./, letter => letter.toLocaleUpperCase('pt-BR'))
}

function nextMonday(today: string) {
  const day = new Date(`${today}T12:00:00`).getDay()
  return addDays(today, ((8 - day) % 7) || 7)
}

export function TasksModern(props: Props) {
  const { state, today, scope, commit, inspect } = props
  const controls = (state.configs.moduleControls && typeof state.configs.moduleControls === 'object' ? state.configs.moduleControls : {}) as Record<string, Row>
  const rawSort = String(controls.tasks?.sort || 'manual')
  const sortMode: SortMode = (['manual', 'date', 'priority', 'project', 'name'].includes(rawSort) ? rawSort : 'manual') as SortMode
  const filters = (state.configs.moduleFilters && typeof state.configs.moduleFilters === 'object' ? (state.configs.moduleFilters as Record<string, Row>).tasks : null) || {}
  const priorityFilter = String(filters.priority || 'all')

  const projects = useMemo(() => {
    const active = rows(state.projects).filter(project => project.ativo !== false)
    const sorted = [...active].sort((a, b) => Number(Boolean(b.favorito)) - Number(Boolean(a.favorito)) || Number(a.ordem || 0) - Number(b.ordem || 0) || String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR'))
    const roots = sorted.filter(project => !project.parent_id || !active.some(item => String(item.id) === String(project.parent_id)))
    const out: Row[] = []
    const walk = (project: Row, depth: number) => {
      out.push({ ...project, _depth: depth })
      sorted.filter(child => String(child.parent_id || '') === String(project.id)).forEach(child => walk(child, depth + 1))
    }
    roots.forEach(project => walk(project, 0))
    return out
  }, [state.projects])
  const projectMap = useMemo(() => new Map(projects.map(project => [String(project.id), project])), [projects])

  type CtxFilter = 'all' | 'late' | 'nodate' | 'today' | 'upcoming' | 'done'
  const [ctxFilter, setCtxFilter] = useState<CtxFilter>('all')
  useEffect(() => { setCtxFilter('all') }, [scope])
  const projectId = scope.startsWith('project:') ? scope.slice(8) : ''
  const project = projectId ? projectMap.get(projectId) : undefined
  const isProjectLike = scope === 'entrada' || Boolean(projectId)
  const kanban = Boolean(projectId) && String(project?.visualizacao || '') === 'quadro'

  const all = state.tasks.filter(task => standalone(task) && (priorityFilter === 'all' || String(task.prioridade || 4) === priorityFilter))
  const open = all.filter(task => !task.concluida)
  const counts = {
    entrada: open.filter(task => String(task.projeto_id || 'entrada') === 'entrada').length,
    today: open.filter(task => dayOf(task) && dayOf(task) <= today).length,
    upcoming: open.filter(task => dayOf(task) > today).length,
    late: open.filter(task => dayOf(task) && dayOf(task) < today).length,
    nodate: open.filter(task => !dayOf(task)).length,
    all: open.length,
  }
  const projectCount = (id: string) => open.filter(task => String(task.projeto_id || '') === id).length
  const childrenOf = (id: string) => projects.filter(item => String(item.parent_id || '') === id)
  const rootOf = (item: Row | undefined): Row | undefined => {
    let current = item
    let guard = 0
    while (current?.parent_id && projectMap.get(String(current.parent_id)) && guard < 8) { current = projectMap.get(String(current.parent_id)); guard += 1 }
    return current
  }
  const familyCount = (id: string): number => projectCount(id) + childrenOf(id).reduce((sum, child) => sum + familyCount(String(child.id)), 0)

  const prefsAll = (state.configs.taskWorkspaces && typeof state.configs.taskWorkspaces === 'object' ? state.configs.taskWorkspaces : {}) as Record<string, Row>
  const scopeKey = projectId ? `project:${projectId}` : scope === 'entrada' ? 'inbox' : String(scope)
  const prefs = prefsAll[scopeKey] || {}
  const collapsed = new Set(rows(prefs.collapsed).map(String))
  const toggleCollapsed = (id: string) => {
    const next = new Set(collapsed)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    commit(current => {
      const map = (current.configs.taskWorkspaces && typeof current.configs.taskWorkspaces === 'object' ? current.configs.taskWorkspaces : {}) as Record<string, Row>
      return { ...current, configs: { ...current.configs, taskWorkspaces: { ...map, [scopeKey]: { ...(map[scopeKey] || {}), collapsed: [...next] } } } }
    })
  }

  const projectName = (id: unknown) => {
    const key = String(id || 'entrada')
    if (key === 'entrada') return 'Entrada'
    return String(projectMap.get(key)?.nome || 'Sem projeto')
  }

  const sortTasks = (list: LegacyTask[]) => [...list].sort((a, b) => {
    const aDay = dayOf(a) || '9999-99-99', bDay = dayOf(b) || '9999-99-99'
    const aTime = timeOf(a) || '99:99', bTime = timeOf(b) || '99:99'
    const byTitle = String(a.titulo || '').localeCompare(String(b.titulo || ''), 'pt-BR', { sensitivity: 'base' })
    if (sortMode === 'date') return aDay.localeCompare(bDay) || aTime.localeCompare(bTime) || byTitle
    if (sortMode === 'priority') return Number(a.prioridade || 4) - Number(b.prioridade || 4) || aDay.localeCompare(bDay) || byTitle
    if (sortMode === 'project') return projectName(a.projeto_id).localeCompare(projectName(b.projeto_id), 'pt-BR') || aDay.localeCompare(bDay) || byTitle
    if (sortMode === 'name') return byTitle || aDay.localeCompare(bDay)
    if (!isProjectLike) return aDay.localeCompare(bDay) || aTime.localeCompare(bTime) || Number(a.ordem || 0) - Number(b.ordem || 0)
    return Number(a.ordem || 0) - Number(b.ordem || 0) || byTitle
  })

  /* --------------------------------------------------------------- Grupos */

  const sections = projectId ? rows(project?.secoes).map(String) : []
  const sectionOf = (task: Row) => (sections.includes(String(task.secao || '')) ? String(task.secao || '') : '')

  const tabMatch = (task: LegacyTask) => {
    const day = dayOf(task)
    if (ctxFilter === 'late') return Boolean(day) && day < today
    if (ctxFilter === 'nodate') return !day
    if (ctxFilter === 'today') return Boolean(day) && day <= today
    if (ctxFilter === 'upcoming') return day > today
    if (ctxFilter === 'done') return false
    return true
  }
  let groups: Group[] = []
  let scopeTasks: LegacyTask[] = []
  if (projectId) {
    scopeTasks = all.filter(task => String(task.projeto_id || '') === projectId)
    const openHere = sortTasks(scopeTasks.filter(task => !task.concluida && tabMatch(task)))
    groups = [
      ...sections.map(section => ({ id: `s:${section}`, label: section, section, tasks: openHere.filter(task => sectionOf(task) === section) })),
      { id: 's:', label: sections.length ? 'Sem seção' : 'Tarefas', section: '', tasks: openHere.filter(task => !sectionOf(task)) },
    ]
    if (sections.length && !groups[groups.length - 1].tasks.length && !kanban) groups = groups.slice(0, -1)
  } else if (scope === 'entrada') {
    scopeTasks = all.filter(task => String(task.projeto_id || 'entrada') === 'entrada')
    groups = [{ id: 'entrada', label: 'Tarefas', section: '', tasks: sortTasks(scopeTasks.filter(task => !task.concluida && tabMatch(task))) }]
  } else if (scope === 'today') {
    scopeTasks = all.filter(task => dayOf(task) && dayOf(task) <= today)
    const openHere = sortTasks(scopeTasks.filter(task => !task.concluida))
    const late = openHere.filter(task => dayOf(task) < today)
    groups = [
      ...(late.length ? [{ id: 'late', label: 'Atrasadas', tasks: late, tone: 'danger' as const }] : []),
      { id: 'today', label: 'Hoje', tasks: openHere.filter(task => dayOf(task) === today), addDate: today },
    ]
    scopeTasks = scopeTasks.filter(task => !task.concluida || dayOf(task) === today)
  } else if (scope === 'late') {
    scopeTasks = all.filter(task => dayOf(task) && dayOf(task) < today && !task.concluida)
    const openHere = sortTasks(scopeTasks)
    const days = [...new Set(openHere.map(dayOf))].sort()
    groups = days.map(day => ({ id: `d:${day}`, label: naturalDate(day, today), tasks: openHere.filter(task => dayOf(task) === day), tone: 'danger' as const }))
  } else if (scope === 'nodate' || scope === 'all') {
    scopeTasks = all.filter(task => scope === 'all' || !dayOf(task))
    const openHere = sortTasks(scopeTasks.filter(task => !task.concluida))
    const order = ['entrada', ...projects.map(item => String(item.id))]
    const ids = [...new Set(openHere.map(task => String(task.projeto_id || 'entrada')))].sort((a, b) => order.indexOf(a) - order.indexOf(b))
    groups = ids.map(id => ({ id: `p:${id}`, label: projectName(id), projectId: id, canAdd: scope === 'nodate', tasks: openHere.filter(task => String(task.projeto_id || 'entrada') === id) }))
    scopeTasks = scope === 'all' ? scopeTasks : scopeTasks.filter(task => !task.concluida)
  } else {
    scopeTasks = all.filter(task => dayOf(task) > today)
    const openHere = sortTasks(scopeTasks.filter(task => !task.concluida))
    const days = [...new Set(openHere.map(dayOf))].sort()
    groups = days.map(day => ({ id: `d:${day}`, label: naturalDate(day, today), tasks: openHere.filter(task => dayOf(task) === day), addDate: day }))
  }
  const ctxTasks = projectId ? all.filter(task => String(task.projeto_id || '') === projectId) : all.filter(task => String(task.projeto_id || 'entrada') === 'entrada')
  const completed = scopeTasks.filter(task => task.concluida).sort((a, b) => String(b.concluida_em || '').localeCompare(String(a.concluida_em || '')))

  /* -------------------------------------------------------------- Ações */

  const patchTask = (id: string, patch: Row) => commit(current => ({ ...current, tasks: current.tasks.map(task => String(task.id) === id ? { ...task, ...patch } : task) }))
  const patchMany = (ids: string[], patch: (task: LegacyTask) => Row) => {
    const set = new Set(ids)
    commit(current => ({ ...current, tasks: current.tasks.map(task => set.has(String(task.id)) ? { ...task, ...patch(task) } : task) }))
  }
  const toggleTask = (id: string) => commit(current => ({ ...current, tasks: current.tasks.map(task => String(task.id) === id ? { ...task, concluida: !task.concluida, concluida_em: !task.concluida ? new Date().toISOString() : '' } : task) }))
  const openTask = (task: LegacyTask) => inspect({ kind: 'task', sourceId: String(task.id), title: String(task.titulo || 'Tarefa'), date: dayOf(task), time: timeOf(task), raw: task as Row })
  const withDate = (task: Row, date: string) => (date ? `${date}${timeOf(task) ? `T${timeOf(task)}` : ''}` : '')

  async function removeTasks(ids: string[]) {
    const first = state.tasks.find(task => String(task.id) === ids[0])
    const ok = await askConfirm(ids.length === 1
      ? { title: 'Excluir tarefa?', message: `“${String(first?.titulo || 'Tarefa')}” será excluída. Não dá para desfazer.` }
      : { title: `Excluir ${ids.length} tarefas?`, message: 'As tarefas selecionadas serão excluídas. Não dá para desfazer.' })
    if (!ok) return
    const set = new Set(ids)
    commit(current => ({ ...current, tasks: current.tasks.filter(task => !set.has(String(task.id))).map(task => set.has(String(task.parent_id || '')) ? { ...task, parent_id: '' } : task) }))
    clearSelection()
  }

  /* ------------------------------------------------------- Arrastar/soltar */

  const [dragId, setDragId] = useState('')
  const [dropTarget, setDropTarget] = useState('')

  function moveTask(sourceId: string, group: Group, targetId?: string, position: 'before' | 'after' = 'after') {
    if (!sourceId) return
    const section = group.section ?? undefined
    const baseOrder = Date.now()
    commit(current => {
      const source = current.tasks.find(task => String(task.id) === sourceId)
      if (!source) return current
      const ids = group.tasks.map(task => String(task.id)).filter(id => id !== sourceId)
      let index = targetId ? ids.indexOf(targetId) : -1
      if (index < 0) index = ids.length
      else if (position === 'after') index += 1
      ids.splice(index, 0, sourceId)
      const rank = new Map(ids.map((id, order) => [id, order]))
      return {
        ...current,
        tasks: current.tasks.map(task => {
          const id = String(task.id)
          if (!rank.has(id)) return task
          const patch: Row = { ordem: baseOrder + rank.get(id)! }
          if (id === sourceId) {
            if (section !== undefined && projectId) patch.secao = section
            if (group.addDate && dayOf(task) !== group.addDate) patch.data_vencimento = withDate(task, group.addDate)
          }
          return { ...task, ...patch }
        }),
      }
    })
  }

  const canDrag = !kanban ? (isProjectLike && sortMode === 'manual') || Boolean(projectId) || scope === 'upcoming' : true

  /* ---------------------------------------------------------- Seleção */

  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [selectMode, setSelectMode] = useState(false)
  const selecting = selected.size > 0 || selectMode
  const clearSelection = () => { setSelected(new Set()); setSelectMode(false) }
  const toggleSelect = (id: string) => setSelected(current => {
    const next = new Set(current)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  })
  useEffect(() => { clearSelection() }, [scope])
  useEffect(() => {
    if (!selecting) return
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') clearSelection() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selecting])

  /* ------------------------------------------------------ Edição rápida */

  const quick = useQuickMenu()
  const dateChoices = [
    { label: 'Hoje', icon: 'today', value: today },
    { label: 'Amanhã', icon: 'wb_sunny', value: addDays(today, 1) },
    { label: 'Próx. semana', icon: 'date_range', value: nextMonday(today) },
  ]
  function taskMenu(task: LegacyTask): QuickMenuConfig {
    const id = String(task.id)
    const due = dayOf(task)
    const priority = Number(task.prioridade || 4)
    return {
      title: String(task.titulo || 'Tarefa'),
      subtitle: `${projectName(task.projeto_id)}${task.secao ? ` · ${String(task.secao)}` : ''}`,
      groups: [
        { label: 'Data', inline: true, options: [
          ...dateChoices.map(choice => ({ label: choice.label, icon: choice.icon, active: due === choice.value, onSelect: () => patchTask(id, { data_vencimento: withDate(task, choice.value) }) })),
          { label: 'Sem data', icon: 'event_busy', active: !due, onSelect: () => patchTask(id, { data_vencimento: '' }) },
        ] },
        { label: 'Prioridade', inline: true, options: [1, 2, 3, 4].map(level => ({ label: ['Alta', 'Média', 'Baixa', 'Nenhuma'][level - 1], icon: 'flag', color: PRIORITY_COLOR[level] || 'var(--ds-muted)', active: priority === level, onSelect: () => patchTask(id, { prioridade: level }) })) },
        { options: [
          { label: task.concluida ? 'Reabrir tarefa' : 'Concluir', icon: task.concluida ? 'undo' : 'check_circle', onSelect: () => toggleTask(id) },
          { label: 'Selecionar', icon: 'check_box', onSelect: () => toggleSelect(id) },
          { label: 'Abrir detalhes', icon: 'open_in_full', onSelect: () => openTask(task) },
          { label: 'Excluir', icon: 'delete', tone: 'danger', onSelect: () => removeTasks([id]) },
        ] },
      ],
    }
  }

  /* ------------------------------------------------- Adicionar na seção */

  const [composer, setComposer] = useState('')
  const [draftTitle, setDraftTitle] = useState('')
  const [draftDesc, setDraftDesc] = useState('')
  const [descOpen, setDescOpen] = useState(false)
  const [draftDate, setDraftDate] = useState('')
  const [draftPriority, setDraftPriority] = useState(4)
  const [draftProject, setDraftProject] = useState('')
  const [draftPicker, setDraftPicker] = useState<'' | 'date' | 'priority' | 'project'>('')
  const draftRefs = { date: useRef<HTMLButtonElement | null>(null), priority: useRef<HTMLButtonElement | null>(null), project: useRef<HTMLButtonElement | null>(null) }
  const openComposer = (group: Group) => {
    setComposer(group.id)
    setDraftTitle('')
    setDraftDesc('')
    setDescOpen(false)
    setDraftDate(group.addDate || '')
    setDraftPriority(4)
    setDraftProject(group.projectId || projectId || 'entrada')
    setDraftPicker('')
  }
  const closeComposer = () => { setComposer(''); setDraftTitle(''); setDraftDesc(''); setDescOpen(false); setDraftPicker('') }
  function addTask(group: Group) {
    const title = draftTitle.trim()
    if (!title) return
    const targetProject = draftProject || group.projectId || projectId || 'entrada'
    const task: Row = {
      id: uid('t'), titulo: title, descricao: draftDesc.trim(), data_vencimento: draftDate, prioridade: draftPriority, concluida: false,
      projeto_id: targetProject, parent_id: '', secao: targetProject === (group.projectId || projectId || 'entrada') ? (group.section || '') : '', criado_em: new Date().toISOString(), ordem: Date.now(),
      notas: [], anexos: [], subtarefas: [], lembretes: [], etiquetas: [], repeticao: '', ocultar_agenda: false,
    }
    commit(current => ({ ...current, tasks: [...current.tasks, task as LegacyTask] }))
    setDraftTitle('')
    setDraftDesc('')
    setDescOpen(false)
    setDraftDate(group.addDate || '')
    setDraftPriority(4)
  }

  /* --------------------------------------------------------------- Abas */

  const tabsRef = useRef<HTMLDivElement | null>(null)
  useLayoutEffect(() => {
    const active = tabsRef.current?.querySelector<HTMLElement>('[data-active]')
    if (active && tabsRef.current) {
      const box = tabsRef.current
      const left = active.offsetLeft - box.offsetLeft
      if (left < box.scrollLeft || left + active.offsetWidth > box.scrollLeft + box.clientWidth) box.scrollTo({ left: Math.max(0, left - 40), behavior: 'smooth' })
    }
  }, [scope])
  const onTabsWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    const box = tabsRef.current
    if (!box || Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return
    box.scrollLeft += event.deltaY
  }
  // Arrastar a faixa de projetos com o mouse.
  const tabsDrag = useRef<{ x: number; left: number; moved: boolean; id: number } | null>(null)
  const tabsSuppress = useRef(false)
  const onTabsPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== 'mouse' || event.button !== 0 || !tabsRef.current) return
    tabsDrag.current = { x: event.clientX, left: tabsRef.current.scrollLeft, moved: false, id: event.pointerId }
  }
  const onTabsPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = tabsDrag.current
    const box = tabsRef.current
    if (!drag || !box) return
    const delta = event.clientX - drag.x
    if (!drag.moved && Math.abs(delta) > 6) {
      drag.moved = true
      box.setPointerCapture(drag.id)
      box.dataset.dragging = 'true'
    }
    if (drag.moved) box.scrollLeft = drag.left - delta
  }
  const endTabsDrag = () => {
    const drag = tabsDrag.current
    tabsDrag.current = null
    if (tabsRef.current) delete tabsRef.current.dataset.dragging
    if (drag?.moved) {
      tabsSuppress.current = true
      window.setTimeout(() => { tabsSuppress.current = false }, 0)
    }
  }

  const projectVisual = (item: Row | undefined, size: 'tab' | 'head') => {
    const className = size === 'tab' ? styles.tabVisual : styles.headVisual
    if (item?.imagem_url) return <img className={className} src={driveAssetUrl(item.imagem_url)} alt="" />
    return <span className={className} style={{ background: String(item?.cor || 'var(--ds-line-strong)') }}><Icon name={String(item?.icone || 'folder')} size={size === 'tab' ? 12 : 22} /></span>
  }

  const scopeTabs: { scope: TaskModuleScope; label: string; icon: string; color: string; count: number }[] = [
    { scope: 'entrada', label: 'Entrada', icon: 'inbox', color: 'var(--ds-accent)', count: counts.entrada },
    { scope: 'today', label: 'Hoje', icon: 'today', color: 'var(--ds-mint-fg)', count: counts.today },
    { scope: 'upcoming', label: 'Em breve', icon: 'event_upcoming', color: 'var(--ds-lilac-fg)', count: counts.upcoming },
    { scope: 'late', label: 'Atrasadas', icon: 'warning', color: 'var(--ds-danger)', count: counts.late },
    { scope: 'nodate', label: 'Sem data', icon: 'event_busy', color: 'var(--ds-text-2)', count: counts.nodate },
    { scope: 'all', label: 'Todas', icon: 'select_all', color: 'var(--ds-sky-fg)', count: counts.all },
  ]
  const SCOPE_META: Record<string, { title: string; icon: string; color: string }> = {
    entrada: { title: 'Entrada', icon: 'inbox', color: 'var(--ds-accent)' },
    today: { title: 'Hoje', icon: 'today', color: 'var(--ds-mint-fg)' },
    upcoming: { title: 'Em breve', icon: 'event_upcoming', color: 'var(--ds-lilac-fg)' },
    late: { title: 'Atrasadas', icon: 'warning', color: 'var(--ds-danger)' },
    nodate: { title: 'Sem data', icon: 'event_busy', color: 'var(--ds-line-strong)' },
    all: { title: 'Todas as tarefas', icon: 'select_all', color: 'var(--ds-sky-fg)' },
  }

  /* ---------------------------------------------------------- Cabeçalho */

  const meta = SCOPE_META[String(scope)] || SCOPE_META.entrada
  const title = projectId ? String(project?.nome || 'Projeto') : meta.title
  const headIcon = projectId ? projectVisual(project, 'head') : (
    <span className={styles.headVisual} style={{ background: meta.color }}>
      <Icon name={meta.icon} size={22} />
    </span>
  )
  const root = projectId ? rootOf(project) : undefined
  const family = root ? [root, ...childrenOf(String(root.id))] : []

  /* Lista ou quadro é uma escolha de cada projeto. */
  const setLayout = (layout: 'lista' | 'quadro') => {
    if (!projectId) return
    commit(current => ({ ...current, projects: rows(current.projects).map(item => String(item.id) === projectId ? { ...item, visualizacao: layout } : item) as typeof current.projects }))
  }

  const [projectMenu, setProjectMenu] = useState(false)
  const projectMenuRef = useRef<HTMLButtonElement | null>(null)

  const [openSubs, setOpenSubs] = useState<Set<string>>(new Set())
  const [optionsOpen, setOptionsOpen] = useState(false)
  const optionsRef = useRef<HTMLButtonElement | null>(null)
  const setControl = (patch: Row) => commit(current => {
    const map = (current.configs.moduleControls && typeof current.configs.moduleControls === 'object' ? current.configs.moduleControls : {}) as Record<string, Row>
    return { ...current, configs: { ...current.configs, moduleControls: { ...map, tasks: { ...(map.tasks || {}), ...patch } } } }
  })
  const setFilter = (patch: Row) => commit(current => {
    const map = (current.configs.moduleFilters && typeof current.configs.moduleFilters === 'object' ? current.configs.moduleFilters : {}) as Record<string, Row>
    return { ...current, configs: { ...current.configs, moduleFilters: { ...map, tasks: { ...(map.tasks || {}), ...patch } } } }
  })

  /* ------------------------------------------------------------- Cartão */

  const toggleSubs = (id: string) => setOpenSubs(current => {
    const next = new Set(current)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  })

  const renderTask = (task: LegacyTask, group: Group) => {
    const id = String(task.id)
    const due = dayOf(task)
    const time = timeOf(task)
    const done = Boolean(task.concluida)
    const late = Boolean(due) && due < today && !done
    const priority = Number(task.prioridade || 4)
    const desc = plainText(task.descricao)
    const children = state.tasks.filter(item => String(item.parent_id || '') === id)
    const files = rows(task.anexos).length
    const isSelected = selected.has(id)
    const showDate = Boolean(due) && !(group.addDate && group.addDate === due)
    const showProject = !isProjectLike && !group.projectId
    const bind = quick.bind(() => taskMenu(task), { onLongPress: () => toggleSelect(id) })

    const onClick = (event: ReactMouseEvent) => {
      if (event.ctrlKey || event.metaKey || event.shiftKey || selecting) {
        event.preventDefault()
        toggleSelect(id)
        return
      }
      openTask(task)
    }

    const expanded = openSubs.has(id)
    return (
      <Fragment key={id}>
      <div
        role="listitem"
        className={styles.card}
        data-selected={isSelected || undefined}
        data-done={done || undefined}
        data-drop={dropTarget === id ? 'true' : undefined}
        draggable={canDrag && !selecting && !done}
        onDragStart={event => { setDragId(id); event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', id) }}
        onDragEnd={() => { setDragId(''); setDropTarget('') }}
        onDragOver={event => { if (dragId && dragId !== id) { event.preventDefault(); setDropTarget(id) } }}
        onDragLeave={() => setDropTarget(current => current === id ? '' : current)}
        onDrop={(event: DragEvent<HTMLDivElement>) => {
          event.preventDefault()
          event.stopPropagation()
          const rect = event.currentTarget.getBoundingClientRect()
          if (dragId && dragId !== id) moveTask(dragId, group, id, event.clientY < rect.top + rect.height / 2 ? 'before' : 'after')
          setDragId('')
          setDropTarget('')
        }}
        {...bind}
      >
        {selecting ? (
          <button type="button" className={styles.selectBox} data-on={isSelected || undefined} onClick={() => toggleSelect(id)} aria-pressed={isSelected} aria-label={`Selecionar ${String(task.titulo || 'tarefa')}`}>
            {isSelected ? <Icon name="check" size={15} /> : null}
          </button>
        ) : (
          <button type="button" className={styles.check} data-done={done || undefined} data-priority={!done && PRIORITY_COLOR[priority] ? priority : undefined} style={!done && PRIORITY_COLOR[priority] ? ({ '--check-color': PRIORITY_COLOR[priority] } as React.CSSProperties) : undefined} onClick={() => toggleTask(id)} aria-label={done ? `Reabrir ${String(task.titulo)}` : `Concluir ${String(task.titulo)}`}>
            {done ? <Icon name="check" size={13} /> : null}
          </button>
        )}
        <div tabIndex={0} className={styles.cardMain} onClick={onClick} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onClick(event as unknown as ReactMouseEvent) } }}>
          <span className={styles.cardTitle}>{String(task.titulo || 'Tarefa')}</span>
          {desc ? <span className={styles.cardDesc}>{renderDescription(desc)}</span> : null}
          {(showDate || time || showProject || children.length || files || task.repeticao) ? (
            <span className={styles.cardMeta}>
              {showDate ? <span data-late={late || undefined} data-today={due === today || undefined} data-future={due > today || undefined}><Icon name="calendar_today" size={12} />{naturalDate(due, today)}{time ? ` · ${time}` : ''}</span> : time ? <span><Icon name="schedule" size={12} />{time}</span> : null}
              {showProject ? (
                <span className={styles.metaProject}>
                  {projectMap.get(String(task.projeto_id || ''))?.imagem_url ? <img src={driveAssetUrl(projectMap.get(String(task.projeto_id))?.imagem_url)} alt="" /> : <i style={{ background: String(projectMap.get(String(task.projeto_id || ''))?.cor || 'var(--ds-accent)') }} />}
                  {projectName(task.projeto_id)}{task.secao ? <em> · {String(task.secao)}</em> : null}
                </span>
              ) : null}
              {task.repeticao ? <span><Icon name="repeat" size={12} />{({ diariamente: 'Todo dia', semanalmente: 'Toda semana', 'semanal:1,2,3,4,5': 'Dias úteis', mensalmente: 'Todo mês', anualmente: 'Todo ano' } as Record<string, string>)[String(task.repeticao)] || 'Repete'}</span> : null}
              {files ? <span><Icon name="attach_file" size={12} />{files}</span> : null}
              {children.length ? (
                <button type="button" className={styles.expand} data-open={expanded || undefined} onClick={event => { event.stopPropagation(); toggleSubs(id) }} aria-expanded={expanded} aria-label={`${expanded ? 'Esconder' : 'Mostrar'} subtarefas de ${String(task.titulo || 'tarefa')}`}>
                  <span>{children.filter(child => child.concluida).length}/{children.length}</span>
                  <Icon name={expanded ? 'expand_more' : 'chevron_right'} size={20} filled={false} />
                </button>
              ) : null}
            </span>
          ) : null}
        </div>
      </div>
      {expanded && children.length ? (
        <div className={styles.subList} role="list" aria-label={`Subtarefas de ${String(task.titulo || 'tarefa')}`}>
          {[...children].sort((a, b) => Number(Boolean(a.concluida)) - Number(Boolean(b.concluida)) || Number(a.ordem || 0) - Number(b.ordem || 0)).map(child => {
            const childId = String(child.id)
            const childDue = dayOf(child)
            const childLate = Boolean(childDue) && childDue < today && !child.concluida
            const childPriority = Number(child.prioridade || 4)
            const grand = state.tasks.filter(item => String(item.parent_id || '') === childId)
            return (
              <div key={childId} role="listitem" className={styles.subRow} data-done={child.concluida || undefined}>
                <button type="button" className={styles.subCheck} data-done={child.concluida || undefined} style={!child.concluida && PRIORITY_COLOR[childPriority] ? ({ borderColor: PRIORITY_COLOR[childPriority] } as React.CSSProperties) : undefined} onClick={() => toggleTask(childId)} aria-label={child.concluida ? `Reabrir ${String(child.titulo)}` : `Concluir ${String(child.titulo)}`}>
                  {child.concluida ? <Icon name="check" size={11} /> : null}
                </button>
                <button type="button" className={styles.subTitle} onClick={() => openTask(child)}>{String(child.titulo || 'Subtarefa')}</button>
                {grand.length ? <span className={styles.subMeta}><Icon name="account_tree" size={12} />{grand.filter(item => item.concluida).length}/{grand.length}</span> : null}
                {childDue ? <span className={styles.subMeta} data-late={childLate || undefined}>{naturalDate(childDue, today)}</span> : null}
              </div>
            )
          })}
        </div>
      ) : null}
      </Fragment>
    )
  }

  const renderComposer = (group: Group, always = false) => composer === group.id ? (
    <QuickAdd
      inline
      kinds={['task']}
      initial="task"
      state={state}
      today={today}
      defaultProjectId={group.projectId || projectId || 'entrada'}
      defaultSection={group.section || ''}
      defaultDate={group.addDate || ''}
      commit={commit}
      onFinance={() => undefined}
      onClose={closeComposer}
    />
  ) : (always || !group.tasks.length) ? (
    <button type="button" className={styles.addQuiet} data-has-tasks={group.tasks.length ? 'true' : undefined} onClick={() => openComposer(group)}>
      <Icon name="add" size={17} filled={false} />Adicionar tarefa
    </button>
  ) : null
  const addButton = (group: Group) => (
    <button type="button" className={styles.groupAdd} onClick={() => openComposer(group)} aria-label={`Adicionar tarefa em ${group.label}`} title="Adicionar tarefa"><Icon name="add" size={18} filled={false} /></button>
  )

  const canAddIn = (group: Group) => isProjectLike || Boolean(group.addDate) || Boolean(group.canAdd)

  const groupDropProps = (group: Group) => ({
    onDragOver: (event: DragEvent<HTMLElement>) => { if (dragId) { event.preventDefault(); event.dataTransfer.dropEffect = 'move' } },
    onDrop: (event: DragEvent<HTMLElement>) => { event.preventDefault(); if (dragId) moveTask(dragId, group); setDragId(''); setDropTarget('') },
  })

  /* ----------------------------------------------------------- Seleção (barra) */

  const [bulkPicker, setBulkPicker] = useState<'' | 'date' | 'priority' | 'move'>('')
  const bulkDateRef = useRef<HTMLButtonElement | null>(null)
  const bulkPriorityRef = useRef<HTMLButtonElement | null>(null)
  const bulkMoveRef = useRef<HTMLButtonElement | null>(null)
  const bulkRefs = { date: bulkDateRef, priority: bulkPriorityRef, move: bulkMoveRef }
  const selectedIds = [...selected]
  const selectedTasks = state.tasks.filter(task => selected.has(String(task.id)))
  const allDone = selectedTasks.length > 0 && selectedTasks.every(task => task.concluida)
  const visibleIds = groups.flatMap(group => group.tasks.map(task => String(task.id)))

  const moveOptions: PickerOption[] = [
    { value: 'entrada', label: 'Entrada', icon: 'inbox' },
    ...projects.map(item => ({ value: String(item.id), label: `${'  '.repeat(Number(item._depth || 0))}${String(item.nome || 'Projeto')}`, image: item.imagem_url ? driveAssetUrl(item.imagem_url) : undefined, color: String(item.cor || 'var(--ds-line-strong)') })),
  ]

  /* ---------------------------------------------------------------- Tela */

  return (
    <div className={styles.page} data-selecting={selecting || undefined}>
      <nav className={styles.nav} aria-label="Listas e projetos">
        <div
          className={styles.navScroll}
          ref={tabsRef}
          onWheel={onTabsWheel}
          onPointerDown={onTabsPointerDown}
          onPointerMove={onTabsPointerMove}
          onPointerUp={endTabsDrag}
          onPointerCancel={endTabsDrag}
          onClickCapture={event => { if (tabsSuppress.current) { event.preventDefault(); event.stopPropagation() } }}
          role="tablist"
        >
          {([
            { id: 'all', label: 'Tudo', icon: 'select_all', color: 'var(--ds-muted)', count: ctxTasks.filter(task => !task.concluida).length },
            { id: 'late', label: 'Atrasadas', icon: 'warning', color: 'var(--ds-muted)', count: ctxTasks.filter(task => !task.concluida && dayOf(task) && dayOf(task) < today).length },
            { id: 'nodate', label: 'Sem data', icon: 'event_busy', color: 'var(--ds-muted)', count: ctxTasks.filter(task => !task.concluida && !dayOf(task)).length },
            { id: 'today', label: 'Hoje', icon: 'today', color: 'var(--ds-muted)', count: ctxTasks.filter(task => !task.concluida && dayOf(task) && dayOf(task) <= today).length },
            { id: 'upcoming', label: 'Em breve', icon: 'event_upcoming', color: 'var(--ds-muted)', count: ctxTasks.filter(task => !task.concluida && dayOf(task) > today).length },
            { id: 'done', label: 'Concluídos', icon: 'task_alt', color: 'var(--ds-muted)', count: ctxTasks.filter(task => task.concluida).length },
          ] as { id: CtxFilter; label: string; icon: string; color: string; count: number }[]).map(tab => (
            <button key={tab.id} type="button" role="tab" className={styles.pill} data-active={ctxFilter === tab.id || undefined} aria-selected={ctxFilter === tab.id} onClick={() => {
              if (!isProjectLike) props.onScopeChange('entrada')
              setCtxFilter(tab.id)
            }}>
              <Icon name={tab.icon} size={17} filled={false} />
              <span>{tab.label}</span>
              {tab.count ? <small>{tab.count}</small> : null}
            </button>
          ))}
        </div>
        <button ref={optionsRef} type="button" className={styles.pillRound} data-active={priorityFilter !== 'all' || undefined} onClick={() => setOptionsOpen(true)} aria-label="Mais opções"><Icon name="more_horiz" size={20} filled={false} /></button>
        {optionsOpen ? (
          <Floating anchor={optionsRef} title="Opções" width={300} onClose={() => setOptionsOpen(false)}>
            <div className={styles.optionsPanel}>
              {projectId ? (
                <>
                  <span className={styles.optionsLabel}>Ver este projeto como</span>
                  <div className={styles.chips}>
                    <button type="button" data-active={!kanban || undefined} onClick={() => setLayout('lista')}><Icon name="view_agenda" size={15} />Lista</button>
                    <button type="button" data-active={kanban || undefined} onClick={() => setLayout('quadro')}><Icon name="view_kanban" size={15} />Quadro</button>
                  </div>
                </>
              ) : null}
              <span className={styles.optionsLabel}>Ordenar por</span>
              <div className={styles.chips}>
                {([['manual', 'Manual', 'drag_indicator'], ['date', 'Data', 'calendar_today'], ['priority', 'Prioridade', 'flag'], ['name', 'Nome', 'sort_by_alpha']] as const).map(([value, label, icon]) => (
                  <button key={value} type="button" data-active={sortMode === value || undefined} onClick={() => setControl({ sort: value })}><Icon name={icon} size={15} />{label}</button>
                ))}
              </div>
              <span className={styles.optionsLabel}>Prioridade</span>
              <div className={styles.chips}>
                {([['all', 'Todas', 'select_all', ''], ['1', 'Alta', 'flag', 'var(--ds-rose-fg)'], ['2', 'Média', 'flag', 'var(--ds-peach-fg)'], ['3', 'Baixa', 'flag', 'var(--ds-sky-fg)'], ['4', 'Sem', 'outlined_flag', '']] as const).map(([value, label, icon, color]) => (
                  <button key={value} type="button" data-active={priorityFilter === value || undefined} onClick={() => setFilter({ priority: value })}><Icon name={icon} size={15} style={color ? { color } : undefined} />{label}</button>
                ))}
              </div>
              <div className={styles.menuList}>
                <button type="button" onClick={() => { setOptionsOpen(false); props.onScopeChange('today') }}><Icon name="today" size={18} style={{ color: 'var(--ds-mint-fg)' }} /><span>Hoje</span>{counts.today ? <small>{counts.today}</small> : null}</button>
                <button type="button" onClick={() => { setOptionsOpen(false); props.onScopeChange('upcoming') }}><Icon name="event_upcoming" size={18} style={{ color: 'var(--ds-lilac-fg)' }} /><span>Em breve</span>{counts.upcoming ? <small>{counts.upcoming}</small> : null}</button>
                <button type="button" onClick={() => { setOptionsOpen(false); props.onScopeChange('all') }}><Icon name="select_all" size={18} /><span>Todas as tarefas</span><small>{counts.all}</small></button>
                <button type="button" onClick={() => { setOptionsOpen(false); setSelectMode(true) }}><Icon name="check_box" size={18} /><span>Selecionar várias</span></button>
              </div>
              <div className={styles.menuList}>
                {projectId ? (
                  <>
                    <button type="button" onClick={() => { setOptionsOpen(false); props.onEditProject(projectId) }}><Icon name="edit" size={18} /><span>Editar projeto</span></button>
                    <button type="button" onClick={() => { setOptionsOpen(false); props.onManageSections(projectId) }}><Icon name="view_agenda" size={18} /><span>Seções</span></button>
                    <button type="button" onClick={() => { setOptionsOpen(false); props.onNewProject(String(root?.id || projectId)) }}><Icon name="subdirectory_arrow_right" size={18} /><span>Novo subprojeto</span></button>
                  </>
                ) : null}
                <button type="button" onClick={() => { setOptionsOpen(false); props.onNewProject() }}><Icon name="create_new_folder" size={18} /><span>Novo projeto</span></button>
              </div>
            </div>
          </Floating>
        ) : null}
      </nav>

      {projectId && family.length > 1 ? (
        <div className={styles.folders} aria-label="Subprojetos">
          {String(root?.id) !== projectId && root ? (
            <button type="button" className={styles.folder} data-back onClick={() => props.onScopeChange(`project:${String(root.id)}`)}>
              <Icon name="arrow_back" size={17} filled={false} />
              <span>{String(root.nome || 'Projeto')}</span>
            </button>
          ) : null}
          {family.filter(item => String(item.id) !== String(root?.id)).map(item => {
            const id = String(item.id)
            return (
              <button key={id} type="button" className={styles.folder} data-active={projectId === id || undefined} onClick={() => props.onScopeChange(`project:${id}`)} onDoubleClick={() => props.onEditProject(id)}>
                {item.imagem_url ? <img className={styles.folderImg} src={driveAssetUrl(item.imagem_url)} alt="" /> : <span className={styles.folderIcon} style={{ background: String(item.cor || 'var(--ds-line-strong)') }}><Icon name={String(item.icone || (projectId === id ? 'folder_open' : 'folder'))} size={14} /></span>}
                <span>{String(item.nome || 'Subprojeto')}</span>
                {projectCount(id) ? <small>{projectCount(id)}</small> : null}
              </button>
            )
          })}
          <button type="button" className={styles.folderAdd} onClick={() => props.onNewProject(String(root?.id || projectId))} aria-label="Novo subprojeto" title="Novo subprojeto"><Icon name="add" size={18} filled={false} /></button>
        </div>
      ) : null}

      {kanban ? (
        <div className={styles.board}>
          {groups.map(group => (
            <section key={group.id} className={styles.column} {...groupDropProps(group)} data-drop-zone={dragId ? 'true' : undefined}>
              <div className={styles.groupHead}>
                <strong>{group.label}</strong>
                <small>{group.tasks.length}</small>
              </div>
              <div className={styles.cards} role="list">{group.tasks.map(task => renderTask(task, group))}</div>
              {renderComposer(group, true)}
            </section>
          ))}
          <button type="button" className={styles.newColumn} onClick={() => props.onManageSections(projectId)}><Icon name="add" size={17} filled={false} />Seção</button>
        </div>
      ) : (
        <div className={styles.list}>
          {isProjectLike ? (
            <header className={styles.projHead}>
              {projectId ? projectVisual(project, 'tab') : <span className={styles.tabVisual} style={{ background: 'var(--ds-accent)' }}><Icon name="inbox" size={12} /></span>}
              <strong>{title}</strong>
              <span className={styles.projCount}>{ctxTasks.filter(task => !task.concluida).length}</span>
            </header>
          ) : null}
          {groups.map(group => {
            const isCollapsed = collapsed.has(group.id)
            const showHead = groups.length > 1 || Boolean(projectId && sections.length) || !isProjectLike
            return (
              <section key={group.id} className={styles.group} {...groupDropProps(group)}>
                {showHead ? (
                  <div className={styles.groupHead} data-tone={group.tone}>
                    <button type="button" className={styles.collapse} onClick={() => toggleCollapsed(group.id)} aria-expanded={!isCollapsed}>
                      {group.projectId ? (group.projectId === 'entrada' ? <span className={styles.tabVisual} style={{ background: 'var(--ds-accent)' }}><Icon name="inbox" size={12} /></span> : projectVisual(projectMap.get(group.projectId), 'tab')) : null}
                      <strong>{group.label}</strong>
                      <small>{group.tasks.length}</small>
                    </button>
                  </div>
                ) : null}
                {!isCollapsed ? (
                  <>
                    <div className={styles.cards} role="list">{group.tasks.map(task => renderTask(task, group))}</div>
                    {!group.tasks.length && !canAddIn(group) ? <p className={styles.empty}>Nada por aqui.</p> : null}
                    {canAddIn(group) ? renderComposer(group, true) : null}
                  </>
                ) : null}
              </section>
            )
          })}
          {!groups.length ? (
            <div className={styles.emptyState}>
              <Icon name={scope === 'upcoming' ? 'event_available' : 'task_alt'} size={30} />
              <strong>{scope === 'upcoming' ? 'Nada agendado para os próximos dias' : 'Tudo em dia'}</strong>
              <span>As tarefas com data futura aparecem aqui, agrupadas por dia.</span>
            </div>
          ) : null}

          {completed.length ? (
            <section className={styles.group}>
              {ctxFilter === 'done' ? null : (
                <button type="button" className={styles.doneToggle} onClick={() => toggleCollapsed('done')} aria-expanded={collapsed.has('done')}>
                  {collapsed.has('done') ? 'Esconder concluídas' : `Concluídas (${completed.length})`}
                </button>
              )}
              {collapsed.has('done') || ctxFilter === 'done' ? <div className={styles.cards} role="list">{completed.slice(0, 60).map(task => renderTask(task, { id: 'done', label: '', tasks: [] }))}</div> : null}
            </section>
          ) : null}
        </div>
      )}

      {selecting ? (
        <div className={styles.bulk} role="toolbar" aria-label="Ações das tarefas selecionadas">
          <div className={styles.bulkInfo}>
            <button type="button" className={styles.bulkClose} onClick={() => clearSelection()} aria-label="Limpar seleção"><Icon name="close" size={18} filled={false} /></button>
            <strong>{plural(selected.size, 'selecionada', 'selecionadas')}</strong>
            <button type="button" className={styles.bulkAll} onClick={() => setSelected(new Set(visibleIds))}>Todas</button>
          </div>
          <div className={styles.bulkActions}>
            <button type="button" onClick={() => { patchMany(selectedIds, () => ({ concluida: !allDone, concluida_em: !allDone ? new Date().toISOString() : '' })); clearSelection() }}><Icon name={allDone ? 'undo' : 'check_circle'} size={20} style={{ color: 'var(--ds-mint-fg)' }} /><span>{allDone ? 'Reabrir' : 'Concluir'}</span></button>
            <button type="button" ref={bulkRefs.date} onClick={() => setBulkPicker('date')}><Icon name="calendar_today" size={20} style={{ color: 'var(--ds-accent)' }} /><span>Data</span></button>
            <button type="button" ref={bulkRefs.priority} onClick={() => setBulkPicker('priority')}><Icon name="flag" size={20} style={{ color: 'var(--ds-peach-fg)' }} /><span>Prioridade</span></button>
            <button type="button" ref={bulkRefs.move} onClick={() => setBulkPicker('move')}><Icon name="drive_file_move" size={20} style={{ color: 'var(--ds-lilac-fg)' }} /><span>Mover</span></button>
            <button type="button" data-danger onClick={() => void removeTasks(selectedIds)}><Icon name="delete" size={20} /><span>Excluir</span></button>
          </div>
          {bulkPicker === 'date' ? (
            <Floating anchor={bulkRefs.date} title="Nova data" width={300} onClose={() => setBulkPicker('')}>
              <DatePicker value="" today={today} onSelect={value => { setBulkPicker(''); patchMany(selectedIds, task => ({ data_vencimento: withDate(task, value) })); clearSelection() }} />
            </Floating>
          ) : null}
          {bulkPicker === 'priority' ? (
            <Floating anchor={bulkRefs.priority} title="Prioridade" onClose={() => setBulkPicker('')}>
              <OptionList options={PRIORITIES} value="" onSelect={value => { setBulkPicker(''); patchMany(selectedIds, () => ({ prioridade: Number(value) })); clearSelection() }} />
            </Floating>
          ) : null}
          {bulkPicker === 'move' ? (
            <Floating anchor={bulkRefs.move} title="Mover para" width={260} onClose={() => setBulkPicker('')}>
              <OptionList options={moveOptions} value="" onSelect={value => { setBulkPicker(''); patchMany(selectedIds, task => ({ projeto_id: value, secao: String(task.projeto_id || 'entrada') === value ? task.secao : '' })); clearSelection() }} />
            </Floating>
          ) : null}
        </div>
      ) : null}

      {quick.element}
    </div>
  )
}
