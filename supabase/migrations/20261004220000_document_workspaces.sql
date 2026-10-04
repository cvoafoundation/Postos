begin;
create table public.cvoa_drive_workspaces (
 id uuid primary key default gen_random_uuid(),kind text not null check(kind in ('national','state','post')),name text not null,state text,post_id uuid references public.posts(id),created_at timestamptz not null default now(),
 check((kind='national' and state is null and post_id is null) or (kind='state' and state is not null and state ~ '^[A-Z]{2}$' and post_id is null) or (kind='post' and post_id is not null))
);
create unique index drive_national_workspace on public.cvoa_drive_workspaces(kind) where kind='national';
create unique index drive_state_workspace on public.cvoa_drive_workspaces(state) where kind='state';
create unique index drive_post_workspace on public.cvoa_drive_workspaces(post_id) where kind='post';
create table public.cvoa_drive_items (
 id uuid primary key default gen_random_uuid(),workspace_id uuid not null references public.cvoa_drive_workspaces(id),parent_id uuid references public.cvoa_drive_items(id),
 kind text not null check(kind in ('folder','document','file')),name text not null check(length(trim(name)) between 1 and 200),
 storage_path text,mime_type text,file_size bigint,content jsonb,version integer not null default 1,
 stage text not null default 'draft' check(stage in ('draft','review','approved','superseded')),is_template boolean not null default false,
 created_by uuid references public.profiles(id),updated_by uuid references public.profiles(id),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),deleted_at timestamptz,
 check(kind='folder' or (kind='document' and content is not null) or (kind='file' and storage_path is not null))
);
create index drive_items_parent on public.cvoa_drive_items(workspace_id,parent_id,deleted_at);
create index drive_item_ancestors on public.cvoa_drive_items(parent_id);
create index drive_item_blob on public.cvoa_drive_items(storage_path) where storage_path is not null;
create table public.cvoa_drive_revisions (
 id uuid primary key default gen_random_uuid(),item_id uuid not null references public.cvoa_drive_items(id),version integer not null,content jsonb,storage_path text,mime_type text,file_size bigint,
 name text not null,stage text not null,created_by uuid references public.profiles(id),created_at timestamptz not null default now(),unique(item_id,version)
);
create table public.cvoa_drive_shares (
 id uuid primary key default gen_random_uuid(),item_id uuid not null references public.cvoa_drive_items(id),recipient_workspace_id uuid references public.cvoa_drive_workspaces(id),
 permission text not null check(permission in ('view','comment','edit')),expires_at timestamptz,revoked_at timestamptz,created_by uuid references public.profiles(id),created_at timestamptz not null default now(),
 legacy_all_members boolean not null default false,check(recipient_workspace_id is not null or legacy_all_members)
);
create index drive_shares_item on public.cvoa_drive_shares(item_id) where revoked_at is null;
create table public.cvoa_drive_comments (
 id uuid primary key default gen_random_uuid(),item_id uuid not null references public.cvoa_drive_items(id),author_id uuid not null references public.profiles(id),body text not null check(length(trim(body)) between 1 and 3000),created_at timestamptz not null default now()
);
create table public.cvoa_drive_favorites (
 item_id uuid not null references public.cvoa_drive_items(id),profile_id uuid not null references public.profiles(id),primary key(item_id,profile_id)
);
create table public.cvoa_drive_activity (
 id uuid primary key default gen_random_uuid(),item_id uuid references public.cvoa_drive_items(id),actor_id uuid references public.profiles(id),action text not null,detail jsonb not null default '{}'::jsonb,created_at timestamptz not null default now()
);
create index drive_revision_blob on public.cvoa_drive_revisions(storage_path) where storage_path is not null;
create index drive_comments_item on public.cvoa_drive_comments(item_id,created_at);
create index drive_activity_item on public.cvoa_drive_activity(item_id,created_at);
create index drive_favorites_profile on public.cvoa_drive_favorites(profile_id);
-- Workspaces are organization-owned; appointments supply authority.
create function public.cvoa_drive_sync_workspaces() returns void language sql security definer set search_path='' as $$
 insert into public.cvoa_drive_workspaces(kind,name) values('national','National / NCC') on conflict do nothing;
 insert into public.cvoa_drive_workspaces(kind,name,state) select 'state',upper(state)||' State Workspace',upper(state) from (select state from public.posts union select state from public.profiles where role='state_commander' union select state from public.access_appointments where role='state_commander' and revoked_at is null) states where state ~* '^[a-z]{2}$' group by upper(state) on conflict do nothing;
 insert into public.cvoa_drive_workspaces(kind,name,state,post_id) select 'post',name,upper(state),id from public.posts on conflict do nothing;
 update public.cvoa_drive_workspaces w set name=p.name,state=upper(p.state) from public.posts p where w.post_id=p.id and w.kind='post' and (w.name is distinct from p.name or w.state is distinct from upper(p.state));
