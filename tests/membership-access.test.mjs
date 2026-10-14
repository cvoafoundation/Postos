import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { PGlite } from "@electric-sql/pglite";
const db = new PGlite();
const uid = (n) => `10000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const national = uid(1),
  officer = uid(2),
  member = uid(3),
  guest = uid(4),
  post = uid(101),
  otherPost = uid(102),
  memberRow = uid(201),
  application = uid(301);
before(async () => {
  await db.exec(`create role authenticator; create role anon; create role authenticated; create role service_role bypassrls;
 create schema auth; create schema storage;
 create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,last_sign_in_at timestamptz);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create function auth.role() returns text language sql stable as $$select current_setting('request.jwt.claim.role',true)$$;
 create function public.uuid_generate_v4() returns uuid language sql as $$select gen_random_uuid()$$;
 create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);
 create function storage.foldername(text) returns text[] language sql as $$select string_to_array($1,'/')$$;
 grant usage on schema public,auth,storage to anon,authenticated,service_role;
 grant select,insert,update,delete on storage.objects to authenticated; alter table storage.objects enable row level security;`);
  let schema = fs
    .readFileSync("supabase/schema.sql", "utf8")
    .replace('create extension if not exists "uuid-ossp";', "")
    .replace(
      "'guest_applicant'\n);",
      "'guest_applicant', 'ethics_tribunal'\n);",
    );
  await db.exec(schema);
  await db.exec(`alter table public.profiles add column title text;`);
  await db.exec(`grant select,insert,update,delete on all tables in schema public to anon,authenticated,service_role; grant usage on all sequences in schema public to anon,authenticated,service_role;
 insert into auth.users(id,email,email_confirmed_at) values('${national}','national@example.test',now()),('${officer}','officer@example.test',now()),('${member}','member@example.test',now()),('${guest}','guest@example.test',now());
 insert into public.posts(id,name,state,status) values('${post}','Post A','IN','active_post'),('${otherPost}','Post B','OH','active_post');
 insert into public.profiles(id,full_name,email,role,post_id) values('${national}','National','national@example.test','national_commander',null),('${officer}','Officer','officer@example.test','post_commander','${post}'),('${member}','Member','member@example.test','member','${post}'),('${guest}','Guest','guest@example.test','guest_applicant',null);
 insert into public.members(id,post_id,profile_id,full_name,email,membership_status) values('${memberRow}','${post}','${member}','Member','member@example.test','active');
 insert into public.post_role_applications(id,member_id,post_id,requested_role) values('${application}','${memberRow}','${post}','post_officer');
 create policy members_select_own on public.members for select using(profile_id=auth.uid());`);
  await db.exec(
    fs.readFileSync(
      "supabase/migrations/20261003185000_live_permission_hardening.sql",
      "utf8",
    ),
  );
  // Compile the entire coordinated release against the full public schema.
  await db.exec(
    fs.readFileSync(
      "supabase/migrations/20261003190000_organization_workspaces.sql",
      "utf8",
    ),
  );
  await db.exec(
    fs.readFileSync(
      "supabase/migrations/20261004150000_application_pipeline.sql",
      "utf8",
    ),
  );
  await db.exec(
    fs.readFileSync(
      "supabase/migrations/20261004170000_vetting_workspace.sql",
      "utf8",
    ),
  );
  await db.exec(
    fs.readFileSync(
      "supabase/migrations/20261004190000_connected_accounts.sql",
      "utf8",
    ),
  );
  await db.exec(fs.readFileSync('supabase/migrations/20261004203000_state_post_operations.sql', 'utf8'));
  await db.exec(fs.readFileSync('supabase/migrations/20261004210000_membership_transfers.sql', 'utf8'));
  await db.exec(`insert into public.drive_folders(id,name,shared_with_posts,created_by) values('${uid(9701)}','Legacy resources',true,'${national}'); insert into public.drive_files(id,folder_id,name,storage_path,uploaded_by) values('${uid(9702)}','${uid(9701)}','Legacy file','legacy/resource.pdf','${national}'); insert into storage.objects(bucket_id,name) values('ncc-drive','legacy/resource.pdf');`);
  await db.exec(fs.readFileSync('supabase/migrations/20261004220000_document_workspaces.sql', 'utf8'));
  await db.exec(fs.readFileSync('supabase/migrations/20261004230000_uro_governance.sql', 'utf8'));
  await db.exec(fs.readFileSync('supabase/migrations/20261005150000_meeting_access.sql', 'utf8'));
  await db.exec(fs.readFileSync('supabase/migrations/20261005160000_sponsorship_workflow.sql', 'utf8'));
  await db.exec(fs.readFileSync('supabase/migrations/20261005170000_post_development.sql', 'utf8'));
  await db.exec(fs.readFileSync('supabase/migrations/20261005190000_post_dashboard.sql', 'utf8'));
  await db.exec(fs.readFileSync('supabase/migrations/20261006150000_member_directory_removal.sql', 'utf8'));
  await db.exec(fs.readFileSync('supabase/migrations/20261008193802_cvoa_schedlr_connector.sql', 'utf8'));
  await db.exec(`insert into auth.users(id,email,email_confirmed_at) values('${uid(5)}','state@example.test',now()),('${uid(6)}','delegate@example.test',now()),('${uid(7)}','tribunal@example.test',now()),('${uid(8)}','national-staff@example.test',now());
  insert into public.profiles(id,full_name,email,role,state,post_id) values('${uid(5)}','State','state@example.test','state_commander','IN',null),('${uid(6)}','Delegate','delegate@example.test','delegate',null,'${post}'),('${uid(7)}','Tribunal','tribunal@example.test','ethics_tribunal',null,null),('${uid(8)}','National Staff','national-staff@example.test','national_staff',null,null);
  insert into public.congress_delegates(profile_id,post_id) values('${uid(6)}','${post}');
  insert into public.members(id,post_id,full_name,email,membership_status) values('${uid(202)}','${otherPost}','Other state member','other@example.test','active');
  insert into public.uro_meetings(post_id,title,meeting_date) values('${post}','Indiana operations',current_date),('${otherPost}','Ohio operations',current_date);
  insert into public.resolutions(id,title,body,submitted_by,status,vote_type) values('${uid(501)}','Open ballot','Reviewed legislative text','${national}','voting','delegate_vote');
  insert into public.resolution_member_preferences(resolution_id,post_id,member_profile_id,preference) values('${uid(501)}','${post}','${member}',true);
  insert into public.ethics_complaints(complainant_id,respondent_name,category,description) values('${member}','Private complaint','other','Confidential example');`);
  await db.exec(fs.readFileSync('supabase/migrations/20261014180746_restricted_membership_access.sql','utf8'));
});
after(() => db.close());
async function as(n,sql,role='authenticated') {
 await db.exec(`set role ${role};select set_config('request.jwt.claim.sub','${uid(n)}',false);`);
 try { return await db.query(sql); } finally { await db.exec('reset role'); }
}
async function version(n) { return (await db.query(`select access_version from profiles where id='${uid(n)}'`)).rows[0].access_version; }
async function limit(n,enabled=true) {return as(1,`select cvoa_set_membership_access('${uid(n)}',${await version(n)},${enabled},'Reviewed membership workspace') result`);}
test('National can set membership-only access, audit it, and restore it; members cannot',async()=>{
 await assert.rejects(as(3,`select cvoa_set_membership_access('${member}',0,true,'Self change')`));
 await assert.rejects(limit(1)); await assert.rejects(limit(2));
 await limit(3);
 assert.equal((await as(3,'select cvoa_my_access() result')).rows[0].result.membership_only,true);
 assert.equal((await db.query(`select count(*)::int n from access_audit where profile_id='${member}' and action='membership_workspace'`)).rows[0].n,1);
 await assert.rejects(as(1,`select cvoa_set_membership_access('${member}',0,false,'Stale request')`));
 await assert.rejects(as(3,'select * from membership_private.account_limits'));
 await limit(3,false);
 assert.equal((await as(3,'select cvoa_my_access() result')).rows[0].result.membership_only,false);
});
test('staff appointments cannot bypass the setting in either direction',async()=>{
 await db.exec(`insert into access_appointments(profile_id,role,post_id,appointed_by,reason) values('${member}','post_officer','${post}','${national}','Test appointment');`);
 await assert.rejects(limit(3));
 await db.exec(`update access_appointments set revoked_at=now() where profile_id='${member}';`);
 await limit(3);
 await assert.rejects(db.exec(`update profiles set role='national_staff' where id='${member}'`));
 await assert.rejects(db.exec(`insert into access_appointments(profile_id,role,post_id,appointed_by,reason) values('${member}','post_officer','${post}','${national}','Test appointment')`));
});
test('card RPC contains only own card details; table access and Storage are blocked',async()=>{
 const cards=(await as(3,'select cvoa_my_membership_cards() result')).rows[0].result;
 assert.equal(cards.length,1);assert.equal(cards[0].id,memberRow);
 for(const key of ['email','phone','address','stripe_subscription_id','dd214_storage_path']) assert.equal(key in cards[0],false);
 assert.equal((await as(3,'select * from members')).rows.length,0);
 assert.equal((await as(3,'select * from posts')).rows.length,0);
 assert.equal((await as(3,'select * from profiles')).rows.length,1);
 assert.equal((await as(3,'select * from storage.objects')).rows.length,0);
 await assert.rejects(as(3,`update profiles set full_name='Changed' where id='${member}'`));
 assert.equal((await as(3,'select * from uro_meetings')).rows.length,0);
});
test('Data API hook denies RPCs, views and modules even with an existing identity',async()=>{
 for(const path of ['members','cvoa_member_directory','rpc/cvoa_person_record','rpc/cvoa_directory','rpc/cvoa_remove_person','rpc/ops_workspace','schedlr_personal_meetings','rpc/cvoa_public_posts','rpc/link_member_profile','rpc/cvoa_membership_access']) {
 await as(3,`select set_config('request.path','/${path}',false),set_config('request.method','POST',false)`);
 await assert.rejects(as(3,'select cvoa_membership_request_guard()'));
 }
 for(const [path,method] of [['profiles','GET'],['rpc/cvoa_my_membership_cards','POST'],['resolutions','GET'],['ethics_complaints','POST'],['resolution_member_preferences','POST'],['rpc/get_preference_tally','POST'],['congress_delegates','GET']]) {
 await as(3,`select set_config('request.path','/${path}',false),set_config('request.method','${method}',false)`);
 await as(3,'select cvoa_membership_request_guard()');
 }
 await as(3,"select set_config('request.path','/profiles',false),set_config('request.method','PATCH',false)");
 await assert.rejects(as(3,'select cvoa_membership_request_guard()'));
 await as(1,'select cvoa_membership_request_guard()');
});
test('Congress and personal ethics remain available without granting another case or judge privileges',async()=>{
 await db.exec(`insert into ethics_complaints(complainant_id,respondent_name,category,description) values('${uid(6)}','Other case','other','Another confidential example');`);
 assert.equal((await as(3,'select * from resolutions')).rows.length,1);
 assert.equal((await as(3,'select * from ethics_complaints')).rows.length,1);
 await as(3,`insert into ethics_complaints(complainant_id,respondent_name,category,description) values('${member}','My complaint','other','Own complaint')`);
 await assert.rejects(as(3,`insert into ethics_complaints(complainant_id,respondent_name,category,description) values('${uid(6)}','Impersonation','other','Invalid')`));
 const labels=(await as(3,'select cvoa_congress_labels() result')).rows[0].result;
 assert.equal(labels.profiles.length,1);assert.deepEqual(Object.keys(labels.profiles[0]).sort(),['full_name','id']);
});
test('service authorization denies personal billing access, and restoration reinstates existing table permissions',async()=>{
 assert.equal((await db.query(`select cvoa_service_authorized('${member}',null,'personal') allowed`)).rows[0].allowed,false);
 await limit(3,false);
 assert.equal((await db.query(`select cvoa_service_authorized('${member}',null,'personal') allowed`)).rows[0].allowed,true);
 assert.ok((await as(3,'select * from members')).rows.length>0);
});

test('a designated delegate retains their own formal vote and state summary only',async()=>{
 await db.exec(`insert into members(id,post_id,profile_id,full_name,email,membership_status) values('${uid(203)}','${post}','${uid(6)}','Delegate','delegate@example.test','active');`);
 await limit(6);
 await as(6,`insert into resolution_votes(resolution_id,vote_type,voter_id,voter_post_id,vote) values('${uid(501)}','delegate_vote','${uid(6)}','${post}',true)`);
 const tally=(await as(6,`select cvoa_state_voting('${uid(501)}','IN') result`)).rows[0].result;
 assert.equal(tally.state,'IN');
 await assert.rejects(as(6,`select cvoa_state_voting('${uid(501)}','OH')`));
 await assert.rejects(as(6,`insert into resolution_votes(resolution_id,vote_type,voter_id,voter_post_id,vote) values('${uid(501)}','delegate_vote','${uid(6)}','${otherPost}',true)`));
});
