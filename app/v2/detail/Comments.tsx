'use client'

import { Fragment, useRef, useState, type ReactNode } from 'react'
import { Icon } from '../../ds'
import { askConfirm } from '../shell/ConfirmDialog'
import { FilePreviewOverlay } from '../FilePreviewOverlay'
import { uploadAttachment } from './upload'
import styles from './Comments.module.css'

/*
 * Comentários de uma tarefa, como no Todoist: caixa "Comentar" que abre com
 * formatação (negrito, itálico, lista, link) e anexos. Os comentários fazem
 * parte do rascunho da tarefa e só são gravados no botão Salvar.
 */

type Row = Record<string, any>
export type Comment = { id: string; texto: string; anexos: Row[]; criado_em: string }

const AUTHOR = 'M'

/* ---------------------------------------------------------- Texto formatado */

function inline(text: string, keyBase: string): ReactNode[] {
  const out: ReactNode[] = []
  const pattern = /(\*\*([^*]+)\*\*)|(_([^_]+)_)|(\[([^\]]+)\]\((https?:\/\/[^\s)]+)\))|(https?:\/\/[^\s<]+)/g
  let last = 0
  let match: RegExpExecArray | null
  let index = 0
  while ((match = pattern.exec(text))) {
    if (match.index > last) out.push(text.slice(last, match.index))
    const key = `${keyBase}-${index++}`
    if (match[2]) out.push(<strong key={key}>{match[2]}</strong>)
    else if (match[4]) out.push(<em key={key}>{match[4]}</em>)
    else if (match[6]) out.push(<a key={key} href={match[7]} target="_blank" rel="noreferrer noopener">{match[6]}</a>)
    else out.push(<a key={key} href={match[8]} target="_blank" rel="noreferrer noopener">{match[8]}</a>)
    last = match.index + match[0].length
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}

/** Mostra o texto com **negrito**, _itálico_, listas com "- " e links. Nada de HTML cru. */
export function RichText({ text }: { text: string }) {
  const lines = text.split('\n')
  const blocks: ReactNode[] = []
  let list: string[] = []
  const flush = (key: number) => {
    if (!list.length) return
    blocks.push(<ul key={`l${key}`}>{list.map((item, i) => <li key={i}>{inline(item, `l${key}-${i}`)}</li>)}</ul>)
    list = []
  }
  lines.forEach((line, index) => {
    const item = /^\s*[-•]\s+(.*)$/.exec(line)
    if (item) { list.push(item[1]); return }
    flush(index)
    blocks.push(<p key={`p${index}`}>{line ? inline(line, `p${index}`) : <br />}</p>)
  })
  flush(lines.length)
  return <div className={styles.rich}>{blocks.map((block, i) => <Fragment key={i}>{block}</Fragment>)}</div>
}

/* ------------------------------------------------------------------ Seção */

function fileName(file: Row) { return String(file.nome || file.name || 'Arquivo') }
function fileIcon(file: Row) {
  const type = String(file.tipo || file.mimeType || '')
  if (type.includes('pdf')) return 'picture_as_pdf'
  if (type.startsWith('image')) return 'image'
  if (type.includes('sheet') || type.includes('excel')) return 'table_chart'
  return 'description'
}

