import { useEffect, useState } from 'react'
import { PageHeader } from '@/components/layout/AppShell'
import { EmptyState } from '@/components/ui/EmptyState'
import { supabase } from '@/lib/supabase'
import { Download } from 'lucide-react'

interface ToolkitTemplateRow {
  id: string
  title: string
  category: string
  description: string | null
  file_url: string | null
}

const DEFAULT_TEMPLATES = [
  'Meeting Agenda', 'Meeting Minutes', 'Recruiting Flyer', 'Sponsorship Packet', 'Press Release',
  'Social Media Templates', 'Fundraising Letters', 'Grant Requests', 'Event Planning Guide', 'Commander Handbook',
]

export default function Toolkit() {
  const [templates, setTemplates] = useState<ToolkitTemplateRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase
      .from('toolkit_templates')
      .select('*')
      .then(({ data }) => {
        setTemplates((data ?? []) as ToolkitTemplateRow[])
        setLoading(false)
      })
  }, [])

  return (
    <div>
      <PageHeader eyebrow="Module 5" title="Post Toolkit — Download Center" />

      {!loading && templates.length === 0 && (
        <div className="mb-6">
          <EmptyState
            title="No templates uploaded yet"
            hint={`Seed the toolkit_templates table with files for: ${DEFAULT_TEMPLATES.join(', ')}. Upload the actual files to Supabase Storage and store the path in file_url.`}
          />
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {templates.map((t) => (
          <a
            key={t.id}
            href={t.file_url ?? '#'}
            target="_blank"
            rel="noreferrer"
            className="panel p-4 flex items-center justify-between hover:border-gold transition-colors"
          >
            <div>
              <div className="text-sm font-medium">{t.title}</div>
              <div className="eyebrow mt-1">{t.category}</div>
            </div>
            <Download size={16} className="text-gold" />
          </a>
        ))}
      </div>
    </div>
  )
}
