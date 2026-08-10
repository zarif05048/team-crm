# Connecting the CRM to the "TCA MINOR SURGICAL" Google Sheet

The CRM can write a patient straight into the clinic's **TCA MINOR SURGICAL**
sheet — the same list the staff keep by hand, one tab per month
(`tca minor surgical ogos 2026`, then `... september 2026`, and so on).

Two things fill it in:

- the **AI assistant (Hana)** — when a patient asks for or agrees to a procedure
  (chalazion, wart, skin tag, cyst, lipoma, nail avulsion, I&D bisul, sunat,
  knee/shoulder/trigger-finger injections …) it takes the name, procedure,
  branch and date/time, and adds the row automatically;
- the **"TCA list" button** in the chat toolbar — for bookings staff arrange
  themselves, where you can also fill in the doctor and the confirmed time.

Either way the CRM also writes an internal note in the chat, so the booking is
visible in the conversation even if the sheet is unreachable.

Rows go into the tab for the **month of the appointment date**. If that month's
tab doesn't exist yet, the CRM creates it with the same column headers.

---

## What the owner needs to do once (about 10 minutes)

The CRM signs into Google as a "robot account" (Google calls it a *service
account*). You create it once, then share the sheet with it like you would with
a colleague.

### 1. Create the robot account

1. Go to <https://console.cloud.google.com/> and sign in with the clinic Google
   account (`hijraadungunhealthcare@gmail.com` — the sheet's owner).
2. At the top left, click the project dropdown → **New Project**. Name it
   `Klinik Hijraa CRM` → **Create**. Wait a few seconds, then make sure the new
   project is selected in that dropdown.
3. In the search bar at the top, type **Google Sheets API** → open it → click
   **Enable**.
4. In the search bar, type **Service accounts** → open it → **Create service
   account**.
   - Service account name: `crm-sheets`
   - Click **Create and continue**, then **Done** (no roles needed).
5. Click the account you just made → **Keys** tab → **Add key** → **Create new
   key** → choose **JSON** → **Create**. A `.json` file downloads. **Keep it
   private — it is a password.**

### 2. Share the sheet with it

1. Open the downloaded JSON file in Notepad. Find the line
   `"client_email": "crm-sheets@....iam.gserviceaccount.com"` and copy that
   email address.
2. Open the **TCA MINOR SURGICAL** sheet → **Share** → paste that email →
   give it **Editor** → **Send** (untick "Notify people" if you like).

### 3. Give the CRM the key

Send Claude (or paste into the Vercel dashboard) two values:

| Name | Value |
| --- | --- |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | the **entire contents** of the downloaded JSON file, on one line |
| `TCA_SHEET_ID` | `1_BmO30zovN9MYpMJTkbxPbNAfBKv0HHOtzOP2kaeLOA` (already the clinic's sheet) |

In Vercel: **Project → Settings → Environment Variables → Add**, for the
Production environment, then redeploy. (The repo's `scripts/set-vercel-env.mjs`
does this from the command line — the CLI mangles long values.)

For local testing put the same two lines in `.env.local`.

### 4. Check it works

```
node scripts/test-tca-sheet.mjs            # signs in and lists the tabs
node scripts/test-tca-sheet.mjs --append   # writes one TEST row you then delete
```

If it says *"Cannot read the spreadsheet"*, step 2 (sharing) was missed.

---

## If the key is never set

Nothing breaks. The CRM keeps working exactly as before; procedure bookings are
still recorded as notes in the conversation, with a line saying the sheet is not
connected — staff then add the row by hand as they do today.

## Changing the sheet later

If the clinic starts a new spreadsheet (e.g. a new year), only `TCA_SHEET_ID`
changes — share the new sheet with the same robot email first.
