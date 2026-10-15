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
  insert into public.members(id,post_id,full_name,email,membership_status) values('${uid(720)}','${otherPost}','Other state member','other@example.test','active');
  insert into public.uro_meetings(post_id,title,meeting_date) values('${post}','Indiana operations',current_date),('${otherPost}','Ohio operations',current_date);
  insert into public.resolutions(id,title,body,submitted_by,status,vote_type) values('${uid(501)}','Open ballot','Reviewed legislative text','${national}','voting','delegate_vote');
  insert into public.resolution_member_preferences(resolution_id,post_id,member_profile_id,preference) values('${uid(501)}','${post}','${member}',true);
  insert into public.ethics_complaints(complainant_id,respondent_name,category,description) values('${member}','Private complaint','other','Confidential example');`);
  await db.exec(fs.readFileSync('supabase/migrations/20261014180746_restricted_membership_access.sql','utf8'));
  await db.exec(`alter table storage.objects add column metadata jsonb;create policy legacy_dd214_upload on storage.objects for insert to anon,authenticated with check(bucket_id='dd214-uploads');grant insert on storage.objects to anon;`);
  await db.exec(fs.readFileSync('supabase/migrations/20261014190152_member_dd214_upload.sql','utf8'));
  await db.exec(fs.readFileSync('supabase/migrations/20261014133554_ncc_membership_list_export.sql','utf8'));
  await db.exec(fs.readFileSync('supabase/migrations/20261015172850_ncc_congress_appointments.sql','utf8'));
  await db.exec(fs.readFileSync('supabase/migrations/20261015175419_congress_membership_choice.sql','utf8'));
  await db.exec(fs.readFileSync('supabase/migrations/20261015195454_personal_account_settings.sql','utf8'));
});

after(()=>db.close());
async function as(n,sql){await db.exec(`set role authenticated;select set_config('request.jwt.claim.sub','${uid(n)}',false)`);try{return await db.query(sql)}finally{await db.exec('reset role')}}
async function version(n){return (await db.query(`select access_version from profiles where id='${uid(n)}'`)).rows[0].access_version}
async function save(actor,target,company,alt=false,id=null,start='current_date',end='null',v=null){return (await as(actor,`select cvoa_save_congress_appointment('${uid(target)}','${uid(company)}',${alt},${start},${end},'Reviewed NCC appointment',${v??await version(target)},${id?`'${id}'`:'null'}) data`)).rows[0].data}

test('personal settings return only the signed-in account membership and payments',async()=>{
 await db.exec(`insert into membership_payments(member_id,membership_type,amount,status) values('${memberRow}','annual',49.99,'paid'),('${uid(720)}','lifetime',499.99,'paid');`);
 const r=(await as(3,'select cvoa_account_settings() data')).rows[0].data;
 assert.equal(r.memberships.length,1);assert.equal(r.memberships[0].id,memberRow);assert.equal(r.payments.length,1);assert.equal(Number(r.payments[0].amount),49.99);
 await as(3,`select cvoa_save_account_profile('My display name','555-1234')`);
 assert.equal((await db.query(`select full_name from profiles where id='${member}'`)).rows[0].full_name,'My display name');
 assert.equal((await db.query(`select full_name from members where id='${memberRow}'`)).rows[0].full_name,'Member');
 await assert.rejects(as(3,`select cvoa_save_account_profile('','')`));
});
test('photo storage and registration enforce ownership and preserve account authority',async()=>{
 const path=member+'/'+uid(701)+'.webp',other=officer+'/'+uid(702)+'.webp';
 await db.exec(`insert into storage.objects(bucket_id,name) values('profile-photos','${other}')`);
 await as(3,`insert into storage.objects(bucket_id,name) values('profile-photos','${path}')`);
 await assert.rejects(as(3,`insert into storage.objects(bucket_id,name) values('profile-photos','${officer}/${uid(703)}.webp')`));
 await assert.rejects(as(3,`select cvoa_set_profile_photo('${other}')`));
 await as(3,`select cvoa_set_profile_photo('${path}')`);
 assert.equal((await as(3,'select cvoa_account_settings() data')).rows[0].data.avatar_path,path);
 await assert.rejects(as(3,`update profiles set avatar_path=null,role='national_commander' where id='${member}'`));
 await assert.rejects(as(3,`select cvoa_billing_customer('${officer}','cus_victim')`));
});
test('limited accounts can manage their own settings and photo without accessing organization records',async()=>{
 await as(1,`select cvoa_set_membership_access('${member}',${await version(3)},true,'Personal membership workspace')`);
 await as(3,`select set_config('request.path','/rpc/cvoa_account_settings',false)`);await as(3,'select cvoa_membership_request_guard()');await as(3,`select cvoa_save_account_profile('Limited member','')`);
 assert.equal((await as(3,`select * from storage.objects where bucket_id='profile-photos'`)).rows.length,1);
 assert.equal((await as(3,'select * from members')).rows.length,0);
 await as(3,`select set_config('request.path','/rpc/cvoa_member_record',false)`);await assert.rejects(as(3,`select cvoa_membership_request_guard()`));
 await as(3,'select cvoa_set_profile_photo(null)');
 assert.equal((await as(3,'select cvoa_account_settings() data')).rows[0].data.avatar_path,null);
});
test('billing links are service-only and confirmed auth email changes synchronize to the same profile',async()=>{
 await db.exec(`set role service_role;select cvoa_billing_customer('${member}','cus_own');reset role`);
 await assert.rejects(as(3,`select cvoa_billing_customer('${member}')`));
 await db.exec(`update auth.users set email='new-address@example.test' where id='${member}'`);
 assert.equal((await db.query(`select email from profiles where id='${member}'`)).rows[0].email,'new-address@example.test');
 await db.exec(`update profiles set access_suspended=true where id='${member}'`);
 await assert.rejects(as(3,'select cvoa_account_settings()'));
 await assert.rejects(as(3,`select cvoa_save_account_profile('Blocked','')`));
});
