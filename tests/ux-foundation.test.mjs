import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {build} from 'esbuild'
import {JSDOM} from 'jsdom'
import {createRequire} from 'node:module'
test('page guidance and list context remain consistent across accounts and workspaces',async()=>{
 const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost/users'})
 Object.assign(globalThis,{window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,IS_REACT_ACT_ENVIRONMENT:true,__uxUser:'a',__uxScope:'primary'})
 const dir='tests/.ux-build';await build({entryPoints:['src/components/layout/AppShell.tsx','src/hooks/useListMemory.ts'],bundle:true,platform:'node',format:'cjs',outdir:dir,outExtension:{'.js':'.cjs'},jsx:'automatic',external:['react','react-dom','react-dom/client','react-router-dom'],plugins:[{name:'fixtures',setup(b){b.onResolve({filter:/^@\/context\/AuthContext$|^@\/lib\/supabase$/},a=>({path:a.path,namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},a=>({loader:'js',contents:a.path.endsWith('AuthContext')?`export const useAuth=()=>({session:{user:{id:globalThis.__uxUser}},profile:{role:'member'},selectedScope:globalThis.__uxScope});`:`export const isDemoMode=true;export const supabase={};`}))}}]})
 const require=createRequire(import.meta.url),React=await import('react'),{createRoot}=await import('react-dom/client'),{MemoryRouter}=await import('react-router-dom')
 const {PageHeader}=require(process.cwd()+'/'+dir+'/components/layout/AppShell.cjs'),{useListMemory}=require(process.cwd()+'/'+dir+'/hooks/useListMemory.cjs')
 const root=createRoot(document.getElementById('root'))
 function Control(){const [value,setValue]=useListMemory('query','');return React.createElement('div',null,React.createElement('output',null,value),React.createElement('button',{onClick:()=>setValue('remembered')},'Set query'))}
 const render=(key='first')=>root.render(React.createElement(MemoryRouter,{future:{v7_startTransition:true,v7_relativeSplatPath:true},initialEntries:['/users']},React.createElement(PageHeader,{title:'Accounts & Access',eyebrow:'National',action:React.createElement('button',null,'Invite')}),React.createElement(Control,{key})))
 try{
 await React.act(async()=>render());assert.match(document.body.textContent,/connected person records/);assert.ok(document.querySelector('.page-actions button'))
 await React.act(async()=>[...document.querySelectorAll('button')].find(b=>b.textContent==='Set query').click());assert.equal(document.querySelector('output').textContent,'remembered')
 await React.act(async()=>render('return'));assert.equal(document.querySelector('output').textContent,'remembered')
 globalThis.__uxUser='b';await React.act(async()=>render('other'));assert.equal(document.querySelector('output').textContent,'')
 globalThis.__uxUser='a';globalThis.__uxScope='different';await React.act(async()=>render('scope'));assert.equal(document.querySelector('output').textContent,'')
 globalThis.__uxScope='primary';await React.act(async()=>render('back'));assert.equal(document.querySelector('output').textContent,'remembered')
 }finally{await React.act(async()=>root.unmount());fs.rmSync(dir,{recursive:true,force:true});dom.window.close()}
})
