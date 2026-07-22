import { useEffect, useState, type ChangeEvent, type DragEvent } from 'react'
import { PageHeader } from '@/components/layout/AppShell'
import { EmptyState } from '@/components/ui/EmptyState'
import { Modal } from '@/components/ui/Modal'
import { useAuth } from '@/context/AuthContext'
import { supabase } from '@/lib/supabase'
import type { DriveFile, DriveFolder } from '@/lib/types'
import {
  Folder,
  FileText,
  Upload,
  FolderPlus,
  Download,
  Trash2,
  Pencil,
  Search,
  ChevronRight,
  Loader2,
  Palette,
  FolderInput,
  RotateCcw,
  X,
  Users,
  Target,
} from 'lucide-react'
import { format, differenceInDays } from 'date-fns'

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

const TRASH_RETENTION_DAYS = 30

function formatSize(bytes: number | null): string {
  if (!bytes) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

type MoveTarget = { type: 'file' | 'folder'; id: string; name: string }

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
  const [showTrash, setShowTrash] = useState(false)
  const [trashedFolders, setTrashedFolders] = useState<DriveFolder[]>([])
  const [trashedFiles, setTrashedFiles] = useState<DriveFile[]>([])
  const [moveTarget, setMoveTarget] = useState<MoveTarget | null>(null)
  const [allFolders, setAllFolders] = useState<DriveFolder[]>([])
  const [postPickerFor, setPostPickerFor] = useState<string | null>(null)
  const [postsForSharing, setPostsForSharing] = useState<{ id: string; name: string }[]>([])
  const [previewFile, setPreviewFile] = useState<DriveFile | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [sortBy, setSortBy] = useState<'name' | 'date' | 'size'>('name')
  const [searchFolderResults, setSearchFolderResults] = useState<DriveFolder[]>([])

  async function load(folderId: string | null) {
    setLoading(true)
    const [foldersRes, filesRes] = await Promise.all([
      folderId
        ? supabase.from('drive_folders').select('*').eq('parent_folder_id', folderId).is('deleted_at', null).order('name')
        : supabase.from('drive_folders').select('*').is('parent_folder_id', null).is('deleted_at', null).order('name'),
      folderId
        ? supabase.from('drive_files').select('*').eq('folder_id', folderId).is('deleted_at', null).order('name')
        : supabase.from('drive_files').select('*').is('folder_id', null).is('deleted_at', null).order('name'),
    ])
    setFolders((foldersRes.data ?? []) as DriveFolder[])
    setFiles((filesRes.data ?? []) as DriveFile[])
    setLoading(false)
  }

  async function loadTrash() {
    // Lazily purge anything past retention — no cron needed, this check
    // runs whenever someone actually opens the trash.
    const cutoff = new Date(Date.now() - TRASH_RETENTION_DAYS * 86400000).toISOString()
    const [foldersRes, filesRes] = await Promise.all([
      supabase.from('drive_folders').select('*').not('deleted_at', 'is', null).order('deleted_at', { ascending: false }),
      supabase.from('drive_files').select('*').not('deleted_at', 'is', null).order('deleted_at', { ascending: false }),
    ])
    const folders = (foldersRes.data ?? []) as DriveFolder[]
    const filesData = (filesRes.data ?? []) as DriveFile[]

    const expiredFolders = folders.filter((f) => f.deleted_at && f.deleted_at < cutoff)
    const expiredFiles = filesData.filter((f) => f.deleted_at && f.deleted_at < cutoff)
    for (const f of expiredFolders) await supabase.from('drive_folders').delete().eq('id', f.id)
    for (const f of expiredFiles) {
      await supabase.storage.from('ncc-drive').remove([f.storage_path])
      await supabase.from('drive_files').delete().eq('id', f.id)
    }

    setTrashedFolders(folders.filter((f) => !expiredFolders.includes(f)))
    setTrashedFiles(filesData.filter((f) => !expiredFiles.includes(f)))
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
    if (!showTrash) {
      load(currentFolderId)
      buildBreadcrumb(currentFolderId)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentFolderId, showTrash])

  useEffect(() => {
    supabase
      .from('posts')
      .select('id, name')
      .order('name')
      .then(({ data }: any) => setPostsForSharing((data ?? []) as { id: string; name: string }[]))
  }, [])

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

  async function toggleShared(folder: DriveFolder) {
    const shared_with_posts = !folder.shared_with_posts
    setFolders((prev) => prev.map((f) => (f.id === folder.id ? { ...f, shared_with_posts } : f)))
    await supabase.from('drive_folders').update({ shared_with_posts }).eq('id', folder.id)
  }

  async function setSharedWithPost(folder: DriveFolder, postId: string | null) {
    setFolders((prev) => prev.map((f) => (f.id === folder.id ? { ...f, shared_with_post_id: postId } : f)))
    await supabase.from('drive_folders').update({ shared_with_post_id: postId }).eq('id', folder.id)
    setPostPickerFor(null)
  }

  // Soft delete — moves to Trash instead of destroying immediately.
  async function deleteFile(file: DriveFile) {
    if (!window.confirm(`Move "${file.name}" to Trash? Items in Trash are permanently deleted after ${TRASH_RETENTION_DAYS} days.`)) return
    await supabase.from('drive_files').update({ deleted_at: new Date().toISOString() }).eq('id', file.id)
    load(currentFolderId)
  }

  async function deleteFolder(folder: DriveFolder) {
    if (!window.confirm(`Move "${folder.name}" to Trash? Items in Trash are permanently deleted after ${TRASH_RETENTION_DAYS} days.`)) return
    await supabase.from('drive_folders').update({ deleted_at: new Date().toISOString() }).eq('id', folder.id)
    load(currentFolderId)
  }

  async function restoreFile(file: DriveFile) {
    await supabase.from('drive_files').update({ deleted_at: null }).eq('id', file.id)
    loadTrash()
  }

  async function restoreFolder(folder: DriveFolder) {
    await supabase.from('drive_folders').update({ deleted_at: null }).eq('id', folder.id)
    loadTrash()
  }

  async function deleteForever(type: 'file' | 'folder', item: DriveFile | DriveFolder) {
    if (!window.confirm(`Permanently delete "${item.name}"? This cannot be undone.`)) return
    if (type === 'file') {
      await supabase.storage.from('ncc-drive').remove([(item as DriveFile).storage_path])
      await supabase.from('drive_files').delete().eq('id', item.id)
    } else {
      await supabase.from('drive_folders').delete().eq('id', item.id)
    }
    loadTrash()
  }

  async function openMovePicker(target: MoveTarget) {
    const { data } = await supabase.from('drive_folders').select('*').is('deleted_at', null).order('name')
    setAllFolders((data ?? []) as DriveFolder[])
    setMoveTarget(target)
  }

  async function moveTo(destinationFolderId: string | null) {
    if (!moveTarget) return
    if (moveTarget.type === 'file') {
      await supabase.from('drive_files').update({ folder_id: destinationFolderId }).eq('id', moveTarget.id)
    } else {
      if (destinationFolderId === moveTarget.id) {
        window.alert("Can't move a folder into itself.")
        return
      }
      await supabase.from('drive_folders').update({ parent_folder_id: destinationFolderId }).eq('id', moveTarget.id)
    }
    setMoveTarget(null)
    load(currentFolderId)
  }

  async function runSearch() {
    if (!query.trim()) {
      setSearchResults(null)
      setSearchFolderResults([])
      return
    }
    const [filesRes, foldersRes] = await Promise.all([
      supabase.from('drive_files').select('*').ilike('name', `%${query}%`).is('deleted_at', null).order('name'),
      supabase.from('drive_folders').select('*').ilike('name', `%${query}%`).is('deleted_at', null).order('name'),
    ])
    setSearchResults((filesRes.data ?? []) as DriveFile[])
    setSearchFolderResults((foldersRes.data ?? []) as DriveFolder[])
  }

  function sortFolders(list: DriveFolder[]): DriveFolder[] {
    const sorted = [...list]
    if (sortBy === 'date') sorted.sort((a, b) => b.created_at.localeCompare(a.created_at))
    else sorted.sort((a, b) => a.name.localeCompare(b.name))
    return sorted
  }

  function sortFiles(list: DriveFile[]): DriveFile[] {
    const sorted = [...list]
    if (sortBy === 'date') sorted.sort((a, b) => b.created_at.localeCompare(a.created_at))
    else if (sortBy === 'size') sorted.sort((a, b) => (b.file_size ?? 0) - (a.file_size ?? 0))
    else sorted.sort((a, b) => a.name.localeCompare(b.name))
    return sorted
  }

  // Images and PDFs get a real inline preview; everything else (Word docs,
  // spreadsheets, zips, etc.) falls back straight to download — there's no
  // in-browser way to render those without pulling in a much heavier
  // document-conversion dependency than this warrants right now.
  function canPreview(mimeType: string | null): boolean {
    return !!mimeType && (mimeType.startsWith('image/') || mimeType === 'application/pdf')
  }

  async function openPreview(file: DriveFile) {
    if (!canPreview(file.mime_type)) {
      downloadFile(file)
      return
    }
    setPreviewFile(file)
    const { data } = await supabase.storage.from('ncc-drive').createSignedUrl(file.storage_path, 300)
    setPreviewUrl(data?.signedUrl ?? null)
  }

  return (
    <div>
      <PageHeader
        eyebrow="Internal — National Only"
        title="NCC Drive"
        action={
          <div className="flex gap-2">
            <button
              onClick={() => {
                setShowTrash((v) => !v)
                if (!showTrash) loadTrash()
              }}
              className="btn-ghost flex items-center gap-2"
            >
              <Trash2 size={16} /> {showTrash ? 'Back to Drive' : 'Trash'}
            </button>
            {!showTrash && (
              <>
                <button onClick={createFolder} className="btn-ghost flex items-center gap-2">
                  <FolderPlus size={16} /> New Folder
                </button>
                <label className="btn-gold flex items-center gap-2 cursor-pointer">
                  {uploading ? <Loader2 className="animate-spin" size={16} /> : <Upload size={16} />}
                  {uploading ? 'Uploading…' : 'Upload Files'}
                  <input type="file" multiple className="hidden" onChange={handleFileInput} disabled={uploading} />
                </label>
              </>
            )}
          </div>
        }
      />

      <p className="text-sm text-muted mb-6 max-w-2xl">
        The National Command Council's own internal storage — not tied to any post. Only National accounts can
        manage this; a folder marked "Shared" becomes read-only visible to every post account.
      </p>

      {showTrash ? (
        <div>
          <p className="text-xs text-muted mb-4">Items here are permanently deleted after {TRASH_RETENTION_DAYS} days.</p>
          {trashedFolders.length === 0 && trashedFiles.length === 0 ? (
            <EmptyState title="Trash is empty" />
          ) : (
            <div className="space-y-1.5">
              {trashedFolders.map((folder) => (
                <div key={folder.id} className="panel p-3 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Folder size={18} className="text-muted" />
                    <span className="text-sm">{folder.name}</span>
                    <span className="text-[11px] text-muted font-mono">
                      {folder.deleted_at && `${TRASH_RETENTION_DAYS - differenceInDays(new Date(), new Date(folder.deleted_at))}d left`}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-muted">
                    <button onClick={() => restoreFolder(folder)} className="hover:text-gold" title="Restore">
                      <RotateCcw size={14} />
                    </button>
                    <button onClick={() => deleteForever('folder', folder)} className="hover:text-status-attention" title="Delete forever">
                      <X size={14} />
                    </button>
                  </div>
                </div>
              ))}
              {trashedFiles.map((file) => (
                <div key={file.id} className="panel p-3 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <FileText size={18} className="text-muted" />
                    <span className="text-sm">{file.name}</span>
                    <span className="text-[11px] text-muted font-mono">
                      {file.deleted_at && `${TRASH_RETENTION_DAYS - differenceInDays(new Date(), new Date(file.deleted_at))}d left`}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-muted">
                    <button onClick={() => restoreFile(file)} className="hover:text-gold" title="Restore">
                      <RotateCcw size={14} />
                    </button>
                    <button onClick={() => deleteForever('file', file)} className="hover:text-status-attention" title="Delete forever">
                      <X size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <>
          <div className="flex gap-2 mb-6">
            <div className="relative flex-1">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
              <input
                placeholder="Search every file and folder by name…"
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
              <button onClick={() => { setQuery(''); setSearchResults(null); setSearchFolderResults([]) }} className="btn-ghost px-4">
                Clear
              </button>
            )}
            <select value={sortBy} onChange={(e) => setSortBy(e.target.value as typeof sortBy)} className="input-field w-36">
              <option value="name">Name (A–Z)</option>
              <option value="date">Newest first</option>
              <option value="size">Largest first</option>
            </select>
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
            {!searchResults && !dragOver && (
              <label className="flex items-center justify-center gap-2 border border-dashed border-hairline hover:border-gold rounded-sm py-4 mb-4 cursor-pointer text-sm text-muted transition-colors">
                <Upload size={16} /> Drag files here, or click to upload multiple at once
                <input type="file" multiple className="hidden" onChange={handleFileInput} disabled={uploading} />
              </label>
            )}
            {dragOver && (
              <div className="flex items-center justify-center gap-2 border-2 border-dashed border-gold rounded-sm py-8 mb-4 text-sm text-gold">
                <Upload size={18} /> Drop to upload
              </div>
            )}

            {searchResults ? (
              <div>
                <div className="eyebrow mb-3">
                  {searchFolderResults.length + searchResults.length} result{searchFolderResults.length + searchResults.length !== 1 ? 's' : ''}
                </div>
                {searchFolderResults.length === 0 && searchResults.length === 0 ? (
                  <EmptyState title="No files or folders found" />
                ) : (
                  <div className="space-y-1.5">
                    {searchFolderResults.map((folder) => (
                      <button
                        key={folder.id}
                        onClick={() => {
                          setSearchResults(null)
                          setSearchFolderResults([])
                          setQuery('')
                          setCurrentFolderId(folder.id)
                        }}
                        className="w-full panel p-3 flex items-center gap-3 hover:border-gold transition-colors text-left"
                      >
                        <Folder size={18} style={{ color: folder.color ?? '#C9A227' }} fill={folder.color ?? '#C9A227'} fillOpacity={0.15} />
                        <span className="text-sm">{folder.name}</span>
                      </button>
                    ))}
                    {searchResults.map((f) => (
                      <FileRow
                        key={f.id}
                        file={f}
                        onPreview={() => openPreview(f)}
                        onDownload={() => downloadFile(f)}
                        onRename={() => renameFile(f)}
                        onDelete={() => deleteFile(f)}
                        onMove={() => openMovePicker({ type: 'file', id: f.id, name: f.name })}
                      />
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
                    {sortFolders(folders).map((folder) => (
                      <div
                        key={folder.id}
                        className="panel p-3 flex items-center justify-between hover:border-gold transition-colors cursor-pointer relative"
                        onClick={() => setCurrentFolderId(folder.id)}
                      >
                        <div className="flex items-center gap-3">
                          <Folder size={18} style={{ color: folder.color ?? '#C9A227' }} fill={folder.color ?? '#C9A227'} fillOpacity={0.15} />
                          <span className="text-sm">{folder.name}</span>
                          {folder.shared_with_posts && (
                            <span title="Shared with all posts (read-only)">
                              <Users size={13} className="text-gold" />
                            </span>
                          )}
                          {folder.shared_with_post_id && (
                            <span
                              title={`Shared privately with ${postsForSharing.find((p) => p.id === folder.shared_with_post_id)?.name ?? 'one post'}`}
                              className="text-[10px] font-mono text-gold border border-gold/30 rounded-sm px-1.5"
                            >
                              {postsForSharing.find((p) => p.id === folder.shared_with_post_id)?.name ?? 'One post'}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 text-muted" onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={() => toggleShared(folder)}
                            className={folder.shared_with_posts ? 'text-gold' : 'hover:text-gold'}
                            title={folder.shared_with_posts ? 'Shared with every post — click to unshare' : 'Share with every post (read-only)'}
                          >
                            <Users size={14} />
                          </button>
                          <button
                            onClick={() => setPostPickerFor(postPickerFor === folder.id ? null : folder.id)}
                            className={folder.shared_with_post_id ? 'text-gold' : 'hover:text-gold'}
                            title="Share privately with one specific post"
                          >
                            <Target size={14} />
                          </button>
                          <button onClick={() => setColorPickerFor(colorPickerFor === folder.id ? null : folder.id)} className="hover:text-gold" title="Color">
                            <Palette size={14} />
                          </button>
                          <button onClick={() => openMovePicker({ type: 'folder', id: folder.id, name: folder.name })} className="hover:text-gold" title="Move">
                            <FolderInput size={14} />
                          </button>
                          <button onClick={() => renameFolder(folder)} className="hover:text-gold" title="Rename">
                            <Pencil size={14} />
                          </button>
                          <button onClick={() => deleteFolder(folder)} className="hover:text-status-attention" title="Move to Trash">
                            <Trash2 size={14} />
                          </button>
                        </div>
                        {postPickerFor === folder.id && (
                          <div className="absolute right-3 top-full mt-1 panel p-2 w-56 max-h-64 overflow-y-auto z-10" onClick={(e) => e.stopPropagation()}>
                            <button
                              onClick={() => setSharedWithPost(folder, null)}
                              className="w-full text-left text-xs px-2 py-1.5 rounded-sm hover:bg-surface/60 text-muted"
                            >
                              Not shared with a specific post
                            </button>
                            {postsForSharing.map((p) => (
                              <button
                                key={p.id}
                                onClick={() => setSharedWithPost(folder, p.id)}
                                className={`w-full text-left text-xs px-2 py-1.5 rounded-sm hover:bg-surface/60 ${
                                  folder.shared_with_post_id === p.id ? 'text-gold' : ''
                                }`}
                              >
                                {p.name}
                              </button>
                            ))}
                          </div>
                        )}
                        {colorPickerFor === folder.id && (
                          <div className="absolute right-3 top-full mt-1 panel p-2 flex gap-1.5 z-10" onClick={(e) => e.stopPropagation()}>
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
                    {sortFiles(files).map((f) => (
                      <FileRow
                        key={f.id}
                        file={f}
                        onPreview={() => openPreview(f)}
                        onDownload={() => downloadFile(f)}
                        onRename={() => renameFile(f)}
                        onDelete={() => deleteFile(f)}
                        onMove={() => openMovePicker({ type: 'file', id: f.id, name: f.name })}
                      />
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </>
      )}

      {moveTarget && (
        <Modal title={`Move "${moveTarget.name}"`} onClose={() => setMoveTarget(null)}>
          <div className="space-y-2">
            <button
              onClick={() => moveTo(null)}
              className="w-full text-left panel p-2.5 hover:border-gold transition-colors text-sm flex items-center gap-2"
            >
              <Folder size={15} className="text-gold" /> NCC Drive (root)
            </button>
            {allFolders
              .filter((f) => f.id !== moveTarget.id)
              .map((f) => (
                <button
                  key={f.id}
                  onClick={() => moveTo(f.id)}
                  className="w-full text-left panel p-2.5 hover:border-gold transition-colors text-sm flex items-center gap-2"
                >
                  <Folder size={15} style={{ color: f.color ?? '#C9A227' }} /> {f.name}
                </button>
              ))}
          </div>
        </Modal>
      )}

      {previewFile && (
        <Modal
          title={previewFile.name}
          onClose={() => {
            setPreviewFile(null)
            setPreviewUrl(null)
          }}
        >
          <div className="mb-4">
            {!previewUrl ? (
              <p className="text-sm text-muted py-8 text-center">Loading preview…</p>
            ) : previewFile.mime_type?.startsWith('image/') ? (
              <img src={previewUrl} alt={previewFile.name} className="max-w-full max-h-[70vh] mx-auto rounded-sm" />
            ) : (
              <iframe src={previewUrl} title={previewFile.name} className="w-full h-[70vh] rounded-sm border border-hairline" />
            )}
          </div>
          <button onClick={() => downloadFile(previewFile)} className="btn-gold flex items-center gap-2">
            <Download size={16} /> Download
          </button>
        </Modal>
      )}
    </div>
  )
}

function FileRow({
  file,
  onPreview,
  onDownload,
  onRename,
  onDelete,
  onMove,
}: {
  file: DriveFile
  onPreview: () => void
  onDownload: () => void
  onRename: () => void
  onDelete: () => void
  onMove: () => void
}) {
  return (
    <div
      onClick={onPreview}
      className="panel p-3 flex items-center justify-between cursor-pointer hover:border-gold transition-colors"
      title="Click to preview"
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
        <button onClick={onMove} className="hover:text-gold" title="Move">
          <FolderInput size={14} />
        </button>
        <button onClick={onRename} className="hover:text-gold" title="Rename">
          <Pencil size={14} />
        </button>
        <button onClick={onDelete} className="hover:text-status-attention" title="Move to Trash">
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  )
}
