ALTER TABLE public.user_google_calendar_connections
  ADD COLUMN IF NOT EXISTS id uuid NOT NULL DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS sync_out boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS sync_in boolean NOT NULL DEFAULT true;

ALTER TABLE public.user_google_calendar_connections
  DROP CONSTRAINT IF EXISTS user_google_calendar_connections_pkey;

ALTER TABLE public.user_google_calendar_connections
  ADD CONSTRAINT user_google_calendar_connections_pkey PRIMARY KEY (id);

ALTER TABLE public.user_google_calendar_connections
  ADD CONSTRAINT user_google_calendar_connections_user_email_key UNIQUE (user_id, google_email);

CREATE TABLE public.google_calendar_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  interaction_id uuid NOT NULL,
  connection_id uuid NOT NULL REFERENCES public.user_google_calendar_connections(id) ON DELETE CASCADE,
  calendar_id text NOT NULL,
  google_event_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (interaction_id, connection_id, calendar_id)
);

CREATE INDEX idx_gcal_events_interaction ON public.google_calendar_events(interaction_id);

GRANT ALL ON public.google_calendar_events TO service_role;
ALTER TABLE public.google_calendar_events ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.set_updated_at_timestamp()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER update_google_calendar_events_updated_at
BEFORE UPDATE ON public.google_calendar_events
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_timestamp();