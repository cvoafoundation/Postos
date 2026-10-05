import { useEffect, useRef, useState } from 'react'
import { EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { TableKit } from '@tiptap/extension-table'
import TextAlign from '@tiptap/extension-text-align'
import { MeetingLetterhead } from './MeetingLetterhead'
import { printMeetingSheet, meetingFonts, meetingSheetCss } from '@/pages/meetings/governance/MeetingSheet'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'
import { downloadText, type DriveItem, type DriveRevision } from '@/lib/drive'

export default function DocumentEditor({ item, level, workspaceLevel, onClose }: { item: DriveItem; level: number; workspaceLevel: number; onClose: () => void }) {
 const { profile }=useAuth()
 const printableRef=useRef<HTMLDivElement>(null)
 const [version,setVersion]=useState(item.version),[stage,setStage]=useState(item.stage),[template,setTemplate]=useState(item.is_template)
 const [dirty,setDirty]=useState(false),[saving,setSaving]=useState(false),[error,setError]=useState<string|null>(null),[notice,setNotice]=useState('All changes saved')
 const [revisions,setRevisions]=useState<DriveRevision[]>([]),[comments,setComments]=useState<any[]>([]),[comment,setComment]=useState(''),[activity,setActivity]=useState<any[]>([])
 const [side,setSide]=useState<'comments'|'history'|'activity'>('comments'),[sideError,setSideError]=useState<string|null>(null)
 const versionRef=useRef(item.version),generation=useRef(0),saveInFlight=useRef(false),dirtyRef=useRef(false),errorRef=useRef<string|null>(null)
 const editable=level>=3 && stage!=='approved' && stage!=='superseded'
 const editor=useEditor({ extensions:[StarterKit,TableKit,MeetingLetterhead,TextAlign.configure({types:['heading','paragraph']})],content:item.content,editable,
   editorProps:{attributes:{class:'drive-document prose max-w-none min-h-[460px] p-6 focus:outline-none text-ink'}},
   onUpdate:()=>{generation.current++;dirtyRef.current=true;setDirty(true);setNotice('Unsaved changes')}
 })
 useEffect(()=>{editor?.setEditable(editable)},[editor,editable])
 useEffect(()=>{
  const beforeUnload=(e:BeforeUnloadEvent)=>{if(dirtyRef.current){e.preventDefault();e.returnValue=''}}
  window.addEventListener('beforeunload',beforeUnload);return()=>window.removeEventListener('beforeunload',beforeUnload)
 },[])
 async function loadSide() {
  setSideError(null)
  const results=await Promise.all([
   supabase.from('cvoa_drive_revisions').select('id,version,name,stage,created_at').eq('item_id',item.id).order('version',{ascending:false}).limit(50),
   supabase.from('cvoa_drive_comments').select('*').eq('item_id',item.id).order('created_at').limit(100),
   supabase.from('cvoa_drive_activity').select('id,action,detail,created_at').eq('item_id',item.id).order('created_at',{ascending:false}).limit(50),
  ])
  const failed=results.find(r=>r.error);if(failed?.error){setSideError(failed.error.message);return}
  setRevisions(results[0].data??[]);setComments(results[1].data??[]);setActivity(results[2].data??[])
 }
 useEffect(()=>{void loadSide()},[item.id])
 async function save() {
  if(!editor || saveInFlight.current || level<3)return
  saveInFlight.current=true;setSaving(true);setError(null)
  const savedGeneration=generation.current
  try {
   const result=await supabase.rpc('cvoa_drive_save',{p_item:item.id,p_version:versionRef.current,p_content:editor.getJSON(),p_stage:stage,p_template:template})
   if(result.error)throw result.error
   versionRef.current=result.data;setVersion(result.data);errorRef.current=null
   if(generation.current===savedGeneration){dirtyRef.current=false;setDirty(false);setNotice('All changes saved')} else setNotice('New changes waiting to save')
   void loadSide()
  }catch(e){const message=(e as Error).message;errorRef.current=message;setError(message);setNotice('Save failed · your draft remains open')}
  finally{saveInFlight.current=false;setSaving(false)}
 }
 useEffect(()=>{
  if(!dirty || !editable || error)return
  const timer=setTimeout(()=>{void save()},1500);return()=>clearTimeout(timer)
 },[dirty,stage,template,saving,error])
 async function restore(revision:DriveRevision) {
  if(workspaceLevel<3 || dirtyRef.current || !window.confirm(`Restore version ${revision.version} as a new draft?`))return
  setSaving(true);setError(null)
  try {
   const result=await supabase.rpc('cvoa_drive_restore_revision',{p_item:item.id,p_revision:revision.id,p_version:versionRef.current})
   if(result.error)throw result.error
   const fresh=await supabase.from('cvoa_drive_items').select('content').eq('id',item.id).single();if(fresh.error)throw fresh.error;
   editor?.commands.setContent(fresh.data.content,{emitUpdate:false});setStage('draft');versionRef.current=result.data;setVersion(result.data);setNotice('Revision restored as a new draft');void loadSide()
  }catch(e){setError((e as Error).message)}finally{setSaving(false)}
 }
 async function addComment() {
  if(!comment.trim() || level<2)return
  const r=await supabase.from('cvoa_drive_comments').insert({item_id:item.id,author_id:profile?.id,body:comment.trim()})
  if(r.error){setSideError(r.error.message);return}setComment('');void loadSide()
 }
 function metadata(nextStage:DriveItem['stage'], nextTemplate:boolean){setStage(nextStage);setTemplate(nextTemplate);generation.current++;dirtyRef.current=true;setDirty(true);setError(null)}
 function close(){if(saveInFlight.current){setError('Wait for the current save to finish.');return}if(dirtyRef.current && !window.confirm('Leave with unsaved changes?'))return;onClose()}
 if(!editor)return <p className="text-muted">Opening document…</p>
 const command=(label:string,run:()=>void,active=false)=><button key={label} className={active?'btn-gold text-xs':'btn-ghost text-xs'} disabled={!editable} onClick={run}>{label}</button>
 return <div>
  <div className="flex flex-wrap justify-between items-start gap-4 mb-5"><div><h1 className="font-display text-3xl">{item.name}</h1><p className="text-xs text-muted mt-1">Version {version} · {saving?'Saving…':notice} · {level>=3?'Editor':level>=2?'Commenter':'Viewer'}</p></div><div className="flex flex-wrap gap-2"><button className="btn-ghost" onClick={()=>downloadText(`${item.name}.html`,`<!doctype html><html><head><meta charset="utf-8"><title>${item.name.replace(/[<>&]/g,'')}</title><link rel="stylesheet" href="${meetingFonts}"><style>${meetingSheetCss}</style></head><body>${editor.getHTML()}</body></html>`,'text/html')}>Export HTML</button><button className="btn-ghost" onClick={()=>{try{if(printableRef.current)printMeetingSheet(printableRef.current,item.name)}catch(e){setError((e as Error).message)}}}>Print / PDF</button>{level>=3 && <button className="btn-gold" disabled={saving || !dirty} onClick={()=>void save()}>Save</button>}<button className="btn-ghost" onClick={close}>Back to files</button></div></div>
  {error && <div role="alert" className="panel p-4 border-status-attention text-status-attention mb-4"><p>{error}</p><div className="flex gap-3 mt-3"><button className="btn-ghost" onClick={()=>downloadText(`${item.name}-draft.json`,JSON.stringify(editor.getJSON(),null,2),'application/json')}>Download my draft</button><button className="btn-ghost" onClick={()=>{if(window.confirm('Reload the saved document? Download your draft first to preserve unsaved work.'))onClose()}}>Reload saved version</button></div></div>}
  {workspaceLevel>=3 && <div className="flex gap-4 flex-wrap items-center mb-4"><label className="text-sm">Document status<select className="input-field mt-1" value={stage} disabled={saving} onChange={e=>metadata(e.target.value as DriveItem['stage'],template)}>{['draft','review',...(workspaceLevel>=4||stage==='approved'?['approved']:[]),'superseded'].map(s=><option key={s} value={s}>{s}</option>)}</select></label><label className="text-sm flex gap-2 items-center"><input type="checkbox" checked={template} disabled={saving} onChange={e=>metadata(stage,e.target.checked)}/>Reusable template</label><p className="text-xs text-muted">Approved and superseded documents are read-only. Reopen as a draft before editing.</p></div>}
  <div className="grid xl:grid-cols-[1fr_300px] gap-4"><div className="panel overflow-hidden">
   <div className="flex flex-wrap gap-1 border-b border-hairline p-3">
    {command('Bold',()=>editor.chain().focus().toggleBold().run(),editor.isActive('bold'))}{command('Italic',()=>editor.chain().focus().toggleItalic().run(),editor.isActive('italic'))}
    {command('Heading',()=>editor.chain().focus().toggleHeading({level:2}).run(),editor.isActive('heading'))}{command('Bullets',()=>editor.chain().focus().toggleBulletList().run(),editor.isActive('bulletList'))}{command('Numbered list',()=>editor.chain().focus().toggleOrderedList().run())}
    {command('Quote',()=>editor.chain().focus().toggleBlockquote().run())}{command('Link',()=>{const url=window.prompt('Link URL (https://…)');if(url && /^https?:\/\//i.test(url))editor.chain().focus().setLink({href:url}).run()})}
    {command('Table',()=>editor.chain().focus().insertTable({rows:3,cols:3,withHeaderRow:true}).run())}{command('+ Row',()=>editor.chain().focus().addRowAfter().run())}{command('+ Column',()=>editor.chain().focus().addColumnAfter().run())}{command('Remove table',()=>editor.chain().focus().deleteTable().run())}
    {command('Left',()=>editor.chain().focus().setTextAlign('left').run())}{command('Center',()=>editor.chain().focus().setTextAlign('center').run())}{command('Undo',()=>editor.chain().focus().undo().run())}{command('Redo',()=>editor.chain().focus().redo().run())}
   </div><div ref={printableRef} className="drive-print-area"><EditorContent editor={editor}/></div>
  </div><aside className="panel p-4"><div className="flex flex-wrap gap-2 mb-4">{(['comments','history','activity'] as const).map(s=><button key={s} className={side===s?'text-gold text-sm':'text-muted text-sm'} onClick={()=>setSide(s)}>{s}</button>)}</div>{sideError&&<p role="alert" className="text-status-attention text-sm">{sideError}</p>}
   {side==='comments' && <><p className="text-xs text-muted mb-3">Comments are visible to everyone with access to this document.</p>{comments.map(c=><div key={c.id} className="border-b border-hairline py-3"><p className="text-xs text-muted">{new Date(c.created_at).toLocaleString()}</p><p className="text-sm whitespace-pre-wrap mt-1">{c.body}</p></div>)}{level>=2&&<><textarea aria-label="Add comment" className="input-field mt-3" maxLength={3000} value={comment} onChange={e=>setComment(e.target.value)}/><button className="btn-ghost mt-2" disabled={!comment.trim()} onClick={()=>void addComment()}>Add comment</button></>}</>}
   {side==='history' && <><p className="text-xs text-muted mb-3">Latest 50 revisions. Restoring creates a new draft and preserves prior versions.</p>{revisions.map(r=><div key={r.id} className="border-b border-hairline py-3 text-sm"><p>Version {r.version} · {r.stage}</p><p className="text-xs text-muted">{new Date(r.created_at).toLocaleString()}</p>{workspaceLevel>=3&&r.version!==version&&<button className="text-gold mt-2" disabled={saving||dirty} onClick={()=>void restore(r)}>Restore as draft</button>}</div>)}</>}
   {side==='activity' && activity.map(a=><p key={a.id} className="text-sm border-b border-hairline py-3">{a.action.replaceAll('_',' ')}<span className="text-xs text-muted block">{new Date(a.created_at).toLocaleString()}</span></p>)}
  </aside></div>
 </div>
}
