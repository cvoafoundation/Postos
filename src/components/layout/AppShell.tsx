import { pageGuidance } from '@/lib/pageGuidance'
import { useState, type ReactNode } from 'react'
import ProfileAvatar from '@/components/account/ProfileAvatar'
import { Menu, Settings } from 'lucide-react'
import { Sidebar } from './Sidebar'
import { useAuth } from '@/context/AuthContext'
import { Link, useLocation } from 'react-router-dom'

export function AppShell({ children }: { children: ReactNode }) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const { profile,isNational } = useAuth()
  const { pathname } = useLocation()
  const personal = ['/settings','/my-membership','/member-home','/my-applications','/membership-verification'].includes(pathname)
  const scope = personal ? 'Personal Workspace' : isNational ? 'National Command · All battalions and companies' : profile?.role === 'state_commander' ? `Battalion Command · ${profile.state ?? 'Awaiting state assignment'}` : ['post_commander','post_officer'].includes(profile?.role ?? '') ? 'Company Staff · Assigned company' : profile?.role === 'delegate' ? `Congress Delegate · ${profile.state ?? 'Assigned company'} voting jurisdiction` : 'Member Workspace'

  return (
    <div className="flex min-h-screen bg-base">
      <a href="#main-content" className="skip-navigation">Skip to page content</a>
      <Sidebar isOpen={mobileNavOpen} onClose={() => setMobileNavOpen(false)} />

      <div className="flex-1 min-w-0 flex flex-col">
        {/* Only exists below the md breakpoint — on desktop the sidebar is
            always visible so there's nothing to toggle. */}
        <div className="md:hidden sticky top-0 z-20 flex items-center gap-3 px-4 py-3 bg-charcoal border-b border-hairline">
          <button onClick={() => setMobileNavOpen(true)} className="text-ink" aria-label="Open menu">
            <Menu size={22} />
          </button>
          <div className="font-display text-lg tracking-wide text-gold">CVOA</div>
          <Link to="/settings" aria-label="Open settings" className="ml-auto flex items-center gap-2 min-h-[44px] text-sm text-gold"><ProfileAvatar className="h-7 w-7 text-xs"/><Settings size={18}/><span>Settings</span></Link>
        </div>

        <main id="main-content" tabIndex={-1} className="workspace-main flex-1 min-w-0 focus:outline-none">
          <div className="max-w-7xl mx-auto px-4 sm:px-8 py-6 sm:py-8">
            <div className="flex flex-wrap gap-3 items-center justify-between border-b border-hairline pb-3 mb-6 text-xs">
              <span className="text-muted">{scope}</span>
              {isNational && !personal && <Link className="text-gold" to="/state">Battalions → Companies → Members</Link>}
            </div>
            {children}
          </div>
        </main>
      </div>
    </div>
  )
}

export function PageHeader({ title, eyebrow, action, description }: { title: string; eyebrow: string; action?: ReactNode; description?: string }) {
  const { pathname } = useLocation()
  const guidance = description ?? pageGuidance(pathname)
  return (
    <header className="page-header">
      <div className="min-w-0 flex-1">
        <div className="eyebrow mb-2">{eyebrow}</div>
        <h1 className="font-display text-3xl sm:text-4xl tracking-wide text-ink break-words leading-tight">{title}</h1>
        {guidance && <p className="text-sm text-muted leading-relaxed mt-3 max-w-2xl">{guidance}</p>}
      </div>
      {action && <div className="page-actions">{action}</div>}
    </header>
  )
}
