-- 1. Permitir novo kanban_type
ALTER TABLE public.kanban_statuses DROP CONSTRAINT IF EXISTS kanban_statuses_kanban_type_check;
ALTER TABLE public.kanban_statuses ADD CONSTRAINT kanban_statuses_kanban_type_check
  CHECK (kanban_type IN ('general','bulk_leads','general_captacao','bulk_captacao','broker_recruitment'));

-- 2. Tabela broker_candidates
CREATE TABLE public.broker_candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text,
  phone text,
  phone_normalized text,
  city text,
  creci text,
  years_experience integer,
  linkedin_url text,
  resume_url text,
  source text,
  status_id uuid REFERENCES public.kanban_statuses(id) ON DELETE SET NULL,
  general_notes text,
  hired_user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_by_user_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000'::uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.broker_candidates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "broker_candidates admin all" ON public.broker_candidates
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_broker_candidates_updated_at
  BEFORE UPDATE ON public.broker_candidates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_broker_candidates_phone
  BEFORE INSERT OR UPDATE ON public.broker_candidates
  FOR EACH ROW EXECUTE FUNCTION public.set_phone_normalized();

-- 3. Tabela broker_candidate_interactions
CREATE TABLE public.broker_candidate_interactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id uuid NOT NULL REFERENCES public.broker_candidates(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  interaction_type text NOT NULL,
  interaction_result text,
  notes text,
  next_follow_up_date timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.broker_candidate_interactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "broker_candidate_interactions admin all" ON public.broker_candidate_interactions
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_broker_candidate_interactions_candidate
  ON public.broker_candidate_interactions(candidate_id, created_at DESC);

-- 4. Trigger de log de mudança de status
CREATE OR REPLACE FUNCTION public.log_broker_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  new_status_name text;
BEGIN
  IF NEW.status_id IS DISTINCT FROM OLD.status_id THEN
    SELECT name INTO new_status_name FROM public.kanban_statuses WHERE id = NEW.status_id;
    INSERT INTO public.broker_candidate_interactions (candidate_id, user_id, interaction_type, notes)
    VALUES (NEW.id, COALESCE(auth.uid(), NEW.created_by_user_id), 'status_change',
            'Etapa alterada para: ' || COALESCE(new_status_name, 'desconhecida'));
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_broker_candidates_log_status
  AFTER UPDATE ON public.broker_candidates
  FOR EACH ROW EXECUTE FUNCTION public.log_broker_status_change();

-- 5. Seed das etapas
INSERT INTO public.kanban_statuses (name, color, position, kanban_type) VALUES
  ('Primeiro contato',    '#64748b', 1, 'broker_recruitment'),
  ('Entrevista marcada',  '#3b82f6', 2, 'broker_recruitment'),
  ('Entrevista realizada','#8b5cf6', 3, 'broker_recruitment'),
  ('Contratado',          '#10b981', 4, 'broker_recruitment'),
  ('Reprovado',           '#ef4444', 5, 'broker_recruitment');
