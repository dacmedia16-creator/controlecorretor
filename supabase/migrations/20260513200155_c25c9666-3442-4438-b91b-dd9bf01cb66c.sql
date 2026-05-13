
-- Add kanban_type to differentiate general kanban vs bulk leads kanban
ALTER TABLE public.kanban_statuses
  ADD COLUMN IF NOT EXISTS kanban_type text NOT NULL DEFAULT 'general';

ALTER TABLE public.kanban_statuses
  DROP CONSTRAINT IF EXISTS kanban_statuses_kanban_type_check;
ALTER TABLE public.kanban_statuses
  ADD CONSTRAINT kanban_statuses_kanban_type_check
  CHECK (kanban_type IN ('general', 'bulk_leads'));

-- Mark existing rows as general (default already, but safe)
UPDATE public.kanban_statuses SET kanban_type = 'general' WHERE kanban_type IS NULL OR kanban_type = '';

CREATE INDEX IF NOT EXISTS idx_kanban_statuses_type_position
  ON public.kanban_statuses (kanban_type, position);

-- Seed bulk_leads statuses (only if none exist yet for this type)
DO $$
DECLARE
  has_bulk integer;
BEGIN
  SELECT COUNT(*) INTO has_bulk FROM public.kanban_statuses WHERE kanban_type = 'bulk_leads';
  IF has_bulk = 0 THEN
    INSERT INTO public.kanban_statuses (name, color, position, active, kanban_type) VALUES
      ('Novo contato em massa',     '#64748b', 1,  true, 'bulk_leads'),
      ('Distribuído para corretor', '#0ea5e9', 2,  true, 'bulk_leads'),
      ('Primeira tentativa',        '#6366f1', 3,  true, 'bulk_leads'),
      ('Não atendeu',               '#f59e0b', 4,  true, 'bulk_leads'),
      ('Mandou WhatsApp',           '#22c55e', 5,  true, 'bulk_leads'),
      ('Aguardando resposta',       '#eab308', 6,  true, 'bulk_leads'),
      ('Respondeu',                 '#06b6d4', 7,  true, 'bulk_leads'),
      ('Interessado',               '#10b981', 8,  true, 'bulk_leads'),
      ('Agendar retorno',           '#3b82f6', 9,  true, 'bulk_leads'),
      ('Possível captação',         '#8b5cf6', 10, true, 'bulk_leads'),
      ('Imóvel captado',            '#16a34a', 11, true, 'bulk_leads'),
      ('Sem interesse',             '#ef4444', 12, true, 'bulk_leads'),
      ('Número inválido',           '#dc2626', 13, true, 'bulk_leads'),
      ('Descartado',                '#9ca3af', 14, true, 'bulk_leads');
  END IF;
END $$;
