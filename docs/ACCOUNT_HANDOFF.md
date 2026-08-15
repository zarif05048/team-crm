# Continuing this project from another Claude Code account

> Plain-language steps for the owner. **No secrets in this file.**
>
> Use this when you want to carry on building the CRM from a *different Claude
> account* — a second subscription, a new login, or a teammate's account.

## The one thing to understand first

**The project does not live inside your Claude account.** Claude is just the
thing that reads and edits the code. Everything real lives somewhere else:

| What | Where it lives | Affected by switching Claude accounts? |
| --- | --- | --- |
| The code | GitHub — `zarif05048/team-crm` (public) | No |
| The live website | Vercel — https://team-crm-one.vercel.app | No |
| The database + logins | Supabase project `ewwzmyzegmjoiqstbjbn` | No |
| The WhatsApp number | Meta — `+60 11-2965 0884` | No |
| The AI bot's billing | console.anthropic.com (API key) | No |
| Your chat history with Claude | The old Claude account | **Yes — it stays behind** |

So switching accounts means one thing only: **pointing the new account at the
same GitHub repo.** Nothing about the live app moves, breaks, or needs
rebuilding. The clinic keeps sending and receiving WhatsApp messages the whole
time.

The chat history not transferring is fine — that's exactly why
`docs/PROJECT_CONTEXT.md` exists. A fresh session reads it and knows the whole
project.

---

## Before you switch: make sure nothing is left behind

In the *old* account's session, ask Claude:

> Is everything committed and pushed to GitHub? Show me anything unpushed.

Anything not pushed to GitHub is lost when that session's container is recycled.
This is the only step that has to happen *before* you move.

---

## Step 1 — Give the new account permission to push

The repo is **public**, so any Claude account can *read* it straight away —
there is nothing to set up for that. What still has to be granted is **write**
access: the ability to push changes back. Which path you take depends on the
GitHub account:

**If the new Claude account will use the same GitHub account (`zarif05048`):**

1. Log in to Claude on the new account.
2. Connect GitHub when prompted.
3. When GitHub asks which repositories to allow, tick **team-crm** (or "All
   repositories").

**If it will use a different GitHub account:**

1. Go to https://github.com/zarif05048/team-crm
2. Click **Settings** (top of the page) → **Collaborators** in the left menu.
3. Click **Add people**, type that person's GitHub username, invite them.
4. They open the invite email and click **Accept**.
5. Then they connect GitHub in their Claude account as above.

> **Because the repo is public:** never let a real key or token into a file
> here. Anything pushed is visible to the whole internet immediately, and the
> only fix afterwards is rotating it. Real values live in `.env.local` (on your
> PC) and in Vercel's env vars (production) — never in git. `.env*` is
> gitignored; keep it that way.

## Step 2 — Start a session on the repo

In the new account, start a Claude Code session pointed at
**`zarif05048/team-crm`**, branch **`master`**.

## Step 3 — Paste this as the very first message

```
Read CLAUDE.md and docs/PROJECT_CONTEXT.md before doing anything.

This is a live WhatsApp CRM for a clinic — it is in production and real
patients are messaging it right now. Check with me before changing anything
that touches the live WhatsApp number or the database. I am not a coder, so
explain any step I have to click through myself in plain language.
```

That's genuinely all the context a new session needs. `CLAUDE.md` pulls in
`PROJECT_CONTEXT.md` (current state, decisions, gotchas, roadmap) and
`AGENTS.md` (the Next.js 16 warning) automatically.

## Step 4 — Re-enter the secrets in the new account

Environment variables belong to the Claude *environment*, so a new account
starts with none. The full list of names is in
[`.env.example`](../.env.example) — Supabase keys, the Meta WhatsApp token,
`ANTHROPIC_API_KEY`, the Google service-account JSON, and so on.

**Where to get the values if you don't have `.env.local` handy:** Vercel →
**team-crm** → **Settings** → **Environment Variables**. Every production value
is there and can be revealed and copied.

You only need this step if the new session has to run the helper scripts in
`scripts/` (database peeks, webhook tests, token checks) or run the app
locally. Editing code and pushing works without it.

## Step 5 — Only if you also code on your Windows PC

`.env.local` is deliberately **not** in git, so it does not travel with the
repo. It sits on whichever PC you created it on. If you move to a new PC, copy
`.env.example` to `.env.local` and fill it from the Vercel values above.

The gitignored `/.claude/` folder (local Claude settings) doesn't travel either.
Nothing important is in it.

---

## ⚠️ Two things to tell the new session

1. **Pushing to `master` deploys to production immediately.** Vercel's GitHub
   integration is connected to the repo, not to any Claude account, so this is
   just as true from the new account. If a change needs a Supabase migration,
   run the migration *first*.
2. **The database is live.** ~1,470 patient records and real conversations.
   `scripts/` contains destructive helpers (`wipe-for-launch.mjs`,
   `reset-users.mjs`). Nobody should run those without asking you.

## Checking it worked

Ask the new session:

> Summarise the current state of this project and what's left on the roadmap.

If it comes back with the WhatsApp CRM, the live number `+60 11-2965 0884`, the
AI bot and the outstanding roadmap items (key rotation, business verification,
the untested template path), it has the full context and you can carry on
exactly where you stopped.

## What you do *not* have to do

- ❌ Re-deploy the app
- ❌ Re-connect the WhatsApp number or re-verify the webhook
- ❌ Move or export the Supabase database
- ❌ Create a new Anthropic API key for the bot
- ❌ Tell the team to log in again

The clinic will not notice anything.
