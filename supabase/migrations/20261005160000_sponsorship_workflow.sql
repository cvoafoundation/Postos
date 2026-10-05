begin;
-- Sponsorship operations are available to members of the affiliated post,
-- its staff, State oversight and National. Card data never enters this schema.
create function public.cvoa_sponsor_access(p_post uuid) returns boolean language sql stable security definer set search_path='' as $$
 select public.cvoa_access_enabled() and (public.is_national_role() or (p_post is not null and (public.cvoa_can_oversee_post(p_post) or exists(select 1 from public.profiles p left join public.members m on m.profile_id=p.id where p.id=auth.uid() and p.role in ('member','delegate','post_commander','post_officer') and (p.post_id=p_post or m.post_id=p_post)))));
$$;
revoke all on function public.cvoa_sponsor_access(uuid) from public,anon;
grant execute on function public.cvoa_sponsor_access(uuid) to anon,authenticated;
create function public.cvoa_sponsor_directory() returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not public.cvoa_access_enabled() then raise exception 'Active account required.';end if;
 return jsonb_build_object('posts',(select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'state',p.state) order by p.name),'[]'::jsonb) from public.posts p where public.cvoa_sponsor_access(p.id)));
end; $$;
revoke all on function public.cvoa_sponsor_directory() from public,anon;
grant execute on function public.cvoa_sponsor_directory() to authenticated;
-- Existing tier assignment must also work inside RPCs with an empty search path.
create or replace function public.assign_sponsor_tier() returns trigger language plpgsql set search_path='' as $$
begin
 select id into new.tier_id from public.sponsor_tiers where min_value<=coalesce(new.sponsorship_value,0) order by min_value desc limit 1;
 return new;
end; $$;
alter table public.sponsors add column workflow_version integer not null default 1, add column meeting_start timestamptz, add column meeting_end timestamptz, add column meeting_with text, add column meeting_location text, add column proposal_text text, add column proposal_storage_path text;
alter table public.sponsors add constraint sponsor_value_valid check(sponsorship_value between 0 and 999999.99) not valid;
create table public.sponsor_activity(id uuid primary key default gen_random_uuid(),sponsor_id uuid not null references public.sponsors(id),actor_id uuid not null references public.profiles(id),kind text not null,detail jsonb not null,created_at timestamptz not null default now());
create index sponsor_activity_record on public.sponsor_activity(sponsor_id,created_at desc);
alter table public.sponsor_activity enable row level security;
create policy sponsor_activity_read on public.sponsor_activity for select to authenticated using(exists(select 1 from public.sponsors s where s.id=sponsor_id and public.cvoa_sponsor_access(s.post_id)));
revoke all on public.sponsor_activity from anon,authenticated;
grant select on public.sponsor_activity to authenticated;
alter policy sponsors_select_post_or_national on public.sponsors using(public.cvoa_sponsor_access(post_id));
-- The public interest form can only create a new lead, never a won deal.
alter policy sponsors_insert_public on public.sponsors with check(stage='identified' and length(trim(company)) between 1 and 200 and sponsorship_value between 0 and 999999.99 and agreement_storage_path is null and proposal_storage_path is null and proposal_text is null and meeting_start is null and meeting_end is null and meeting_with is null and (auth.role()='anon' or public.cvoa_sponsor_access(post_id)));
revoke update on public.sponsors from authenticated;
alter policy sponsor_notes_read_national on public.sponsor_notes using(exists(select 1 from public.sponsors s where s.id=sponsor_id and public.cvoa_sponsor_access(s.post_id)));
alter policy sponsor_notes_write_national on public.sponsor_notes with check(author_id=auth.uid() and exists(select 1 from public.sponsors s where s.id=sponsor_id and public.cvoa_sponsor_access(s.post_id)));

