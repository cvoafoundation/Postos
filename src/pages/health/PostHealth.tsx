import { useEffect, useState } from 'react'
import { PageHeader } from '@/components/layout/AppShell'
import { EmptyState } from '@/components/ui/EmptyState'
import { StatusBadge, healthTone } from '@/components/ui/StatusBadge'
import { supabase } from '@/lib/supabase'
import type { Post } from '@/lib/types'

export default function PostHealth() {
  const [posts, setPosts] = useState<Post[]>([])

  useEffect(() => {
    supabase
      .from('posts')
      .select('*')
      .eq('status', 'active_post')
      .then(({ data }) => setPosts((data ?? []) as Post[]))
  }, [])

  const struggling = posts.filter((p) => p.health_status === 'red')

  return (
    <div>
      <PageHeader eyebrow="Module 9" title="Post Health System" />

      {struggling.length > 0 && (
        <div className="panel p-4 mb-6">
          <div className="eyebrow mb-2 text-status-attention">Needs Immediate Attention</div>
          <div className="flex gap-2 flex-wrap">
            {struggling.map((p) => (
              <StatusBadge key={p.id} label={`${p.name} (${p.state})`} tone="attention" />
            ))}
          </div>
        </div>
      )}

      <div className="panel overflow-hidden">
        <table className="w-full">
          <thead>
            <tr>
              <th className="table-head">Post</th>
              <th className="table-head">State</th>
              <th className="table-head">Health</th>
              <th className="table-head">Charter Date</th>
            </tr>
          </thead>
          <tbody>
            {posts.map((p) => (
              <tr key={p.id}>
                <td className="table-cell">{p.name}</td>
                <td className="table-cell font-mono">{p.state}</td>
                <td className="table-cell">
                  <StatusBadge label={p.health_status} tone={healthTone(p.health_status)} />
                </td>
                <td className="table-cell text-muted">{p.charter_date ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {posts.length === 0 && (
          <EmptyState
            title="No active posts yet"
            hint="Health scores (membership growth, attendance, fundraising, retention, compliance, service) roll up here once posts go active."
          />
        )}
      </div>
    </div>
  )
}
