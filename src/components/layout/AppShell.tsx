import { useState, type ReactNode } from 'react'
import { Menu } from 'lucide-react'
import { Sidebar } from './Sidebar'
import { useAuth } from '@/context/AuthContext'
import { Link, useLocation } from 'react-router-dom'

export function AppShell({ children }: { children: ReactNode }) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const { profile,isNational } = useAuth()
  const { pathname } = useLocation()
  const personal = ['/my-membership','/member-home','/my-applications'].includes(pathname)
  const scope = personal ? 'Personal Workspace' : isNational ? 'National · All states and posts' : profile?.role === 'state_commander' ? `State Command · ${profile.state ?? 'Awaiting state assignment'}` : ['post_commander','post_officer'].includes(profile?.role ?? '') ? 'Post Staff · Assigned post' : 'Member Workspace'

  return (
    <div className="flex min-h-screen bg-base">
      <Sidebar isOpen={mobileNavOpen} onClose={() => setMobileNavOpen(false)} />

      <div className="flex-1 min-w-0 flex flex-col">
        {/* Only exists below the md breakpoint — on desktop the sidebar is
            always visible so there's nothing to toggle. */}
        <div className="md:hidden sticky top-0 z-20 flex items-center gap-3 px-4 py-3 bg-charcoal border-b border-hairline">
          <button onClick={() => setMobileNavOpen(true)} className="text-ink" aria-label="Open menu">
            <Menu size={22} />
          </button>
          <div className="font-display text-lg tracking-wide text-gold">CVOA</div>
        </div>

        <main className="flex-1 min-w-0">
          <div className="max-w-7xl mx-auto px-4 sm:px-8 py-6 sm:py-8">
            <div className="flex flex-wrap gap-3 items-center justify-between border-b border-hairline pb-3 mb-6 text-xs">
              <span className="text-muted">{scope}</span>
              {isNational && !personal && <Link className="text-gold" to="/state">States → Posts → Members</Link>}
            </div>
            {children}
          </div>
        </main>
      </div>
    </div>
  )
}

export function PageHeader({ title, eyebrow, action }: { title: string; eyebrow: string; action?: ReactNode }) {
  return (
    <div className="flex items-start justify-between mb-8">
      <div>
        <div className="eyebrow mb-1">{eyebrow}</div>
        <h1 className="font-display text-4xl tracking-wide text-ink">{title}</h1>
      </div>
      {action}
    </div>
  )
}
