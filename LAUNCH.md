# Team CRM — Launch & Usage Guide

Your live app: **https://team-crm-one.vercel.app**

It runs 24/7 in the cloud — your computer does **not** need to be on.

---

## 1. Logging in

- Go to **https://team-crm-one.vercel.app** on any phone, tablet, or computer.
- Sign in with your email + password.
- You are the **admin** (you see the **Settings** gear; agents do not).

## 2. Add your team (admin only)

1. Click the **Settings** gear (bottom-left).
2. Under **Team members**, click **Add member**.
3. Enter their **name**, **email**, a **temporary password** (min 6 chars), and role:
   - **Agent** — handles chats (most people).
   - **Admin** — can also manage the team, quick replies, and settings.
4. Click **Create account**, then **share the email + password** with that teammate.
5. They log in at the same link and can start working immediately.

> To change someone's role, use the dropdown next to their name. The trash icon removes them.

## 3. Using the shared inbox

- **Inbox** — every WhatsApp chat in one place, updating live.
- **Reply** — type in the box and press Enter (or Send). Goes to the customer on WhatsApp.
- **Assign** — use the dropdown at the top of a chat to give it to one teammate, so two people don't reply at once.
- **Internal note** — switch the composer to "Internal note" to leave a message **only your team sees** (type `@` to tag a teammate). The customer never sees notes.
- **Quick replies** — click ⚡ in the composer to insert a saved message (admins create these in Settings).
- **Open / Close** — mark a chat done with **Close**; reopen anytime.

## 4. Lead pipeline

- **Pipeline** tab shows your leads as cards in columns: **New → Contacted → Qualified → Won → Lost**.
- **Drag a card** between columns to update its stage (or use the stage dropdown inside a chat).
- **Tags** — add colored labels (e.g. "VIP", "Follow-up") to any chat; type a tag name to create it.

## 5. The 24-hour rule (important)

WhatsApp only lets you send a **free typed reply within 24 hours** of the customer's last message.
- Inside 24h: type anything. ✅
- After 24h: the app shows the window is closed and offers an **approved template** to re-open the chat.

---

## Good-to-know / maintenance

- **Access token** expires **10 August 2026**. Before then, get a permanent one:
  add a teammate as a second admin in *Meta Business Settings → Users*, then they approve
  the pending **system-user token** request in *Business Settings → Requests*. Send the
  resulting token to your developer to update.
- **Using your own business number** (instead of the +1 test number): a number on the
  WhatsApp API can't also be on the normal WhatsApp app — use a fresh number or migrate one.
  Add it in the Meta dashboard, then it appears automatically in Settings.
- **Security:** the Supabase + Vercel keys shared during setup can be rotated in their
  dashboards for hygiene.
- **Code & backups:** everything is on GitHub (private) at `zarif05048/team-crm`, committed
  at every milestone.
