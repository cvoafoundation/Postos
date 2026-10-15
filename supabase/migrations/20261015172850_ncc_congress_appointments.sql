-- NCC-reviewed Congress representation, independent of membership affiliation.
revoke insert,update,delete on public.congress_delegates from public,anon,authenticated;
create index if not exists congress_delegates_company_terms on public.congress_delegates(post_id,is_alternate,term_start,term_end);
create index if not exists congress_delegates_profile on public.congress_delegates(profile_id);
create function public.cvoa_congress_admin_access() returns boolean language sql stable security definer set search_path='' as $$
 select membership_private.ncc(auth.uid());
$$;
create function public.cvoa_person_congress(p_profile uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb; begin
 if not membership_private.ncc(auth.uid()) then raise exception 'NCC access required.' using errcode='42501'; end if;
 select jsonb_build_object('version',p.access_version,'eligible',not p.access_suspended and p.deleted_at is null and p.role not in ('guest_applicant','ethics_tribunal') and exists(select 1 from public.members m where m.profile_id=p.id and m.deleted_at is null and m.membership_status='active' and (m.expires_at is null or m.expires_at>=current_date)),
 'appointments',coalesce((select jsonb_agg(to_jsonb(d)||jsonb_build_object('post_name',c.name,'state',c.state,'active',(d.term_start is null or d.term_start<=current_date) and (d.term_end is null or d.term_end>=current_date),'ended',d.term_end<current_date) order by d.created_at desc) from public.congress_delegates d join public.posts c on c.id=d.post_id where d.profile_id=p.id),'[]'::jsonb),
 'posts',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'name',c.name,'state',c.state) order by c.state,c.name) from public.posts c where c.status::text not in ('archived','inactive')),'[]'::jsonb)) into result from public.profiles p where p.id=p_profile;
 if result is null then raise exception 'Account not found.'; end if; return result;
