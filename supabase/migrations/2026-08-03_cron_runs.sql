-- Cron audit trail (2026-08-03)
-- Scheduled jobs act on live patient data (the cleanup job DELETES old
-- messages), so only the Vercel scheduler and the clinic owner may start one —
-- enforced in src/lib/cron-auth.ts. This table is the record of that: every
-- attempt, allowed or refused, lands here so the owner can see who tried.
--
-- Run this in the Supabase SQL editor. It is optional: the cron routes log
-- fail-soft, so they keep working normally until this table exists.

create table if not exists public.cron_runs (
  id            uuid primary key default gen_random_uuid(),
  job           text not null,                 -- e.g. 'cleanup'
  triggered_by  text not null,                 -- 'vercel-cron', an owner email, or 'anonymous'
  allowed       boolean not null,              -- false = refused attempt
  detail        jsonb,                         -- result counts, or the refusal reason
  created_at    timestamptz not null default now()
);

create index if not exists cron_runs_created_idx
  on public.cron_runs (created_at desc);

-- Locked down: RLS on with no policies means only the service-role key (the
-- server routes) can read or write. No agent — and no anonymous caller — can
-- read the audit trail or forge an entry in it.
alter table public.cron_runs enable row level security;
