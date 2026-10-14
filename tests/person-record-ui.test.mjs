import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { build } from 'esbuild'
import { JSDOM } from 'jsdom'
import { createRequire } from 'node:module'
test('connected record separates overview, permissions and history; previews respect membership-only access',async()=>{
 const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost/users'})
 Object.assign(globalThis,{window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,IS_REACT_ACT_ENVIRONMENT:true})
 const file='tests/.person-record-ui.cjs'
 await build({entryPoints:['src/components/access/PersonWorkspace.tsx','src/components/access/PermissionPreview.tsx'],bundle:true,platform:'node',format:'cjs',outdir:'tests/.person-record-build',outExtension:{'.js':'.cjs'},jsx:'automatic',external:['react','react-dom','react-dom/client','react-router-dom'],plugins:[{name:'fixtures',setup(b){b.onResolve({filter:/^@\/context\/AuthContext$|^@\/lib\/supabase$|^@\/lib\/workspaces$/},args=>({path:args.path,namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},args=>({loader:'js',contents:args.path.endsWith('AuthContext')?`export const useAuth=()=>({isNational:true,profile:{id:'national'}});`:args.path.endsWith('workspaces')?`export const useWorkspace=()=>({loading:false,refresh:()=>{},data:{profile:{id:'member',full_name:'Example Member',email:'member@example.org',role:'member',access_version:0},memberships:[{id:'membership',full_name:'Example Member',membership_status:'active',email:'member@example.org',membership_type:'lifetime'}],activation:{email_confirmed:true},scopes:[{scope_id:'primary',role:'member',source:'Account appointment'}],staff_records:[],payments:[],history:[{id:'audit',action:'account_permissions',reason:'Example access review',created_at:'2026-10-14',actor_name:'National'}]}});`:`export const supabase={rpc:async()=>({data:{enabled:true,eligible:true,version:0}})};`}))}}]})
 const React=await import('react'),{createRoot}=await import('react-dom/client'),{MemoryRouter}=await import('react-router-dom'),require=createRequire(import.meta.url)
 const Component=require(process.cwd()+'/tests/.person-record-build/PersonWorkspace.cjs').default
 const {permissionSummary}=require(process.cwd()+'/tests/.person-record-build/PermissionPreview.cjs')
 const root=createRoot(document.getElementById('root'))
 try{
 await React.act(async()=>root.render(React.createElement(MemoryRouter,{future:{v7_startTransition:true,v7_relativeSplatPath:true}},React.createElement(Component,{memberId:'membership',posts:[]}))))
 const button=label=>[...document.querySelectorAll('button')].find(b=>b.textContent===label)
 assert.equal(button('Overview').getAttribute('aria-pressed'),'true')
 assert.ok(document.querySelector('a[href="/members?highlight=membership&edit=true"]'))
 await React.act(async()=>button('Access').click())
 assert.equal(button('Access').getAttribute('aria-pressed'),'true')
 assert.match(document.body.textContent,/Existing Veterans Congress/)
 await React.act(async()=>button('History').click())
 assert.match(document.body.textContent,/Example access review/)
 const state=permissionSummary([{role:'state_commander',state:'IN'}]).join(' ');assert.match(state,/IN/);assert.doesNotMatch(state,/Organization-wide/)
 const limited=permissionSummary([{role:'national_staff'}],false,true).join(' ');assert.doesNotMatch(limited,/Organization-wide/);assert.match(limited,/personal ethics/)
 assert.match(permissionSummary([{role:'national_staff'}])[3],/separate Tribunal role/)
 }finally{await React.act(async()=>root.unmount());fs.rmSync('tests/.person-record-build',{recursive:true,force:true});dom.window.close()}
})
