'use client'

import { useRef, useState, type ReactNode, type RefObject } from 'react'
import { addDays } from '../../../lib/v2/planner'
import type { MaiState } from '../../../lib/v2/state'
import { driveAssetUrl } from '../DriveAsset'
import { DatePicker, Floating, ProjectPicker, ReminderPicker, RepeatPicker, TimePicker, reminderLabel, repeatLabel } from '../detail/Pickers'
import { askConfirm } from './ConfirmDialog'
import type { QuickMenuConfig, QuickOption } from './QuickMenu'

/*
 * Edição rápida de tarefa (botão direito ou segurar): serve para tarefas e
 * subtarefas, em qualquer tela. Data, horário, prioridade, repetir, lembrete e
 * projeto abrem os mesmos seletores do cartão.
 */

type Row = Record<string, any>
type Kind = 'date' | 'time' | 'repeat' | 'reminder' | 'project'

const PRIORITY_COLOR: Record<number, string> = { 1: 'var(--ds-danger)', 2: 'var(--ds-warn)', 3: 'var(--ds-sky-fg, #4a8fd9)' }
const dateOf = (task: Row) => String(task.data_vencimento || '').slice(0, 10)
const timeOf = (task: Row) => (String(task.data_vencimento || '').includes('T') ? String(task.data_vencimento).slice(11, 16) : '')

