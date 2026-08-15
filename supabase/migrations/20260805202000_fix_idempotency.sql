-- 1. Add idempotency_key column to payments
ALTER TABLE public.payments ADD COLUMN idempotency_key TEXT;

-- 2. Backfill idempotency_key with id for existing records (if any)
UPDATE public.payments SET idempotency_key = id::text;

-- 3. Add UNIQUE constraint on idempotency_key
ALTER TABLE public.payments ADD CONSTRAINT payments_idempotency_key_unique UNIQUE (idempotency_key);

-- 4. Create an atomic function for recording payments
CREATE OR REPLACE FUNCTION public.process_payment_atomic(
  p_idempotency_key TEXT,
  p_installment_id UUID,
  p_amount_cents NUMERIC,
  p_penalty_cents NUMERIC,
  p_paid_at DATE,
  p_method TEXT,
  p_notes TEXT,
  p_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inst RECORD;
  v_paid_principal NUMERIC;
  v_paid_fr NUMERIC;
  v_paid_emp NUMERIC;
  v_allocation RECORD;
  v_penalty_fr NUMERIC;
  v_penalty_emp NUMERIC;
  v_payment_id UUID;
  v_existing_payment RECORD;
  v_new_paid_total NUMERIC;
  v_is_integral BOOLEAN;
  v_status TEXT;
  v_remaining_principal NUMERIC;
  v_remaining_fr NUMERIC;
  v_remaining_emp NUMERIC;
  v_result JSONB;
BEGIN
  -- Check for existing payment by idempotency key
  SELECT * INTO v_existing_payment FROM public.payments WHERE idempotency_key = p_idempotency_key;
  IF FOUND THEN
    RETURN to_jsonb(v_existing_payment);
  END IF;

  -- Get installment data with row lock
  SELECT * INTO v_inst FROM public.installments WHERE id = p_installment_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Parcela não encontrada';
  END IF;

  -- Block if already fully paid (extra safety)
  IF v_inst.status = 'pago' THEN
     RAISE EXCEPTION 'Esta parcela já está totalmente paga';
  END IF;

  -- Calculate remaining balance components
  -- Note: In a real app, we would sum the allocations. For simplicity and robustness, we use installments table state.
  -- But to be truly precise, we should re-calculate from allocations to avoid drift.
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

  -- Block payment if amount exceeds outstanding
  IF p_amount_cents > (v_remaining_principal + v_remaining_fr + v_remaining_emp) THEN
    RAISE EXCEPTION 'Valor do pagamento excede o saldo devedor da parcela (Saldo: %)', (v_remaining_principal + v_remaining_fr + v_remaining_emp);
  END IF;

  -- Simple allocation logic inside PG (matches TypeScript engine logic)
  -- 1. Principal
  v_allocation.principal_amount := LEAST(p_amount_cents, v_remaining_principal);
  -- 2. FR Profit
  v_allocation.fr_profit_amount := LEAST(p_amount_cents - v_allocation.principal_amount, v_remaining_fr);
  -- 3. Employee Profit
  v_allocation.employee_profit_amount := LEAST(p_amount_cents - v_allocation.principal_amount - v_allocation.fr_profit_amount, v_remaining_emp);

  -- Penalty split 50/50
  v_penalty_fr := FLOOR(p_penalty_cents / 2.0);
  v_penalty_emp := p_penalty_cents - v_penalty_fr;

  -- Determine kind
  v_is_integral := (p_amount_cents >= (v_remaining_principal + v_remaining_fr + v_remaining_emp));
  
  -- Insert payment
  INSERT INTO public.payments (
    installment_id, loan_id, client_id, employee_id, amount, penalty_amount, paid_at, method, notes, status, kind, created_by, idempotency_key
  ) VALUES (
    p_installment_id, v_inst.loan_id, v_inst.client_id, v_inst.employee_id, p_amount_cents, p_penalty_cents, p_paid_at, p_method::payment_method, p_notes, 'confirmado', (CASE WHEN v_is_integral THEN 'integral' ELSE 'parcial' END)::payment_kind, p_user_id, p_idempotency_key
  ) RETURNING id INTO v_payment_id;

  -- Insert allocation
  INSERT INTO public.payment_allocations (
    payment_id, installment_id, principal_amount, fr_profit_amount, employee_profit_amount, fr_penalty_amount, employee_penalty_amount
  ) VALUES (
    v_payment_id, p_installment_id, v_allocation.principal_amount, v_allocation.fr_profit_amount, v_allocation.employee_profit_amount, v_penalty_fr, v_penalty_emp
  );

  -- Update installment
  v_new_paid_total := COALESCE(v_inst.paid_amount, 0) + p_amount_cents;
  
  UPDATE public.installments SET
    paid_amount = v_new_paid_total,
    outstanding_amount = GREATEST(0, total_amount - v_new_paid_total),
    penalty_amount = COALESCE(penalty_amount, 0) + p_penalty_cents,
    status = (CASE WHEN v_new_paid_total >= total_amount THEN 'pago' ELSE 'parcial' END)::installment_status
  WHERE id = p_installment_id;

  -- Audit event
  INSERT INTO public.audit_events (event_type, table_name, record_id, old_data, new_data, created_by)
  VALUES ('payment_created', 'payments', v_payment_id, NULL, jsonb_build_object('idempotency_key', p_idempotency_key, 'amount', p_amount_cents), p_user_id);

  SELECT * INTO v_existing_payment FROM public.payments WHERE id = v_payment_id;
  RETURN to_jsonb(v_existing_payment);
EXCEPTION WHEN unique_violation THEN
  -- Handle rare race condition where two inserts for same key happen
  SELECT * INTO v_existing_payment FROM public.payments WHERE idempotency_key = p_idempotency_key;
  RETURN to_jsonb(v_existing_payment);
END;
$$;

GRANT EXECUTE ON FUNCTION public.process_payment_atomic TO authenticated;
GRANT EXECUTE ON FUNCTION public.process_payment_atomic TO service_role;
