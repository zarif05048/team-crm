-- ============================================================================
--  AI bot support (2026-07-05)
--  Run this in the Supabase dashboard:  SQL Editor → New query → paste → Run
--  Safe to re-run.
-- ============================================================================

-- Per-conversation switch: the AI auto-reply bot answers only while true.
-- Turned off automatically when a staff member replies manually or when the
-- bot hands off to a human; staff can re-enable from the thread toolbar.
alter table public.conversations
  add column if not exists bot_enabled boolean not null default true;

-- Marks outbound messages written by the AI bot (sent_by stays null for them).
alter table public.messages
  add column if not exists sent_by_bot boolean not null default false;

-- Done.
