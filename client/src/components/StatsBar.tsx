interface StatItem {
  label: string
  value: number | string
}

interface Props {
  stats: StatItem[]
  className?: string
}

export default function StatsBar({ stats, className }: Props) {
  return (
    <div className={`stats-bar${className ? ' ' + className : ''}`}>
      {stats.map(stat => (
        <div key={stat.label} className="stat-card">
          <span className="stat-value">{stat.value}</span>
          <span className="stat-label">{stat.label}</span>
        </div>
      ))}
    </div>
  )
}
