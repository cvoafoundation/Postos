begin;
alter table public.post_facility_projects add constraint launch_project_budget_nonnegative check(target_budget is null or target_budget>=0) not valid;
alter table public.post_facility_projects add column opening_scope boolean not null default true, add column required_for_opening boolean not null default false;
create table public.post_launch_plans (
 post_id uuid primary key references public.posts(id), stage text not null default 'planning' check(stage in ('planning','funding','location_review','setup','opening_review','open')),
 owner_name text not null default '', target_date date, services text not null default '', help_needed text not null default '', selected_location_id uuid,
 version integer not null default 1, updated_at timestamptz not null default now(), opened_at timestamptz
);
create table public.launch_standards (
 id uuid primary key default gen_random_uuid(), label text not null check(length(trim(label)) between 1 and 200), category text not null check(category in ('location','opening')), required boolean not null default false, active boolean not null default true
);
insert into public.launch_standards(label,category) values
 ('Education office or a documented plan for education services','location'),('Employment office or a documented plan for employment services','location'),('Photos and a floor plan explain the proposed space','location'),('Launch team responsibilities are assigned','opening'),('Opening budget and operating reserve have been reviewed','opening'),('Member communications and opening arrangements are ready','opening');
create table public.launch_locations (
 id uuid primary key default gen_random_uuid(),post_id uuid not null references public.post_launch_plans(post_id),name text not null,address text not null, tenure text not null check(tenure in ('lease','purchase','donated')),
 monthly_cost_cents bigint not null default 0 check(monthly_cost_cents>=0), upfront_cost_cents bigint not null default 0 check(upfront_cost_cents>=0), square_feet integer check(square_feet>0),
 details text not null default '', status text not null default 'draft' check(status in ('draft','submitted','approved','changes_requested','declined')), revision integer not null default 1, secured boolean not null default false, submitted_at timestamptz
);
alter table public.post_launch_plans add foreign key(selected_location_id) references public.launch_locations(id);
create table public.launch_location_checks (
 location_id uuid references public.launch_locations(id),standard_id uuid references public.launch_standards(id), response text not null default 'unknown' check(response in ('yes','no','unknown','later')), note text not null default '', primary key(location_id,standard_id)
);
create table public.launch_tasks (
 id uuid primary key default gen_random_uuid(),post_id uuid not null references public.post_launch_plans(post_id),label text not null check(length(trim(label)) between 1 and 200), owner_name text not null default '',due_date date, required boolean not null default false, complete boolean not null default false, note text not null default ''
);
create table public.launch_budget_items (
 id uuid primary key default gen_random_uuid(),post_id uuid not null references public.post_launch_plans(post_id),label text not null check(length(trim(label)) between 1 and 200),amount_cents bigint not null check(amount_cents>=0 and amount_cents<=99999999999),category text not null default 'Other', approved boolean not null default false
);
create table public.launch_history (
 id uuid primary key default gen_random_uuid(),post_id uuid not null references public.post_launch_plans(post_id),actor_id uuid not null references public.profiles(id),actor_name text not null default '',action text not null,detail jsonb not null,created_at timestamptz not null default now()
);
create function public.cvoa_launch_audit_name() returns trigger language plpgsql security definer set search_path='' as $$ declare person text; begin select full_name into person from public.profiles where id=new.actor_id; if tg_table_name='launch_history' then new.actor_name=coalesce(person,'Staff'); else new.reviewer_name=coalesce(person,'National'); end if; return new; end; $$;
create trigger launch_history_name before insert on public.launch_history for each row execute function public.cvoa_launch_audit_name();
create table public.launch_documents (
 id uuid primary key default gen_random_uuid(),post_id uuid not null references public.post_launch_plans(post_id),location_id uuid references public.launch_locations(id),name text not null,path text not null unique,created_by uuid not null references public.profiles(id),created_at timestamptz not null default now()
);
create table public.launch_reviews (
 id uuid primary key default gen_random_uuid(),post_id uuid not null references public.post_launch_plans(post_id),location_id uuid references public.launch_locations(id),actor_id uuid not null references public.profiles(id),reviewer_name text not null default '',decision text not null,feedback text not null,snapshot jsonb not null,created_at timestamptz not null default now()
);
create trigger launch_review_name before insert on public.launch_reviews for each row execute function public.cvoa_launch_audit_name();
alter table public.fundraising_campaigns add column launch_funding boolean not null default false, add column story text not null default '', add column public_slug uuid not null default gen_random_uuid(), add column published boolean not null default false;
create unique index campaign_public_slug on public.fundraising_campaigns(public_slug);
alter table public.fundraising_entries add column financial_transaction_id uuid unique references public.financial_transactions(id),add column voided_at timestamptz,add column void_reason text,add column voided_by uuid references public.profiles(id);
create table public.launch_payment_allocations (
 payment_id uuid primary key references public.sponsor_payments(id),campaign_id uuid not null references public.fundraising_campaigns(id),allocated_by uuid not null references public.profiles(id),created_at timestamptz not null default now()
);
-- Read access uses existing National, State and post staff scopes. All new writes are validated RPCs.
do $$ declare t text; begin
 foreach t in array array['post_launch_plans','launch_locations','launch_tasks','launch_budget_items','launch_history','launch_documents','launch_reviews'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('create policy launch_read on public.%I for select to authenticated using(public.cvoa_can_read_post(post_id))',t);
 execute format('revoke all on public.%I from anon,authenticated',t);
 execute format('grant select on public.%I to authenticated',t);
 end loop;
end $$;
alter table public.launch_standards enable row level security;
create policy standards_read on public.launch_standards for select to authenticated using(public.cvoa_access_enabled());
alter table public.launch_location_checks enable row level security;
create policy location_checks_read on public.launch_location_checks for select to authenticated using(exists(select 1 from public.launch_locations l where l.id=location_id and public.cvoa_can_read_post(l.post_id)));
alter table public.launch_payment_allocations enable row level security;
create policy allocation_read on public.launch_payment_allocations for select to authenticated using(exists(select 1 from public.fundraising_campaigns c where c.id=campaign_id and public.cvoa_can_read_post(c.post_id)));
revoke all on public.launch_standards,public.launch_location_checks,public.launch_payment_allocations from anon,authenticated;
grant select on public.launch_standards,public.launch_location_checks,public.launch_payment_allocations to authenticated;
-- Existing campaign status/results writes remain available; creation and entries use scoped RPCs.
revoke insert on public.fundraising_campaigns,public.fundraising_entries from anon,authenticated;
create function public.cvoa_launch_standard(p_id uuid,p_label text,p_category text,p_required boolean,p_active boolean) returns void language plpgsql security definer set search_path='' as $$
declare location_change boolean; begin
 location_change=p_category='location' or exists(select 1 from public.launch_standards where id=p_id and category='location');
 if not public.is_national_role() then raise exception 'National access required.'; end if;
 insert into public.launch_standards(id,label,category,required,active) values(coalesce(p_id,gen_random_uuid()),trim(p_label),p_category,p_required,p_active)
 on conflict(id) do update set label=excluded.label,category=excluded.category,required=excluded.required,active=excluded.active;
 -- Changing location standards invalidates prior approvals for unopened locations.
 update public.launch_locations l set status='changes_requested',secured=false where location_change and status in ('approved','submitted') and exists(select 1 from public.post_launch_plans p where p.post_id=l.post_id and p.stage<>'open');
 update public.post_launch_plans set stage='location_review',version=version+1,updated_at=now() where location_change and stage in ('setup','opening_review');
end; $$;
create function public.cvoa_launch_mutate(p_post uuid,p_version integer,p_action text,p_data jsonb default '{}'::jsonb) returns void language plpgsql security definer set search_path='' as $$
declare p public.post_launch_plans; l public.launch_locations; ident uuid; next_stage text; decision text; criteria jsonb;
begin
 if not public.cvoa_can_manage_post(p_post) then raise exception 'Post staff access required.'; end if;
 if p_action='initialize' then
  if not exists(select 1 from public.posts where id=p_post and status in ('approved','founding_team_building','charter_ready','active_post')) then raise exception 'Complete National application approval before starting development.'; end if;
  insert into public.post_launch_plans(post_id,stage,owner_name,opened_at) select id,case when status='active_post' then 'open' else 'planning' end,coalesce(p_data->>'owner_name',''),case when status='active_post' then now() end from public.posts where id=p_post on conflict do nothing;
  if found then
   insert into public.launch_tasks(post_id,label,required) select p_post,label,required from public.launch_standards where category='opening' and active;
   insert into public.launch_history(post_id,actor_id,action,detail) values(p_post,auth.uid(),'initialize',p_data);
  end if; return;
 end if;
 select * into p from public.post_launch_plans where post_id=p_post for update;
 if not found then raise exception 'Start this launch workspace first.'; end if;
 if p.version is distinct from p_version then raise exception 'This plan changed. Refresh before saving.'; end if;
 if p_action='plan' then
  update public.post_launch_plans set owner_name=trim(coalesce(p_data->>'owner_name','')),target_date=nullif(p_data->>'target_date','')::date,services=coalesce(p_data->>'services',''),help_needed=coalesce(p_data->>'help_needed','') where post_id=p_post;
 elsif p_action='task' then
  ident=nullif(p_data->>'id','')::uuid;
  if ident is not null and not exists(select 1 from public.launch_tasks where id=ident and post_id=p_post) then raise exception 'Task unavailable.'; end if;
  if coalesce((p_data->>'required')::boolean,false) is distinct from coalesce((select required from public.launch_tasks where id=ident),false) and not public.is_national_role() then raise exception 'Only National sets required launch tasks.'; end if;
  if ident is not null and not public.is_national_role() and exists(select 1 from public.launch_tasks where id=ident and required and label is distinct from trim(p_data->>'label')) then raise exception 'Only National changes the text of required launch tasks.'; end if;
  insert into public.launch_tasks(id,post_id,label,owner_name,due_date,required,complete,note) values(coalesce(ident,gen_random_uuid()),p_post,trim(p_data->>'label'),coalesce(p_data->>'owner_name',''),nullif(p_data->>'due_date','')::date,coalesce((p_data->>'required')::boolean,false),coalesce((p_data->>'complete')::boolean,false),coalesce(p_data->>'note',''))
  on conflict(id) do update set label=excluded.label,owner_name=excluded.owner_name,due_date=excluded.due_date,required=excluded.required,complete=excluded.complete,note=excluded.note;
 elsif p_action='project_requirement' then
  if not public.is_national_role() then raise exception 'National sets required facility projects.'; end if;
  update public.post_facility_projects set required_for_opening=coalesce((p_data->>'required')::boolean,false) where id=(p_data->>'id')::uuid and post_id=p_post;
  if not found then raise exception 'Facility project unavailable.'; end if;
 elsif p_action='budget_starter' then
  if exists(select 1 from public.launch_budget_items where post_id=p_post) then raise exception 'Budget items already exist. Add individual items instead.'; end if;
  insert into public.launch_budget_items(post_id,label,amount_cents,category) values(p_post,'Lease deposit / purchase closing costs',0,'Location'),(p_post,'Initial occupancy costs',0,'Location'),(p_post,'Improvements outside facility modules',0,'Improvements'),(p_post,'Opening arrangements',0,'Opening'),(p_post,'Operating reserve',0,'Reserve');
 elsif p_action='budget' then
  ident=nullif(p_data->>'id','')::uuid;
  if ident is not null and not exists(select 1 from public.launch_budget_items where id=ident and post_id=p_post) then raise exception 'Budget item unavailable.'; end if;
  insert into public.launch_budget_items(id,post_id,label,amount_cents,category) values(coalesce(ident,gen_random_uuid()),p_post,trim(p_data->>'label'),(p_data->>'amount_cents')::bigint,coalesce(p_data->>'category','Other'))
  on conflict(id) do update set label=excluded.label,amount_cents=excluded.amount_cents,category=excluded.category,approved=false;
 elsif p_action='budget_approve' then
  if not public.is_national_role() then raise exception 'National approval required.'; end if;
  update public.launch_budget_items set approved=coalesce((p_data->>'approved')::boolean,false) where id=(p_data->>'id')::uuid and post_id=p_post;
  if not found then raise exception 'Budget item unavailable.'; end if;
 elsif p_action='location' then
  ident=nullif(p_data->>'id','')::uuid;
  if ident is not null and not exists(select 1 from public.launch_locations where id=ident and post_id=p_post) then raise exception 'Location unavailable.'; end if;
  if nullif(trim(p_data->>'name'),'') is null or nullif(trim(p_data->>'address'),'') is null then raise exception 'Enter the location name and address.'; end if;
  insert into public.launch_locations(id,post_id,name,address,tenure,monthly_cost_cents,upfront_cost_cents,square_feet,details) values(coalesce(ident,gen_random_uuid()),p_post,trim(p_data->>'name'),trim(p_data->>'address'),p_data->>'tenure',(p_data->>'monthly_cost_cents')::bigint,(p_data->>'upfront_cost_cents')::bigint,nullif(p_data->>'square_feet','')::integer,coalesce(p_data->>'details',''))
  on conflict(id) do update set name=excluded.name,address=excluded.address,tenure=excluded.tenure,monthly_cost_cents=excluded.monthly_cost_cents,upfront_cost_cents=excluded.upfront_cost_cents,square_feet=excluded.square_feet,details=excluded.details,status='draft',secured=false,revision=public.launch_locations.revision+1;
  if ident=p.selected_location_id and p.stage in ('setup','opening_review') then update public.post_launch_plans set stage='location_review' where post_id=p_post; end if;
 elsif p_action='location_check' then
  ident=(p_data->>'location_id')::uuid;
  if not exists(select 1 from public.launch_locations where id=ident and post_id=p_post) then raise exception 'Location unavailable.'; end if;
  if not exists(select 1 from public.launch_standards where id=(p_data->>'standard_id')::uuid and active and category='location') then raise exception 'Standard unavailable.'; end if;
  insert into public.launch_location_checks(location_id,standard_id,response,note) values(ident,(p_data->>'standard_id')::uuid,p_data->>'response',coalesce(p_data->>'note','')) on conflict(location_id,standard_id) do update set response=excluded.response,note=excluded.note;
  update public.launch_locations set status='draft',secured=false,revision=revision+1 where id=ident;
  if ident=p.selected_location_id and p.stage in ('setup','opening_review') then update public.post_launch_plans set stage='location_review' where post_id=p_post; end if;
 elsif p_action='location_submit' then
  select * into l from public.launch_locations where id=(p_data->>'id')::uuid and post_id=p_post;
  if not found then raise exception 'Location unavailable.'; end if;
  if exists(select 1 from public.launch_standards s where s.active and s.category='location' and s.required and not exists(select 1 from public.launch_location_checks c where c.location_id=l.id and c.standard_id=s.id and c.response='yes')) then raise exception 'Complete all required location standards before submitting.'; end if;
  update public.launch_locations set status='submitted',secured=false,submitted_at=now() where id=l.id;
  update public.post_launch_plans set selected_location_id=l.id,stage=case when p.stage='open' then 'open' else 'location_review' end where post_id=p_post;
 elsif p_action='location_review' then
  if not public.is_national_role() then raise exception 'National review required.'; end if;
  select * into l from public.launch_locations where id=(p_data->>'id')::uuid and post_id=p_post;
  if not found or l.status<>'submitted' or l.id is distinct from p.selected_location_id then raise exception 'Review the currently submitted location.'; end if;
  decision=p_data->>'decision';
  if decision not in ('approved','changes_requested','declined') or nullif(trim(p_data->>'feedback'),'') is null then raise exception 'Choose a decision and explain it.'; end if;
  if decision='approved' and exists(select 1 from public.launch_standards s where s.active and s.category='location' and s.required and not exists(select 1 from public.launch_location_checks c where c.location_id=l.id and c.standard_id=s.id and c.response='yes')) then raise exception 'Required location standards are incomplete.'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('label',s.label,'required',s.required,'response',coalesce(c.response,'unknown'),'note',c.note)),'[]'::jsonb) into criteria from public.launch_standards s left join public.launch_location_checks c on c.standard_id=s.id and c.location_id=l.id where s.active and s.category='location';
  insert into public.launch_reviews(post_id,location_id,actor_id,decision,feedback,snapshot) values(p_post,l.id,auth.uid(),decision,trim(p_data->>'feedback'),jsonb_build_object('location',to_jsonb(l),'standards',criteria,'documents',(select coalesce(jsonb_agg(to_jsonb(d)),'[]'::jsonb) from public.launch_documents d where d.location_id=l.id)));
  update public.launch_locations set status=decision where id=l.id;
  if p.stage<>'open' then update public.post_launch_plans set stage=case when decision='approved' then 'setup' else 'location_review' end where post_id=p_post; end if;
 elsif p_action='location_secured' then
  update public.launch_locations set secured=coalesce((p_data->>'secured')::boolean,false) where id=p.selected_location_id and status='approved' and post_id=p_post;
  if not found then raise exception 'Secure the approved location first.'; end if;
  if not coalesce((p_data->>'secured')::boolean,false) and p.stage='opening_review' then update public.post_launch_plans set stage='setup' where post_id=p_post; end if;
 elsif p_action='document' then
  ident=nullif(p_data->>'location_id','')::uuid;
  if ident is not null and not exists(select 1 from public.launch_locations where id=ident and post_id=p_post) then raise exception 'Location unavailable.'; end if;
  if not exists(select 1 from public.cvoa_drive_items d join public.cvoa_drive_workspaces w on w.id=d.workspace_id where d.storage_path=p_data->>'path' and w.post_id=p_post and d.kind='file' and d.deleted_at is null) or not exists(select 1 from storage.objects where bucket_id='ncc-drive' and name=p_data->>'path') then raise exception 'Upload the document to this post drive first.'; end if;
  insert into public.launch_documents(post_id,location_id,name,path,created_by) values(p_post,ident,p_data->>'name',p_data->>'path',auth.uid());
  if ident is not null then
   update public.launch_locations set status='draft',secured=false,revision=revision+1 where id=ident;
   if ident=p.selected_location_id and p.stage in ('setup','opening_review') then update public.post_launch_plans set stage='location_review' where post_id=p_post; end if;
  end if;
 elsif p_action='stage' then
  next_stage=p_data->>'stage';
  if p.stage='planning' and next_stage='funding' then
   if p.owner_name='' or p.target_date is null or p.services='' then raise exception 'Set a launch owner, target date and initial services first.'; end if;
  elsif p.stage='setup' and next_stage='opening_review' then
   if p.owner_name='' or p.target_date is null or p.services='' then raise exception 'Set a launch owner, target date and initial services first.'; end if;
   if not exists(select 1 from public.launch_locations where id=p.selected_location_id and status='approved' and secured) then raise exception 'A National-approved, secured location is required.'; end if;
   if exists(select 1 from public.launch_tasks where post_id=p_post and required and not complete) then raise exception 'Complete required launch tasks first.'; end if;
   if exists(select 1 from public.post_facility_projects f where f.post_id=p_post and f.required_for_opening and (f.status<>'complete' or exists(select 1 from public.post_facility_checklist_items c where c.project_id=f.id and not c.is_complete))) then raise exception 'Complete National-required facility projects and their checklists before opening review.'; end if;
  elsif p.stage='opening_review' and next_stage in ('open','setup') then
   if not public.is_national_role() then raise exception 'National opening approval required.'; end if;
   if nullif(trim(p_data->>'feedback'),'') is null then raise exception 'Record the opening decision and any conditions.'; end if;
   if next_stage='open' and (exists(select 1 from public.launch_tasks where post_id=p_post and required and not complete) or not exists(select 1 from public.launch_locations where id=p.selected_location_id and status='approved' and secured) or exists(select 1 from public.post_facility_projects f where f.post_id=p_post and f.required_for_opening and (f.status<>'complete' or exists(select 1 from public.post_facility_checklist_items c where c.project_id=f.id and not c.is_complete)))) then raise exception 'Opening requirements changed. Review them again.'; end if;
   insert into public.launch_reviews(post_id,actor_id,decision,feedback,snapshot) values(p_post,auth.uid(),next_stage,trim(p_data->>'feedback'),jsonb_build_object('plan',to_jsonb(p),'tasks',(select coalesce(jsonb_agg(to_jsonb(t)),'[]'::jsonb) from public.launch_tasks t where t.post_id=p_post)));
  else raise exception 'Use the location submission and National approval steps to advance this stage.';
  end if;
  update public.post_launch_plans set stage=next_stage,opened_at=case when next_stage='open' then now() else opened_at end where post_id=p_post;
  if next_stage='open' then update public.posts set status='active_post',name=regexp_replace(name,' \(Forming\)$','') where id=p_post; end if;
 else raise exception 'Unknown launch action.'; end if;
 update public.post_launch_plans set version=version+1,updated_at=now() where post_id=p_post;
 insert into public.launch_history(post_id,actor_id,action,detail) values(p_post,auth.uid(),p_action,p_data);
