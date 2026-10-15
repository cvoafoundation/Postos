-- Personal settings never confer organization or staff authority.
alter table public.profiles add column avatar_path text;
alter table public.profiles add constraint profile_avatar_owner check (avatar_path is null or avatar_path ~ ('^'||id::text||'/[0-9a-f-]{36}\.webp$'));
create function public.cvoa_account_settings() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb; begin
 if not public.cvoa_access_enabled() then raise exception 'Active account required.' using errcode='42501'; end if;
 select jsonb_build_object('full_name',p.full_name,'phone',p.phone,'email',p.email,'avatar_path',p.avatar_path,
 'memberships',coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'membership_type',m.membership_type,'membership_status',m.membership_status,'expires_at',m.expires_at,'auto_renew',m.auto_renew) order by m.created_at desc) from public.members m where m.profile_id=p.id and m.deleted_at is null),'[]'::jsonb),
 'payments',coalesce((select jsonb_agg(to_jsonb(x)) from (select pay.id,pay.amount,pay.status,pay.paid_at,pay.created_at from public.membership_payments pay join public.members m on m.id=pay.member_id where m.profile_id=p.id and m.deleted_at is null order by pay.created_at desc limit 50) x),'[]'::jsonb)) into result from public.profiles p where p.id=auth.uid();
 return result;
end; $$;
create function public.cvoa_save_account_profile(p_name text,p_phone text) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if not public.cvoa_access_enabled() then raise exception 'Active account required.' using errcode='42501'; end if;
 if length(trim(coalesce(p_name,''))) not between 1 and 120 or length(coalesce(p_phone,''))>40 then raise exception 'Enter a name of 1–120 characters and a phone number of up to 40 characters.'; end if;
 update public.profiles set full_name=trim(p_name),phone=nullif(trim(p_phone),'') where id=auth.uid();
 return public.cvoa_account_settings();
end; $$;
create function public.cvoa_set_profile_photo(p_path text) returns void language plpgsql security definer set search_path='' as $$
begin
 if not public.cvoa_access_enabled() then raise exception 'Active account required.' using errcode='42501'; end if;
 if p_path is not null and (p_path !~ ('^'||auth.uid()::text||'/[0-9a-f-]{36}\.webp$') or not exists(select 1 from storage.objects where bucket_id='profile-photos' and name=p_path)) then raise exception 'Upload your own profile photo first.' using errcode='42501'; end if;
 update public.profiles set avatar_path=p_path where id=auth.uid();
end; $$;
revoke all on function public.cvoa_account_settings(),public.cvoa_save_account_profile(text,text),public.cvoa_set_profile_photo(text) from public,anon;
grant execute on function public.cvoa_account_settings(),public.cvoa_save_account_profile(text,text),public.cvoa_set_profile_photo(text) to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('profile-photos','profile-photos',false,2097152,array['image/webp']);
create policy profile_photo_read on storage.objects for select to authenticated using(bucket_id='profile-photos' and (storage.foldername(name))[1]=auth.uid()::text);
create policy profile_photo_insert on storage.objects for insert to authenticated with check(bucket_id='profile-photos' and name ~ ('^'||auth.uid()::text||'/[0-9a-f-]{36}\.webp$'));
create policy profile_photo_delete on storage.objects for delete to authenticated using(bucket_id='profile-photos' and (storage.foldername(name))[1]=auth.uid()::text);
create policy profile_photo_owner on storage.objects as restrictive for all to authenticated using(bucket_id<>'profile-photos' or (storage.foldername(name))[1]=auth.uid()::text) with check(bucket_id<>'profile-photos' or (storage.foldername(name))[1]=auth.uid()::text);
alter policy membership_workspace on storage.objects using (
 not (select public.cvoa_membership_only()) or bucket_id='congress-documents' or (bucket_id='profile-photos' and (storage.foldername(name))[1]=auth.uid()::text)
) with check (
 not (select public.cvoa_membership_only()) or bucket_id='congress-documents' or (bucket_id='dd214-uploads' and public.cvoa_member_upload_path(name)) or (bucket_id='profile-photos' and (storage.foldername(name))[1]=auth.uid()::text)
);

-- Stripe identity links are service-only and immutable through the public client.
create table membership_private.billing_customers(profile_id uuid primary key references public.profiles(id) on delete cascade,stripe_customer_id text unique not null,created_at timestamptz not null default now());
alter table membership_private.billing_customers enable row level security;
revoke all on membership_private.billing_customers from public,anon,authenticated;
create function public.cvoa_billing_customer(p_actor uuid,p_customer text default null) returns text language plpgsql security definer set search_path='' as $$
declare result text; begin
 if not exists(select 1 from public.profiles where id=p_actor and not access_suspended and deleted_at is null) then raise exception 'Active account required.' using errcode='42501'; end if;
 if p_customer is not null then
  if p_customer !~ '^cus_[A-Za-z0-9]+$' then raise exception 'Invalid billing account.'; end if;
  insert into membership_private.billing_customers(profile_id,stripe_customer_id) values(p_actor,p_customer) on conflict(profile_id) do nothing;
 end if;
 select stripe_customer_id into result from membership_private.billing_customers where profile_id=p_actor; return result;
end; $$;
revoke all on function public.cvoa_billing_customer(uuid,text) from public,anon,authenticated;
grant execute on function public.cvoa_billing_customer(uuid,text) to service_role;

-- Auth updates the canonical email after its confirmation flow succeeds.
create function membership_private.sync_account_email() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.email is distinct from old.email and new.email is not null then
  perform set_config('cvoa.access_reason','Member confirmed sign-in email change',true);
  update public.profiles set email=new.email where id=new.id;
 end if;
 return new;
end; $$;
revoke all on function membership_private.sync_account_email() from public,anon,authenticated;
create trigger cvoa_sync_account_email after update of email on auth.users for each row execute function membership_private.sync_account_email();

create or replace function public.cvoa_membership_request_guard() returns void
language plpgsql stable security definer set search_path='' as $$
declare path text:=trim(both '/' from coalesce(current_setting('request.path',true),''));
 method text:=current_setting('request.method',true); begin
 if not public.cvoa_membership_only() then return; end if;
 if path in ('rpc/cvoa_account_settings','rpc/cvoa_save_account_profile','rpc/cvoa_set_profile_photo','rpc/cvoa_member_verification','rpc/cvoa_prepare_member_upload','rpc/cvoa_submit_member_upload','rpc/cvoa_my_access','rpc/cvoa_membership_only','rpc/cvoa_my_membership_cards','rpc/cvoa_congress_labels','rpc/verify_membership','rpc/cvoa_state_voting','rpc/cvoa_vote_totals','rpc/get_preference_tally','rpc/cvoa_select_workspace','rpc/mark_notification_viewed') then return; end if;
 if path='profiles' and method in ('GET','HEAD') then return; end if;
 if path in ('resolutions','resolution_amendments','resolution_documents','resolution_comments','resolution_votes','resolution_member_preferences','congress_announcements','committees','committee_reviews','congress_calendar_events','legislative_bills','ethics_complaints') then return; end if;
 if path='congress_delegates' and method in ('GET','HEAD') then return; end if;
 raise exception 'This action is outside your available workspace.' using errcode='42501';
end; $$;

notify pgrst,'reload schema';
