import type { ReactNode } from 'react'

export function StatCard({
  label,
  value,
  accent,
  icon,
}: {
  label: string
  value: string | number
  accent?: 'gold' | 'active' | 'developing' | 'attention'
  icon?: ReactNode
}) {
  const accentClass =
    accent === 'active'
      ? 'text-status-active'
      : accent === 'developing'
      ? 'text-status-developing'
      : accent === 'attention'
      ? 'text-status-attention'
      : 'text-gold'

  return (
    <div className="panel p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="eyebrow">{label}</div>
        {icon && <div className={accentClass}>{icon}</div>}
      </div>
      <div className={`stat-number ${accentClass}`}>{value}</div>
    </div>
  )
}
