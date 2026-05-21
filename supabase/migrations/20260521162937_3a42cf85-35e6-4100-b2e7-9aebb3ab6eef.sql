
CREATE TABLE public.recruiter_notifications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  candidate_id UUID NOT NULL REFERENCES public.broker_candidates(id) ON DELETE CASCADE,
  type TEXT NOT NULL DEFAULT 'assigned',
  message TEXT NOT NULL,
  read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_recruiter_notifications_user_unread
  ON public.recruiter_notifications(user_id, read, created_at DESC);

ALTER TABLE public.recruiter_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "recruiter_notifications admin all"
  ON public.recruiter_notifications FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "recruiter_notifications select own"
  ON public.recruiter_notifications FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "recruiter_notifications update own"
  ON public.recruiter_notifications FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.notify_recruiter_assignment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  should_notify boolean := false;
BEGIN
  IF TG_OP = 'INSERT' THEN
    should_notify := NEW.assigned_to_user_id IS NOT NULL;
  ELSIF TG_OP = 'UPDATE' THEN
    should_notify := NEW.assigned_to_user_id IS NOT NULL
                  AND NEW.assigned_to_user_id IS DISTINCT FROM OLD.assigned_to_user_id;
  END IF;

  IF should_notify THEN
    INSERT INTO public.recruiter_notifications (user_id, candidate_id, type, message)
    VALUES (
      NEW.assigned_to_user_id,
      NEW.id,
      'assigned',
      'Novo candidato atribuído: ' || COALESCE(NEW.name, 'sem nome')
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_recruiter_assignment ON public.broker_candidates;
CREATE TRIGGER trg_notify_recruiter_assignment
AFTER INSERT OR UPDATE OF assigned_to_user_id ON public.broker_candidates
FOR EACH ROW EXECUTE FUNCTION public.notify_recruiter_assignment();

ALTER PUBLICATION supabase_realtime ADD TABLE public.recruiter_notifications;
ALTER TABLE public.recruiter_notifications REPLICA IDENTITY FULL;