end; $$;
create function public.cvoa_launch_project_guard() returns trigger language plpgsql security definer set search_path='' as $$ begin
 if auth.uid() is not null and not public.is_national_role() then
  if tg_op='DELETE' and old.required_for_opening then raise exception 'National controls required facility projects.'; end if;
  if tg_op='INSERT' and new.required_for_opening then raise exception 'National sets required facility projects.'; end if;
  if tg_op='UPDATE' and (new.required_for_opening is distinct from old.required_for_opening or (old.required_for_opening and new.module_id is distinct from old.module_id)) then raise exception 'National sets required facility projects.'; end if;
 end if;
 if tg_op='DELETE' then return old; end if; return new;
end; $$;
create trigger launch_project_guard before insert or update or delete on public.post_facility_projects for each row execute function public.cvoa_launch_project_guard();
create function public.cvoa_launch_checklist_guard() returns trigger language plpgsql security definer set search_path='' as $$ begin
 if auth.uid() is not null and not public.is_national_role() and exists(select 1 from public.post_facility_projects where id=old.project_id and required_for_opening) then
  if tg_op='DELETE' or (tg_op='UPDATE' and (new.label is distinct from old.label or new.project_id is distinct from old.project_id)) then raise exception 'National controls required facility checklist items.'; end if;
 end if;
 if tg_op='DELETE' then return old; end if; return new;