$$;
revoke all on function public.cvoa_drive_sync_workspaces() from public,anon,authenticated;
select public.cvoa_drive_sync_workspaces();
create function public.cvoa_drive_workspace_level(p_workspace uuid) returns integer language sql stable security definer set search_path='' as $$
 select case when not public.cvoa_access_enabled() then 0 when public.is_national_role() then 4 else coalesce((select max(case
 when w.kind='state' and s.role='state_commander' and upper(s.state)=w.state then 4
 when w.kind='post' and s.role='post_commander' and s.post_id=w.post_id then 4
 when w.kind='post' and s.role='post_officer' and s.post_id=w.post_id then 3
 when w.kind='post' and s.role='state_commander' and upper(s.state)=w.state then 1 else 0 end)
 from public.cvoa_drive_workspaces w cross join public.cvoa_access_scopes(auth.uid()) s where w.id=p_workspace),0) end;
$$;
create function public.cvoa_drive_item_level(p_item uuid) returns integer language plpgsql stable security definer set search_path='' as $$
declare w uuid; base integer; extra integer; archived boolean; begin
 if not public.cvoa_access_enabled() then return 0; end if;
 select workspace_id into w from public.cvoa_drive_items where id=p_item; if not found then return 0; end if;
 base:=public.cvoa_drive_workspace_level(w);
 with recursive parents as (select id,parent_id,deleted_at from public.cvoa_drive_items where id=p_item union all select i.id,i.parent_id,i.deleted_at from public.cvoa_drive_items i join parents p on i.id=p.parent_id)
 select bool_or(deleted_at is not null),coalesce((select max(case s.permission when 'edit' then 3 when 'comment' then 2 else 1 end) from public.cvoa_drive_shares s where s.item_id in(select id from parents) and s.revoked_at is null and (s.expires_at is null or s.expires_at>now()) and (s.legacy_all_members or public.cvoa_drive_workspace_level(s.recipient_workspace_id)>0)),0) into archived,extra from parents;
 if archived and base<3 then return 0; end if;
 return greatest(base,extra);
end; $$;
-- Import existing National documents and explicit shares without changing storage paths.
insert into public.cvoa_drive_items(id,workspace_id,parent_id,kind,name,created_by,created_at,deleted_at)
 select f.id,w.id,f.parent_folder_id,'folder',left(f.name,200),f.created_by,f.created_at,f.deleted_at from public.drive_folders f cross join public.cvoa_drive_workspaces w where w.kind='national';
insert into public.cvoa_drive_items(id,workspace_id,parent_id,kind,name,storage_path,mime_type,file_size,created_by,created_at,deleted_at)
 select f.id,w.id,f.folder_id,'file',left(f.name,200),f.storage_path,f.mime_type,f.file_size,f.uploaded_by,f.created_at,f.deleted_at from public.drive_files f cross join public.cvoa_drive_workspaces w where w.kind='national';
insert into public.cvoa_drive_shares(item_id,permission,legacy_all_members,created_by)
 select id,'view',true,created_by from public.drive_folders where shared_with_posts;
insert into public.cvoa_drive_shares(item_id,recipient_workspace_id,permission,created_by)
 select f.id,w.id,'view',f.created_by from public.drive_folders f join public.cvoa_drive_workspaces w on w.post_id=f.shared_with_post_id and w.kind='post';
insert into public.cvoa_drive_revisions(item_id,version,name,stage,storage_path,mime_type,file_size,created_by,created_at)
 select id,version,name,stage,storage_path,mime_type,file_size,created_by,created_at from public.cvoa_drive_items where kind='file';
create function public.cvoa_drive_item_live(p_item uuid) returns boolean language sql stable security definer set search_path='' as $$
 with recursive parents as (select id,parent_id,deleted_at from public.cvoa_drive_items where id=p_item union all select i.id,i.parent_id,i.deleted_at from public.cvoa_drive_items i join parents p on i.id=p.parent_id) select exists(select 1 from parents) and not exists(select 1 from parents where deleted_at is not null);
