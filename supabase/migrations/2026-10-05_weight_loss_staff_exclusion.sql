-- Only patients belong in the weight-loss pipeline. Apply to CRM only.
BEGIN;

CREATE OR REPLACE FUNCTION public.trg_message_tag_weight_loss()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  wl_tag uuid;
  added integer;
  patient_id uuid;
  removed_at timestamptz;
BEGIN
  IF new.direction <> 'inbound' OR NOT public.is_weight_loss_enquiry(new.body) THEN
    RETURN new;
  END IF;
  BEGIN
    SELECT k.id, k.pipeline_removed_at INTO patient_id, removed_at
    FROM public.contacts k JOIN public.conversations c ON c.contact_id = k.id
    WHERE c.id = new.conversation_id FOR UPDATE OF k;

    -- Staff identity applies to the contact, including their other clinic line.
    -- needs-staff is a patient handoff, not a staff member.
    IF EXISTS (
      SELECT 1 FROM public.conversations c
      JOIN public.conversation_tags ct ON ct.conversation_id = c.id
      JOIN public.tags t ON t.id = ct.tag_id
      WHERE c.contact_id = patient_id AND lower(trim(t.name)) = 'staff'
    ) THEN RETURN new; END IF;

    IF removed_at IS NOT NULL THEN
      IF new.created_at <= removed_at THEN RETURN new; END IF;
      UPDATE public.contacts SET pipeline_removed_at = NULL WHERE id = patient_id;
    END IF;
    SELECT id INTO wl_tag FROM public.tags WHERE name = 'weight-loss';
    IF wl_tag IS NULL THEN
      INSERT INTO public.tags (name, color) VALUES ('weight-loss', '#16a34a')
      ON CONFLICT (name) DO UPDATE SET name = excluded.name RETURNING id INTO wl_tag;
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

-- Also protect manual tags and remove an earlier prospect tag when a contact
-- is marked Staff later. Shared contact locking serialises concurrent tagging.
CREATE OR REPLACE FUNCTION public.trg_weight_loss_staff_exclusion()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  tag_name text;
  patient_id uuid;
BEGIN
  SELECT lower(trim(name)) INTO tag_name FROM public.tags WHERE id = new.tag_id;
  IF tag_name NOT IN ('staff', 'weight-loss', 'weight loss') THEN RETURN new; END IF;
  SELECT k.id INTO patient_id FROM public.contacts k
  JOIN public.conversations c ON c.contact_id = k.id
  WHERE c.id = new.conversation_id FOR UPDATE OF k;

  IF tag_name = 'staff' THEN
    DELETE FROM public.conversation_tags ct USING public.conversations c, public.tags t
    WHERE ct.conversation_id = c.id AND ct.tag_id = t.id
      AND c.contact_id = patient_id AND lower(trim(t.name)) IN ('weight-loss', 'weight loss');
  ELSIF EXISTS (
    SELECT 1 FROM public.conversations c
    JOIN public.conversation_tags ct ON ct.conversation_id = c.id
    JOIN public.tags t ON t.id = ct.tag_id
    WHERE c.contact_id = patient_id AND lower(trim(t.name)) = 'staff'
  ) THEN RETURN NULL;
  END IF;
  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS conversation_tags_weight_loss_staff_exclusion ON public.conversation_tags;
CREATE TRIGGER conversation_tags_weight_loss_staff_exclusion
BEFORE INSERT OR UPDATE OF conversation_id, tag_id ON public.conversation_tags
FOR EACH ROW EXECUTE FUNCTION public.trg_weight_loss_staff_exclusion();

-- Repair existing staff prospects; retain messages, other tags and stages.
DELETE FROM public.conversation_tags ct USING public.conversations c, public.tags t
WHERE ct.conversation_id = c.id AND ct.tag_id = t.id
  AND lower(trim(t.name)) IN ('weight-loss', 'weight loss')
  AND EXISTS (
    SELECT 1 FROM public.conversations staff_chat
    JOIN public.conversation_tags staff_ct ON staff_ct.conversation_id = staff_chat.id
    JOIN public.tags staff_tag ON staff_tag.id = staff_ct.tag_id
    WHERE staff_chat.contact_id = c.contact_id AND lower(trim(staff_tag.name)) = 'staff'
  );
COMMIT;
