-- =====================================================================
-- FR Financeiro — migração inicial (estrutura apenas, sem seeds)
-- =====================================================================

CREATE SCHEMA IF NOT EXISTS app;
REVOKE ALL ON SCHEMA app FROM PUBLIC;
GRANT USAGE ON SCHEMA app TO authenticated, service_role;

-- ---------- enums ----------
CREATE TYPE public.employee_status AS ENUM ('ativo', 'inativo');
CREATE TYPE public.client_status AS ENUM ('ativo', 'inativo');
CREATE TYPE public.loan_frequency AS ENUM ('diario', 'semanal', 'quinzenal', 'mensal');
CREATE TYPE public.loan_status AS ENUM ('rascunho', 'aguardando_aprovacao', 'ativo', 'quitado', 'renegociado', 'prejuizo', 'cancelado');
CREATE TYPE public.installment_status AS ENUM ('pendente', 'parcial', 'pago', 'atrasado', 'renegociado', 'prejuizo');
CREATE TYPE public.payment_kind AS ENUM ('integral', 'parcial');
CREATE TYPE public.payment_method AS ENUM ('dinheiro', 'pix', 'transferencia', 'outro');
CREATE TYPE public.payment_status AS ENUM ('confirmado', 'estornado');
CREATE TYPE public.employee_profit_kind AS ENUM ('percentual', 'fixo');
CREATE TYPE public.penalty_kind AS ENUM ('nenhuma', 'percentual_dia', 'percentual_fixo', 'valor_fixo');

-- ---------- timestamps ----------
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ---------- proteção contra DELETE financeiro ----------
CREATE OR REPLACE FUNCTION public.forbid_delete()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'Registros financeiros não podem ser apagados. Use estorno/contralançamento.';
END;
$$;

-- =====================================================================
-- owner_access
-- =====================================================================
CREATE TABLE public.owner_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users (id) ON DELETE CASCADE,
  is_active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX owner_access_active_idx ON public.owner_access (user_id) WHERE is_active;

GRANT SELECT ON public.owner_access TO authenticated;
GRANT ALL ON public.owner_access TO service_role;
ALTER TABLE public.owner_access ENABLE ROW LEVEL SECURITY;

CREATE POLICY owner_access_select_self ON public.owner_access
  FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL AND user_id = auth.uid());

CREATE TRIGGER owner_access_set_updated_at
  BEFORE UPDATE ON public.owner_access
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------- verificação de proprietário ativo (fora de public) ----------
CREATE OR REPLACE FUNCTION app.is_active_owner()
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT auth.uid() IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM public.owner_access oa
       WHERE oa.user_id = auth.uid() AND oa.is_active
     );
$$;
REVOKE ALL ON FUNCTION app.is_active_owner() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.is_active_owner() TO authenticated, service_role;

-- =====================================================================
-- employees
-- =====================================================================
CREATE TABLE public.employees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name text NOT NULL CHECK (length(btrim(full_name)) > 0),
  cpf text,
  phone text NOT NULL,
  whatsapp text NOT NULL,
  pix_key text,
  status public.employee_status NOT NULL DEFAULT 'ativo',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX employees_cpf_key ON public.employees (cpf) WHERE cpf IS NOT NULL;
CREATE INDEX employees_status_idx ON public.employees (status);

GRANT SELECT, INSERT, UPDATE ON public.employees TO authenticated;
GRANT ALL ON public.employees TO service_role;
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;

CREATE POLICY employees_select ON public.employees FOR SELECT TO authenticated USING (app.is_active_owner());
CREATE POLICY employees_insert ON public.employees FOR INSERT TO authenticated WITH CHECK (app.is_active_owner());
CREATE POLICY employees_update ON public.employees FOR UPDATE TO authenticated USING (app.is_active_owner()) WITH CHECK (app.is_active_owner());

