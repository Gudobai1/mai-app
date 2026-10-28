'use client'

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type DragEvent, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react'
import { addDays } from '../../../lib/v2/planner'
import type { LegacyTask, MaiState } from '../../../lib/v2/state'
import { Icon } from '../../ds'
import type { AppView, Row, TaskModuleScope } from '../app-types'
import type { InspectableItem } from '../ContextDrawer'
import { DatePicker, Floating, OptionList, type PickerOption } from '../detail/Pickers'
import { driveAssetUrl } from '../DriveAsset'
import { askConfirm } from '../shell/ConfirmDialog'
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
  onNewProject: () => void
  onEditProject: (id: string) => void
  onManageSections: (id: string) => void
  options?: ReactNode
}

type SortMode = 'manual' | 'date' | 'priority' | 'project' | 'name'
type Group = { id: string; label: string; tasks: LegacyTask[]; addDate?: string; section?: string; tone?: 'danger' }

const rows = (value: unknown): Row[] => (Array.isArray(value) ? (value as Row[]) : [])
const dayOf = (task: Row) => String(task.data_vencimento || '').slice(0, 10)
const timeOf = (task: Row) => (String(task.data_vencimento || '').includes('T') ? String(task.data_vencimento).slice(11, 16) : '')
const standalone = (task: LegacyTask) => !task.parent_id || Boolean(dayOf(task))
const uid = (prefix: string) => `${prefix}-${crypto.randomUUID()}`
const plainText = (value: unknown) => String(value || '').replace(/<br\s*\/?>|<\/(p|div|li)>/gi, ' ').replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim()
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
  const kanbanPref = controls.tasks?.layout === 'kanban'

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

  const projectId = scope.startsWith('project:') ? scope.slice(8) : ''
  const project = projectId ? projectMap.get(projectId) : undefined
  const isProjectLike = scope === 'entrada' || Boolean(projectId)
  const kanban = kanbanPref && Boolean(projectId)

  const all = state.tasks.filter(standalone)
  const open = all.filter(task => !task.concluida)
  const counts = {
    entrada: open.filter(task => String(task.projeto_id || 'entrada') === 'entrada').length,
    today: open.filter(task => dayOf(task) && dayOf(task) <= today).length,
    upcoming: open.filter(task => dayOf(task) > today).length,
  }
  const projectCount = (id: string) => open.filter(task => String(task.projeto_id || '') === id).length

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

  let groups: Group[] = []
  let scopeTasks: LegacyTask[] = []
  if (projectId) {
    scopeTasks = all.filter(task => String(task.projeto_id || '') === projectId)
    const openHere = sortTasks(scopeTasks.filter(task => !task.concluida))
    groups = [
      ...sections.map(section => ({ id: `s:${section}`, label: section, section, tasks: openHere.filter(task => sectionOf(task) === section) })),
      { id: 's:', label: sections.length ? 'Sem seção' : 'Tarefas', section: '', tasks: openHere.filter(task => !sectionOf(task)) },
    ]
    if (sections.length && !groups[groups.length - 1].tasks.length && !kanban) groups = groups.slice(0, -1)
  } else if (scope === 'entrada') {
    scopeTasks = all.filter(task => String(task.projeto_id || 'entrada') === 'entrada')
    groups = [{ id: 'entrada', label: 'Tarefas', section: '', tasks: sortTasks(scopeTasks.filter(task => !task.concluida)) }]
  } else if (scope === 'today') {
    scopeTasks = all.filter(task => dayOf(task) && dayOf(task) <= today)
    const openHere = sortTasks(scopeTasks.filter(task => !task.concluida))
    const late = openHere.filter(task => dayOf(task) < today)
    groups = [
      ...(late.length ? [{ id: 'late', label: 'Atrasadas', tasks: late, tone: 'danger' as const }] : []),
      { id: 'today', label: 'Hoje', tasks: openHere.filter(task => dayOf(task) === today), addDate: today },
    ]
    scopeTasks = scopeTasks.filter(task => !task.concluida || dayOf(task) === today)
  } else {
    scopeTasks = all.filter(task => dayOf(task) > today)
    const openHere = sortTasks(scopeTasks.filter(task => !task.concluida))
    const days = [...new Set(openHere.map(dayOf))].sort()
    groups = days.map(day => ({ id: `d:${day}`, label: naturalDate(day, today), tasks: openHere.filter(task => dayOf(task) === day), addDate: day }))
  }
  const completed = scopeTasks.filter(task => task.concluida).sort((a, b) => String(b.concluida_em || '').localeCompare(String(a.concluida_em || '')))
  const openCount = groups.reduce((sum, group) => sum + group.tasks.length, 0)
  const lateCount = groups.reduce((sum, group) => sum + group.tasks.filter(task => dayOf(task) && dayOf(task) < today).length, 0)

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
    setSelected(new Set())
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
  const selecting = selected.size > 0
  const toggleSelect = (id: string) => setSelected(current => {
    const next = new Set(current)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  })
  useEffect(() => { setSelected(new Set()) }, [scope])
  useEffect(() => {
    if (!selecting) return
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setSelected(new Set()) }
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
  function addTask(group: Group) {
    const title = draftTitle.trim()
    if (!title) return
    const task: Row = {
      id: uid('t'), titulo: title, descricao: '', data_vencimento: group.addDate || '', prioridade: 4, concluida: false,
      projeto_id: projectId || 'entrada', parent_id: '', secao: group.section || '', criado_em: new Date().toISOString(), ordem: Date.now(),
      notas: [], anexos: [], subtarefas: [], lembretes: [], etiquetas: [], repeticao: '', ocultar_agenda: false,
    }
    commit(current => ({ ...current, tasks: [...current.tasks, task as LegacyTask] }))
    setDraftTitle('')
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

  const projectVisual = (item: Row | undefined, size: 'tab' | 'head') => {
    const className = size === 'tab' ? styles.tabVisual : styles.headVisual
    if (item?.imagem_url) return <img className={className} src={driveAssetUrl(item.imagem_url)} alt="" />
    return <span className={className} style={{ background: String(item?.cor || 'var(--ds-line-strong)') }}><Icon name={String(item?.icone || 'folder')} size={size === 'tab' ? 12 : 22} /></span>
  }

  const scopeTabs: { scope: TaskModuleScope; label: string; icon: string; color: string; count: number }[] = [
    { scope: 'entrada', label: 'Entrada', icon: 'inbox', color: 'var(--ds-accent)', count: counts.entrada },
    { scope: 'today', label: 'Hoje', icon: 'today', color: 'var(--ds-mint-fg)', count: counts.today },
    { scope: 'upcoming', label: 'Em breve', icon: 'event_upcoming', color: 'var(--ds-lilac-fg)', count: counts.upcoming },
  ]

  /* ---------------------------------------------------------- Cabeçalho */

  const title = projectId ? String(project?.nome || 'Projeto') : scope === 'entrada' ? 'Entrada' : scope === 'today' ? 'Hoje' : 'Em breve'
  const headIcon = projectId ? projectVisual(project, 'head') : (
    <span className={styles.headVisual} style={{ background: scope === 'entrada' ? 'var(--ds-accent)' : scope === 'today' ? 'var(--ds-mint-fg)' : 'var(--ds-lilac-fg)' }}>
      <Icon name={scope === 'entrada' ? 'inbox' : scope === 'today' ? 'today' : 'event_upcoming'} size={22} />
    </span>
  )
  const summary = [plural(openCount, 'aberta', 'abertas'), lateCount ? plural(lateCount, 'atrasada', 'atrasadas') : '', projectId && sections.length ? plural(sections.length, 'seção', 'seções') : ''].filter(Boolean).join(' · ')

  const setLayout = (layout: 'normal' | 'kanban') => commit(current => {
    const map = (current.configs.moduleControls && typeof current.configs.moduleControls === 'object' ? current.configs.moduleControls : {}) as Record<string, Row>
    return { ...current, configs: { ...current.configs, moduleControls: { ...map, tasks: { ...(map.tasks || {}), layout } } } }
  })

  const [projectMenu, setProjectMenu] = useState(false)
  const projectMenuRef = useRef<HTMLButtonElement | null>(null)

  /* ------------------------------------------------------------- Cartão */

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
    const showProject = !isProjectLike
    const bind = quick.bind(() => taskMenu(task), { onLongPress: () => toggleSelect(id) })

    const onClick = (event: ReactMouseEvent) => {
      if (event.ctrlKey || event.metaKey || event.shiftKey || selecting) {
        event.preventDefault()
        toggleSelect(id)
        return
      }
      openTask(task)
    }

    return (
      <div
        key={id}
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
          <button type="button" className={styles.check} data-done={done || undefined} data-late={late || undefined} onClick={() => toggleTask(id)} aria-label={done ? `Reabrir ${String(task.titulo)}` : `Concluir ${String(task.titulo)}`}>
            {done ? <Icon name="check" size={13} /> : null}
          </button>
        )}
        <button type="button" className={styles.cardMain} onClick={onClick}>
          <span className={styles.cardTitle}>{String(task.titulo || 'Tarefa')}</span>
          {desc ? <span className={styles.cardDesc}>{desc}</span> : null}
          {(showDate || time || showProject || children.length || files || task.repeticao) ? (
            <span className={styles.cardMeta}>
              {showDate ? <span data-late={late || undefined}><Icon name="calendar_today" size={13} />{naturalDate(due, today)}{time ? ` · ${time}` : ''}</span> : time ? <span><Icon name="schedule" size={13} />{time}</span> : null}
              {showProject ? (
                <span className={styles.metaProject}>
                  {projectMap.get(String(task.projeto_id || ''))?.imagem_url ? <img src={driveAssetUrl(projectMap.get(String(task.projeto_id))?.imagem_url)} alt="" /> : <i style={{ background: String(projectMap.get(String(task.projeto_id || ''))?.cor || 'var(--ds-accent)') }} />}
                  {projectName(task.projeto_id)}{task.secao ? <em> · {String(task.secao)}</em> : null}
                </span>
              ) : null}
              {children.length ? <span><Icon name="account_tree" size={13} />{children.filter(child => child.concluida).length}/{children.length}</span> : null}
              {files ? <span><Icon name="attach_file" size={13} />{files}</span> : null}
              {task.repeticao ? <span><Icon name="repeat" size={13} /></span> : null}
            </span>
          ) : null}
        </button>
        {PRIORITY_COLOR[priority] && !done ? <span className={styles.flag} style={{ color: PRIORITY_COLOR[priority] }} title={`Prioridade ${PRIORITIES[priority - 1]?.label || ''}`}><Icon name="flag" size={16} /></span> : null}
      </div>
    )
  }

  const renderComposer = (group: Group) => composer === group.id ? (
    <div className={styles.composer}>
      <input
        autoFocus
        value={draftTitle}
        placeholder="Nome da tarefa"
        enterKeyHint="send"
        onChange={event => setDraftTitle(event.target.value)}
        onKeyDown={event => {
          if (event.key === 'Enter') { event.preventDefault(); addTask(group) }
          if (event.key === 'Escape') { event.preventDefault(); setComposer(''); setDraftTitle('') }
        }}
      />
      <div className={styles.composerActions}>
        <span className={styles.composerHint}>{group.section ? `Na seção ${group.section}` : group.addDate ? naturalDate(group.addDate, today) : 'Enter adiciona e continua'}</span>
        <button type="button" className={styles.ghost} onClick={() => { setComposer(''); setDraftTitle('') }}>Cancelar</button>
        <button type="button" className={styles.primarySmall} disabled={!draftTitle.trim()} onClick={() => addTask(group)}>Adicionar</button>
      </div>
    </div>
  ) : (
    <button type="button" className={styles.addLine} onClick={() => { setComposer(group.id); setDraftTitle('') }}>
      <span className={styles.addDot}><Icon name="add" size={15} /></span>Adicionar tarefa
    </button>
  )

  const canAddIn = (group: Group) => isProjectLike || Boolean(group.addDate)

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
      <div className={styles.tabsWrap}>
        <div className={styles.tabs} ref={tabsRef} onWheel={onTabsWheel} role="tablist" aria-label="Listas e projetos">
          {scopeTabs.map(tab => (
            <button key={tab.scope} type="button" role="tab" className={styles.tab} data-active={scope === tab.scope || undefined} aria-selected={scope === tab.scope} onClick={() => props.onScopeChange(tab.scope)}>
              <Icon name={tab.icon} size={17} style={{ color: tab.color }} />
              <span>{tab.label}</span>
              {tab.count ? <small>{tab.count}</small> : null}
            </button>
          ))}
          <span className={styles.tabDivider} aria-hidden="true" />
          {projects.map(item => {
            const id = String(item.id)
            const active = projectId === id
            return (
              <button key={id} type="button" role="tab" className={styles.tab} data-active={active || undefined} data-child={Number(item._depth || 0) > 0 || undefined} aria-selected={active} onClick={() => props.onScopeChange(`project:${id}`)} onDoubleClick={() => props.onEditProject(id)}>
                {projectVisual(item, 'tab')}
                <span>{String(item.nome || 'Projeto')}</span>
                {item.favorito ? <Icon name="star" size={12} className={styles.star} /> : null}
                {projectCount(id) ? <small>{projectCount(id)}</small> : null}
              </button>
            )
          })}
          <button type="button" className={styles.tabAdd} onClick={props.onNewProject} aria-label="Novo projeto" title="Novo projeto"><Icon name="add" size={18} filled={false} /></button>
        </div>
      </div>

      <header className={styles.header}>
        <div className={styles.headLeft}>
          {headIcon}
          <div className={styles.headText}>
            <h1>{title}</h1>
            <span>{summary}</span>
          </div>
          {projectId ? (
            <>
              <button ref={projectMenuRef} type="button" className={styles.iconButton} onClick={() => setProjectMenu(true)} aria-label="Opções do projeto"><Icon name="more_horiz" size={20} filled={false} /></button>
              {projectMenu ? (
                <Floating anchor={projectMenuRef} title={String(project?.nome || 'Projeto')} onClose={() => setProjectMenu(false)} width={240}>
                  <OptionList value="" options={[{ value: 'edit', label: 'Editar projeto', icon: 'edit' }, { value: 'sections', label: 'Seções', icon: 'view_agenda' }, { value: 'sub', label: 'Novo subprojeto', icon: 'subdirectory_arrow_right' }]} onSelect={value => {
                    setProjectMenu(false)
                    if (value === 'edit') props.onEditProject(projectId)
                    if (value === 'sections') props.onManageSections(projectId)
                    if (value === 'sub') props.onNewProject()
                  }} />
                </Floating>
              ) : null}
            </>
          ) : null}
        </div>
        <div className={styles.headActions}>
          {projectId ? (
            <div className={styles.segmented} role="group" aria-label="Visualização">
              <button type="button" data-active={!kanban || undefined} onClick={() => setLayout('normal')}><Icon name="view_agenda" size={16} /><span>Lista</span></button>
              <button type="button" data-active={kanban || undefined} onClick={() => setLayout('kanban')}><Icon name="view_kanban" size={16} /><span>Quadro</span></button>
            </div>
          ) : null}
          {props.options ? <div className={styles.options}>{props.options}</div> : null}
          <button type="button" className={styles.primary} onClick={props.onAdd}><Icon name="add" size={18} /><span>Tarefa</span></button>
        </div>
      </header>

      {kanban ? (
        <div className={styles.board}>
          {groups.map(group => (
            <section key={group.id} className={styles.column} {...groupDropProps(group)} data-drop-zone={dragId ? 'true' : undefined}>
              <div className={styles.groupHead}>
                <strong>{group.label}</strong>
                <span className={styles.count}>{group.tasks.length}</span>
                <button type="button" className={styles.groupMore} onClick={() => props.onManageSections(projectId)} aria-label="Gerenciar seções"><Icon name="more_horiz" size={18} filled={false} /></button>
              </div>
              <div className={styles.cards} role="list">{group.tasks.map(task => renderTask(task, group))}</div>
              {renderComposer(group)}
            </section>
          ))}
          <button type="button" className={styles.newColumn} onClick={() => props.onManageSections(projectId)}><Icon name="add" size={18} />Nova seção</button>
        </div>
      ) : (
        <div className={styles.list}>
          {groups.map(group => {
            const isCollapsed = collapsed.has(group.id)
            const showHead = groups.length > 1 || Boolean(projectId && sections.length) || !isProjectLike
            return (
              <section key={group.id} className={styles.group} {...groupDropProps(group)}>
                {showHead ? (
                  <div className={styles.groupHead} data-tone={group.tone}>
                    <button type="button" className={styles.collapse} onClick={() => toggleCollapsed(group.id)} aria-expanded={!isCollapsed}>
                      <Icon name={isCollapsed ? 'chevron_right' : 'expand_more'} size={18} filled={false} />
                      <strong>{group.label}</strong>
                    </button>
                    <span className={styles.count}>{group.tasks.length}</span>
                    {projectId ? <button type="button" className={styles.groupMore} onClick={() => props.onManageSections(projectId)} aria-label="Gerenciar seções"><Icon name="more_horiz" size={18} filled={false} /></button> : null}
                  </div>
                ) : null}
                {!isCollapsed ? (
                  <>
                    <div className={styles.cards} role="list">{group.tasks.map(task => renderTask(task, group))}</div>
                    {!group.tasks.length && !canAddIn(group) ? <p className={styles.empty}>Nada por aqui.</p> : null}
                    {canAddIn(group) ? renderComposer(group) : null}
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
              <div className={styles.groupHead}>
                <button type="button" className={styles.collapse} onClick={() => toggleCollapsed('done')} aria-expanded={collapsed.has('done')}>
                  <Icon name={!collapsed.has('done') ? 'chevron_right' : 'expand_more'} size={18} filled={false} />
                  <strong>Concluídas</strong>
                </button>
                <span className={styles.count}>{completed.length}</span>
              </div>
              {collapsed.has('done') ? <div className={styles.cards} role="list">{completed.slice(0, 60).map(task => renderTask(task, { id: 'done', label: '', tasks: [] }))}</div> : null}
            </section>
          ) : null}
        </div>
      )}

      {selecting ? (
        <div className={styles.bulk} role="toolbar" aria-label="Ações das tarefas selecionadas">
          <div className={styles.bulkInfo}>
            <button type="button" className={styles.bulkClose} onClick={() => setSelected(new Set())} aria-label="Limpar seleção"><Icon name="close" size={18} filled={false} /></button>
            <strong>{plural(selected.size, 'selecionada', 'selecionadas')}</strong>
            <button type="button" className={styles.bulkAll} onClick={() => setSelected(new Set(visibleIds))}>Todas</button>
          </div>
          <div className={styles.bulkActions}>
            <button type="button" onClick={() => { patchMany(selectedIds, () => ({ concluida: !allDone, concluida_em: !allDone ? new Date().toISOString() : '' })); setSelected(new Set()) }}><Icon name={allDone ? 'undo' : 'check_circle'} size={20} style={{ color: 'var(--ds-mint-fg)' }} /><span>{allDone ? 'Reabrir' : 'Concluir'}</span></button>
            <button type="button" ref={bulkRefs.date} onClick={() => setBulkPicker('date')}><Icon name="calendar_today" size={20} style={{ color: 'var(--ds-accent)' }} /><span>Data</span></button>
            <button type="button" ref={bulkRefs.priority} onClick={() => setBulkPicker('priority')}><Icon name="flag" size={20} style={{ color: 'var(--ds-peach-fg)' }} /><span>Prioridade</span></button>
            <button type="button" ref={bulkRefs.move} onClick={() => setBulkPicker('move')}><Icon name="drive_file_move" size={20} style={{ color: 'var(--ds-lilac-fg)' }} /><span>Mover</span></button>
            <button type="button" data-danger onClick={() => void removeTasks(selectedIds)}><Icon name="delete" size={20} /><span>Excluir</span></button>
          </div>
          {bulkPicker === 'date' ? (
            <Floating anchor={bulkRefs.date} title="Nova data" width={300} onClose={() => setBulkPicker('')}>
              <DatePicker value="" today={today} onSelect={value => { setBulkPicker(''); patchMany(selectedIds, task => ({ data_vencimento: withDate(task, value) })); setSelected(new Set()) }} />
            </Floating>
          ) : null}
          {bulkPicker === 'priority' ? (
            <Floating anchor={bulkRefs.priority} title="Prioridade" onClose={() => setBulkPicker('')}>
              <OptionList options={PRIORITIES} value="" onSelect={value => { setBulkPicker(''); patchMany(selectedIds, () => ({ prioridade: Number(value) })); setSelected(new Set()) }} />
            </Floating>
          ) : null}
          {bulkPicker === 'move' ? (
            <Floating anchor={bulkRefs.move} title="Mover para" width={260} onClose={() => setBulkPicker('')}>
              <OptionList options={moveOptions} value="" onSelect={value => { setBulkPicker(''); patchMany(selectedIds, task => ({ projeto_id: value, secao: String(task.projeto_id || 'entrada') === value ? task.secao : '' })); setSelected(new Set()) }} />
            </Floating>
          ) : null}
        </div>
      ) : null}

      {quick.element}
    </div>
  )
}
