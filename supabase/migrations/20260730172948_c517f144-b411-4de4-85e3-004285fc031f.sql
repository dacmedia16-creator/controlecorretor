ALTER TABLE public.user_google_calendar_connections
  ADD COLUMN IF NOT EXISTS auth_type text NOT NULL DEFAULT 'oauth',
  ADD COLUMN IF NOT EXISTS service_account_email text,
  ADD COLUMN IF NOT EXISTS display_name text;

ALTER TABLE public.user_google_calendar_connections
  ALTER COLUMN access_token DROP NOT NULL,
  ALTER COLUMN refresh_token DROP NOT NULL,
  ALTER COLUMN expires_at DROP NOT NULL;

ALTER TABLE public.user_google_calendar_connections
  DROP CONSTRAINT IF EXISTS user_google_calendar_connections_auth_type_check;

ALTER TABLE public.user_google_calendar_connections
  ADD CONSTRAINT user_google_calendar_connections_auth_type_check
  CHECK (auth_type IN ('oauth', 'service_account'));