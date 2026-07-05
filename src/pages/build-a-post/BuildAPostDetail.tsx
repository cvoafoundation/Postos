import { useEffect, useState } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { PageHeader } from '@/components/layout/AppShell'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'
import type {
  BuildAPostGeneratedPlan,
  BuildAPostModule,
  FinancialTransaction,
  PostFacilityChecklistItem,
  PostFacilityProject,
  Sponsor,
} from '@/lib/types'
import { Sparkles, Loader2, Copy, Check, Plus } from 'lucide-react'

export default function BuildAPostDetail() {
  const { moduleId } = useParams<{ moduleId: string }>()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { profile, isNational } = useAuth()
  const postId = searchParams.get('post') ?? profile?.post_id ?? null

  const [module, setModule] = useState<BuildAPostModule | null>(null)
  const [project, setProject] = useState<PostFacilityProject | null>(null)
  const [checklist, setChecklist] = useState<PostFacilityChecklistItem[]>([])
  const [matchedSponsors, setMatchedSponsors] = useState<Sponsor[]>([])
  const [transactions, setTransactions] = useState<FinancialTransaction[]>([])
  const [loading, setLoading] = useState(true)
  const [starting, setStarting] = useState(false)
  const [budgetInput, setBudgetInput] = useState('')

  const [generating, setGenerating] = useState(false)
  const [generatedPlan, setGeneratedPlan] = useState<BuildAPostGeneratedPlan | null>(null)
  const [genError, setGenError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  async function load() {
    if (!moduleId) return
    setLoading(true)
    const { data: moduleData } = await supabase.from('build_a_post_modules').select('*').eq('id', moduleId).single()
    setModule(moduleData as BuildAPostModule)

    if (postId) {
      const { data: projectData } = await supabase
        .from('post_facility_projects')
        .select('*')
        .eq('post_id', postId)
        .eq('module_id', moduleId)
        .single()
      const proj = (projectData as PostFacilityProject) ?? null
      setProject(proj)
      setBudgetInput(proj?.target_budget ? String(proj.target_budget) : '')

      if (proj) {
        const [checklistRes, txRes] = await Promise.all([
          supabase.from('post_facility_checklist_items').select('*').eq('project_id', proj.id),
          supabase.from('financial_transactions').select('*').eq('facility_project_id', proj.id),
        ])
        setChecklist((checklistRes.data ?? []) as PostFacilityChecklistItem[])
        setTransactions((txRes.data ?? []) as FinancialTransaction[])
      }

      if (moduleData?.relevant_sponsor_categories?.length) {
        const { data: sponsorData } = await supabase
          .from('sponsors')
          .select('*')
          .eq('post_id', postId)
          .in('category', moduleData.relevant_sponsor_categories)
        setMatchedSponsors((sponsorData ?? []) as Sponsor[])
      }
    }
    setLoading(false)
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moduleId, postId])

  async function startProject() {
    if (!postId || !module) return
    setStarting(true)
    const { data: newProject, error } = await supabase
      .from('post_facility_projects')
      .insert({ post_id: postId, module_id: module.id, status: 'planning', created_by: profile?.id ?? null })
      .select()
      .single()
    if (!error && newProject && module.build_checklist_template) {
      await Promise.all(
        module.build_checklist_template.map((label) =>
          supabase.from('post_facility_checklist_items').insert({ project_id: newProject.id, label })
        )
      )
    }
    setStarting(false)
    load()
  }

  async function toggleChecklistItem(item: PostFacilityChecklistItem) {
    const is_complete = !item.is_complete
    setChecklist((prev) => prev.map((i) => (i.id === item.id ? { ...i, is_complete } : i)))
    await supabase
      .from('post_facility_checklist_items')
      .update({ is_complete, completed_at: is_complete ? new Date().toISOString() : null })
      .eq('id', item.id)
  }

  async function saveBudget() {
    if (!project) return
    await supabase.from('post_facility_projects').update({ target_budget: budgetInput ? Number(budgetInput) : null }).eq('id', project.id)
    load()
  }

  async function updateStatus(status: PostFacilityProject['status']) {
    if (!project) return
    await supabase.from('post_facility_projects').update({ status }).eq('id', project.id)
    load()
  }

  async function logExpense() {
    if (!project || !postId) return
    const amountStr = window.prompt('Expense amount ($)?')
    if (!amountStr) return
    const description = window.prompt('What was this expense for?') ?? ''
    await supabase.from('financial_transactions').insert({
      post_id: postId,
      transaction_type: 'expense',
      category: module?.name ?? 'Facility',
      amount: Number(amountStr),
      description,
      transaction_date: new Date().toISOString().slice(0, 10),
      created_by: profile?.id ?? null,
      facility_project_id: project.id,
    })
    load()
  }

  async function generatePlan() {
    if (!module || !postId) return
    setGenerating(true)
    setGenError(null)
    const { data, error } = await supabase.functions.invoke('generate-facility-plan', {
      body: { module_id: module.id, post_id: postId, project_id: project?.id ?? null, generated_by: profile?.id ?? null },
    })
    setGenerating(false)
    if (error || data?.error) {
      setGenError(data?.error ?? error?.message ?? 'Generation failed.')
      return
    }
    setGeneratedPlan(data.document)
  }

  function copyPlan() {
    if (!generatedPlan) return
    navigator.clipboard.writeText(generatedPlan.content)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (loading || !module) return <p className="text-sm text-muted">Loading…</p>

  const spent = transactions.reduce((sum, t) => sum + Number(t.amount), 0)
  const checklistDone = checklist.filter((c) => c.is_complete).length

  return (
    <div>
      <button onClick={() => navigate('/build-a-post')} className="text-xs font-mono text-muted hover:text-gold mb-4">
        ← Back to Build A Post
      </button>

      <PageHeader eyebrow="Module 10" title={module.name} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="panel p-5">
            <p className="text-sm text-ink mb-4">{module.description}</p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="eyebrow mb-1">Startup Cost</div>
                <div className="font-mono text-gold">
                  ${module.startup_cost_low?.toLocaleString() ?? '—'} – ${module.startup_cost_high?.toLocaleString() ?? '—'}
                </div>
              </div>
              <div>
                <div className="eyebrow mb-1">Revenue Potential</div>
                <div className="text-sm">{module.revenue_potential ?? '—'}</div>
              </div>
            </div>
          </div>

          <div className="panel p-5">
            <div className="eyebrow mb-2">Equipment List</div>
            <ul className="text-sm list-disc list-inside text-muted space-y-0.5">
              {(module.equipment_list ?? []).map((eq) => (
                <li key={eq}>{eq}</li>
              ))}
            </ul>
          </div>

          <div className="panel p-5">
            <div className="eyebrow mb-2">Sponsor Opportunities</div>
            <p className="text-sm text-muted mb-3">{module.sponsor_opportunities ?? '—'}</p>
            {matchedSponsors.length > 0 && (
              <div className="border-t border-hairline pt-3">
                <div className="text-[11px] font-mono uppercase text-gold mb-2">
                  Matches from {profile?.post_id ? 'your' : "this post's"} sponsor list
                </div>
                <div className="flex flex-wrap gap-2">
                  {matchedSponsors.map((s) => (
                    <StatusBadge key={s.id} label={`${s.company} — ${s.stage}`} tone="developing" />
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="panel p-5">
            <div className="eyebrow mb-2">Grant Opportunities</div>
            <p className="text-sm text-muted">{module.grant_opportunities ?? '—'}</p>
          </div>
        </div>

        <div className="space-y-6">
          {!postId ? (
            <div className="panel p-5">
              <p className="text-sm text-muted">Select a post from the Build A Post list to start tracking a real project here.</p>
            </div>
          ) : !project ? (
            <div className="panel p-5">
              <div className="eyebrow mb-3">Start This Project</div>
              <p className="text-sm text-muted mb-4">
                Creates a build checklist and lets you track real spend against a budget.
              </p>
              <button onClick={startProject} disabled={starting} className="btn-gold w-full disabled:opacity-50">
                {starting ? 'Starting…' : 'Start Project'}
              </button>
            </div>
          ) : (
            <>
              <div className="panel p-5">
                <div className="eyebrow mb-3">Project Status</div>
                <select
                  className="input-field mb-3"
                  value={project.status}
                  onChange={(e) => updateStatus(e.target.value as PostFacilityProject['status'])}
                >
                  <option value="planning">Planning</option>
                  <option value="in_progress">In Progress</option>
                  <option value="complete">Complete</option>
                </select>
                <div className="eyebrow mb-1">Target Budget</div>
                <div className="flex gap-2">
                  <input
                    type="number"
                    className="input-field"
                    placeholder="$0"
                    value={budgetInput}
                    onChange={(e) => setBudgetInput(e.target.value)}
                  />
                  <button onClick={saveBudget} className="btn-ghost text-xs px-3 shrink-0">
                    Save
                  </button>
                </div>
                {project.target_budget != null && (
                  <div className="mt-3 pt-3 border-t border-hairline text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted">Budget</span>
                      <span className="font-mono">${Number(project.target_budget).toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted">Actual Spend</span>
                      <span className="font-mono">${spent.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between font-medium">
                      <span>Remaining</span>
                      <span className={spent > Number(project.target_budget) ? 'text-status-attention' : 'text-status-active'}>
                        ${(Number(project.target_budget) - spent).toLocaleString()}
                      </span>
                    </div>
                  </div>
                )}
                <button onClick={logExpense} className="btn-ghost w-full mt-3 text-xs flex items-center justify-center gap-1.5">
                  <Plus size={12} /> Log Expense
                </button>
              </div>

              <div className="panel p-5">
                <div className="eyebrow mb-3">Build Checklist ({checklistDone}/{checklist.length})</div>
                <div className="space-y-2">
                  {checklist.map((item) => (
                    <label key={item.id} className="flex items-center gap-2 text-sm cursor-pointer">
                      <input type="checkbox" checked={item.is_complete} onChange={() => toggleChecklistItem(item)} />
                      <span className={item.is_complete ? 'text-muted line-through' : 'text-ink'}>{item.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            </>
          )}

          {module.generate_prompt_template && postId && (
            <div className="panel p-5">
              <div className="eyebrow mb-3 flex items-center gap-2">
                <Sparkles size={14} /> AI Business Case
              </div>
              {!generatedPlan ? (
                <button onClick={generatePlan} disabled={generating} className="btn-gold w-full flex items-center justify-center gap-2 disabled:opacity-50">
                  {generating ? (
                    <>
                      <Loader2 className="animate-spin" size={16} /> Generating…
                    </>
                  ) : (
                    <>
                      <Sparkles size={16} /> Generate Business Case
                    </>
                  )}
                </button>
              ) : (
                <div>
                  <div className="flex justify-end mb-2">
                    <button onClick={copyPlan} className="flex items-center gap-1 text-xs text-gold hover:text-gold-bright">
                      {copied ? <Check size={13} /> : <Copy size={13} />} {copied ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                  <div className="border border-hairline rounded-sm p-3 max-h-72 overflow-y-auto">
                    <p className="text-xs text-ink whitespace-pre-wrap">{generatedPlan.content}</p>
                  </div>
                  <button onClick={() => setGeneratedPlan(null)} className="btn-ghost w-full mt-2 text-xs">
                    Generate Another
                  </button>
                </div>
              )}
              {genError && <p className="text-status-attention text-xs mt-2">{genError}</p>}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