CREATE TRIGGER employees_set_updated_at BEFORE UPDATE ON public.employees
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =====================================================================
-- clients
-- =====================================================================
CREATE TABLE public.clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees (id) ON DELETE RESTRICT,
  full_name text NOT NULL CHECK (length(btrim(full_name)) > 0),
  cpf text,
  phone text NOT NULL,
  whatsapp text,
  address text,
  status public.client_status NOT NULL DEFAULT 'ativo',
  penalty_kind public.penalty_kind NOT NULL DEFAULT 'nenhuma',
  penalty_value numeric(12,4) NOT NULL DEFAULT 0 CHECK (penalty_value >= 0),
  penalty_grace_days integer NOT NULL DEFAULT 0 CHECK (penalty_grace_days >= 0),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, employee_id)
);
CREATE INDEX clients_employee_idx ON public.clients (employee_id);
CREATE INDEX clients_status_idx ON public.clients (status);

GRANT SELECT, INSERT, UPDATE ON public.clients TO authenticated;
GRANT ALL ON public.clients TO service_role;
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;

CREATE POLICY clients_select ON public.clients FOR SELECT TO authenticated USING (app.is_active_owner());
CREATE POLICY clients_insert ON public.clients FOR INSERT TO authenticated WITH CHECK (app.is_active_owner());
CREATE POLICY clients_update ON public.clients FOR UPDATE TO authenticated USING (app.is_active_owner()) WITH CHECK (app.is_active_owner());

CREATE TRIGGER clients_set_updated_at BEFORE UPDATE ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- cliente não pode ser transferido de funcionário
CREATE OR REPLACE FUNCTION public.forbid_client_employee_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.employee_id IS DISTINCT FROM OLD.employee_id THEN
    RAISE EXCEPTION 'Clientes não podem ser transferidos entre funcionários.';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER clients_lock_employee BEFORE UPDATE ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.forbid_client_employee_change();

-- =====================================================================
-- loans
-- =====================================================================
CREATE TABLE public.loans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL,
  employee_id uuid NOT NULL,
  frequency public.loan_frequency NOT NULL,
  principal_amount numeric(14,2) NOT NULL CHECK (principal_amount > 0),
  fr_rate numeric(6,4) NOT NULL CHECK (fr_rate >= 0),
  fr_rate_is_exceptional boolean NOT NULL DEFAULT false,
  fr_profit_amount numeric(14,2) NOT NULL CHECK (fr_profit_amount >= 0),
  employee_profit_kind public.employee_profit_kind NOT NULL,
  employee_profit_input numeric(14,4) NOT NULL CHECK (employee_profit_input >= 0),
  employee_profit_amount numeric(14,2) NOT NULL CHECK (employee_profit_amount >= 0),
  total_amount numeric(14,2) NOT NULL CHECK (total_amount > 0),
  installments_count integer NOT NULL CHECK (installments_count >= 1),
  start_date date NOT NULL,
  status public.loan_status NOT NULL DEFAULT 'rascunho',
  approved_at timestamptz,
  approved_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  loss_capital_amount numeric(14,2) NOT NULL DEFAULT 0 CHECK (loss_capital_amount >= 0),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT loans_total_consistent CHECK (total_amount = principal_amount + fr_profit_amount + employee_profit_amount),
  CONSTRAINT loans_client_employee_fk FOREIGN KEY (client_id, employee_id) REFERENCES public.clients (id, employee_id) ON DELETE RESTRICT,
  CONSTRAINT loans_unique_pair UNIQUE (id, employee_id)
);
CREATE INDEX loans_client_idx ON public.loans (client_id);
CREATE INDEX loans_employee_idx ON public.loans (employee_id);
CREATE INDEX loans_status_idx ON public.loans (status);

GRANT SELECT, INSERT, UPDATE ON public.loans TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.loans TO service_role;
ALTER TABLE public.loans ENABLE ROW LEVEL SECURITY;

CREATE POLICY loans_select ON public.loans FOR SELECT TO authenticated USING (app.is_active_owner());
CREATE POLICY loans_insert ON public.loans FOR INSERT TO authenticated WITH CHECK (app.is_active_owner());
CREATE POLICY loans_update ON public.loans FOR UPDATE TO authenticated USING (app.is_active_owner()) WITH CHECK (app.is_active_owner());
-- nenhuma policy DELETE

