import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const transpile=path=>ts.transpileModule(fs.readFileSync(path,'utf8').replace(/^import .*\n/gm,''),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText.replace(/export \{\};?\s*$/,'');
const edge=transpile('supabase/functions/create-sponsorship-checkout/index.ts');
const requestId='10000000-0000-0000-0000-000000009920';
function server({user=null,permission=false,key=true,status='open',kind='sponsorship',amount=4999}={}){
 let handler,creates=0,retrieves=0,fulfills=0,createArgs=null,rpcArgs=[];
 const Deno={env:{get:n=>n==='STRIPE_SECRET_KEY'?(key?'fake-key':undefined):n==='STRIPE_KEY'?undefined:n},serve:f=>handler=f};
 const session={id:'cs_test_receipt',url:'https://checkout.stripe.com/example',status,payment_status:status==='complete'?'paid':'unpaid',amount_total:amount,currency:'usd',payment_intent:'pi_example',metadata:{kind,sponsor_request_id:requestId},livemode:false,expires_at:1893456000};
 const Stripe=function(){return {checkout:{sessions:{create:async(args,opts)=>{creates++;createArgs={args,opts};return session;},retrieve:async()=>{retrieves++;return session;}}},paymentIntents:{retrieve:async()=>({latest_charge:{amount_refunded:0}})}}};
 const createClient=(_url,_key,options)=>{
  if(options)return {rpc:async(_name,args)=>({data:permission?{id:args.p_id,sponsor_id:args.p_sponsor,post_id:'post-example',amount_cents:Math.round(args.p_amount*100),status:'draft',session_id:null}:null,error:permission?null:{message:'Outside your post'}})};
  return {auth:{getUser:async()=>({data:{user},error:null})},rpc:async(name,args)=>{rpcArgs.push({name,args});if(name==='cvoa_fulfill_sponsor_payment')fulfills++;return {data:true,error:null};},from:table=>{
   const chain={select:()=>chain,eq:()=>chain,is:()=>chain,neq:()=>Promise.resolve({error:null}),update:()=>chain,single:async()=>({data:table==='sponsors'?{company:'Example sponsor'}:{id:requestId,session_id:'cs_test_receipt',status:'open'},error:null}),then:(resolve)=>resolve({data:[{id:requestId}],error:null})};return chain;
  }};
 };
 new Function('Deno','createClient','Stripe',edge)(Deno,createClient,Stripe);
 return {request:(body,method='POST',origin='https://www.cvoa.one')=>handler(new Request('https://edge.example.test',{method,headers:{Origin:origin,Authorization:'Bearer fake-token','Content-Type':'application/json'},...(method==='POST'?{body:JSON.stringify(body)}:{})})),counts:()=>({creates,retrieves,fulfills}),args:()=>({createArgs,rpcArgs})};
}
const createBody={action:'create',sponsor_id:'sponsor-example',amount:49.99,request_id:requestId};
test('Sponsorship checkout requires verified user and scoped permission before Stripe creation',async()=>{
 const anonymous=server();assert.equal((await anonymous.request(createBody)).status,401);assert.equal(anonymous.counts().creates,0);
 const outside=server({user:{id:'member'}});assert.equal((await outside.request(createBody)).status,403);assert.equal(outside.counts().creates,0);
});
test('Sponsorship checkout validates money, origin and configured Stripe credentials',async()=>{
 const app=server({user:{id:'member'},permission:true});assert.equal((await app.request({...createBody,amount:1.001})).status,400);assert.equal(app.counts().creates,0);
 assert.equal((await app.request(createBody,'POST','https://untrusted.example')).status,403);
 assert.equal((await app.request(createBody,'GET')).status,405);
 assert.equal((await app.request(createBody,'OPTIONS')).status,204);
 assert.equal((await server({key:false}).request(createBody)).status,503);
});
test('Sponsorship checkout uses persisted cents and a stable Stripe idempotency key',async()=>{
 const app=server({user:{id:'member'},permission:true});const r=await app.request(createBody);assert.equal(r.status,200);const data=await r.json();assert.equal(data.livemode,false);
 assert.equal(app.args().createArgs.args.line_items[0].price_data.unit_amount,4999);assert.equal(app.args().createArgs.opts.idempotencyKey,`cvoa-sponsor-${requestId}`);
 assert.equal(app.args().createArgs.args.metadata.kind,'sponsorship');assert.equal(app.counts().fulfills,0);
});
test('Receipt page cannot mark unpaid or unrelated Stripe sessions as received',async()=>{
 const unpaid=server();assert.equal((await (await unpaid.request({action:'status',session_id:'cs_test_receipt'})).json()).status,'pending');assert.equal(unpaid.counts().fulfills,0);
 const unrelated=server({status:'complete',kind:'other'});assert.equal((await unrelated.request({action:'status',session_id:'cs_test_receipt'})).status,404);assert.equal(unrelated.counts().fulfills,0);
 const malformed=server();assert.equal((await malformed.request({action:'status',session_id:'not-a-session'})).status,400);assert.equal(malformed.counts().retrieves,0);
});
test('Receipt fulfillment uses authoritative Stripe amount and payment intent',async()=>{
 const app=server({status:'complete'});const r=await app.request({action:'status',session_id:'cs_test_receipt',amount:1});assert.equal(r.status,200);const applied=app.args().rpcArgs.find(r=>r.name==='cvoa_fulfill_sponsor_payment');assert.equal(applied.args.p_amount,4999);assert.equal(applied.args.p_intent,'pi_example');assert.equal(applied.args.p_live,false);
});
const webhook=transpile('supabase/functions/stripe-webhook/index.ts');
function webhookServer({kind='sponsorship',paid=true,valid=true}={}){
 let handler,calls=[];const Deno={env:{get:n=>n},serve:f=>handler=f};
 const session={id:'cs_test_receipt',payment_status:paid?'paid':'unpaid',currency:'usd',amount_total:kind==='sponsorship'?4999:49999,payment_intent:'pi_example',livemode:false,metadata:kind==='sponsorship'?{kind,sponsor_request_id:requestId}:{member_id:'member',membership_type:'lifetime'}};
 const Stripe=function(){return {webhooks:{constructEventAsync:async()=>{if(!valid)throw Error('Signature invalid');return {type:'checkout.session.completed',id:'evt_example',created:1893456000,data:{object:session}};}}}};
 const createClient=()=>({from:()=>{const q={select:()=>q,eq:()=>q,single:async()=>({data:null,error:null})};return q;},rpc:async(name,args)=>{calls.push({name,args});return {data:name==='cvoa_claim_welcome_email'?'none':false,error:null};}});
 const nodemailer={createTransport:()=>({sendMail:async()=>{throw Error('Email is not expected in these tests');}})};
 new Function('Deno','createClient','Stripe','nodemailer',webhook)(Deno,createClient,Stripe,nodemailer);
 return {request:()=>handler(new Request('https://edge.example.test',{method:'POST',body:'{}',headers:{'stripe-signature':'test-signature'}})),calls:()=>calls};
}
test('Shared webhook verifies signatures and separates sponsorship from membership fulfillment',async()=>{
 const invalid=webhookServer({valid:false});assert.equal((await invalid.request()).status,400);assert.equal(invalid.calls().length,0);
 const sponsor=webhookServer();assert.equal((await sponsor.request()).status,200);assert.equal(sponsor.calls()[0].name,'cvoa_fulfill_sponsor_payment');
 const member=webhookServer({kind:'membership'});assert.equal((await member.request()).status,200);assert.equal(member.calls()[0].name,'cvoa_fulfill_membership');
 const unpaid=webhookServer({paid:false});assert.equal((await unpaid.request()).status,200);assert.equal(unpaid.calls().length,0);
});
const model=ts.transpileModule(fs.readFileSync('src/pages/sponsors/sponsorship.ts','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
const {calendarIcs,googleCalendarUrl}=await import(`data:text/javascript;base64,${Buffer.from(model).toString('base64')}`);
test('Sponsor calendars preserve time zones and escape event text without inviting anyone automatically',()=>{
 const sponsor={id:'example',company:'Example, Inc;\rInjected',meeting_start:'2030-01-02T09:00:00-05:00',meeting_end:'2030-01-02T10:00:00-05:00',meeting_with:'Manager',email:'manager@example.test',meeting_location:'Post headquarters'};
 const ics=calendarIcs(sponsor);assert.match(ics,/DTSTART:20300102T140000Z/);assert.match(ics,/DTEND:20300102T150000Z/);assert.ok(!ics.includes('\rInjected'));assert.ok(ics.includes('Example\\, Inc\\;\\nInjected'));assert.ok(!ics.includes('ATTENDEE'));
 assert.equal(new URL(googleCalendarUrl(sponsor)).searchParams.get('dates'),'20300102T140000Z/20300102T150000Z');
});
