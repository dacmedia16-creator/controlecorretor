
CREATE TABLE public.user_google_calendar_connections (
  user_id uuid NOT NULL PRIMARY KEY,
  google_email text NOT NULL,
  access_token text NOT NULL,
  refresh_token text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, DELETE ON public.user_google_calendar_connections TO authenticated;
GRANT ALL ON public.user_google_calendar_connections TO service_role;

ALTER TABLE public.user_google_calendar_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users read own gcal connection"
  ON public.user_google_calendar_connections FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "users delete own gcal connection"
  ON public.user_google_calendar_connections FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

CREATE TRIGGER set_user_google_calendar_connections_updated_at
  BEFORE UPDATE ON public.user_google_calendar_connections
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
