
-- 0) Update kanban_statuses kanban_type check to include new types
ALTER TABLE public.kanban_statuses
  DROP CONSTRAINT IF EXISTS kanban_statuses_kanban_type_check;
ALTER TABLE public.kanban_statuses
  ADD CONSTRAINT kanban_statuses_kanban_type_check
  CHECK (kanban_type IN ('general','bulk_leads','general_captacao','bulk_captacao'));

-- 1) default_interest_type on lead_import_batches
ALTER TABLE public.lead_import_batches
  ADD COLUMN IF NOT EXISTS default_interest_type text NOT NULL DEFAULT 'comprar';
ALTER TABLE public.lead_import_batches
  DROP CONSTRAINT IF EXISTS lead_import_batches_default_interest_type_chk;
ALTER TABLE public.lead_import_batches
  ADD CONSTRAINT lead_import_batches_default_interest_type_chk
  CHECK (default_interest_type IN ('comprar','captar'));

-- 2) Seed statuses
INSERT INTO public.kanban_statuses (name, color, position, kanban_type)
SELECT v.name, v.color, v.position, 'general_captacao'
FROM (VALUES
  ('Novo contato', '#64748b', 1),
  ('Avaliação agendada', '#0ea5e9', 2),
  ('Avaliação feita', '#6366f1', 3),
  ('Proposta de exclusividade', '#f59e0b', 4),
  ('Contrato de captação assinado', '#10b981', 5),
  ('Imóvel publicado', '#22c55e', 6),
  ('Perdido', '#ef4444', 7)
) AS v(name, color, position)
WHERE NOT EXISTS (
  SELECT 1 FROM public.kanban_statuses
  WHERE kanban_type = 'general_captacao' AND name = v.name
);

INSERT INTO public.kanban_statuses (name, color, position, kanban_type)
SELECT v.name, v.color, v.position, 'bulk_captacao'
FROM (VALUES
  ('Novo contato em massa', '#64748b', 1),
  ('Mandou WhatsApp', '#0ea5e9', 2),
  ('Aguardando resposta', '#94a3b8', 3),
  ('Respondeu', '#6366f1', 4),
  ('Avaliação agendada', '#f59e0b', 5),
  ('Captado', '#10b981', 6),
  ('Não atendeu', '#fbbf24', 7),
  ('Sem interesse', '#ef4444', 8),
  ('Número inválido', '#dc2626', 9)
) AS v(name, color, position)
WHERE NOT EXISTS (
  SELECT 1 FROM public.kanban_statuses
  WHERE kanban_type = 'bulk_captacao' AND name = v.name
);

-- 3) Update enforce trigger
CREATE OR REPLACE FUNCTION public.enforce_lead_status_kanban_type()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  st_type text;
  is_bulk boolean;
  is_captacao boolean;
  expected text;
BEGIN
  IF NEW.status_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT kanban_type INTO st_type
  FROM public.kanban_statuses
  WHERE id = NEW.status_id;

  IF st_type IS NULL THEN
    RETURN NEW;
  END IF;

  is_bulk := NEW.import_batch_id IS NOT NULL;
  is_captacao := NEW.interest_type = 'captar';

  expected := CASE
    WHEN is_bulk AND is_captacao THEN 'bulk_captacao'
    WHEN is_bulk AND NOT is_captacao THEN 'bulk_leads'
    WHEN NOT is_bulk AND is_captacao THEN 'general_captacao'
    ELSE 'general'
  END;

  IF st_type <> expected THEN
    RAISE EXCEPTION 'Status (%) não corresponde ao tipo esperado para este lead (%)', st_type, expected;
  END IF;

  RETURN NEW;
END;
$function$;
