CREATE POLICY "broker_interactions owner delete"
ON public.broker_candidate_interactions
FOR DELETE
TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "broker_interactions gerente delete"
ON public.broker_candidate_interactions
FOR DELETE
TO authenticated
USING (has_role(auth.uid(), 'gerente_recrutamento'::app_role));

CREATE POLICY "interactions owner delete"
ON public.lead_interactions
FOR DELETE
TO authenticated
USING (user_id = auth.uid());