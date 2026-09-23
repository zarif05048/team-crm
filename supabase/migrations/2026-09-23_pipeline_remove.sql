-- ============================================================================
-- Remove a patient from the weight-loss pipeline (2026-09-23)
-- ============================================================================
-- Run in the CRM's Supabase SQL editor (project ewwzmyzegmjoiqstbjbn) BEFORE
-- pushing the code that uses it. Run 2026-09-23_weight_loss_pipeline.sql
-- first. Safe to run more than once.
--
-- WHY: the Pipeline board's delete button takes a patient off the board (their
-- `weight-loss` tag goes) but leaves their chats in the inbox. Without a
-- memory of that, their next weight-loss message would tag them again and
-- drop them back into New. `pipeline_removed_at` is that memory — per
-- PATIENT (contact), not per thread, so messaging a different line doesn't
-- bring them back either.
--
-- Staff can still put a removed patient back by adding the `weight-loss` tag
-- by hand in the thread's tag bar; only the automatic tagging is stopped.
-- ============================================================================

alter table public.contacts
  add column if not exists pipeline_removed_at timestamptz;

create or replace function public.trg_message_tag_weight_loss()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  wl_tag uuid;
  added  integer;
begin
  if new.direction <> 'inbound' or not public.is_weight_loss_enquiry(new.body) then
    return new;
  end if;

  -- Never let tagging stop a patient's message from being stored.
  begin
    -- Staff took this patient off the pipeline: don't put them back.
    if exists (
      select 1
      from public.conversations c
      join public.contacts k on k.id = c.contact_id
      where c.id = new.conversation_id
        and k.pipeline_removed_at is not null
    ) then
      return new;
    end if;

    select id into wl_tag from public.tags where name = 'weight-loss';
    if wl_tag is null then
      insert into public.tags (name, color) values ('weight-loss', '#16a34a')
      on conflict (name) do update set name = excluded.name
      returning id into wl_tag;
    end if;

    insert into public.conversation_tags (conversation_id, tag_id)
    values (new.conversation_id, wl_tag)
    on conflict do nothing;
    get diagnostics added = row_count;

    -- First weight-loss message on this thread -> start it in the New column.
    -- Later ones leave the stage alone, so staff moves are never undone.
    if added > 0 then
      update public.conversations set stage = 'new' where id = new.conversation_id;
    end if;
  exception when others then
    raise warning 'weight-loss tagging failed for message %: %', new.id, sqlerrm;
  end;

  return new;
end;
$$;

-- Done.
