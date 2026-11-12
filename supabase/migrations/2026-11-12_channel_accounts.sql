-- Facebook Messenger and TikTok direct messages in the inbox (owner, 12 Nov
-- 2026: "connect team crm with tiktok … and also fb pages dungun and paka").
--
-- One row per connected Facebook page / TikTok account: which clinic it
-- belongs to, and the token that lets the CRM read and answer its messages.
-- The token columns hold SEALED text (AES-256-GCM, src/lib/social/seal.ts) —
-- the key lives only in the server's environment, so this table on its own,
-- a backup of it, or a read-only query never shows a usable token.
--
-- The messages themselves need no new table: a connected account is a row in
-- whatsapp_numbers ("fb:dungun:<page id>" / "tt:dungun:<account id>"), each
-- person a contact ("fb:<their id>" / "tt:<conversation id>"), exactly as the
-- Google web chat does with "web:" — see src/lib/social/lines.ts.
--
-- Safe to run more than once.

create table if not exists public.channel_accounts (
  id                  uuid primary key default gen_random_uuid(),
  provider            text not null check (provider in ('facebook', 'tiktok')),
  external_id         text not null,                 -- Facebook page id / TikTok business account id
  clinic              text not null check (clinic in ('dungun', 'paka')),
  name                text,                          -- the page's name / the account's @username
  access_token        text not null,                 -- sealed
  refresh_token       text,                          -- sealed; TikTok only
  expires_at          timestamptz,                   -- TikTok: the access token lasts a day
  refresh_expires_at  timestamptz,
  status              text not null default 'active' check (status in ('active', 'reauth')),
  last_error          text,
  connected_by        uuid references public.profiles(id) on delete set null,
  connected_at        timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (provider, external_id)
);

-- RLS on with no policies: service-role (server routes) only. No staff
-- browser, and no realtime subscription, can read a row.
alter table public.channel_accounts enable row level security;
