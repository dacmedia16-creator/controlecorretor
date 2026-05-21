-- Helper: admin OR recrutador
CREATE OR REPLACE FUNCTION public.is_admin_or_recruiter(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(_user_id, 'admin'::app_role)
      OR public.has_role(_user_id, 'recrutador'::app_role)
$$;

-- broker_candidates: replace admin-only policy
DROP POLICY IF EXISTS "broker_candidates admin all" ON public.broker_candidates;
CREATE POLICY "broker_candidates admin or recruiter"
  ON public.broker_candidates
  FOR ALL
  TO authenticated
  USING (public.is_admin_or_recruiter(auth.uid()))
  WITH CHECK (public.is_admin_or_recruiter(auth.uid()));

-- broker_candidate_interactions
DROP POLICY IF EXISTS "broker_candidate_interactions admin all" ON public.broker_candidate_interactions;
CREATE POLICY "broker_candidate_interactions admin or recruiter"
  ON public.broker_candidate_interactions
  FOR ALL
  TO authenticated
  USING (public.is_admin_or_recruiter(auth.uid()))
  WITH CHECK (public.is_admin_or_recruiter(auth.uid()));

-- kanban_statuses: recrutador only manages broker_recruitment rows
CREATE POLICY "recruiter manages broker_recruitment statuses"
  ON public.kanban_statuses
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'recrutador'::app_role) AND kanban_type = 'broker_recruitment')
  WITH CHECK (public.has_role(auth.uid(), 'recrutador'::app_role) AND kanban_type = 'broker_recruitment');

-- handle_new_user: respect role from raw_user_meta_data
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_count INTEGER;
  requested_role text;
  final_role public.app_role;
BEGIN
  INSERT INTO public.profiles (id, name, email, phone)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    NEW.email,
    NEW.raw_user_meta_data->>'phone'
  );

  SELECT COUNT(*) INTO user_count FROM public.user_roles;
  requested_role := NEW.raw_user_meta_data->>'role';

  IF user_count = 0 THEN
    final_role := 'admin'::public.app_role;
  ELSIF requested_role IN ('admin','corretor','recrutador') THEN
    final_role := requested_role::public.app_role;
  ELSE
    final_role := 'corretor'::public.app_role;
  END IF;

  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, final_role);

  RETURN NEW;
END;
$$;
