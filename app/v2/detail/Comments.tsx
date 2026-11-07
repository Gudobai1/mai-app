'use client'

import { createContext, useContext, useEffect, useRef, useState } from 'react'
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

/** Quem comenta: foto e nome do perfil (vem de quem abriu o cartão). */
export type Author = { name?: string; picture?: string } | null
export const AuthorCtx = createContext<Author>(null)

function Avatar() {
  const author = useContext(AuthorCtx)
  const initial = (author?.name || 'M').trim().charAt(0).toUpperCase() || 'M'
  return (
    <span className={styles.avatar} aria-hidden="true">
      {author?.picture ? /* eslint-disable-next-line @next/next/no-img-element */ <img className={styles.avatarImg} src={author.picture} alt="" referrerPolicy="no-referrer" /> : initial}
    </span>
  )
}

/* ---------------------------------------------------------- Texto formatado */

const ALLOWED = new Set(['B', 'STRONG', 'I', 'EM', 'U', 'UL', 'OL', 'LI', 'A', 'BR', 'P', 'DIV'])

/** Deixa só formatação simples (negrito, itálico, lista, link): nada de script nem estilo. */
export function cleanHtml(html: string): string {
  if (typeof DOMParser === 'undefined') return ''
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html')
  const walk = (node: Node) => {
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === 3) continue
      if (child.nodeType !== 1) { child.remove(); continue }
      const el = child as HTMLElement
      if (['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT'].includes(el.tagName)) { el.remove(); continue }
      walk(el)
      if (!ALLOWED.has(el.tagName)) {
        while (el.firstChild) el.parentNode?.insertBefore(el.firstChild, el)
        el.remove()
        continue
      }
      const href = el.tagName === 'A' ? el.getAttribute('href') || '' : ''
      for (const attr of Array.from(el.attributes)) el.removeAttribute(attr.name)
      if (el.tagName === 'A') {
        if (/^(https?:|mailto:)/i.test(href)) { el.setAttribute('href', href); el.setAttribute('target', '_blank'); el.setAttribute('rel', 'noreferrer noopener') }
        else { while (el.firstChild) el.parentNode?.insertBefore(el.firstChild, el); el.remove() }
      }
    }
  }
  walk(doc.body)
  return doc.body.innerHTML.trim()
}

const looksLikeHtml = (text: string) => /<(b|strong|i|em|u|ul|ol|li|a|br|p|div)[\s>/]/i.test(text)

