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

const escapeHtml = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** Só estes elementos sobrevivem: negrito, listas e linhas (div, com data-c = caixa de seleção). */
function clean(source: string): string {
  if (typeof document === 'undefined') return ''
  const root = document.createElement('div')
  if (/^\s*</.test(source)) root.innerHTML = source
  else {
    root.innerHTML = source.split('\n').map(line => {
      const box = /^\s*\[(x| )?\]\s+(.*)$/.exec(line)
      return box ? `<div data-c="${box[1] ? 1 : 0}">${escapeHtml(box[2])}</div>` : `<div>${escapeHtml(line) || '<br>'}</div>`
    }).join('')
  }
  const walk = (node: Node): string => {
    if (node.nodeType === 3) return escapeHtml(node.textContent || '')
    if (node.nodeType !== 1) return ''
    const element = node as HTMLElement
    const tag = element.tagName.toLowerCase()
    const inner = Array.from(element.childNodes).map(walk).join('')
    if (tag === 'b' || tag === 'strong') return `<b>${inner}</b>`
    if (tag === 'ul' || tag === 'ol' || tag === 'li') return `<${tag}>${inner}</${tag}>`
    if (tag === 'br') return '<br>'
    if (tag === 'div' || tag === 'p') return element.dataset.c === '0' || element.dataset.c === '1' ? `<div data-c="${element.dataset.c}">${inner}</div>` : `<div>${inner}</div>`
    return inner
  }
  return Array.from(root.childNodes).map(walk).join('')
}

const isBlank = (html: string) => !html.replace(/<br>/g, '').replace(/<\/?div>/g, '').replace(/&nbsp;/g, '').trim() && !/data-c|<li/.test(html)

/** Linhas com caixa ainda sem tarefa: [{ index, title }] na ordem do texto. */
function pendingBoxes(html: string): { index: number; title: string }[] {
  if (typeof document === 'undefined' || !html) return []
  const root = document.createElement('div')
  root.innerHTML = html
  return Array.from(root.querySelectorAll('div[data-c]'))
    .map((element, index) => ({ element, index }))
    .filter(item => (item.element as HTMLElement).dataset.c === '0' && (item.element.textContent || '').trim())
    .map(item => ({ index: item.index, title: (item.element.textContent || '').trim() }))
}

