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
  IdCard,
  HardDrive,
  UserCog,
  Building2,
  CreditCard,
  FileCheck2,
  LogOut,
} from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { isDemoMode } from '@/lib/supabase'
import clsx from 'clsx'

const NATIONAL_ONLY_ITEMS: { to: string; label: string; icon: typeof GitBranch; end?: boolean }[] = [
  { to: '/applications', label: 'Application Pipeline', icon: GitBranch },
  { to: '/vetting', label: 'Vetting System', icon: ClipboardCheck },
  { to: '/posts', label: 'Posts Management', icon: Building2 },
  { to: '/users', label: 'User Management', icon: UserCog },
  { to: '/drive', label: 'NCC Drive', icon: HardDrive },
]

// Shared by post officers/commanders — everything a plain member sees,
// plus the full toolset for running a post.
const SHARED_ITEMS: { to: string; label: string; icon: typeof GitBranch; end?: boolean }[] = [
  { to: '/my-membership', label: 'My Membership', icon: CreditCard },
  { to: '/shared-files', label: 'Post Drive', icon: HardDrive },
  { to: '/post-officers', label: 'Post Officers', icon: Users },
  { to: '/post-members', label: 'Post Members', icon: IdCard },
  { to: '/congress', label: 'Veterans Congress', icon: Landmark },
  { to: '/founding-team', label: 'Founding Team', icon: Users },
  { to: '/checklist', label: 'Launch Checklist', icon: ListChecks },
  { to: '/meetings', label: 'Meetings', icon: CalendarCheck },
  { to: '/members', label: 'Membership Roster', icon: IdCard },
  { to: '/membership-review', label: 'Membership DD214 Review', icon: FileCheck2 },
  { to: '/toolkit', label: 'Post Toolkit', icon: FolderDown },
  { to: '/recruiting', label: 'Recruiting Engine', icon: Radar },
  { to: '/sponsors', label: 'Sponsorship CRM', icon: HandCoins },
  { to: '/health', label: 'Post Health', icon: HeartPulse },
  { to: '/build-a-post', label: 'Build A Post', icon: Hammer },
]

// A plain paying member — their card, their post's own drive drop, who
// their officers and fellow members are, and Veterans Congress.
const MEMBER_ITEMS: { to: string; label: string; icon: typeof GitBranch; end?: boolean }[] = [
  { to: '/my-membership', label: 'My Membership', icon: CreditCard },
  { to: '/shared-files', label: 'Post Drive', icon: HardDrive },
  { to: '/post-officers', label: 'Post Officers', icon: Users },
  { to: '/post-members', label: 'Post Members', icon: IdCard },
  { to: '/congress', label: 'Veterans Congress', icon: Landmark },
]

export function Sidebar() {
  const { profile, isNational, signOut } = useAuth()
  const isPlainMember = profile?.role === 'member'
  const isPostOfficer = profile?.role === 'post_commander' || profile?.role === 'post_officer'

  const navItems = [
    { to: '/', label: isPlainMember ? 'Home' : 'Global Dashboard', icon: LayoutGrid, end: true },
    ...(isNational ? NATIONAL_ONLY_ITEMS : []),
    // National always gets the full toolset too, on top of their own-only
    // items above — they manage every post's modules directly. A plain
    // member gets the small member set. A guest_applicant (not yet
    // verified/promoted) or any other unrecognized role gets neither —
    // an empty nav, matching the "Account Pending" screen they land on.
    ...(isPlainMember ? MEMBER_ITEMS : isPostOfficer || isNational ? SHARED_ITEMS : []).map((item) =>
      item.to === '/health' && !isNational && profile?.post_id
        ? { ...item, to: `/health/${profile.post_id}` }
        : item
    ),
    // Only Commanders approve their post's Officers, and only National
    // approves Commanders — a plain Officer never sees this, even though
    // they otherwise share the same toolset.
    ...(profile?.role === 'post_commander' || isNational ? [{ to: '/role-applications', label: 'Role Applications', icon: UserCog }] : []),
  ]

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
        {!isNational && profile?.post_id && (
          <div className="mt-2 inline-flex items-center gap-1.5 px-2 py-0.5 rounded-sm border border-hairline text-muted font-mono text-[10px] uppercase tracking-wide">
            Post Account
          </div>
        )}
      </div>

      <nav className="flex-1 overflow-y-auto py-4">
        {navItems.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={label}
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
