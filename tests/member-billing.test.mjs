import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {build} from 'esbuild'
import {createRequire} from 'node:module'
const require=createRequire(import.meta.url)
function fixture(){
 const state={mapping:null,members:[{id:'member',stripe_subscription_id:null}],payments:[],calls:[],suspended:false}
 const db={auth:{getUser:async token=>({data:{user:token==='valid'?{id:'owner',email:'same@example.test'}:null}})},rpc:async(name,args)=>{state.calls.push([name,args]);if(args.p_customer)state.mapping=args.p_customer;return {data:state.mapping}},from:table=>{const q={select:()=>q,eq:(key,value)=>{state.calls.push([table,key,value]);return q},is:()=>q,in:()=>q,order:()=>q,limit:()=>q,single:async()=>({data:{id:'owner',full_name:'Owner',access_suspended:state.suspended,deleted_at:null}}),then:(ok,fail)=>Promise.resolve({data:table==='members'?state.members:state.payments}).then(ok,fail)};return q}}
 const stripe={subscriptions:{retrieve:async()=>({customer:'cus_own',metadata:{member_id:'member'}})},checkout:{sessions:{retrieve:async()=>({customer:'cus_own',metadata:{member_id:'member'},payment_status:'paid'})}},customers:{create:async(data)=>{state.calls.push(['createCustomer',data]);return {id:'cus_new'}},retrieve:async()=>({id:'cus_own',metadata:{cvoa_profile_id:'owner'}})},billingPortal:{configurations:{list:async()=>({data:[{id:'config',active:true,metadata:{cvoa_settings:'v1'}}]})},sessions:{create:async data=>{state.calls.push(['portal',data]);return {url:'https://billing.stripe.com/p/session/own'}}}}}
 return {state,db,stripe}
}
test('billing uses only trusted membership ownership, never an email match or browser customer ID',async()=>{
 const file='tests/.member-billing-helper.cjs';await build({entryPoints:['supabase/functions/_shared/memberBilling.ts'],bundle:true,platform:'node',format:'cjs',outfile:file})
 try{const {memberBillingCustomer}=require(process.cwd()+'/'+file)
  const f=fixture();const id=await memberBillingCustomer(f.db,f.stripe,'owner','same@example.test','Owner');assert.equal(id,'cus_new');assert.ok(f.state.calls.some(c=>c[0]==='members'&&c[1]==='profile_id'&&c[2]==='owner'))
  const subscription=fixture();subscription.state.members[0].stripe_subscription_id='sub_own';assert.equal(await memberBillingCustomer(subscription.db,subscription.stripe,'owner'),'cus_own')
  const forged=fixture();forged.state.members[0].stripe_subscription_id='sub_other';forged.stripe.subscriptions.retrieve=async()=>({customer:'cus_victim',metadata:{member_id:'victim'}});await assert.rejects(memberBillingCustomer(forged.db,forged.stripe,'owner'),/ownership/)
  const payment=fixture();payment.state.payments=[{member_id:'member',stripe_checkout_session_id:'session_other'}];payment.stripe.checkout.sessions.retrieve=async()=>({customer:'cus_victim',metadata:{member_id:'victim'},payment_status:'paid'});await assert.rejects(memberBillingCustomer(payment.db,payment.stripe,'owner'),/ownership/)
 }finally{fs.unlinkSync(file)}
})
test('billing endpoint authenticates, ignores supplied account IDs, and refuses suspended accounts',async()=>{
 const file='tests/.member-billing-endpoint.cjs';const f=fixture();Object.assign(globalThis,{__billingFixture:f,Deno:{env:{get:()=> 'configured'},serve:handler=>{globalThis.__billingHandler=handler}}})
 await build({entryPoints:['supabase/functions/create-member-billing-portal/index.ts'],bundle:true,platform:'node',format:'cjs',outfile:file,plugins:[{name:'providers',setup(b){b.onResolve({filter:/^npm:/},a=>({path:a.path,namespace:'provider'}));b.onLoad({filter:/.*/,namespace:'provider'},a=>({contents:a.path.includes('supabase-js')?`export const createClient=()=>globalThis.__billingFixture.db;`:`export default class Stripe {constructor(){return globalThis.__billingFixture.stripe}}`,loader:'js'}))}}]})
 try{require(process.cwd()+'/'+file);const handler=globalThis.__billingHandler
  assert.equal((await handler(new Request('https://edge.test',{method:'POST'}))).status,401)
  const response=await handler(new Request('https://edge.test',{method:'POST',headers:{Authorization:'Bearer valid'},body:JSON.stringify({customer:'cus_victim',member_id:'victim',return_url:'https://evil.test'})}));assert.equal(response.status,200)
  const portal=f.state.calls.find(c=>c[0]==='portal')[1];assert.equal(portal.customer,'cus_new');assert.equal(portal.return_url,'https://cvoa.one/settings?billing=returned')
  f.state.suspended=true;assert.equal((await handler(new Request('https://edge.test',{method:'POST',headers:{Authorization:'Bearer valid'}}))).status,403)
 }finally{fs.unlinkSync(file);delete globalThis.Deno}
})
test('checkout keeps public signup safe and reuses saved billing only for the authenticated owner',async()=>{
 const file='tests/.member-checkout-endpoint.cjs',calls=[]
 let member={id:'membership',post_id:null,membership_type:'annual',membership_status:'pending_payment',profile_id:'victim',auto_renew:false,stripe_subscription_id:null}
 const db={auth:{getUser:async()=>({data:{user:{id:'owner'}}})},rpc:async name=>({data:name==='cvoa_service_authorized'?true:name==='cvoa_reserve_checkout'?{token:'reservation'}:'cus_owner'}),from:table=>{const q={select:()=>q,eq:()=>q,update:()=>q,insert:()=>q,single:async()=>({data:table==='members'?member:{member_id:member.id}}),then:(ok,fail)=>Promise.resolve({data:[],error:null}).then(ok,fail)};return q}}
 const stripe={checkout:{sessions:{create:async args=>{calls.push(args);return {id:'cs_test',url:'https://checkout.stripe.com/test'}}}}}
 Object.assign(globalThis,{__checkoutDb:db,__checkoutStripe:stripe,Deno:{env:{get:key=>key==='SITE_URL'?'https://cvoa.one':'configured'},serve:handler=>{globalThis.__checkoutHandler=handler}}})
 await build({entryPoints:['supabase/functions/create-membership-checkout/index.ts'],bundle:true,platform:'node',format:'cjs',outfile:file,plugins:[{name:'providers',setup(b){b.onResolve({filter:/^npm:/},a=>({path:a.path,namespace:'provider'}));b.onLoad({filter:/.*/,namespace:'provider'},a=>({contents:a.path.includes('supabase-js')?`export const createClient=()=>globalThis.__checkoutDb;`:`export default class Stripe {constructor(){return globalThis.__checkoutStripe}}`,loader:'js'}))}}]})
 const request=action=>new Request('https://edge.test',{method:'POST',headers:{Authorization:'Bearer valid'},body:JSON.stringify({member_id:'membership',post_id:null,membership_type:'annual',action,amount:0})})
 try{require(process.cwd()+'/'+file)
  assert.equal((await globalThis.__checkoutHandler(request('join'))).status,403);assert.equal(calls.length,0)
  member={...member,profile_id:null};assert.equal((await globalThis.__checkoutHandler(request('join'))).status,200);assert.equal(calls[0].customer,undefined);assert.equal(calls[0].customer_creation,'always');assert.equal(calls[0].line_items[0].price_data.unit_amount,4999)
  member={...member,profile_id:'owner',membership_status:'lapsed'};assert.equal((await globalThis.__checkoutHandler(request('join'))).status,409)
  assert.equal((await globalThis.__checkoutHandler(request('renew'))).status,200);assert.equal(calls[1].customer,'cus_owner');assert.equal(calls[1].line_items[0].price_data.unit_amount,4999)
 }finally{fs.unlinkSync(file);delete globalThis.Deno}
})
