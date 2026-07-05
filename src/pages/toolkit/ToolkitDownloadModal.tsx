import { useState, type ChangeEvent } from 'react'
import { Modal } from '@/components/ui/Modal'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'
import type { ToolkitItem } from '@/lib/types'
import { Upload, FileText, Loader2 } from 'lucide-react'

export function ToolkitDownloadModal({
  item,
  onClose,
  onSaved,
}: {
  item: ToolkitItem
  onClose: () => void
  onSaved: () => void
}) {
  const { isNational } = useAuth()
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [filePath, setFilePath] = useState(item.file_storage_path)

  async function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setError(null)
    const path = `${item.id}/${crypto.randomUUID()}-${file.name}`
    const { data, error } = await supabase.storage.from('toolkit-files').upload(path, file)
    setUploading(false)
    if (error) {
      setError(error.message)
      return
    }
    const savedPath = data?.path ?? path
    await supabase.from('toolkit_items').update({ file_storage_path: savedPath }).eq('id', item.id)
    setFilePath(savedPath)
    onSaved()
  }

  async function openFile() {
    if (!filePath) return
    const { data, error } = await supabase.storage.from('toolkit-files').createSignedUrl(filePath, 600)
    if (!error && data?.signedUrl) window.open(data.signedUrl, '_blank')
  }

  return (
    <Modal title={item.title} onClose={onClose}>
      <div className="space-y-4">
        {filePath ? (
          <button onClick={openFile} className="flex items-center gap-2 text-gold hover:text-gold-bright text-sm">
            <FileText size={16} /> Open file in new tab
          </button>
        ) : (
          <p className="text-sm text-muted">No file uploaded for this item yet.</p>
        )}

        {isNational && (
          <label className="flex flex-col items-center justify-center gap-2 border border-dashed border-hairline hover:border-gold rounded-sm p-6 cursor-pointer text-sm text-muted">
            {uploading ? (
              <>
                <Loader2 className="animate-spin" size={18} /> Uploading…
              </>
            ) : (
              <>
                <Upload size={18} /> {filePath ? 'Replace file' : 'Upload a file'}
              </>
            )}
            <input type="file" className="hidden" onChange={handleFileChange} disabled={uploading} />
          </label>
        )}
        {error && <p className="text-status-attention text-sm">{error}</p>}
      </div>
    </Modal>
  )
}
