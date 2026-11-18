import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
test('every current member qualifies; bridge codes are one-use; updates require opt-in and deduplicate',async()=>{
 const db=new PGlite();try{
 await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;
 create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);
 create table public.profiles(id uuid primary key,deleted_at timestamptz,access_suspended boolean);
 create table public.members(id uuid primary key,profile_id uuid,membership_status text,membership_type text,expires_at date,deleted_at timestamptz);`);
 await db.exec(await readFile(new URL('../supabase/migrations/20261118190000_register_integration.sql',import.meta.url),'utf8'));
 const id='4a9a2286-a83b-4438-823a-bbb12c5f8727',other='72ea3c49-8b9a-46f8-917d-2c64f28e5a47';
 await db.query('insert into public.profiles values($1,null,false),($2,null,false)',[id,other]);
 await db.query("insert into public.members values(gen_random_uuid(),$1,'active','annual',current_date+1,null),(gen_random_uuid(),$2,'active','lifetime',null,null)",[id,other]);
 await db.query('insert into auth.users values($1,$2,now())',[id,'member@example.test']);
 const value=async(sql,args=[])=>Object.values((await db.query(sql,args)).rows[0])[0];
 assert.equal(await value('select public.cvoa_register_eligible($1)',[id]),true);assert.equal(await value('select public.cvoa_register_eligible($1)',[other]),true);
 await db.query('update public.members set expires_at=current_date-1 where profile_id=$1',[id]);assert.equal(await value('select public.cvoa_register_eligible($1)',[id]),false);
 await db.query('update public.members set expires_at=current_date+1 where profile_id=$1',[id]);
 await db.query('select public.cvoa_register_authorize($1,$2,$3)',['a'.repeat(64),id,'b'.repeat(64)]);
 await assert.rejects(db.query('select public.cvoa_register_exchange($1,$2)',['a'.repeat(64),'c'.repeat(64)]));
 assert.equal(await value('select public.cvoa_register_exchange($1,$2)',['a'.repeat(64),'b'.repeat(64)]),id);
 await assert.rejects(db.query('select public.cvoa_register_exchange($1,$2)',['a'.repeat(64),'b'.repeat(64)]));
 const item={key:'va:test',topic:'Housing',title:'Test record',summary:'Source statement',url:'https://cvoa-record.vercel.app/update/va_press/test',publishedAt:'2099-01-01T00:00:00Z'};
 assert.equal(await value('select public.cvoa_register_queue($1)',[JSON.stringify([item])]),0);
 await db.query('select public.cvoa_register_preferences($1,$2,$3)',[id,true,['Housing']]);
 assert.equal(await value('select public.cvoa_register_queue($1)',[JSON.stringify([item])]),1);
 assert.equal(await value('select public.cvoa_register_queue($1)',[JSON.stringify([item])]),0);
 const job=await value('select public.cvoa_register_claim_mail()');assert.equal(job.email,'member@example.test');
 assert.equal(await value('select public.cvoa_register_claim_mail()'),null);
 await db.query('select public.cvoa_register_finish_mail($1,$2,$3)',[job.id,job.lease,true]);
 assert.equal(await value('select public.cvoa_register_claim_mail()'),null);
 await db.query('select public.cvoa_register_unsubscribe($1)',[id]);assert.equal((await value('select public.cvoa_register_preferences($1)',[id])).enabled,false);
 await db.exec('set role anon');await assert.rejects(db.query('select public.cvoa_register_eligible($1)',[id]));await assert.rejects(db.query('select * from register_private.preferences'));await db.exec('reset role');
 }finally{await db.close();}
});
