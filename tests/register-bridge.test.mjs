import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import ts from 'typescript';
import {webcrypto} from 'node:crypto';
function fixture(){
 let handler;const calls=[],secret='register-integration-test-secret-123456';
 const db={rpc:async(name,args)=>{calls.push([name,args]);return {data:true}},auth:{getUser:async token=>({data:{user:token==='valid'?{id:'4a9a2286-a83b-4438-823a-bbb12c5f8727',email_confirmed_at:'2026-01-01'}:null}})}};
 const js=ts.transpileModule(fs.readFileSync('supabase/functions/register-access/index.ts','utf8').replace(/^import .*$/gm,''),{compilerOptions:{module:ts.ModuleKind.None,target:ts.ScriptTarget.ES2022}}).outputText;
 vm.runInNewContext(js,{Deno:{env:{get:name=>({REGISTER_INTEGRATION_SECRET:secret,REGISTER_SITE_URL:'https://cvoa-record.vercel.app'})[name]},serve:fn=>handler=fn},createClient:()=>db,crypto:webcrypto,TextEncoder,URL,Response,Date,console,nodemailer:{}});
 return {calls,secret,invoke:(body,headers={})=>handler(new Request('https://edge.test/register-access',{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(body)}))};
}
test('membership status requires the server bridge secret and never exposes the roster',async()=>{
 const f=fixture();assert.equal((await f.invoke({action:'status',profile:'4a9a2286-a83b-4438-823a-bbb12c5f8727'})).status,401);assert.equal(f.calls.length,0);
 const r=await f.invoke({action:'status',profile:'4a9a2286-a83b-4438-823a-bbb12c5f8727'},{'x-register-secret':f.secret});assert.deepEqual(await r.json(),{eligible:true});
});
test('member authorization requires a real CVOA login and uses only the configured callback',async()=>{
 const f=fixture(),body={action:'authorize',state:'s'.repeat(43),challenge:'a'.repeat(64),returnTo:'https://evil.example'};
 assert.equal((await f.invoke(body,{Origin:'https://evil.example',Authorization:'Bearer valid'})).status,403);
 assert.equal((await f.invoke(body,{Origin:'https://cvoa.one'})).status,503);
 const r=await f.invoke(body,{Origin:'https://cvoa.one',Authorization:'Bearer valid'}),data=await r.json();assert.equal(r.status,200);assert.equal(new URL(data.url).origin,'https://cvoa-record.vercel.app');assert.equal(new URL(data.url).pathname,'/api/access/member/callback');
 assert.ok(f.calls.some(([name])=>name==='cvoa_register_authorize'));
});
