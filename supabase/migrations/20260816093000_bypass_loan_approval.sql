-- Redefine request_loan_approval to directly activate the loan and generate installments
CREATE OR REPLACE FUNCTION public.request_loan_approval(
  p_client_id uuid,
  p_terms jsonb,
  p_reason text,
  p_idempotency_key text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_client public.clients%ROWTYPE;
  v_loan public.loans%ROWTYPE;
  v_i jsonb;
BEGIN
  IF v_uid IS NULL OR NOT app.actor_is_active() THEN
    RAISE EXCEPTION 'Usuário sem acesso ativo.' USING ERRCODE = '42501';
  END IF;
  IF p_idempotency_key IS NULL OR length(btrim(p_idempotency_key)) < 8 THEN
    RAISE EXCEPTION 'Chave de idempotência inválida.' USING ERRCODE = '22023';
  END IF;

  PERFORM app.validate_loan_terms(p_terms);

  SELECT * INTO v_client FROM public.clients WHERE id = p_client_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cliente não encontrado.' USING ERRCODE = 'P0002';
  END IF;
  IF NOT app.can_request_for(v_client.employee_id) THEN
    RAISE EXCEPTION 'Sem permissão sobre esta carteira.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_loan FROM public.loans WHERE idempotency_key = p_idempotency_key;
  IF FOUND THEN
    IF v_loan.requested_by IS DISTINCT FROM v_uid OR v_loan.client_id <> p_client_id THEN
      RAISE EXCEPTION 'Chave de idempotência pertence a outra solicitação.' USING ERRCODE = '42501';
    END IF;
    RETURN to_jsonb(v_loan);
  END IF;

  -- Insert directly as active ('ativo') and approved ('approved')
  INSERT INTO public.loans (
    client_id, employee_id, frequency, principal_amount, fr_rate, fr_profit_amount,
    employee_profit_kind, employee_profit_input, employee_profit_amount, total_amount,
    installments_count, start_date, status, approval_status, requested_by, notes,
    penalty_kind_snapshot, penalty_value_snapshot, penalty_grace_days_snapshot,
    approval_snapshot, idempotency_key, approved_by, approved_at
  ) VALUES (
    p_client_id, v_client.employee_id,
    (p_terms->>'frequency')::public.loan_frequency,
    (p_terms->>'principal_amount')::numeric,
    COALESCE((p_terms->>'fr_rate')::numeric, 0),
    (p_terms->>'fr_profit_amount')::numeric,
    COALESCE((p_terms->>'employee_profit_kind')::public.employee_profit_kind, 'fixo'),
    COALESCE((p_terms->>'employee_profit_input')::numeric, 0),
    (p_terms->>'employee_profit_amount')::numeric,
    (p_terms->>'total_amount')::numeric,
    (p_terms->>'installments_count')::int,
    (p_terms->>'start_date')::date,
    'ativo', 'approved', v_uid, p_reason,
    v_client.penalty_kind, v_client.penalty_value, v_client.penalty_grace_days,
    jsonb_build_object('terms', p_terms, 'reason', p_reason, 'requested_at', now()),
    p_idempotency_key, v_uid, now()
  ) RETURNING * INTO v_loan;

  -- Generate installments immediately
  IF EXISTS (SELECT 1 FROM public.installments WHERE loan_id = v_loan.id) THEN
    RAISE EXCEPTION 'Parcelas já geradas para este contrato.' USING ERRCODE = '23505';
  END IF;

  FOR v_i IN SELECT * FROM jsonb_array_elements(p_terms->'installments') LOOP
    INSERT INTO public.installments (
      loan_id, number, due_date, principal_amount, fr_profit_amount, employee_profit_amount,
      total_amount, outstanding_amount, paid_amount, penalty_amount, status
    ) VALUES (
      v_loan.id, (v_i->>'number')::int, (v_i->>'due_date')::date,
      (v_i->>'principal_amount')::numeric, (v_i->>'fr_profit_amount')::numeric,
      (v_i->>'employee_profit_amount')::numeric, (v_i->>'total_amount')::numeric,
      (v_i->>'outstanding_amount')::numeric, 0, 0, 'ativa'
    );
  END LOOP;

  -- Record audit events
  INSERT INTO public.audit_events (entity_table, entity_id, action, payload, actor_user_id)
  VALUES ('loans', v_loan.id, 'LOAN_REQUESTED',
          jsonb_build_object('client_id', p_client_id, 'employee_id', v_client.employee_id,
                             'terms', p_terms, 'reason', p_reason), v_uid);

  INSERT INTO public.audit_events (entity_table, entity_id, action, payload, actor_user_id)
  VALUES ('loans', v_loan.id, 'LOAN_APPROVED',
          jsonb_build_object('requested_by', v_loan.requested_by, 'reason', 'Auto-aprovado instantaneamente'), v_uid);

  RETURN to_jsonb(v_loan);
EXCEPTION WHEN unique_violation THEN
  SELECT * INTO v_loan FROM public.loans WHERE idempotency_key = p_idempotency_key;
  RETURN to_jsonb(v_loan);
END;
$$;
