// supabase/functions/generate-facility-plan/index.ts
//
// Powers the "Generate Business Case" button in Build A Post. Fills the
// module's prompt template with the post's actual data (name, location,
// target budget if set, and real sponsor matches from that post's own
// Sponsorship CRM), asks Claude to write it, and saves the result.
//
// DEPLOYING THIS (one-time setup):
//   1. In Supabase: Edge Functions -> Secrets, add ANTHROPIC_API_KEY
//      (same key used by generate-toolkit-document, if already deployed).
//   2. Deploy: `supabase functions deploy generate-facility-plan`

import { serve } from 'https://deno.land/std@0.190.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

interface RequestBody {
  module_id: string
  post_id: string
  project_id?: string | null
  generated_by?: string | null
}

function fillTemplate(template: string, values: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => values[key] ?? `[${key}]`)
}

serve(async (req) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  }
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  if (!ANTHROPIC_API_KEY) {
    return new Response(JSON.stringify({ error: 'ANTHROPIC_API_KEY is not configured for this project.' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const body = (await req.json()) as RequestBody
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

  const { data: module, error: moduleError } = await supabase
    .from('build_a_post_modules')
    .select('name, generate_prompt_template, relevant_sponsor_categories')
    .eq('id', body.module_id)
    .single()

  if (moduleError || !module?.generate_prompt_template) {
    return new Response(JSON.stringify({ error: 'This facility module has no generation template configured.' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const { data: post } = await supabase.from('posts').select('name, city, state').eq('id', body.post_id).single()

  let matchedSponsorsNote = ''
  if (module.relevant_sponsor_categories?.length) {
    const { data: sponsors } = await supabase
      .from('sponsors')
      .select('company, category, stage')
      .eq('post_id', body.post_id)
      .in('category', module.relevant_sponsor_categories)
    if (sponsors && sponsors.length > 0) {
      matchedSponsorsNote = ` This post already has these relevant sponsor relationships worth mentioning: ${sponsors
        .map((s: any) => `${s.company} (${s.stage})`)
        .join(', ')}.`
    }
  }

  let projectNote = ''
  if (body.project_id) {
    const { data: project } = await supabase.from('post_facility_projects').select('target_budget, status').eq('id', body.project_id).single()
    if (project?.target_budget) {
      projectNote = ` The post has set a target budget of $${Number(project.target_budget).toLocaleString()} for this project.`
    }
  }

  const templateValues: Record<string, string> = {
    post_name: post?.name ?? 'the post',
    post_city_state: post ? [post.city, post.state].filter(Boolean).join(', ') : 'their area',
  }

  const filledPrompt = fillTemplate(module.generate_prompt_template, templateValues) + matchedSponsorsNote + projectNote

  const aiResponse = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 2000,
      messages: [{ role: 'user', content: filledPrompt }],
    }),
  })

  if (!aiResponse.ok) {
    const errText = await aiResponse.text()
    return new Response(JSON.stringify({ error: `Claude API error: ${errText}` }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const aiData = await aiResponse.json()
  const content = aiData.content?.map((c: any) => c.text ?? '').join('\n') ?? ''

  const { data: saved, error: saveError } = await supabase
    .from('build_a_post_generated_plans')
    .insert({
      module_id: body.module_id,
      post_id: body.post_id,
      title: `${module.name} — ${templateValues.post_name}`,
      content,
      generated_by: body.generated_by ?? null,
    })
    .select()
    .single()

  if (saveError) {
    return new Response(JSON.stringify({ error: saveError.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  return new Response(JSON.stringify({ document: saved }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})
