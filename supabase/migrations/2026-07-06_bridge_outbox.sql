-- ============================================================================
-- Bridge to the unofficial marketing number (whatsapp-web.js sender)
-- ============================================================================
-- Run in the CRM's Supabase SQL editor (project ewwzmyzegmjoiqstbjbn).
--
-- Conversations on the unofficial marketing number are mirrored into this CRM
-- by the marketing-sender program (whatsapp_numbers.phone_number_id starts
-- with 'unofficial:'). Replies staff type in the inbox for those threads are
-- queued here instead of the Meta API; the sender polls and delivers them.
-- ============================================================================

create table if not exists public.bridge_outbox (
  id               uuid primary key default gen_random_uuid(),
  message_id       uuid references public.messages(id) on delete set null,
  conversation_id  uuid references public.conversations(id) on delete cascade,
  wa_id            text not null,                    -- recipient phone digits (e.g. 60123456789)
  body             text not null,
  status           text not null default 'queued'    -- queued | sent | failed
                   check (status in ('queued','sent','failed')),
  error            text not null default '',
  created_at       timestamptz not null default now(),
  sent_at          timestamptz
);

create index if not exists bridge_outbox_status_idx on public.bridge_outbox (status, created_at);

alter table public.bridge_outbox enable row level security;
drop policy if exists bridge_outbox_team on public.bridge_outbox;
create policy bridge_outbox_team on public.bridge_outbox
  for all to authenticated using (true) with check (true);
