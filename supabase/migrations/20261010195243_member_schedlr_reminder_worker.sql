-- Dedicated random worker secret remains inside Vault; it is never sent to a
-- browser. The worker validates this secret before touching the delivery queue.
create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron with schema pg_catalog;
select vault.create_secret(replace(gen_random_uuid()::text||gen_random_uuid()::text,'-',''),'schedlr_personal_worker');
create function public.schedlr_verify_worker(p_secret text) returns boolean language sql security definer set search_path='' as $$
 select length(p_secret)=64 and exists(select 1 from vault.decrypted_secrets where name='schedlr_personal_worker' and decrypted_secret=p_secret);
$$;
revoke all on function public.schedlr_verify_worker(text) from public,anon,authenticated;
grant execute on function public.schedlr_verify_worker(text) to service_role;
select cron.schedule('schedlr-personal-mail','* * * * *', $worker$
 select net.http_post(
  url:='https://mvlhtuoukhorxmmibruc.supabase.co/functions/v1/member-scheduling',
  headers:=jsonb_build_object('Content-Type','application/json','x-scheduler-secret',(select decrypted_secret from vault.decrypted_secrets where name='schedlr_personal_worker')),
  body:='{}'::jsonb,timeout_milliseconds:=60000
 );
$worker$);
