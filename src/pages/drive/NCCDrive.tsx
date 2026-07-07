import { useEffect, useState, type ChangeEvent, type DragEvent } from 'react'
import { PageHeader } from '@/components/layout/AppShell'
import { EmptyState } from '@/components/ui/EmptyState'
import { useAuth } from '@/context/AuthContext'
import { supabase } from '@/lib/supabase'
import type { DriveFile, DriveFolder } from '@/lib/types'
import { Folder, FileText, Upload, FolderPlus, Download, Trash2, Pencil, Search, ChevronRight, Loader2, Palette } from 'lucide-react'
import { format } from 'date-fns'

const FOLDER_COLORS = [
  { name: 'Default', hex: null },
  { name: 'Red', hex: '#A3423D' },
  { name: 'Orange', hex: '#C77D33' },
  { name: 'Yellow', hex: '#C9A227' },
  { name: 'Green', hex: '#4A7C59' },
  { name: 'Blue', hex: '#3B6EA5' },
  { name: 'Purple', hex: '#7B5EA7' },
  { name: 'Pink', hex: '#B5567B' },
]

function formatSize(bytes: number | null): string {
  if (!bytes) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function NCCDrive() {
  const { profile } = useAuth()
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null)
  const [breadcrumb, setBreadcrumb] = useState<DriveFolder[]>([])
  const [folders, setFolders] = useState<DriveFolder[]>([])
  const [files, setFiles] = useState<DriveFile[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [uploadMessage, setUploadMessage] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [query, setQuery] = useState('')
  const [searchResults, setSearchResults] = useState<DriveFile[] | null>(null)
  const [colorPickerFor, setColorPickerFor] = useState<string | null>(null)

  async function load(folderId: string | null) {
    setLoading(true)
    const [foldersRes, filesRes] = await Promise.all([
      folderId
        ? supabase.from('drive_folders').select('*').eq('parent_folder_id', folderId).order('name')
        : supabase.from('drive_folders').select('*').is('parent_folder_id', null).order('name'),
      folderId
        ? supabase.from('drive_files').select('*').eq('folder_id', folderId).order('name')
        : supabase.from('drive_files').select('*').is('folder_id', null).order('name'),
    ])
    setFolders((foldersRes.data ?? []) as DriveFolder[])
    setFiles((filesRes.data ?? []) as DriveFile[])
    setLoading(false)
  }

  async function buildBreadcrumb(folderId: string | null) {
    if (!folderId) {
      setBreadcrumb([])
      return
    }
    const trail: DriveFolder[] = []
    let currentId: string | null = folderId
    while (currentId) {
      const { data } = await supabase.from('drive_folders').select('*').eq('id', currentId).single()
      if (!data) break
      trail.unshift(data as DriveFolder)
      currentId = (data as DriveFolder).parent_folder_id
    }
    setBreadcrumb(trail)
  }

  useEffect(() => {
    load(currentFolderId)
    buildBreadcrumb(currentFolderId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentFolderId])

  async function createFolder() {
    const name = window.prompt('Folder name?')
    if (!name?.trim()) return
    await supabase.from('drive_folders').insert({ parent_folder_id: currentFolderId, name: name.trim(), created_by: profile?.id })
    load(currentFolderId)
  }

  async function uploadFiles(fileList: FileList | File[]) {
    const filesToUpload = Array.from(fileList)
    if (filesToUpload.length === 0) return
    setUploading(true)
    setUploadMessage(null)
    let succeeded = 0
    for (const file of filesToUpload) {
      const path = `${currentFolderId ?? 'root'}/${crypto.randomUUID()}-${file.name}`
      const { data, error } = await supabase.storage.from('ncc-drive').upload(path, file)
      if (!error && data) {
        await supabase.from('drive_files').insert({
          folder_id: currentFolderId,
          name: file.name,
          storage_path: data.path,
          file_size: file.size,
          mime_type: file.type || null,
          uploaded_by: profile?.id,
        })
        succeeded++
      } else if (error) {
        window.alert(`Upload failed for "${file.name}": ${error.message}`)
      }
    }
    setUploading(false)
    if (succeeded > 0) {
      setUploadMessage(`Uploaded ${succeeded} file${succeeded !== 1 ? 's' : ''}.`)
      setTimeout(() => setUploadMessage(null), 4000)
    }
    load(currentFolderId)
  }

  async function handleFileInput(e: ChangeEvent<HTMLInputElement>) {
    if (e.target.files) await uploadFiles(e.target.files)
    e.target.value = ''
  }

  function handleDrop(e: DragEvent) {
    e.preventDefault()
    setDragOver(false)
    if (e.dataTransfer.files.length > 0) uploadFiles(e.dataTransfer.files)
  }

  async function downloadFile(file: DriveFile) {
    const { data } = await supabase.storage.from('ncc-drive').createSignedUrl(file.storage_path, 300)
    if (data?.signedUrl) window.open(data.signedUrl, '_blank')
  }

  async function renameFile(file: DriveFile) {
    const name = window.prompt('New name?', file.name)
    if (!name?.trim()) return
    await supabase.from('drive_files').update({ name: name.trim() }).eq('id', file.id)
    load(currentFolderId)
  }

  async function renameFolder(folder: DriveFolder) {
    const name = window.prompt('New name?', folder.name)
    if (!name?.trim()) return
    await supabase.from('drive_folders').update({ name: name.trim() }).eq('id', folder.id)
    load(currentFolderId)
  }

  async function setFolderColor(folder: DriveFolder, color: string | null) {
    setColorPickerFor(null)
    setFolders((prev) => prev.map((f) => (f.id === folder.id ? { ...f, color } : f)))
    await supabase.from('drive_folders').update({ color }).eq('id', folder.id)
  }

  async function deleteFile(file: DriveFile) {
    if (!window.confirm(`Delete "${file.name}"? This cannot be undone.`)) return
    await supabase.storage.from('ncc-drive').remove([file.storage_path])
    await supabase.from('drive_files').delete().eq('id', file.id)
    load(currentFolderId)
  }

  async function deleteFolder(folder: DriveFolder) {
    if (!window.confirm(`Delete "${folder.name}" and everything inside it? This cannot be undone.`)) return
    await supabase.from('drive_folders').delete().eq('id', folder.id)
    load(currentFolderId)
  }

  async function runSearch() {
    if (!query.trim()) {
      setSearchResults(null)
      return
    }
    const { data } = await supabase.from('drive_files').select('*').ilike('name', `%${query}%`).order('name')
    setSearchResults((data ?? []) as DriveFile[])
  }

  return (
    <div>
      <PageHeader
        eyebrow="Internal — National Only"
        title="NCC Drive"
        action={
          <div className="flex gap-2">
            <button onClick={createFolder} className="btn-ghost flex items-center gap-2">
              <FolderPlus size={16} /> New Folder
            </button>
            <label className="btn-gold flex items-center gap-2 cursor-pointer">
              {uploading ? <Loader2 className="animate-spin" size={16} /> : <Upload size={16} />}
              {uploading ? 'Uploading…' : 'Upload File'}
              <input type="file" multiple className="hidden" onChange={handleFileInput} disabled={uploading} />
            </label>
          </div>
        }
      />

      <p className="text-sm text-muted mb-6 max-w-2xl">
        The National Command Council's own internal storage — not tied to any post. Only National accounts can
        see or touch anything in here.
      </p>

      <div className="flex gap-2 mb-6">
        <div className="relative flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            placeholder="Search every file in the drive by name…"
            className="input-field pl-9"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && runSearch()}
          />
        </div>
        <button onClick={runSearch} className="btn-gold px-6">
          Search
        </button>
        {searchResults && (
          <button onClick={() => { setQuery(''); setSearchResults(null) }} className="btn-ghost px-4">
            Clear
          </button>
        )}
      </div>

      {uploadMessage && (
        <div className="panel p-3 mb-4 text-sm text-status-active border-status-active/40">{uploadMessage}</div>
      )}

      <div
        onDragOver={(e) => {
          e.preventDefault()
          setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        className={`rounded-sm transition-colors ${dragOver ? 'ring-2 ring-gold ring-offset-2 ring-offset-base' : ''}`}
      >
        {searchResults ? (
        <div>
          <div className="eyebrow mb-3">{searchResults.length} result{searchResults.length !== 1 ? 's' : ''}</div>
          {searchResults.length === 0 ? (
            <EmptyState title="No files found" />
          ) : (
            <div className="space-y-1.5">
              {searchResults.map((f) => (
                <FileRow key={f.id} file={f} onDownload={() => downloadFile(f)} onRename={() => renameFile(f)} onDelete={() => deleteFile(f)} />
              ))}
            </div>
          )}
        </div>
      ) : (
        <>
          <div className="flex items-center gap-1 mb-4 text-sm">
            <button onClick={() => setCurrentFolderId(null)} className="text-muted hover:text-gold">
              NCC Drive
            </button>
            {breadcrumb.map((f) => (
              <span key={f.id} className="flex items-center gap-1">
                <ChevronRight size={13} className="text-muted" />
                <button onClick={() => setCurrentFolderId(f.id)} className="text-muted hover:text-gold">
                  {f.name}
                </button>
              </span>
            ))}
          </div>

          {loading ? (
            <p className="text-sm text-muted">Loading…</p>
          ) : folders.length === 0 && files.length === 0 ? (
            <EmptyState title="This folder is empty" hint="Create a folder or upload a file to get started." />
          ) : (
            <div className="space-y-1.5">
              {folders.map((folder) => (
                <div
                  key={folder.id}
                  className="panel p-3 flex items-center justify-between hover:border-gold transition-colors cursor-pointer relative"
                  onClick={() => setCurrentFolderId(folder.id)}
                >
                  <div className="flex items-center gap-3">
                    <Folder size={18} style={{ color: folder.color ?? '#C9A227' }} fill={folder.color ?? '#C9A227'} fillOpacity={0.15} />
                    <span className="text-sm">{folder.name}</span>
                  </div>
                  <div className="flex items-center gap-3 text-muted" onClick={(e) => e.stopPropagation()}>
                    <button onClick={() => setColorPickerFor(colorPickerFor === folder.id ? null : folder.id)} className="hover:text-gold">
                      <Palette size={14} />
                    </button>
                    <button onClick={() => renameFolder(folder)} className="hover:text-gold">
                      <Pencil size={14} />
                    </button>
                    <button onClick={() => deleteFolder(folder)} className="hover:text-status-attention">
                      <Trash2 size={14} />
                    </button>
                  </div>
                  {colorPickerFor === folder.id && (
                    <div
                      className="absolute right-3 top-full mt-1 panel p-2 flex gap-1.5 z-10"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {FOLDER_COLORS.map((c) => (
                        <button
                          key={c.name}
                          title={c.name}
                          onClick={() => setFolderColor(folder, c.hex)}
                          className="w-6 h-6 rounded-full border border-hairline hover:scale-110 transition-transform flex items-center justify-center"
                          style={{ background: c.hex ?? '#26272B' }}
                        >
                          {!c.hex && <Folder size={12} className="text-gold" />}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
              {files.map((f) => (
                <FileRow key={f.id} file={f} onDownload={() => downloadFile(f)} onRename={() => renameFile(f)} onDelete={() => deleteFile(f)} />
              ))}
            </div>
          )}
        </>
      )}
      </div>
    </div>
  )
}

function FileRow({ file, onDownload, onRename, onDelete }: { file: DriveFile; onDownload: () => void; onRename: () => void; onDelete: () => void }) {
  return (
    <div
      onClick={onDownload}
      className="panel p-3 flex items-center justify-between cursor-pointer hover:border-gold transition-colors"
      title="Click to open"
    >
      <div className="flex items-center gap-3 min-w-0">
        <FileText size={18} className="text-muted shrink-0" />
        <div className="min-w-0">
          <div className="text-sm truncate">{file.name}</div>
          <div className="text-[11px] text-muted font-mono">
            {formatSize(file.file_size)} · {format(new Date(file.created_at), 'MMM d, yyyy')}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-3 text-muted shrink-0" onClick={(e) => e.stopPropagation()}>
        <button onClick={onDownload} className="hover:text-gold" title="Download">
          <Download size={14} />
        </button>
        <button onClick={onRename} className="hover:text-gold" title="Rename">
          <Pencil size={14} />
        </button>
        <button onClick={onDelete} className="hover:text-status-attention" title="Delete">
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  )
}
