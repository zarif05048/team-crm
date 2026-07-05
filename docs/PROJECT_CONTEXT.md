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

> **Database isolation (2026-06-22):** the CRM has its **OWN dedicated Supabase
> project** (ref `ewwzmyzegmjoiqstbjbn`), NOT the shared `asdxdpheddvialhovogn`
> project used by the Weight Tracker + NCD apps. They shared one project until
> 2026-06-22, which caused all ~1,470 `<IC>@patient.hijraa` patient logins (and
> staff/doctor) to land in the CRM `profiles` table as "Agent" team members — the
> `handle_new_user` trigger fires on every `auth.users` insert. Splitting the CRM
> into its own project fixed the polluted team list AND the auth gap (a patient
> could otherwise log into the CRM with their IC/password). Keep the CRM on its
> own project; never re-point it at the patient-apps project.

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

- Meta app id: `1013631327812903`
- **LIVE production number `+60 11-2965 0884`** ("Marketing Hijraa Dungun-Paka"),
  phone_number_id `1244016635452219`, in WABA **"Marketing Hijraa" = `3054756001402326`**
  (business `234860424837223` "Klinik Perubatan Hijraa 24 Jam Dungun"). Connected
  2026-06-22; #131030 ("recipient not in allowed list") resolved by leaving the test number.
- Old test number `+1 555-060-4423` (phone_number_id `110684731762540`, WABA
  `100179786166143`) is **retired** — removed from CRM DB + app unsubscribed from that WABA.
- Webhook points at Vercel via **`override_callback_uri`** on
  `POST /{WABA}/subscribed_apps` (`scripts/set-webhook-override.mjs`) — set on the
  Marketing Hijraa WABA. No tunnel.
- Token: **never-expiring System User token** is now live (system user "CRM Connector",
  `expires_at: 0`, scopes whatsapp_business_management + whatsapp_business_messaging).
  The system user must have BOTH the app AND the WhatsApp account assigned as assets
  (assign the WABA via WhatsApp accounts → Marketing Hijraa → Assign access → Full control).
- Unverified-business cap = **2 phone numbers** total per business (verification lifts to 20).
- Subscribing the app to the WABA (`subscribed_apps`) is required to receive — not
  just subscribing the `messages` webhook field.

## Deploy / run

- Local dev (Windows): `npm install` then `npm run dev` (Node at `C:\Program Files\nodejs`).
- **Functions region is pinned to `sin1` (Singapore) in `vercel.json`** — same
  region as the Supabase project (`ap-southeast-1`). Before 2026-07-06 functions
  ran in the default `iad1` (US East), making every page navigation cross the
  Pacific several times (~1s+ per conversation click). Don't remove this file.
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
- **Free-tier Supabase pauses after ~1 week idle** — DNS for the project host
  stops resolving ("fetch failed" everywhere). Owner must click "Restore
  project" in the Supabase dashboard.

## AI auto-reply bot (added 2026-07-05)

Patient-facing FAQ bot on the WhatsApp line, powered by the Claude API
(`claude-sonnet-5` — owner's choice for cost; `@anthropic-ai/sdk`).

- Flow: webhook ingest → `after()` (post-200) → `src/lib/ai/bot.ts:runBotReply`
  → waits 2.5s to batch rapid messages → only the run for the *newest* inbound
  message replies → Claude call with clinic knowledge + last 30 messages →
  reply sent via existing `sendText`, recorded with `sent_by_bot = true`.
- Knowledge pack + system prompt: `src/lib/ai/knowledge.ts` (owner-editable;
  facts drafted from the clinic website; `[SAHKAN]` marks unconfirmed items).
  Guardrails: no medical advice/diagnosis/prices; emergencies → come in / 999;
  redirects to official clinic line 013-9237548.
- Tools: `book_appointment` (writes a 📅 note, tags `booking`, stage→qualified)
  and `alert_staff` (note + `needs-staff`/`urgent` tag + disables bot = handoff).
- Bot on/off: `conversations.bot_enabled` (default true). Manual staff reply
  or template reply pauses it (in `recordOutbound`); toolbar "AI on/off"
  button (violet, Bot icon) re-enables. Bot messages render violet with 🤖 AI.
- Requires `ANTHROPIC_API_KEY` env (empty = bot silently disabled, CRM
  unaffected). Migration: `supabase/migrations/2026-07-05_ai_bot.sql`
  (also folded into `schema.sql`).
- Webhook route sets `maxDuration = 60` for the after() work.
- Dev helper: `scripts/send-signed-webhook.mjs` (HMAC-signed local webhook
  test; the older `send-test-webhook.mjs` is unsigned and now 401s since
  META_APP_SECRET is set).

## Outstanding / roadmap

1. ~~Permanent token~~ ✅ DONE (2026-06-22) — never-expiring System User token live.
2. ~~Real business number~~ ✅ DONE (2026-06-22) — +60 11-2965 0884 live on Cloud API.
3. **Rotate** the Supabase/Vercel keys that were shared in chat (hygiene).
4. **Business verification** still "In review" — only caps daily limit (250/day unverified
   → 1,000+ once approved) and the 2-number cap (→ 20). Does not block messaging.
5. **Template (closed-window) path** coded but never tested live.
6. **Phase 2 channels** (deferred): Facebook Messenger ✅ + Instagram DM ✅ are doable
   (same Meta app/webhook). TikTok DM = possible for Malaysia but needs Messaging
   Partner approval. Google = **no live chat** (Business Messages shut down 2024);
   only review read/reply via Business Profile API.

## Working with the owner

- Non-coder: give plain-language, click-by-click steps for any external setup.
- Push to GitHub **at every milestone** (owner's standing request); verify no secrets
  staged first.
- `scripts/` holds dev/diagnostic helpers (DB peek, user reset, webhook simulate,
  WABA subscribe, env push, token exchange). They read secrets from `.env.local`.
