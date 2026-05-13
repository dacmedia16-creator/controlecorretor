CREATE TABLE public.lead_distributions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid,
  admin_id uuid NOT NULL,
  total_distributed integer NOT NULL DEFAULT 0,
  details jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.lead_distributions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "distributions admin all" ON public.lead_distributions
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_lead_distributions_batch ON public.lead_distributions(batch_id);
CREATE INDEX idx_lead_distributions_created_at ON public.lead_distributions(created_at DESC);