
ALTER TABLE public.recruiter_notifications
  ADD COLUMN IF NOT EXISTS lead_id UUID REFERENCES public.leads(id) ON DELETE CASCADE;

ALTER TABLE public.recruiter_notifications
  ALTER COLUMN candidate_id DROP NOT NULL;

ALTER TABLE public.recruiter_notifications
  DROP CONSTRAINT IF EXISTS recruiter_notifications_target_check;
ALTER TABLE public.recruiter_notifications
  ADD CONSTRAINT recruiter_notifications_target_check
  CHECK ((candidate_id IS NOT NULL)::int + (lead_id IS NOT NULL)::int = 1);

CREATE TABLE IF NOT EXISTS public.follow_up_notification_log (
  interaction_id UUID NOT NULL,
  source TEXT NOT NULL,
  notified_on DATE NOT NULL,
  PRIMARY KEY (interaction_id, source, notified_on)
);
ALTER TABLE public.follow_up_notification_log ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.notify_lead_followup()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  target_user uuid;
  lead_name text;
BEGIN
  IF NEW.next_follow_up_date IS NULL THEN RETURN NEW; END IF;
  IF NEW.next_follow_up_date::date > CURRENT_DATE THEN RETURN NEW; END IF;

  SELECT COALESCE(l.assigned_to_user_id, l.created_by_user_id), l.name
    INTO target_user, lead_name
  FROM public.leads l WHERE l.id = NEW.lead_id;

  IF target_user IS NULL THEN RETURN NEW; END IF;

  INSERT INTO public.follow_up_notification_log(interaction_id, source, notified_on)
    VALUES (NEW.id, 'lead', CURRENT_DATE)
    ON CONFLICT DO NOTHING;

  IF FOUND THEN
    INSERT INTO public.recruiter_notifications(user_id, lead_id, type, message)
    VALUES (target_user, NEW.lead_id, 'follow_up_due',
            'Follow-up hoje: ' || COALESCE(lead_name, 'lead'));
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.notify_candidate_followup()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  target_user uuid;
  cand_name text;
BEGIN
  IF NEW.next_follow_up_date IS NULL THEN RETURN NEW; END IF;
  IF NEW.next_follow_up_date::date > CURRENT_DATE THEN RETURN NEW; END IF;

  SELECT COALESCE(c.assigned_to_user_id, c.created_by_user_id), c.name
    INTO target_user, cand_name
  FROM public.broker_candidates c WHERE c.id = NEW.candidate_id;

  IF target_user IS NULL THEN RETURN NEW; END IF;

  INSERT INTO public.follow_up_notification_log(interaction_id, source, notified_on)
    VALUES (NEW.id, 'candidate', CURRENT_DATE)
    ON CONFLICT DO NOTHING;

  IF FOUND THEN
    INSERT INTO public.recruiter_notifications(user_id, candidate_id, type, message)
    VALUES (target_user, NEW.candidate_id, 'follow_up_due',
            'Follow-up hoje: ' || COALESCE(cand_name, 'candidato'));
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_notify_lead_followup ON public.lead_interactions;
CREATE TRIGGER trg_notify_lead_followup
AFTER INSERT OR UPDATE OF next_follow_up_date ON public.lead_interactions
FOR EACH ROW EXECUTE FUNCTION public.notify_lead_followup();

DROP TRIGGER IF EXISTS trg_notify_candidate_followup ON public.broker_candidate_interactions;
CREATE TRIGGER trg_notify_candidate_followup
AFTER INSERT OR UPDATE OF next_follow_up_date ON public.broker_candidate_interactions
FOR EACH ROW EXECUTE FUNCTION public.notify_candidate_followup();

CREATE POLICY "follow_up_log admin all" ON public.follow_up_notification_log
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
