-- ============================================================================
-- Weight-loss lead pipeline (2026-09-23)
-- ============================================================================
-- Run in the CRM's Supabase SQL editor (project ewwzmyzegmjoiqstbjbn) BEFORE
-- pushing the code that uses it (a push to master deploys straight to
-- production, and the Pipeline page shows only threads carrying this tag).
-- Safe to run more than once.
--
-- WHY: the Pipeline page is now only for weight-loss enquiries. A thread is in
-- the pipeline when it carries the `weight-loss` tag. This trigger adds the tag
-- the first time a patient's message mentions weight loss and drops the thread
-- into the "new" stage, so it appears in the New column on its own.
--
-- It lives in the database, not the app, because inbound messages arrive two
-- ways: the official line's webhook (lib/whatsapp/ingest.ts) and the WhatsApp
-- bot fleet on the marketing PC, which writes to `messages` directly
-- (bridge.js). A trigger catches both without redeploying the fleet.
--
-- The pattern is the fleet's WEIGHT_LOSS_RE (bridge.js) and the Analytics
-- page's (lib/data/analytics.ts), translated to Postgres regex: `\m` is
-- Postgres's start-of-word, where JavaScript writes `\b` (in Postgres `\b` is a
-- backspace). Keep all three in step so the pipeline, the Analytics page and
-- the 9pm report count the same patients.
--
-- Staff can still add the tag by hand to put someone in the pipeline, or
-- remove it to take them out (their next weight-loss message will add it back).
-- ============================================================================

insert into public.tags (name, color)
values ('weight-loss', '#16a34a')
on conflict (name) do nothing;

create or replace function public.is_weight_loss_enquiry(body text)
returns boolean
language sql
immutable
as $$
  select coalesce(body, '') ~* 'njaro|wegov|ozempi|semaglutide|tirzepatide|kurus|turun\s*berat|berat\s*badan|penurunan\s*berat|weight\s*loss|weightloss|langsing|\mslim|\mdiet';
$$;

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

drop trigger if exists messages_tag_weight_loss on public.messages;
create trigger messages_tag_weight_loss
  after insert on public.messages
  for each row execute function public.trg_message_tag_weight_loss();

-- ----------------------------------------------------------------------------
-- Backfill: tag every thread that has already asked about weight loss, so the
-- pipeline isn't empty on day one. Their current stage is kept as it is.
-- ----------------------------------------------------------------------------
insert into public.conversation_tags (conversation_id, tag_id)
select distinct m.conversation_id, t.id
from public.messages m
cross join public.tags t
where t.name = 'weight-loss'
  and m.direction = 'inbound'
  and public.is_weight_loss_enquiry(m.body)
on conflict do nothing;

-- Done.
