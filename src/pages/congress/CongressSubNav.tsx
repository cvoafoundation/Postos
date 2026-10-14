import { NavLink } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import clsx from 'clsx'

const TABS = [
  { to: '/congress', label: 'Dashboard', end: true },
  { to: '/congress/committees', label: 'Committees' },
  { to: '/congress/delegates', label: 'Delegates' },
  { to: '/congress/legislative', label: 'Legislative Tracker' },
  { to: '/congress/calendar', label: 'Calendar' },
]

export function CongressSubNav() {
  const { membershipOnly } = useAuth()
  const tabs = membershipOnly ? TABS.filter(tab => ['/congress', '/congress/delegates'].includes(tab.to)) : TABS
  return (
    <div className="flex gap-1 border-b border-hairline mb-6 -mt-2">
      {tabs.map((tab) => (
        <NavLink
          key={tab.to}
          to={tab.to}
          end={tab.end}
          className={({ isActive }) =>
            clsx(
              'px-3 py-2 text-xs font-mono uppercase tracking-wide border-b-2 -mb-px transition-colors',
              isActive ? 'border-gold text-gold' : 'border-transparent text-muted hover:text-ink'
            )
          }
        >
          {tab.label}
        </NavLink>
      ))}
    </div>
  )
}
