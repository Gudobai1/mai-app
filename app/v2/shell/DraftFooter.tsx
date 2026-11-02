'use client'

import styles from './DraftFooter.module.css'

type Props = {
  dirty: boolean
  /** Desabilita Salvar (ex.: sem título). */
  canSave?: boolean
  saving?: boolean
  saveLabel?: string
  onSave: () => void
  onCancel: () => void
  onDelete?: () => void
  deleteLabel?: string
  status?: string
  className?: string
}

/** Status + Cancelar + Salvar (para rodapés que já têm ações próprias). */
export function DraftButtons({ dirty, canSave = true, saving, saveLabel = 'Salvar', onSave, onCancel, status }: Pick<Props, 'dirty' | 'canSave' | 'saving' | 'saveLabel' | 'onSave' | 'onCancel' | 'status'>) {
  return (
    <>
      <span className={styles.status} data-dirty={dirty || undefined}>{dirty ? 'Alterações não salvas' : status || ''}</span>
      <button type="button" className={styles.cancel} onClick={onCancel} disabled={saving}>Cancelar</button>
      <button type="button" className={styles.save} onClick={onSave} disabled={!dirty || !canSave || saving}>{saving ? 'Salvando…' : saveLabel}</button>
    </>
  )
}

/** Rodapé padrão dos editores: Excluir à esquerda; Cancelar e Salvar à direita. */
export function DraftFooter({ dirty, canSave = true, saving, saveLabel = 'Salvar', onSave, onCancel, onDelete, deleteLabel = 'Excluir', status, className = '' }: Props) {
  return (
    <footer className={`${styles.footer} ${className}`.trim()}>
      {onDelete ? <button type="button" className={styles.delete} onClick={onDelete} disabled={saving}>{deleteLabel}</button> : null}
      <DraftButtons dirty={dirty} canSave={canSave} saving={saving} saveLabel={saveLabel} onSave={onSave} onCancel={onCancel} status={status} />
    </footer>
  )
}
