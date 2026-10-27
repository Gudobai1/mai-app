'use client'

import { useState } from 'react'
import { Button, Card, Check, DsRoot, Icon, IconButton, IconTile, List, ListItem, ProgressBar, SectionHeader, Tag } from '../ds'
import type { Tone } from '../ds'
import styles from './preview.module.css'

const colorTokens: Array<{ name: string; token: string }> = [
  { name: 'Fundo', token: '--ds-bg' },
  { name: 'Superfície', token: '--ds-surface' },
  { name: 'Texto', token: '--ds-text' },
  { name: 'Texto suave', token: '--ds-muted' },
  { name: 'Linha', token: '--ds-line' },
  { name: 'Destaque', token: '--ds-accent' },
  { name: 'Destaque suave', token: '--ds-accent-soft' },
  { name: 'Bloco invertido', token: '--ds-inverse-bg' },
]

const tones: Array<{ tone: Tone; name: string; use: string }> = [
  { tone: 'mint', name: 'Menta', use: 'Saúde, treino, concluído' },
  { tone: 'sky', name: 'Céu', use: 'Finanças, agenda' },
  { tone: 'peach', name: 'Pêssego', use: 'Casa, leitura' },
  { tone: 'lilac', name: 'Lilás', use: 'Mente, metas' },
  { tone: 'rose', name: 'Rosa', use: 'Atrasado, alerta' },
]

const typeScale: Array<{ label: string; size: string; weight: number; sample: string }> = [
  { label: 'Título grande · 34', size: 'var(--ds-fs-3xl)', weight: 800, sample: 'Hoje' },
  { label: 'Título · 28', size: 'var(--ds-fs-2xl)', weight: 800, sample: 'Boa tarde, G' },
  { label: 'Destaque · 22', size: 'var(--ds-fs-xl)', weight: 800, sample: 'Academia' },
  { label: 'Seção · 17', size: 'var(--ds-fs-lg)', weight: 800, sample: 'Rotinas' },
  { label: 'Corpo · 15', size: 'var(--ds-fs-md)', weight: 600, sample: 'Revisar orçamento de novembro' },
  { label: 'Apoio · 13', size: 'var(--ds-fs-sm)', weight: 500, sample: 'Terça, 27 de outubro' },
  { label: 'Etiqueta · 11', size: 'var(--ds-fs-xs)', weight: 700, sample: 'FINANÇAS' },
]

const habits: Array<{ name: string; value: string; icon: string; tone: Tone; done: boolean }> = [
  { name: 'Meditar', value: 'Feito', icon: 'self_improvement', tone: 'lilac', done: true },
  { name: 'Água', value: '5 de 8', icon: 'water_drop', tone: 'sky', done: false },
  { name: 'Ler', value: '0 de 20', icon: 'menu_book', tone: 'peach', done: false },
  { name: 'Treino', value: '18:30', icon: 'fitness_center', tone: 'mint', done: false },
]

const initialTasks = [
  { id: 't1', title: 'Renovar seguro do carro', project: 'Casa', tone: 'peach' as Tone, when: 'Ontem', late: true, done: false },
  { id: 't2', title: 'Revisar orçamento de novembro', project: 'Finanças', tone: 'sky' as Tone, when: '1 de 3 etapas', late: false, done: false },
  { id: 't3', title: 'Ligar para o dentista', project: 'Casa', tone: 'peach' as Tone, when: 'Hoje', late: false, done: true },
]

