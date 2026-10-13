-- WhatsApp LIDs are routing identities, not phone numbers. Do not derive a
-- phone from an old bridge wa_id, its length, country prefix or display name.
alter table public.contacts
  add column if not exists phone_number text;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'contacts_phone_number_digits' and conrelid = 'public.contacts'::regclass) then
    alter table public.contacts add constraint contacts_phone_number_digits
      check (phone_number is null or phone_number ~ '^[0-9]{7,15}$');
  end if;
end $$;

create index if not exists contacts_phone_number_idx
  on public.contacts (phone_number) where phone_number is not null;

-- Official Cloud API identities are actual sender phone numbers. Bridge
-- contacts are backfilled separately from verified WhatsApp LID/PN mappings.
update public.contacts c set phone_number = c.wa_id
where c.phone_number is null and c.wa_id ~ '^[0-9]{7,15}$'
  and exists (
    select 1 from public.conversations cv
    join public.whatsapp_numbers n on n.id = cv.whatsapp_number_id
    where cv.contact_id = c.id and n.phone_number_id not like 'unofficial:%'
  );

notify pgrst, 'reload schema';