export function useTaskQuick(options: {
  state: MaiState
  today: string
  commit: (change: (current: MaiState) => MaiState) => void
  onOpen: (task: Row) => void
  /** Ações a mais (ex.: Selecionar), antes de Excluir. */
  extra?: (task: Row) => QuickOption[]
  onDelete?: (task: Row) => void | Promise<void>
}) {
  const { state, today, commit, onOpen } = options
  const [picker, setPicker] = useState<{ id: string; kind: Kind; x: number; y: number } | null>(null)
  const anchor = useRef<{ getBoundingClientRect: () => DOMRect } | null>(null)

  const patch = (id: string, change: Row) => commit(current => ({ ...current, tasks: current.tasks.map(task => String(task.id) === id ? { ...task, ...change } : task) }))
  const toggle = (id: string) => commit(current => ({ ...current, tasks: current.tasks.map(task => String(task.id) === id ? { ...task, concluida: !task.concluida, concluida_em: !task.concluida ? new Date().toISOString() : '' } : task) }))

  const withDate = (task: Row, date: string) => (date ? `${date}${timeOf(task) ? `T${timeOf(task)}` : ''}` : '')

  async function remove(task: Row) {
    if (options.onDelete) return options.onDelete(task)
    const title = String(task.titulo || 'Tarefa')
    if (!(await askConfirm({ title: 'Excluir tarefa?', message: `“${title}” será excluída. Não dá para desfazer.` }))) return
    const id = String(task.id)
    commit(current => ({ ...current, tasks: current.tasks.filter(item => String(item.id) !== id && String(item.parent_id || '') !== id) }))
  }

  function menu(task: Row): QuickMenuConfig {
    const id = String(task.id)
    const due = dateOf(task)
    const time = timeOf(task)
    const priority = Number(task.prioridade || 4)
    const repeat = String(task.repeticao || '')
    const reminder = String((Array.isArray(task.lembretes) ? task.lembretes[0] : '') || '')
    const project = (state.projects as Row[]).find(item => String(item.id) === String(task.projeto_id || 'entrada'))
    const ask = (kind: Kind) => (point?: { x: number; y: number }) => setPicker({ id, kind, x: point?.x ?? 0, y: point?.y ?? 0 })
    return {
      title: String(task.titulo || 'Tarefa'),
      subtitle: `${project ? String(project.nome) : 'Entrada'}${task.secao ? ` · ${String(task.secao)}` : ''}`,
      groups: [
        { label: 'Data', inline: true, options: [
          { label: 'Hoje', icon: 'today', active: due === today, onSelect: () => patch(id, { data_vencimento: withDate(task, today) }) },
          { label: 'Amanhã', icon: 'wb_sunny', active: due === addDays(today, 1), onSelect: () => patch(id, { data_vencimento: withDate(task, addDays(today, 1)) }) },
          { label: 'Sem data', icon: 'event_busy', active: !due, onSelect: () => patch(id, { data_vencimento: '' }) },
          { label: 'Calendário', icon: 'calendar_today', onSelect: ask('date') },
        ] },
        { label: 'Prioridade', inline: true, options: [1, 2, 3, 4].map(level => ({ label: ['Alta', 'Média', 'Baixa', 'Nenhuma'][level - 1], icon: 'flag', color: PRIORITY_COLOR[level] || 'var(--ds-muted)', active: priority === level, onSelect: () => patch(id, { prioridade: level }) })) },
        { options: [
          { label: time ? `Horário: ${time}` : 'Horário', icon: 'schedule', onSelect: ask('time') },
          { label: repeat ? `Repetir: ${repeatLabel(repeat)}` : 'Repetir', icon: 'repeat', onSelect: ask('repeat') },
          { label: reminder ? `Lembrete: ${reminderLabel(reminder)}` : 'Lembrete', icon: 'notifications', onSelect: ask('reminder') },
          { label: 'Projeto', icon: 'folder', onSelect: ask('project') },
        ] },
        { options: [
          { label: task.concluida ? 'Reabrir tarefa' : 'Concluir', icon: task.concluida ? 'undo' : 'check_circle', onSelect: () => toggle(id) },
          ...(options.extra ? options.extra(task) : []),
          { label: 'Abrir detalhes', icon: 'open_in_full', onSelect: () => onOpen(task) },
          { label: 'Excluir', icon: 'delete', tone: 'danger', onSelect: () => remove(task) },
        ] },
      ],
    }
  }

  let element: ReactNode = null
  if (picker) {
    const task = (state.tasks as Row[]).find(item => String(item.id) === picker.id)
    if (task) {
      const id = picker.id
      const close = () => setPicker(null)
      const done = (change: Row) => { close(); patch(id, change) }
      anchor.current = { getBoundingClientRect: () => new DOMRect(picker.x, picker.y, 0, 0) }
      const ref = anchor as unknown as RefObject<HTMLElement | null>
      const due = dateOf(task)
      const time = timeOf(task)
      const projects = (state.projects as Row[]).filter(item => item.ativo !== false)
      const title = { date: 'Data', time: 'Horário', repeat: 'Repetir', reminder: 'Lembrete', project: 'Projeto' }[picker.kind]
      element = (
        <Floating anchor={ref} title={title} width={picker.kind === 'date' ? 300 : 280} onClose={close}>
          {picker.kind === 'date' ? <DatePicker value={due} today={today} onSelect={value => done({ data_vencimento: withDate(task, value) })} /> : null}
          {picker.kind === 'time' ? <TimePicker value={time} onSelect={value => done({ data_vencimento: value ? `${due || today}T${value}` : due })} /> : null}
          {picker.kind === 'repeat' ? <RepeatPicker value={String(task.repeticao || '')} onSelect={value => done({ repeticao: value })} /> : null}
          {picker.kind === 'reminder' ? <ReminderPicker value={String((Array.isArray(task.lembretes) ? task.lembretes[0] : '') || '')} onSelect={value => done({ lembretes: value ? [value] : [] })} /> : null}
          {picker.kind === 'project' ? <ProjectPicker projects={projects} projectId={String(task.projeto_id || 'entrada')} section={String(task.secao || '')} imageOf={item => item.imagem_url ? driveAssetUrl(item.imagem_url) : undefined} onSelect={(projectId, section) => done({ projeto_id: projectId, secao: section })} /> : null}
        </Floating>
      )
    }
  }

  return { menu, element }
}
