-- ============================================================================
--  WhatsApp Team CRM — Database schema + Row Level Security
--  Run this in the Supabase dashboard:  SQL Editor → New query → paste → Run
--  Safe to re-run (uses IF NOT EXISTS / OR REPLACE where possible).
-- ============================================================================

-- Needed for gen_random_uuid()
create extension if not exists "pgcrypto";

-- ----------------------------------------------------------------------------
-- profiles : one row per team member, linked to Supabase auth.users
-- ----------------------------------------------------------------------------
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text,
  full_name   text,
  role        text not null default 'agent' check (role in ('admin','agent')),
  created_at  timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- whatsapp_numbers : each connected WhatsApp Business number
--   NOTE: access tokens are NOT stored here — they live in server env vars
--   so they never reach the browser. phone_number_id maps a number to its token.
-- ----------------------------------------------------------------------------
create table if not exists public.whatsapp_numbers (
  id               uuid primary key default gen_random_uuid(),
  phone_number_id  text not null unique,          -- Meta phone_number_id (from webhook)
  waba_id          text,                          -- WhatsApp Business Account id
  display_name     text not null,                 -- e.g. "Sales line"
  phone_display    text,                          -- e.g. "+60 12-345 6789"
  is_active        boolean not null default true,
  created_at       timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- contacts : one row per customer (unique by WhatsApp id / phone)
-- ----------------------------------------------------------------------------
create table if not exists public.contacts (
  id            uuid primary key default gen_random_uuid(),
  wa_id         text not null unique,             -- customer phone in wa format e.g. 60123456789
  name          text,                             -- editable display name
  profile_name  text,                             -- name WhatsApp reports
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- conversations : one thread per (contact, our number) pair
-- ----------------------------------------------------------------------------
create table if not exists public.conversations (
  id                  uuid primary key default gen_random_uuid(),
  contact_id          uuid not null references public.contacts(id) on delete cascade,
  whatsapp_number_id  uuid not null references public.whatsapp_numbers(id) on delete cascade,
  assigned_to         uuid references public.profiles(id) on delete set null,
  status              text not null default 'open'  check (status in ('open','closed')),
  stage               text not null default 'new'   check (stage in ('new','contacted','qualified','won','lost')),
  bot_enabled         boolean not null default true, -- AI auto-reply on/off per thread
  last_message_at     timestamptz not null default now(),
  last_inbound_at     timestamptz,                 -- drives the 24h-window indicator
  last_read_at        timestamptz,                 -- staff last opened the thread (unread badges)
  created_at          timestamptz not null default now(),
  unique (contact_id, whatsapp_number_id)
);

-- Migration for databases created before 2026-07-05 (AI bot):
alter table public.conversations
  add column if not exists bot_enabled boolean not null default true;
-- Migration for databases created before 2026-07-07 (unread tracking):
alter table public.conversations
  add column if not exists last_read_at timestamptz;

create index if not exists conversations_last_message_idx
  on public.conversations (last_message_at desc);

-- ----------------------------------------------------------------------------
-- messages : every inbound/outbound WhatsApp message
-- ----------------------------------------------------------------------------
create table if not exists public.messages (
  id               uuid primary key default gen_random_uuid(),
  conversation_id  uuid not null references public.conversations(id) on delete cascade,
  wa_message_id    text unique,                    -- Meta message id (dedupe)
  direction        text not null check (direction in ('inbound','outbound')),
  type             text not null default 'text',   -- text|image|document|audio|video|template
  body             text,
  media_url        text,
  status           text default 'sent',            -- received|sent|delivered|read|failed
  sent_by          uuid references public.profiles(id) on delete set null,
  sent_by_bot      boolean not null default false, -- outbound message written by the AI bot
  created_at       timestamptz not null default now()
);

-- Migration for databases created before 2026-07-05 (AI bot):
alter table public.messages
  add column if not exists sent_by_bot boolean not null default false;

create index if not exists messages_conversation_idx
  on public.messages (conversation_id, created_at);

-- ----------------------------------------------------------------------------
-- notes : internal-only collaboration, never sent to the customer
-- ----------------------------------------------------------------------------
create table if not exists public.notes (
  id               uuid primary key default gen_random_uuid(),
  conversation_id  uuid not null references public.conversations(id) on delete cascade,
  author_id        uuid references public.profiles(id) on delete set null,
  body             text not null,
  mentions         uuid[] not null default '{}',   -- mentioned profile ids
  created_at       timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- tags + join table
-- ----------------------------------------------------------------------------
create table if not exists public.tags (
  id     uuid primary key default gen_random_uuid(),
  name   text not null unique,
  color  text not null default '#64748b'
);

create table if not exists public.conversation_tags (
  conversation_id  uuid references public.conversations(id) on delete cascade,
  tag_id           uuid references public.tags(id) on delete cascade,
  primary key (conversation_id, tag_id)
);

-- ----------------------------------------------------------------------------
-- canned_replies : quick reply templates
-- ----------------------------------------------------------------------------
create table if not exists public.canned_replies (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  body        text not null,
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);

-- ============================================================================
--  Helper: is_admin()  — checks the current user's role
-- ============================================================================
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

-- ============================================================================
--  New-user trigger: auto-create a profile.
--  The FIRST user to sign up becomes 'admin'; everyone else 'agent'.
-- ============================================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  is_first boolean;
begin
  select count(*) = 0 into is_first from public.profiles;
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    case when is_first then 'admin' else 'agent' end
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================================
--  Row Level Security
--  Model: this is an internal tool for ~10 trusted teammates.
--  All authenticated users can read/write operational data (chats, contacts).
--  Admin-only: managing numbers, tags, team roles, deletes.
-- ============================================================================
alter table public.profiles          enable row level security;
alter table public.whatsapp_numbers  enable row level security;
alter table public.contacts          enable row level security;
alter table public.conversations     enable row level security;
alter table public.messages          enable row level security;
alter table public.notes             enable row level security;
alter table public.tags              enable row level security;
alter table public.conversation_tags enable row level security;
alter table public.canned_replies    enable row level security;

-- profiles ----------------------------------------------------------------
drop policy if exists "profiles read all"   on public.profiles;
drop policy if exists "profiles update own" on public.profiles;
drop policy if exists "profiles admin write" on public.profiles;
create policy "profiles read all"    on public.profiles for select to authenticated using (true);
create policy "profiles update own"  on public.profiles for update to authenticated using (id = auth.uid());
create policy "profiles admin write" on public.profiles for all    to authenticated using (public.is_admin()) with check (public.is_admin());

-- whatsapp_numbers : everyone reads; admin manages -------------------------
drop policy if exists "numbers read"  on public.whatsapp_numbers;
drop policy if exists "numbers admin" on public.whatsapp_numbers;
create policy "numbers read"  on public.whatsapp_numbers for select to authenticated using (true);
create policy "numbers admin" on public.whatsapp_numbers for all    to authenticated using (public.is_admin()) with check (public.is_admin());

-- helper macro: "authenticated can do everything" for operational tables
-- contacts
drop policy if exists "contacts rw" on public.contacts;
create policy "contacts rw" on public.contacts for all to authenticated using (true) with check (true);
-- conversations
drop policy if exists "conversations rw" on public.conversations;
create policy "conversations rw" on public.conversations for all to authenticated using (true) with check (true);
-- messages
drop policy if exists "messages rw" on public.messages;
create policy "messages rw" on public.messages for all to authenticated using (true) with check (true);
-- notes
drop policy if exists "notes rw" on public.notes;
create policy "notes rw" on public.notes for all to authenticated using (true) with check (true);
-- conversation_tags
drop policy if exists "conv_tags rw" on public.conversation_tags;
create policy "conv_tags rw" on public.conversation_tags for all to authenticated using (true) with check (true);
-- canned_replies
drop policy if exists "canned rw" on public.canned_replies;
create policy "canned rw" on public.canned_replies for all to authenticated using (true) with check (true);

-- tags : everyone reads; admin manages ------------------------------------
drop policy if exists "tags read"  on public.tags;
drop policy if exists "tags admin" on public.tags;
create policy "tags read"  on public.tags for select to authenticated using (true);
create policy "tags admin" on public.tags for all    to authenticated using (public.is_admin()) with check (public.is_admin());

-- ============================================================================
--  Realtime : broadcast row changes so every agent's inbox updates live
-- ============================================================================
do $$
begin
  begin
    alter publication supabase_realtime add table public.messages;
  exception when duplicate_object then null; end;
  begin
    alter publication supabase_realtime add table public.conversations;
  exception when duplicate_object then null; end;
  begin
    alter publication supabase_realtime add table public.notes;
  exception when duplicate_object then null; end;
end $$;

-- Done.
