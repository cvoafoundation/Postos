import {createClient} from 'npm:@supabase/supabase-js@2.45.4';
import nodemailer from 'npm:nodemailer@6.9.16';
const site=(Deno.env.get('REGISTER_SITE_URL')||'https://cvoa-record.vercel.app').replace(/\/$/,'');
const secret=Deno.env.get('REGISTER_INTEGRATION_SECRET')||'';
const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
const origins=['https://cvoa.one','https://www.cvoa.one'];
const hash=async(s:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)))).map(x=>x.toString(16).padStart(2,'0')).join('');
async function same(a:string,b:string){if(!b||b.length<32)return false;const x=await hash(a),y=await hash(b);let n=0;for(let i=0;i<x.length;i++)n|=x.charCodeAt(i)^y.charCodeAt(i);return n===0;}
async function rpc(name:string,args:Record<string,unknown>){const r=await db.rpc('cvoa_register_'+name,args);if(r.error)throw r.error;return r.data;}
async function actor(req:Request){const token=req.headers.get('authorization')?.replace(/^Bearer\s+/i,'');if(!token)throw Error('Sign in');const r=await db.auth.getUser(token);if(r.error||!r.data.user?.email_confirmed_at)throw Error('Sign in');return r.data.user.id;}
async function unsubscribeToken(profile:string){const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);return Array.from(new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode('unsubscribe:'+profile)))).map(x=>x.toString(16).padStart(2,'0')).join('');}
function transport(){const user=Deno.env.get('WORKSPACE_EMAIL'),pass=Deno.env.get('WORKSPACE_APP_PASSWORD');if(!user||!pass)throw Error('Email unavailable');return {user,smtp:nodemailer.createTransport({host:'smtp.gmail.com',port:465,secure:true,auth:{user,pass:pass.replace(/\s/g,'')},connectionTimeout:10000,greetingTimeout:10000,socketTimeout:15000})};}
Deno.serve(async(req)=>{
 const origin=req.headers.get('origin'),cors={...(origin&&origins.includes(origin)?{'Access-Control-Allow-Origin':origin}:{}),'Access-Control-Allow-Headers':'authorization,apikey,x-client-info,content-type','Access-Control-Allow-Methods':'POST,OPTIONS','Vary':'Origin'};
 if(req.method==='OPTIONS')return new Response('ok',{headers:cors});
 const unsubscribe=new URL(req.url).searchParams.get('unsubscribe'),proof=new URL(req.url).searchParams.get('proof')||'';
 if(unsubscribe&&['GET','POST'].includes(req.method)){
  if(!/^[a-f0-9-]{36}$/.test(unsubscribe)||!await same(proof,await unsubscribeToken(unsubscribe)))return new Response('Invalid unsubscribe link',{status:400});
  try{await rpc('unsubscribe',{p_profile:unsubscribe});return new Response('Register email updates are turned off. Manage subjects at https://cvoa.one/register.',{headers:{'Content-Type':'text/plain','Cache-Control':'no-store','Referrer-Policy':'no-referrer'}});}catch{return new Response('Please retry',{status:503});}
 }
 if(req.method!=='POST')return new Response('Use POST',{status:405,headers:cors});
 const reply=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers:{...cors,'Content-Type':'application/json','Cache-Control':'no-store'}});
 try{
 const raw=await req.text();if(raw.length>100000)return reply({error:'Request too large'},413);const body=JSON.parse(raw);
 if(body.action==='authorize'||body.action==='preferences'){
  if(!origin||!origins.includes(origin))return reply({error:'Open CVOA.ONE to continue'},403);
  const profile=await actor(req);if(!await rpc('eligible',{p_profile:profile}))return reply({error:'A current CVOA membership is required. Contact CVOA if your record needs correction.'},403);
  if(body.action==='preferences')return reply(await rpc('preferences',{p_profile:profile,...(typeof body.enabled==='boolean'?{p_enabled:body.enabled,p_topics:body.topics}:{})}));
  if(!/^[a-f0-9]{64}$/.test(body.challenge)||!/^[A-Za-z0-9_-]{32,64}$/.test(body.state))return reply({error:'Start sign-in from the Register'},400);
  const code=Array.from(crypto.getRandomValues(new Uint8Array(32))).map(x=>x.toString(16).padStart(2,'0')).join('');
  await rpc('authorize',{p_hash:await hash(code),p_profile:profile,p_challenge:body.challenge});
  const callback=new URL('/api/access/member/callback',site);callback.searchParams.set('code',code);callback.searchParams.set('state',body.state);return reply({url:callback.href});
 }
 if(!await same(req.headers.get('x-register-secret')||'',secret))return reply({error:'Unauthorized'},401);
 if(body.action==='exchange'){
  if(!/^[a-f0-9]{64}$/.test(body.code)||!/^[A-Za-z0-9_-]{43}$/.test(body.verifier))return reply({error:'Invalid code'},400);
  const profile=await rpc('exchange',{p_hash:await hash(body.code),p_challenge:await hash(body.verifier)});return reply({profile,eligible:true});
 }
 if(body.action==='status'){if(!/^[a-f0-9-]{36}$/.test(body.profile))return reply({error:'Invalid account'},400);return reply({eligible:await rpc('eligible',{p_profile:body.profile})});}
 if(body.action==='member_email'){if(typeof body.email!=='string'||body.email.length>254)throw Error('Invalid email');return reply({eligible:await rpc('member_email',{p_email:body.email})});}
 if(body.action==='queue'){
  if(Deno.env.get('REGISTER_UPDATES_ENABLED')!=='true')return reply({queued:0,disabled:true});
  if(!Array.isArray(body.items)||body.items.length>50)throw Error('Invalid batch');
  for(const item of body.items){const u=new URL(item.url);if(u.origin!==site||!/^\/(update|bill|archive)\//.test(u.pathname)||typeof item.title!=='string'||item.title.length>600||typeof item.summary!=='string'||item.summary.length>1200||typeof item.key!=='string'||item.key.length>240||!Number.isFinite(Date.parse(item.publishedAt))||Date.parse(item.publishedAt)>Date.now()+60000)throw Error('Invalid update');}
  return reply({queued:await rpc('queue',{p_items:body.items})});
 }
 if(body.action==='deliver'){
  if(Deno.env.get('REGISTER_UPDATES_ENABLED')!=='true')return reply({sent:0,disabled:true});
  let sent=0;
  for(let i=0;i<5;i++){
   const job=await rpc('claim_mail',{});if(!job)break;
   const {smtp,user}=transport();
   try{
    const link=new URL(req.url);link.search='';link.searchParams.set('unsubscribe',job.profile);link.searchParams.set('proof',await unsubscribeToken(job.profile));
    const text=job.items.map((item:any)=>`${item.title}\n${item.summary}\n${item.url}`).join('\n\n');
    await smtp.sendMail({from:`CVOA | The Veterans Register <${user}>`,to:job.email,messageId:`<register-${job.id}@combatvetsofamerica.org>`,subject:'Your Veterans Register updates',text:`New published records matching your subjects:\n\n${text}\n\nManage subjects: https://cvoa.one/register\nTurn off updates: ${link.href}\n\nCombat Veterans of America`,headers:{'List-Unsubscribe':`<${link.href}>`,'List-Unsubscribe-Post':'List-Unsubscribe=One-Click'}});
    await rpc('finish_mail',{p_id:job.id,p_lease:job.lease,p_success:true});sent++;
   }catch{await rpc('finish_mail',{p_id:job.id,p_lease:job.lease,p_success:false});throw Error('Delivery needs a retry');}finally{smtp.close();}
  }return reply({sent});
 }
 if(body.action==='send_code'){
  if(typeof body.email!=='string'||body.email.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email)||!/^\d{6}$/.test(body.code))return reply({error:'Invalid sign-in'},400);
  const from=Deno.env.get('WORKSPACE_EMAIL'),pass=Deno.env.get('WORKSPACE_APP_PASSWORD');if(!from||!pass)throw Error('Email unavailable');
  const smtp=nodemailer.createTransport({host:'smtp.gmail.com',port:465,secure:true,auth:{user:from,pass:pass.replace(/\s/g,'')},connectionTimeout:10000,greetingTimeout:10000,socketTimeout:15000});
  try{await smtp.sendMail({from:`CVOA | The Veterans Register <${from}>`,to:body.email,subject:'Your Veterans Register sign-in code',text:`Your sign-in code is ${body.code}. It expires in 10 minutes.\n\nIf you did not request this code, ignore this email. No subscription or payment has been started.\n\nCombat Veterans of America\n${site}`});}finally{smtp.close();}
  return reply({sent:true});
 }
 return reply({error:'Unknown action'},400);
 }catch{return reply({error:'The request could not be completed. Please retry.'},503);}
});
