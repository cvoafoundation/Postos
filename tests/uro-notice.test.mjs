import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const source=fs.readFileSync('supabase/functions/send-meeting-notice/index.ts','utf8').replace(/^import .*\n/gm,'');
const js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
function server({credentials=true,user=null,permissionError=null}={}){
 let handler,clients=0,sends=0;
 const Deno={env:{get:key=>key==='WORKSPACE_EMAIL'?(credentials?'sender@example.test':undefined):key==='WORKSPACE_APP_PASSWORD'?(credentials?'test-app-password':undefined):'test-key'},serve:fn=>{handler=fn}};
 const createClient=()=>{clients++;return {auth:{getUser:async()=>({data:{user},error:null})},rpc:async()=>({data:null,error:permissionError?{message:permissionError}:null})}};
 const nodemailer={createTransport:()=>({sendMail:async()=>{sends++;throw new Error('A real delivery must not be attempted in these boundary tests')}})};
 new Function('Deno','createClient','nodemailer',js.replace(/export \{\};?\s*$/,''))(Deno,createClient,nodemailer);
 return {request:(method='POST',origin='https://www.cvoa.one')=>handler(new Request('https://edge.example.test',{method,headers:{Origin:origin,'Content-Type':'application/json',Authorization:'Bearer test-token'},...(method==='POST'?{body:JSON.stringify({session_id:'test-meeting'})}:{})})),counts:()=>({clients,sends})};
}
test('Meeting notice requires a verified signed-in user before using service credentials',async()=>{const app=server(),r=await app.request();assert.equal(r.status,401);assert.deepEqual(app.counts(),{clients:1,sends:0})});
test('Meeting notice rejects callers without Chair or Secretary authority before service reads',async()=>{const app=server({user:{id:'ordinary-member'},permissionError:'Assigned Chair or Secretary required'}),r=await app.request();assert.equal(r.status,403);assert.deepEqual(app.counts(),{clients:1,sends:0})});
test('Meeting notice reports missing Workspace credentials without a dry-run success',async()=>{const app=server({credentials:false}),r=await app.request();assert.equal(r.status,503);assert.deepEqual(app.counts(),{clients:0,sends:0})});
test('Meeting notice rejects disallowed origins and unsupported methods',async()=>{const app=server();assert.equal((await app.request('POST','https://untrusted.example')).status,403);assert.equal((await app.request('GET')).status,405);assert.equal((await app.request('OPTIONS')).status,204);assert.deepEqual(app.counts(),{clients:0,sends:0})});
const model=ts.transpileModule(fs.readFileSync('src/pages/meetings/governance/model.ts','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
const {votesRequired,majorityQuorum}=await import(`data:text/javascript;base64,${Buffer.from(model).toString('base64')}`);
test('URO displayed thresholds agree with strict-majority and inclusive two-thirds arithmetic',()=>{for(let n=1;n<=100;n++){assert.equal(votesRequired(n,'majority'),Math.floor(n/2)+1);assert.equal(votesRequired(n,'two_thirds'),Math.ceil(2*n/3));assert.equal(majorityQuorum(n),Math.floor(n/2)+1)}assert.equal(votesRequired(0,'majority'),null);assert.equal(votesRequired(9,'two_thirds'),6);assert.equal(votesRequired(10,'majority'),6)});
