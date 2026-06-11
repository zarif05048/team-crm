# Team CRM — WhatsApp-first shared inbox & lead pipeline

A collaboration platform for a sales team to unify customer leads and live-chat
customers across WhatsApp (with Facebook, Instagram, Google Reviews and TikTok
planned later). Built with the **official Meta WhatsApp Cloud API**.

## Tech stack

- **Next.js 16** (App Router, TypeScript) + **Tailwind CSS v4**
- **Supabase** — Postgres, Auth, Realtime, Row Level Security
- **Meta WhatsApp Cloud API** — webhook receive + Graph API send
- Deploys to **Vercel** (app) + **Supabase** (backend)

## Milestones

- [x] **Day 1 — Foundation**: auth (first user = admin), roles, DB schema + RLS,
      app shell with sidebar, responsive layout.
- [x] **Day 2 — WhatsApp inbound**: signed webhook (`/api/webhooks/whatsapp`),
      message ingest (auto-connect number, dedupe, 24h-window tracking), live
      inbox with conversation list + thread view.
- [x] **Live realtime inbox**: messages appear instantly via Supabase Realtime,
      no page refresh (brought forward from Day 4).
- [ ] **Day 3 — Outbound replies**: send via Graph API, multi-number routing,
      24h-window template handling.
- [ ] **Day 4 — Collaboration**: assignment, internal notes, @mentions.
- [ ] **Day 5 — Pipeline**: contact profiles, lead stages, tags.
- [ ] **Day 6 — Admin**: team management, roles, canned replies.
- [ ] **Day 7 — Launch**: permanent hosting + token, real number, onboarding.

## Setup

1. Install dependencies: `npm install`
2. Copy `.env.example` to `.env.local` and fill in:
   - Supabase URL + anon + service-role keys
   - Meta WhatsApp access token, API version, verify token, app secret
3. In Supabase → SQL Editor, run [`supabase/schema.sql`](supabase/schema.sql).
4. Turn **off** email confirmation in Supabase Auth (internal team tool).
5. Run the dev server: `npm run dev` → http://localhost:3000

## WhatsApp webhook

- Configure Meta webhook callback to `<public-url>/api/webhooks/whatsapp` with
  the verify token from `.env.local`.
- Subscribe the **`messages`** field **and** subscribe the app to the WABA
  (`POST /{WABA_ID}/subscribed_apps`) — both are required to receive messages.

> `scripts/` contains throwaway dev/diagnostic helpers (DB peek, user reset,
> webhook simulation, WABA subscribe). They read secrets from `.env.local`.