function when(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString('pt-BR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).replace(/\./g, '')
}

export function CommentsSection({ comments, onChange }: { comments: Comment[]; onChange: (comments: Comment[]) => void }) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [files, setFiles] = useState<Row[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [preview, setPreview] = useState<Row | null>(null)
  const area = useRef<HTMLTextAreaElement | null>(null)
  const input = useRef<HTMLInputElement | null>(null)

  const canSend = Boolean(text.trim() || files.length) && !busy

  function wrap(before: string, after = before, placeholder = 'texto') {
    const el = area.current
    if (!el) return
    const { selectionStart: from, selectionEnd: to } = el
    const picked = text.slice(from, to) || placeholder
    const next = `${text.slice(0, from)}${before}${picked}${after}${text.slice(to)}`
    setText(next)
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(from + before.length, from + before.length + picked.length) })
  }

  function listItem() {
    const el = area.current
    if (!el) return
    const from = text.lastIndexOf('\n', el.selectionStart - 1) + 1
    setText(`${text.slice(0, from)}- ${text.slice(from)}`)
    requestAnimationFrame(() => el.focus())
  }

  function link() {
    const el = area.current
    if (!el) return
    const { selectionStart: from, selectionEnd: to } = el
    const picked = text.slice(from, to) || 'link'
    const next = `${text.slice(0, from)}[${picked}](https://)${text.slice(to)}`
    setText(next)
    const start = from + picked.length + 3
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(start, start + 8) })
  }

  async function attach(file?: File) {
    if (!file) return
    setBusy(true)
    setError('')
    try {
      setFiles(current => [...current])
      const saved = await uploadAttachment(file)
      setFiles(current => [...current, saved])
    } catch (uploadError: any) {
      setError(uploadError?.message || 'Não foi possível anexar o arquivo.')
    } finally {
      setBusy(false)
    }
  }

  function send() {
    if (!canSend) return
    onChange([...comments, { id: `c-${crypto.randomUUID()}`, texto: text.trim(), anexos: files, criado_em: new Date().toISOString() }])
    setText('')
    setFiles([])
    setOpen(false)
  }

  function cancel() {
    setText('')
    setFiles([])
    setError('')
    setOpen(false)
  }

  async function removeComment(id: string) {
    if (!(await askConfirm({ title: 'Excluir comentário?', message: 'O comentário será excluído quando você salvar a tarefa.' }))) return
    onChange(comments.filter(comment => comment.id !== id))
  }

  const tool = (label: string, icon: string, onClick: () => void) => (
    <button type="button" className={styles.tool} aria-label={label} title={label} onMouseDown={event => event.preventDefault()} onClick={onClick}><Icon name={icon} size={18} filled={false} /></button>
  )

  return (
    <section className={styles.section} aria-label="Comentários">
      <h3 className={styles.head}>Comentários{comments.length ? <span>{comments.length}</span> : null}</h3>

      {comments.length ? (
        <ul className={styles.list}>
          {comments.map(comment => (
            <li key={comment.id} className={styles.comment}>
              <span className={styles.avatar} aria-hidden="true">{AUTHOR}</span>
              <div className={styles.bubble}>
                <div className={styles.meta}>
                  <span>{when(comment.criado_em)}</span>
                  <button type="button" className={styles.remove} onClick={() => void removeComment(comment.id)} aria-label="Excluir comentário" title="Excluir comentário"><Icon name="delete" size={15} filled={false} /></button>
                </div>
                {comment.texto ? <RichText text={comment.texto} /> : null}
                {comment.anexos?.length ? (
                  <div className={styles.files}>
                    {comment.anexos.map((file, index) => (
                      <button key={`${file.idDrive || fileName(file)}-${index}`} type="button" className={styles.file} onClick={() => setPreview(file)}><Icon name={fileIcon(file)} size={16} />{fileName(file)}</button>
                    ))}
                  </div>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      <div className={styles.composerRow}>
        <span className={styles.avatar} aria-hidden="true">{AUTHOR}</span>
        <div className={styles.box} data-open={open || undefined}>
          {open ? (
            <>
              <textarea
                ref={area}
                autoFocus
                className={styles.area}
                rows={2}
                value={text}
                placeholder="Comentar"
                onChange={event => setText(event.target.value)}
                onKeyDown={event => {
                  if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); cancel() }
                  if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) { event.preventDefault(); send() }
                }}
              />
              {files.length ? (
                <div className={styles.pending}>
                  {files.map((file, index) => (
                    <span key={index} className={styles.pendingFile}><Icon name={fileIcon(file)} size={15} />{fileName(file)}<button type="button" onClick={() => setFiles(current => current.filter((_, i) => i !== index))} aria-label={`Remover ${fileName(file)}`}><Icon name="close" size={14} filled={false} /></button></span>
                  ))}
                </div>
              ) : null}
              {error ? <p className={styles.error}>{error}</p> : null}
              <div className={styles.toolbar}>
                <div className={styles.tools}>
                  {tool('Negrito', 'format_bold', () => wrap('**'))}
                  {tool('Itálico', 'format_italic', () => wrap('_'))}
                  {tool('Lista', 'format_list_bulleted', listItem)}
                  {tool('Link', 'link', link)}
                  {tool(busy ? 'Enviando…' : 'Anexar arquivo', 'attach_file', () => input.current?.click())}
                </div>
                <div className={styles.actions}>
                  <button type="button" className={styles.cancel} onClick={cancel}>Cancelar</button>
                  <button type="button" className={styles.send} disabled={!canSend} onClick={send}>Comentar</button>
                </div>
              </div>
            </>
          ) : (
            <div className={styles.closed}>
              <button type="button" className={styles.placeholder} onClick={() => setOpen(true)}>Comentar</button>
              <button type="button" className={styles.tool} aria-label="Anexar arquivo" title="Anexar arquivo" onClick={() => { setOpen(true); requestAnimationFrame(() => input.current?.click()) }}><Icon name="attach_file" size={18} filled={false} /></button>
            </div>
          )}
          <input ref={input} hidden type="file" disabled={busy} onChange={event => { void attach(event.target.files?.[0]); event.currentTarget.value = '' }} />
        </div>
      </div>
      <FilePreviewOverlay file={preview} onClose={() => setPreview(null)} />
    </section>
  )
}