end; $$;
create trigger launch_checklist_guard before update or delete on public.post_facility_checklist_items for each row execute function public.cvoa_launch_checklist_guard();
-- A managed launch cannot bypass opening review through the older post status screen.
create function public.cvoa_launch_post_guard() returns trigger language plpgsql security definer set search_path='' as $$ begin
 if new.status='active_post' and old.status<>'active_post' and exists(select 1 from public.post_launch_plans where post_id=new.id and stage<>'open') then raise exception 'Approve opening in Post Development first.'; end if; return new;
end; $$;
create trigger launch_post_guard before update of status on public.posts for each row execute function public.cvoa_launch_post_guard();
create function public.cvoa_launch_campaign(p_post uuid,p_id uuid,p_data jsonb) returns uuid language plpgsql security definer set search_path='' as $$ declare ident uuid:=coalesce(p_id,gen_random_uuid()); begin
 if not public.cvoa_can_manage_post(p_post) then raise exception 'Post staff access required.'; end if;
 if p_id is not null and not exists(select 1 from public.fundraising_campaigns where id=p_id and post_id=p_post) then raise exception 'Campaign unavailable.'; end if;
 if coalesce((p_data->>'published')::boolean,false) and nullif(trim(p_data->>'story'),'') is null then raise exception 'Write the public campaign story before publishing.'; end if;
 if coalesce((p_data->>'published')::boolean,false) and not public.is_national_role() and not coalesce((select published from public.fundraising_campaigns where id=p_id),false) then raise exception 'National approves public campaign publishing.'; end if;
 insert into public.fundraising_campaigns(id,post_id,title,goal_cents,owner_name,deadline,launch_funding,story,published,created_by) values(ident,p_post,trim(p_data->>'title'),(p_data->>'goal_cents')::bigint,trim(p_data->>'owner_name'),(p_data->>'deadline')::date,coalesce((p_data->>'launch_funding')::boolean,false),coalesce(p_data->>'story',''),coalesce((p_data->>'published')::boolean,false),auth.uid())
 on conflict(id) do update set title=excluded.title,goal_cents=excluded.goal_cents,owner_name=excluded.owner_name,deadline=excluded.deadline,launch_funding=excluded.launch_funding,story=excluded.story,published=case when public.is_national_role() then excluded.published when public.fundraising_campaigns.story is distinct from excluded.story or public.fundraising_campaigns.title is distinct from excluded.title or public.fundraising_campaigns.goal_cents is distinct from excluded.goal_cents then false else public.fundraising_campaigns.published end;
 return ident;
