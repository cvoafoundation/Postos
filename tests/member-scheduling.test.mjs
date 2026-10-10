import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {prepareMail} from '../supabase/functions/member-scheduling/mail.js';
const db=new PGlite();
const owner='10000000-0000-0000-0000-000000000001', other='10000000-0000-0000-0000-000000000002';
let meeting;
before(async()=>{
 await db.exec(`create role anon; create role authenticated; create role service_role bypassrls; create schema auth;
 create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create table public.profiles(id uuid primary key,access_suspended boolean default false,deleted_at timestamptz);
 grant usage on schema auth,public to authenticated; grant select on public.profiles to authenticated;
 insert into auth.users values('${owner}','owner@example.test',now()),('${other}','other@example.test',now()); insert into public.profiles(id) values('${owner}'),('${other}');`);
 await db.exec(fs.readFileSync('supabase/migrations/20261010195100_member_schedlr_workspace.sql','utf8'));
});
after(()=>db.close());
async function as(id,sql){await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub','${id}',false);`);try{return await db.query(sql);}finally{await db.exec('reset role');}}
test('own appointment creates transactionally queued notices and reminders',async()=>{
 const result=await as(owner,`insert into public.schedlr_personal_meetings(title,starts_at,ends_at,attendee_emails) values('Mission meeting',now()+interval '3 days',now()+interval '3 days 30 minutes',array['guest@example.test']) returning id`);
 meeting=result.rows[0].id;
 const jobs=await db.query(`select event,count(*)::int n from public.schedlr_personal_deliveries group by event`);
 assert.deepEqual(Object.fromEntries(jobs.rows.map(r=>[r.event,r.n])),{scheduled:2,'reminder-24h':2,'reminder-1h':2});
});
test('another account cannot read or edit the appointment',async()=>{
 assert.equal((await as(other,`select * from public.schedlr_personal_meetings where id='${meeting}'`)).rows.length,0);
 assert.equal((await as(other,`update public.schedlr_personal_meetings set title='Unauthorized' where id='${meeting}' returning id`)).rows.length,0);
 await assert.rejects(as(other,`insert into public.schedlr_personal_meetings(organizer_id,title,starts_at,ends_at) values('${owner}','Forged',now()+interval '4 days',now()+interval '4 days 30 minutes')`));
});
test('ownership and queue delivery state cannot be edited by browser accounts',async()=>{
 await assert.rejects(as(owner,`update public.schedlr_personal_meetings set organizer_id='${other}' where id='${meeting}'`));
 await assert.rejects(as(owner,`update public.schedlr_personal_deliveries set state='sent' where meeting_id='${meeting}'`));
});
test('rescheduling supersedes old mail and removed guests get cancellation only',async()=>{
 await as(owner,`update public.schedlr_personal_meetings set starts_at=now()+interval '4 days',ends_at=now()+interval '4 days 30 minutes',attendee_emails=array['new@example.test'] where id='${meeting}' and version=0`);
 assert.equal((await as(owner,`update public.schedlr_personal_meetings set title='Stale' where id='${meeting}' and version=0 returning id`)).rows.length,0);
 const jobs=await db.query(`select version,event,recipient,state from public.schedlr_personal_deliveries where meeting_id='${meeting}'`);
 assert.ok(jobs.rows.filter(j=>j.version===0).every(j=>j.state==='superseded'));
 assert.deepEqual(jobs.rows.filter(j=>j.version===1 && j.recipient==='guest@example.test').map(j=>j.event),['cancelled']);
});
test('cancellation supersedes reminders and queues notices',async()=>{
 await as(owner,`update public.schedlr_personal_meetings set status='cancelled' where id='${meeting}'`);
 const jobs=await db.query(`select event,state from public.schedlr_personal_deliveries where meeting_id='${meeting}' and version=2`);
 assert.equal(jobs.rows.length,2);assert.ok(jobs.rows.every(j=>j.event==='cancelled' && j.state==='pending'));
 const claimed=await db.query('select * from public.schedlr_claim_personal_deliveries()');assert.equal(claimed.rows.length,2);
 assert.equal((await db.query('select * from public.schedlr_claim_personal_deliveries()')).rows.length,0);
});
test('calendar updates preserve event identity and cancel with incremented sequence',()=>{
 const payload={id:meeting,title:'Title\nInjected: value',starts_at:'2026-10-20T16:00:00Z',ends_at:'2026-10-20T16:30:00Z',organizer_email:'owner@example.test',location:'Office, Indiana',description:'Test; details'};
 const scheduled=prepareMail({id:'notice1',version:0,event:'scheduled',recipient:'guest@example.test',payload},'sender@example.test');
 const cancelled=prepareMail({id:'notice2',version:2,event:'cancelled',recipient:'guest@example.test',payload},'sender@example.test');
 assert.equal(scheduled.to,'guest@example.test');assert.equal(scheduled.cc,undefined);assert.ok(!scheduled.subject.includes('\n'));
 assert.ok(scheduled.icalEvent.content.includes(`UID:${meeting}@schedlr.cvoa.one`));assert.ok(cancelled.icalEvent.content.includes('METHOD:CANCEL'));assert.ok(cancelled.icalEvent.content.includes('SEQUENCE:2'));assert.ok(cancelled.icalEvent.content.includes('STATUS:CANCELLED'));
});
