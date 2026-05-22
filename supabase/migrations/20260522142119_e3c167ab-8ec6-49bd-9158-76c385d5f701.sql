
CREATE TABLE IF NOT EXISTS public.follow_up_dismissals (
  user_id uuid NOT NULL,
  interaction_id uuid NOT NULL,
  source text NOT NULL CHECK (source IN ('lead','candidate')),
  dismissed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, interaction_id, source)
);

ALTER TABLE public.follow_up_dismissals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dismissals select own" ON public.follow_up_dismissals
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "dismissals insert own" ON public.follow_up_dismissals
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "dismissals delete own" ON public.follow_up_dismissals
  FOR DELETE TO authenticated USING (user_id = auth.uid());
CREATE POLICY "dismissals admin all" ON public.follow_up_dismissals
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE OR REPLACE FUNCTION public.notify_lead_followup()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  IF EXISTS (
    SELECT 1 FROM public.follow_up_dismissals d
    WHERE d.user_id = target_user AND d.interaction_id = NEW.id AND d.source = 'lead'
  ) THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.follow_up_notification_log(interaction_id, source, notified_on)
    VALUES (NEW.id, 'lead', CURRENT_DATE)
    ON CONFLICT DO NOTHING;

  IF FOUND THEN
    INSERT INTO public.recruiter_notifications(user_id, lead_id, type, message)
    VALUES (target_user, NEW.lead_id, 'follow_up_due',
            'Follow-up hoje: ' || COALESCE(lead_name, 'lead'));
  END IF;
  RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION public.notify_candidate_followup()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  IF EXISTS (
    SELECT 1 FROM public.follow_up_dismissals d
    WHERE d.user_id = target_user AND d.interaction_id = NEW.id AND d.source = 'candidate'
  ) THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.follow_up_notification_log(interaction_id, source, notified_on)
    VALUES (NEW.id, 'candidate', CURRENT_DATE)
    ON CONFLICT DO NOTHING;

  IF FOUND THEN
    INSERT INTO public.recruiter_notifications(user_id, candidate_id, type, message)
    VALUES (target_user, NEW.candidate_id, 'follow_up_due',
            'Follow-up hoje: ' || COALESCE(cand_name, 'candidato'));
  END IF;
  RETURN NEW;
END $function$;