create function public.cvoa_sponsor_save(p_sponsor uuid,p_version integer,p_data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare s public.sponsors; st public.sponsor_stage; amount numeric; begin
 select * into s from public.sponsors where id=p_sponsor for update;
 if not found or not public.cvoa_sponsor_access(s.post_id) then raise exception 'Your sponsorship workspace does not include this post.';end if;
 if s.workflow_version is distinct from p_version then raise exception 'This sponsor changed. Refresh before saving.';end if;
 st:=coalesce((p_data->>'stage')::public.sponsor_stage,s.stage);amount:=coalesce((p_data->>'sponsorship_value')::numeric,s.sponsorship_value);
 if amount<0 or amount>999999.99 or round(amount,2)<>amount then raise exception 'Enter a valid donation amount with at most two decimal places.';end if;
 if st is distinct from s.stage and st='contacted' and (length(trim(coalesce(p_data->>'person','')))=0 or coalesce(p_data->>'method','') not in ('phone','email','in_person','video','text','other') or length(trim(coalesce(p_data->>'summary','')))=0 or (length(trim(coalesce(p_data->>'email','')))=0 and length(trim(coalesce(p_data->>'phone','')))=0)) then raise exception 'Record who you contacted, the method, contact information and conversation.';end if;
 if (st is distinct from s.stage or p_data ? 'meeting_start' or p_data ? 'meeting_end') and st='meeting_scheduled' and (p_data->>'meeting_start' is null or p_data->>'meeting_end' is null or (p_data->>'meeting_end')::timestamptz<=(p_data->>'meeting_start')::timestamptz or length(trim(coalesce(p_data->>'meeting_with','')))=0) then raise exception 'Choose a meeting start, end and the person you are meeting.';end if;
 if (st is distinct from s.stage or p_data ? 'proposal_text' or p_data ? 'proposal_storage_path') and st='proposal_sent' and length(trim(coalesce(p_data->>'proposal_text',s.proposal_text,'')))=0 and coalesce(p_data->>'proposal_storage_path',s.proposal_storage_path) is null then raise exception 'Write or upload the proposal before advancing.';end if;
 if p_data ? 'proposal_storage_path' and p_data->>'proposal_storage_path' is not null and (split_part(p_data->>'proposal_storage_path','/',1)<>s.id::text or not exists(select 1 from storage.objects where bucket_id='sponsor-agreements' and name=p_data->>'proposal_storage_path')) then raise exception 'Upload the proposal to this sponsor first.';end if;
 if p_data ? 'agreement_storage_path' and p_data->>'agreement_storage_path' is not null and (split_part(p_data->>'agreement_storage_path','/',1)<>s.id::text or not exists(select 1 from storage.objects where bucket_id='sponsor-agreements' and name=p_data->>'agreement_storage_path')) then raise exception 'Upload the agreement to this sponsor first.';end if;
 insert into public.sponsor_activity(sponsor_id,actor_id,kind,detail) values(s.id,auth.uid(),case when st is distinct from s.stage then 'stage_changed' else 'record_updated' end,jsonb_build_object('recorded_by_name',(select full_name from public.profiles where id=auth.uid()),'previous_stage',s.stage,'new_stage',st,'previous_amount',s.sponsorship_value,'new_amount',amount)||p_data);
 update public.sponsors set stage=st,sponsorship_value=amount,contact_name=coalesce(p_data->>'person',p_data->>'contact_name',contact_name),email=case when p_data ? 'email' then nullif(p_data->>'email','') else email end,phone=case when p_data ? 'phone' then nullif(p_data->>'phone','') else phone end,
 meeting_start=case when p_data ? 'meeting_start' then (p_data->>'meeting_start')::timestamptz else meeting_start end,meeting_end=case when p_data ? 'meeting_end' then (p_data->>'meeting_end')::timestamptz else meeting_end end,meeting_with=coalesce(p_data->>'meeting_with',meeting_with),meeting_location=coalesce(p_data->>'meeting_location',meeting_location),proposal_text=coalesce(p_data->>'proposal_text',proposal_text),proposal_storage_path=coalesce(p_data->>'proposal_storage_path',proposal_storage_path),agreement_storage_path=coalesce(p_data->>'agreement_storage_path',agreement_storage_path),category=case when p_data ? 'category' then nullif(p_data->>'category','') else category end,agreement_start_date=case when p_data ? 'agreement_start_date' then (p_data->>'agreement_start_date')::date else agreement_start_date end,agreement_end_date=case when p_data ? 'agreement_end_date' then (p_data->>'agreement_end_date')::date else agreement_end_date end,updated_at=now(),workflow_version=workflow_version+1 where id=s.id returning * into s;
 return to_jsonb(s);
end; $$;
revoke all on function public.cvoa_sponsor_save(uuid,integer,jsonb) from public,anon;
grant execute on function public.cvoa_sponsor_save(uuid,integer,jsonb) to authenticated;

create function public.cvoa_sponsor_file_access(p_name text) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.sponsors s where s.id::text=split_part(p_name,'/',1) and public.cvoa_sponsor_access(s.post_id));
$$;
revoke all on function public.cvoa_sponsor_file_access(text) from public,anon;
grant execute on function public.cvoa_sponsor_file_access(text) to authenticated;
create policy sponsor_files_read on storage.objects for select to authenticated using(bucket_id='sponsor-agreements' and public.cvoa_sponsor_file_access(name));
create policy sponsor_files_upload on storage.objects for insert to authenticated with check(bucket_id='sponsor-agreements' and public.cvoa_sponsor_file_access(name));
update storage.buckets set file_size_limit=20971520,allowed_mime_types=array['application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document','image/jpeg','image/png'] where id='sponsor-agreements';

