-- Fix for employee_notifications: loan_id should be optional for consolidated notifications
ALTER TABLE public.employee_notifications ALTER COLUMN loan_id DROP NOT NULL;

-- 2. PREFERÊNCIA DE AVISOS E AUTORIZAÇÃO DE PAGAMENTO PARCIAL

-- Adicionar tipo de perfil e equipe aos funcionários
DO $$ BEGIN
    CREATE TYPE public.user_role AS ENUM ('owner', 'manager', 'employee');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS role public.user_role DEFAULT 'employee';
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS managed_team_ids uuid[]; -- IDs de funcionários que este gerente pode gerenciar
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS access_email text;
-- Remover restrição UNIQUE de access_email se necessário para permitir null, mas aqui queremos index
CREATE UNIQUE INDEX IF NOT EXISTS idx_employees_access_email ON public.employees(access_email) WHERE access_email IS NOT NULL;

ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;

-- Tabela de solicitações de pagamento parcial
DO $$ BEGIN
    CREATE TYPE public.approval_status AS ENUM ('pending_approval', 'approved', 'rejected', 'processed', 'cancelled');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS public.payment_authorizations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    installment_id uuid REFERENCES public.installments(id) NOT NULL,
    amount_cents integer NOT NULL,
    reason text NOT NULL,
    notes text,
    status public.approval_status DEFAULT 'pending_approval' NOT NULL,
    requested_by uuid REFERENCES auth.users(id) NOT NULL,
    requested_at timestamptz DEFAULT now() NOT NULL,
    decided_by uuid REFERENCES auth.users(id),
    decided_at timestamptz,
    decision_notes text,
    processed_at timestamptz,
    idempotency_key text UNIQUE NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb
);

GRANT SELECT, INSERT, UPDATE ON public.payment_authorizations TO authenticated;
GRANT ALL ON public.payment_authorizations TO service_role;
ALTER TABLE public.payment_authorizations ENABLE ROW LEVEL SECURITY;

-- Políticas de RLS para payment_authorizations
CREATE POLICY "Users can view relevant authorizations" ON public.payment_authorizations
    FOR SELECT TO authenticated
    USING (true); 

CREATE POLICY "Users can request authorizations" ON public.payment_authorizations
    FOR INSERT TO authenticated
    WITH CHECK (auth.uid() = requested_by);

-- 5. AUTORIZAÇÃO DE EMPRÉSTIMOS
DO $$ BEGIN
    CREATE TYPE public.loan_approval_status AS ENUM ('draft', 'pending_approval', 'approved', 'rejected', 'active', 'cancelled');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

ALTER TABLE public.loans ADD COLUMN IF NOT EXISTS approval_status public.loan_approval_status DEFAULT 'active' NOT NULL;
ALTER TABLE public.loans ADD COLUMN IF NOT EXISTS requested_by uuid REFERENCES auth.users(id);
ALTER TABLE public.loans ADD COLUMN IF NOT EXISTS approved_by uuid REFERENCES auth.users(id);
ALTER TABLE public.loans ADD COLUMN IF NOT EXISTS approved_at timestamptz;
ALTER TABLE public.loans ADD COLUMN IF NOT EXISTS rejection_reason text;
ALTER TABLE public.loans ADD COLUMN IF NOT EXISTS approval_snapshot jsonb;

-- 6. RENEGOCIAÇÃO
CREATE TABLE IF NOT EXISTS public.loan_renegotiations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    original_loan_id uuid REFERENCES public.loans(id) NOT NULL,
    new_loan_id uuid REFERENCES public.loans(id), -- O novo contrato gerado
    status public.approval_status DEFAULT 'pending_approval' NOT NULL,
    requested_by uuid REFERENCES auth.users(id) NOT NULL,
    requested_at timestamptz DEFAULT now() NOT NULL,
    decided_by uuid REFERENCES auth.users(id),
    decided_at timestamptz,
    reason text NOT NULL,
    decision_notes text,
    original_snapshot jsonb NOT NULL, 
    proposed_terms jsonb NOT NULL,   
    idempotency_key text UNIQUE NOT NULL
);

GRANT SELECT, INSERT, UPDATE ON public.loan_renegotiations TO authenticated;
GRANT ALL ON public.loan_renegotiations TO service_role;
ALTER TABLE public.loan_renegotiations ENABLE ROW LEVEL SECURITY;

-- 7. AUDITORIA EXPANDIDA
CREATE OR REPLACE FUNCTION public.get_user_role(user_id uuid)
RETURNS public.user_role AS $$
    SELECT role FROM public.employees WHERE access_email = (SELECT email FROM auth.users WHERE id = user_id) LIMIT 1;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- Trigger para garantir que employees.access_email coincida com auth.users se for alterado
-- (Opcional, mas bom para integridade)
