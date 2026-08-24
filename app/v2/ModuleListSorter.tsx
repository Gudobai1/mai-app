'use client'

import { useEffect } from 'react'

type Row = Record<string, any>
type SortMode = 'manual'|'overdue'|'date'|'priority'|'title'|'name'|'time'|'project'|'progress'|'value'|'recent'|'oldest'

const normalize = (value: unknown) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR').replace(/[.,]/g, ' ').replace(/\s+/g, ' ').trim()
const rows = (value: unknown): Row[] => Array.isArray(value) ? value as Row[] : []
const dateKey = (value: unknown) => String(value || '').slice(0, 10)
const localToday = () => { const now = new Date(); return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}` }

function readState(): Row | null {
  try { const raw = localStorage.getItem('mai-v2-state'); return raw ? JSON.parse(raw) as Row : null } catch { return null }
}

function dateFromText(value: string, today: string) {
  const text = normalize(value)
  if (!text) return ''
  if (text.includes('hoje')) return today
  const base = new Date(`${today}T12:00:00`)
  if (text.includes('ontem')) { const d = new Date(base); d.setDate(d.getDate() - 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
  if (text.includes('amanha')) { const d = new Date(base); d.setDate(d.getDate() + 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
  const iso = text.match(/\b(\d{4}-\d{2}-\d{2})\b/); if (iso) return iso[1]
  const numeric = text.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/)
  if (numeric) { const year = numeric[3] ? Number(numeric[3].length === 2 ? `20${numeric[3]}` : numeric[3]) : base.getFullYear(); return `${year}-${String(Number(numeric[2])).padStart(2, '0')}-${String(Number(numeric[1])).padStart(2, '0')}` }
  const months: Record<string, number> = { jan:1,janeiro:1,fev:2,fevereiro:2,mar:3,marco:3,abr:4,abril:4,mai:5,maio:5,jun:6,junho:6,jul:7,julho:7,ago:8,agosto:8,set:9,setembro:9,out:10,outubro:10,nov:11,novembro:11,dez:12,dezembro:12 }
  const long = text.match(/(?:^|\s)(\d{1,2})(?: de)?\s+([a-z]+)(?: de)?\s*(\d{4})?(?:\s|$)/)
  if (!long || !months[long[2]]) return ''
  const day = Number(long[1]), month = months[long[2]]
  if (long[3]) return `${long[3]}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  const years = [base.getFullYear() - 1, base.getFullYear(), base.getFullYear() + 1]
  const year = years.map(y => ({ y, d: Math.abs(new Date(y, month - 1, day, 12).getTime() - base.getTime()) })).sort((a, b) => a.d - b.d)[0].y
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

const titleOf = (el: HTMLElement) => String(el.dataset.maiItemTitle || el.querySelector('.mai-item-titleline-v2 strong')?.textContent || el.querySelector('strong')?.textContent || el.querySelector('button')?.textContent || '').trim()
const visibleDateOf = (el: HTMLElement, today: string) => String(el.dataset.maiItemDate || dateFromText(String(el.querySelector('.mai-item-subline-v2')?.firstElementChild?.textContent || el.querySelector('small')?.textContent || el.querySelector('strong')?.textContent || el.textContent || ''), today) || '')
const visiblePriorityOf = (el: HTMLElement) => { const node = el.querySelector<HTMLElement>('[data-priority]'); const value = Number(el.dataset.maiPriority || node?.dataset.priority || NaN); return Number.isFinite(value) ? value : NaN }
const visibleTimeOf = (el: HTMLElement) => String(el.dataset.maiItemTime || String(el.textContent || '').match(/\b([01]?\d|2[0-3]):[0-5]\d\b/)?.[0] || '')
const visibleProjectOf = (el: HTMLElement) => String(el.dataset.maiProject || el.querySelector('.mai-item-project-tag')?.textContent || el.querySelector('.mai-v3-task-project')?.textContent || '').trim()
const visibleValueOf = (el: HTMLElement) => { const raw = String(el.textContent || '').match(/R\$\s*([\d.]+,\d{2})/)?.[1] || ''; return Number(raw.replace(/\./g, '').replace(',', '.')) || 0 }
const overdueOf = (el: HTMLElement) => el.dataset.maiDateTone === 'overdue' || Boolean(el.querySelector('[data-mai-date-tone="overdue"]'))

function matchingRecord(state: Row, view: string, el: HTMLElement) {
  const title = normalize(titleOf(el))
  if (!title) return null
  const by = (list: Row[], keys: string[]) => list.find(item => keys.some(key => normalize(item[key]) === title)) || null
  if (view === 'goals') return by(rows(state.goals), ['titulo','nome'])
  if (view === 'habits') return by(rows(state.habits), ['nome','titulo'])
  if (view === 'notes') return by(rows(state.notes), ['titulo','nome'])
  if (view === 'finance') return by(rows(state.finance?.transactions), ['titulo','descricao','nome'])
  if (view === 'tasks' || view === 'today' || view === 'upcoming' || view === 'completed') {
    const task = by(rows(state.tasks), ['titulo','title','nome'])
    if (task) return task
    if (view === 'today' || view === 'upcoming' || view === 'completed') {
      const goal = by(rows(state.goals), ['titulo','nome']); if (goal) return goal
      const finance = by(rows(state.finance?.transactions), ['titulo','descricao','nome']); if (finance) return finance
      const habit = by(rows(state.habits), ['nome','titulo']); if (habit) return habit
      const note = by(rows(state.notes), ['titulo','nome']); if (note) return note
    }
  }
  return null
}

