'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import type { MaiState } from '../../../lib/v2/state'
import type { Row } from '../app-types'
import styles from './DayNotes.module.css'

type Props = {
  state: MaiState
  day: string
  commit: (updater: (current: MaiState) => MaiState) => void
}

/** Linha que vira tarefa: começa com [] ou [ ]. Já criada: [x]. */
const PENDING = /^\s*\[\s?\]\s+(.+)$/

/** Anotações do dia: texto livre por data, salvo sozinho. Linhas com [] viram tarefas daquele dia. */
export function DayNotes({ state, day, commit }: Props) {
  const saved = String((state.configs.dayNotes as Record<string, string> | undefined)?.[day] || '')
  const [text, setText] = useState(saved)
  const dirty = useRef(false)
  const area = useRef<HTMLTextAreaElement | null>(null)
  const latest = useRef({ text, day })
  latest.current = { text, day }

  const write = (value: string, forDay: string) => {
    commit(current => {
      const map = { ...((current.configs.dayNotes as Record<string, string> | undefined) || {}) }
      if (value.trim()) map[forDay] = value
      else delete map[forDay]
      return { ...current, configs: { ...current.configs, dayNotes: map } }
    })
  }

  // Troca de dia: grava o que estava pendente no dia anterior e carrega o novo.
  const lastDay = useRef(day)
  useEffect(() => {
    if (lastDay.current !== day) {
      if (dirty.current) write(latest.current.text, lastDay.current)
      dirty.current = false
      lastDay.current = day
      setText(String((state.configs.dayNotes as Record<string, string> | undefined)?.[day] || ''))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [day])

  useEffect(() => {
    if (!dirty.current) return
    const timer = window.setTimeout(() => { write(text, day); dirty.current = false }, 600)
    return () => window.clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text])

  useEffect(() => () => { if (dirty.current) write(latest.current.text, latest.current.day) }, [])

  useEffect(() => {
    const element = area.current
    if (!element) return
    element.style.height = 'auto'
    element.style.height = `${Math.max(96, element.scrollHeight)}px`
  }, [text])

  const lines = useMemo(() => text.split('\n'), [text])
  const pending = useMemo(() => lines.map((line, index) => ({ index, title: (PENDING.exec(line)?.[1] || '').trim() })).filter(item => item.title), [lines])

  const createTasks = (indexes: number[]) => {
    const picked = pending.filter(item => indexes.includes(item.index))
    if (!picked.length) return
    const stamp = Date.now()
    const tasks: Row[] = picked.map((item, order) => ({
      id: `t-${crypto.randomUUID()}`, titulo: item.title, descricao: '', data_vencimento: day, prioridade: 4, concluida: false,
      projeto_id: '', parent_id: '', meta_id: '', secao: '', criado_em: new Date().toISOString(), ordem: stamp + order,
      notas: [], anexos: [], subtarefas: [], lembretes: [], etiquetas: [], repeticao: '', ocultar_agenda: false,
    }))
    const next = lines.map((line, index) => (indexes.includes(index) ? line.replace(/^(\s*)\[\s?\]/, '$1[x]') : line)).join('\n')
    setText(next)
    dirty.current = false
    commit(current => {
      const map = { ...((current.configs.dayNotes as Record<string, string> | undefined) || {}) }
      map[day] = next
      return { ...current, tasks: [...current.tasks, ...(tasks as unknown as typeof current.tasks)], configs: { ...current.configs, dayNotes: map } }
    })
  }

  return (
    <div className={styles.notes}>
      <textarea
        ref={area}
        className={styles.area}
        value={text}
        rows={4}
        aria-label="Anotações do dia"
        placeholder={'Como quero meu dia?\n\n[] Linha com colchetes vira tarefa'}
        onChange={event => { dirty.current = true; setText(event.target.value) }}
        onBlur={() => { if (dirty.current) { write(text, day); dirty.current = false } }}
      />
      {pending.length ? (
        <div className={styles.pending} role="list" aria-label="Linhas que podem virar tarefa">
          {pending.map(item => (
            <div key={item.index} className={styles.pendingRow} role="listitem">
              <span className={styles.pendingTitle}>{item.title}</span>
              <button type="button" className={styles.link} onClick={() => createTasks([item.index])}>Criar tarefa</button>
            </div>
          ))}
          {pending.length > 1 ? <button type="button" className={styles.primary} onClick={() => createTasks(pending.map(item => item.index))}>Criar {pending.length} tarefas</button> : null}
        </div>
      ) : null}
    </div>
  )
}
