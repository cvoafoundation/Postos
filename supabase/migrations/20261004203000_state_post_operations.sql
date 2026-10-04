begin;
create or replace function public.cvoa_state_workspace() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare scope record; result jsonb; begin
 select * into scope from public.cvoa_current_scope();
 if not public.is_national_role() and coalesce(scope.role,'')<>'state_commander' then raise exception 'State oversight access is required.'; end if;
 select jsonb_build_object('state',scope.state,'posts',coalesce(jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'city',p.city,'state',p.state,'status',p.status,'health_status',p.health_status,'active_members',(select count(*) from public.members m where m.post_id=p.id and m.membership_status='active'),'last_meeting',(select max(meeting_date) from public.uro_meetings u where u.post_id=p.id and u.status='published'),'overdue_actions',(select count(*) from public.uro_action_items u where u.post_id=p.id and u.status='open' and u.due_date<current_date),
 'draft_meetings',(select count(*) from public.uro_meetings u where u.post_id=p.id and u.status<>'published'),
 'active_campaigns',(select count(*) from public.fundraising_campaigns c where c.post_id=p.id and c.status<>'completed'),
 'support_requests',(select count(*) from public.state_escalations e where e.post_id=p.id and e.status='open'),
 'open_actions',(select count(*) from public.uro_action_items u where u.post_id=p.id and u.status='open')) order by p.name),'[]'::jsonb)) into result from public.posts p where public.is_national_role() or (scope.state ~ '^[A-Z]{2}$' and upper(p.state)=scope.state);
 return result;
end; $$;

commit;
