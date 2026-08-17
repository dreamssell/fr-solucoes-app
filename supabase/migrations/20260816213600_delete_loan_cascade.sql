CREATE OR REPLACE FUNCTION public.delete_loan_cascade(p_loan_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_client_id uuid;
  v_employee_id uuid;
  v_loan_total numeric;
BEGIN
  -- Verificar se o ator tem acesso ativo
  IF v_uid IS NULL OR NOT app.actor_is_active() THEN
    RAISE EXCEPTION 'Usuário sem acesso ativo.' USING ERRCODE = '42501';
  END IF;

  -- Apenas owner e manager podem excluir empréstimos
  IF app.actor_role() NOT IN ('owner', 'manager') THEN
    RAISE EXCEPTION 'Apenas proprietários e gerentes podem excluir empréstimos.' USING ERRCODE = '42501';
  END IF;

  -- Buscar dados do empréstimo para validação e auditoria
  SELECT client_id, employee_id, total_amount INTO v_client_id, v_employee_id, v_loan_total
  FROM public.loans
  WHERE id = p_loan_id;

  IF v_client_id IS NULL THEN
    RAISE EXCEPTION 'Empréstimo não encontrado.' USING ERRCODE = '42704';
  END IF;

  -- Desativar gatilhos e restrições temporariamente para permitir o delete em cascata
  SET LOCAL session_replication_role = 'replica';

  -- Excluir registros dependentes
  -- 1. Alocações de pagamentos
  DELETE FROM public.payment_allocations 
  WHERE installment_id IN (SELECT id FROM public.installments WHERE loan_id = p_loan_id);

  -- 2. Pagamentos
  DELETE FROM public.payments 
  WHERE installment_id IN (SELECT id FROM public.installments WHERE loan_id = p_loan_id);

  -- 3. Autorizações de pagamento
  DELETE FROM public.payment_authorizations 
  WHERE installment_id IN (SELECT id FROM public.installments WHERE loan_id = p_loan_id);

  -- 4. Renegociações
  DELETE FROM public.loan_renegotiations 
  WHERE original_loan_id = p_loan_id OR new_loan_id = p_loan_id;

  -- 5. Parcelas
  DELETE FROM public.installments 
  WHERE loan_id = p_loan_id;

  -- 6. Empréstimo
  DELETE FROM public.loans 
  WHERE id = p_loan_id;

  -- Restaurar triggers
  SET LOCAL session_replication_role = 'origin';

  -- Registrar evento de auditoria
  INSERT INTO public.audit_events (entity_table, entity_id, action, payload, actor_user_id)
  VALUES ('loans', p_loan_id, 'LOAN_DELETED',
          jsonb_build_object(
            'client_id', v_client_id,
            'employee_id', v_employee_id,
            'total_amount', v_loan_total,
            'deleted_by', v_uid
          ), v_uid);
END;
$$;

-- Conceder permissão de execução para os papéis authenticated e service_role
GRANT EXECUTE ON FUNCTION public.delete_loan_cascade(uuid) TO authenticated, service_role;