CREATE TRIGGER loans_set_updated_at BEFORE UPDATE ON public.loans
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER loans_no_delete BEFORE DELETE ON public.loans
  FOR EACH ROW EXECUTE FUNCTION public.forbid_delete();

-- =====================================================================
-- installments
-- =====================================================================
CREATE TABLE public.installments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_id uuid NOT NULL REFERENCES public.loans (id) ON DELETE RESTRICT,
  number integer NOT NULL CHECK (number >= 1),
  due_date date NOT NULL,
  principal_amount numeric(14,2) NOT NULL CHECK (principal_amount >= 0),
  fr_profit_amount numeric(14,2) NOT NULL CHECK (fr_profit_amount >= 0),
  employee_profit_amount numeric(14,2) NOT NULL CHECK (employee_profit_amount >= 0),
  total_amount numeric(14,2) NOT NULL CHECK (total_amount > 0),
  paid_amount numeric(14,2) NOT NULL DEFAULT 0 CHECK (paid_amount >= 0),
  penalty_amount numeric(14,2) NOT NULL DEFAULT 0 CHECK (penalty_amount >= 0),
  outstanding_amount numeric(14,2) NOT NULL CHECK (outstanding_amount >= 0),
  status public.installment_status NOT NULL DEFAULT 'pendente',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT installments_total_consistent CHECK (total_amount = principal_amount + fr_profit_amount + employee_profit_amount),
  CONSTRAINT installments_paid_within_total CHECK (paid_amount <= total_amount + penalty_amount),
  UNIQUE (loan_id, number)
);
CREATE INDEX installments_due_date_idx ON public.installments (due_date);
CREATE INDEX installments_status_idx ON public.installments (status);
CREATE INDEX installments_loan_idx ON public.installments (loan_id);

GRANT SELECT, INSERT, UPDATE ON public.installments TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.installments TO service_role;
ALTER TABLE public.installments ENABLE ROW LEVEL SECURITY;

CREATE POLICY installments_select ON public.installments FOR SELECT TO authenticated USING (app.is_active_owner());
CREATE POLICY installments_insert ON public.installments FOR INSERT TO authenticated WITH CHECK (app.is_active_owner());
CREATE POLICY installments_update ON public.installments FOR UPDATE TO authenticated USING (app.is_active_owner()) WITH CHECK (app.is_active_owner());

CREATE TRIGGER installments_set_updated_at BEFORE UPDATE ON public.installments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER installments_no_delete BEFORE DELETE ON public.installments
  FOR EACH ROW EXECUTE FUNCTION public.forbid_delete();

-- =====================================================================
-- payments (append-only)
-- =====================================================================
CREATE TABLE public.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  installment_id uuid NOT NULL REFERENCES public.installments (id) ON DELETE RESTRICT,
  loan_id uuid NOT NULL REFERENCES public.loans (id) ON DELETE RESTRICT,
  client_id uuid NOT NULL REFERENCES public.clients (id) ON DELETE RESTRICT,
  employee_id uuid NOT NULL REFERENCES public.employees (id) ON DELETE RESTRICT,
  kind public.payment_kind NOT NULL,
  method public.payment_method NOT NULL,
  paid_at date NOT NULL,
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  penalty_amount numeric(14,2) NOT NULL DEFAULT 0 CHECK (penalty_amount >= 0),
  receipt_url text,
  status public.payment_status NOT NULL DEFAULT 'confirmado',
  reverses_payment_id uuid REFERENCES public.payments (id) ON DELETE RESTRICT,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users (id) ON DELETE SET NULL
);
CREATE INDEX payments_installment_idx ON public.payments (installment_id);
CREATE INDEX payments_loan_idx ON public.payments (loan_id);
CREATE INDEX payments_client_idx ON public.payments (client_id);
CREATE INDEX payments_employee_idx ON public.payments (employee_id);
CREATE INDEX payments_paid_at_idx ON public.payments (paid_at);
CREATE INDEX payments_status_idx ON public.payments (status);

