-- Full message search for the inbox search box.
--
-- Run this in the Supabase SQL editor BEFORE deploying the code that uses it
-- (a push to master deploys straight to production).
--
-- Without an index, "find every message containing 'chalazion'" is a sequential
-- scan of the whole messages table — fine at a few thousand rows, painful at a
-- year's worth of a busy WhatsApp line. pg_trgm indexes the three-letter
-- fragments of each message so ILIKE '%...%' can use an index. That is also why
-- the app requires at least 3 characters before it searches messages: shorter
-- patterns cannot use a trigram index.

create extension if not exists pg_trgm;

-- Messages: the search that needed the index.
create index if not exists messages_body_trgm_idx
  on public.messages using gin (body gin_trgm_ops);

-- Newest-first ordering within a conversation, used by the thread view and by
-- search results (which order matches by time).
create index if not exists messages_conversation_created_idx
  on public.messages (conversation_id, created_at desc);

-- Contacts: the same ILIKE '%...%' pattern backs "search by name or phone".
create index if not exists contacts_name_trgm_idx
  on public.contacts using gin (name gin_trgm_ops);
create index if not exists contacts_profile_name_trgm_idx
  on public.contacts using gin (profile_name gin_trgm_ops);
create index if not exists contacts_wa_id_trgm_idx
  on public.contacts using gin (wa_id gin_trgm_ops);

-- Done. Existing rows are indexed as part of CREATE INDEX; nothing to backfill.
