-- Explicit NCC export designations are separate from general National staff access.
create schema if not exists membership_private;
revoke all on schema membership_private from public,anon,authenticated;
create table membership_private.ncc_export_designations (
 profile_id uuid primary key references public.profiles(id) on delete cascade,
 designated_by uuid not null references public.profiles(id),designated_at timestamptz not null default now()
);
create table membership_private.list_details (
 member_id uuid primary key references public.members(id) on delete cascade,
 membership_class text check(length(trim(membership_class)) between 1 and 120),
 votes_entitled integer check(votes_entitled between 0 and 100000),
 voting_entitlement text not null default '' check(length(voting_entitlement)<=500),
 updated_by uuid references public.profiles(id),updated_at timestamptz not null default now()
);
create table membership_private.list_audit (
 id bigint generated always as identity primary key,actor_id uuid references public.profiles(id),
 action text not null,member_id uuid references public.members(id),reason text not null default '',
 details jsonb not null default '{}',created_at timestamptz not null default now()
);
alter table membership_private.ncc_export_designations enable row level security;
alter table membership_private.list_details enable row level security;
alter table membership_private.list_audit enable row level security;
revoke all on all tables in schema membership_private from public,anon,authenticated;
create function membership_private.commander(p_actor uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.profiles where id=p_actor and role::text='national_commander' and not access_suspended and deleted_at is null);
$$;
create function membership_private.ncc(p_actor uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.profiles p where p.id=p_actor and not p.access_suspended and p.deleted_at is null and
 (p.role::text='national_commander' or (p.role::text='national_staff' and exists(select 1 from membership_private.ncc_export_designations n where n.profile_id=p.id))));
$$;
create function public.cvoa_membership_export_access() returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('allowed',membership_private.ncc(auth.uid()),'can_manage',membership_private.commander(auth.uid()));
$$;
create function public.cvoa_ncc_export_directory() returns jsonb language plpgsql stable security definer set search_path='' as $$begin
 if not membership_private.commander(auth.uid()) then raise exception 'National Commander access required';end if;
 return (select coalesce(jsonb_agg(jsonb_build_object('profile_id',p.id,'name',p.full_name,'title',p.title,'designated',n.profile_id is not null) order by p.full_name,p.id),'[]') from public.profiles p left join membership_private.ncc_export_designations n on n.profile_id=p.id where p.role::text='national_staff' and not p.access_suspended and p.deleted_at is null);
end $$;
create function public.cvoa_set_ncc_export_designation(p_profile uuid,p_enabled boolean) returns void language plpgsql security definer set search_path='' as $$begin
 if not membership_private.commander(auth.uid()) then raise exception 'National Commander access required';end if;
 if p_enabled is null or not exists(select 1 from public.profiles where id=p_profile and role::text='national_staff' and not access_suspended and deleted_at is null) then raise exception 'Choose an active National staff account';end if;
 if p_enabled then insert into membership_private.ncc_export_designations(profile_id,designated_by) values(p_profile,auth.uid()) on conflict(profile_id) do nothing;
 else delete from membership_private.ncc_export_designations where profile_id=p_profile;end if;
 insert into membership_private.list_audit(actor_id,action,details) values(auth.uid(),'ncc_export_designation',jsonb_build_object('profile_id',p_profile,'enabled',p_enabled));
end $$;
create function public.cvoa_membership_list(p_active_only boolean default true,p_reason text default null) returns jsonb language plpgsql security definer set search_path='' as $$declare result jsonb;begin
 if not membership_private.ncc(auth.uid()) then raise exception 'NCC membership-list access required';end if;
 if p_active_only is null then raise exception 'Choose the membership list scope';end if;
 if p_reason is not null and length(trim(p_reason)) not between 5 and 1000 then raise exception 'Enter a purpose or request reference of 5–1,000 characters';end if;
 select jsonb_build_object('generated_at',now(),'active_only',p_active_only,'rows',coalesce(jsonb_agg(jsonb_build_object(
 'id',m.id,'name',m.full_name,'address',m.address,'membership_class',d.membership_class,'votes_entitled',d.votes_entitled,'voting_entitlement',d.voting_entitlement
 ) order by lower(coalesce(d.membership_class,'')),lower(m.full_name),m.id),'[]')) into result
 from public.members m left join membership_private.list_details d on d.member_id=m.id
 where m.deleted_at is null and (not p_active_only or m.membership_status::text='active');
 if p_reason is not null then insert into membership_private.list_audit(actor_id,action,reason,details) values(auth.uid(),'membership_list_generated',trim(p_reason),jsonb_build_object('active_only',p_active_only,'row_count',jsonb_array_length(result->'rows')));end if;
 return result;
end $$;
create function public.cvoa_save_membership_list_details(p_member uuid,p_address text,p_class text,p_votes integer,p_entitlement text,p_reason text) returns void language plpgsql security definer set search_path='' as $$declare previous jsonb;begin
 if not membership_private.ncc(auth.uid()) then raise exception 'NCC membership-list access required';end if;
 if p_reason is null or length(trim(p_reason)) not between 5 and 1000 then raise exception 'Enter the source or reason for this correction';end if;
 if length(coalesce(p_address,''))>2000 or length(coalesce(p_class,''))>120 or length(coalesce(p_entitlement,''))>500 or p_votes<0 or p_votes>100000 then raise exception 'Check address, class, and voting entitlement values';end if;
 perform 1 from public.members where id=p_member and deleted_at is null for update;if not found then raise exception 'Member record is unavailable';end if;
 select jsonb_build_object('address',m.address,'class',d.membership_class,'votes',d.votes_entitled,'entitlement',d.voting_entitlement) into previous from public.members m left join membership_private.list_details d on d.member_id=m.id where m.id=p_member;
 update public.members set address=nullif(trim(p_address),''),updated_at=now() where id=p_member;
 insert into membership_private.list_details(member_id,membership_class,votes_entitled,voting_entitlement,updated_by) values(p_member,nullif(trim(p_class),''),p_votes,coalesce(trim(p_entitlement),''),auth.uid())
 on conflict(member_id) do update set membership_class=excluded.membership_class,votes_entitled=excluded.votes_entitled,voting_entitlement=excluded.voting_entitlement,updated_by=auth.uid(),updated_at=now();
 insert into membership_private.list_audit(actor_id,action,member_id,reason,details) values(auth.uid(),'membership_list_corrected',p_member,trim(p_reason),jsonb_build_object('before',previous,'after',jsonb_build_object('address',nullif(trim(p_address),''),'class',nullif(trim(p_class),''),'votes',p_votes,'entitlement',coalesce(trim(p_entitlement),''))));
end $$;
revoke all on function public.cvoa_membership_export_access(),public.cvoa_ncc_export_directory(),public.cvoa_set_ncc_export_designation(uuid,boolean),public.cvoa_membership_list(boolean,text),public.cvoa_save_membership_list_details(uuid,text,text,integer,text,text) from public,anon;
grant execute on function public.cvoa_membership_export_access(),public.cvoa_ncc_export_directory(),public.cvoa_set_ncc_export_designation(uuid,boolean),public.cvoa_membership_list(boolean,text),public.cvoa_save_membership_list_details(uuid,text,text,integer,text,text) to authenticated;
