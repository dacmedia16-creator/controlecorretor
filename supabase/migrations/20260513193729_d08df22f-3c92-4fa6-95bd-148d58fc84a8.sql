
-- Function to normalize phone numbers (digits only, strip leading 55 if 12-13 digits)
CREATE OR REPLACE FUNCTION public.normalize_phone(_phone text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  digits text;
BEGIN
  IF _phone IS NULL THEN RETURN NULL; END IF;
  digits := regexp_replace(_phone, '[^0-9]', '', 'g');
  IF length(digits) IN (12, 13) AND left(digits, 2) = '55' THEN
    digits := substring(digits from 3);
  END IF;
  IF length(digits) = 0 THEN RETURN NULL; END IF;
  RETURN digits;
END;
$$;

-- Add columns to leads
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS phone_normalized text,
  ADD COLUMN IF NOT EXISTS import_batch_id uuid;

-- Backfill existing
UPDATE public.leads SET phone_normalized = public.normalize_phone(phone) WHERE phone IS NOT NULL AND phone_normalized IS NULL;

-- Trigger to keep phone_normalized in sync
CREATE OR REPLACE FUNCTION public.set_phone_normalized()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  NEW.phone_normalized := public.normalize_phone(NEW.phone);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS leads_set_phone_normalized ON public.leads;
CREATE TRIGGER leads_set_phone_normalized
BEFORE INSERT OR UPDATE OF phone ON public.leads
FOR EACH ROW EXECUTE FUNCTION public.set_phone_normalized();

CREATE INDEX IF NOT EXISTS idx_leads_phone_normalized ON public.leads(phone_normalized);
CREATE INDEX IF NOT EXISTS idx_leads_import_batch_id ON public.leads(import_batch_id);

-- Batches table
CREATE TABLE IF NOT EXISTS public.lead_import_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  total_rows integer NOT NULL DEFAULT 0,
  valid_count integer NOT NULL DEFAULT 0,
  invalid_count integer NOT NULL DEFAULT 0,
  duplicate_count integer NOT NULL DEFAULT 0,
  imported_count integer NOT NULL DEFAULT 0,
  created_by_user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.leads
  DROP CONSTRAINT IF EXISTS leads_import_batch_id_fkey,
  ADD CONSTRAINT leads_import_batch_id_fkey FOREIGN KEY (import_batch_id)
    REFERENCES public.lead_import_batches(id) ON DELETE SET NULL;

ALTER TABLE public.lead_import_batches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "batches admin all" ON public.lead_import_batches
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "batches broker select assigned" ON public.lead_import_batches
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.leads l
    WHERE l.import_batch_id = lead_import_batches.id
      AND l.assigned_to_user_id = auth.uid()
  ));
