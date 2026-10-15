import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {build} from 'esbuild'
import {JSDOM} from 'jsdom'
import {createRequire} from 'node:module'
test('Congress appointment controls are hidden unless the backend confirms NCC access',async()=>{
 const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost/users'})
 Object.assign(globalThis,{window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,IS_REACT_ACT_ENVIRONMENT:true,__congressAllowed:false})
 const file='tests/.congress-appointment-ui.cjs'
 await build({entryPoints:['src/components/access/CongressAppointment.tsx'],bundle:true,platform:'node',format:'cjs',outfile:file,jsx:'automatic',external:['react','react-dom','react-dom/client'],plugins:[{name:'fixtures',setup(b){b.onResolve({filter:/^@\/lib\/supabase$/},a=>({path:a.path,namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({loader:'js',contents:`export const supabase={rpc:async(name)=>name==='cvoa_congress_admin_access'?{data:globalThis.__congressAllowed}:{data:{version:0,eligible:true,appointments:[],posts:[{id:'company',name:'Terre Haute',state:'IN'}]}}};`}))}}]})
 const React=await import('react'),{createRoot}=await import('react-dom/client'),Component=createRequire(import.meta.url)(process.cwd()+'/'+file).default,root=createRoot(document.getElementById('root'))
 try{
 await React.act(async()=>root.render(React.createElement(Component,{profileId:'a',onChanged:()=>{}})));assert.equal(document.querySelector('button'),null)
 globalThis.__congressAllowed=true
 await React.act(async()=>root.render(React.createElement(Component,{profileId:'b',onChanged:()=>{}})))
 assert.match(document.body.textContent,/NCC appointment control/)
 assert.ok([...document.querySelectorAll('option')].some(o=>o.value==='company'&&o.textContent.includes('Terre Haute')))
 assert.match(document.body.textContent,/Primary delegate/);assert.match(document.body.textContent,/Alternate/)
 globalThis.__congressAllowed=false
 await React.act(async()=>root.render(React.createElement(Component,{profileId:'c',onChanged:()=>{}})));assert.equal(document.querySelector('button'),null)
 }finally{await React.act(async()=>root.unmount());fs.unlinkSync(file);dom.window.close()}
})
