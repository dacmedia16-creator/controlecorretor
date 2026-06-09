CREATE POLICY "broker_interactions recruiter update"
ON public.broker_candidate_interactions
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.broker_candidates c
    WHERE c.id = broker_candidate_interactions.candidate_id
      AND (c.assigned_to_user_id = auth.uid() OR c.created_by_user_id = auth.uid())
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.broker_candidates c
    WHERE c.id = broker_candidate_interactions.candidate_id
      AND (c.assigned_to_user_id = auth.uid() OR c.created_by_user_id = auth.uid())
  )
);

CREATE POLICY "interactions broker update"
ON public.lead_interactions
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.leads l
    WHERE l.id = lead_interactions.lead_id
      AND (l.assigned_to_user_id = auth.uid() OR l.created_by_user_id = auth.uid())
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.leads l
    WHERE l.id = lead_interactions.lead_id
      AND (l.assigned_to_user_id = auth.uid() OR l.created_by_user_id = auth.uid())
  )
);