-- 1) Add assigned_to_user_id
ALTER TABLE public.broker_candidates
  ADD COLUMN IF NOT EXISTS assigned_to_user_id uuid REFERENCES public.profiles(id);

CREATE INDEX IF NOT EXISTS idx_broker_candidates_assigned_to
  ON public.broker_candidates(assigned_to_user_id);

-- 2) Replace RLS on broker_candidates
DROP POLICY IF EXISTS "broker_candidates admin or recruiter" ON public.broker_candidates;

CREATE POLICY "broker_candidates admin all"
  ON public.broker_candidates
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "broker_candidates recruiter select own"
  ON public.broker_candidates
  FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'recrutador'::public.app_role)
    AND (assigned_to_user_id = auth.uid() OR created_by_user_id = auth.uid())
  );

CREATE POLICY "broker_candidates recruiter insert"
  ON public.broker_candidates
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'recrutador'::public.app_role)
    AND created_by_user_id = auth.uid()
  );

CREATE POLICY "broker_candidates recruiter update own"
  ON public.broker_candidates
  FOR UPDATE
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'recrutador'::public.app_role)
    AND (assigned_to_user_id = auth.uid() OR created_by_user_id = auth.uid())
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'recrutador'::public.app_role)
    AND (assigned_to_user_id = auth.uid() OR created_by_user_id = auth.uid())
  );

-- 3) Guard: only admins may change assigned_to_user_id / created_by_user_id
CREATE OR REPLACE FUNCTION public.guard_broker_admin_fields()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
AS $$
BEGIN
  IF public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RETURN NEW;
  END IF;
  IF NEW.assigned_to_user_id IS DISTINCT FROM OLD.assigned_to_user_id THEN
    RAISE EXCEPTION 'Apenas administradores podem alterar o recrutador responsável';
  END IF;
  IF NEW.created_by_user_id IS DISTINCT FROM OLD.created_by_user_id THEN
    RAISE EXCEPTION 'created_by_user_id é imutável';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_broker_admin_fields_trg ON public.broker_candidates;
CREATE TRIGGER guard_broker_admin_fields_trg
  BEFORE UPDATE ON public.broker_candidates
  FOR EACH ROW EXECUTE FUNCTION public.guard_broker_admin_fields();

-- 4) Replace RLS on broker_candidate_interactions to follow parent visibility
DROP POLICY IF EXISTS "broker_candidate_interactions admin or recruiter" ON public.broker_candidate_interactions;

CREATE POLICY "broker_interactions admin all"
  ON public.broker_candidate_interactions
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "broker_interactions recruiter select"
  ON public.broker_candidate_interactions
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.broker_candidates c
      WHERE c.id = candidate_id
        AND (c.assigned_to_user_id = auth.uid() OR c.created_by_user_id = auth.uid())
    )
  );

CREATE POLICY "broker_interactions recruiter insert"
  ON public.broker_candidate_interactions
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.broker_candidates c
      WHERE c.id = candidate_id
        AND (c.assigned_to_user_id = auth.uid() OR c.created_by_user_id = auth.uid())
    )
  );
