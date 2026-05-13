-- Garante que o status_id do lead pertence ao Kanban correto:
-- leads com import_batch_id => bulk_leads
-- leads sem import_batch_id => general
CREATE OR REPLACE FUNCTION public.enforce_lead_status_kanban_type()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  st_type text;
  is_bulk boolean;
BEGIN
  IF NEW.status_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT kanban_type INTO st_type
  FROM public.kanban_statuses
  WHERE id = NEW.status_id;

  IF st_type IS NULL THEN
    RETURN NEW;
  END IF;

  is_bulk := NEW.import_batch_id IS NOT NULL;

  IF is_bulk AND st_type <> 'bulk_leads' THEN
    RAISE EXCEPTION 'Leads importados em massa só podem usar status do Kanban Leads em Massa';
  END IF;

  IF NOT is_bulk AND st_type <> 'general' THEN
    RAISE EXCEPTION 'Leads manuais só podem usar status do Kanban geral';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_lead_status_kanban_type ON public.leads;
CREATE TRIGGER enforce_lead_status_kanban_type
BEFORE INSERT OR UPDATE OF status_id, import_batch_id ON public.leads
FOR EACH ROW EXECUTE FUNCTION public.enforce_lead_status_kanban_type();