create table public.sponsor_checkout_requests(id uuid primary key,sponsor_id uuid not null references public.sponsors(id),post_id uuid references public.posts(id),amount_cents integer not null check(amount_cents between 100 and 99999999),created_by uuid not null references public.profiles(id),session_id text unique,url text,expires_at timestamptz,livemode boolean,status text not null default 'draft' check(status in ('draft','open','paid','expired')),created_at timestamptz not null default now());
create index sponsor_checkout_record on public.sponsor_checkout_requests(sponsor_id,created_at desc);
alter table public.sponsor_checkout_requests enable row level security;
create policy sponsor_checkout_read on public.sponsor_checkout_requests for select to authenticated using(public.cvoa_sponsor_access(post_id));
revoke all on public.sponsor_checkout_requests from anon,authenticated;
grant select on public.sponsor_checkout_requests to authenticated;
grant select,insert,update on public.sponsor_checkout_requests to service_role;
alter table public.sponsor_payments add column stripe_livemode boolean, add column refunded_amount numeric(10,2) not null default 0 check(refunded_amount>=0 and refunded_amount<=amount), add column stripe_session_id text unique,add column stripe_payment_intent text unique,add column checkout_request_id uuid unique references public.sponsor_checkout_requests(id);
alter policy sponsor_payments_select_post_or_national on public.sponsor_payments using(public.cvoa_sponsor_access(post_id));
alter policy sponsor_payments_insert_post_or_national on public.sponsor_payments with check(public.cvoa_sponsor_access(post_id) and recorded_by=auth.uid() and amount>0 and round(amount,2)=amount and payment_method in ('cash','check','wire','other') and stripe_livemode is null and refunded_amount=0 and stripe_session_id is null and stripe_payment_intent is null and checkout_request_id is null and (sponsor_id is null or exists(select 1 from public.sponsors s where s.id=sponsor_id and s.post_id is not distinct from sponsor_payments.post_id)));
-- Stripe receipts are immutable to app users, including National.
alter policy sponsor_payments_delete_national on public.sponsor_payments using(public.is_national_role() and stripe_session_id is null);

