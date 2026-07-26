-- ============================================================================
-- Conversation preview + unread denormalisation (2026-07-26)
-- ============================================================================
-- Run in the CRM's Supabase SQL editor (project ewwzmyzegmjoiqstbjbn).
-- Safe to run more than once.
--
-- WHY: the inbox list used to build each row's preview line and unread badge by
-- downloading the newest 1,500 message rows on every render. Every realtime
-- event refreshes every open staff device, so that one query was the single
-- biggest consumer of the project's Supabase egress quota (~0.5 MB per event
-- per device, and the AI bot doubles the event count).
--
-- After this migration the three values the list needs live on the conversation
-- row itself, kept current by a trigger, so the list is one small query.
--
-- The trigger is also now the ONLY writer of last_message_at / last_inbound_at.
-- The app used to update the conversation row itself right after inserting a
-- message, which fired a second realtime event (and a second refresh) for every
-- message. Those updates are removed from the app in the same change.
-- ============================================================================

alter table public.conversations
  add column if not exists last_message_body      text,
  add column if not exists last_message_direction text,
  add column if not exists unread_count           integer not null default 0;

-- ----------------------------------------------------------------------------
-- Keep the conversation row in step with its newest message.
-- ----------------------------------------------------------------------------
-- The preview only fills one line in the list, so 160 characters is plenty —
-- storing the whole body here would put long bot replies back on the wire.
--
-- Messages can arrive out of order (Meta retries, the bridge sender catching
-- up), so the preview fields only move forward: an older message updates
-- nothing but the unread count.
create or replace function public.trg_message_touch_conversation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.conversations c set
    last_message_at = greatest(c.last_message_at, new.created_at),

    last_message_body = case
      when new.created_at >= c.last_message_at then left(coalesce(new.body, ''), 160)
      else c.last_message_body end,

    last_message_direction = case
      when new.created_at >= c.last_message_at then new.direction
      else c.last_message_direction end,

    -- drives the 24h reply window
    last_inbound_at = case
      when new.direction = 'inbound'
        then greatest(coalesce(c.last_inbound_at, new.created_at), new.created_at)
      else c.last_inbound_at end,

    -- capped at 99 to match the "9+" badge; an outbound reply leaves it alone
    -- (the bot answering does not mean a human has read the thread — opening
    -- the thread does, and that resets it via the trigger below)
    unread_count = case
      when new.direction = 'inbound' then least(c.unread_count + 1, 99)
      else c.unread_count end

  where c.id = new.conversation_id;

  return new;
end;
$$;

drop trigger if exists messages_touch_conversation on public.messages;
create trigger messages_touch_conversation
  after insert on public.messages
  for each row execute function public.trg_message_touch_conversation();

-- ----------------------------------------------------------------------------
-- Opening a thread (markConversationRead sets last_read_at) clears its badge.
-- ----------------------------------------------------------------------------
create or replace function public.trg_conversation_read()
returns trigger
language plpgsql
as $$
begin
  if new.last_read_at is distinct from old.last_read_at then
    new.unread_count := 0;
  end if;
  return new;
end;
$$;

drop trigger if exists conversations_read_clears_unread on public.conversations;
create trigger conversations_read_clears_unread
  before update on public.conversations
  for each row execute function public.trg_conversation_read();

-- ----------------------------------------------------------------------------
-- Backfill existing threads
-- ----------------------------------------------------------------------------
with latest as (
  select distinct on (conversation_id)
         conversation_id, body, direction
    from public.messages
   order by conversation_id, created_at desc
)
update public.conversations c
   set last_message_body      = left(coalesce(l.body, ''), 160),
       last_message_direction = l.direction
  from latest l
 where l.conversation_id = c.id;

update public.conversations c
   set unread_count = u.n
  from (
    select m.conversation_id, least(count(*), 99)::int as n
      from public.messages m
      join public.conversations cc on cc.id = m.conversation_id
     where m.direction = 'inbound'
       and (cc.last_read_at is null or m.created_at > cc.last_read_at)
     group by m.conversation_id
  ) u
 where u.conversation_id = c.id
   and c.unread_count is distinct from u.n;
