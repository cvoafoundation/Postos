// supabase/functions/generate-toolkit-document/index.ts
//
// WHAT THIS DOES
// Powers the "Generate" button on Toolkit items. Given a toolkit item and a
// post, it fills the item's prompt template with real post data, asks Claude
// to write the actual document, saves it to toolkit_generated_documents, and
// returns the text. This is the thing that lets a commander get a real golf
// scramble packet, sponsorship packet, or meeting agenda in seconds instead
// of calling National for a template.
//
// DEPLOYING THIS (one-time setup):
//   1. In Supabase: Project Settings -> Edge Functions -> add secrets:
//        ANTHROPIC_API_KEY = <your Anthropic API key, from console.anthropic.com>
//        SUPABASE_SERVICE_ROLE_KEY = <already exists in your project settings under API>
//        SUPABASE_URL = <already exists, your project URL>
//   2. Deploy: `supabase functions deploy generate-toolkit-document`
//   3. Frontend calls it via supabase.functions.invoke('generate-toolkit-document', { body: {...} })
//      — already wired up in the Toolkit page, nothing else to connect.

import { serve } from 'https://deno.land/std@0.190.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

interface RequestBody {
  toolkit_item_id: string
  post_id?: string | null
  generated_by?: string | null
  extra_context?: Record<string, string> // e.g. { occasion: "Veterans Day", announcement: "..." }
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

  const { data: item, error: itemError } = await supabase
    .from('toolkit_items')
    .select('title, generate_prompt_template')
    .eq('id', body.toolkit_item_id)
    .single()

  if (itemError || !item?.generate_prompt_template) {
    return new Response(JSON.stringify({ error: 'This toolkit item has no generation template configured.' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  let templateValues: Record<string, string> = { ...(body.extra_context ?? {}) }

  if (body.post_id) {
    const { data: post } = await supabase.from('posts').select('name, city, state').eq('id', body.post_id).single()
    if (post) {
      templateValues.post_name = post.name
      templateValues.post_city_state = [post.city, post.state].filter(Boolean).join(', ')
    }
  }
  templateValues.post_name ??= 'the post'
  templateValues.post_city_state ??= 'their area'

  const filledPrompt = fillTemplate(item.generate_prompt_template, templateValues)

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
    .from('toolkit_generated_documents')
    .insert({
      toolkit_item_id: body.toolkit_item_id,
      post_id: body.post_id ?? null,
      title: `${item.title} — ${templateValues.post_name}`,
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
