'use client'

import { createPortal } from 'react-dom'
import styles from './UndoToast.module.css'

/** Aviso curto com "Desfazer" depois de concluir, excluir ou arquivar. */
export function UndoToast({ toast, onUndo, onClose }: { toast: { id: number; text: string } | null; onUndo: () => void; onClose: () => void }) {
  if (!toast) return null
  if (typeof document === 'undefined') return null
  return createPortal(
    <div key={toast.id} className={styles.toast} role="status" aria-live="polite">
      <span>{toast.text}</span>
      <button type="button" className={styles.undo} onClick={() => { onUndo(); onClose() }}>Desfazer</button>
      <button type="button" className={styles.close} aria-label="Fechar aviso" onClick={onClose}>×</button>
    </div>,
    document.body,
  )
}