end; $$;
create function public.cvoa_launch_entry(p_campaign uuid,p_type text,p_cents bigint,p_date date,p_description text,p_project uuid default null) returns void language plpgsql security definer set search_path='' as $$ declare c public.fundraising_campaigns; tx uuid; begin
 select * into c from public.fundraising_campaigns where id=p_campaign for update;
 if not found or not public.cvoa_can_manage_post(c.post_id) then raise exception 'Campaign unavailable.'; end if;
 if c.status='completed' then raise exception 'Reopen this campaign before recording entries.'; end if;
 if p_type not in ('income','expense') or p_cents<=0 or p_cents>99999999999 or nullif(trim(p_description),'') is null then raise exception 'Enter a valid amount, type and description.'; end if;
 if p_project is not null and (p_type<>'expense' or not exists(select 1 from public.post_facility_projects where id=p_project and post_id=c.post_id)) then raise exception 'Select a facility project in this post for expenses.'; end if;
 insert into public.financial_transactions(post_id,transaction_type,category,amount,description,transaction_date,created_by,facility_project_id) values(c.post_id,p_type::public.ledger_transaction_type,'Fundraising',p_cents/100.0,p_description,p_date,auth.uid(),p_project) returning id into tx;
 insert into public.fundraising_entries(campaign_id,entry_type,amount_cents,entry_date,description,recorded_by,financial_transaction_id) values(c.id,p_type,p_cents,p_date,trim(p_description),auth.uid(),tx);
