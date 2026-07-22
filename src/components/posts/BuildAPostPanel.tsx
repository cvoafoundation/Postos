import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { EmptyState } from '@/components/ui/EmptyState'
import { supabase } from '@/lib/supabase'
import type { BuildAPostModule, PostFacilityProject } from '@/lib/types'
import { ArrowRight } from 'lucide-react'

export function BuildAPostPanel({ postId }: { postId: string }) {
  const navigate = useNavigate()
  const [projects, setProjects] = useState<PostFacilityProject[]>([])
  const [modules, setModules] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    Promise.all([
      supabase.from('post_facility_projects').select('*').eq('post_id', postId),
      supabase.from('build_a_post_modules').select('id, name'),
    ]).then(([projectsRes, modulesRes]) => {
      setProjects((projectsRes.data ?? []) as PostFacilityProject[])
      const map: Record<string, string> = {}
      for (const m of (modulesRes.data ?? []) as BuildAPostModule[]) map[m.id] = m.name
      setModules(map)
      setLoading(false)
    })
  }, [postId])

  if (loading) return <p className="text-sm text-muted">Loading…</p>

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-muted">{projects.length} facility project{projects.length !== 1 ? 's' : ''} being tracked for this post.</p>
        <button onClick={() => navigate(`/build-a-post?post=${postId}`)} className="btn-ghost flex items-center gap-2 text-sm shrink-0">
          Open Full Build A Post <ArrowRight size={14} />
        </button>
      </div>

      {projects.length === 0 ? (
        <EmptyState title="No facility projects started yet" hint="Pick a module from the full Build A Post tool to start tracking one." />
      ) : (
        <div className="space-y-2">
          {projects.map((p) => (
            <div key={p.id} className="panel p-3 flex items-center justify-between gap-4">
              <div className="text-sm text-ink">{modules[p.module_id] ?? 'Module'}</div>
              <span className="text-xs font-mono uppercase text-status-developing">{p.status.replaceAll('_', ' ')}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
