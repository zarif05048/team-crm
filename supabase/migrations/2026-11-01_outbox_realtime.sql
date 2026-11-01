-- The WhatsApp lines are TOLD about staff replies instead of asking (1 Nov 2026).
--
-- Each line asked bridge_outbox "anything to send?" every 5 seconds: 52,000
-- requests a day, 72% of this project's API traffic and most of its log
-- ingestion (over the free quota). With bridge_outbox in the realtime
-- publication the fleet (bot v140, bridge.js watchOutbox) hears each insert
-- at once and asks only once a minute as a safety net. Until this runs, the
-- lines simply keep polling every 5 seconds. Safe to run more than once.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'bridge_outbox'
  ) then
    alter publication supabase_realtime add table public.bridge_outbox;
  end if;
end $$;
