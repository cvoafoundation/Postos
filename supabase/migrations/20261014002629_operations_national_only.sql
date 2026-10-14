-- Temporary rollout gate; preserve all records and the underlying scope rules.
create or replace function operations_private.active(p_user uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.profiles where id=p_user and not access_suspended and deleted_at is null)
 and exists(select 1 from public.cvoa_access_scopes(p_user) where role in ('national_commander','national_staff'));
$$;
create function public.ops_access_enabled() returns boolean
language sql stable security definer set search_path='' as $$
 select operations_private.active(auth.uid());
$$;
revoke all on function public.ops_access_enabled() from public,anon;
grant execute on function public.ops_access_enabled() to authenticated;

-- Clarify that follow-up aging uses the sponsor record update time.
-- Keep connected work in its original module; read through existing authorization.
create or replace function public.ops_module_queue() returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare base jsonb := '{"total":0,"items":[]}'::jsonb; extra jsonb; items jsonb; staff boolean;
begin
 if not public.ops_access_enabled() then raise exception 'National staff access required'; end if;
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
 when x->>'id' like 'sponsor-followup:%' then 'No sponsor record update for seven days. Contact the sponsor and record the next step.'
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

