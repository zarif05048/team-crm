# Project context — handoff for any Claude Code session

> Read this first. It captures everything a fresh Claude session needs to
> continue this project from any device (web, mobile, or a new desktop session).
> It contains **no secrets** — real keys/tokens live in `.env.local` (local) and
> Vercel env vars (production), never in git.
>
> Moving to a **different Claude account**? See
> [`docs/ACCOUNT_HANDOFF.md`](ACCOUNT_HANDOFF.md) — repo access, env vars, and
> what stays put (everything real: Vercel, Supabase, the WhatsApp number).

## What this is

A **WhatsApp-first team CRM** for a 10-person team (a clinic, *Klinik Perubatan
Hijraa, Dungun, Malaysia*). The owner is **non-technical** — Claude builds and
deploys everything; explain external steps in plain language.

- **Live app:** https://team-crm-one.vercel.app
- **Repo:** github.com/zarif05048/team-crm — **public** (deliberate; confirmed
  with the owner 2026-08-15). Anyone can read this code, so nothing sensitive
  may ever be committed: no keys, no tokens, no patient data — not in a comment,
  a fixture, or a script default. Secrets live in `.env.local` and Vercel env
  vars only. `.env*` is gitignored, and the full history was scanned clean on
  2026-08-15.
- **Goal that drove building vs. buying:** avoid ~$80–300/mo SaaS (respond.io/wati).

## Status: MVP COMPLETE & LIVE (7-day build finished)

All features built, tested live, deployed:
- Auth (first signup = admin), roles (admin/agent), route protection
- WhatsApp **inbound** webhook + **outbound** send (official Meta Cloud API)
- Live realtime shared inbox (Supabase Realtime)
- Collaboration: assignment, internal notes + @mentions, open/close status
- Lead pipeline (drag-drop kanban: new→qualified→booking→won/lost; weight-loss leads only — see below), tags
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
- **`git push` to `master` also auto-deploys to production** (Vercel's GitHub
  integration is connected — confirmed 2026-07-27). So a push is a deploy: if a
  change needs a Supabase migration run first, run the migration BEFORE pushing,
  not just before the manual deploy command.
- **Set Vercel env vars via `scripts/set-vercel-env.mjs` (REST API), NOT the CLI** —
  piping values to `vercel env add` in PowerShell mangles them.
- Secrets: `.env.local` (gitignored). See `.env.example` for the list. Same values
  live in Vercel env (production).

## Supabase egress (free tier — 5 GB/month, shared across the org)

`getConversations()` is the hottest query in the system: every realtime change
refreshes the inbox route on every open staff device, so its size is multiplied
by (events x devices). Treat it as egress-sensitive.

- Preview line and unread badge come from denormalised columns on
  `conversations` (`last_message_body`, `last_message_direction`,
  `unread_count`), maintained by the `messages_touch_conversation` trigger.
  That trigger is the ONLY writer of `last_message_at` / `last_inbound_at` —
  don't update them from the app, it just doubles the realtime events.
- `ConversationListRow` is deliberately narrower than `ConversationRow`. Add a
  field to the list select only if a list view renders it.
- `scripts/check-inbox-query.mjs` measures the live payload, old shape vs new.
  It was 347 KB per refresh; it's 115 KB now (2026-07-27).
- Realtime `messages`/`notes` subscriptions are filtered to the open thread —
  Realtime ships whole rows to every subscriber.
- The open thread subscribes to `messages`/`notes` in ONE place —
  `src/components/inbox/use-thread-realtime.ts` — and renders the new row
  straight from the realtime payload, so a message appears without waiting for
  `router.refresh()` to re-query the route. `RealtimeRefresh` keeps only the
  `conversations` subscription and owns the refresh policy (visibility rule, 2s
  coalescing, polling net); the hook books a reconciling refresh through its
  exported `notifyInboxChange()`. Don't re-add a messages subscription in a
  second component — Realtime ships whole rows to every subscriber.
