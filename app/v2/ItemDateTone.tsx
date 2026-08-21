'use client'

import { useEffect } from 'react'
import type { MaiState } from '../../lib/v2/state'

type Row = Record<string, any>
type DateTone = 'overdue' | 'today' | 'future' | 'neutral'

const rows = (value: unknown): Row[] => Array.isArray(value) ? value as Row[] : []
const dateKey = (value: unknown) => String(value || '').slice(0, 10)
const normalized = (value: unknown) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR').replace(/[.,]/g, '').replace(/\s+/g, ' ').trim()
const completedStatus = (value: unknown) => ['pago','paga','quitado','quitada','concluido','concluida','concluído','concluída'].includes(String(value || '').toLocaleLowerCase('pt-BR'))

function localToday() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`
}

function readState(): MaiState | null {
  try {
    const raw = localStorage.getItem('mai-v2-state')
    return raw ? JSON.parse(raw) as MaiState : null
  } catch {
    return null
  }
}

function dateVariants(key: string, today: string) {
  if (!key) return new Set<string>()
  const target = new Date(`${key}T12:00:00`)
  const base = new Date(`${today}T12:00:00`)
  const diff = Math.round((target.getTime() - base.getTime()) / 86_400_000)
  const values = new Set<string>([
    key,
    target.toLocaleDateString('pt-BR'),
    target.toLocaleDateString('pt-BR', { day:'numeric', month:'long' }),
    target.toLocaleDateString('pt-BR', { day:'numeric', month:'short' }),
    target.toLocaleDateString('pt-BR', { weekday:'long' }),
  ].map(normalized))
  if (key === today) values.add('hoje')
  if (diff === 1) values.add('amanha')
  if (diff === -1) values.add('ontem')
  return values
}

function findRecord(state: MaiState, title: string, shownDate: string, today: string) {
  const wantedTitle = normalized(title)
  const wantedDate = normalized(shownDate)
  const candidates: { date:string; pending:boolean }[] = []

  ;(state.tasks || []).forEach(task => {
    if (normalized(task.titulo) !== wantedTitle) return
    candidates.push({ date:dateKey(task.data_vencimento), pending:task.concluida !== true })
  })

  rows(state.goals).forEach(goal => {
    if (normalized(goal.titulo || goal.nome) !== wantedTitle) return
    const done = goal.concluida === true || normalized(goal.status).includes('conclu')
    candidates.push({ date:dateKey(goal.prazo || goal.data_fim || goal.data_limite || goal.deadline), pending:!done })
  })

  rows(state.finance?.transactions).forEach(item => {
    if (normalized(item.titulo || item.descricao || item.nome) !== wantedTitle) return
    const paid = completedStatus(item.status) || (Number(item.valor || 0) > 0 && Number(item.valor_pago || 0) >= Number(item.valor || 0))
    candidates.push({ date:dateKey(item.data), pending:!paid })
  })

  rows(state.notes).forEach(note => {
    if (normalized(note.titulo || 'Sem título') !== wantedTitle) return
    candidates.push({ date:dateKey(note.data || note.updated_at || note.criado_em), pending:false })
  })

  return candidates.find(candidate => candidate.date && dateVariants(candidate.date, today).has(wantedDate)) || (candidates.length === 1 ? candidates[0] : null)
}

function parseShownDate(value: string, today: string): string {
  const text = normalized(value)
  if (!text || text === 'sem data') return ''
  if (text === 'hoje') return today
  const base = new Date(`${today}T12:00:00`)
  if (text === 'amanha' || text === 'ontem') {
    const next = new Date(base)
    next.setDate(base.getDate() + (text === 'amanha' ? 1 : -1))
    return `${next.getFullYear()}-${String(next.getMonth()+1).padStart(2,'0')}-${String(next.getDate()).padStart(2,'0')}`
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text
  const numeric = text.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/)
  if (numeric) {
    const year = numeric[3] ? Number(numeric[3].length === 2 ? `20${numeric[3]}` : numeric[3]) : base.getFullYear()
    return `${year}-${String(Number(numeric[2])).padStart(2,'0')}-${String(Number(numeric[1])).padStart(2,'0')}`
  }
  const months: Record<string,number> = { jan:1,janeiro:1,fev:2,fevereiro:2,mar:3,marco:3,abr:4,abril:4,mai:5,maio:5,jun:6,junho:6,jul:7,julho:7,ago:8,agosto:8,set:9,setembro:9,out:10,outubro:10,nov:11,novembro:11,dez:12,dezembro:12 }
  const long = text.match(/^(\d{1,2})(?: de)? ([a-z]+)(?: de)? ?(\d{4})?$/)
  if (!long || !months[long[2]]) return ''
  const day = Number(long[1])
  const month = months[long[2]]
  if (long[3]) return `${long[3]}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`
  const currentYear = base.getFullYear()
  const choices = [currentYear - 1, currentYear, currentYear + 1].map(year => ({ year, distance:Math.abs(new Date(year,month-1,day,12).getTime() - base.getTime()) }))
  const year = choices.sort((a,b) => a.distance - b.distance)[0].year
  return `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`
}

function toneForDate(date: string, today: string, pending: boolean): DateTone {
  if (!date) return 'neutral'
  if (date === today) return 'today'
  if (date < today && pending) return 'overdue'
  return 'future'
}

export function ItemDateTone() {
  useEffect(() => {
    let observer: MutationObserver | null = null

    const decorate = () => {
      const root = document.querySelector('.mai-v3-workspace') as HTMLElement | null
      if (!root) return
      const state = readState()
      const today = localToday()

      root.querySelectorAll<HTMLElement>('.mai-item-subline-v2').forEach(subline => {
        const dateElement = subline.firstElementChild as HTMLElement | null
        const row = subline.closest<HTMLElement>('.mai-item-row-v2')
        if (!dateElement || !row) return

        const shownDate = String(dateElement.textContent || '').trim()
        const title = String(row.querySelector('.mai-item-titleline-v2 strong')?.textContent || '').trim()
        const isTodaySurface = Boolean(row.closest('.mai-v4-today-single'))
        const isUpcomingSurface = Boolean(row.closest('.mai-upcoming-page,.mai-v3-upcoming-page'))
        const isCompletedSurface = Boolean(row.closest('.mai-v4-completed') || row.classList.contains('mai-completed-row'))
        const isNotesSurface = Boolean(row.closest('.mai-v4-notes-list-page'))

        let tone: DateTone = 'neutral'
        if (normalized(shownDate) === 'hoje' || isTodaySurface) tone = 'today'
        else if (isCompletedSurface || isNotesSurface || isUpcomingSurface) tone = 'future'
        else if (state) {
          const matched = findRecord(state, title, shownDate, today)
          if (matched?.date) tone = toneForDate(matched.date, today, matched.pending)
          else tone = toneForDate(parseShownDate(shownDate, today), today, true)
        } else tone = toneForDate(parseShownDate(shownDate, today), today, true)

        dateElement.dataset.maiDateTone = tone
        dateElement.classList.add('mai-item-date-v4')
      })
    }

    const root = document.querySelector('.mai-v3-shell') || document.body
    const observe = () => observer?.observe(root, { childList:true, subtree:true, characterData:true })
    observer = new MutationObserver(() => {
      observer?.disconnect()
      decorate()
      observe()
    })
    decorate()
    observe()
    const timer = window.setInterval(decorate, 60_000)
    return () => { observer?.disconnect(); window.clearInterval(timer) }
  }, [])

  return null
}
