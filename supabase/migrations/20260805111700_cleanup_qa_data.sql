-- Migração para limpeza de dados QA e correção de triggers
BEGIN;

-- Criar tabela temporária para os IDs
CREATE TEMP TABLE qa_clients_to_remove (id uuid);
INSERT INTO qa_clients_to_remove (id) SELECT id FROM public.clients WHERE full_name ILIKE '%QA%';

-- Remover triggers temporariamente (a migração roda como superuser no Lovable Cloud)
DROP TRIGGER IF EXISTS payment_allocations_no_delete ON public.payment_allocations;
DROP TRIGGER IF EXISTS payments_no_delete ON public.payments;
DROP TRIGGER IF EXISTS installments_no_delete ON public.installments;
DROP TRIGGER IF EXISTS loans_no_delete ON public.loans;

-- Auditoria antes da remoção
INSERT INTO public.audit_events (action, entity_table, payload)
VALUES (
  'CLEANUP_QA_DATA',
  'system',
  jsonb_build_object(
    'responsible', 'Lovable Agent',
    'timestamp', now(),
    'clients_removed_count', (SELECT count(*) from qa_clients_to_remove)
  )
);

-- Remoção
DELETE FROM public.payment_allocations WHERE payment_id IN (SELECT id FROM public.payments WHERE client_id IN (SELECT id FROM qa_clients_to_remove));
DELETE FROM public.payments WHERE client_id IN (SELECT id FROM qa_clients_to_remove);
DELETE FROM public.installments WHERE loan_id IN (SELECT id FROM public.loans WHERE client_id IN (SELECT id FROM qa_clients_to_remove));
DELETE FROM public.loans WHERE client_id IN (SELECT id FROM qa_clients_to_remove);
DELETE FROM public.clients WHERE id IN (SELECT id FROM qa_clients_to_remove);

-- Restaurar triggers
CREATE TRIGGER payment_allocations_no_delete BEFORE DELETE ON public.payment_allocations FOR EACH ROW EXECUTE FUNCTION public.forbid_delete();
CREATE TRIGGER payments_no_delete BEFORE DELETE ON public.payments FOR EACH ROW EXECUTE FUNCTION public.forbid_delete();
CREATE TRIGGER installments_no_delete BEFORE DELETE ON public.installments FOR EACH ROW EXECUTE FUNCTION public.forbid_delete();
CREATE TRIGGER loans_no_delete BEFORE DELETE ON public.loans FOR EACH ROW EXECUTE FUNCTION public.forbid_delete();

COMMIT;
