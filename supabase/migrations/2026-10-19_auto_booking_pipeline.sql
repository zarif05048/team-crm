-- CRM only. A recorded booking moves a weight-loss patient's threads together.
-- Existing table permissions/RLS still govern the callable function.
begin;

create or replace function public.record_pipeline_booking(p_conversation_id uuid)
returns boolean language plpgsql security invoker set search_path = public as $$
declare
  patient_id uuid;
  removed_at timestamptz;
  weight_loss boolean;
begin
  select contact_id into patient_id from public.conversations where id = p_conversation_id;
  if patient_id is null then raise exception 'Conversation not found'; end if;
  select pipeline_removed_at into removed_at from public.contacts where id = patient_id for update;
  weight_loss := removed_at is null and exists (
    select 1 from public.conversations c
    join public.conversation_tags ct on ct.conversation_id = c.id
    join public.tags t on t.id = ct.tag_id
    where c.contact_id = patient_id and lower(trim(t.name)) in ('weight-loss', 'weight loss')
  ) and not exists (
    select 1 from public.conversations c
    join public.conversation_tags ct on ct.conversation_id = c.id
    join public.tags t on t.id = ct.tag_id
    where c.contact_id = patient_id and lower(trim(t.name)) = 'staff'
  );
  if weight_loss then
    update public.conversations set stage = 'booking'
    where contact_id = patient_id and stage is distinct from 'booking';
  else
    -- Preserve the existing behaviour for ordinary, non-pipeline bookings.
    update public.conversations set stage = 'qualified'
    where id = p_conversation_id and stage is distinct from 'qualified';
  end if;
  return weight_loss;
end;
$$;
revoke all on function public.record_pipeline_booking(uuid) from public, anon;
grant execute on function public.record_pipeline_booking(uuid) to authenticated, service_role;

create or replace function public.trg_booking_tag_pipeline()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.tags where id = new.tag_id and lower(trim(name)) = 'booking')
    and exists (
      select 1 from public.conversations target
      join public.conversations c on c.contact_id = target.contact_id
      join public.conversation_tags ct on ct.conversation_id = c.id
      join public.tags t on t.id = ct.tag_id
      where target.id = new.conversation_id and lower(trim(t.name)) in ('weight-loss', 'weight loss')
    ) then
    -- Skip removed contacts and staff, rather than applying the non-WL fallback.
    if exists (select 1 from public.contacts k join public.conversations c on c.contact_id=k.id
      where c.id=new.conversation_id and k.pipeline_removed_at is null)
      and not exists (select 1 from public.conversations c join public.conversations target on target.contact_id=c.contact_id
        join public.conversation_tags ct on ct.conversation_id=c.id join public.tags t on t.id=ct.tag_id
        where target.id=new.conversation_id and lower(trim(t.name))='staff') then
      perform public.record_pipeline_booking(new.conversation_id);
    end if;
  end if;
  return new;
end;
$$;
create or replace trigger conversation_tags_booking_pipeline
  after insert or update of conversation_id, tag_id on public.conversation_tags
  for each row execute function public.trg_booking_tag_pipeline();

create or replace function public.trg_booking_date_pipeline()
returns trigger language plpgsql security definer set search_path = public as $$
declare thread_id uuid;
begin
  if new.pipeline_booking_date is null or new.pipeline_booking_date is not distinct from old.pipeline_booking_date
    or new.pipeline_removed_at is not null then return new; end if;
  select c.id into thread_id from public.conversations c
  join public.conversation_tags ct on ct.conversation_id=c.id join public.tags t on t.id=ct.tag_id
  where c.contact_id=new.id and lower(trim(t.name)) in ('weight-loss','weight loss') limit 1;
  if thread_id is not null and not exists (
    select 1 from public.conversations c join public.conversation_tags ct on ct.conversation_id=c.id
    join public.tags t on t.id=ct.tag_id where c.contact_id=new.id and lower(trim(t.name))='staff'
  ) then perform public.record_pipeline_booking(thread_id); end if;
  return new;
end;
$$;
create or replace trigger contacts_booking_pipeline
  after update of pipeline_booking_date on public.contacts
  for each row execute function public.trg_booking_date_pipeline();

-- Repair active booked prospects only. Closed/removed/staff cards retain their history.
with eligible as (
  select distinct c.contact_id from public.conversations c
  join public.contacts k on k.id=c.contact_id
  where k.pipeline_removed_at is null
    and exists (select 1 from public.conversations w join public.conversation_tags ct on ct.conversation_id=w.id
      join public.tags t on t.id=ct.tag_id where w.contact_id=c.contact_id and lower(trim(t.name)) in ('weight-loss','weight loss'))
    and exists (select 1 from public.conversations b join public.conversation_tags ct on ct.conversation_id=b.id
      join public.tags t on t.id=ct.tag_id where b.contact_id=c.contact_id and lower(trim(t.name))='booking')
    and not exists (select 1 from public.conversations closed where closed.contact_id=c.contact_id and closed.stage in ('won','lost'))
    and not exists (select 1 from public.conversations s join public.conversation_tags ct on ct.conversation_id=s.id
      join public.tags t on t.id=ct.tag_id where s.contact_id=c.contact_id and lower(trim(t.name))='staff')
)
update public.conversations set stage='booking'
where contact_id in (select contact_id from eligible) and stage is distinct from 'booking';

notify pgrst, 'reload schema';
commit;
