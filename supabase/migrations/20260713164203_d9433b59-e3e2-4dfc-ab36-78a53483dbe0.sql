CREATE POLICY "broker_candidates gerente insert" ON public.broker_candidates
FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'gerente_recrutamento'::public.app_role));