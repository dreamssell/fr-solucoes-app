-- Adicionar coluna de preferência de aviso aos funcionários
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS notification_preference text DEFAULT 'consolidated_daily' CHECK (notification_preference IN ('individual', 'consolidated_daily', 'both'));

-- Criar tabela para registro de avisos aos funcionários (Confirmação Auditada)
CREATE TABLE IF NOT EXISTS public.employee_notifications (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id uuid REFERENCES public.employees(id) NOT NULL,
    loan_id uuid REFERENCES public.loans(id) NOT NULL,
    installment_ids uuid[] NOT NULL, -- Pode ser um ou vários (consolidado)
    notification_type text NOT NULL, -- 'individual', 'consolidated_daily', 'collection_route'
    sent_at timestamptz DEFAULT now() NOT NULL,
    sent_by uuid REFERENCES auth.users(id),
    status text DEFAULT 'sent' NOT NULL,
    idempotency_key text UNIQUE NOT NULL,
    payload jsonb DEFAULT '{}'::jsonb
);

-- RLS e Grants para employee_notifications
ALTER TABLE public.employee_notifications ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT ON public.employee_notifications TO authenticated;
GRANT ALL ON public.employee_notifications TO service_role;

CREATE POLICY "Users can view all notifications" ON public.employee_notifications FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can record their own notifications" ON public.employee_notifications FOR INSERT TO authenticated WITH CHECK (auth.uid() = sent_by);

-- Garantir que a tabela audit_events receba tudo
-- (Já existe conforme migration anterior, mas garantindo que o trigger de delete financeiro seja rígido)

-- Trigger para bloquear DELETE em tabelas financeiras críticas
CREATE OR REPLACE FUNCTION public.block_financial_delete()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'Exclusão de registros financeiros é proibida por política de auditoria.';
END;
$$ LANGUAGE plpgsql;

DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trig_block_delete_payments') THEN
        CREATE TRIGGER trig_block_delete_payments BEFORE DELETE ON public.payments FOR EACH ROW EXECUTE FUNCTION public.block_financial_delete();
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trig_block_delete_loans') THEN
        CREATE TRIGGER trig_block_delete_loans BEFORE DELETE ON public.loans FOR EACH ROW EXECUTE FUNCTION public.block_financial_delete();
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trig_block_delete_installments') THEN
        CREATE TRIGGER trig_block_delete_installments BEFORE DELETE ON public.installments FOR EACH ROW EXECUTE FUNCTION public.block_financial_delete();
    END IF;
END $$;
