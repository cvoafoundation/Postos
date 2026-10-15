-- Explicit non-Congress status ends active and scheduled appointments atomically.
create function public.cvoa_clear_congress_appointments(p_profile uuid,p_version bigint,p_reason text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v bigint; d record; previous jsonb; begin
 if not membership_private.ncc(auth.uid()) then raise exception 'NCC access required.' using errcode='42501'; end if;
 if length(trim(coalesce(p_reason,''))) not between 5 and 1000 then raise exception 'Enter the reason (5–1000 characters).'; end if;
 select access_version into v from public.profiles where id=p_profile for update;
 if not found or v is distinct from p_version then raise exception 'The account changed. Reload before saving.'; end if;
 for d in select id from public.congress_delegates where profile_id=p_profile and (term_end is null or term_end>=current_date) order by post_id,id loop
  perform public.cvoa_end_congress_appointment(p_profile,d.id,v,p_reason);
  select access_version into v from public.profiles where id=p_profile;
 end loop;
 -- Older accounts may have a delegate role without a designation row.
 select to_jsonb(p) into previous from public.profiles p where id=p_profile and role='delegate';
 if previous is not null then
  perform set_config('cvoa.access_reason',trim(p_reason),true);
  update public.profiles set role='member',title=null,access_version=access_version+1 where id=p_profile;
  insert into public.access_audit(profile_id,actor_id,action,reason,before_value,after_value)
  values(p_profile,auth.uid(),'congress_membership_cleared',trim(p_reason),previous,jsonb_build_object('role','member'));
 end if;
 return public.cvoa_person_congress(p_profile);
end; $$;
revoke all on function public.cvoa_clear_congress_appointments(uuid,bigint,text) from public,anon;
grant execute on function public.cvoa_clear_congress_appointments(uuid,bigint,text) to authenticated;
notify pgrst,'reload schema';