/** Mostra o comentário formatado. */
export function RichText({ text }: { text: string }) {
  if (looksLikeHtml(text)) return <div className={styles.rich} dangerouslySetInnerHTML={{ __html: cleanHtml(text) }} />
  return <div className={styles.rich}>{text.split('\n').map((line, index) => <p key={index}>{line || <br />}</p>)}</div>
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

/** Caixa de escrita com formatação e anexos: serve para comentar e para editar. */
function CommentEditor({ initialHtml = '', initialFiles = [], submitLabel, onSubmit, onCancel, pickFile = false }: { pickFile?: boolean; initialHtml?: string; initialFiles?: Row[]; submitLabel: string; onSubmit: (html: string, files: Row[]) => void; onCancel: () => void }) {
  const [hasText, setHasText] = useState(Boolean(initialHtml))
  const [files, setFiles] = useState<Row[]>(initialFiles)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const area = useRef<HTMLDivElement | null>(null)
  const input = useRef<HTMLInputElement | null>(null)
  useEffect(() => { if (pickFile) input.current?.click() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const el = area.current
    if (!el) return
    if (initialHtml) el.innerHTML = looksLikeHtml(initialHtml) ? cleanHtml(initialHtml) : initialHtml.split('\n').map(line => `<div>${line.replace(/&/g, '&amp;').replace(/</g, '&lt;') || '<br>'}</div>`).join('')
    el.focus()
    const range = document.createRange()
    range.selectNodeContents(el)
    range.collapse(false)
    const selection = window.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(range)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const canSend = (hasText || files.length > 0) && !busy

  const format = (command: string, value?: string) => {
    area.current?.focus()
    document.execCommand(command, false, value)
    setHasText(Boolean(area.current?.innerText.trim()))
  }

  function link() {
    const url = window.prompt('Endereço do link', 'https://')
    if (!url || !/^https?:\/\//i.test(url.trim())) return
    format('createLink', url.trim())
  }

  async function attach(file?: File) {
    if (!file) return
    setBusy(true)
    setError('')
    try {
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
    onSubmit(cleanHtml(area.current?.innerHTML || ''), files)
  }

  const tool = (label: string, icon: string, onClick: () => void) => (
    <button type="button" className={styles.tool} aria-label={label} title={label} onMouseDown={event => event.preventDefault()} onClick={onClick}><Icon name={icon} size={18} filled={false} /></button>
  )

  return (
    <>
      <div
        ref={area}
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        aria-label="Comentar"
        data-placeholder="Comentar"
        className={styles.area}
        onInput={event => setHasText(Boolean(event.currentTarget.innerText.trim()))}
        onPaste={event => {
          event.preventDefault()
          document.execCommand('insertText', false, event.clipboardData.getData('text/plain'))
        }}
        onKeyDown={event => {
          if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onCancel() }
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
          {tool('Negrito', 'format_bold', () => format('bold'))}
          {tool('Itálico', 'format_italic', () => format('italic'))}
          {tool('Lista', 'format_list_bulleted', () => format('insertUnorderedList'))}
          {tool('Link', 'link', link)}
          {tool(busy ? 'Enviando…' : 'Anexar arquivo', 'attach_file', () => input.current?.click())}
        </div>
        <div className={styles.actions}>
          <button type="button" className={styles.cancel} onClick={onCancel}>Cancelar</button>
          <button type="button" className={styles.send} disabled={!canSend} onClick={send}>{submitLabel}</button>
        </div>
      </div>
      <input ref={input} hidden type="file" disabled={busy} onChange={event => { void attach(event.target.files?.[0]); event.currentTarget.value = '' }} />
    </>
  )
}

export function CommentsSection({ comments, onChange }: { comments: Comment[]; onChange: (comments: Comment[]) => void }) {
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState('')
  const [pick, setPick] = useState(false)
  const [preview, setPreview] = useState<Row | null>(null)

  async function removeComment(id: string) {
    if (!(await askConfirm({ title: 'Excluir comentário?', message: 'O comentário será excluído quando você salvar a tarefa.' }))) return
    onChange(comments.filter(comment => comment.id !== id))
  }

  return (
    <section className={styles.section} aria-label="Comentários">
      <h3 className={styles.head}>Comentários{comments.length ? <span>{comments.length}</span> : null}</h3>

      {comments.length ? (
        <ul className={styles.list}>
          {comments.map(comment => (
            <li key={comment.id} className={styles.comment}>
              <Avatar />
              {editing === comment.id ? (
                <div className={styles.box} data-open>
                  <CommentEditor
                    initialHtml={comment.texto}
                    initialFiles={comment.anexos || []}
                    submitLabel="Salvar"
                    onCancel={() => setEditing('')}
                    onSubmit={(texto, anexos) => { onChange(comments.map(item => item.id === comment.id ? { ...item, texto, anexos, editado_em: new Date().toISOString() } : item)); setEditing('') }}
                  />
                </div>
              ) : (
                <div className={styles.bubble}>
                  <div className={styles.meta}>
                    <span>{when(comment.criado_em)}{(comment as Row).editado_em ? ' · editado' : ''}</span>
                    <span className={styles.metaActions}>
                      <button type="button" className={styles.remove} onClick={() => { setOpen(false); setEditing(comment.id) }} aria-label="Editar comentário" title="Editar comentário"><Icon name="edit" size={15} filled={false} /></button>
                      <button type="button" className={styles.remove} onClick={() => void removeComment(comment.id)} aria-label="Excluir comentário" title="Excluir comentário"><Icon name="delete" size={15} filled={false} /></button>
                    </span>
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
              )}
            </li>
          ))}
        </ul>
      ) : null}

      <div className={styles.composerRow}>
        <Avatar />
        <div className={styles.box} data-open={open || undefined}>
          {open ? (
            <CommentEditor
              pickFile={pick}
              submitLabel="Comentar"
              onCancel={() => setOpen(false)}
              onSubmit={(texto, anexos) => { onChange([...comments, { id: `c-${crypto.randomUUID()}`, texto, anexos, criado_em: new Date().toISOString() }]); setOpen(false) }}
            />
          ) : (
            <div className={styles.closed}>
              <button type="button" className={styles.placeholder} onClick={() => { setEditing(''); setPick(false); setOpen(true) }}>Comentar</button>
              <button type="button" className={styles.tool} aria-label="Anexar arquivo" title="Anexar arquivo" onClick={() => { setEditing(''); setPick(true); setOpen(true) }}><Icon name="attach_file" size={18} filled={false} /></button>
            </div>
          )}
        </div>
      </div>
      <FilePreviewOverlay file={preview} onClose={() => setPreview(null)} />
    </section>
  )
}
