'use client'

import { Icon } from '../../ds'
import { driveAssetUrl } from '../DriveAsset'
import styles from './ModernShell.module.css'

type Row = Record<string, any>

/** Marca do projeto (único): a imagem do projeto, ou o ícone dele na cor do projeto. Nunca a letra. Usada na barra lateral e no menu do celular. */
export function ProjectMark({ project }: { project: Row }) {
  const image = driveAssetUrl(project.imagem_url)
  if (image) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img className={styles.projectPhoto} src={image} alt="" loading="lazy" />
  }
  return (
    <span className={styles.projectIcon} style={{ color: String(project.cor || '') || 'var(--ds-muted)' }} aria-hidden="true">
      <Icon name={String(project.icone || 'folder')} size={18} filled={false} />
    </span>
  )
}
