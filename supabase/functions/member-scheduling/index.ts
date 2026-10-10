import { createClient } from 'npm:@supabase/supabase-js@2.57.4';
import nodemailer from 'npm:nodemailer@6.9.16';
import { prepareMail } from './mail.js';
const origins = new Set(['https://cvoa.one','https://www.cvoa.one','https://schdlr-m54.vercel.app']);
const url=Deno.env.get('SUPABASE_URL')!,key=Deno.env.get('SUPABASE_ANON_KEY')!;
const admin=()=>createClient(url,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}});
const fields='id,title,starts_at,ends_at,location,description,attendee_emails,status,version,organizer_id';
function transport() {
 const email=Deno.env.get('WORKSPACE_EMAIL'),password=Deno.env.get('WORKSPACE_APP_PASSWORD');
 if(!email || !password) throw new Error('Email unavailable');
 return {email,smtp:nodemailer.createTransport({host:'smtp.gmail.com',port:465,secure:true,auth:{user:email,pass:password.replace(/\s/g,'')},connectionTimeout:10000,greetingTimeout:10000,socketTimeout:15000})};
}
async function deliver() {
 const db=admin(),{email,smtp}=transport();
 const claimed=await db.rpc('schedlr_claim_personal_deliveries');
 if(claimed.error) throw new Error('Delivery unavailable');
 let sent=0;
 for(const job of claimed.data || []) {
  const current=await db.from('schedlr_personal_meetings').select('version,status').eq('id',job.meeting_id).single();
  if(current.error || current.data.version!==job.version || (job.event.startsWith('reminder') && current.data.status!=='scheduled')) {
   await db.from('schedlr_personal_deliveries').update({state:'superseded'}).eq('id',job.id);continue;
  }
  try {
   await smtp.sendMail(prepareMail(job,email));
   const recorded=await db.from('schedlr_personal_deliveries').update({state:'sent',sent_at:new Date().toISOString()}).eq('id',job.id).eq('claimed_at',job.claimed_at);
   if(recorded.error) throw new Error('Recording unavailable');
   sent++;
  } catch {
   await db.from('schedlr_personal_deliveries').update({state:'failed',due_at:new Date(Date.now()+Math.min(60,2**job.attempts)*60000).toISOString()}).eq('id',job.id).eq('claimed_at',job.claimed_at);
  }
 }
 return sent;
}
Deno.serve(async req=>{
 const origin=req.headers.get('Origin') || '';
 const headers={'Content-Type':'application/json','Cache-Control':'no-store','Vary':'Origin',...(origins.has(origin)?{'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info','Access-Control-Allow-Methods':'POST,OPTIONS'}:{})};
 const reply=(status:number,data:unknown)=>new Response(JSON.stringify(data),{status,headers});
 if(origin && !origins.has(origin)) return reply(403,{error:'Origin not allowed'});
 if(req.method==='OPTIONS') return new Response(null,{status:204,headers});
 if(req.method!=='POST') return reply(405,{error:'POST required'});
 try {
  const worker=req.headers.get('x-scheduler-secret');
  if(worker) {
   const checked=await admin().rpc('schedlr_verify_worker',{p_secret:worker});
   if(checked.error || checked.data!==true) return reply(401,{error:'Worker authentication required'});
   const body=await req.json();
   if(body.action==='verify-email') {await transport().smtp.verify();return reply(200,{email_transport:'verified'});}
   return reply(200,{sent:await deliver()});
  }
  const token=req.headers.get('Authorization')?.match(/^Bearer (\S+)$/i)?.[1];
  if(!token) return reply(401,{error:'CVOA sign-in required'});
  const caller=createClient(url,key,{global:{headers:{Authorization:`Bearer ${token}`}},auth:{persistSession:false,autoRefreshToken:false}});
  const identity=await caller.auth.getUser(token);
  if(identity.error || !identity.data.user) return reply(401,{error:'CVOA session expired. Sign in again.'});
  const profile=await caller.from('profiles').select('id,access_suspended,deleted_at').eq('id',identity.data.user.id).single();
  if(profile.error || profile.data.access_suspended || profile.data.deleted_at) return reply(403,{error:'Active CVOA account required'});
  const body=await req.json();
  if(body.action==='list') {
   const meetings=await caller.from('schedlr_personal_meetings').select(fields).eq('organizer_id',identity.data.user.id).order('starts_at',{ascending:false}).limit(200);
   if(meetings.error) return reply(503,{error:'Could not load your meetings'});
   const notices=await caller.from('schedlr_personal_deliveries').select('meeting_id,version,event,state').in('meeting_id',meetings.data.map(m=>m.id)).not('event','like','reminder%');
   return reply(200,{meetings:meetings.data,deliveries:notices.data || []});
  }
  if(!['create','update','cancel','complete'].includes(body.action)) return reply(400,{error:'Unknown scheduling action'});
  const values:any={};
  if(['create','update'].includes(body.action)) {
   if(typeof body.title!=='string' || typeof body.starts_at!=='string' || typeof body.ends_at!=='string' || !Array.isArray(body.attendee_emails) || body.attendee_emails.length>20) return reply(400,{error:'Enter a title, meeting times, and up to 20 attendee email addresses'});
   Object.assign(values,{title:body.title.trim(),starts_at:body.starts_at,ends_at:body.ends_at,location:String(body.location || ''),description:String(body.description || ''),attendee_emails:[...new Set(body.attendee_emails.map((e:unknown)=>String(e).trim().toLowerCase()))],status:'scheduled'});
  } else values.status=body.action==='cancel'?'cancelled':'completed';
  let result;
  if(body.action==='create') result=await caller.from('schedlr_personal_meetings').insert({...values,organizer_id:identity.data.user.id}).select(fields).single();
  else {
   if(typeof body.id!=='string' || !Number.isInteger(body.version)) return reply(400,{error:'Meeting and current version required'});
   result=await caller.from('schedlr_personal_meetings').update(values).eq('id',body.id).eq('organizer_id',identity.data.user.id).eq('version',body.version).select(fields).maybeSingle();
  }
  if(result.error) return reply(400,{error:result.error.message.includes('exception')?result.error.message:'Could not save. Check future meeting times and attendee email addresses.'});
  if(!result.data) return reply(409,{error:'Meeting changed or is unavailable. Refresh before editing.'});
  // Notifications are durably queued by the same transaction as the meeting.
  return reply(200,{meeting:result.data,email_status:'queued'});
 } catch { return reply(503,{error:'Scheduling is temporarily unavailable. Please retry.'}); }
});
