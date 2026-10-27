import type { ButtonHTMLAttributes, CSSProperties, HTMLAttributes, ReactNode } from 'react'
import styles from './ui.module.css'

/**
 * MAI — design system: componentes base do visual "Moderno".
 *
 * Todos os componentes leem apenas os tokens --ds-* de ./tokens.css, então
 * funcionam no tema claro e no escuro sem nenhuma configuração extra.
 */

export type Tone = 'accent' | 'mint' | 'sky' | 'peach' | 'lilac' | 'rose' | 'neutral'

const cx = (...names: Array<string | false | null | undefined>) => names.filter(Boolean).join(' ')

const toneClass: Record<Tone, string> = {
  accent: styles.toneAccent,
  mint: styles.toneMint,
  sky: styles.toneSky,
  peach: styles.tonePeach,
  lilac: styles.toneLilac,
  rose: styles.toneRose,
  neutral: styles.toneNeutral,
}

const solidClass: Record<Tone, string> = {
  accent: styles.solidAccent,
  mint: styles.solidMint,
  sky: styles.solidSky,
  peach: styles.solidPeach,
  lilac: styles.solidLilac,
  rose: styles.solidRose,
  neutral: styles.solidNeutral,
}

/* ------------------------------------------------------------------ Ícone */

export type IconProps = {
  name: string
  size?: number
  filled?: boolean
  weight?: 400 | 500 | 600
  className?: string
  style?: CSSProperties
}

export function Icon({ name, size = 22, filled = true, weight = 400, className, style }: IconProps) {
  return (
    <span
      aria-hidden="true"
      className={cx(styles.icon, className)}
      style={{
        fontSize: size,
        width: size,
        height: size,
        fontVariationSettings: `'FILL' ${filled ? 1 : 0}, 'wght' ${weight}, 'GRAD' 0, 'opsz' ${size <= 20 ? 20 : 24}`,
        ...style,
      }}
    >
      {name}
    </span>
  )
}

/* ------------------------------------------------------------------ Cartão */

export type CardProps = HTMLAttributes<HTMLElement> & {
  variant?: 'default' | 'accent' | 'inverse' | 'subtle'
  padding?: 'none' | 'md' | 'lg'
  as?: 'section' | 'div' | 'article'
}

export function Card({ variant = 'default', padding = 'md', as = 'section', className, children, ...rest }: CardProps) {
  const Tag = as
  return (
    <Tag
      className={cx(
        styles.card,
        variant === 'accent' && styles.cardAccent,
        variant === 'inverse' && styles.cardInverse,
        variant === 'subtle' && styles.cardSubtle,
        padding === 'none' ? styles.cardPadNone : padding === 'lg' ? styles.cardPadLg : styles.cardPadMd,
        className,
      )}
      {...rest}
    >
      {children}
    </Tag>
  )
}

/* ------------------------------------------------------------------ Botões */

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'onAccent' | 'danger'
  size?: 'sm' | 'md' | 'lg'
  icon?: string
  pill?: boolean
  block?: boolean
}

export function Button({ variant = 'primary', size = 'md', icon, pill, block, className, children, type = 'button', ...rest }: ButtonProps) {
  return (
    <button
      type={type}
      className={cx(
        styles.button,
        styles[variant],
        size === 'sm' ? styles.sizeSm : size === 'lg' ? styles.sizeLg : styles.sizeMd,
        pill && styles.pill,
        block && styles.block,
        className,
      )}
      {...rest}
    >
      {icon ? <Icon name={icon} size={size === 'sm' ? 18 : 20} /> : null}
      {children}
    </button>
  )
}

export type IconButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> & {
  icon: string
  label: string
  variant?: 'surface' | 'primary' | 'ghost'
  size?: number
  badge?: boolean
  filled?: boolean
}

export function IconButton({ icon, label, variant = 'surface', size = 44, badge, filled = true, className, style, type = 'button', ...rest }: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={cx(
        styles.iconButton,
        variant === 'primary' ? styles.iconButtonPrimary : variant === 'ghost' ? styles.iconButtonGhost : styles.iconButtonSurface,
        className,
      )}
      style={{ width: size, height: size, ...style }}
      {...rest}
    >
      <Icon name={icon} size={Math.round(size * 0.52)} filled={filled} />
      {badge ? <span className={styles.badgeDot} /> : null}
    </button>
  )
}

/* ------------------------------------------------------- Ícone em quadrado */

export type IconTileProps = {
  icon: string
  tone?: Tone
  solid?: boolean
  size?: number
  radius?: number
  className?: string
}

