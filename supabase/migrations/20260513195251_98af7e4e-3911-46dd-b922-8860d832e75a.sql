-- Per-broker lead counts (admin only)
CREATE OR REPLACE FUNCTION public.get_broker_lead_counts()
RETURNS TABLE(user_id uuid, count bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'access denied';
  END IF;
  RETURN QUERY
    SELECT l.assigned_to_user_id, COUNT(*)::bigint
    FROM public.leads l
    WHERE l.assigned_to_user_id IS NOT NULL
    GROUP BY l.assigned_to_user_id;
END;
$$;

-- Count unassigned leads in a batch (admin only)
CREATE OR REPLACE FUNCTION public.get_batch_unassigned_count(_batch_id uuid)
RETURNS bigint
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE c bigint;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'access denied';
  END IF;
  SELECT COUNT(*) INTO c FROM public.leads
    WHERE import_batch_id = _batch_id AND assigned_to_user_id IS NULL;
  RETURN c;
END;
$$;

-- Return unassigned lead IDs in a batch, ordered (admin only)
CREATE OR REPLACE FUNCTION public.get_batch_unassigned_ids(_batch_id uuid, _limit integer)
RETURNS TABLE(id uuid)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'access denied';
  END IF;
  RETURN QUERY
    SELECT l.id FROM public.leads l
    WHERE l.import_batch_id = _batch_id AND l.assigned_to_user_id IS NULL
    ORDER BY l.created_at
    LIMIT _limit;
END;
$$;

-- Trigger: prevent non-admins from changing assigned_to_user_id or import_batch_id
CREATE OR REPLACE FUNCTION public.guard_lead_admin_fields()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF public.has_role(auth.uid(), 'admin') THEN
    RETURN NEW;
  END IF;
  IF NEW.assigned_to_user_id IS DISTINCT FROM OLD.assigned_to_user_id THEN
    RAISE EXCEPTION 'Only admins can change the assigned broker';
  END IF;
  IF NEW.import_batch_id IS DISTINCT FROM OLD.import_batch_id THEN
    RAISE EXCEPTION 'Only admins can change the import batch';
  END IF;
  IF NEW.created_by_user_id IS DISTINCT FROM OLD.created_by_user_id THEN
    RAISE EXCEPTION 'created_by_user_id is immutable';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_lead_admin_fields_trg ON public.leads;
CREATE TRIGGER guard_lead_admin_fields_trg
  BEFORE UPDATE ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.guard_lead_admin_fields();