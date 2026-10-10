-- ============================================================================
-- "Not Respond" pipeline stage (2026-10-10)
-- ============================================================================
-- Run in the CRM's Supabase SQL editor (project ewwzmyzegmjoiqstbjbn) BEFORE
-- pushing the code that shows the Not Respond column — until then the database
-- rejects the value and a card dropped there snaps back.
-- Safe to run more than once.
--
-- The owner asked for a Not Respond column to the right of Follow Up, for
-- patients who were followed up and never answered. Same shape as
-- 2026-09-23_booking_stage.sql: drop whichever check on conversations mentions
-- `stage` and add it back with the new value.
-- ============================================================================

do $$
declare
  con record;
begin
  for con in
    select conname
    from pg_constraint
    where conrelid = 'public.conversations'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%stage%'
  loop
    execute format('alter table public.conversations drop constraint %I', con.conname);
  end loop;
end $$;

alter table public.conversations
  add constraint conversations_stage_check
  check (stage in ('new','contacted','qualified','no_response','booking','won','lost'));

-- Done.