function recordDate(record: Row | null) {
  if (!record) return ''
  return dateKey(record.data_vencimento || record.prazo || record.data || record.updated_at || record.criado_em || record.created_at)
}

function priorityOf(el: HTMLElement, state: Row, view: string) {
  const visible = visiblePriorityOf(el)
  if (Number.isFinite(visible)) return visible
  const record = matchingRecord(state, view, el)
  const value = Number(record?.prioridade ?? record?.priority ?? 9)
  return Number.isFinite(value) ? value : 9
}

function timeOf(el: HTMLElement, state: Row, view: string) {
  const visible = visibleTimeOf(el)
  if (visible) return visible.padStart(5, '0')
  const record = matchingRecord(state, view, el)
  return String(record?.hora || record?.hora_inicio || record?.time || '99:99').slice(0, 5)
}

function dateOf(el: HTMLElement, state: Row, view: string, today: string) {
  return visibleDateOf(el, today) || recordDate(matchingRecord(state, view, el))
}

function projectOf(el: HTMLElement, state: Row, view: string) {
  const visible = visibleProjectOf(el)
  if (visible) return visible
  const record = matchingRecord(state, view, el)
  if (!record) return ''
  const id = String(record.projeto_id || record.project_id || '')
  if (!id || id === 'entrada') return id === 'entrada' ? 'Entrada' : ''
  const project = rows(state.projects).find(item => String(item.id) === id)
  return String(project?.nome || project?.name || '')
}

function progressOf(el: HTMLElement, state: Row, view: string, today: string) {
  const text = String(el.textContent || '')
  const percent = text.match(/(\d{1,3})\s*%/)
  if (percent) return Math.max(0, Math.min(100, Number(percent[1])))
  const ratio = text.match(/([\d.,]+)\s+de\s+([\d.,]+)/i)
  if (ratio) {
    const current = Number(ratio[1].replace(',', '.')), total = Number(ratio[2].replace(',', '.'))
    if (Number.isFinite(current) && Number.isFinite(total) && total > 0) return Math.max(0, Math.min(100, current / total * 100))
  }
  const doneNode = el.querySelector<HTMLElement>('[data-done]')
  if (doneNode) return doneNode.dataset.done === 'true' ? 100 : 0
  const record = matchingRecord(state, view, el)
  if (!record) return 0
  if (view === 'goals') {
    const current = Number(record.progresso_atual || 0), total = Math.max(1, Number(record.progresso_total || 100))
    return current / total * 100
  }
  if (view === 'habits') {
    const target = Math.max(1, Number(record.meta || 1))
    const entry = rows(state.habitEntries).find(item => String(item.habito_id) === String(record.id) && dateKey(item.data) === today)
    return Math.max(0, Math.min(100, Number(entry?.valor || 0) / target * 100))
  }
  return 0
}

function compare(mode: SortMode, a: HTMLElement, b: HTMLElement, state: Row, view: string, today: string) {
  const titleCompare = () => titleOf(a).localeCompare(titleOf(b), 'pt-BR', { sensitivity: 'base' })
  if (mode === 'manual') return 0
  if (mode === 'overdue') {
    const overdueA = overdueOf(a), overdueB = overdueOf(b)
    if (overdueA !== overdueB) return overdueA ? -1 : 1
    const da = dateOf(a, state, view, today) || '9999-99-99', db = dateOf(b, state, view, today) || '9999-99-99'
    return da.localeCompare(db) || timeOf(a, state, view).localeCompare(timeOf(b, state, view)) || titleCompare()
  }
  if (mode === 'priority') return priorityOf(a, state, view) - priorityOf(b, state, view) || titleCompare()
  if (mode === 'project') {
    const pa = normalize(projectOf(a, state, view)), pb = normalize(projectOf(b, state, view))
    const ka = pa || '\uffff', kb = pb || '\uffff'
    return ka.localeCompare(kb, 'pt-BR', { sensitivity: 'base' }) || timeOf(a, state, view).localeCompare(timeOf(b, state, view)) || titleCompare()
  }
  if (mode === 'title' || mode === 'name') return titleCompare()
  if (mode === 'time') return timeOf(a, state, view).localeCompare(timeOf(b, state, view)) || titleCompare()
  if (mode === 'progress') return progressOf(b, state, view, today) - progressOf(a, state, view, today) || titleCompare()
  if (mode === 'value') return visibleValueOf(b) - visibleValueOf(a) || titleCompare()
  const da = dateOf(a, state, view, today) || '9999-99-99', db = dateOf(b, state, view, today) || '9999-99-99'
  if (mode === 'recent') return db.localeCompare(da) || titleCompare()
  if (mode === 'oldest') return da.localeCompare(db) || titleCompare()
  return da.localeCompare(db) || timeOf(a, state, view).localeCompare(timeOf(b, state, view)) || titleCompare()
}

