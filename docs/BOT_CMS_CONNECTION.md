# Website bot connection to the CMS

The website/Google booking chats run inside the CRM on Vercel, separately from
the clinic PC's WhatsApp bots. A successful CMS request from the clinic PC does
not establish that the production website bot can reach the schedule.

## Production configuration

The Vercel `team-crm` project needs both server-only settings in **Production**:

- `CMS_URL`: the clinic CMS base URL, without a trailing slash.
- `CMS_REMINDER_TOKEN`: the existing authorised CMS bot integration key. Store
  it as a Secret. Never add the key to this document, source control, public
  browser configuration or a patient-facing error message.

The variable names are the same ones used by `src/lib/ai/roster.ts` and
`src/lib/ai/pricing.ts`. An environment change takes effect on a new deployment;
it does not update already running functions.

Both settings were absent from the live Vercel project on 27 October 2026,
causing doctor-duty questions to hand off to staff. They were added to the
production environment using the clinic's working integration configuration.

## Verify the actual patient route

1. Wait for the new production deployment to be Ready and assigned to
   `team-crm-one.vercel.app`.
2. In a separate test chat, open `/chat/dungun`, then ask for the doctor on duty
   now. Check the answer against the current CMS rota.
3. Repeat through `/chat/paka`. Include a follow-up question in the same chat,
   because an earlier failed answer must not substitute for a fresh lookup.
4. Confirm the successful replies do not create a staff-handoff note.
5. Keep synthetic test conversations separate from patient conversations.

An unpublished future rota is different from a failed connection. The bot must
not invent a doctor when the date or shift has not been published.
