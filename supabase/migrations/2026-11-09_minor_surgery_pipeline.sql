-- Minor-surgery pipeline (owner, 2026-11-09): "focus on weight loss, minor
-- surgery". A second board beside weight loss, on the same stages and dates.
-- Apply to the CRM project ewwzmyzegmjoiqstbjbn BEFORE deploying the app.
--
-- The first inbound message that asks about a procedure on the TCA minor
-- surgical list tags the thread `minor-surgery` (the tag the bot's
-- book_minor_surgery and the staff "TCA list" button already add) and starts it
-- in New. Sunat/khatan is NOT here: it has its own interest-form flow.
-- A thread already on the weight-loss board keeps the stage staff gave it.
-- Staff are never prospects. Removing a patient from this board marks
-- contacts.surgery_removed_at, so older/replayed messages cannot bring them
-- back; a NEW enquiry after the removal does.
BEGIN;

ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS surgery_removed_at timestamptz;

INSERT INTO public.tags (name, color) VALUES ('minor-surgery', '#0d9488')
ON CONFLICT (name) DO NOTHING;

-- Calibrated on 60 days of real enquiries (counts only, 9 Nov 2026): ~49
-- threads. "sista" is matched as a word start so "assistant" does not count.
CREATE OR REPLACE FUNCTION public.is_minor_surgery_enquiry(body text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT coalesce(body, '') ~* (
    'ketuat|kutil|\mwart|tahi\s*lalat|\mmole\M|skin\s*tag|ketumbit|\msista|\mcyst|lipoma|ketumbuhan|benjol|ketulan|ganglion'
    || '|bisul|\mabses|abscess|\mtoreh|kuku\s*(tumbuh|masuk|cucuk|terbenam|dalam)|ingrown|cabut\s*kuku'
    || '|chalazion|bintit|\mstye\M|pembedahan\s*kecil|bedah\s*kecil|minor\s*(surg|op)|cryo'
  );
$$;

CREATE OR REPLACE FUNCTION public.trg_message_tag_minor_surgery()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ms_tag uuid;
  added integer;
  patient_id uuid;
  removed_at timestamptz;
BEGIN
  IF new.direction <> 'inbound' OR NOT public.is_minor_surgery_enquiry(new.body) THEN
    RETURN new;
  END IF;

  -- A tagging error must never stop a patient's message being stored.
  BEGIN
    SELECT k.id, k.surgery_removed_at INTO patient_id, removed_at
    FROM public.contacts k JOIN public.conversations c ON c.contact_id = k.id
    WHERE c.id = new.conversation_id
    FOR UPDATE OF k;
    IF patient_id IS NULL THEN RETURN new; END IF;

    IF EXISTS (
      SELECT 1 FROM public.conversations c
      JOIN public.conversation_tags ct ON ct.conversation_id = c.id
      JOIN public.tags t ON t.id = ct.tag_id
      WHERE c.contact_id = patient_id AND lower(trim(t.name)) = 'staff'
    ) THEN
      RETURN new;
    END IF;

    IF removed_at IS NOT NULL THEN
      IF new.created_at <= removed_at THEN RETURN new; END IF;
      UPDATE public.contacts SET surgery_removed_at = NULL WHERE id = patient_id;
    END IF;

    SELECT id INTO ms_tag FROM public.tags WHERE name = 'minor-surgery';
    IF ms_tag IS NULL THEN
      INSERT INTO public.tags (name, color) VALUES ('minor-surgery', '#0d9488')
      ON CONFLICT (name) DO UPDATE SET name = excluded.name
      RETURNING id INTO ms_tag;
    END IF;

    INSERT INTO public.conversation_tags (conversation_id, tag_id)
    VALUES (new.conversation_id, ms_tag) ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS added = ROW_COUNT;
    IF added > 0 AND NOT EXISTS (
      SELECT 1 FROM public.conversation_tags ct JOIN public.tags t ON t.id = ct.tag_id
      WHERE ct.conversation_id = new.conversation_id AND lower(trim(t.name)) IN ('weight-loss', 'weight loss')
    ) THEN
      UPDATE public.conversations SET stage = 'new' WHERE id = new.conversation_id;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'minor-surgery tagging failed for message %: %', new.id, sqlerrm;
  END;
  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS messages_tag_minor_surgery ON public.messages;
CREATE TRIGGER messages_tag_minor_surgery
  AFTER INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.trg_message_tag_minor_surgery();

-- Enquiries from the last 60 days that are not on the board yet start in New
-- (a thread on the weight-loss board keeps its stage). Older ones are left
-- off: a two-month-old "berapa buang ketuat" is not a lead to chase today.
WITH added AS (
  INSERT INTO public.conversation_tags (conversation_id, tag_id)
  SELECT DISTINCT m.conversation_id, t.id
  FROM public.messages m
  JOIN public.conversations c ON c.id = m.conversation_id
  CROSS JOIN public.tags t
  WHERE t.name = 'minor-surgery' AND m.direction = 'inbound'
    AND m.created_at > now() - interval '60 days'
    AND public.is_minor_surgery_enquiry(m.body)
    AND NOT EXISTS (
      SELECT 1 FROM public.conversations sc
      JOIN public.conversation_tags sct ON sct.conversation_id = sc.id
      JOIN public.tags st ON st.id = sct.tag_id
      WHERE sc.contact_id = c.contact_id AND lower(trim(st.name)) = 'staff'
    )
  ON CONFLICT DO NOTHING
  RETURNING conversation_id
)
UPDATE public.conversations conv SET stage = 'new'
WHERE conv.id IN (SELECT conversation_id FROM added)
  AND NOT EXISTS (
    SELECT 1 FROM public.conversation_tags ct JOIN public.tags t ON t.id = ct.tag_id
    WHERE ct.conversation_id = conv.id AND lower(trim(t.name)) IN ('weight-loss', 'weight loss')
  );

COMMIT;