$$;
create function public.cvoa_drive_live_ids(p_items uuid[]) returns uuid[] language sql stable security definer set search_path='' as $$
 select coalesce(array_agg(id),'{}'::uuid[]) from public.cvoa_drive_items where id=any(p_items) and public.cvoa_drive_item_level(id)>0 and public.cvoa_drive_item_live(id);
$$;
-- All writes go through checked RPCs, not arbitrary client metadata updates.
alter table public.cvoa_drive_workspaces enable row level security;
alter table public.cvoa_drive_items enable row level security;
alter table public.cvoa_drive_revisions enable row level security;
alter table public.cvoa_drive_shares enable row level security;
alter table public.cvoa_drive_comments enable row level security;
alter table public.cvoa_drive_favorites enable row level security;
alter table public.cvoa_drive_activity enable row level security;
create policy workspace_read on public.cvoa_drive_workspaces for select to authenticated using(public.cvoa_drive_workspace_level(id)>0);
create policy drive_item_read on public.cvoa_drive_items for select to authenticated using(public.cvoa_drive_item_level(id)>0);
create policy drive_revision_read on public.cvoa_drive_revisions for select to authenticated using(public.cvoa_drive_item_level(item_id)>0);
create policy drive_share_read on public.cvoa_drive_shares for select to authenticated using(public.cvoa_drive_item_level(item_id)>0);
create policy drive_comment_read on public.cvoa_drive_comments for select to authenticated using(public.cvoa_drive_item_level(item_id)>0);
create policy drive_comment_insert on public.cvoa_drive_comments for insert to authenticated with check(author_id=auth.uid() and public.cvoa_drive_item_level(item_id)>=2);
create policy drive_favorite_read on public.cvoa_drive_favorites for select to authenticated using(profile_id=auth.uid() and public.cvoa_drive_item_level(item_id)>0);
create policy drive_favorite_insert on public.cvoa_drive_favorites for insert to authenticated with check(profile_id=auth.uid() and public.cvoa_drive_item_level(item_id)>0);
create policy drive_favorite_delete on public.cvoa_drive_favorites for delete to authenticated using(profile_id=auth.uid());
create policy drive_activity_read on public.cvoa_drive_activity for select to authenticated using(public.cvoa_drive_item_level(item_id)>0);
grant select on public.cvoa_drive_workspaces,public.cvoa_drive_items,public.cvoa_drive_revisions,public.cvoa_drive_shares,public.cvoa_drive_comments,public.cvoa_drive_favorites,public.cvoa_drive_activity to authenticated;
grant insert on public.cvoa_drive_comments,public.cvoa_drive_favorites to authenticated;
grant delete on public.cvoa_drive_favorites to authenticated;
revoke insert,update,delete on public.cvoa_drive_workspaces,public.cvoa_drive_items,public.cvoa_drive_revisions,public.cvoa_drive_shares,public.cvoa_drive_activity from authenticated,anon;
create function public.cvoa_drive_directory() returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if not public.cvoa_access_enabled() then raise exception 'Active account access required.'; end if;
 perform public.cvoa_drive_sync_workspaces();
 return jsonb_build_object('workspaces',(select coalesce(jsonb_agg(to_jsonb(w)||jsonb_build_object('level',public.cvoa_drive_workspace_level(w.id)) order by w.kind,w.name),'[]'::jsonb) from public.cvoa_drive_workspaces w where public.cvoa_drive_workspace_level(w.id)>0),
 'recipients',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name,'kind',kind) order by kind,name),'[]'::jsonb) from public.cvoa_drive_workspaces where exists(select 1 from public.cvoa_access_scopes(auth.uid()) s where s.role in('national_commander','national_staff','state_commander','post_commander','post_officer'))));
