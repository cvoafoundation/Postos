export interface DriveWorkspace { id: string; kind: 'national'|'state'|'post'; name: string; state: string|null; post_id: string|null; level: number }
export interface DriveItem { id: string; workspace_id: string; parent_id: string|null; kind: 'folder'|'document'|'file'; name: string; content: any; storage_path: string|null; mime_type: string|null; file_size: number|null; version: number; stage: 'draft'|'review'|'approved'|'superseded'; is_template: boolean; deleted_at: string|null; updated_at: string; created_at: string }
export interface DriveRevision { id: string; version: number; content: any; name: string; stage: string; created_at: string }
export interface DriveShare { id: string; item_id: string; recipient_workspace_id: string|null; permission: string; expires_at: string|null; revoked_at: string|null; legacy_all_members: boolean }
export const EMPTY_DOCUMENT = { type: 'doc', content: [{ type: 'paragraph' }] }
export function driveBlobPath(workspace: string, item: string, filename: string, parent: string|null = null) { return `${workspace}/${item}/${parent ?? 'root'}/${crypto.randomUUID()}/${filename.replace(/[^A-Za-z0-9._-]/g,'_') || 'file'}` }
export function fileSize(bytes: number|null) { return bytes ? bytes >= 1048576 ? `${(bytes/1048576).toFixed(1)} MB` : `${Math.ceil(bytes/1024)} KB` : '—' }
export function downloadText(name: string, content: string, mime: string) {
 const url=URL.createObjectURL(new Blob([content],{type:mime}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)
}
