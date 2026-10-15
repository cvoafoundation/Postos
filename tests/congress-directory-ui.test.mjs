import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {build} from 'esbuild'
import {JSDOM} from 'jsdom'
import {createRequire} from 'node:module'
test('appointed delegates appear with their company, ended terms stay in history, and focus refreshes assignments',async()=>{
 const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost/congress/delegates'})
 Object.assign(globalThis,{window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,IS_REACT_ACT_ENVIRONMENT:true,__delegates:[]})
 const file='tests/.congress-directory-ui.cjs'
 await build({entryPoints:['src/pages/congress/Delegates.tsx'],bundle:true,platform:'node',format:'cjs',outfile:file,jsx:'automatic',external:['react','react-dom','react-dom/client'],plugins:[{name:'fixtures',setup(b){
 b.onResolve({filter:/^@\/|^react-router-dom$|CongressSubNav/},a=>({path:a.path,namespace:'fixture'}))
 b.onLoad({filter:/.*/,namespace:'fixture'},a=>({loader:'js',contents:a.path==='@/lib/supabase'?`export const supabase={rpc:async(name)=>({data:name==='cvoa_congress_admin_access'?false:{profiles:[{id:'member',full_name:'Test delegate'}],posts:[{id:'company',name:'Terre Haute Company'}]}}),from:(table)=>({select:async()=>({data:table==='congress_delegates'?globalThis.__delegates:[]})})};`:a.path.includes('AuthContext')?`export const useAuth=()=>({isNational:false})`:a.path==='react-router-dom'?`import React from 'react';export const Link=({children,...props})=>React.createElement('a',props,children);`:`import React from 'react';export const CongressSubNav=()=>null;export const PageHeader=({title})=>React.createElement('h1',null,title);export const EmptyState=({title})=>React.createElement('p',null,title);`}))
 }}]})
 const React=await import('react'),{createRoot}=await import('react-dom/client'),Component=createRequire(import.meta.url)(process.cwd()+'/'+file).default,root=createRoot(document.getElementById('root'))
 try{
 await React.act(async()=>root.render(React.createElement(Component)))
 assert.match(document.body.textContent,/No current delegates/)
 globalThis.__delegates=[{id:'current',profile_id:'member',post_id:'company',is_alternate:false,term_start:'2020-01-01',term_end:null},{id:'ended',profile_id:'member',post_id:'company',is_alternate:true,term_start:'2019-01-01',term_end:'2019-12-31'}]
 await React.act(async()=>window.dispatchEvent(new window.Event('focus')))
 assert.match(document.body.textContent,/Test delegate/);assert.match(document.body.textContent,/Terre Haute Company/);assert.match(document.body.textContent,/Primary delegate/)
 assert.equal(document.querySelectorAll('tbody tr').length,1)
 await React.act(async()=>document.querySelector('input[type=checkbox]').click())
 assert.equal(document.querySelectorAll('tbody tr').length,2);assert.match(document.body.textContent,/Ended/)
 globalThis.__delegates=[]
 await React.act(async()=>window.dispatchEvent(new window.Event('cvoa:people-changed')))
 assert.equal(document.querySelectorAll('tbody tr').length,0)
 }finally{await React.act(async()=>root.unmount());fs.unlinkSync(file);dom.window.close()}
})
