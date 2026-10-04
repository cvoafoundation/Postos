import test, {before,after} from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {PGlite} from '@electric-sql/pglite'
const db=new PGlite()
const uid=n=>`10000000-0000-0000-0000-${String(n).padStart(12,'0')}`
const national=uid(1),officer=uid(2),member=uid(3),guest=uid(4),post=uid(101),otherPost=uid(102),memberRow=uid(201),application=uid(301)
before(async()=>{
 await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
 create schema auth; create schema storage;
 create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,last_sign_in_at timestamptz);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create function auth.role() returns text language sql stable as $$select current_setting('request.jwt.claim.role',true)$$;
 create function public.uuid_generate_v4() returns uuid language sql as $$select gen_random_uuid()$$;
 create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);
 create function storage.foldername(text) returns text[] language sql as $$select string_to_array($1,'/')$$;
 grant usage on schema public,auth,storage to anon,authenticated,service_role;`)
 let schema=fs.readFileSync('supabase/schema.sql','utf8').replace('create extension if not exists "uuid-ossp";','').replace("'guest_applicant'\n);", "'guest_applicant', 'ethics_tribunal'\n);")
 await db.exec(schema)
 await db.exec(`alter table public.profiles add column title text;`)
 await db.exec(`grant select,insert,update,delete on all tables in schema public to anon,authenticated,service_role; grant usage on all sequences in schema public to anon,authenticated,service_role;
 insert into auth.users(id,email,email_confirmed_at) values('${national}','national@example.test',now()),('${officer}','officer@example.test',now()),('${member}','member@example.test',now()),('${guest}','guest@example.test',now());
 insert into public.posts(id,name,state,status) values('${post}','Post A','IN','active_post'),('${otherPost}','Post B','OH','active_post');
 insert into public.profiles(id,full_name,email,role,post_id) values('${national}','National','national@example.test','national_commander',null),('${officer}','Officer','officer@example.test','post_commander','${post}'),('${member}','Member','member@example.test','member','${post}'),('${guest}','Guest','guest@example.test','guest_applicant',null);
 insert into public.members(id,post_id,profile_id,full_name,email,membership_status) values('${memberRow}','${post}','${member}','Member','member@example.test','active');
 insert into public.post_role_applications(id,member_id,post_id,requested_role) values('${application}','${memberRow}','${post}','post_officer');
 create policy members_select_own on public.members for select using(profile_id=auth.uid());`)
 await db.exec(fs.readFileSync('supabase/migrations/20261003185000_live_permission_hardening.sql','utf8'))
 // Compile the entire coordinated release against the full public schema.
 await db.exec(fs.readFileSync('supabase/migrations/20261003190000_organization_workspaces.sql','utf8'))
})
after(()=>db.close())
async function as(user,fn,role='authenticated'){
 await db.exec('begin')
 try {await db.exec(`set local role ${role}; select set_config('request.jwt.claim.sub','${user??''}',true),set_config('request.jwt.claim.role','${role}',true)`);await fn()}finally{await db.exec('rollback')}
}
test('member cannot promote their own role, change post or title',async()=>{
 for(const change of [`role='national_commander'`,`post_id='${otherPost}'`,`title='Commander'`]) await as(member,()=>assert.rejects(db.exec(`update public.profiles set ${change} where id='${member}'`),/Only National/))
})
test('member can edit ordinary personal profile fields',()=>as(member,async()=>{
 await db.exec(`update public.profiles set full_name='Updated',phone='555' where id='${member}'`)
 assert.equal((await db.query(`select full_name from public.profiles where id='${member}'`)).rows[0].full_name,'Updated')
}))
test('National can administer an existing account appointment',()=>as(national,async()=>{
 await db.exec(`update public.profiles set role='state_commander',state='IN' where id='${guest}'`)
 assert.equal((await db.query(`select role from public.profiles where id='${guest}'`)).rows[0].role,'state_commander')
}))
test('anonymous intake cannot invent a paid membership',()=>as(null,async()=>{
 await assert.rejects(db.exec(`insert into public.members(full_name,membership_status) values('Fake','active')`),/row-level security/)
},'anon'))
test('anonymous intake still accepts an unpaid member',()=>as(null,async()=>{
 await db.exec(`insert into public.members(full_name,email) values('Signup','signup@example.test')`)
},'anon'))
test('member cannot approve their own officer request via definer RPC',()=>as(member,async()=>{
 await assert.rejects(db.query(`select public.approve_post_role_application('${application}')`),/approval access/)
}))
test('assigned post commander can approve an active member officer request',()=>as(officer,async()=>{
 await db.query(`select public.approve_post_role_application('${application}')`)
 await db.exec('set local role postgres')
 assert.equal((await db.query(`select role from public.profiles where id='${member}'`)).rows[0].role,'post_officer')
}))
test('ordinary member cannot change their post record',()=>as(member,async()=>{
 await db.exec(`update public.posts set name='Hijacked' where id='${post}'`)
 assert.equal((await db.query(`select name from public.posts where id='${post}'`)).rows[0].name,'Post A')
}))
test('post staff cannot write another post',()=>as(officer,async()=>{
 await db.exec(`update public.posts set name='Hijacked' where id='${otherPost}'`)
 assert.equal((await db.query(`select name from public.posts where id='${otherPost}'`)).rows[0].name,'Post B')
}))
test('anonymous callers cannot insert their own payment confirmation',()=>as(null,async()=>{
 await assert.rejects(db.exec(`insert into public.membership_payments(member_id,membership_type,amount,status) values('${memberRow}','annual',49.99,'paid')`),/row-level security/)
},'anon'))
test('member directory exposes displayed fields without roster contact details',()=>as(member,async()=>{
 const result=(await db.query('select * from public.cvoa_post_member_directory()')).rows
 assert.equal(result.length,1)
 assert.deepEqual(Object.keys(result[0]).sort(),['full_name','id','membership_number','membership_status','membership_type'])
 assert.equal((await db.query('select * from public.members')).rows.length,1)
}))
