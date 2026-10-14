-- Existing members can submit service verification without changing account privileges.
create table membership_private.member_uploads (
 path text primary key, profile_id uuid not null references public.profiles(id),
 member_id uuid not null references public.members(id), previous_path text,
 created_at timestamptz not null default now(), expires_at timestamptz not null default now()+interval '1 hour', used_at timestamptz
);
create index member_uploads_owner_created on membership_private.member_uploads(profile_id,created_at);
alter table membership_private.member_uploads enable row level security;
revoke all on membership_private.member_uploads from public,anon,authenticated;

create function public.cvoa_member_verification() returns jsonb
language plpgsql stable security definer set search_path='' as $$ begin
 if not public.cvoa_access_enabled() then raise exception 'Sign in to your membership account.' using errcode='42501'; end if;
 return coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'full_name',m.full_name,'status',m.dd214_review_status,'has_document',m.dd214_storage_path is not null) order by m.created_at desc)
 from public.members m where m.profile_id=auth.uid() and m.deleted_at is null),'[]'::jsonb);
end; $$;
create function public.cvoa_prepare_member_upload(p_member uuid,p_extension text) returns text
language plpgsql security definer set search_path='' as $$
declare m public.members; path text; begin
 if not public.cvoa_access_enabled() then raise exception 'Sign in to your membership account.' using errcode='42501'; end if;
 if p_extension is null or p_extension not in ('pdf','jpg','jpeg','png') then raise exception 'Choose a PDF, JPG, or PNG.'; end if;
 select * into m from public.members where id=p_member and profile_id=auth.uid() and deleted_at is null for update;
 if not found then raise exception 'Use your own linked membership.' using errcode='42501'; end if;
 if (select count(*) from membership_private.member_uploads where profile_id=auth.uid() and created_at>now()-interval '1 hour')>=10 then raise exception 'Please wait before attempting more uploads.'; end if;
 path:=auth.uid()::text||'/membership/'||m.id::text||'/'||gen_random_uuid()::text||'.'||p_extension;
 insert into membership_private.member_uploads(path,profile_id,member_id,previous_path) values(path,auth.uid(),m.id,m.dd214_storage_path);
 return path;
end; $$;
create function public.cvoa_member_upload_path(p_path text) returns boolean
language sql stable security definer set search_path='' as $$
 select public.cvoa_access_enabled() and exists(select 1 from membership_private.member_uploads u join public.members m on m.id=u.member_id
 where u.path=p_path and u.profile_id=auth.uid() and u.used_at is null and u.expires_at>now() and m.profile_id=auth.uid() and m.deleted_at is null);
$$;
create function public.cvoa_submit_member_upload(p_path text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u membership_private.member_uploads; m public.members; metadata jsonb; begin
 if not public.cvoa_access_enabled() then raise exception 'Sign in to your membership account.' using errcode='42501'; end if;
 select * into u from membership_private.member_uploads where path=p_path and profile_id=auth.uid() for update;
 if not found then raise exception 'Use your own prepared upload.' using errcode='42501'; end if;
 select * into m from public.members where id=u.member_id and profile_id=auth.uid() and deleted_at is null for update;
 if not found then raise exception 'Your membership is unavailable.' using errcode='42501'; end if;
 if u.used_at is not null and m.dd214_storage_path=p_path then return public.cvoa_member_verification(); end if;
 if u.used_at is not null or u.expires_at<=now() then raise exception 'Start a new upload and try again.'; end if;
 if m.dd214_storage_path is distinct from u.previous_path then raise exception 'Your document changed. Refresh before replacing it.'; end if;
 select o.metadata into metadata from storage.objects o where o.bucket_id='dd214-uploads' and o.name=p_path;
 if not found then raise exception 'Finish uploading the file before submitting.'; end if;
 if coalesce((metadata->>'size')::bigint,0) not between 1 and 10485760 or coalesce(metadata->>'mimetype','') not in ('application/pdf','image/jpeg','image/png') then raise exception 'Choose a PDF, JPG, or PNG of up to 10 MB.'; end if;
 update public.members set dd214_storage_path=p_path,dd214_review_status='pending',dd214_reviewed_by=null,dd214_reviewed_at=null,updated_at=now() where id=m.id;
 update membership_private.member_uploads set used_at=now() where path=p_path;
 return public.cvoa_member_verification();
end; $$;
revoke all on function public.cvoa_member_verification(),public.cvoa_prepare_member_upload(uuid,text),public.cvoa_member_upload_path(text),public.cvoa_submit_member_upload(text) from public,anon;
grant execute on function public.cvoa_member_verification(),public.cvoa_prepare_member_upload(uuid,text),public.cvoa_member_upload_path(text),public.cvoa_submit_member_upload(text) to authenticated;

alter policy membership_workspace on storage.objects with check (
 not (select public.cvoa_membership_only()) or bucket_id='congress-documents' or (bucket_id='dd214-uploads' and public.cvoa_member_upload_path(name))
);
-- The legacy public intake upload rule cannot write into reserved member paths.
create policy member_dd214_reserved_path on storage.objects as restrictive for insert to authenticated with check (
 bucket_id<>'dd214-uploads' or name not like '%/membership/%' or public.cvoa_member_upload_path(name)
);
create policy member_dd214_reserved_path_anon on storage.objects as restrictive for insert to anon with check (
 bucket_id<>'dd214-uploads' or name not like '%/membership/%'
);
create or replace function public.cvoa_membership_request_guard() returns void
language plpgsql stable security definer set search_path='' as $$
declare path text:=trim(both '/' from coalesce(current_setting('request.path',true),''));
 method text:=current_setting('request.method',true); begin
 if not public.cvoa_membership_only() then return; end if;
 if path in ('rpc/cvoa_member_verification','rpc/cvoa_prepare_member_upload','rpc/cvoa_submit_member_upload','rpc/cvoa_my_access','rpc/cvoa_membership_only','rpc/cvoa_my_membership_cards','rpc/cvoa_congress_labels','rpc/verify_membership','rpc/cvoa_state_voting','rpc/cvoa_vote_totals','rpc/get_preference_tally','rpc/cvoa_select_workspace','rpc/mark_notification_viewed') then return; end if;
 if path='profiles' and method in ('GET','HEAD') then return; end if;
 if path in ('resolutions','resolution_amendments','resolution_documents','resolution_comments','resolution_votes','resolution_member_preferences','congress_announcements','committees','committee_reviews','congress_calendar_events','legislative_bills','ethics_complaints') then return; end if;
 if path='congress_delegates' and method in ('GET','HEAD') then return; end if;
 raise exception 'This action is outside your available workspace.' using errcode='42501';
end; $$;

notify pgrst,'reload schema';
