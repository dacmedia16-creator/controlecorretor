
-- ============ ENUMS ============
CREATE TYPE public.app_role AS ENUM ('admin', 'corretor');

-- ============ ROLES ============
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE POLICY "users read own roles" ON public.user_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admins manage roles" ON public.user_roles FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ============ PROFILES ============
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL,
  phone TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profiles read all authenticated" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "profiles update self" ON public.profiles FOR UPDATE TO authenticated
  USING (id = auth.uid()) WITH CHECK (id = auth.uid());
CREATE POLICY "admins manage profiles" ON public.profiles FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ============ KANBAN STATUSES ============
CREATE TABLE public.kanban_statuses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  position INTEGER NOT NULL,
  color TEXT NOT NULL DEFAULT '#64748b',
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.kanban_statuses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "statuses read all authenticated" ON public.kanban_statuses FOR SELECT TO authenticated USING (true);
CREATE POLICY "admins manage statuses" ON public.kanban_statuses FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

INSERT INTO public.kanban_statuses (name, position, color) VALUES
  ('Novo lead', 1, '#3b82f6'),
  ('Distribuído', 2, '#8b5cf6'),
  ('Tentativa de contato', 3, '#f59e0b'),
  ('Conversei com o lead', 4, '#06b6d4'),
  ('Retorno agendado', 5, '#0ea5e9'),
  ('Lead interessado', 6, '#10b981'),
  ('Imóvel captado', 7, '#22c55e'),
  ('Não atendeu', 8, '#f97316'),
  ('Sem interesse', 9, '#94a3b8'),
  ('Descartado', 10, '#ef4444');

-- ============ LEADS ============
CREATE TABLE public.leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  city TEXT,
  neighborhood TEXT,
  property_type TEXT,
  interest_type TEXT,
  source TEXT,
  assigned_to_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  status_id UUID REFERENCES public.kanban_statuses(id) ON DELETE SET NULL,
  general_notes TEXT,
  created_by_user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE SET DEFAULT DEFAULT '00000000-0000-0000-0000-000000000000',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "leads admin all" ON public.leads FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "leads broker select own" ON public.leads FOR SELECT TO authenticated
  USING (assigned_to_user_id = auth.uid() OR created_by_user_id = auth.uid());
CREATE POLICY "leads broker insert" ON public.leads FOR INSERT TO authenticated
  WITH CHECK (created_by_user_id = auth.uid());
CREATE POLICY "leads broker update own" ON public.leads FOR UPDATE TO authenticated
  USING (assigned_to_user_id = auth.uid() OR created_by_user_id = auth.uid())
  WITH CHECK (assigned_to_user_id = auth.uid() OR created_by_user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;
CREATE TRIGGER trg_leads_updated BEFORE UPDATE ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ LEAD INTERACTIONS ============
CREATE TABLE public.lead_interactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  interaction_type TEXT NOT NULL,
  interaction_result TEXT,
  notes TEXT,
  next_follow_up_date TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.lead_interactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "interactions admin all" ON public.lead_interactions FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "interactions broker select" ON public.lead_interactions FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.leads l
    WHERE l.id = lead_id
      AND (l.assigned_to_user_id = auth.uid() OR l.created_by_user_id = auth.uid())
  ));
CREATE POLICY "interactions broker insert" ON public.lead_interactions FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid() AND EXISTS (
      SELECT 1 FROM public.leads l
      WHERE l.id = lead_id
        AND (l.assigned_to_user_id = auth.uid() OR l.created_by_user_id = auth.uid())
    )
  );

-- ============ AUTO-CREATE PROFILE + FIRST USER = ADMIN ============
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  user_count INTEGER;
BEGIN
  INSERT INTO public.profiles (id, name, email, phone)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    NEW.email,
    NEW.raw_user_meta_data->>'phone'
  );

  SELECT COUNT(*) INTO user_count FROM public.user_roles;
  IF user_count = 0 THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin');
  ELSE
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'corretor');
  END IF;

  RETURN NEW;
END;
$$;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============ AUTO-LOG STATUS CHANGE ============
CREATE OR REPLACE FUNCTION public.log_status_change()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  new_status_name TEXT;
BEGIN
  IF NEW.status_id IS DISTINCT FROM OLD.status_id THEN
    SELECT name INTO new_status_name FROM public.kanban_statuses WHERE id = NEW.status_id;
    INSERT INTO public.lead_interactions (lead_id, user_id, interaction_type, interaction_result, notes)
    VALUES (NEW.id, COALESCE(auth.uid(), NEW.assigned_to_user_id, NEW.created_by_user_id), 'status_change', NULL,
            'Status alterado para: ' || COALESCE(new_status_name, 'desconhecido'));
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_leads_status_change AFTER UPDATE ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.log_status_change();
