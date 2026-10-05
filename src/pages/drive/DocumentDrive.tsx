import { lazy, Suspense, useEffect, useRef, useState, type ChangeEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { supabase } from '@/lib/supabase'
import { readAllRows } from '@/lib/readAllRows'
import { PageHeader } from '@/components/layout/AppShell'
import { WorkspaceStatus } from '@/components/workspaces/WorkspaceStatus'
import { Modal } from '@/components/ui/Modal'
import { EMPTY_DOCUMENT, driveBlobPath, fileSize, type DriveItem, type DriveShare, type DriveWorkspace } from '@/lib/drive'
import { FileText, Folder, Star, Upload } from 'lucide-react'
const DocumentEditor=lazy(()=>import('./DocumentEditor'))
type View='files'|'shared'|'recent'|'starred'|'templates'|'trash'
export default function DocumentDrive() {
 const {profile,isNational}=useAuth()
 const [queryParams]=useSearchParams(),linkedItem=queryParams.get('item')
 const openedLink=useRef('')
 const [workspaces,setWorkspaces]=useState<DriveWorkspace[]>([]),[recipients,setRecipients]=useState<{id:string;name:string;kind:string}[]>([])
 const [workspace,setWorkspace]=useState(''),[parent,setParent]=useState<DriveItem|null>(null),[trail,setTrail]=useState<DriveItem[]>([]),[view,setView]=useState<View>('files')
 const [items,setItems]=useState<DriveItem[]>([]),[favorites,setFavorites]=useState<string[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState<string|null>(null),[busy,setBusy]=useState(false),[version,setVersion]=useState(0)
 const [parentLevel,setParentLevel]=useState(0)
 const [search,setSearch]=useState(''),[editorItem,setEditorItem]=useState<DriveItem|null>(null),[editorLevel,setEditorLevel]=useState(0)
 const [selected,setSelected]=useState<DriveItem|null>(null),[url,setUrl]=useState<string|null>(null),[shares,setShares]=useState<DriveShare[]>([]),[history,setHistory]=useState<any[]>([])
 const [recipient,setRecipient]=useState(''),[permission,setPermission]=useState('view'),[expires,setExpires]=useState(''),[moveTarget,setMoveTarget]=useState(''),[folders,setFolders]=useState<DriveItem[]>([]),[selectedLevel,setSelectedLevel]=useState(0)
 const uploadRef=useRef<HTMLInputElement>(null),replaceRef=useRef<HTMLInputElement>(null)
 const workspaceLevel=workspaces.find(w=>w.id===workspace)?.level??0
 const selectedWorkspaceLevel=workspaces.find(w=>w.id===(selected??editorItem)?.workspace_id)?.level??0
 const canCreate=parent?parentLevel>=3:workspaceLevel>=3
 const creationWorkspace=parent?.workspace_id??workspace
 const refresh=()=>setVersion(v=>v+1)
 useEffect(()=>{
  let active=true
  setWorkspaces([]);setRecipients([]);setItems([]);setEditorItem(null);setSelected(null);setParent(null);setTrail([]);setLoading(true);setError(null)
  void supabase.rpc('cvoa_drive_directory').then(({data,error})=>{
   if(!active)return
   if(error){setError(error.message);setLoading(false);return}
   const ws=(data?.workspaces??[]) as DriveWorkspace[];setWorkspaces(ws);setRecipients(data?.recipients??[])
   const preferred=ws.find(w=>profile?.role==='state_commander'?w.kind==='state'&&w.state===profile.state:profile?.post_id?w.post_id===profile.post_id:w.kind==='national')
   setWorkspace(preferred?.id??ws[0]?.id??'');setView(ws.length?'files':'shared');refresh()
  });return()=>{active=false}
 },[profile?.id,profile?.role,profile?.state,profile?.post_id])
 useEffect(()=>{
  let active=true
  setLoading(true);setError(null);setItems([])
  void(async()=>{
   try{
    const fav=await supabase.from('cvoa_drive_favorites').select('item_id').eq('profile_id',profile?.id??'')
    if(fav.error)throw fav.error
    const ids=(fav.data??[]).map(f=>f.item_id)
    let rows:DriveItem[]=[]
    if(view==='shared'&&!parent){
     const shared=await readAllRows<DriveShare>(()=>{
      let q=supabase.from('cvoa_drive_shares').select('*').is('revoked_at',null).order('id')
      return workspace?q.or(`recipient_workspace_id.eq.${workspace},legacy_all_members.eq.true`):q.eq('legacy_all_members',true)
     })
     const sharedIds=[...new Set(shared.filter(s=>!s.expires_at||new Date(s.expires_at)>new Date()).map(s=>s.item_id))]
     if(sharedIds.length)rows=await readAllRows<DriveItem>(()=>supabase.from('cvoa_drive_items').select('id,workspace_id,parent_id,kind,name,storage_path,mime_type,file_size,version,stage,is_template,deleted_at,updated_at,created_at').in('id',sharedIds).is('deleted_at',null).order('id'))
    }else{
     rows=await readAllRows<DriveItem>(()=>{
      let q=supabase.from('cvoa_drive_items').select('id,workspace_id,parent_id,kind,name,storage_path,mime_type,file_size,version,stage,is_template,deleted_at,updated_at,created_at').order('id')
      if(parent)q=q.eq('parent_id',parent.id)
      else if(view==='files')q=q.eq('workspace_id',workspace).is('parent_id',null)
      else if(view==='trash')q=q.eq('workspace_id',workspace).not('deleted_at','is',null)
      else if(view==='templates')q=q.eq('is_template',true)
      else if(view==='starred')q=q.in('id',ids.length?ids:['00000000-0000-0000-0000-000000000000'])
      else if(view==='recent')q=q.eq('workspace_id',workspace)
      if(view!=='trash')q=q.is('deleted_at',null)
      return q
     })
    }
    // Hide children of trashed ancestors in flattened views.
    if(view!=='trash' && ['recent','starred','templates'].includes(view)){
     const live=await supabase.rpc('cvoa_drive_live_ids',{p_items:rows.map(i=>i.id)});if(live.error)throw live.error;const ids=new Set(live.data as string[]);rows=rows.filter(i=>ids.has(i.id))
    }
    rows.sort((a,b)=>view==='recent'?b.updated_at.localeCompare(a.updated_at):(a.kind==='folder'?-1:1)-(b.kind==='folder'?-1:1)||a.name.localeCompare(b.name))
    if(active){setItems(rows);setFavorites(ids)}
   }catch(e){if(active)setError((e as Error).message)}finally{if(active)setLoading(false)}
  })();return()=>{active=false}
 },[workspace,parent?.id,view,version,profile?.id,profile?.role,profile?.state,profile?.post_id])
 useEffect(()=>{
  if(!linkedItem||loading||openedLink.current===`${profile?.id}:${linkedItem}`)return
  openedLink.current=`${profile?.id}:${linkedItem}`
  let active=true
  void supabase.from('cvoa_drive_items').select('*').eq('id',linkedItem).is('deleted_at',null).single().then(({data,error})=>{
   if(!active)return
   if(error){setError('This linked document is unavailable or has not been shared with your workspace.');return}
   void open(data as DriveItem)
  })
  return()=>{active=false}
 },[linkedItem,loading,profile?.id])
 async function action(fn:()=>Promise<void>){if(busy)return;setBusy(true);setError(null);try{await fn();refresh()}catch(e){setError((e as Error).message)}finally{setBusy(false)}}
 async function create(kind:'folder'|'document'){
  const name=window.prompt(kind==='folder'?'Folder name':'Document title');if(!name?.trim())return
  await action(async()=>{
   const r=await supabase.rpc('cvoa_drive_create',{p_workspace:creationWorkspace,p_parent:parent?.id??null,p_kind:kind,p_name:name.trim(),p_content:kind==='document'?EMPTY_DOCUMENT:null})
   if(r.error)throw r.error
   if(kind==='document'){const item=await supabase.from('cvoa_drive_items').select('*').eq('id',r.data).single();if(item.error)throw item.error;setEditorItem(item.data as DriveItem);setEditorLevel(parent?parentLevel:workspaceLevel)}
  })
 }
 async function upload(e:ChangeEvent<HTMLInputElement>, replacement=false){
  const files=Array.from(e.target.files??[]);e.target.value='';if(!files.length)return
  await action(async()=>{
   for(const file of files){
    if(file.size>50*1024*1024)throw new Error('Choose files under 50 MB.')
    const id=replacement?selected!.id:crypto.randomUUID(),ws=replacement?selected!.workspace_id:creationWorkspace,path=driveBlobPath(ws,id,file.name,replacement?selected!.parent_id:parent?.id??null)
    const blob=await supabase.storage.from('ncc-drive').upload(path,file,{upsert:false,contentType:file.type||'application/octet-stream'});if(blob.error)throw blob.error
    const r=replacement?await supabase.rpc('cvoa_drive_replace_file',{p_item:id,p_version:selected!.version,p_path:path,p_mime:file.type,p_size:file.size}):await supabase.rpc('cvoa_drive_create',{p_workspace:ws,p_parent:parent?.id??null,p_kind:'file',p_name:file.name,p_path:path,p_mime:file.type,p_size:file.size,p_id:id})
    if(r.error)throw new Error(`Upload reached storage but could not be registered: ${r.error.message}. Retry with Refresh; the existing document was preserved.`)
   }
   if(replacement)setSelected(null)
  })
 }
 async function open(item:DriveItem){
  if(item.kind==='folder'){await action(async()=>{const r=await supabase.rpc('cvoa_drive_item_level',{p_item:item.id});if(r.error)throw r.error;setParentLevel(r.data);setParent(item);setTrail(t=>[...t,item]);setSearch('')});return}
  await action(async()=>{
   const level=await supabase.rpc('cvoa_drive_item_level',{p_item:item.id});if(level.error)throw level.error
   const fresh=await supabase.from('cvoa_drive_items').select('*').eq('id',item.id).single();if(fresh.error)throw fresh.error
   if(item.kind==='document'){setEditorLevel(level.data);setEditorItem(fresh.data as DriveItem);return}
   setSelected(fresh.data as DriveItem);setSelectedLevel(level.data);setUrl(null);await loadDetails(item)
   if(fresh.data.storage_path){const signed=await supabase.storage.from('ncc-drive').createSignedUrl(fresh.data.storage_path,300);if(signed.error)throw signed.error;setUrl(signed.data.signedUrl)}
  })
 }
 async function loadDetails(item:DriveItem){
  setShares([]);setHistory([]);setFolders([]);setRecipient('');setExpires('');setMoveTarget(item.parent_id??'')
  const [s,h,f]=await Promise.all([
   supabase.from('cvoa_drive_shares').select('*').eq('item_id',item.id).is('revoked_at',null),
   supabase.from('cvoa_drive_revisions').select('id,version,stage,created_at').eq('item_id',item.id).order('version',{ascending:false}).limit(50),
   supabase.from('cvoa_drive_items').select('id,name,workspace_id').eq('workspace_id',item.workspace_id).eq('kind','folder').is('deleted_at',null).order('name'),
  ]);for(const r of [s,h,f])if(r.error)throw r.error;setShares(s.data??[]);setHistory(h.data??[]);setFolders((f.data??[]) as DriveItem[])
 }
 async function details(item:DriveItem){await action(async()=>{const r=await supabase.rpc('cvoa_drive_item_level',{p_item:item.id});if(r.error)throw r.error;setSelectedLevel(r.data);setSelected(item);setUrl(null);await loadDetails(item)})}
 async function manage(item:DriveItem,which:string,name?:string,destination?:string){await action(async()=>{
  const r=await supabase.rpc('cvoa_drive_manage',{p_item:item.id,p_action:which,p_name:name??null,p_parent:destination||null});if(r.error)throw r.error;setSelected(null)
 })}
 async function star(item:DriveItem){await action(async()=>{const r=favorites.includes(item.id)?await supabase.from('cvoa_drive_favorites').delete().eq('item_id',item.id).eq('profile_id',profile?.id??''):await supabase.from('cvoa_drive_favorites').insert({item_id:item.id,profile_id:profile?.id});if(r.error)throw r.error})}
 async function share(){if(!selected||!recipient)return;await action(async()=>{
  const r=await supabase.rpc('cvoa_drive_share',{p_item:selected.id,p_recipient:recipient,p_permission:permission,p_expires:expires?new Date(`${expires}T23:59:59`).toISOString():null});if(r.error)throw r.error;await loadDetails(selected)
 })}
 async function copyTemplate(item:DriveItem){
  const destination=workspaces.find(w=>w.id===workspace&&w.level>=3)??workspaces.find(w=>w.level>=3)
  if(!destination){setError('An editable workspace is required to make a working copy.');return}
  const name=window.prompt(`Copy into ${destination.name}. New title:`,item.name+' — working copy');if(!name?.trim())return
  await action(async()=>{
   const source=await supabase.from('cvoa_drive_items').select('content').eq('id',item.id).single();if(source.error)throw source.error
   const r=await supabase.rpc('cvoa_drive_create',{p_workspace:destination.id,p_parent:null,p_kind:'document',p_name:name,p_content:source.data.content});if(r.error)throw r.error
   setWorkspace(destination.id);setParent(null);setTrail([]);setView('files')
  })
 }
 function changeView(v:View){setView(v);setParent(null);setTrail([]);setSearch('')}
 const visible=items.filter(i=>i.name.toLowerCase().includes(search.trim().toLowerCase()))
 if(editorItem)return <Suspense fallback={<p className="text-muted">Opening editor…</p>}><DocumentEditor key={editorItem.id} item={editorItem} level={editorLevel} workspaceLevel={selectedWorkspaceLevel} onClose={()=>{setEditorItem(null);refresh()}}/></Suspense>
 return <div>
  <PageHeader eyebrow="CVOA organizational workspaces" title="Documents & Files"/>
  <p className="text-sm text-muted mb-5">One place for National, state, and post records. Workspace appointments determine access; explicit shares grant access to selected items.</p>
  <div className="flex flex-wrap items-end gap-4 mb-5">{workspaces.length>0&&<label className="text-sm flex-1">Workspace<select className="input-field mt-1" value={workspace} onChange={e=>{setWorkspace(e.target.value);changeView('files')}}>{workspaces.map(w=><option key={w.id} value={w.id}>{w.name} · {w.level>=3?'Manage / edit':'Oversight · view'}</option>)}</select></label>}<button className="btn-ghost" disabled={busy} onClick={refresh}>Refresh</button></div>
  <nav aria-label="Document views" className="flex flex-wrap gap-2 mb-5">{(['files','shared','recent','starred','templates',...(workspaceLevel>=3?['trash']:[])] as View[]).filter(v=>workspaces.length||v==='shared'||v==='starred'||v==='templates').map(v=><button key={v} className={view===v?'btn-gold':'btn-ghost'} onClick={()=>changeView(v)}>{v==='shared'?'Shared with this workspace':v==='files'?'Workspace files':v[0].toUpperCase()+v.slice(1)}</button>)}</nav>
  <div className="flex flex-wrap justify-between gap-3 mb-4"><div className="flex flex-wrap items-center gap-2 text-sm"><button className="text-gold" onClick={()=>{setParent(null);setTrail([])}}>Root</button>{trail.map((f,n)=><button key={f.id} className="text-gold" onClick={()=>{setParent(f);setTrail(t=>t.slice(0,n+1))}}> / {f.name}</button>)}</div>{canCreate&&(view==='files'||(view==='shared'&&!!parent))&&<div className="flex flex-wrap gap-2"><button className="btn-ghost" disabled={busy} onClick={()=>void create('folder')}>New folder</button><button className="btn-gold" disabled={busy} onClick={()=>void create('document')}>New document</button><button className="btn-ghost flex gap-2 items-center" disabled={busy} onClick={()=>uploadRef.current?.click()}><Upload size={15}/>Upload files</button></div>}</div>
  <input ref={uploadRef} type="file" multiple className="hidden" onChange={e=>void upload(e)}/><input ref={replaceRef} type="file" className="hidden" onChange={e=>void upload(e,true)}/>
  <label className="block text-sm mb-4">Search this view<input className="input-field mt-1" value={search} onChange={e=>setSearch(e.target.value)} placeholder="File or folder name"/></label>
  <WorkspaceStatus loading={loading} error={error} retry={refresh}/>
  {view==='trash'&&<p className="text-sm text-muted mb-4">Recoverable trash. Files are retained until an authorized retention process removes them. Restore parent folders before their children.</p>}
  {!loading&&!visible.length&&!error&&<div className="panel p-6 text-muted">No items in this view.</div>}
  {!!visible.length&&<div className="panel overflow-x-auto"><table className="w-full text-sm"><thead><tr>{['Name','Status','Updated','Size','Actions'].map(h=><th key={h} className="table-head">{h}</th>)}</tr></thead><tbody>{visible.map(i=><tr key={i.id}><td className="table-cell"><div className="flex gap-2 items-center">{i.kind==='folder'?<Folder size={18}/>:<FileText size={18}/>}<button className="text-gold text-left hover:underline" disabled={busy||view==='trash'} onClick={()=>void open(i)}>{i.name}</button>{i.is_template&&<span className="text-xs text-muted">Template</span>}</div></td><td className="table-cell capitalize">{i.kind==='folder'?'Folder':i.stage}</td><td className="table-cell text-muted">{new Date(i.updated_at).toLocaleDateString()}</td><td className="table-cell text-muted">{i.kind==='document'?'Document':fileSize(i.file_size)}</td><td className="table-cell"><div className="flex flex-wrap gap-3">{view==='trash'?<button className="text-gold" disabled={busy} onClick={()=>void manage(i,'restore')}>Restore</button>:<><button aria-label={favorites.includes(i.id)?`Unstar ${i.name}`:`Star ${i.name}`} disabled={busy} onClick={()=>void star(i)}><Star size={16} className={favorites.includes(i.id)?'text-gold fill-current':'text-muted'}/></button><button className="text-gold" disabled={busy} onClick={()=>void details(i)}>Details &amp; sharing</button>{i.kind==='document'&&i.is_template&&<button className="text-gold" disabled={busy} onClick={()=>void copyTemplate(i)}>Use template</button>}</>}</div></td></tr>)}</tbody></table></div>}
  {isNational&&<p className="text-xs text-muted mt-5">Native documents edit here. Uploaded spreadsheets and presentations are stored and downloadable; full Office editing requires the embedded office service to be configured.</p>}
  {selected&&<Modal title={selected.name} onClose={()=>{setSelected(null);setUrl(null)}}>
   <p className="text-sm text-muted mb-3">{selectedLevel>=3?'Editor':selectedLevel>=2?'Commenter':'Viewer'} · Version {selected.version} · {selected.stage}</p>
   {url&&<><a className="btn-gold inline-block mb-4" href={url} target="_blank" rel="noopener noreferrer">Download file</a>{selected.mime_type?.startsWith('image/')?<img src={url} alt={selected.name} className="max-h-72 mx-auto"/>:selected.mime_type==='application/pdf'?<iframe sandbox="allow-same-origin" src={url} title={selected.name} className="w-full h-72"/>:<p className="text-sm text-muted">Download this file to view its original format.</p>}</>}
   {selected.kind==='file'&&selectedLevel>=3&&<button className="btn-ghost my-3" disabled={busy} onClick={()=>replaceRef.current?.click()}>Upload new version</button>}
   {selectedWorkspaceLevel>=3&&<><div className="border-t border-hairline mt-5 pt-4 flex flex-wrap gap-3"><button className="btn-ghost" disabled={busy} onClick={()=>{const name=window.prompt('New name',selected.name);if(name?.trim())void manage(selected,'rename',name)}}>Rename</button><button className="btn-ghost text-status-attention" disabled={busy} onClick={()=>{if(window.confirm(`Move ${selected.name} to recoverable trash? Folder contents will become unavailable until restored.`))void manage(selected,'trash')}}>Move to trash</button></div><label className="block text-sm mt-4">Move within workspace<select className="input-field mt-1" value={moveTarget} onChange={e=>setMoveTarget(e.target.value)}><option value="">Workspace root</option>{folders.filter(f=>f.id!==selected.id).map(f=><option key={f.id} value={f.id}>{f.name}</option>)}</select></label><button className="btn-ghost mt-2" disabled={busy||moveTarget===(selected.parent_id??'')} onClick={()=>void manage(selected,'move',undefined,moveTarget)}>Move item</button>
    <h3 className="font-display text-xl mt-6">Share with another workspace</h3><p className="text-xs text-muted mt-1">Folder access applies to everything inside it, including future files. Recipients inherit their workspace’s existing leadership oversight.</p><label className="block text-sm mt-3">Recipient<select className="input-field mt-1" value={recipient} onChange={e=>setRecipient(e.target.value)}><option value="">Choose workspace…</option>{recipients.filter(w=>w.id!==selected.workspace_id).map(w=><option key={w.id} value={w.id}>{w.name} · {w.kind}</option>)}</select></label><label className="block text-sm mt-3">Permission<select className="input-field mt-1" value={permission} onChange={e=>setPermission(e.target.value)}>{['view','comment','edit'].map(p=><option key={p} value={p}>{p}</option>)}</select></label><label className="block text-sm mt-3">Expiration (optional)<input className="input-field mt-1" type="date" value={expires} onChange={e=>setExpires(e.target.value)}/></label><button className="btn-gold mt-3" disabled={busy||!recipient} onClick={()=>{if(window.confirm(`Share ${selected.name} with ${recipients.find(w=>w.id===recipient)?.name} with ${permission} access${expires?` until ${expires}`:''}?`))void share()}}>Share item</button>
   </>}
   <h3 className="font-display text-xl mt-6">Explicit shares</h3>{!shares.length&&<p className="text-sm text-muted mt-2">No explicit shares. Default workspace and oversight permissions still apply.</p>}{shares.map(s=><div key={s.id} className="text-sm border-t border-hairline mt-3 pt-3"><p>{s.legacy_all_members?'Shared resources · all members':recipients.find(w=>w.id===s.recipient_workspace_id)?.name??'Recipient workspace'} · {s.permission}{s.expires_at?` · expires ${new Date(s.expires_at).toLocaleDateString()}`:''}</p>{selectedWorkspaceLevel>=3&&<button className="text-status-attention mt-2" disabled={busy} onClick={()=>{if(window.confirm('Revoke this explicit share? Default jurisdiction access will remain.'))void action(async()=>{const r=await supabase.rpc('cvoa_drive_revoke_share',{p_share:s.id});if(r.error)throw r.error;await loadDetails(selected)})}}>Revoke share</button>}</div>)}
   {selected.kind==='file'&&<><h3 className="font-display text-xl mt-6">Version history</h3>{history.map(h=><div key={h.id} className="text-sm border-t border-hairline mt-3 pt-3">Version {h.version} · {new Date(h.created_at).toLocaleString()}{selectedWorkspaceLevel>=3&&h.version!==selected.version&&<button className="block text-gold mt-2" disabled={busy} onClick={()=>{if(window.confirm(`Restore version ${h.version} as a new draft?`))void action(async()=>{const r=await supabase.rpc('cvoa_drive_restore_revision',{p_item:selected.id,p_revision:h.id,p_version:selected.version});if(r.error)throw r.error;setSelected(null)})}}>Restore version</button>}</div>)}</>}
  </Modal>}
 </div>
}
