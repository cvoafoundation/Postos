import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {build} from 'esbuild'
import {JSDOM} from 'jsdom'
import {createRequire} from 'node:module'
test('mobile settings are visible, a photo can be previewed and saved, and billing uses the signed-in account',async()=>{
 const dom=new JSDOM('<div id="root"></div>',{url:'https://cvoa.one/settings'})
 Object.assign(globalThis,{window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,IS_REACT_ACT_ENVIRONMENT:true,__settingsCalls:[],__settingsProfile:{id:'owner',full_name:'Owner',phone:'',email:'owner@example.test',role:'member',avatar_path:null}})
 const harness='tests/.settings-harness.tsx',file='tests/.account-settings-ui.cjs';fs.writeFileSync(harness,`import {AppShell} from '../src/components/layout/AppShell';import Settings from '../src/pages/settings/Settings';export default ()=> <AppShell><Settings/></AppShell>`)
 await build({entryPoints:[harness],bundle:true,platform:'node',format:'cjs',outfile:file,jsx:'automatic',external:['react','react-dom','react-dom/client','react-router-dom'],plugins:[{name:'fixtures',setup(b){
 b.onResolve({filter:/^@\/context\/AuthContext$|^@\/lib\/supabase$|^\.\/Sidebar$|^\.\/profilePhoto$/},a=>({path:a.path,namespace:'fixture'}))
 b.onLoad({filter:/.*/,namespace:'fixture'},a=>({loader:'js',contents:a.path.includes('AuthContext')?`export const useAuth=()=>({profile:globalThis.__settingsProfile,session:{user:{id:'owner',email:'owner@example.test'}},membershipOnly:true,isNational:false,refreshProfile:async()=>{},signOut:async()=>{}});`:a.path==='./Sidebar'?`export const Sidebar=()=>null;`:a.path==='./profilePhoto'?`export const prepareProfilePhoto=async()=>new Blob(['photo'],{type:'image/webp'});`:`
 const data=()=>({...globalThis.__settingsProfile,memberships:[],payments:[]});
 export const supabase={rpc:async(name,args)=>{globalThis.__settingsCalls.push([name,args]);if(name==='cvoa_set_profile_photo'){globalThis.__settingsProfile.avatar_path=args.p_path;return {data:null}}return {data:data()}},storage:{from:bucket=>({upload:async(path)=>{globalThis.__settingsCalls.push(['upload',bucket,path]);return {}},remove:async()=>({}),createSignedUrl:async()=>({data:{signedUrl:'https://signed.example/photo'}})})},functions:{invoke:async(name,args)=>{globalThis.__settingsCalls.push([name,args]);return {data:{error:'Test billing unavailable'}}}},auth:{updateUser:async()=>({}),signOut:async()=>({}),signInWithPassword:async()=>({})}};`}))
 }}]})
 const React=await import('react'),{createRoot}=await import('react-dom/client'),{MemoryRouter}=await import('react-router-dom'),Component=createRequire(import.meta.url)(process.cwd()+'/'+file).default,root=createRoot(document.getElementById('root'))
 try{
  await React.act(async()=>root.render(React.createElement(MemoryRouter,{initialEntries:['/settings']},React.createElement(Component))))
  assert.equal(document.querySelector('a[aria-label="Open settings"]').getAttribute('href'),'/settings')
  assert.match(document.body.textContent,/Profile & Photo/);assert.match(document.body.textContent,/Membership & Billing/);assert.match(document.body.textContent,/Sign-in & Security/)
  const input=document.querySelector('input[type=file]');Object.defineProperty(input,'files',{value:[new dom.window.File(['image'],'photo.jpg',{type:'image/jpeg'})]})
  await React.act(async()=>input.dispatchEvent(new window.Event('change',{bubbles:true})))
  assert.ok(document.querySelector('img[alt="New photo preview"]'))
  await React.act(async()=>[...document.querySelectorAll('button')].find(b=>b.textContent==='Save photo').click())
  assert.ok(globalThis.__settingsCalls.some(c=>c[0]==='upload'&&c[1]==='profile-photos'&&c[2].startsWith('owner/')))
  assert.match(document.body.textContent,/Profile photo saved/)
  assert.equal([...document.querySelectorAll('button')].find(b=>b.textContent==='Manage payment methods').disabled,false)
  await React.act(async()=>[...document.querySelectorAll('button')].find(b=>b.textContent==='Manage payment methods').click())
  assert.deepEqual(globalThis.__settingsCalls.find(c=>c[0]==='create-member-billing-portal')[1],{body:{}})
  assert.match(document.body.textContent,/Test billing unavailable/)
  assert.equal(document.querySelector('a[href="/users"]'),null)
 }finally{await React.act(async()=>root.unmount());fs.unlinkSync(file);fs.unlinkSync(harness);dom.window.close()}
})
