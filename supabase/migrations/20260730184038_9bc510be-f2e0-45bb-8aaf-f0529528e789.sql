CREATE TABLE public.google_calendar_sync_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  connection_id uuid,
  calendar_id text,
  google_email text,
  operation text NOT NULL,
  ok boolean NOT NULL,
  http_status integer,
  error text,
  interaction_id uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX idx_gcal_sync_log_user_created ON public.google_calendar_sync_log (user_id, created_at DESC);

GRANT SELECT ON public.google_calendar_sync_log TO authenticated;
GRANT ALL ON public.google_calendar_sync_log TO service_role;

ALTER TABLE public.google_calendar_sync_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own sync log"
ON public.google_calendar_sync_log FOR SELECT TO authenticated
USING (
  user_id = auth.uid()
  OR public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'gerente_recrutamento'::public.app_role)
);