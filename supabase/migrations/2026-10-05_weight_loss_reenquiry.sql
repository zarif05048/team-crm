-- Fresh weight-loss interest starts a New prospect, including after removal.
-- Apply to the CRM project ewwzmyzegmjoiqstbjbn before deploying.
-- Earlier removal remains effective for older/replayed messages. Follow-ups
-- on an already tagged thread must never reset a stage staff have advanced.
BEGIN;

CREATE OR REPLACE FUNCTION public.trg_message_tag_weight_loss()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  wl_tag uuid;
  added integer;
  patient_id uuid;
  removed_at timestamptz;
BEGIN
  IF new.direction <> 'inbound' OR NOT public.is_weight_loss_enquiry(new.body) THEN
    RETURN new;
  END IF;

  -- A tagging error must not prevent delivery of a patient's message.
  BEGIN
    SELECT k.id, k.pipeline_removed_at INTO patient_id, removed_at
    FROM public.contacts k JOIN public.conversations c ON c.contact_id = k.id
    WHERE c.id = new.conversation_id
    FOR UPDATE OF k;

    IF removed_at IS NOT NULL THEN
      IF new.created_at <= removed_at THEN
        RETURN new;
      END IF;
      UPDATE public.contacts SET pipeline_removed_at = NULL WHERE id = patient_id;
    END IF;

    SELECT id INTO wl_tag FROM public.tags WHERE name = 'weight-loss';
    IF wl_tag IS NULL THEN
      INSERT INTO public.tags (name, color) VALUES ('weight-loss', '#16a34a')
      ON CONFLICT (name) DO UPDATE SET name = excluded.name
      RETURNING id INTO wl_tag;
    END IF;

    INSERT INTO public.conversation_tags (conversation_id, tag_id)
    VALUES (new.conversation_id, wl_tag) ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS added = ROW_COUNT;
    IF added > 0 THEN
      UPDATE public.conversations SET stage = 'new' WHERE id = new.conversation_id;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'weight-loss tagging failed for message %: %', new.id, sqlerrm;
  END;
  RETURN new;
END;
$$;

-- Catch missed enquiries under the old rule. Keep the removal cutoff until
-- after tags are inserted, so older threads do not re-enter with the fresh one.
WITH added AS (
  INSERT INTO public.conversation_tags (conversation_id, tag_id)
  SELECT DISTINCT m.conversation_id, t.id
  FROM public.messages m
  JOIN public.conversations c ON c.id = m.conversation_id
  JOIN public.contacts k ON k.id = c.contact_id
  CROSS JOIN public.tags t
  WHERE t.name = 'weight-loss' AND m.direction = 'inbound'
    AND public.is_weight_loss_enquiry(m.body)
    AND (k.pipeline_removed_at IS NULL OR m.created_at > k.pipeline_removed_at)
    AND NOT EXISTS (
      SELECT 1 FROM public.conversations existing
      JOIN public.conversation_tags ct ON ct.conversation_id = existing.id
      WHERE existing.contact_id = k.id AND ct.tag_id = t.id
    )
  ON CONFLICT DO NOTHING
  RETURNING conversation_id
)
UPDATE public.conversations SET stage = 'new'
WHERE id IN (SELECT conversation_id FROM added);

UPDATE public.contacts k SET pipeline_removed_at = NULL
WHERE k.pipeline_removed_at IS NOT NULL AND EXISTS (
  SELECT 1 FROM public.conversations c JOIN public.messages m ON m.conversation_id = c.id
  WHERE c.contact_id = k.id AND m.direction = 'inbound'
    AND m.created_at > k.pipeline_removed_at AND public.is_weight_loss_enquiry(m.body)
);
COMMIT;
