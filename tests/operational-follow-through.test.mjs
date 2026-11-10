import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { PGlite } from '@electric-sql/pglite'
const id = n => '71000000-0000-4000-8000-' + String(n).padStart(12, '0')

test('National can track adopted work and identify real membership blockers without changing votes', async () => {
  const db = new PGlite()
  try {
    await db.exec(`
      create role anon; create role authenticated; create schema auth;
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      create table profiles(id uuid primary key,full_name text,role text,deleted_at timestamptz,access_suspended boolean default false,is_test_account boolean default false);
      create function public.is_national_role() returns boolean language sql stable as $$select exists(select 1 from public.profiles where id=auth.uid() and role='national_staff' and not access_suspended)$$;
      create function public.ops_access_enabled() returns boolean language sql stable as $$select public.is_national_role()$$;
      create function public.cvoa_membership_only() returns boolean language sql stable as $$select false$$;
      create table resolutions(id uuid primary key,status text);
      create table post_applications(id uuid,assigned_reviewer_id uuid,created_at timestamptz,next_action_due_date date,next_action text);
      create table launch_tasks(id uuid,owner_name text);
      create table uro_actions(id uuid,owner_id uuid);
      create table launch_locations(id uuid,submitted_at timestamptz);
      create table post_launch_plans(post_id uuid);
      create table launch_history(post_id uuid,action text,detail jsonb,created_at timestamptz);
      create table state_escalations(id uuid,created_at timestamptz);
      create table members(id uuid,full_name text,profile_id uuid,deleted_at timestamptz,dd214_review_status text,dd214_reviewed_at timestamptz);
      create table membership_payments(member_id uuid,paid_at timestamptz,created_at timestamptz,status text);
      create table membership_verification_emails(member_id uuid,review_at timestamptz,status text,claimed_at timestamptz);
      grant usage on schema auth to authenticated;
      grant select on all tables in schema public to authenticated;
      create function public.ops_module_queue() returns jsonb language sql stable as
        $$select jsonb_build_object('total',1,'items',jsonb_build_array(jsonb_build_object('id','application:'||'${id(5)}','kind','application','title','Review application','path','/applications','due_date','2026-10-15')))$$;
      insert into profiles(id,full_name,role) values('${id(1)}','National Owner','national_staff'),('${id(2)}','Ordinary Member','member');
      insert into resolutions values('${id(3)}','passed'),('${id(4)}','draft');
      insert into post_applications values('${id(5)}','${id(1)}','2026-10-15',null,'Read the packet');
      insert into members values('${id(6)}','Paid unlinked',null,null,'pending',null),('${id(7)}','Failed approval email','${id(2)}',null,'verified','2026-10-15'),('${id(8)}','Unconfirmed checkout',null,null,'pending',null);
      insert into membership_payments values('${id(6)}',now(),now(),'paid'),('${id(8)}',null,now(),'pending');
      insert into membership_verification_emails values('${id(7)}','2026-10-15','failed',now());
    `)
    await db.exec(await readFile(new URL('../supabase/migrations/20261110020056_operational_follow_through.sql',import.meta.url),'utf8'))
    async function as(actor, sql) {
      await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub','${id(actor)}',false)`)
      try { return (await db.query(sql)).rows } finally { await db.exec('reset role') }
    }
    const insert = (resolution, owner) => `insert into resolution_follow_through(resolution_id,owner_id,due_date,outcome) values('${id(resolution)}','${id(owner)}',current_date-1,'Implement decision')`
    await assert.rejects(as(2,insert(3,1)),/row-level security/)
    await assert.rejects(as(1,insert(4,1)),/row-level security/)
    await assert.rejects(as(1,insert(3,2)),/row-level security/)
    await as(1,insert(3,1))
    await assert.rejects(as(2,'select ops_priority_work()'),/National staff access required/)
    assert.equal((await as(2,'select * from resolution_follow_through')).length,0)
    const [{ result }] = await as(1,'select ops_priority_work() result')
    assert.deepEqual(result.membership_attention,{paid_unlinked:1,approval_mail:1})
    assert.equal(result.items[0].id,'resolution-action:'+id(3))
    assert.equal(result.items.find(x=>x.id==='application:'+id(5)).owner,'National Owner')
    assert.equal(result.items.find(x=>x.id==='application:'+id(5)).waiting_since,'2026-10-15')
    assert.ok(result.items.some(x=>x.id==='paid-unlinked:'+id(6)))
    assert.ok(result.items.some(x=>x.id==='approval-mail:'+id(7)))
    assert.ok(!result.items.some(x=>x.id==='paid-unlinked:'+id(8)))
    await as(1,`update resolution_follow_through set status='completed' where resolution_id='${id(3)}'`)
    const [after] = await as(1,'select ops_priority_work() result')
    assert.ok(!after.result.items.some(x=>x.id==='resolution-action:'+id(3)))
    assert.equal((await as(1,`select status from resolutions where id='${id(3)}'`))[0].status,'passed')
  } finally { await db.close() }
})
