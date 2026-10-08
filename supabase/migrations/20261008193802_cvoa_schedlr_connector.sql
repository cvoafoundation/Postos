create schema if not exists cvoa_integrations;
revoke all on schema cvoa_integrations from public, anon;
grant usage on schema cvoa_integrations to authenticated;

create function cvoa_integrations.schedlr_context() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare person public.profiles; selected record; spaces jsonb;
begin
  if auth.uid() is null then raise exception 'Sign in required.'; end if;
  select * into person from public.profiles where id = auth.uid();
  if person.id is null or person.access_suspended or person.role = 'ethics_tribunal' then
    return jsonb_build_object('name', '', 'selected_key', '', 'workspaces', '[]'::jsonb);
  end if;
  select * into selected from public.cvoa_current_scope();
  with assigned as (select * from public.cvoa_access_scopes(auth.uid())),
  candidate as (
    select 'national' key, 'National Command' label, 'admin' role, true bookable where public.is_national_role()
    union all
    select 'state:' || upper(p.state), upper(p.state) || ' State Command', 'admin', false from public.posts p where public.is_national_role() and p.state is not null
    union all
    select 'post:' || p.id, p.name || ' (' || coalesce(p.state,'') || ')', 'admin', false from public.posts p where public.is_national_role()
    union all
    select 'state:' || upper(s.state), upper(s.state) || ' State Command', 'admin', true from assigned s where s.role = 'state_commander' and s.state is not null
    union all
    select 'post:' || p.id, p.name || ' (' || coalesce(p.state,'') || ')', 'staff', false from public.posts p join assigned s on upper(s.state) = upper(p.state) where s.role = 'state_commander'
    union all
    select 'post:' || p.id, p.name || ' (' || coalesce(p.state,'') || ')', case when s.role='delegate' then 'staff' else 'admin' end, true
      from public.posts p join assigned s on s.post_id = p.id
      where s.role in ('post_commander','post_officer') or (s.role='delegate' and s.source='Congress designation')
  ), deduplicated as (
    select key, min(label) label, case when bool_or(role='admin') then 'admin' else 'staff' end role, bool_or(bookable) bookable from candidate group by key
  ) select coalesce(jsonb_agg(to_jsonb(d) order by case when key='national' then 0 when key like 'state:%' then 1 else 2 end,label), '[]'::jsonb) into spaces from deduplicated d;
  return jsonb_build_object('name',person.full_name,'selected_key',case when selected.role in ('post_commander','post_officer','delegate') then 'post:' || selected.post_id when selected.role='state_commander' then 'state:' || upper(selected.state) else 'national' end,'workspaces',spaces);
end;
$$;
revoke all on function cvoa_integrations.schedlr_context() from public, anon;
grant execute on function cvoa_integrations.schedlr_context() to authenticated;
create function public.cvoa_schedlr_context() returns jsonb
language sql stable security invoker set search_path = '' as $$ select cvoa_integrations.schedlr_context(); $$;
revoke all on function public.cvoa_schedlr_context() from public, anon;
grant execute on function public.cvoa_schedlr_context() to authenticated;
