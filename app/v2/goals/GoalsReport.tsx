'use client'

import { goalColor, goalDue, goalDueInfo, goalPct, goalReport, type GoalCategory } from '../../../lib/v2/goals'
import styles from './GoalsReport.module.css'

type Row = Record<string, any>

/**
 * Relatório das metas — escolhido em Ajustes › Visualização › Relatório.
 * Só números e linhas (sem gráficos pesados): situação geral, por categoria, por mês de prazo e metas em risco.
 */
export function GoalsReport({ goals, categories, today, onOpen }: { goals: Row[]; categories: GoalCategory[]; today: string; onOpen: (goal: Row) => void }) {
  const report = goalReport(goals, categories, today)
  if (!report.total) return <div className={styles.page}><div className={styles.empty}>Crie metas para ver o relatório.</div></div>
  const stats: { label: string; value: string; tone?: string }[] = [
    { label: 'Metas', value: String(report.total) },
    { label: 'Em andamento', value: String(report.active) },
    { label: 'Concluídas', value: String(report.done), tone: 'good' },
    { label: 'Atrasadas', value: String(report.late), tone: report.late ? 'bad' : undefined },
    { label: 'Progresso médio', value: `${report.avgPct}%` },
  ]
  const maxMonth = Math.max(1, ...report.byMonth.map(month => month.total))
  return (
    <div className={styles.page}>
      <div className={styles.stats}>
        {stats.map(stat => (
          <div key={stat.label} className={styles.stat} data-tone={stat.tone}>
            <span className={styles.statValue}>{stat.value}</span>
            <span className={styles.statLabel}>{stat.label}</span>
          </div>
        ))}
      </div>

      <section className={styles.block} aria-label="Por categoria">
        <div className={styles.head}><span className={styles.headTitle}>Por categoria</span></div>
        {report.byCategory.map(category => (
          <div key={category.id || 'none'} className={styles.row}>
            <span className={styles.rowTitle}>{category.nome}</span>
            <span className={styles.rowSub}>{category.done} de {category.total} concluída{category.total === 1 ? '' : 's'}</span>
            <span className={styles.rowValue}>{category.avgPct}%</span>
          </div>
        ))}
      </section>

      {report.byMonth.length ? (
        <section className={styles.block} aria-label="Prazos por mês">
          <div className={styles.head}><span className={styles.headTitle}>Prazos por mês</span></div>
          {report.byMonth.map(month => (
            <div key={month.key} className={styles.row}>
              <span className={styles.rowTitle}>{month.label}</span>
              <span className={styles.rowSub}>{month.done} de {month.total} concluída{month.total === 1 ? '' : 's'}</span>
              <span className={styles.rowValue}>
                <span className={styles.monthBar} aria-hidden="true"><i style={{ width: `${(month.total / maxMonth) * 100}%` }} /></span>
                {month.total}
              </span>
            </div>
          ))}
        </section>
      ) : null}

      <section className={styles.block} aria-label="Em risco">
        <div className={styles.head}><span className={styles.headTitle}>Em risco</span><span className={styles.headCount}>{report.atRisk.length}</span></div>
        {report.atRisk.length ? report.atRisk.map(goal => {
          const info = goalDueInfo(goalDue(goal), today)
          return (
            <button key={String(goal.id)} type="button" className={styles.riskRow} onClick={() => onOpen(goal)}>
              <span className={styles.dot} style={{ background: goalColor(goal) }} />
              <span className={styles.rowTitle}>{String(goal.titulo || 'Meta')}</span>
              <span className={styles.rowSub} data-tone={info.tone}>{info.label}</span>
              <span className={styles.rowValue}>{goalPct(goal)}%</span>
            </button>
          )
        }) : <div className={styles.empty}>Nenhuma meta com prazo nos próximos 14 dias e menos de 80% de progresso.</div>}
      </section>
    </div>
  )
}