end; $$;
create function public.cvoa_launch_allocate(p_payment uuid,p_campaign uuid) returns void language plpgsql security definer set search_path='' as $$ declare c public.fundraising_campaigns; receipt public.sponsor_payments; begin
 select * into c from public.fundraising_campaigns where id=p_campaign for update;
 select * into receipt from public.sponsor_payments where id=p_payment for update;
 if c.id is null or receipt.id is null or not public.cvoa_can_manage_post(c.post_id) or receipt.post_id is distinct from c.post_id then raise exception 'Select a received payment from this post.'; end if;
 if receipt.stripe_livemode=false then raise exception 'Test payments do not fund campaigns.'; end if;
 insert into public.launch_payment_allocations(payment_id,campaign_id,allocated_by) values(p_payment,p_campaign,auth.uid()) on conflict(payment_id) do update set campaign_id=excluded.campaign_id,allocated_by=excluded.allocated_by;
end; $$;
create function public.cvoa_launch_directory() returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'state',p.state,'status',p.status,'plan',to_jsonb(l),'pending_locations',(select count(*) from public.launch_locations x where x.post_id=p.id and x.status='submitted'),'overdue_tasks',(select count(*) from public.launch_tasks t where t.post_id=p.id and not complete and due_date<current_date)) order by p.state,p.name),'[]'::jsonb) from public.posts p left join public.post_launch_plans l on l.post_id=p.id where public.cvoa_can_read_post(p.id);
$$;
create policy launch_proof_read on storage.objects for select to authenticated using(bucket_id='ncc-drive' and exists(select 1 from public.launch_documents d where d.path=name and public.cvoa_can_read_post(d.post_id)));
revoke all on function public.cvoa_launch_mutate(uuid,integer,text,jsonb),public.cvoa_launch_standard(uuid,text,text,boolean,boolean),public.cvoa_launch_campaign(uuid,uuid,jsonb),public.cvoa_launch_entry(uuid,text,bigint,date,text,uuid),public.cvoa_launch_allocate(uuid,uuid),public.cvoa_launch_directory() from public,anon;
grant execute on function public.cvoa_launch_mutate(uuid,integer,text,jsonb),public.cvoa_launch_standard(uuid,text,text,boolean,boolean),public.cvoa_launch_campaign(uuid,uuid,jsonb),public.cvoa_launch_entry(uuid,text,bigint,date,text,uuid),public.cvoa_launch_allocate(uuid,uuid),public.cvoa_launch_directory() to authenticated;