create function public.cvoa_sponsor_request(p_sponsor uuid,p_amount numeric,p_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare s public.sponsors; r public.sponsor_checkout_requests; begin
 select * into s from public.sponsors where id=p_sponsor for share;
 if not found or not public.cvoa_sponsor_access(s.post_id) then raise exception 'This sponsorship is outside your workspace.';end if;
 if p_amount is null or p_amount<1 or p_amount>999999.99 or round(p_amount,2)<>p_amount then raise exception 'Collection amount must be $1 to $999,999.99 with at most two decimal places.';end if;
 insert into public.sponsor_checkout_requests(id,sponsor_id,post_id,amount_cents,created_by) values(p_id,s.id,s.post_id,(p_amount*100)::integer,auth.uid()) on conflict(id) do nothing;
 select * into r from public.sponsor_checkout_requests where id=p_id;
 if r.sponsor_id<>s.id or r.amount_cents<>(p_amount*100)::integer or r.created_by<>auth.uid() then raise exception 'Payment request details do not match.';end if;
 return to_jsonb(r);
end; $$;
revoke all on function public.cvoa_sponsor_request(uuid,numeric,uuid) from public,anon;
grant execute on function public.cvoa_sponsor_request(uuid,numeric,uuid) to authenticated;

create function public.cvoa_fulfill_sponsor_payment(p_request uuid,p_session text,p_amount integer,p_currency text,p_intent text,p_paid_at timestamptz,p_live boolean) returns boolean language plpgsql security definer set search_path='' as $$
declare r public.sponsor_checkout_requests; begin
 select * into r from public.sponsor_checkout_requests where id=p_request for update;
 if not found or r.session_id is distinct from p_session or r.amount_cents is distinct from p_amount or p_currency is distinct from 'usd' or r.livemode is distinct from p_live or p_intent is null then raise exception 'Sponsorship payment does not match its saved request.';end if;
 if r.status='paid' then return false;end if;
 insert into public.sponsor_payments(post_id,sponsor_id,amount,payment_method,payment_date,recorded_by,stripe_livemode,stripe_session_id,stripe_payment_intent,checkout_request_id,notes) values(r.post_id,r.sponsor_id,r.amount_cents/100.0,'card',p_paid_at::date,r.created_by,p_live,p_session,p_intent,r.id,'Verified Stripe payment');
 update public.sponsor_checkout_requests set status='paid' where id=r.id;
 insert into public.sponsor_activity(sponsor_id,actor_id,kind,detail) values(r.sponsor_id,r.created_by,'payment_received',jsonb_build_object('amount',r.amount_cents/100.0,'session_id',p_session));
 return true;
end; $$;
revoke all on function public.cvoa_fulfill_sponsor_payment(uuid,text,integer,text,text,timestamptz,boolean) from public,anon,authenticated;
grant execute on function public.cvoa_fulfill_sponsor_payment(uuid,text,integer,text,text,timestamptz,boolean) to service_role;
create function public.cvoa_sponsor_refund(p_intent text,p_refunded_cents integer) returns void language plpgsql security definer set search_path='' as $$
declare payment public.sponsor_payments; begin
 select * into payment from public.sponsor_payments where stripe_payment_intent=p_intent for update;
 if not found then return;end if;
 if p_refunded_cents is null or p_refunded_cents<0 or p_refunded_cents>payment.amount*100 then raise exception 'Invalid sponsorship refund total.';end if;
 if p_refunded_cents>payment.refunded_amount*100 then
 update public.sponsor_payments set refunded_amount=p_refunded_cents/100.0 where id=payment.id;
 insert into public.sponsor_activity(sponsor_id,actor_id,kind,detail) values(payment.sponsor_id,payment.recorded_by,'refund_recorded',jsonb_build_object('amount',p_refunded_cents/100.0));
 end if;
end; $$;
revoke all on function public.cvoa_sponsor_refund(text,integer) from public,anon,authenticated;
grant execute on function public.cvoa_sponsor_refund(text,integer) to service_role;
commit;