end; $$;
create function public.cvoa_drive_create(p_workspace uuid,p_parent uuid,p_kind text,p_name text,p_content jsonb default null,p_path text default null,p_mime text default null,p_size bigint default null,p_id uuid default gen_random_uuid()) returns uuid language plpgsql security definer set search_path='' as $$
begin
 if public.cvoa_drive_workspace_level(p_workspace)<3 and not (p_parent is not null and exists(select 1 from public.cvoa_drive_items where id=p_parent and workspace_id=p_workspace and kind='folder' and public.cvoa_drive_item_level(id)>=3 and public.cvoa_drive_item_live(id))) then raise exception 'Workspace or shared-folder editing authority required.'; end if;
 if p_parent is not null and not exists(select 1 from public.cvoa_drive_items where id=p_parent and workspace_id=p_workspace and kind='folder' and deleted_at is null and public.cvoa_drive_item_level(id)>=3 and public.cvoa_drive_item_live(id)) then raise exception 'Choose an available folder in this workspace.'; end if;
 if p_kind='file' and (p_path is null or split_part(p_path,'/',1)<>p_workspace::text or split_part(p_path,'/',2)<>p_id::text or split_part(p_path,'/',3)<>coalesce(p_parent::text,'root') or not exists(select 1 from storage.objects where bucket_id='ncc-drive' and name=p_path)) then raise exception 'Upload the file to its assigned workspace first.'; end if;
 if p_kind='document' and (p_content is null or p_content->>'type' is distinct from 'doc' or octet_length(p_content::text)>2000000) then raise exception 'A valid document under 2 MB is required.'; end if;
 insert into public.cvoa_drive_items(id,workspace_id,parent_id,kind,name,content,storage_path,mime_type,file_size,created_by,updated_by) values(p_id,p_workspace,p_parent,p_kind,trim(p_name),p_content,p_path,p_mime,p_size,auth.uid(),auth.uid());
 if p_kind<>'folder' then insert into public.cvoa_drive_revisions(item_id,version,name,stage,content,storage_path,mime_type,file_size,created_by) values(p_id,1,trim(p_name),'draft',p_content,p_path,p_mime,p_size,auth.uid()); end if;
 insert into public.cvoa_drive_activity(item_id,actor_id,action) values(p_id,auth.uid(),'created');
 return p_id;
end; $$;
create function public.cvoa_drive_save(p_item uuid,p_version integer,p_content jsonb,p_stage text default 'draft',p_template boolean default false) returns integer language plpgsql security definer set search_path='' as $$
declare i public.cvoa_drive_items; next_version integer; begin
 select * into i from public.cvoa_drive_items where id=p_item for update;
 if not found or public.cvoa_drive_item_level(p_item)<3 or not public.cvoa_drive_item_live(p_item) or i.kind<>'document' then raise exception 'Document editing permission required.'; end if;
 if i.version is distinct from p_version then raise exception 'This document changed in another session. Your draft is preserved; reload the latest version before saving.'; end if;
 if p_content is null or p_content->>'type' is distinct from 'doc' or octet_length(p_content::text)>2000000 then raise exception 'A valid document under 2 MB is required.'; end if;
 if (p_stage<>i.stage or p_template<>i.is_template) and public.cvoa_drive_workspace_level(i.workspace_id)<3 then raise exception 'Workspace staff controls approval status and templates.'; end if;
 if i.stage in ('approved','superseded') and (p_stage<>'draft' or public.cvoa_drive_workspace_level(i.workspace_id)<3) then raise exception 'Reopen this document as a draft before editing.'; end if;
 if p_stage='approved' and public.cvoa_drive_workspace_level(i.workspace_id)<4 then raise exception 'A workspace commander must approve this document.'; end if;
 next_version:=i.version+1;
 update public.cvoa_drive_items set content=p_content,stage=p_stage,is_template=p_template,version=next_version,updated_by=auth.uid(),updated_at=now() where id=p_item;
 insert into public.cvoa_drive_revisions(item_id,version,name,stage,content,created_by) values(p_item,next_version,i.name,p_stage,p_content,auth.uid());
 insert into public.cvoa_drive_activity(item_id,actor_id,action,detail) values(p_item,auth.uid(),'saved',jsonb_build_object('version',next_version));
 return next_version;