function sortChildren(parent: HTMLElement, mode: SortMode, state: Row, view: string, today: string, selector: string) {
  const children = Array.from(parent.children).filter((child): child is HTMLElement => child instanceof HTMLElement && child.matches(selector))
  if (children.length < 2) return
  const indexed = children.map((el, index) => ({ el, index }))
  const desired = [...indexed].sort((a, b) => compare(mode, a.el, b.el, state, view, today) || a.index - b.index).map(item => item.el)
  if (desired.every((el, index) => el === children[index])) return
  desired.forEach(el => parent.appendChild(el))
}

function sortCompletedDays(root: HTMLElement, mode: SortMode, state: Row, view: string, today: string) {
  const parent = root.querySelector<HTMLElement>('.mai-completed-groups'); if (!parent) return
  const sections = Array.from(parent.children).filter((child): child is HTMLElement => child instanceof HTMLElement && child.classList.contains('mai-completed-day'))
  sections.forEach(section => {
    const list = section.querySelector<HTMLElement>('.mai-completed-list,.mai-v3-simple-list')
    if (list) sortChildren(list, mode, state, view, today, '.mai-item-row-v2')
  })
  if (sections.length < 2) return
  if (mode === 'recent' || mode === 'oldest') {
    const desired = [...sections].sort((a, b) => {
      const rowA = a.querySelector<HTMLElement>('.mai-item-row-v2'), rowB = b.querySelector<HTMLElement>('.mai-item-row-v2')
      const da = (rowA ? dateOf(rowA, state, view, today) : '') || dateFromText(String(a.querySelector('header')?.textContent || ''), today) || ''
      const db = (rowB ? dateOf(rowB, state, view, today) : '') || dateFromText(String(b.querySelector('header')?.textContent || ''), today) || ''
      return mode === 'oldest' ? da.localeCompare(db) : db.localeCompare(da)
    })
    if (!desired.every((el, index) => el === sections[index])) desired.forEach(el => parent.appendChild(el))
  } else if (mode === 'title' || mode === 'name') {
    const desired = [...sections].sort((a, b) => titleOf(a.querySelector<HTMLElement>('.mai-item-row-v2') || a).localeCompare(titleOf(b.querySelector<HTMLElement>('.mai-item-row-v2') || b), 'pt-BR', { sensitivity: 'base' }))
    if (!desired.every((el, index) => el === sections[index])) desired.forEach(el => parent.appendChild(el))
  }
}

export function ModuleListSorter() {
  useEffect(() => {
    let observer: MutationObserver | null = null
    let queued = 0

    const apply = () => {
      const root = document.querySelector<HTMLElement>('.mai-v3-workspace'); if (!root) return
      const state = readState(); if (!state) return
      const topbar = document.querySelector<HTMLElement>('.mai-app-topbar')
      const view = String(topbar?.dataset.view || state.configs?.lastView || 'today')
      const controls = state.configs?.moduleControls && typeof state.configs.moduleControls === 'object' ? state.configs.moduleControls as Record<string, Row> : {}
      const mode = String(topbar?.dataset.sortMode || controls[view]?.sort || 'manual') as SortMode
      const today = localToday()

      const parents = new Set<HTMLElement>()
      root.querySelectorAll<HTMLElement>('.mai-item-row-v2').forEach(row => { if (row.parentElement) parents.add(row.parentElement) })
      parents.forEach(parent => sortChildren(parent, mode, state, view, today, '.mai-item-row-v2'))

      root.querySelectorAll<HTMLElement>('.mai-v3-file-list,.mai-v3-file-grid,.mai-v3-health-history,.mai-v3-finance-rows,.mai-v3-report-list,.mai-v3-account-list,.mai-v3-card-list').forEach(parent => sortChildren(parent, mode, state, view, today, 'button,article'))
      root.querySelectorAll<HTMLElement>('.mai-v3-week-grid').forEach(parent => sortChildren(parent, mode, state, view, today, 'div'))
      sortCompletedDays(root, mode, state, view, today)
    }

    const schedule = () => {
      window.clearTimeout(queued)
      queued = window.setTimeout(apply, 30)
    }

    const root = document.querySelector('.mai-v3-shell') || document.body
    const observe = () => observer?.observe(root, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['data-active','data-sort-mode','data-view','data-priority','data-done','data-mai-date-tone'] })
    observer = new MutationObserver(() => { observer?.disconnect(); schedule(); observe() })
    const onInteraction = () => { schedule(); window.setTimeout(apply, 120); window.setTimeout(apply, 350) }
    document.addEventListener('click', onInteraction, true)
    document.addEventListener('change', onInteraction, true)
    apply(); observe()
    const timer = window.setInterval(apply, 1500)
    return () => {
      observer?.disconnect()
      window.clearTimeout(queued)
      window.clearInterval(timer)
      document.removeEventListener('click', onInteraction, true)
      document.removeEventListener('change', onInteraction, true)
    }
  }, [])
  return null
}