/** Anotações do dia: texto formatado por data, salvo sozinho. Linhas com caixa viram tarefas daquele dia. */
export function DayNotes({ state, day, commit }: Props) {
  const stored = String((state.configs.dayNotes as Record<string, string> | undefined)?.[day] || '')
  const editor = useRef<HTMLDivElement | null>(null)
  const [html, setHtml] = useState('')
  const dirty = useRef(false)
  const latest = useRef({ html: '', day })
  latest.current = { html, day }

  const write = (value: string, forDay: string) => {
    commit(current => {
      const map = { ...((current.configs.dayNotes as Record<string, string> | undefined) || {}) }
      if (isBlank(value)) delete map[forDay]
      else map[forDay] = value
      return { ...current, configs: { ...current.configs, dayNotes: map } }
    })
  }

  const load = (source: string) => {
    const value = clean(source)
    if (editor.current) editor.current.innerHTML = value
    setHtml(value)
  }

  useEffect(() => { load(stored) }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const lastDay = useRef(day)
  useEffect(() => {
    if (lastDay.current === day) return
    if (dirty.current) write(latest.current.html, lastDay.current)
    dirty.current = false
    lastDay.current = day
    load(stored)
  }, [day]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!dirty.current) return
    const timer = window.setTimeout(() => { write(html, day); dirty.current = false }, 600)
    return () => window.clearTimeout(timer)
  }, [html]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => { if (dirty.current) write(latest.current.html, latest.current.day) }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const sync = () => {
    const element = editor.current
    if (!element) return
    dirty.current = true
    setHtml(clean(element.innerHTML))
  }

  const run = (command: 'bold' | 'insertUnorderedList' | 'insertOrderedList') => {
    editor.current?.focus()
    document.execCommand(command)
    sync()
  }

  const toggleBox = () => {
    const element = editor.current
    const selection = window.getSelection()
    if (!element || !selection || !selection.anchorNode || !element.contains(selection.anchorNode)) { element?.focus(); return }
    let node: Node | null = selection.anchorNode
    while (node && node.parentNode !== element) node = node.parentNode
    if (!node || node.nodeType !== 1 || (node as HTMLElement).tagName !== 'DIV') {
      document.execCommand('formatBlock', false, 'div')
      node = selection.anchorNode
      while (node && node.parentNode !== element) node = node.parentNode
    }
    if (!node || node.nodeType !== 1) return
    const block = node as HTMLElement
    if (block.dataset.c) delete block.dataset.c
    else block.dataset.c = '0'
    sync()
  }

  const onEditorClick = (event: React.MouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement
    if (target.tagName === 'DIV' && target.dataset.c && event.nativeEvent.offsetX < 24) {
      target.dataset.c = target.dataset.c === '1' ? '0' : '1'
      sync()
    }
  }

  const pending = useMemo(() => pendingBoxes(html), [html])

  const createTasks = (indexes: number[]) => {
    const element = editor.current
    if (!element) return
    const picked = pending.filter(item => indexes.includes(item.index))
    if (!picked.length) return
    const stamp = Date.now()
    const tasks: Row[] = picked.map((item, order) => ({
      id: `t-${crypto.randomUUID()}`, titulo: item.title, descricao: '', data_vencimento: day, prioridade: 4, concluida: false,
      projeto_id: '', parent_id: '', meta_id: '', secao: '', criado_em: new Date().toISOString(), ordem: stamp + order,
      notas: [], anexos: [], subtarefas: [], lembretes: [], etiquetas: [], repeticao: '', ocultar_agenda: false,
    }))
    const boxes = element.querySelectorAll<HTMLElement>('div[data-c]')
    indexes.forEach(index => { if (boxes[index]) boxes[index].dataset.c = '1' })
    const next = clean(element.innerHTML)
    setHtml(next)
    dirty.current = false
    commit(current => {
      const map = { ...((current.configs.dayNotes as Record<string, string> | undefined) || {}) }
      map[day] = next
      return { ...current, tasks: [...current.tasks, ...(tasks as unknown as typeof current.tasks)], configs: { ...current.configs, dayNotes: map } }
    })
  }

  const keep = (event: React.MouseEvent) => event.preventDefault()

  /** Caixas ainda abertas do dia anterior, para continuar hoje. */
  const yesterday = useMemo(() => {
    const date = new Date(`${day}T12:00:00`)
    date.setDate(date.getDate() - 1)
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
    return pendingBoxes(clean(String((state.configs.dayNotes as Record<string, string> | undefined)?.[key] || '')))
  }, [day, state.configs.dayNotes])

  const bringYesterday = () => {
    const element = editor.current
    if (!element || !yesterday.length) return
    const have = new Set(pendingBoxes(clean(element.innerHTML)).map(item => item.title))
    const add = yesterday.filter(item => !have.has(item.title))
    element.insertAdjacentHTML('beforeend', add.map(item => `<div data-c="0">${escapeHtml(item.title)}</div>`).join(''))
    sync()
  }

  const saveAsNote = () => {
    if (isBlank(html)) return
    const label = new Date(`${day}T12:00:00`).toLocaleDateString('pt-BR', { day: 'numeric', month: 'long' })
    commit(current => ({
      ...current,
      notes: [{
        id: `note-${crypto.randomUUID()}`, titulo: `Anotações de ${label}`, conteudo: html, ativo: true, arquivado: false, fixado: false, tamanho: 'normal', anexos: [], ordem: Date.now(), data: new Date().toISOString(),
      } as unknown as (typeof current.notes)[number], ...current.notes],
    }))
  }

  return (
    <div className={styles.notes}>
      <div className={styles.frame}>
        <div className={styles.toolbar} role="toolbar" aria-label="Formatar anotações">
          <button type="button" className={styles.tool} title="Negrito" aria-label="Negrito" onMouseDown={keep} onClick={() => run('bold')}><b>B</b></button>
          <span className={styles.sep} aria-hidden />
          <button type="button" className={styles.tool} title="Lista com marcadores" aria-label="Lista com marcadores" onMouseDown={keep} onClick={() => run('insertUnorderedList')}>•</button>
          <button type="button" className={styles.tool} title="Lista numerada" aria-label="Lista numerada" onMouseDown={keep} onClick={() => run('insertOrderedList')}>1.</button>
          <button type="button" className={styles.tool} title="Caixa de seleção" aria-label="Caixa de seleção" onMouseDown={keep} onClick={toggleBox}>☐</button>
        </div>
        <div
          ref={editor}
          className={styles.editor}
          contentEditable
          suppressContentEditableWarning
          role="textbox"
          aria-multiline="true"
          aria-label="Anotações do dia"
          data-placeholder="Como quero meu dia?"
          onInput={sync}
          onClick={onEditorClick}
          onBlur={() => { if (dirty.current) { write(html, day); dirty.current = false } }}
        />
      </div>
      <div className={styles.actions}>
        {yesterday.length ? <button type="button" className={styles.link} onClick={bringYesterday}>Trazer {yesterday.length === 1 ? '1 pendência' : `${yesterday.length} pendências`} de ontem</button> : null}
        {!isBlank(html) ? <button type="button" className={styles.link} onClick={saveAsNote}>Salvar em Notas</button> : null}
      </div>
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
