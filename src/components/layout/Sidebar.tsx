import { NavLink } from 'react-router-dom'
import {
  LayoutGrid,
  GitBranch,
  ClipboardCheck,
  Users,
  ListChecks,
  CalendarCheck,
  FolderDown,
  Radar,
  HandCoins,
  Landmark,
  HeartPulse,
  Hammer,
  LogOut,
} from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { isDemoMode } from '@/lib/supabase'
import clsx from 'clsx'

const NAV_ITEMS = [
  { to: '/', label: 'Global Dashboard', icon: LayoutGrid, end: true },
  { to: '/applications', label: 'Application Pipeline', icon: GitBranch },
  { to: '/vetting', label: 'Vetting System', icon: ClipboardCheck },
  { to: '/founding-team', label: 'Founding Team', icon: Users },
  { to: '/checklist', label: 'Launch Checklist', icon: ListChecks },
  { to: '/meetings', label: 'Meetings', icon: CalendarCheck },
  { to: '/toolkit', label: 'Post Toolkit', icon: FolderDown },
  { to: '/recruiting', label: 'Recruiting Engine', icon: Radar },
  { to: '/sponsors', label: 'Sponsorship CRM', icon: HandCoins },
  { to: '/congress', label: 'Veterans Congress', icon: Landmark },
  { to: '/health', label: 'Post Health', icon: HeartPulse },
  { to: '/build-a-post', label: 'Build A Post', icon: Hammer },
]

export function Sidebar() {
  const { profile, signOut } = useAuth()

  return (
    <aside className="w-64 shrink-0 bg-charcoal border-r border-hairline flex flex-col h-screen sticky top-0">
      <div className="px-5 py-6 border-b border-hairline">
        <div className="font-display text-2xl tracking-wide text-gold leading-none">CVOA</div>
        <div className="eyebrow mt-1">Post Operating System</div>
        {isDemoMode && (
          <div className="mt-2 inline-flex items-center gap-1.5 px-2 py-0.5 rounded-sm border border-status-developing/40 bg-status-developing/10 text-status-developing font-mono text-[10px] uppercase tracking-wide">
            Demo Mode — local data
          </div>
        )}
      </div>

      <nav className="flex-1 overflow-y-auto py-4">
        {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              clsx(
                'flex items-center gap-3 px-5 py-2.5 text-sm transition-colors border-l-2',
                isActive
                  ? 'border-gold text-gold bg-surface'
                  : 'border-transparent text-muted hover:text-ink hover:bg-surface/60'
              )
            }
          >
            <Icon size={16} strokeWidth={1.75} />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="px-5 py-4 border-t border-hairline">
        <div className="text-sm text-ink truncate">{profile?.full_name ?? 'Guest'}</div>
        <div className="eyebrow mb-3">{profile?.role?.replaceAll('_', ' ') ?? 'unauthenticated'}</div>
        <button
          onClick={signOut}
          className="flex items-center gap-2 text-xs text-muted hover:text-gold transition-colors"
        >
          <LogOut size={14} /> Sign out
        </button>
      </div>
    </aside>
  )
}
