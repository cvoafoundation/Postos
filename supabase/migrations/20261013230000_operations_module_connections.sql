-- Keep connected work in its original module; read through existing authorization.
create function public.ops_module_queue() returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare base jsonb := '{"total":0,"items":[]}'::jsonb; extra jsonb; items jsonb; staff boolean;
begin
 if auth.uid() is null or not public.cvoa_access_enabled() then raise exception 'Active account required'; end if;
 select role in ('national_commander','national_staff','state_commander','post_commander','post_officer') into staff from public.cvoa_current_scope();
 if coalesce(staff,false) then base:=public.cvoa_action_queue(); end if;
 with entries as (
 select 'sponsor-meeting:'||s.id as id,'Sponsor meeting: '||s.company as title,s.meeting_start::date as due_date,'sponsorship'::text as kind,'/sponsors?sponsor='||s.id||'&post='||s.post_id as path
 from public.sponsors s where s.stage::text='meeting_scheduled' and s.meeting_start<=now()+interval '30 days'
 union all
 select 'sponsor-followup:'||s.id,'Follow up with sponsor: '||s.company,(s.updated_at+interval '7 days')::date,'sponsorship','/sponsors?sponsor='||s.id||'&post='||s.post_id
 from public.sponsors s where s.stage::text in ('contacted','proposal_sent') and s.updated_at<=now()-interval '7 days'
 union all
 select 'sponsor-renewal:'||s.id,'Review sponsorship renewal: '||s.company,s.agreement_end_date,'sponsorship','/sponsors?sponsor='||s.id||'&post='||s.post_id
 from public.sponsors s where s.stage::text='active' and s.agreement_end_date<=current_date+30
 union all
 select 'uro-meeting:'||m.id,'Upcoming meeting: '||m.title,m.scheduled_at::date,'meeting','/meetings/session/'||m.id
 from public.uro_sessions m where not coalesce(staff,false) and m.ended_at is null and m.scheduled_at<=now()+interval '30 days'
 union all
 select 'uro-action:'||a.id,a.title,a.due_date,'task','/meetings/session/'||a.meeting_id
 from public.uro_actions a where not coalesce(staff,false) and a.owner_id=auth.uid() and a.status<>'completed'
 ) select coalesce(jsonb_agg(to_jsonb(entries)),'[]') into extra from entries;
 with unique_items as (
 select distinct on (x->>'id') x from jsonb_array_elements(coalesce(base->'items','[]')||extra) x order by x->>'id'
 ), enriched as (
 select x || jsonb_build_object('module',case
 when x->>'id' like 'sponsor-%' then 'Sponsorship'
 when x->>'id' like 'launch-%' then 'Company launch'
 when x->>'id' like 'application:%' then 'Applications'
 when x->>'id' like 'transfer:%' or x->>'id' like 'renewal:%' then 'Membership'
 when x->>'id' like 'campaign:%' then 'Fundraising'
 when x->>'id' like 'escalation:%' then 'State oversight'
 else 'Meetings' end,
 'next_step',case
 when x->>'id' like 'sponsor-meeting:%' then 'Open the sponsor record, review the meeting details, and record its outcome.'
 when x->>'id' like 'sponsor-followup:%' then 'No stage update for seven days. Contact the sponsor and record the next step.'
 when x->>'id' like 'sponsor-renewal:%' then 'Review the agreement and coordinate renewal before promising benefits.'
 when x->>'kind'='minutes' then 'Open the meeting record, complete the minutes, and use its certification process.'
 when x->>'kind'='meeting' then 'Review the agenda and scheduled meeting details.'
 when x->>'kind'='membership' then 'Review the member record and renewal status.'
 when x->>'kind'='application' then 'Review the request and record the next authorized step.'
 when x->>'kind'='fundraising' then 'Review the campaign deadline, progress, and remaining work.'
 when x->>'kind'='review' then 'Review the submitted information and record your authorized decision or response.'
 else 'Open the original record to update ownership, progress, or completion.' end) as x from unique_items
 ) select coalesce(jsonb_agg(x),'[]') into items from (select x from enriched order by nullif(x->>'due_date','')::date nulls last,x->>'id' limit 100) q;
 return jsonb_build_object('total',coalesce((base->>'total')::int,0)+jsonb_array_length(extra),'items',items,'refreshed_at',now());
end $$;
revoke all on function public.ops_module_queue() from public,anon;
grant execute on function public.ops_module_queue() to authenticated;

-- Counts only. Prompts and replies are never stored by this counter.
create table operations_private.ai_usage (
 user_id uuid primary key references public.profiles(id) on delete cascade,
 day_start date not null,day_count integer not null default 0,
 minute_start timestamptz not null,minute_count integer not null default 0
);
alter table operations_private.ai_usage enable row level security;
revoke all on operations_private.ai_usage from public,anon,authenticated;
create function public.ops_ai_reserve() returns boolean language plpgsql security definer set search_path='' as $$
declare usage operations_private.ai_usage; actor uuid:=auth.uid();
begin
 if actor is null or not operations_private.active(actor) then raise exception 'Active member account required'; end if;
 insert into operations_private.ai_usage(user_id,day_start,minute_start) values(actor,current_date,now()) on conflict do nothing;
 select * into usage from operations_private.ai_usage where user_id=actor for update;
 if usage.day_start<>current_date then usage.day_start:=current_date;usage.day_count:=0; end if;
 if usage.minute_start<=now()-interval '1 minute' then usage.minute_start:=now();usage.minute_count:=0; end if;
 if usage.day_count>=50 or usage.minute_count>=5 then return false; end if;
 update operations_private.ai_usage set day_start=usage.day_start,day_count=usage.day_count+1,minute_start=usage.minute_start,minute_count=usage.minute_count+1 where user_id=actor;
 return true;
end $$;
revoke all on function public.ops_ai_reserve() from public,anon;
grant execute on function public.ops_ai_reserve() to authenticated;