- Inbox search (box above the conversation list) has three layers:
  1. the **already-loaded** rows are filtered client-side — name, phone,
     last-message preview, assignee, tags — so typing costs nothing;
  2. chats older than the loaded 200 come from `searchConversations()`
     (debounced 300ms, min 2 chars, 25 rows, name/phone), under "Older chats";
  3. **message text** across every conversation comes from `searchMessages()`
     (min 3 chars, 25 newest matches), listed under "Messages"; each hit links
     to `/inbox/<id>?q=…`, which opens the thread with its own search bar on
     that word (and loads `THREAD_SEARCH_MESSAGE_LIMIT` = 1,000 messages for
     that render, since the match can be older than the usual 300).
  Message search **requires `2026-08-11_message_search.sql`** (pg_trgm + GIN
  indexes on `messages.body` and the contact columns). Without it the query
  still returns the right rows but sequentially scans `messages`. **Applied to
  production — verified 2026-08-15**, all five indexes present in `pg_indexes`;
  don't re-run it looking for a speedup. The 3-character minimum exists because
  a trigram index cannot serve a shorter `ilike '%x%'` pattern. Phone matching goes through
  `phoneCandidates()` in `src/lib/search.ts` so "011…", "+6011…" and "6011…"
  all find the same contact.
- In-conversation search (🔍 in the thread header / Ctrl+F,
  `src/components/inbox/thread-search.tsx`) matches **client-side** over the
  messages the thread already loaded (newest 300, `THREAD_MESSAGE_LIMIT`), so
  typing costs zero egress. Don't turn it into a per-keystroke DB query.

## Known gotchas (already solved — don't re-hit them)

- npm rejects a package dir named with a space → app lives in `crm/` subfolder.
- Hydration mismatch on times (server "AM" vs client "am") → `formatTime` forces
  `en-US` + `suppressHydrationWarning` on time elements.
- **All times are Malaysian time, pinned in code** (`CLINIC_TZ` in
  `src/lib/utils.ts`). Never format a timestamp without `timeZone` — the server
  runs in UTC and `suppressHydrationWarning` makes React KEEP the server's text,
  so an unpinned stamp shows staff a time 8 hours behind (fixed 2026-08-10).
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
  unaffected).
- **Live price list (2026-09-02):** `src/lib/ai/pricing.ts` pulls Stock →
  Pricing from the clinic CMS (`GET /api/bot/pricing`, self-pay prices only)
  when `CMS_URL` + `CMS_REMINDER_TOKEN` are set (same token the WhatsApp
  fleet uses — `REMINDER_SYNC_TOKEN` on Render). Services go into the cached
  system block; medications are behind the `lookup_medication` tool. Unset =
  the bot quotes only the hand-written estimates in `knowledge.ts`, as before.
  Wording is kept identical to the fleet's `cms.js` so both lines answer alike. Migration: `supabase/migrations/2026-07-05_ai_bot.sql`
  (also folded into `schema.sql`).
- Webhook route sets `maxDuration = 60` for the after() work.
- **Politeness register (2026-08-10):** the system prompt carries a "POLITENESS
  IN BAHASA MELAYU" block — clipped colloquial commands ("sabar sikit",
  "tunggu jap", "tak boleh") read as scolding to patients, so the bot must use
  the "mohon/sila ... ya Puan/Tuan" forms instead. Keep that block if you
  rewrite the prompt.
- Dev helper: `scripts/send-signed-webhook.mjs` (HMAC-signed local webhook
  test; the older `send-test-webhook.mjs` is unsigned and now 401s since
  META_APP_SECRET is set).

## TCA minor surgical list → Google Sheet (added 2026-08-10)

Procedure bookings are written straight into the clinic's own
**TCA MINOR SURGICAL** spreadsheet (`TCA_SHEET_ID`, owned by
hijraadungunhealthcare@gmail.com), which keeps **one tab per month** named
`tca minor surgical <malay month> <year>` (e.g. `tca minor surgical ogos 2026`).