GRANT SELECT, INSERT, UPDATE ON public.payments TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.payments TO service_role;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY payments_select ON public.payments FOR SELECT TO authenticated USING (app.is_active_owner());
CREATE POLICY payments_insert ON public.payments FOR INSERT TO authenticated WITH CHECK (app.is_active_owner());
CREATE POLICY payments_update ON public.payments FOR UPDATE TO authenticated USING (app.is_active_owner()) WITH CHECK (app.is_active_owner());

CREATE TRIGGER payments_no_delete BEFORE DELETE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.forbid_delete();

-- =====================================================================
-- payment_allocations
-- =====================================================================
CREATE TABLE public.payment_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id uuid NOT NULL REFERENCES public.payments (id) ON DELETE RESTRICT,
  installment_id uuid NOT NULL REFERENCES public.installments (id) ON DELETE RESTRICT,
  principal_amount numeric(14,2) NOT NULL DEFAULT 0 CHECK (principal_amount >= 0),
  fr_profit_amount numeric(14,2) NOT NULL DEFAULT 0 CHECK (fr_profit_amount >= 0),
  employee_profit_amount numeric(14,2) NOT NULL DEFAULT 0 CHECK (employee_profit_amount >= 0),
  fr_penalty_amount numeric(14,2) NOT NULL DEFAULT 0 CHECK (fr_penalty_amount >= 0),
  employee_penalty_amount numeric(14,2) NOT NULL DEFAULT 0 CHECK (employee_penalty_amount >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX payment_allocations_payment_idx ON public.payment_allocations (payment_id);
CREATE INDEX payment_allocations_installment_idx ON public.payment_allocations (installment_id);

GRANT SELECT, INSERT, UPDATE ON public.payment_allocations TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.payment_allocations TO service_role;
ALTER TABLE public.payment_allocations ENABLE ROW LEVEL SECURITY;

CREATE POLICY payment_allocations_select ON public.payment_allocations FOR SELECT TO authenticated USING (app.is_active_owner());
CREATE POLICY payment_allocations_insert ON public.payment_allocations FOR INSERT TO authenticated WITH CHECK (app.is_active_owner());
CREATE POLICY payment_allocations_update ON public.payment_allocations FOR UPDATE TO authenticated USING (app.is_active_owner()) WITH CHECK (app.is_active_owner());

CREATE TRIGGER payment_allocations_no_delete BEFORE DELETE ON public.payment_allocations
  FOR EACH ROW EXECUTE FUNCTION public.forbid_delete();

-- =====================================================================
-- audit_events (append-only)
-- =====================================================================
CREATE TABLE public.audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_table text NOT NULL,
  entity_id uuid,
  action text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  actor_user_id uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_events_entity_idx ON public.audit_events (entity_table, entity_id);
CREATE INDEX audit_events_created_at_idx ON public.audit_events (created_at);

GRANT SELECT, INSERT ON public.audit_events TO authenticated;
GRANT SELECT, INSERT ON public.audit_events TO service_role;
ALTER TABLE public.audit_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY audit_events_select ON public.audit_events FOR SELECT TO authenticated USING (app.is_active_owner());
CREATE POLICY audit_events_insert ON public.audit_events FOR INSERT TO authenticated WITH CHECK (app.is_active_owner());

CREATE TRIGGER audit_events_no_delete BEFORE DELETE ON public.audit_events
  FOR EACH ROW EXECUTE FUNCTION public.forbid_delete();

-- =====================================================================
-- garantir funcionário do empréstimo = funcionário fixo do cliente
-- (a FK composta já garante; o gatilho impede troca posterior)
-- =====================================================================
CREATE OR REPLACE FUNCTION public.forbid_loan_employee_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.employee_id IS DISTINCT FROM OLD.employee_id OR NEW.client_id IS DISTINCT FROM OLD.client_id THEN
    RAISE EXCEPTION 'Cliente e funcionário do empréstimo não podem ser alterados.';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER loans_lock_parties BEFORE UPDATE ON public.loans
  FOR EACH ROW EXECUTE FUNCTION public.forbid_loan_employee_change();

-- anon sem qualquer acesso
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;