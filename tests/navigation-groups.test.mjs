import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { build } from 'esbuild'
import { JSDOM } from 'jsdom'
import { createRequire } from 'node:module'
test('sidebar groups preserve role filtering, active routes and unread badges',async()=>{
 const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost/users'})
 Object.assign(globalThis,{window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,IS_REACT_ACT_ENVIRONMENT:true,__navRole:'national_commander'})
 const file='tests/.navigation-ui.cjs'
 await build({entryPoints:['src/components/layout/Sidebar.tsx'],bundle:true,platform:'node',format:'cjs',outfile:file,jsx:'automatic',external:['react','react-dom','react-dom/client','react-router-dom'],plugins:[{name:'fixtures',setup(b){b.onResolve({filter:/^@\/context\/AuthContext$|^@\/lib\/supabase$|^@\/lib\/notifications$/},args=>({path:args.path,namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},args=>({loader:'js',contents:args.path.endsWith('AuthContext')?`export const useAuth=()=>({session:{user:{id:globalThis.__navRole}},profile:{id:'person',full_name:'Name',role:globalThis.__navRole,post_id:'post-1'},isNational:globalThis.__navRole==='national_commander',membershipOnly:false,scopes:[],selectedScope:'primary',signOut:()=>{}});`:args.path.endsWith('notifications')?`export const useOnNotificationViewed=()=>{};`:`export const isDemoMode=true;export const supabase={rpc:async()=>({data:[{section:'membership_roster',unseen_count:3},{section:'applications',unseen_count:2}]})};`}))}}]})
 const React=await import('react'),{createRoot}=await import('react-dom/client'),{MemoryRouter}=await import('react-router-dom')
 const {Sidebar}=createRequire(import.meta.url)(process.cwd()+'/'+file),root=createRoot(document.getElementById('root'))
 const render=()=>root.render(React.createElement(MemoryRouter,{initialEntries:['/users'],future:{v7_startTransition:true,v7_relativeSplatPath:true}},React.createElement(Sidebar,{isOpen:true,onClose:()=>{}})))
 try{
 await React.act(async()=>render())
 const group=document.querySelector('[aria-controls="nav-people"]');assert.equal(group.getAttribute('aria-expanded'),'true')
 const links=[...document.querySelectorAll('nav a')].map(a=>a.getAttribute('href'))
 assert.equal(links.length,new Set(links).size)
 for(const path of ['/','/operations','/users','/members','/membership-review','/applications','/vetting','/state','/health','/post-development','/meetings','/schedlr','/congress','/sponsors','/drive','/my-membership','/file-complaint']) assert.ok(links.includes(path),path)
 assert.equal(links.includes('/ethics-tribunal'),false)
 await React.act(async()=>group.click())
 assert.equal(document.getElementById('nav-people').hidden,true);assert.match(group.textContent,/3/)
 const posts=document.querySelector('[aria-controls="nav-posts"]');assert.match(posts.textContent,/2/)
 const users=[...document.querySelectorAll('nav a')].find(a=>a.getAttribute('href')==='/users');assert.match(users.className,/text-gold/)
 globalThis.__navRole='state_commander';await React.act(async()=>render())
 const stateLinks=[...document.querySelectorAll('nav a')].map(a=>a.getAttribute('href'))
 for(const path of ['/users','/operations','/applications','/vetting','/ethics-tribunal'])assert.equal(stateLinks.includes(path),false,path)
 assert.ok(stateLinks.includes('/health'));assert.ok(stateLinks.includes('/members'))
 globalThis.__navRole='post_officer';await React.act(async()=>render())
 const localLinks=[...document.querySelectorAll('nav a')].map(a=>a.getAttribute('href'))
 assert.ok(localLinks.includes('/health/post-1'));assert.equal(localLinks.includes('/health'),false);assert.equal(localLinks.includes('/users'),false)
 }finally{await React.act(async()=>root.unmount());fs.unlinkSync(file);dom.window.close()}
})
