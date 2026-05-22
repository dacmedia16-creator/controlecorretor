
-- 2) Allow gerente_recrutamento in handle_new_user trigger
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  ELSIF requested_role IN ('admin','corretor','recrutador','gerente_recrutamento') THEN
    final_role := requested_role::public.app_role;
  ELSE
    final_role := 'corretor'::public.app_role;
  END IF;

  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, final_role);

  RETURN NEW;
END;
$function$;

-- 3) RLS: broker_candidates — gerente vê e atualiza tudo
CREATE POLICY "broker_candidates gerente select all"
  ON public.broker_candidates FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'gerente_recrutamento'::public.app_role));

CREATE POLICY "broker_candidates gerente update all"
  ON public.broker_candidates FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'gerente_recrutamento'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'gerente_recrutamento'::public.app_role));

-- 4) RLS: broker_candidate_interactions — gerente vê todas e pode registrar
CREATE POLICY "broker_interactions gerente select all"
  ON public.broker_candidate_interactions FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'gerente_recrutamento'::public.app_role));

CREATE POLICY "broker_interactions gerente insert"
  ON public.broker_candidate_interactions FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'gerente_recrutamento'::public.app_role)
    AND user_id = auth.uid()
  );

-- 5) Recruiter notifications: gerente vê todas (para acompanhar a operação)
CREATE POLICY "recruiter_notifications gerente select all"
  ON public.recruiter_notifications FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'gerente_recrutamento'::public.app_role));