- Two writers: the bot tool `book_minor_surgery` (patient asks/agrees to a
  procedure) and the toolbar **"TCA list"** button → `addTcaEntry` server
  action (staff-arranged bookings, can also set the doctor).
- `src/lib/sheets/google.ts` = dependency-free Sheets client (service-account
  JWT → token → REST; no `googleapis` package). `src/lib/sheets/tca.ts` = the
  clinic-specific part: month tab lookup, **creating next month's tab with the
  standard header when it doesn't exist yet**, row layout.
- The tab is chosen from the APPOINTMENT date (not today), parsed day-first
  (`05/08/2026` = 5 August). Unparseable dates ("pt nak confirm balik nanti")
  are written through as-is into the current month's tab.
- Values are written RAW so Google can't reinterpret dd/mm as US mm/dd.
- Column order is the clinic's: NAME | PROCEDURE | TEMPAT | TARIKH TCA | MASA |
  DR BERTUGAS | CONFIRMATION… | STATUS | FOLLOW UP… — the CRM fills the first
  five (phone number goes in the PROCEDURE cell in brackets, as staff do it).
- Fails soft: no `GOOGLE_SERVICE_ACCOUNT_JSON` → the booking is still noted in
  the thread with "⚠️ sheet not connected". Setup: `docs/TCA_SHEET_SETUP.md`,
  check with `scripts/test-tca-sheet.mjs`.
- The bot now also gets a small **TODAY (Malaysia date)** system block after the
  cached prompt, so "esok"/"Khamis ni" become real dd/mm/yyyy dates. Keep it in
  its own block — putting it inside BOT_SYSTEM_PROMPT would break prefix caching.

## Pipeline = weight-loss enquiries only (added 2026-09-23)

The owner asked for the Pipeline board to hold only patients enquiring about
the weight-loss programme.

- A thread is on the board when it carries the **`weight-loss` tag**
  (`WEIGHT_LOSS_TAG`, `getWeightLossPipeline()` in `src/lib/data/conversations.ts`).
- The tag is added by a **database trigger** on `messages` insert
  (`supabase/migrations/2026-09-23_weight_loss_pipeline.sql`): the first
  inbound message matching the weight-loss pattern tags the thread and sets
  `stage = 'new'`, so it lands in the New column. Later messages leave the
  stage alone. It's in the DB (not `ingest.ts`) so it also catches the bot
  fleet's lines, which write `messages` directly from the marketing PC.
- The pattern is the same as `WEIGHT_LOSS_RE` in `src/lib/data/analytics.ts`
  and the fleet's `bridge.js` (Postgres spells `\b` as `\m`). Keep all three
  in step.
- The migration also backfilled the tag onto every thread that had already
  asked, keeping their existing stage.
- Staff can add/remove the tag by hand in the thread's tag bar to put a
  patient on or off the board.
- **One card per patient** (grouped by contact in `pipeline-board.tsx`): a
  patient messaging two lines has a thread on each. The card sits at the
  furthest stage of those threads; a drop moves all of them (`setPatientStage`).
- **Delete button** on each card (`removeFromPipeline`) removes the tag from
  all the patient's threads — chats stay in the inbox — and sets
  `contacts.pipeline_removed_at`. From 5 October, a NEW inbound weight-loss
  enquiry dated after removal clears that marker and starts the thread in New;
  replayed older messages remain excluded. Already tagged leads keep the stage
  staff set. Migration `2026-10-05_weight_loss_reenquiry.sql` also repairs missed
  prospects with enquiries after removal; it does not send any messages.
  Adding the tag by hand still brings them back.
- **Staff exclusion (owner, 2026-10-05):** `staff` means the contact is a clinic
  staff member, so no automatic/manual weight-loss prospect tag on any of their
  clinic-line threads. Migration `2026-10-05_weight_loss_staff_exclusion.sql`
  removes existing staff prospect tags and keeps this rule when Staff is added
  later. Messages and existing stages remain intact. `needs-staff` means a
  patient handoff and does not exclude a patient from the pipeline.
