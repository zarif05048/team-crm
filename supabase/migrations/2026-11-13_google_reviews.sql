-- Google reviews in the inbox (owner, 12 Nov 2026: "can connect google review
-- with crm"). See src/lib/social/reviews.ts.
--
-- 1. channel_accounts may now hold a Google Business Profile (provider
--    'google', one row per profile: "accounts/<id>/locations/<id>"), its
--    renewal token sealed like the others.
-- 2. Google has no free push for new reviews, so Supabase's own scheduler asks
--    the CRM to fetch them every 10 minutes. The URL holds no secret: the
--    route only reads the clinics' own reviews, and refuses to run twice
--    within 3 minutes (src/app/api/cron/google-reviews/route.ts).
--
-- Safe to run more than once.

alter table public.channel_accounts drop constraint if exists channel_accounts_provider_check;
alter table public.channel_accounts
  add constraint channel_accounts_provider_check check (provider in ('facebook', 'tiktok', 'google'));

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule(jobid) from cron.job where jobname = 'crm-google-reviews';
select cron.schedule(
  'crm-google-reviews',
  '*/10 * * * *',
  $$ select net.http_get('https://team-crm-one.vercel.app/api/cron/google-reviews', timeout_milliseconds := 55000) $$
);
