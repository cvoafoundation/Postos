import { useEffect, useState } from 'react'
import { PageHeader } from '@/components/layout/AppShell'
import { EmptyState } from '@/components/ui/EmptyState'
import { supabase } from '@/lib/supabase'
import type { DriveFile, DriveFolder } from '@/lib/types'
import { Folder, FileText, Download, ChevronDown, ChevronRight } from 'lucide-react'
import { format } from 'date-fns'

function formatSize(bytes: number | null): string {
  if (!bytes) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function SharedDriveView() {
  const [folders, setFolders] = useState<DriveFolder[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [filesByFolder, setFilesByFolder] = useState<Record<string, DriveFile[]>>({})

  useEffect(() => {
    supabase
      .from('drive_folders')
      .select('*')
      .eq('shared_with_posts', true)
      .is('deleted_at', null)
      .order('name')
      .then(({ data }: any) => {
        setFolders((data ?? []) as DriveFolder[])
        setLoading(false)
      })
  }, [])

  async function toggleExpand(folder: DriveFolder) {
    if (expanded === folder.id) {
      setExpanded(null)
      return
    }
    setExpanded(folder.id)
    if (!filesByFolder[folder.id]) {
      const { data } = await supabase.from('drive_files').select('*').eq('folder_id', folder.id).is('deleted_at', null).order('name')
      setFilesByFolder((prev) => ({ ...prev, [folder.id]: (data ?? []) as DriveFile[] }))
    }
  }

  async function downloadFile(file: DriveFile) {
    const { data } = await supabase.storage.from('ncc-drive').createSignedUrl(file.storage_path, 300)
    if (data?.signedUrl) window.open(data.signedUrl, '_blank')
  }

  return (
    <div>
      <PageHeader eyebrow="From National" title="Shared Files" />
      <p className="text-sm text-muted mb-6 max-w-xl">
        Folders National has shared with every post — read-only. Templates, official forms, and reference
        material live here.
      </p>

      {loading ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : folders.length === 0 ? (
        <EmptyState title="Nothing shared yet" hint="National hasn't marked any folders as shared." />
      ) : (
        <div className="space-y-1.5">
          {folders.map((folder) => (
            <div key={folder.id} className="panel overflow-hidden">
              <button
                onClick={() => toggleExpand(folder)}
                className="w-full p-3 flex items-center justify-between hover:bg-surface/60 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <Folder size={18} style={{ color: folder.color ?? '#C9A227' }} />
                  <span className="text-sm">{folder.name}</span>
                </div>
                {expanded === folder.id ? <ChevronDown size={15} className="text-muted" /> : <ChevronRight size={15} className="text-muted" />}
              </button>
              {expanded === folder.id && (
                <div className="border-t border-hairline p-2 space-y-1">
                  {(filesByFolder[folder.id] ?? []).length === 0 ? (
                    <p className="text-xs text-muted p-2">No files in this folder.</p>
                  ) : (
                    filesByFolder[folder.id].map((f) => (
                      <button
                        key={f.id}
                        onClick={() => downloadFile(f)}
                        className="w-full flex items-center justify-between p-2 hover:bg-surface/60 rounded-sm text-left text-sm"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <FileText size={14} className="text-muted shrink-0" />
                          <span className="truncate">{f.name}</span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0 text-[11px] text-muted font-mono">
                          {formatSize(f.file_size)} · {format(new Date(f.created_at), 'MMM d, yyyy')}
                          <Download size={13} />
                        </div>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
