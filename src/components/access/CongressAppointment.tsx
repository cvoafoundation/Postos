import {useEffect,useState} from 'react'
import {Link} from 'react-router-dom'
import {supabase} from '@/lib/supabase'
type Appointment={id:string;post_id:string;post_name:string;state:string;is_alternate:boolean;term_start:string|null;term_end:string|null;active:boolean;ended:boolean}
type RecordData={version:number;eligible:boolean;appointments:Appointment[];posts:{id:string;name:string;state:string}[]}
const today=()=>new Date().toLocaleDateString('en-CA')
export default function CongressAppointment({profileId,onChanged}:{profileId:string;onChanged:()=>void}){
 const [allowed,setAllowed]=useState(false),[data,setData]=useState<RecordData|null>(null),[error,setError]=useState<string|null>(null),[busy,setBusy]=useState(false),[review,setReview]=useState(false),[message,setMessage]=useState<string|null>(null)
 const [participates,setParticipates]=useState(false)
 const [form,setForm]=useState({id:'',post:'',alternate:false,start:today(),end:'',reason:''})
 useEffect(()=>{let active=true;setAllowed(false);setData(null);void(async()=>{try{const access=await supabase.rpc('cvoa_congress_admin_access');if(!active||access.error||access.data!==true)return;setAllowed(true);const result=await supabase.rpc('cvoa_person_congress',{p_profile:profileId});if(active){setData(result.data);setParticipates(result.data?.appointments.some((a:Appointment)=>!a.ended)??false);setError(result.error?.message??null)}}catch{if(active)setError('Could not load Congress appointments. Reopen this record to retry.')}})();return()=>{active=false}},[profileId])
 function change<K extends keyof typeof form>(key:K,value:typeof form[K]){setForm(f=>({...f,[key]:value}));setReview(false);setError(null)}
 async function submit(endId?:string){
  if(!data||busy)return
  if(form.reason.trim().length<5){setError('Enter the appointment authority or reason (at least five characters).');return}
  if(!endId&&!review){setReview(true);return}
  if(endId&&!window.confirm('End this Congress appointment now? Its history and prior votes will be preserved.'))return
  setBusy(true);setError(null);setMessage(null)
  try{const result=!participates&&!endId?await supabase.rpc('cvoa_clear_congress_appointments',{p_profile:profileId,p_version:data.version,p_reason:form.reason.trim()}):endId?await supabase.rpc('cvoa_end_congress_appointment',{p_profile:profileId,p_id:endId,p_version:data.version,p_reason:form.reason.trim()}):await supabase.rpc('cvoa_save_congress_appointment',{p_profile:profileId,p_id:form.id||null,p_post:form.post,p_alternate:form.alternate,p_start:form.start,p_end:form.end||null,p_reason:form.reason.trim(),p_version:data.version});if(result.error)throw result.error;setData(result.data);setParticipates(result.data.appointments.some((a:Appointment)=>!a.ended));setReview(false);setForm({id:'',post:'',alternate:false,start:today(),end:'',reason:''});setMessage(endId?'Congress appointment ended.':!participates?'Not in Veterans Congress. Previous appointments remain in history.':'Congress appointment saved.');onChanged()}catch(e){setError((e as {message?:string}).message??'Could not save the appointment.');const fresh=await supabase.rpc('cvoa_person_congress',{p_profile:profileId});if(!fresh.error)setData(fresh.data)}finally{setBusy(false)}
 }
 if(!allowed)return null
 return <section className="panel p-5 space-y-4">
  <div><h3 className="font-display text-xl">Veterans Congress</h3><p className="text-xs text-muted mt-2">NCC appointment control. Choose the company this person represents. Membership affiliation and existing staff appointments remain separate. Primary delegates receive formal voting eligibility while their designation is active; alternates receive Congress visibility.</p></div>
  {!data&&!error&&<p role="status">Loading appointments…</p>}
  {data&&<>
   <label className="block text-sm">Congress membership<select aria-label="Congress membership" className="input-field mt-2" disabled={busy} value={participates?'delegate':'none'} onChange={e=>{setParticipates(e.target.value==='delegate');setReview(false);setError(null)}}><option value="none">Not in Veterans Congress</option><option value="delegate">Veterans Congress delegate</option></select></label>
   <Link to="/congress/delegates" className="text-gold text-sm inline-block">View Congress delegate directory →</Link>
   <ul className="space-y-4">{data.appointments.map(a=><li key={a.id} className="border-b border-hairline pb-3 text-sm"><p>{a.post_name} · {a.state}</p><p className="text-muted">{a.is_alternate?'Alternate':'Primary delegate'} · {a.active?'Active':a.ended?'Ended':'Upcoming'} · {a.term_start??'Start not recorded'} to {a.term_end??'Open term'}</p>{!a.ended&&<div className="flex gap-4 mt-2"><button type="button" disabled={busy} className="text-gold" onClick={()=>{setParticipates(true);setForm({id:a.id,post:a.post_id,alternate:a.is_alternate,start:a.term_start??today(),end:a.term_end??'',reason:''});setReview(false)}}>Edit appointment</button><button type="button" disabled={busy} className="text-muted" onClick={()=>submit(a.id)}>End appointment</button></div>}</li>)}</ul>
   {!data.appointments.length&&<p className="text-sm text-muted">No Congress appointment recorded.</p>}
   {(data.eligible||!participates)?<form className="space-y-4" onSubmit={e=>{e.preventDefault();void submit()}}>
    {participates&&<>
    <label className="block text-sm">Represented company<select required disabled={busy} className="input-field mt-2" value={form.post} onChange={e=>change('post',e.target.value)}><option value="">Choose a company…</option>{data.posts.map(p=><option key={p.id} value={p.id}>{p.name} · {p.state}</option>)}</select></label>
    <label className="block text-sm">Seat<select className="input-field mt-2" disabled={busy} value={form.alternate?'alternate':'primary'} onChange={e=>change('alternate',e.target.value==='alternate')}><option value="primary">Primary delegate</option><option value="alternate">Alternate</option></select></label>
    <details><summary className="text-sm text-muted cursor-pointer">Term dates</summary><div className="grid sm:grid-cols-2 gap-4 mt-3"><label className="text-sm">Start<input type="date" required className="input-field mt-2" value={form.start} disabled={busy} onChange={e=>change('start',e.target.value)}/></label><label className="text-sm">End (optional)<input type="date" className="input-field mt-2" min={form.start} value={form.end} disabled={busy} onChange={e=>change('end',e.target.value)}/></label></div></details>
    </>}
    <label className="block text-sm">Appointment authority / reason<textarea required minLength={5} maxLength={1000} className="input-field mt-2" value={form.reason} disabled={busy} onChange={e=>change('reason',e.target.value)}/></label>
    {review&&!participates&&<p className="text-sm bg-surface p-4">Confirm this person is not in Veterans Congress. All current and scheduled Congress appointments will end. History and prior votes are preserved.</p>}
    {review&&participates&&<p className="text-sm bg-surface p-4">Confirm {form.alternate?'alternate':'primary delegate'} representation for {data.posts.find(p=>p.id===form.post)?.name}, beginning {form.start}{form.end?` through ${form.end}`:', with no end date'}. Existing membership affiliation will be preserved.</p>}
    <div className="flex flex-wrap gap-3"><button className="btn-gold" disabled={busy}>{busy?'Saving…':review?'Confirm changes':!participates?'Save as not in Congress':form.id?'Review changes':'Review appointment'}</button>{form.id&&<button type="button" disabled={busy} className="btn-ghost" onClick={()=>{setForm({id:'',post:'',alternate:false,start:today(),end:'',reason:''});setReview(false)}}>New appointment</button>}</div>
   </form>:<p className="text-sm text-muted">An active linked membership is required before adding an appointment. Existing appointments can be ended using a reason below.</p>}
   {!data.eligible&&data.appointments.some(a=>!a.ended)&&<label className="block text-sm">Reason for ending an appointment<textarea className="input-field mt-2" value={form.reason} onChange={e=>change('reason',e.target.value)} maxLength={1000}/></label>}
  </>}
  {message&&<p role="status" className="text-status-active text-sm">{message}</p>}{error&&<p role="alert" className="text-status-attention text-sm">{error}</p>}
 </section>
}
