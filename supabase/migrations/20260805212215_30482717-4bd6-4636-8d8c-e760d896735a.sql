REVOKE ALL ON FUNCTION public.get_user_role(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_user_role(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.process_payment_atomic(p_idempotency_key text, p_installment_id uuid, p_amount_cents numeric, p_penalty_cents numeric, p_paid_at date, p_method text, p_notes text, p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid UUID := auth.uid();
  v_inst RECORD;
  v_paid_principal NUMERIC;
  v_paid_fr NUMERIC;
  v_paid_emp NUMERIC;
  v_principal_alloc NUMERIC;
  v_fr_alloc NUMERIC;
  v_emp_alloc NUMERIC;
  v_penalty_fr NUMERIC;
  v_penalty_emp NUMERIC;
  v_payment_id UUID;
  v_existing_payment RECORD;
  v_new_paid_total NUMERIC;
  v_is_integral BOOLEAN;
  v_remaining_principal NUMERIC;
  v_remaining_fr NUMERIC;
  v_remaining_emp NUMERIC;
BEGIN
  -- Autor sempre vem da sessão; IDs enviados pelo frontend são ignorados.
  IF v_uid IS NULL OR NOT app.actor_is_active() THEN
    RAISE EXCEPTION 'Usuário sem acesso ativo.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_existing_payment FROM public.payments WHERE idempotency_key = p_idempotency_key;
  IF FOUND THEN
    RETURN to_jsonb(v_existing_payment);
  END IF;

  SELECT * INTO v_inst FROM public.installments WHERE id = p_installment_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Parcela não encontrada';
  END IF;

  IF NOT app.can_request_for(app.installment_employee_id(p_installment_id)) THEN
    RAISE EXCEPTION 'Sem permissão sobre esta carteira.' USING ERRCODE = '42501';
  END IF;

  IF v_inst.status = 'pago' THEN
     RAISE EXCEPTION 'Esta parcela já está totalmente paga';
  END IF;

  SELECT 
    COALESCE(SUM(principal_amount), 0),
    COALESCE(SUM(fr_profit_amount), 0),
    COALESCE(SUM(employee_profit_amount), 0)
  INTO v_paid_principal, v_paid_fr, v_paid_emp
  FROM public.payment_allocations
  WHERE installment_id = p_installment_id;

  v_remaining_principal := v_inst.principal_amount - v_paid_principal;
  v_remaining_fr := v_inst.fr_profit_amount - v_paid_fr;
  v_remaining_emp := v_inst.employee_profit_amount - v_paid_emp;

  IF p_amount_cents > (v_remaining_principal + v_remaining_fr + v_remaining_emp) THEN
    RAISE EXCEPTION 'Valor do pagamento excede o saldo devedor da parcela (Saldo: %)', (v_remaining_principal + v_remaining_fr + v_remaining_emp);
  END IF;

  v_principal_alloc := LEAST(p_amount_cents, v_remaining_principal);
  v_fr_alloc := LEAST(p_amount_cents - v_principal_alloc, v_remaining_fr);
  v_emp_alloc := LEAST(p_amount_cents - v_principal_alloc - v_fr_alloc, v_remaining_emp);

  v_penalty_fr := FLOOR(p_penalty_cents / 2.0);
  v_penalty_emp := p_penalty_cents - v_penalty_fr;

  v_is_integral := (p_amount_cents >= (v_remaining_principal + v_remaining_fr + v_remaining_emp));

  INSERT INTO public.payments (
    installment_id, loan_id, client_id, employee_id, amount, penalty_amount, paid_at, method, notes, status, kind, created_by, idempotency_key
  )
  SELECT p_installment_id, l.id, l.client_id, l.employee_id, p_amount_cents, p_penalty_cents, p_paid_at, p_method::payment_method, p_notes, 'confirmado',
         (CASE WHEN v_is_integral THEN 'integral' ELSE 'parcial' END)::payment_kind, v_uid, p_idempotency_key
    FROM public.loans l WHERE l.id = v_inst.loan_id
  RETURNING id INTO v_payment_id;

  INSERT INTO public.payment_allocations (
    payment_id, installment_id, principal_amount, fr_profit_amount, employee_profit_amount, fr_penalty_amount, employee_penalty_amount
  ) VALUES (
    v_payment_id, p_installment_id, v_principal_alloc, v_fr_alloc, v_emp_alloc, v_penalty_fr, v_penalty_emp
  );

  v_new_paid_total := COALESCE(v_inst.paid_amount, 0) + p_amount_cents;

  UPDATE public.installments SET
    paid_amount = v_new_paid_total,
    outstanding_amount = GREATEST(0, total_amount - v_new_paid_total),
    penalty_amount = COALESCE(v_inst.penalty_amount, 0) + p_penalty_cents,
    status = (CASE WHEN v_new_paid_total >= total_amount THEN 'pago' ELSE 'parcial' END)::installment_status
  WHERE id = p_installment_id;

  INSERT INTO public.audit_events (entity_table, entity_id, action, payload, actor_user_id)
  VALUES ('payments', v_payment_id, 'payment_created', jsonb_build_object('idempotency_key', p_idempotency_key, 'amount', p_amount_cents), v_uid);

  SELECT * INTO v_existing_payment FROM public.payments WHERE id = v_payment_id;
  RETURN to_jsonb(v_existing_payment);
EXCEPTION WHEN unique_violation THEN
  SELECT * INTO v_existing_payment FROM public.payments WHERE idempotency_key = p_idempotency_key;
  RETURN to_jsonb(v_existing_payment);
END;
$function$;

REVOKE ALL ON FUNCTION public.process_payment_atomic(text, uuid, numeric, numeric, date, text, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.process_payment_atomic(text, uuid, numeric, numeric, date, text, text, uuid) TO authenticated, service_role;