export function IconTile({ icon, tone = 'accent', solid = false, size = 40, radius, className }: IconTileProps) {
  return (
    <span
      aria-hidden="true"
      className={cx(styles.tile, solid ? solidClass[tone] : toneClass[tone], className)}
      style={{ width: size, height: size, borderRadius: radius ?? Math.round(size * 0.34) }}
    >
      <Icon name={icon} size={Math.round(size * 0.52)} />
    </span>
  )
}

/* ---------------------------------------------------------------- Etiqueta */

export function Tag({ tone = 'neutral', icon, children, className }: { tone?: Tone; icon?: string; children: ReactNode; className?: string }) {
  return (
    <span className={cx(styles.tag, toneClass[tone], className)}>
      {icon ? <Icon name={icon} size={14} /> : null}
      {children}
    </span>
  )
}

/* -------------------------------------------------------- Caixa de seleção */

export type CheckProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onChange' | 'children'> & {
  checked: boolean
  onCheckedChange?: (checked: boolean) => void
  late?: boolean
  label: string
}

export function Check({ checked, onCheckedChange, late, label, className, type = 'button', ...rest }: CheckProps) {
  return (
    <button
      type={type}
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      className={cx(styles.check, late && !checked && styles.checkLate, checked && styles.checkOn, className)}
      onClick={() => onCheckedChange?.(!checked)}
      {...rest}
    >
      <Icon name="check" size={18} weight={600} />
    </button>
  )
}

/* ---------------------------------------------------------- Lista agrupada */

export function List({ children, className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div role="list" className={cx(styles.list, className)} {...rest}>
      {children}
    </div>
  )
}

export type ListItemProps = {
  leading?: ReactNode
  title: ReactNode
  subtitle?: ReactNode
  trailing?: ReactNode
  done?: boolean
  onOpen?: () => void
  className?: string
}

export function ListItem({ leading, title, subtitle, trailing, done, onOpen, className }: ListItemProps) {
  const body = (
    <>
      <div className={styles.listItemTitle + (done ? ' ' + styles.listItemTitleDone : '')}>{title}</div>
      {subtitle ? <div className={styles.listItemSub}>{subtitle}</div> : null}
    </>
  )
  return (
    <div role="listitem" className={cx(styles.listItem, className)}>
      {leading}
      {onOpen ? (
        <button type="button" className={cx(styles.listItemBody, styles.listItemButton)} onClick={onOpen}>{body}</button>
      ) : (
        <div className={styles.listItemBody}>{body}</div>
      )}
      {trailing ? <div className={styles.listItemTrailing}>{trailing}</div> : null}
    </div>
  )
}

/* ------------------------------------------------------ Cabeçalho de seção */

export function SectionHeader({ title, action, onAction, meta, as = 'h2' }: { title: ReactNode; action?: string; onAction?: () => void; meta?: ReactNode; as?: 'h2' | 'h3' }) {
  const Heading = as
  return (
    <div className={styles.sectionHeader}>
      <Heading className={styles.sectionTitle}>{title}</Heading>
      {action ? (
        <button type="button" className={styles.sectionAction} onClick={onAction}>{action}</button>
      ) : meta ? (
        <span className={styles.sectionMeta}>{meta}</span>
      ) : null}
    </div>
  )
}

/* -------------------------------------------------------------- Progresso */

const progressTone: Partial<Record<Tone, string>> = {
  mint: styles.progressMint,
  sky: styles.progressSky,
  peach: styles.progressPeach,
  lilac: styles.progressLilac,
  rose: styles.progressRose,
}

export function ProgressBar({ value, tone = 'accent', label, height = 8 }: { value: number; tone?: Tone; label: string; height?: number }) {
  const pct = Math.max(0, Math.min(100, Math.round(value)))
  return (
    <div
      className={styles.progress}
      style={{ height }}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
    >
      <div className={cx(styles.progressFill, progressTone[tone])} style={{ width: `${pct}%` }} />
    </div>
  )
}

/* ------------------------------------------------------------ Raiz do DS */

/** Aplica a fonte e a cor de texto do design system a um trecho da página. */
export function DsRoot({ children, className, theme, ...rest }: HTMLAttributes<HTMLDivElement> & { theme?: 'light' | 'dark' }) {
  return (
    <div className={cx(styles.root, theme === 'dark' && 'ds-theme-dark', theme === 'light' && 'ds-theme-light', className)} {...rest}>
      {children}
    </div>
  )
}