end; $$;
create function public.cvoa_save_congress_appointment(p_profile uuid,p_post uuid,p_alternate boolean,p_start date,p_end date,p_reason text,p_version bigint,p_id uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare pr public.profiles; previous public.congress_delegates; saved public.congress_delegates; starts date:=coalesce(p_start,current_date); begin
 if not membership_private.ncc(auth.uid()) then raise exception 'NCC access required.' using errcode='42501'; end if;
 if length(trim(coalesce(p_reason,''))) not between 5 and 1000 then raise exception 'Enter the appointment authority or reason (5–1000 characters).'; end if;
 if p_alternate is null or (p_end is not null and p_end<starts) then raise exception 'Check the seat and term dates.'; end if;
 select * into pr from public.profiles where id=p_profile for update;
 if not found or pr.access_version is distinct from p_version then raise exception 'The account changed. Reload before saving.'; end if;
 if not (public.cvoa_person_congress(p_profile)->>'eligible')::boolean then raise exception 'Choose an active linked member account. Applicant, suspended, removed, and Tribunal accounts cannot receive this appointment.'; end if;
 perform 1 from public.posts where id=p_post and status::text not in ('archived','inactive') for update;
 if not found then raise exception 'Choose an available company.'; end if;
 if p_id is not null then
 select * into previous from public.congress_delegates where id=p_id and profile_id=p_profile for update;
 if not found then raise exception 'This appointment does not belong to this person.' using errcode='42501'; end if;
 if previous.term_end<current_date then raise exception 'Create a new appointment instead of changing an ended term.'; end if;
 end if;
 if exists(select 1 from public.congress_delegates d where d.id is distinct from p_id and d.profile_id is not null
 and (d.term_end is null or d.term_start is null or d.term_end>=d.term_start)
 and coalesce(d.term_start,'-infinity'::date)<=coalesce(p_end,'infinity'::date) and coalesce(d.term_end,'infinity'::date)>=starts
 and ((d.post_id=p_post and d.is_alternate=p_alternate) or (d.profile_id=p_profile and not d.is_alternate and not p_alternate))) then
 raise exception 'An overlapping company seat or primary representation already exists. End or amend that appointment first.';
 end if;
 if p_id is null then
 insert into public.congress_delegates(post_id,profile_id,is_alternate,term_start,term_end) values(p_post,p_profile,p_alternate,starts,p_end) returning * into saved;
 else
 update public.congress_delegates set post_id=p_post,is_alternate=p_alternate,term_start=starts,term_end=p_end where id=p_id returning * into saved;
 end if;
 -- A member-only account can use its Congress workspace even when the represented
 -- company differs from membership affiliation. Staff retain their selected workspace.
 if pr.role in ('member','delegate') and (p_end is null or p_end>=current_date) then
 insert into public.access_workspace_selection(profile_id,scope_id) values(p_profile,saved.id::text) on conflict(profile_id) do update set scope_id=excluded.scope_id;
 end if;
 update public.profiles set access_version=access_version+1 where id=p_profile;
 insert into public.access_audit(profile_id,actor_id,action,reason,before_value,after_value) values(p_profile,auth.uid(),'congress_appointment',trim(p_reason),case when p_id is null then null else to_jsonb(previous) end,to_jsonb(saved));
 return public.cvoa_person_congress(p_profile);
end; $$;
create function public.cvoa_end_congress_appointment(p_profile uuid,p_id uuid,p_version bigint,p_reason text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare pr public.profiles; previous public.congress_delegates; begin
 if not membership_private.ncc(auth.uid()) then raise exception 'NCC access required.' using errcode='42501'; end if;
 if length(trim(coalesce(p_reason,''))) not between 5 and 1000 then raise exception 'Enter the reason for ending this appointment (5–1000 characters).'; end if;
 select * into pr from public.profiles where id=p_profile for update;
 if not found or pr.access_version is distinct from p_version then raise exception 'The account changed. Reload before saving.'; end if;
 select * into previous from public.congress_delegates where id=p_id and profile_id=p_profile for update;
 if not found then raise exception 'This appointment does not belong to this person.' using errcode='42501'; end if;
 perform 1 from public.posts where id=previous.post_id for update;
 if previous.term_end<current_date then raise exception 'This appointment has already ended.'; end if;
 update public.congress_delegates set term_end=current_date-1 where id=p_id;
 delete from public.access_workspace_selection where profile_id=p_profile and scope_id=p_id::text;
 perform set_config('cvoa.access_reason',trim(p_reason),true);
 if pr.role='delegate' and not exists(select 1 from public.congress_delegates d where d.profile_id=p_profile and d.post_id=pr.post_id and (d.term_start is null or d.term_start<=current_date) and (d.term_end is null or d.term_end>=current_date)) then
 update public.profiles set role='member',title=null,access_version=access_version+1 where id=p_profile;
 else update public.profiles set access_version=access_version+1 where id=p_profile; end if;
 insert into public.access_audit(profile_id,actor_id,action,reason,before_value,after_value) values(p_profile,auth.uid(),'congress_appointment_ended',trim(p_reason),to_jsonb(previous),jsonb_build_object('id',p_id,'term_end',current_date-1));
 return public.cvoa_person_congress(p_profile);
end; $$;
revoke all on function public.cvoa_congress_admin_access(),public.cvoa_person_congress(uuid),public.cvoa_save_congress_appointment(uuid,uuid,boolean,date,date,text,bigint,uuid),public.cvoa_end_congress_appointment(uuid,uuid,bigint,text) from public,anon;
grant execute on function public.cvoa_congress_admin_access(),public.cvoa_person_congress(uuid),public.cvoa_save_congress_appointment(uuid,uuid,boolean,date,date,text,bigint,uuid),public.cvoa_end_congress_appointment(uuid,uuid,bigint,text) to authenticated;
notify pgrst,'reload schema';

-- Explicit workspace selection still wins. A member whose selected Congress term
-- is unavailable falls back to another active primary designation before personal scope.
create or replace function public.cvoa_current_scope() returns table(scope_id text,role text,post_id uuid,state text,title text,source text)
language sql stable security definer set search_path='' as $$
 select s.* from public.cvoa_access_scopes(auth.uid()) s where public.cvoa_access_enabled()
 order by (s.scope_id=coalesce((select w.scope_id from public.access_workspace_selection w where w.profile_id=auth.uid()),'primary')) desc,
 (s.source='Congress designation' and s.title<>'Alternate delegate' and exists(select 1 from public.profiles p where p.id=auth.uid() and p.role in ('member','delegate'))) desc,
 (s.scope_id='primary') desc,s.scope_id limit 1;
$$;

-- Keep the NCC requirement even if table write grants change in a future release.
create policy ncc_congress_insert on public.congress_delegates as restrictive for insert to authenticated with check ((select public.cvoa_congress_admin_access()));
create policy ncc_congress_update on public.congress_delegates as restrictive for update to authenticated using ((select public.cvoa_congress_admin_access())) with check ((select public.cvoa_congress_admin_access()));
create policy ncc_congress_delete on public.congress_delegates as restrictive for delete to authenticated using ((select public.cvoa_congress_admin_access()));
