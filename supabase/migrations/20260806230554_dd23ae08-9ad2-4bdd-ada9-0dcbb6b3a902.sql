-- Escrita em loans/installments passa a ser exclusiva das RPCs SECURITY DEFINER.
-- Somente permissões/políticas: nenhum dado é alterado.

REVOKE INSERT, UPDATE ON public.loans FROM authenticated;
REVOKE INSERT, UPDATE ON public.installments FROM authenticated;

GRANT SELECT ON public.loans TO authenticated;
GRANT SELECT ON public.installments TO authenticated;
GRANT ALL ON public.loans TO service_role;
GRANT ALL ON public.installments TO service_role;

DROP POLICY IF EXISTS loans_insert ON public.loans;
DROP POLICY IF EXISTS loans_update ON public.loans;
DROP POLICY IF EXISTS installments_insert ON public.installments;
DROP POLICY IF EXISTS installments_update ON public.installments;
