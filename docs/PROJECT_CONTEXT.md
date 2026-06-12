# Project context — handoff for any Claude Code session

> Read this first. It captures everything a fresh Claude session needs to
> continue this project from any device (web, mobile, or a new desktop session).
> It contains **no secrets** — real keys/tokens live in `.env.local` (local) and
> Vercel env vars (production), never in git.

## What this is

A **WhatsApp-first team CRM** for a 10-person team (a clinic, *Klinik Perubatan
Hijraa, Dungun, Malaysia*). The owner is **non-technical** — Claude builds and
deploys everything; explain external steps in plain language.

- **Live app:** https://team-crm-one.vercel.app
- **Repo:** github.com/zarif05048/team-crm (private)
- **Goal that drove building vs. buying:** avoid ~$80–300/mo SaaS (respond.io/wati).

## Status: MVP COMPLETE & LIVE (7-day build finished)

All features built, tested live, deployed:
- Auth (first signup = admin), roles (admin/agent), route protection
- WhatsApp **inbound** webhook + **outbound** send (official Meta Cloud API)
- Live realtime shared inbox (Supabase Realtime)
- Collaboration: assignment, internal notes + @mentions, open/close status
- Lead pipeline (drag-drop kanban: new→contacted→qualified→won/lost), tags
- Contacts directory
- Admin Settings: team management, quick replies, number rename
- 24h-window handling + template fallback (template path coded, not yet tested live)

## Stack

- **Next.js 16** (App Router, TS) — note: v16 renamed `middleware`→`proxy`
  (`src/proxy.ts`, exported fn `proxy`). Read `node_modules/next/dist/docs/` for v16 APIs.
- **Tailwind v4**, **Supabase** (Postgres/Auth/Realtime/RLS), **Meta WhatsApp Cloud API**
- Hosting: **Vercel** (app) + **Supabase** (backend)

## Architecture

- Inbound: customer → Meta → `POST /api/webhooks/whatsapp` (signature-verified) →
  `lib/whatsapp/ingest.ts` upserts number/contact/conversation, dedupes by
  `wa_message_id`, sets `last_inbound_at` (drives 24h window) → Supabase →
  Realtime → inbox updates live.
- Outbound: composer → server action `app/(app)/inbox/[id]/actions.ts:sendReply`
  → `lib/whatsapp/send.ts` (Graph API) using the conversation's `phone_number_id`
  → store message; delivery status (sent/delivered/read) comes back via webhook.
- DB schema + RLS: `supabase/schema.sql` (run in Supabase SQL editor).
- Realtime: client subscribes to postgres_changes on messages/conversations/notes;
  **must `supabase.realtime.setAuth(token)` before `.subscribe()`** or RLS blocks events.

## Meta / WhatsApp specifics (identifiers, not secrets)

- Meta app id: `1013631327812903`; WABA id: `100179786166143`
- Test number `+1 555-060-4423`, phone_number_id `110684731762540`
- Webhook points at Vercel via **`override_callback_uri`** on
  `POST /{WABA}/subscribed_apps` (`scripts/set-webhook-override.mjs`) — no tunnel.
- Token: currently a **60-day long-lived token** (expires **2026-08-10**), made via
  `scripts/exchange-token.mjs` (fb_exchange_token). A **never-expiring System User
  token** is pending: Meta requires a *second admin* to approve the token request
  (Business Settings → Requests). Owner must add a teammate as admin to approve.
- Subscribing the app to the WABA (`subscribed_apps`) is required to receive — not
  just subscribing the `messages` webhook field.

## Deploy / run

- Local dev (Windows): `npm install` then `npm run dev` (Node at `C:\Program Files\nodejs`).
- Deploy: `vercel deploy --prod --yes --token=<VERCEL_TOKEN> --scope=zarif-teamcrm1`.
- **Set Vercel env vars via `scripts/set-vercel-env.mjs` (REST API), NOT the CLI** —
  piping values to `vercel env add` in PowerShell mangles them.
- Secrets: `.env.local` (gitignored). See `.env.example` for the list. Same values
  live in Vercel env (production).

## Known gotchas (already solved — don't re-hit them)

- npm rejects a package dir named with a space → app lives in `crm/` subfolder.
- Hydration mismatch on times (server "AM" vs client "am") → `formatTime` forces
  `en-US` + `suppressHydrationWarning` on time elements.
- Supabase new-style keys (`sb_publishable_` / `sb_secret_`) are in use.
- Email confirmation is OFF in Supabase (instant team logins).

## Outstanding / roadmap

1. **Permanent token** — add a 2nd Meta admin to approve the pending system-user token.
2. **Real business number** — currently the +1 test number; a real number can't also
   be on the consumer WhatsApp app.
3. **Rotate** the Supabase/Vercel keys that were shared in chat (hygiene).
4. **Phase 2 channels** (deferred): Facebook Messenger ✅ + Instagram DM ✅ are doable
   (same Meta app/webhook). TikTok DM = possible for Malaysia but needs Messaging
   Partner approval. Google = **no live chat** (Business Messages shut down 2024);
   only review read/reply via Business Profile API.

## Working with the owner

- Non-coder: give plain-language, click-by-click steps for any external setup.
- Push to GitHub **at every milestone** (owner's standing request); verify no secrets
  staged first.
- `scripts/` holds dev/diagnostic helpers (DB peek, user reset, webhook simulate,
  WABA subscribe, env push, token exchange). They read secrets from `.env.local`.
