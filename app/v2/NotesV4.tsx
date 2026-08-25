'use client'

import { FormEvent, useEffect, useRef, useState } from 'react'
import type { MaiState } from '../../lib/v2/state'
import type { InspectableItem } from './ContextDrawer'

type Row = Record<string, any>
type Commit = (change: (current: MaiState) => MaiState) => void
type Tab = 'active' | 'archive' | 'trash'
type NoteAction = 'pin' | 'archive' | 'restore' | 'trash' | 'delete'
type Rpc = (method: string, args?: unknown[]) => Promise<any>

const rows = (value: unknown): Row[] => Array.isArray(value) ? value as Row[] : []
const uid = (prefix: string) => `${prefix}-${crypto.randomUUID()}`
const cleanText = (value: unknown) => String(value || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
const formatDate = (value: unknown) => {
  const raw = String(value || '')
  if (!raw) return 'Sem data'
  const date = new Date(raw)
  if (Number.isNaN(date.getTime())) return 'Sem data'
  return date.toLocaleDateString('pt-BR', { day: 'numeric', month: 'short', year: date.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined })
}
const defaultGoogleRpc: Rpc = async (method, args = []) => {
  const response = await fetch('/api/google/rpc', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ method, args }) })
  const data = await response.json()
  if (!response.ok) throw new Error(data.error || 'Não foi possível acessar o Google')
  return data.payload
}

function newNote(): Row {
  return { titulo: '', conteudo: '', ativo: true, arquivado: false, fixado: false, tamanho: 'normal', anexos: [], ordem: Date.now() }
}

function RichNoteEditor({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (ref.current && document.activeElement !== ref.current && ref.current.innerHTML !== value) ref.current.innerHTML = value
  }, [value])

  function command(name: string, argument?: string) {
    ref.current?.focus()
    document.execCommand(name, false, argument)
    onChange(ref.current?.innerHTML || '')
  }

  return <div className="mai-notes-v4-editor">
    <div className="mai-notes-v4-toolbar" aria-label="Formatação da nota">
      <button type="button" title="Título" onClick={() => command('formatBlock', 'H2')}><span className="material-symbols-rounded">format_h2</span></button>
      <button type="button" title="Negrito" onClick={() => command('bold')}><span className="material-symbols-rounded">format_bold</span></button>
      <button type="button" title="Itálico" onClick={() => command('italic')}><span className="material-symbols-rounded">format_italic</span></button>
      <button type="button" title="Sublinhado" onClick={() => command('underline')}><span className="material-symbols-rounded">format_underlined</span></button>
      <button type="button" title="Tachado" onClick={() => command('strikeThrough')}><span className="material-symbols-rounded">strikethrough_s</span></button>
      <span className="mai-notes-v4-toolbar-separator" />
      <button type="button" title="Lista" onClick={() => command('insertUnorderedList')}><span className="material-symbols-rounded">format_list_bulleted</span></button>
      <button type="button" title="Lista numerada" onClick={() => command('insertOrderedList')}><span className="material-symbols-rounded">format_list_numbered</span></button>
      <button type="button" title="Checklist" onClick={() => command('insertUnorderedList')}><span className="material-symbols-rounded">checklist</span></button>
      <button type="button" title="Link" onClick={() => { const url = prompt('Endereço do link:'); if (url) command('createLink', url) }}><span className="material-symbols-rounded">link</span></button>
      <span className="mai-notes-v4-toolbar-separator" />
      <button type="button" title="Remover formatação" onClick={() => command('removeFormat')}><span className="material-symbols-rounded">format_clear</span></button>
    </div>
    <div ref={ref} className="mai-notes-v4-editor-surface" contentEditable suppressContentEditableWarning data-placeholder="Comece a escrever…" onInput={event => onChange(event.currentTarget.innerHTML)} />
  </div>
}

