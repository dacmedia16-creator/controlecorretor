ALTER TABLE public.user_google_calendar_connections
ADD COLUMN IF NOT EXISTS calendar_ids text[] NOT NULL DEFAULT ARRAY['primary']::text[];