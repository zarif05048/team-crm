-- CRM only (ewwzmyzegmjoiqstbjbn). Run BEFORE deploying the new pipeline.
-- Dates belong to the patient, shared by all their WhatsApp threads.
begin;

alter table public.contacts
  add column if not exists pipeline_booking_date date,
  add column if not exists pipeline_follow_up_at timestamptz;

-- We have no historical stage-change log. Existing stages begin tracking now,
-- rather than guessing that a message timestamp was a stage change.
alter table public.conversations
  add column if not exists stage_entered_at timestamptz not null default now();

create or replace function public.trg_conversation_stage_entered()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.stage is distinct from old.stage then
    new.stage_entered_at := now();
  end if;
  return new;
end;
$$;

create or replace trigger conversations_stage_entered
  before update of stage on public.conversations
  for each row execute function public.trg_conversation_stage_entered();

-- The Pipeline subscribes to contacts so another staff member's tick/date
-- appears immediately. Existing contacts RLS continues to protect the rows.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'contacts'
  ) then
    alter publication supabase_realtime add table public.contacts;
  end if;
end $$;

notify pgrst, 'reload schema';
commit;
