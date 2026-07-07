-- ============================================================================
-- Unread tracking (2026-07-07)
-- ============================================================================
-- Run in the CRM's Supabase SQL editor (project ewwzmyzegmjoiqstbjbn).
--
-- conversations.last_read_at = when a staff member last OPENED the thread.
-- Inbound messages newer than this count as "unread" and show as a bold row +
-- green badge in the inbox until someone clicks the conversation.
-- NULL = never opened (everything counts as unread).
-- ============================================================================

alter table public.conversations
  add column if not exists last_read_at timestamptz;