end; $$;
create function public.cvoa_drive_manage(p_item uuid,p_action text,p_name text default null,p_parent uuid default null) returns void language plpgsql security definer set search_path='' as $$
declare i public.cvoa_drive_items; w uuid; begin
 select workspace_id into w from public.cvoa_drive_items where id=p_item;
 perform pg_advisory_xact_lock(hashtextextended(w::text,0));
 select * into i from public.cvoa_drive_items where id=p_item for update;
 if not found or public.cvoa_drive_workspace_level(i.workspace_id)<3 then raise exception 'Owning workspace staff required.'; end if;
 if p_action='rename' then update public.cvoa_drive_items set name=trim(p_name),updated_by=auth.uid(),updated_at=now() where id=p_item;
 elsif p_action='trash' then update public.cvoa_drive_items set deleted_at=now(),updated_by=auth.uid(),updated_at=now() where id=p_item;
 elsif p_action='restore' then
   if i.parent_id is not null and not public.cvoa_drive_item_live(i.parent_id) then raise exception 'Restore the parent folder first.'; end if;
   update public.cvoa_drive_items set deleted_at=null,updated_by=auth.uid(),updated_at=now() where id=p_item;
 elsif p_action='move' then
   if p_parent is not null and not exists(select 1 from public.cvoa_drive_items where id=p_parent and workspace_id=i.workspace_id and kind='folder' and public.cvoa_drive_item_live(id)) then raise exception 'Choose an available destination in this workspace.'; end if;
   if p_parent is not null and exists(with recursive tree as(select id from public.cvoa_drive_items where id=p_item union all select n.id from public.cvoa_drive_items n join tree t on n.parent_id=t.id) select 1 from tree where id=p_parent) then raise exception 'A folder cannot be moved inside itself.'; end if;
   update public.cvoa_drive_items set parent_id=p_parent,updated_by=auth.uid(),updated_at=now() where id=p_item;
 else raise exception 'Unsupported action.'; end if;
 insert into public.cvoa_drive_activity(item_id,actor_id,action,detail) values(p_item,auth.uid(),p_action,jsonb_build_object('name',p_name,'parent',p_parent));
end; $$;
create function public.cvoa_drive_share(p_item uuid,p_recipient uuid,p_permission text,p_expires timestamptz default null) returns uuid language plpgsql security definer set search_path='' as $$
declare w uuid; result uuid; begin
 select workspace_id into w from public.cvoa_drive_items where id=p_item and public.cvoa_drive_item_live(id);
 if not found or public.cvoa_drive_workspace_level(w)<3 then raise exception 'Only owning workspace staff can share this item.'; end if;
 if p_recipient=w or not exists(select 1 from public.cvoa_drive_workspaces where id=p_recipient) then raise exception 'Choose another workspace.'; end if;
 if p_expires is not null and p_expires<=now() then raise exception 'Expiration must be in the future.'; end if;
 insert into public.cvoa_drive_shares(item_id,recipient_workspace_id,permission,expires_at,created_by) values(p_item,p_recipient,p_permission,p_expires,auth.uid()) returning id into result;
 insert into public.cvoa_drive_activity(item_id,actor_id,action,detail) values(p_item,auth.uid(),'shared',jsonb_build_object('recipient',p_recipient,'permission',p_permission));
 return result;
end; $$;
create function public.cvoa_drive_revoke_share(p_share uuid) returns void language plpgsql security definer set search_path='' as $$
declare i uuid; w uuid; begin
 select s.item_id,n.workspace_id into i,w from public.cvoa_drive_shares s join public.cvoa_drive_items n on n.id=s.item_id where s.id=p_share;
 if not found or public.cvoa_drive_workspace_level(w)<3 then raise exception 'Owning workspace staff required.'; end if;
 update public.cvoa_drive_shares set revoked_at=now() where id=p_share;
 insert into public.cvoa_drive_activity(item_id,actor_id,action,detail) values(i,auth.uid(),'sharing_revoked',jsonb_build_object('share',p_share));
end; $$;
create function public.cvoa_drive_restore_revision(p_item uuid,p_revision uuid,p_version integer) returns integer language plpgsql security definer set search_path='' as $$
declare r public.cvoa_drive_revisions; i public.cvoa_drive_items; next_version integer; begin
 select * into i from public.cvoa_drive_items where id=p_item for update;
 if not found or public.cvoa_drive_workspace_level(i.workspace_id)<3 or not public.cvoa_drive_item_live(p_item) then raise exception 'Owning workspace editing authority required.'; end if;
 if i.version is distinct from p_version then raise exception 'The item changed. Refresh before restoring.'; end if;
 select * into r from public.cvoa_drive_revisions where id=p_revision and item_id=p_item;
 if not found then raise exception 'Revision not found.'; end if;
 next_version:=i.version+1;
 update public.cvoa_drive_items set content=r.content,storage_path=r.storage_path,mime_type=r.mime_type,file_size=r.file_size,version=next_version,stage='draft',updated_by=auth.uid(),updated_at=now() where id=p_item;
 insert into public.cvoa_drive_revisions(item_id,version,name,stage,content,storage_path,mime_type,file_size,created_by) values(p_item,next_version,i.name,'draft',r.content,r.storage_path,r.mime_type,r.file_size,auth.uid());
 insert into public.cvoa_drive_activity(item_id,actor_id,action,detail) values(p_item,auth.uid(),'revision_restored',jsonb_build_object('from_version',r.version,'version',next_version));
 return next_version;
