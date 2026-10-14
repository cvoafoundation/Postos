import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { build } from 'esbuild'
import { JSDOM } from 'jsdom'
import { createRequire } from 'node:module'
test('membership sidebar has three neutral destinations, sign-out, and no staff tools', async () => {
 const dom = new JSDOM('<div id="root"></div>',{url:'http://localhost/my-membership'})
 Object.assign(globalThis,{window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,IS_REACT_ACT_ENVIRONMENT:true})
 const file='tests/.membership-access-ui.cjs'
 await build({entryPoints:['src/components/layout/Sidebar.tsx'],bundle:true,platform:'node',format:'cjs',outfile:file,jsx:'automatic',external:['react','react-dom','react-dom/client','react-router-dom'],plugins:[{name:'fixtures',setup(b){b.onResolve({filter:/^@\/context\/AuthContext$|^@\/lib\/supabase$|^@\/lib\/notifications$/},args=>({path:args.path,namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},args=>({loader:'js',contents:args.path.endsWith('AuthContext')?`export const useAuth=()=>({session:{user:{id:'member'}},profile:{id:'member',full_name:'Member Name',role:'member'},membershipOnly:true,isNational:false,scopes:[],selectedScope:'primary',signOut:()=>{globalThis.signedOut=true}});`:args.path.endsWith('notifications')?`export const useOnNotificationViewed=()=>{};`:`export const isDemoMode=false;export const supabase={rpc:async()=>({data:[]})};`}))}}]})
 const React=await import('react'),{createRoot}=await import('react-dom/client'),{MemoryRouter}=await import('react-router-dom')
 const {Sidebar}=createRequire(import.meta.url)(process.cwd()+'/'+file),root=createRoot(document.getElementById('root'))
 try {
 await React.act(async()=>root.render(React.createElement(MemoryRouter,{initialEntries:['/my-membership']},React.createElement(Sidebar,{isOpen:true,onClose:()=>{}}))))
 const links=[...document.querySelectorAll('a')]
 assert.deepEqual(links.map(l=>l.getAttribute('href')),['/my-membership','/congress','/file-complaint'])
 assert.deepEqual(links.map(l=>l.textContent.trim()),['Membership Card','Veterans Congress','Ethics Tribunal'])
 assert.doesNotMatch(document.body.textContent,/restrict|suspend|disciplin|penal/i)
 await React.act(async()=>[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Sign out')).click())
 assert.equal(globalThis.signedOut,true)
 } finally {await React.act(async()=>root.unmount());fs.unlinkSync(file);dom.window.close()}
})
test('direct route guard excludes modules outside the minimal workspace',async()=>{
 const file='tests/.membership-access-routes.cjs'
 await build({entryPoints:['src/lib/membershipAccess.ts'],bundle:true,platform:'node',format:'cjs',outfile:file})
 try {
 const {isMembershipPath}=createRequire(import.meta.url)(process.cwd()+'/'+file)
 for(const route of ['/my-membership','/file-complaint','/congress','/congress/delegates','/congress/resolutions/123'])assert.equal(isMembershipPath(route),true)
 for(const route of ['/','/settings','/members','/directory','/drive','/operations','/schedlr','/meetings','/ethics-tribunal','/users','/congress/calendar','/my-membership-extra','/congress/resolutions/123/edit'])assert.equal(isMembershipPath(route),false)
 } finally {fs.unlinkSync(file)}
})
