import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { PageHeader } from '@/components/layout/AppShell'
import { EmptyState } from '@/components/ui/EmptyState'
import { useAuth } from '@/context/AuthContext'
import { supabase } from '@/lib/supabase'
import type { BuildAPostModule, Post, PostFacilityProject } from '@/lib/types'

export default function BuildAPost() {
  const navigate = useNavigate()
  const { profile, isNational } = useAuth()
  const [modules, setModules] = useState<BuildAPostModule[]>([])
  const [posts, setPosts] = useState<Post[]>([])
  const [selectedPostId, setSelectedPostId] = useState<string | null>(null)
  const [projects, setProjects] = useState<PostFacilityProject[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.from('build_a_post_modules').select('*').order('name').then(({ data }: any) => {
      setModules((data ?? []) as BuildAPostModule[])
      setLoading(false)
    })
    if (isNational) {
      supabase.from('posts').select('*').then(({ data }: any) => setPosts((data ?? []) as Post[]))
    } else if (profile?.post_id) {
      setSelectedPostId(profile.post_id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isNational, profile?.post_id])

  useEffect(() => {
    if (!selectedPostId) {
      setProjects([])
      return
    }
    supabase.from('post_facility_projects').select('*').eq('post_id', selectedPostId).then(({ data }: any) => {
      setProjects((data ?? []) as PostFacilityProject[])
    })
  }, [selectedPostId])

  function projectFor(moduleId: string) {
    return projects.find((p) => p.module_id === moduleId)
  }

  return (
    <div>
      <PageHeader
        eyebrow="Module 10 — The Playbook"
        title="Build A Post"
        action={
          isNational && posts.length > 0 ? (
            <select
              className="input-field w-64"
              value={selectedPostId ?? ''}
              onChange={(e) => setSelectedPostId(e.target.value || null)}
            >
              <option value="">View content only (no post selected)</option>
              {posts.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          ) : undefined
        }
      />

      <p className="text-sm text-muted mb-6 max-w-2xl">
        Explore what it takes to build out each part of a post — cost estimates, equipment,
        sponsor and grant angles, and revenue potential. Select a post above to start tracking a
        real project: a checklist, a budget, and actual spend against it.
      </p>

      {loading ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : modules.length === 0 ? (
        <EmptyState title="Planning modules not seeded yet" />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {modules.map((m) => {
            const project = projectFor(m.id)
            return (
              <button
                key={m.id}
                onClick={() => navigate(`/build-a-post/${m.id}${selectedPostId ? `?post=${selectedPostId}` : ''}`)}
                className="panel p-5 text-left hover:border-gold transition-colors"
              >
                <div className="font-display text-xl tracking-wide mb-1">{m.name}</div>
                <p className="text-xs text-muted mb-3 line-clamp-2">{m.description}</p>
                <div className="font-mono text-xs text-gold mb-2">
                  ${m.startup_cost_low?.toLocaleString() ?? '—'} – ${m.startup_cost_high?.toLocaleString() ?? '—'}
                </div>
                {project && (
                  <div className="text-[11px] font-mono uppercase tracking-wide text-status-developing">
                    Project: {project.status.replaceAll('_', ' ')}
                  </div>
                )}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