create table public.campaign_checkout_requests (
 id uuid primary key,campaign_id uuid not null references public.fundraising_campaigns(id),amount_cents integer not null check(amount_cents between 100 and 99999999),session_id text unique,url text,livemode boolean,status text not null default 'draft' check(status in ('draft','open','paid','expired')),expires_at timestamptz,created_at timestamptz not null default now()
);
create table public.campaign_donations (
 id uuid primary key default gen_random_uuid(),request_id uuid not null unique references public.campaign_checkout_requests(id),campaign_id uuid not null references public.fundraising_campaigns(id),amount_cents integer not null,refunded_cents integer not null default 0 check(refunded_cents>=0 and refunded_cents<=amount_cents),stripe_intent text not null unique,livemode boolean not null,paid_at timestamptz not null
);
alter table public.campaign_checkout_requests enable row level security;
alter table public.campaign_donations enable row level security;
create policy donation_requests_read on public.campaign_checkout_requests for select to authenticated using(exists(select 1 from public.fundraising_campaigns c where c.id=campaign_id and public.cvoa_can_read_post(c.post_id)));
create policy donations_read on public.campaign_donations for select to authenticated using(exists(select 1 from public.fundraising_campaigns c where c.id=campaign_id and public.cvoa_can_read_post(c.post_id)));
revoke all on public.campaign_checkout_requests,public.campaign_donations from anon,authenticated;
grant select on public.campaign_checkout_requests,public.campaign_donations to authenticated;
grant select,insert,update on public.campaign_checkout_requests,public.campaign_donations to service_role;
create function public.cvoa_campaign_request(p_slug uuid,p_cents integer,p_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$ declare c public.fundraising_campaigns; r public.campaign_checkout_requests; begin
 select * into c from public.fundraising_campaigns where public_slug=p_slug and published and status='active' for update;
 if not found then raise exception 'This campaign is not accepting donations.'; end if;
 if p_cents<100 or p_cents>99999999 then raise exception 'Enter an amount from $1 to $999,999.99.'; end if;
 select * into r from public.campaign_checkout_requests where id=p_id;
 if found then
  if r.campaign_id<>c.id or r.amount_cents<>p_cents then raise exception 'Payment request changed.'; end if; return to_jsonb(r)||jsonb_build_object('title',c.title);
 end if;
 if (select count(*) from public.campaign_checkout_requests where campaign_id=c.id and created_at>now()-interval '1 hour')>=200 then raise exception 'Too many checkout requests. Please try again later.'; end if;
 insert into public.campaign_checkout_requests(id,campaign_id,amount_cents) values(p_id,c.id,p_cents) returning * into r;
 return to_jsonb(r)||jsonb_build_object('title',c.title);
end; $$;
create function public.cvoa_campaign_fulfill(p_request uuid,p_session text,p_amount integer,p_currency text,p_intent text,p_paid_at timestamptz,p_live boolean) returns boolean language plpgsql security definer set search_path='' as $$ declare r public.campaign_checkout_requests; begin
 select * into r from public.campaign_checkout_requests where id=p_request for update;
 if not found or r.session_id is distinct from p_session or r.amount_cents is distinct from p_amount or p_currency is distinct from 'usd' or r.livemode is distinct from p_live or nullif(p_intent,'') is null then raise exception 'Payment does not match this campaign request.'; end if;
 if r.status='paid' then return false; end if;
 insert into public.campaign_donations(request_id,campaign_id,amount_cents,stripe_intent,livemode,paid_at) values(r.id,r.campaign_id,p_amount,p_intent,p_live,p_paid_at);
 if p_live then insert into public.financial_transactions(post_id,transaction_type,category,amount,description,transaction_date) select post_id,'income','Campaign Donation',p_amount/100.0,'Verified campaign donation '||r.id,p_paid_at::date from public.fundraising_campaigns where id=r.campaign_id; end if;
 update public.campaign_checkout_requests set status='paid' where id=r.id; return true;
end; $$;
create function public.cvoa_campaign_refund(p_intent text,p_refunded_cents integer) returns void language plpgsql security definer set search_path='' as $$ declare d public.campaign_donations; begin
 select * into d from public.campaign_donations where stripe_intent=p_intent for update;
 if not found then return; end if;
 if p_refunded_cents is null or p_refunded_cents<0 or p_refunded_cents>d.amount_cents then raise exception 'Invalid refund amount.'; end if;
 if d.livemode and p_refunded_cents>d.refunded_cents then insert into public.financial_transactions(post_id,transaction_type,category,amount,description,transaction_date) select post_id,'expense','Campaign Refund',(p_refunded_cents-d.refunded_cents)/100.0,'Verified refund for campaign donation '||d.request_id,current_date from public.fundraising_campaigns where id=d.campaign_id; end if;
 update public.campaign_donations set refunded_cents=greatest(refunded_cents,p_refunded_cents) where id=d.id;
end; $$;
create function public.cvoa_campaign_received(p_campaign uuid) returns bigint language sql stable security definer set search_path='' as $$
 select coalesce((select sum(amount_cents) from public.fundraising_entries where campaign_id=p_campaign and entry_type='income' and voided_at is null),0)+coalesce((select sum(round((p.amount-p.refunded_amount)*100)) from public.launch_payment_allocations a join public.sponsor_payments p on p.id=a.payment_id where a.campaign_id=p_campaign and p.stripe_livemode is distinct from false),0)+coalesce((select sum(amount_cents-refunded_cents) from public.campaign_donations where campaign_id=p_campaign and livemode),0);
$$;
create function public.cvoa_launch_totals(p_post uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$ declare goal bigint; received bigint; spent bigint; begin
 if not public.cvoa_can_read_post(p_post) then raise exception 'Post access required.'; end if;
 select coalesce(sum(amount_cents),0) into goal from public.launch_budget_items where post_id=p_post;
 goal=goal+coalesce((select sum(round(target_budget*100)) from public.post_facility_projects where post_id=p_post and opening_scope),0);
 select coalesce(sum(public.cvoa_campaign_received(id)),0) into received from public.fundraising_campaigns where post_id=p_post and launch_funding;
 select coalesce(sum(e.amount_cents),0) into spent from public.fundraising_entries e join public.fundraising_campaigns c on c.id=e.campaign_id where c.post_id=p_post and c.launch_funding and e.entry_type='expense' and e.voided_at is null;
 spent=spent+coalesce((select sum(round(t.amount*100)) from public.financial_transactions t where t.post_id=p_post and exists(select 1 from public.post_facility_projects f where f.id=t.facility_project_id and f.opening_scope) and t.transaction_type='expense' and not exists(select 1 from public.fundraising_entries v where v.financial_transaction_id=t.id and v.voided_at is not null) and not exists(select 1 from public.fundraising_entries e join public.fundraising_campaigns c on c.id=e.campaign_id where e.financial_transaction_id=t.id and c.launch_funding)),0);
 return jsonb_build_object('budget_cents',goal,'received_cents',received,'spent_cents',spent,'available_cents',received-spent,'remaining_cents',greatest(goal-received,0),'pledged_cents',coalesce((select sum(round(sponsorship_value*100)) from public.sponsors where post_id=p_post and stage='won'),0));
end; $$;
create or replace function public.cvoa_launch_directory() returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'state',p.state,'status',p.status,'plan',to_jsonb(l),'funding',public.cvoa_launch_totals(p.id),'pending_locations',(select count(*) from public.launch_locations x where x.post_id=p.id and x.status='submitted'),'overdue_tasks',(select count(*) from public.launch_tasks t where t.post_id=p.id and not complete and due_date<current_date)) order by p.state,p.name),'[]'::jsonb) from public.posts p left join public.post_launch_plans l on l.post_id=p.id where public.cvoa_can_read_post(p.id);
$$;
create function public.cvoa_public_campaign(p_slug uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('slug',c.public_slug,'title',c.title,'story',c.story,'goal_cents',c.goal_cents,'received_cents',public.cvoa_campaign_received(c.id),'status',c.status,'deadline',c.deadline,'post_name',p.name,'state',p.state) from public.fundraising_campaigns c join public.posts p on p.id=c.post_id where c.public_slug=p_slug and c.published;
$$;
revoke all on function public.cvoa_campaign_request(uuid,integer,uuid),public.cvoa_campaign_fulfill(uuid,text,integer,text,text,timestamptz,boolean),public.cvoa_campaign_refund(text,integer),public.cvoa_campaign_received(uuid) from public,anon,authenticated;
grant execute on function public.cvoa_campaign_request(uuid,integer,uuid),public.cvoa_campaign_fulfill(uuid,text,integer,text,text,timestamptz,boolean),public.cvoa_campaign_refund(text,integer) to service_role;
revoke all on function public.cvoa_launch_totals(uuid),public.cvoa_public_campaign(uuid) from public;
grant execute on function public.cvoa_launch_totals(uuid) to authenticated;
grant execute on function public.cvoa_public_campaign(uuid) to anon,authenticated;

alter function public.cvoa_action_queue() rename to cvoa_operations_action_queue;
revoke all on function public.cvoa_operations_action_queue() from public,anon,authenticated;
create function public.cvoa_action_queue() returns jsonb language plpgsql stable security definer set search_path='' as $$ declare existing jsonb; added jsonb; result jsonb; begin
 existing=public.cvoa_operations_action_queue();
 with entries as (
 select 'launch-location:'||l.id as id,'Review location: '||p.name as title,l.submitted_at::date as due_date,'review'::text as kind,'/post-development?post='||p.id||'&tab=locations' as path from public.launch_locations l join public.posts p on p.id=l.post_id where l.status='submitted' and public.is_national_role()
 union all select 'launch-opening:'||p.id,'Review opening: '||p.name,l.updated_at::date,'review','/post-development?post='||p.id from public.posts p join public.post_launch_plans l on l.post_id=p.id where l.stage='opening_review' and public.is_national_role()
 union all select 'launch-task:'||t.id,t.label,t.due_date,'task','/post-development?post='||t.post_id||'&tab=tasks' from public.launch_tasks t where not complete and due_date<=current_date and public.cvoa_can_read_post(t.post_id)
 union all select 'launch-help:'||l.post_id,'Launch help: '||p.name,l.updated_at::date,'review','/post-development?post='||l.post_id from public.post_launch_plans l join public.posts p on p.id=l.post_id where l.help_needed<>'' and public.cvoa_can_oversee_post(l.post_id)
 ) select coalesce(jsonb_agg(to_jsonb(entries)),'[]'::jsonb) into added from entries;
 select coalesce(jsonb_agg(x),'[]'::jsonb) into result from (select x from jsonb_array_elements(coalesce(existing->'items','[]'::jsonb)||added) x order by x->>'due_date',x->>'id' limit 100) limited;
 return jsonb_build_object('total',coalesce((existing->>'total')::int,0)+jsonb_array_length(added),'items',result);
end; $$;
revoke all on function public.cvoa_action_queue() from public,anon;
grant execute on function public.cvoa_action_queue() to authenticated;

create function public.cvoa_launch_void_entry(p_entry uuid,p_reason text) returns void language plpgsql security definer set search_path='' as $$ declare e public.fundraising_entries; post uuid; tx public.financial_transactions; begin
 select * into e from public.fundraising_entries where id=p_entry for update;
 select post_id into post from public.fundraising_campaigns where id=e.campaign_id;
 if e.id is null or not public.cvoa_can_manage_post(post) then raise exception 'Entry unavailable.'; end if;
 if nullif(trim(p_reason),'') is null then raise exception 'Explain why this record is being voided.'; end if;
 if e.voided_at is not null then return; end if;
 update public.fundraising_entries set voided_at=now(),void_reason=trim(p_reason),voided_by=auth.uid() where id=e.id;
 if e.financial_transaction_id is not null then
  select * into tx from public.financial_transactions where id=e.financial_transaction_id;
  insert into public.financial_transactions(post_id,transaction_type,category,amount,description,transaction_date,created_by,facility_project_id) values(post,case when tx.transaction_type='income' then 'expense'::public.ledger_transaction_type else 'income'::public.ledger_transaction_type end,'Correction',tx.amount,'Void fundraising entry '||e.id||': '||trim(p_reason),current_date,auth.uid(),tx.facility_project_id);
 end if;
 if exists(select 1 from public.post_launch_plans where post_id=post) then insert into public.launch_history(post_id,actor_id,action,detail) values(post,auth.uid(),'entry_voided',jsonb_build_object('entry_id',e.id,'feedback',trim(p_reason))); end if;
end; $$;
revoke all on function public.cvoa_launch_void_entry(uuid,text) from public,anon;
grant execute on function public.cvoa_launch_void_entry(uuid,text) to authenticated;
create index launch_location_post on public.launch_locations(post_id,status);
create index launch_task_post on public.launch_tasks(post_id,complete,due_date);
create index launch_budget_post on public.launch_budget_items(post_id);
create index launch_history_post on public.launch_history(post_id,created_at desc);
create index launch_document_post on public.launch_documents(post_id);
create index launch_review_post on public.launch_reviews(post_id,created_at desc);
create index launch_allocation_campaign on public.launch_payment_allocations(campaign_id);
create index campaign_checkout_rate on public.campaign_checkout_requests(campaign_id,created_at);
create index campaign_donation_totals on public.campaign_donations(campaign_id,livemode);
commit;