export function NotesV4({ state, commit, createRequest, googleRpc = defaultGoogleRpc }: { state: MaiState; today: string; commit: Commit; createRequest?: string; inspect: (item: InspectableItem) => void; googleRpc?: Rpc }) {
  const notes = rows(state.notes)
  const [tab, setTab] = useState<Tab>('active')
  const [query, setQuery] = useState('')
  const [draft, setDraft] = useState<Row | null>(null)
  const [uploading, setUploading] = useState(false)

  useEffect(() => {
    if (createRequest?.startsWith('notes:')) {
      setTab('active')
      setDraft(newNote())
    }
  }, [createRequest])

  const visible = notes.filter(note => {
    if (tab === 'active' && !(note.ativo !== false && note.arquivado !== true)) return false
    if (tab === 'archive' && !(note.ativo !== false && note.arquivado === true)) return false
    if (tab === 'trash' && note.ativo !== false) return false
    const search = query.trim().toLocaleLowerCase('pt-BR')
    return !search || `${note.titulo || ''} ${cleanText(note.conteudo)}`.toLocaleLowerCase('pt-BR').includes(search)
  }).sort((a, b) => Number(Boolean(b.fixado)) - Number(Boolean(a.fixado)) || Number(a.ordem || 0) - Number(b.ordem || 0) || String(b.data || '').localeCompare(String(a.data || '')))

  function normalized(note: Row): Row {
    return {
      ...note,
      id: note.id || uid('note'),
      titulo: String(note.titulo || '').trim(),
      data: new Date().toISOString(),
      ativo: note.ativo !== false,
      arquivado: note.arquivado === true,
      fixado: note.fixado === true,
      tamanho: ['normal', 'largo', 'grande'].includes(String(note.tamanho)) ? note.tamanho : 'normal',
      anexos: rows(note.anexos),
      ordem: Number(note.ordem || Date.now()),
    }
  }

  function save(event: FormEvent) {
    event.preventDefault()
    if (!draft) return
    if (!String(draft.titulo || '').trim() && !cleanText(draft.conteudo) && !rows(draft.anexos).length) { setDraft(null); return }
    const next = normalized(draft)
    commit(current => ({ ...current, notes: rows(current.notes).some(note => String(note.id) === String(next.id)) ? rows(current.notes).map(note => String(note.id) === String(next.id) ? next : note) : [next, ...rows(current.notes)] }))
    setDraft(null)
  }

  function quickAction(note: Row, kind: NoteAction) {
    if (kind === 'delete' && !confirm('Excluir definitivamente esta nota e seus vínculos?')) return
    commit(current => ({
      ...current,
      notes: kind === 'delete' ? rows(current.notes).filter(item => String(item.id) !== String(note.id)) : rows(current.notes).map(item => String(item.id) === String(note.id) ? {
        ...item,
        fixado: kind === 'pin' ? !item.fixado : item.fixado,
        arquivado: kind === 'archive' ? true : kind === 'restore' ? false : item.arquivado,
        ativo: kind === 'trash' ? false : kind === 'restore' ? true : item.ativo,
        data: new Date().toISOString(),
      } : item),
    }))
    if (draft && String(draft.id) === String(note.id)) setDraft(null)
  }

  function draftAction(kind: Exclude<NoteAction, 'pin'>) {
    if (!draft?.id) return
    if (kind === 'delete') {
      if (!confirm('Excluir definitivamente esta nota e seus vínculos?')) return
      commit(current => ({ ...current, notes: rows(current.notes).filter(item => String(item.id) !== String(draft.id)) }))
      setDraft(null)
      return
    }
    const next = normalized({ ...draft, arquivado: kind === 'archive' ? true : kind === 'restore' ? false : draft.arquivado, ativo: kind === 'trash' ? false : kind === 'restore' ? true : draft.ativo })
    commit(current => ({ ...current, notes: rows(current.notes).map(item => String(item.id) === String(next.id) ? next : item) }))
    setDraft(null)
  }

  function reorder(sourceId: string, targetId: string) {
    if (tab !== 'active' || !sourceId || sourceId === targetId) return
    const ordered = [...visible]
    const from = ordered.findIndex(item => String(item.id) === sourceId)
    const to = ordered.findIndex(item => String(item.id) === targetId)
    if (from < 0 || to < 0) return
    const [moved] = ordered.splice(from, 1)
    ordered.splice(to, 0, moved)
    const rank = new Map(ordered.map((item, index) => [String(item.id), index]))
    commit(current => ({ ...current, notes: rows(current.notes).map(item => rank.has(String(item.id)) ? { ...item, ordem: rank.get(String(item.id)) } : item) }))
  }

  async function upload(file?: File) {
    if (!file || !draft) return
    setUploading(true)
    try {
      const data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result || ''))
        reader.onerror = reject
        reader.readAsDataURL(file)
      })
      const response = await googleRpc('salvarAnexoDrive', [data, file.name, file.type])
      const item = response?.item || response
      setDraft(current => current ? { ...current, anexos: [...rows(current.anexos), { idDrive: item.id, nome: item.name || item.nome || file.name, tipo: item.tipo || file.type, url: item.url || item.webViewLink || '' }] } : current)
    } finally { setUploading(false) }
  }

  async function removeAttachment(index: number) {
    if (!draft) return
    const file = rows(draft.anexos)[index]
    if (file?.idDrive && confirm('Também mover este arquivo para a lixeira do Google Drive?')) await googleRpc('trashDriveItem', [file.idDrive]).catch(() => null)
    setDraft({ ...draft, anexos: rows(draft.anexos).filter((_, position) => position !== index) })
  }

  function changeTab(next: Tab) { setTab(next); setDraft(null) }
  const contextLabel = (note: Row) => tab === 'archive' ? 'Arquivada' : tab === 'trash' ? 'Na lixeira' : note.fixado ? 'Fixada' : 'Nota'

  return <div className="mai-notes-v4">
    <header className="mai-notes-v4-head"><div><h1>Notas</h1><p>Ideias, referências e documentos em um só lugar.</p></div></header>

    <div className="mai-notes-v4-controls">
      <div className="mai-notes-v4-tabs" role="tablist" aria-label="Visualização das notas"><button data-active={tab === 'active'} onClick={() => changeTab('active')}>Notas</button><button data-active={tab === 'archive'} onClick={() => changeTab('archive')}>Arquivo</button><button data-active={tab === 'trash'} onClick={() => changeTab('trash')}>Lixeira</button></div>
      <label className="mai-notes-v4-search"><span className="material-symbols-rounded">search</span><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Buscar nas notas" />{query ? <button type="button" aria-label="Limpar busca" onClick={() => setQuery('')}><span className="material-symbols-rounded">close</span></button> : null}</label>
    </div>

    <div className="mai-v3-note-list mai-notes-v4-list" data-tab={tab}>
      {visible.map(note => {
        const attachments = rows(note.anexos).length
        return <article className="mai-notes-v4-row mai-item-row-v2" key={String(note.id)} draggable={tab === 'active'} onDragStart={event => event.dataTransfer.setData('text/note', String(note.id))} onDragOver={event => { if (tab === 'active') event.preventDefault() }} onDrop={event => { event.preventDefault(); reorder(event.dataTransfer.getData('text/note'), String(note.id)) }} onClick={() => setDraft({ ...note, anexos: rows(note.anexos) })}>
          <span className="mai-notes-v4-row-icon" aria-hidden="true"><span className="material-symbols-rounded">notes</span></span>
          <span className="mai-item-copy-v2 mai-notes-v4-row-copy">
            <span className="mai-item-titleline-v2"><strong>{note.titulo || 'Sem título'}</strong></span>
            <span className="mai-item-subline-v2 mai-notes-v4-row-context"><span>{contextLabel(note)}</span><span>·</span><span>{formatDate(note.data)}</span>{attachments ? <><span>·</span><span className="mai-notes-v4-attachment-context"><span className="material-symbols-rounded">attach_file</span>{attachments} {attachments === 1 ? 'anexo' : 'anexos'}</span></> : null}</span>
          </span>
          {tab !== 'trash' ? <button type="button" className="mai-notes-v4-row-action" title={note.fixado ? 'Desfixar' : 'Fixar'} aria-label={note.fixado ? 'Desfixar nota' : 'Fixar nota'} onClick={event => { event.stopPropagation(); quickAction(note, 'pin') }}><span className="material-symbols-rounded">{note.fixado ? 'keep_off' : 'keep'}</span></button> : null}
        </article>
      })}
    </div>

    {!visible.length ? <div className="mai-v3-empty-line mai-notes-v4-empty">{query ? 'Nenhuma nota encontrada.' : tab === 'active' ? 'Nenhuma nota criada.' : tab === 'archive' ? 'Nenhuma nota arquivada.' : 'A lixeira está vazia.'}</div> : null}

    {draft ? <div className="mai-v3-create-layer mai-notes-v4-layer" onMouseDown={() => setDraft(null)}><form className="mai-notes-v4-drawer" onSubmit={save} onMouseDown={event => event.stopPropagation()}>
      <header className="mai-notes-v4-drawer-head"><div><small>{draft.id ? formatDate(draft.data) : 'Nova nota'}</small><strong>{draft.id ? 'Editar nota' : 'Nova nota'}</strong></div><button type="button" aria-label="Fechar" onClick={() => setDraft(null)}><span className="material-symbols-rounded">close</span></button></header>
      <div className="mai-notes-v4-drawer-body">
        <div className="mai-notes-v4-note-options"><button type="button" data-active={draft.fixado === true} onClick={() => setDraft({ ...draft, fixado: !draft.fixado })}><span className="material-symbols-rounded">keep</span><span>{draft.fixado ? 'Fixada' : 'Fixar'}</span></button><label><span className="material-symbols-rounded">view_agenda</span><select value={draft.tamanho || 'normal'} onChange={event => setDraft({ ...draft, tamanho: event.target.value })}><option value="normal">Normal</option><option value="largo">Larga</option><option value="grande">Grande</option></select></label></div>
        <input className="mai-notes-v4-title" autoFocus value={draft.titulo || ''} onChange={event => setDraft({ ...draft, titulo: event.target.value })} placeholder="Título da nota" />
        <RichNoteEditor value={String(draft.conteudo || '')} onChange={value => setDraft({ ...draft, conteudo: value })} />
        <section className="mai-notes-v4-attachments"><header><div><strong>Anexos</strong><span>{rows(draft.anexos).length ? `${rows(draft.anexos).length} ${rows(draft.anexos).length === 1 ? 'arquivo' : 'arquivos'}` : 'Google Drive'}</span></div><label><span className="material-symbols-rounded">attach_file_add</span><span>{uploading ? 'Enviando…' : 'Adicionar'}</span><input hidden type="file" disabled={uploading} onChange={event => void upload(event.target.files?.[0])} /></label></header><div>{rows(draft.anexos).map((file, index) => <article key={`${file.idDrive || file.nome}-${index}`}><span className="material-symbols-rounded">description</span><a href={file.url || '#'} target="_blank" rel="noreferrer">{file.nome || 'Arquivo'}</a><button type="button" aria-label={`Remover ${file.nome || 'arquivo'}`} onClick={() => void removeAttachment(index)}><span className="material-symbols-rounded">close</span></button></article>)}</div></section>
      </div>
      <footer className="mai-notes-v4-drawer-footer"><div className="mai-notes-v4-danger-actions">{draft.id && tab === 'active' ? <button type="button" onClick={() => draftAction('archive')}><span className="material-symbols-rounded">archive</span>Arquivar</button> : null}{draft.id && tab === 'archive' ? <button type="button" onClick={() => draftAction('restore')}><span className="material-symbols-rounded">unarchive</span>Desarquivar</button> : null}{draft.id && tab !== 'trash' ? <button type="button" data-danger="true" onClick={() => draftAction('trash')}><span className="material-symbols-rounded">delete</span>Lixeira</button> : null}{draft.id && tab === 'trash' ? <><button type="button" onClick={() => draftAction('restore')}><span className="material-symbols-rounded">restore_from_trash</span>Restaurar</button><button type="button" data-danger="true" onClick={() => draftAction('delete')}><span className="material-symbols-rounded">delete_forever</span>Excluir</button></> : null}</div><div className="mai-notes-v4-save-actions"><button type="button" onClick={() => setDraft(null)}>Cancelar</button><button type="submit" data-primary="true">Salvar nota</button></div></footer>
    </form></div> : null}
  </div>
}
