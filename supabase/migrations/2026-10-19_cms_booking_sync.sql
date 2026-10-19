begin;
-- Private receipts make retries and concurrent clinic bots harmless.
create table if not exists public.cms_pipeline_booking_receipts (
  event_key uuid primary key,
  processed_at timestamptz not null default now(),
  outcome text not null default 'ignored'
);
alter table public.cms_pipeline_booking_receipts enable row level security;
revoke all on public.cms_pipeline_booking_receipts from public, anon, authenticated;
grant select,insert,update,delete on public.cms_pipeline_booking_receipts to service_role;

create or replace function public.booking_phone_digits(value text)
returns text language sql immutable set search_path=public as $$
  select case when digits like '00%' then substr(digits,3)
    when digits like '0%' then '60'||substr(digits,2) else digits end
  from (select regexp_replace(coalesce(value,''),'[^0-9]','','g') digits) x;
$$;
create index if not exists idx_contacts_booking_phone on public.contacts(public.booking_phone_digits(phone_number));

create or replace function public.record_cms_pipeline_booking(p_event_key uuid,p_phone text,p_name text)
returns text language plpgsql security invoker set search_path=public as $$
declare
  claimed uuid;
  digits text := public.booking_phone_digits(p_phone);
  matches uuid[];
  patient_id uuid;
  thread_id uuid;
  result text := 'ignored';
begin
  insert into public.cms_pipeline_booking_receipts(event_key) values(p_event_key)
    on conflict do nothing returning event_key into claimed;
  if claimed is null then return 'duplicate'; end if;
  if digits ~ '^[1-9][0-9]{8,14}$' then
    select array_agg(id) into matches from public.contacts
      where public.booking_phone_digits(phone_number)=digits
        or (phone_number is null and wa_id=digits);
    if cardinality(matches)>1 then
      -- Shared family phones require exactly one matching patient name.
      select array_agg(id) into matches from public.contacts where id=any(matches)
        and regexp_replace(lower(coalesce(name,profile_name,'')),'[^a-z0-9]','','g')
          =regexp_replace(lower(coalesce(p_name,'')),'[^a-z0-9]','','g')
        and length(regexp_replace(coalesce(p_name,''),'[^a-zA-Z0-9]','','g'))>0;
    end if;
    if cardinality(matches)=1 then
      patient_id := matches[1];
      perform 1 from public.contacts where id=patient_id and pipeline_removed_at is null for update;
      if found then
        select c.id into thread_id from public.conversations c
          join public.conversation_tags ct on ct.conversation_id=c.id join public.tags t on t.id=ct.tag_id
          where c.contact_id=patient_id and lower(trim(t.name)) in ('weight-loss','weight loss') limit 1;
        if thread_id is not null and not exists (
          select 1 from public.conversations c join public.conversation_tags ct on ct.conversation_id=c.id
          join public.tags t on t.id=ct.tag_id where c.contact_id=patient_id and lower(trim(t.name))='staff'
        ) then
          perform public.record_pipeline_booking(thread_id);
          result := 'booking';
        end if;
      end if;
    end if;
  end if;
  update public.cms_pipeline_booking_receipts set outcome=result where event_key=p_event_key;
  return result;
end;
$$;
revoke all on function public.record_cms_pipeline_booking(uuid,text,text) from public,anon,authenticated;
grant execute on function public.record_cms_pipeline_booking(uuid,text,text) to service_role;
notify pgrst,'reload schema';
commit;
