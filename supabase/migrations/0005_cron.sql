-- Nightly comps refresh at 09:00 UTC (after PokemonPriceTracker's daily update).
--
-- pg_cron calls comps-nightly with a random token that only lives in Vault: it is generated here,
-- never typed or copied by anyone, and the function checks it through check_cron_token(). This
-- keeps the service_role key out of Vault and out of cron.job.
-- The Authorization header carries the public anon key because the function has verify_jwt on.

create extension if not exists pg_net;
create extension if not exists pg_cron;

do $$
begin
  if not exists (select 1 from vault.secrets where name = 'comps_cron_token') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'comps_cron_token');
  end if;
end $$;

create or replace function public.check_cron_token(token text) returns boolean
language sql security definer set search_path = '' as $$
  select exists (
    select 1 from vault.decrypted_secrets where name = 'comps_cron_token' and decrypted_secret = token
  );
$$;
revoke execute on function public.check_cron_token(text) from public, anon, authenticated;
grant execute on function public.check_cron_token(text) to service_role;

-- Fires comps-nightly now; the cron job below calls the same thing.
create or replace function public.run_comps_nightly() returns bigint
language sql security definer set search_path = '' as $$
  select net.http_post(
    url := 'https://yiojhrauddycaktjhfma.supabase.co/functions/v1/comps-nightly',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inlpb2pocmF1ZGR5Y2FrdGpoZm1hIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIzMDQ1OTAsImV4cCI6MjA5Nzg4MDU5MH0.XxlmeKkVkRo6TuHYeDOsl7XNwo16t2XQLOfNJJQMKtI',
      'x-cron-token', (select decrypted_secret from vault.decrypted_secrets where name = 'comps_cron_token')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 300000
  );
$$;
revoke execute on function public.run_comps_nightly() from public, anon, authenticated;

select cron.schedule('comps-nightly', '0 9 * * *', 'select public.run_comps_nightly()');
