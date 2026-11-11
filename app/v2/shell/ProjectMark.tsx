import styles from './ModernShell.module.css'

type Row = Record<string, any>

/** Marca do projeto (única): só uma bolinha na cor do projeto, sem ícone, imagem nem letra. Usada na barra lateral e no menu do celular. */
export function ProjectMark({ project }: { project: Row }) {
  return (
    <span className={styles.projectDotBox} aria-hidden="true">
      <i className={styles.projectDot} style={{ background: String(project.cor || '') || 'var(--ds-muted)' }} />
    </span>
  )
}
