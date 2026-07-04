import { useEffect, useState } from 'react'
import { PageHeader } from '@/components/layout/AppShell'
import { EmptyState } from '@/components/ui/EmptyState'
import { supabase } from '@/lib/supabase'

interface BuildModule {
  id: string
  name: string
  description: string | null
  startup_cost_low: number | null
  startup_cost_high: number | null
  equipment_list: string[] | null
  sponsor_opportunities: string | null
  grant_opportunities: string | null
  revenue_potential: string | null
}

export default function BuildAPost() {
  const [modules, setModules] = useState<BuildModule[]>([])
  const [selected, setSelected] = useState<BuildModule | null>(null)

  useEffect(() => {
    supabase
      .from('build_a_post_modules')
      .select('*')
      .then(({ data }) => setModules((data ?? []) as BuildModule[]))
  }, [])

  return (
    <div>
      <PageHeader eyebrow="Module 10 — Franchise Playbook" title="Build A Post" />

      {modules.length === 0 ? (
        <EmptyState
          title="Planning modules not seeded yet"
          hint="Populate build_a_post_modules with layouts: Bar, Kitchen, Classroom, Employment Office, Education Office, VA Clinic Space, Transitional Housing Rooms, Fitness Center — each with cost estimates, equipment, sponsor/grant opportunities, and revenue potential."
        />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1 space-y-2">
            {modules.map((m) => (
              <button
                key={m.id}
                onClick={() => setSelected(m)}
                className={`panel w-full text-left p-3 ${selected?.id === m.id ? 'border-gold' : ''}`}
              >
                {m.name}
              </button>
            ))}
          </div>
          <div className="lg:col-span-2">
            {selected ? (
              <div className="panel p-6 space-y-4">
                <div className="font-display text-2xl">{selected.name}</div>
                <p className="text-sm text-muted">{selected.description}</p>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="eyebrow mb-1">Startup Cost</div>
                    <div className="font-mono text-gold">
                      ${selected.startup_cost_low?.toLocaleString() ?? '—'} – $
                      {selected.startup_cost_high?.toLocaleString() ?? '—'}
                    </div>
                  </div>
                  <div>
                    <div className="eyebrow mb-1">Revenue Potential</div>
                    <div className="text-sm">{selected.revenue_potential ?? '—'}</div>
                  </div>
                </div>
                <div>
                  <div className="eyebrow mb-1">Equipment List</div>
                  <ul className="text-sm list-disc list-inside text-muted">
                    {(selected.equipment_list ?? []).map((eq) => (
                      <li key={eq}>{eq}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <div className="eyebrow mb-1">Sponsor Opportunities</div>
                  <p className="text-sm text-muted">{selected.sponsor_opportunities ?? '—'}</p>
                </div>
                <div>
                  <div className="eyebrow mb-1">Grant Opportunities</div>
                  <p className="text-sm text-muted">{selected.grant_opportunities ?? '—'}</p>
                </div>
              </div>
            ) : (
              <EmptyState title="Select a layout" hint="Choose a facility area to see the build-out plan." />
            )}
          </div>
        </div>
      )}
    </div>
  )
}
