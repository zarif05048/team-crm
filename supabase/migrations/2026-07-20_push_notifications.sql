-- Web Push notifications (2026-07-20)
-- Enables Windows/desktop pop-ups when the CRM is closed. Two parts:
--   1. push_subscriptions — one row per subscribed browser/device.
--   2. a trigger that POSTs new AI attention-notes to /api/push/notify so the
--      server can push to every device. Catches notes from ALL lines (the
--      official Meta bot + the three whatsapp-web.js bots) with no bot changes.
--
-- Run this in the Supabase SQL editor. Replace __PUSH_NOTIFY_SECRET__ below
-- with the PUSH_NOTIFY_SECRET value from .env.local before running (the paste
-- must match the env var, or the endpoint rejects the webhook with 401).

-- 1) Subscriptions table --------------------------------------------------------
create table if not exists public.push_subscriptions (
  endpoint    text primary key,
  p256dh      text not null,
  auth        text not null,
  profile_id  uuid references public.profiles(id) on delete cascade,
  created_at  timestamptz not null default now()
);

-- Locked down: only the service-role key (server routes) may read/write. RLS on
-- with no policies means anon/authenticated clients get nothing — patients and
-- agents can never see push endpoints.
alter table public.push_subscriptions enable row level security;

-- 2) Fire a push on every new AI attention-note --------------------------------
create extension if not exists pg_net;

create or replace function public.notify_push_on_note()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Only bot notes (author_id null) whose text starts with an attention emoji.
  if new.author_id is null
     and (new.body like '🚨%' or new.body like '🤖%' or new.body like '📅%') then
    perform net.http_post(
      url     := 'https://team-crm-one.vercel.app/api/push/notify',
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer __PUSH_NOTIFY_SECRET__'
      ),
      body    := jsonb_build_object('record', to_jsonb(new))
    );
  end if;
  return new;
end;
$$;

drop trigger if exists notes_push_trigger on public.notes;
create trigger notes_push_trigger
  after insert on public.notes
  for each row
  execute function public.notify_push_on_note();
