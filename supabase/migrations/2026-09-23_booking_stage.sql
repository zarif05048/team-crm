-- ============================================================================
-- "Booking" pipeline stage (2026-09-23)
-- ============================================================================
-- Run in the CRM's Supabase SQL editor (project ewwzmyzegmjoiqstbjbn) BEFORE
-- pushing the code that shows the Booking column — until then the database
-- rejects the value and a card dropped there snaps back.
-- Safe to run more than once.
--
-- The owner added a Booking column between Qualified and Won. The stage check
-- was declared inline in schema.sql, so its name is Postgres's choice; drop
-- whichever check on conversations mentions `stage` and add it back with the
-- new value.
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
  check (stage in ('new','contacted','qualified','booking','won','lost'));

-- Done.