- **PeKa B40 (owner, 2026-10-05):** clinic registered for free screening of
  eligible recipients. Link: https://kelayakan11.pekab40.com.my/semakan-kelayakan.
  Includes FBC, sugar control, cholesterol, kidney function and urine tests;
  NO FASTING. Paid-package 4–6-hour fasting advice must not override this.
  Prefer daytime/morning, except Friday (lab closed; clinic remains open 24h).
  Knowledge mirrors the fleet's `ai.js`; no paid-checkup poster for PeKa B40.
- **Monthly Mounjaro/Wegovy packages (owner, 2026-10-05):** all four injections
  are administered at the clinic; patients cannot take the package pen home.
  Explain this when quoting a monthly package and in package poster captions.
  The separately priced self-injection pen remains a separate purchase, not
  part of the four-injection monthly package. Both bot knowledge sources match.
- **Final answers only (owner, 2026-10-05):** searches and tool calls are silent;
  never send progress text such as "Saya semak dulu" or generic-name retries.
  The fleet returns only a completed tool-free answer, with four tool rounds
  plus one final request with tools disabled. Earlier useful/emergency advice
  stays in model history and must be included in the final answer. The CRM bot
  uses the same prompt rule and disables tools in its final round too.
- **No Contacted column** (owner, 2026-09-23): removed from `STAGE_ORDER`
  (board + chat stage dropdown). Existing `contacted` threads moved to `new`
  by `2026-09-23_drop_contacted.sql`; the board also shows any leftover one in
  New. The DB constraint still allows the value.
- **Booking column** (owner, 2026-09-23) between Qualified and Won: stage
  `booking`, allowed by the check re-created in `2026-09-23_booking_stage.sql`.
  Manual only — the AI bots still move a booking to `qualified`.
- **Not Respond column** (owner, 2026-10-10) right of Follow Up: stage
  `no_response`, for patients followed up who never answered. Allowed by the
  check re-created in `2026-10-10_no_response_stage.sql` (run BEFORE pushing).
  Manual only — staff drag cards in and out; a reply does not move the card
  back by itself, and no date or yellow warning applies in this column. A
  patient whose threads disagree sits at the furthest stage (`STAGE_RANK`),
  with Not Respond between Follow Up and Booking.

## Pipeline follow-up dates (2026-10-04)

- Booking cards have an editable **Booking / follow-up date**. The former
  Qualified column is named **Follow Up** (stored stage remains `qualified`).
  Moving a card into Follow Up means staff have followed up; it records today
  automatically, with just an editable **Follow-up date** and no checkbox.
  Date edits save automatically. Moving into the same column keeps the date.
- Stored on `contacts.pipeline_booking_date` / `pipeline_follow_up_at`, so one
  patient's card shares these across Marketing, Dungun and Paka threads.
- Yellow after seven Malaysia calendar days: Booking from its selected date
  while still in Booking; Follow Up from its recorded follow-up (or stage entry
  for older cards), only if the patient hasn't replied afterwards on any line.
- Board drops and the inbox stage selector record the date through the existing
  authenticated, RLS-protected database client. Only threads actually changing
  stage reset the date; a same-column drop preserves it. If date recording
  fails after the move, the action asks staff to set the date on the card.
- Migration `2026-10-04_pipeline_follow_up.sql` must run **before deployment**.
  It tracks `conversations.stage_entered_at` via a trigger and publishes contact
  updates for the Pipeline's realtime subscription. Existing stages start
  tracking at migration time because their true entry dates aren't recorded;
  staff can backdate completed follow-ups they already sent.
- The extra fields/reply query are Pipeline-only, keeping the inbox payload
  small. Check rules with `node --experimental-strip-types scripts/test-pipeline-follow-up.mjs`.

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
- Continuing from another Claude account (second subscription, new login,
  teammate): `docs/ACCOUNT_HANDOFF.md` has the click-by-click steps.
