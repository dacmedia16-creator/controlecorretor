
CREATE POLICY "broker_interactions owner update"
ON public.broker_candidate_interactions
FOR UPDATE TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

CREATE POLICY "broker_interactions gerente update"
ON public.broker_candidate_interactions
FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'gerente_recrutamento'::public.app_role))
WITH CHECK (public.has_role(auth.uid(), 'gerente_recrutamento'::public.app_role));

CREATE POLICY "interactions owner update"
ON public.lead_interactions
FOR UPDATE TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());