export function DesignSystemPreview() {
  const [theme, setTheme] = useState<'light' | 'dark'>('light')
  const [tasks, setTasks] = useState(initialTasks)

  const toggleTask = (id: string, done: boolean) => setTasks(current => current.map(task => (task.id === id ? { ...task, done } : task)))

  return (
    <DsRoot theme={theme} className={styles.page}>
      <div className={styles.inner}>
        <header className={styles.top}>
          <div>
            <div className={styles.eyebrow}>MAI · visual Moderno</div>
            <h1 className={styles.title}>Design system</h1>
          </div>
          <div className={styles.segmented} role="radiogroup" aria-label="Tema da prévia">
            <button type="button" role="radio" aria-checked={theme === 'light'} className={`${styles.segment} ${theme === 'light' ? styles.segmentOn : ''}`} onClick={() => setTheme('light')}>
              <Icon name="light_mode" size={18} /> Claro
            </button>
            <button type="button" role="radio" aria-checked={theme === 'dark'} className={`${styles.segment} ${theme === 'dark' ? styles.segmentOn : ''}`} onClick={() => setTheme('dark')}>
              <Icon name="dark_mode" size={18} /> Escuro
            </button>
          </div>
        </header>

        <section className={styles.block}>
          <h2>Cores</h2>
          <p className={styles.blockNote}>Base neutra fria, um destaque azul-violeta e cinco tons por categoria. Tudo muda sozinho no tema escuro.</p>
          <div className={styles.swatches}>
            {colorTokens.map(color => (
              <div key={color.token} className={styles.swatch}>
                <div className={styles.swatchColor} style={{ background: `var(${color.token})` }} />
                <div className={styles.swatchMeta}><strong>{color.name}</strong><code>{color.token}</code></div>
              </div>
            ))}
          </div>
          <div className={styles.row} style={{ marginTop: 16 }}>
            {tones.map(item => (
              <Tag key={item.tone} tone={item.tone}>{item.name} · {item.use}</Tag>
            ))}
          </div>
        </section>

        <section className={styles.block}>
          <h2>Tipografia</h2>
          <p className={styles.blockNote}>Plus Jakarta Sans, com títulos em peso forte e espaçamento levemente fechado.</p>
          <Card padding="md">
            {typeScale.map(item => (
              <div key={item.label} className={styles.typeRow}>
                <span className={styles.typeLabel}>{item.label}</span>
                <span style={{ fontSize: item.size, fontWeight: item.weight, letterSpacing: item.weight >= 800 ? '-0.02em' : undefined }}>{item.sample}</span>
              </div>
            ))}
          </Card>
        </section>

        <section className={styles.block}>
          <h2>Botões</h2>
          <div className={styles.row}>
            <Button icon="add">Novo</Button>
            <Button variant="secondary">Cancelar</Button>
            <Button variant="ghost">Ver todas</Button>
            <Button variant="danger" icon="delete">Excluir</Button>
            <Button size="sm" pill>Pequeno</Button>
            <Button size="lg">Grande</Button>
            <Button disabled>Desativado</Button>
          </div>
          <div className={styles.row} style={{ marginTop: 12 }}>
            <IconButton icon="notifications" label="Notificações" badge />
            <IconButton icon="search" label="Buscar" filled={false} />
            <IconButton icon="add" label="Adicionar" variant="primary" size={52} />
            <IconButton icon="more_horiz" label="Mais opções" variant="ghost" />
          </div>
        </section>

        <section className={styles.block}>
          <SectionHeader title="Rotinas" meta="1 de 4" />
          <div className={styles.tiles}>
            {habits.map(habit => (
              <div key={habit.name} className={styles.tileCard}>
                <IconTile icon={habit.icon} tone={habit.tone} solid={habit.done} />
                <span className={styles.tileName}>{habit.name}</span>
                <span className={styles.tileValue}>{habit.value}</span>
              </div>
            ))}
          </div>
        </section>

        <div className={styles.grid2}>
          <section className={styles.block}>
            <SectionHeader title="Tarefas" action="Ver todas" />
            <List>
              {tasks.map(task => (
                <ListItem
                  key={task.id}
                  leading={<Check checked={task.done} late={task.late} label={`Concluir: ${task.title}`} onCheckedChange={done => toggleTask(task.id, done)} />}
                  title={task.title}
                  done={task.done}
                  subtitle={<><Tag tone={task.tone}>{task.project}</Tag><span style={task.late && !task.done ? { color: 'var(--ds-danger)', fontWeight: 700 } : undefined}>{task.when}</span></>}
                />
              ))}
            </List>
          </section>

          <section className={styles.block}>
            <SectionHeader title="Cartões" />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <Card variant="accent" padding="md">
                <div className={styles.nextHead}>
                  <span className={styles.nextIcon}><Icon name="fitness_center" /></span>
                  <span>A seguir · em 21 min</span>
                </div>
                <div className={styles.nextBody}>
                  <div style={{ flex: 1 }}>
                    <div className={styles.nextTitle}>Academia</div>
                    <div className={styles.nextSub}>18:30 · <Icon name="local_fire_department" size={16} /> 6 dias seguidos</div>
                  </div>
                  <Button variant="onAccent" pill>Feito</Button>
                </div>
              </Card>
              <Card variant="inverse" padding="md">
                <div className={styles.balanceLabel}><span>Saldo de outubro</span><Icon name="account_balance_wallet" /></div>
                <div className={styles.balanceValue}>R$ 1.815</div>
                <div className={styles.balanceNote}>71% do orçamento usado</div>
                <div className={styles.bars} aria-hidden="true">
                  {[38, 52, 30, 64, 46, 72, 40].map((height, index) => (
                    <span key={index} className={`${styles.bar} ${index === 5 ? styles.barOn : ''}`} style={{ height }} />
                  ))}
                </div>
              </Card>
            </div>
          </section>
        </div>

        <section className={styles.block}>
          <SectionHeader title="Progresso" />
          <Card padding="md">
            <div className={styles.progressStack}>
              <div><div className={styles.progressLabel}><span>Orçamento de outubro</span><span>71%</span></div><ProgressBar value={71} label="Orçamento de outubro" /></div>
              <div><div className={styles.progressLabel}><span>Reserva de emergência</span><span>62%</span></div><ProgressBar value={62} tone="sky" label="Reserva de emergência" /></div>
              <div><div className={styles.progressLabel}><span>Água</span><span>5 de 8</span></div><ProgressBar value={62.5} tone="mint" label="Água" /></div>
            </div>
          </Card>
        </section>
      </div>
    </DsRoot>
  )
}
