-- ============================================================================
-- Drop the "Contacted" pipeline stage (2026-09-23)
-- ============================================================================
-- Run in the CRM's Supabase SQL editor (project ewwzmyzegmjoiqstbjbn).
-- Safe to run more than once, and safe before or after the code deploy: the
-- board already shows any leftover "contacted" thread in New.
--
-- The owner removed the Contacted column from the Pipeline and chose to move
-- the patients sitting in it back to New. The check constraint on
-- conversations.stage still allows 'contacted'; nothing sets it any more.
-- ============================================================================

update public.conversations
set stage = 'new'
where stage = 'contacted';

-- Done.