end; $$;
create function public.cvoa_drive_replace_file(p_item uuid,p_version integer,p_path text,p_mime text,p_size bigint) returns integer language plpgsql security definer set search_path='' as $$
declare i public.cvoa_drive_items; n integer; begin
 select * into i from public.cvoa_drive_items where id=p_item for update;
 if not found or i.kind<>'file' or public.cvoa_drive_item_level(p_item)<3 or not public.cvoa_drive_item_live(p_item) then raise exception 'File editing permission required.'; end if;
 if i.version is distinct from p_version then raise exception 'This file changed. Refresh before uploading another version.'; end if;
 if split_part(p_path,'/',1)<>i.workspace_id::text or split_part(p_path,'/',2)<>i.id::text or p_path is not distinct from i.storage_path or not exists(select 1 from storage.objects where bucket_id='ncc-drive' and name=p_path) then raise exception 'Upload a new version to this file first.'; end if;
 n:=i.version+1;
 update public.cvoa_drive_items set storage_path=p_path,mime_type=p_mime,file_size=p_size,version=n,stage='draft',updated_by=auth.uid(),updated_at=now() where id=p_item;
 insert into public.cvoa_drive_revisions(item_id,version,name,stage,storage_path,mime_type,file_size,created_by) values(p_item,n,i.name,'draft',p_path,p_mime,p_size,auth.uid());
 insert into public.cvoa_drive_activity(item_id,actor_id,action,detail) values(p_item,auth.uid(),'file_replaced',jsonb_build_object('version',n));
 return n;
end; $$;
-- Storage downloads require an accessible item/revision, including inherited shares.
create function public.cvoa_drive_storage_read(p_path text) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.cvoa_drive_items i where i.storage_path=p_path and public.cvoa_drive_item_level(i.id)>0) or exists(select 1 from public.cvoa_drive_revisions r where r.storage_path=p_path and public.cvoa_drive_item_level(r.item_id)>0);
$$;
create function public.cvoa_drive_storage_write(p_path text) returns boolean language plpgsql stable security definer set search_path='' as $$
declare w uuid; i uuid; folder uuid; begin
 if not public.cvoa_access_enabled() then return false; end if;
 begin w:=split_part(p_path,'/',1)::uuid;i:=split_part(p_path,'/',2)::uuid;exception when invalid_text_representation then return false;end;
 begin folder:=nullif(split_part(p_path,'/',3),'root')::uuid;exception when invalid_text_representation then folder:=null;end;
 return public.cvoa_drive_workspace_level(w)>=3 or exists(select 1 from public.cvoa_drive_items n where n.workspace_id=w and ((n.id=i and public.cvoa_drive_item_level(n.id)>=3 and public.cvoa_drive_item_live(n.id)) or (n.id=folder and n.kind='folder' and public.cvoa_drive_item_level(n.id)>=3 and public.cvoa_drive_item_live(n.id))));
end; $$;
-- Preserve legacy reads during rollout, but disallow mutable overwrite/deletion of revision blobs.
drop policy ncc_drive_national_all on storage.objects;
drop policy ncc_drive_shared_read on storage.objects;
create policy drive_blob_read on storage.objects for select to authenticated using(bucket_id='ncc-drive' and (public.cvoa_drive_storage_read(name) or public.is_national_role()));
create policy drive_blob_insert on storage.objects for insert to authenticated with check(bucket_id='ncc-drive' and public.cvoa_drive_storage_write(name));
do $$ declare t text; begin
 foreach t in array array['cvoa_drive_workspaces','cvoa_drive_items','cvoa_drive_revisions','cvoa_drive_shares','cvoa_drive_comments','cvoa_drive_favorites','cvoa_drive_activity'] loop
 execute format('create policy access_enabled on public.%I as restrictive for all to authenticated using(public.cvoa_access_enabled()) with check(public.cvoa_access_enabled())',t);
 end loop;
end $$;
-- Existing old UI can read; new UI writes only versioned, workspace-scoped paths.
do $$ declare f record; begin
 for f in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'cvoa_drive_%' and p.proname<>'cvoa_drive_sync_workspaces' loop
 execute format('revoke all on function %s from public,anon',f.signature);
 execute format('grant execute on function %s to authenticated',f.signature);
 end loop;
end $$;
update storage.buckets set file_size_limit=52428800 where id='ncc-drive';
commit;
