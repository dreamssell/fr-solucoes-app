-- =============================================================
-- ETAPA 1 — CORREÇÃO FINAL DE SEGURANÇA (sem DML de dados reais)
-- =============================================================

-- ---------- 0. Colunas / índices de suporte ----------
ALTER TABLE public.loans ADD COLUMN IF NOT EXISTS idempotency_key text;
CREATE UNIQUE INDEX IF NOT EXISTS loans_idempotency_key_uidx ON public.loans (idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS installments_loan_number_uidx ON public.installments (loan_id, number);
CREATE INDEX IF NOT EXISTS loans_client_id_idx ON public.loans (client_id);
CREATE INDEX IF NOT EXISTS loans_employee_id_idx ON public.loans (employee_id);
CREATE INDEX IF NOT EXISTS loans_requested_by_idx ON public.loans (requested_by);
CREATE INDEX IF NOT EXISTS loans_approval_status_idx ON public.loans (approval_status);
CREATE INDEX IF NOT EXISTS clients_employee_id_idx ON public.clients (employee_id);
CREATE INDEX IF NOT EXISTS payments_installment_id_idx ON public.payments (installment_id);
CREATE INDEX IF NOT EXISTS payment_allocations_installment_id_idx ON public.payment_allocations (installment_id);
CREATE INDEX IF NOT EXISTS payment_allocations_payment_id_idx ON public.payment_allocations (payment_id);
CREATE INDEX IF NOT EXISTS payment_authorizations_installment_status_idx ON public.payment_authorizations (installment_id, status);
CREATE INDEX IF NOT EXISTS payment_authorizations_requested_by_idx ON public.payment_authorizations (requested_by);
CREATE UNIQUE INDEX IF NOT EXISTS payment_authorizations_idem_uidx ON public.payment_authorizations (idempotency_key);
CREATE INDEX IF NOT EXISTS loan_renegotiations_loan_status_idx ON public.loan_renegotiations (original_loan_id, status);
CREATE INDEX IF NOT EXISTS audit_events_entity_idx ON public.audit_events (entity_table, entity_id);

-- ---------- 1. Validação de termos (fonte de verdade no banco) ----------
CREATE OR REPLACE FUNCTION app.validate_loan_terms(p_terms jsonb)
RETURNS void
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_principal numeric; v_fr numeric; v_emp numeric; v_total numeric;
  v_count int; v_freq text; v_start text;
  v_arr jsonb; v_i jsonb; v_n int := 0;
  s_principal numeric := 0; s_fr numeric := 0; s_emp numeric := 0; s_total numeric := 0;
BEGIN
  IF p_terms IS NULL OR jsonb_typeof(p_terms) <> 'object' THEN
    RAISE EXCEPTION 'Termos propostos inválidos.' USING ERRCODE = '22023';
  END IF;

  v_principal := (p_terms->>'principal_amount')::numeric;
  v_fr        := (p_terms->>'fr_profit_amount')::numeric;
  v_emp       := (p_terms->>'employee_profit_amount')::numeric;
  v_total     := (p_terms->>'total_amount')::numeric;
  v_count     := (p_terms->>'installments_count')::int;
  v_freq      := p_terms->>'frequency';
  v_start     := p_terms->>'start_date';

  IF v_principal IS NULL OR v_fr IS NULL OR v_emp IS NULL OR v_total IS NULL OR v_count IS NULL THEN
    RAISE EXCEPTION 'Termos propostos incompletos.' USING ERRCODE = '22023';
  END IF;
  IF v_principal <= 0 OR v_total <= 0 OR v_fr < 0 OR v_emp < 0 THEN
    RAISE EXCEPTION 'Valores dos termos devem ser positivos.' USING ERRCODE = '22023';
  END IF;
  IF v_principal <> trunc(v_principal) OR v_fr <> trunc(v_fr) OR v_emp <> trunc(v_emp) OR v_total <> trunc(v_total) THEN
    RAISE EXCEPTION 'Valores devem estar em centavos inteiros.' USING ERRCODE = '22023';
  END IF;
  IF v_total <> v_principal + v_fr + v_emp THEN
    RAISE EXCEPTION 'Total não corresponde à soma dos componentes.' USING ERRCODE = '22023';
  END IF;
  IF v_count <= 0 OR v_count > 1000 THEN
    RAISE EXCEPTION 'Quantidade de parcelas inválida.' USING ERRCODE = '22023';
  END IF;
  IF v_freq IS NULL OR v_freq NOT IN ('diario','semanal','quinzenal','mensal') THEN
    RAISE EXCEPTION 'Periodicidade inválida.' USING ERRCODE = '22023';
  END IF;
  BEGIN
    PERFORM v_start::date;
  EXCEPTION WHEN others THEN
    RAISE EXCEPTION 'Data de início inválida.' USING ERRCODE = '22023';
  END;

  v_arr := p_terms->'installments';
  IF v_arr IS NULL OR jsonb_typeof(v_arr) <> 'array' OR jsonb_array_length(v_arr) <> v_count THEN
    RAISE EXCEPTION 'Lista de parcelas não corresponde à quantidade informada.' USING ERRCODE = '22023';
  END IF;

  FOR v_i IN SELECT * FROM jsonb_array_elements(v_arr) LOOP
    v_n := v_n + 1;
    IF (v_i->>'number')::int IS DISTINCT FROM v_n THEN
      RAISE EXCEPTION 'Parcelas devem ser sequenciais e únicas (1..N).' USING ERRCODE = '22023';
    END IF;
    BEGIN
      PERFORM (v_i->>'due_date')::date;
    EXCEPTION WHEN others THEN
      RAISE EXCEPTION 'Vencimento inválido na parcela %.', v_n USING ERRCODE = '22023';
    END;
    IF (v_i->>'total_amount')::numeric <= 0
       OR (v_i->>'principal_amount')::numeric < 0
       OR (v_i->>'fr_profit_amount')::numeric < 0
       OR (v_i->>'employee_profit_amount')::numeric < 0 THEN
      RAISE EXCEPTION 'Valores inválidos na parcela %.', v_n USING ERRCODE = '22023';
    END IF;
    IF (v_i->>'total_amount')::numeric <> (v_i->>'principal_amount')::numeric
                                        + (v_i->>'fr_profit_amount')::numeric
                                        + (v_i->>'employee_profit_amount')::numeric THEN
      RAISE EXCEPTION 'Componentes não fecham com o total na parcela %.', v_n USING ERRCODE = '22023';
    END IF;
    s_principal := s_principal + (v_i->>'principal_amount')::numeric;
    s_fr        := s_fr + (v_i->>'fr_profit_amount')::numeric;
    s_emp       := s_emp + (v_i->>'employee_profit_amount')::numeric;
    s_total     := s_total + (v_i->>'total_amount')::numeric;
  END LOOP;

  IF s_total <> v_total OR s_principal <> v_principal OR s_fr <> v_fr OR s_emp <> v_emp THEN
    RAISE EXCEPTION 'Soma das parcelas não fecha com os totais (centavo a centavo).' USING ERRCODE = '22023';
  END IF;
END;
$$;

-- ---------- 2. Impressão digital do contrato (detecta mudança pós-snapshot) ----------
CREATE OR REPLACE FUNCTION app.loan_fingerprint(_loan_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT jsonb_build_object(
    'principal', trim_scale(l.principal_amount),
    'total', trim_scale(l.total_amount),
    'count', l.installments_count,
    'status', l.status::text,
    'installments', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', i.id,
        'number', i.number,
        'total', trim_scale(i.total_amount),
        'paid', trim_scale(i.paid_amount),
        'status', i.status::text
      ) ORDER BY i.number)
      FROM public.installments i WHERE i.loan_id = l.id
    ), '[]'::jsonb)
  )
  FROM public.loans l WHERE l.id = _loan_id;
$$;

CREATE OR REPLACE FUNCTION app.snapshot_fingerprint(_snapshot jsonb)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT jsonb_build_object(
    'principal', trim_scale((_snapshot->'loan'->>'principal_amount')::numeric),
    'total', trim_scale((_snapshot->'loan'->>'total_amount')::numeric),
    'count', (_snapshot->'loan'->>'installments_count')::int,
    'status', _snapshot->'loan'->>'status',
    'installments', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', (e->>'id')::uuid,
        'number', (e->>'number')::int,
        'total', trim_scale((e->>'total_amount')::numeric),
        'paid', trim_scale((e->>'paid_amount')::numeric),
        'status', e->>'status'
      ) ORDER BY (e->>'number')::int)
      FROM jsonb_array_elements(COALESCE(_snapshot->'installments', '[]'::jsonb)) e
    ), '[]'::jsonb)
  );
$$;

-- ---------- 3. Papel do usuário autenticado ----------
CREATE OR REPLACE FUNCTION public.get_current_user_role()
RETURNS text
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT app.actor_role();
$$;

CREATE OR REPLACE FUNCTION public.get_user_role(user_id uuid)
RETURNS user_role
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT CASE
    WHEN auth.uid() IS NULL OR user_id IS DISTINCT FROM auth.uid() THEN NULL
    ELSE app.actor_role()::public.user_role
  END;
$$;

-- ---------- 4. Autorizações de pagamento parcial (RPCs auditadas) ----------
CREATE OR REPLACE FUNCTION public.request_payment_authorization(
  p_installment_id uuid,
  p_amount_cents integer,
  p_reason text,
  p_notes text DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_emp uuid;
  v_row public.payment_authorizations%ROWTYPE;
BEGIN
  IF v_uid IS NULL OR NOT app.actor_is_active() THEN
    RAISE EXCEPTION 'Usuário sem acesso ativo.' USING ERRCODE = '42501';
  END IF;
  IF p_amount_cents IS NULL OR p_amount_cents <= 0 THEN
    RAISE EXCEPTION 'Valor deve ser maior que zero.' USING ERRCODE = '22023';
  END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) < 5 THEN
    RAISE EXCEPTION 'Informe uma justificativa com pelo menos 5 caracteres.' USING ERRCODE = '22023';
  END IF;
  IF p_idempotency_key IS NULL OR length(btrim(p_idempotency_key)) < 8 THEN
    RAISE EXCEPTION 'Chave de idempotência inválida.' USING ERRCODE = '22023';
  END IF;

  v_emp := app.installment_employee_id(p_installment_id);
  IF v_emp IS NULL THEN
    RAISE EXCEPTION 'Parcela não encontrada.' USING ERRCODE = 'P0002';
  END IF;
  IF NOT app.can_request_for(v_emp) THEN
    RAISE EXCEPTION 'Sem permissão sobre esta carteira.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_row FROM public.payment_authorizations WHERE idempotency_key = p_idempotency_key;
  IF FOUND THEN
    IF v_row.requested_by <> v_uid OR v_row.installment_id <> p_installment_id THEN
      RAISE EXCEPTION 'Chave de idempotência pertence a outra solicitação.' USING ERRCODE = '42501';
    END IF;
    RETURN to_jsonb(v_row);
  END IF;

  INSERT INTO public.payment_authorizations (
    installment_id, amount_cents, reason, notes, status, requested_by, idempotency_key
  ) VALUES (
    p_installment_id, p_amount_cents, btrim(p_reason), p_notes, 'pending_approval', v_uid, p_idempotency_key
  ) RETURNING * INTO v_row;

  INSERT INTO public.audit_events (entity_table, entity_id, action, payload, actor_user_id)
  VALUES ('payment_authorizations', v_row.id, 'AUTHORIZATION_REQUESTED',
          jsonb_build_object('installment_id', p_installment_id, 'amount_cents', p_amount_cents,
                             'reason', v_row.reason, 'employee_id', v_emp), v_uid);
  RETURN to_jsonb(v_row);
EXCEPTION WHEN unique_violation THEN
  SELECT * INTO v_row FROM public.payment_authorizations WHERE idempotency_key = p_idempotency_key;
  RETURN to_jsonb(v_row);
END;
$$;

CREATE OR REPLACE FUNCTION public.decide_payment_authorization(
  p_authorization_id uuid,
  p_decision text,
  p_notes text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_row public.payment_authorizations%ROWTYPE;
  v_emp uuid;
BEGIN
  IF v_uid IS NULL OR NOT app.actor_is_active() THEN
    RAISE EXCEPTION 'Usuário sem acesso ativo.' USING ERRCODE = '42501';
  END IF;
  IF p_decision NOT IN ('approved','rejected') THEN
    RAISE EXCEPTION 'Decisão inválida.' USING ERRCODE = '22023';
  END IF;
  IF p_decision = 'rejected' AND (p_notes IS NULL OR length(btrim(p_notes)) < 5) THEN
    RAISE EXCEPTION 'Rejeição exige justificativa (mínimo 5 caracteres).' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_row FROM public.payment_authorizations WHERE id = p_authorization_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Solicitação não encontrada.' USING ERRCODE = 'P0002';
  END IF;

  v_emp := app.installment_employee_id(v_row.installment_id);
  IF NOT app.can_decide(v_row.requested_by, v_emp) THEN
    RAISE EXCEPTION 'Sem permissão para decidir esta solicitação.' USING ERRCODE = '42501';
  END IF;

  IF v_row.status <> 'pending_approval' THEN
    RETURN to_jsonb(v_row);
  END IF;

  UPDATE public.payment_authorizations
     SET status = p_decision::public.approval_status,
         decided_by = v_uid, decided_at = now(), decision_notes = p_notes
   WHERE id = v_row.id RETURNING * INTO v_row;

  INSERT INTO public.audit_events (entity_table, entity_id, action, payload, actor_user_id)
  VALUES ('payment_authorizations', v_row.id,
          CASE WHEN p_decision = 'approved' THEN 'AUTHORIZATION_APPROVED' ELSE 'AUTHORIZATION_REJECTED' END,
          jsonb_build_object('installment_id', v_row.installment_id, 'amount_cents', v_row.amount_cents,
                             'requested_by', v_row.requested_by, 'decision_notes', p_notes), v_uid);
  RETURN to_jsonb(v_row);
END;
$$;

-- escrita direta bloqueada: apenas as RPCs auditadas mudam autorizações
DROP POLICY IF EXISTS auth_insert_scoped ON public.payment_authorizations;
DROP POLICY IF EXISTS auth_update_decider ON public.payment_authorizations;
REVOKE INSERT, UPDATE, DELETE ON public.payment_authorizations FROM authenticated;
GRANT SELECT ON public.payment_authorizations TO authenticated;
GRANT ALL ON public.payment_authorizations TO service_role;

-- ---------- 5. Pagamento atômico endurecido ----------
CREATE OR REPLACE FUNCTION public.process_payment_atomic(
  p_idempotency_key text,
  p_installment_id uuid,
  p_amount_cents numeric,
  p_penalty_cents numeric,
  p_paid_at date,
  p_method text,
  p_notes text,
  p_user_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_role text;
  v_emp uuid;
  v_inst RECORD;
  v_auth public.payment_authorizations%ROWTYPE;
  v_paid_principal NUMERIC; v_paid_fr NUMERIC; v_paid_emp NUMERIC;
  v_principal_alloc NUMERIC; v_fr_alloc NUMERIC; v_emp_alloc NUMERIC;
  v_penalty_fr NUMERIC; v_penalty_emp NUMERIC;
  v_payment_id UUID;
  v_existing_payment RECORD;
  v_new_paid_total NUMERIC;
  v_is_integral BOOLEAN;
  v_remaining_principal NUMERIC; v_remaining_fr NUMERIC; v_remaining_emp NUMERIC;
  v_key text := btrim(COALESCE(p_idempotency_key, ''));
BEGIN
  -- Ator: sempre da sessão. p_user_id vindo do frontend é ignorado.
  v_role := app.actor_role();
  IF v_uid IS NULL OR v_role IS NULL THEN
    RAISE EXCEPTION 'Usuário sem acesso ativo.' USING ERRCODE = '42501';
  END IF;
  IF v_key = '' THEN
    RAISE EXCEPTION 'Chave de idempotência obrigatória.' USING ERRCODE = '22023';
  END IF;
  IF p_amount_cents IS NULL OR p_amount_cents <= 0 OR p_amount_cents <> trunc(p_amount_cents) THEN
    RAISE EXCEPTION 'Valor do pagamento deve ser maior que zero.' USING ERRCODE = '22023';
  END IF;
  IF p_penalty_cents IS NULL OR p_penalty_cents < 0 OR p_penalty_cents <> trunc(p_penalty_cents) THEN
    RAISE EXCEPTION 'Multa não pode ser negativa.' USING ERRCODE = '22023';
  END IF;
  IF p_method IS NULL OR p_method NOT IN ('dinheiro','pix','transferencia','outro') THEN
    RAISE EXCEPTION 'Forma de pagamento inválida.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_inst FROM public.installments WHERE id = p_installment_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Parcela não encontrada.' USING ERRCODE = 'P0002';
  END IF;

  v_emp := app.installment_employee_id(p_installment_id);
  IF NOT app.can_request_for(v_emp) THEN
    RAISE EXCEPTION 'Sem permissão sobre esta carteira.' USING ERRCODE = '42501';
  END IF;

  -- Idempotência só depois de validar ator, carteira e vínculo da operação.
  SELECT * INTO v_existing_payment FROM public.payments WHERE idempotency_key = v_key;
  IF FOUND THEN
    IF v_existing_payment.installment_id <> p_installment_id THEN
      RAISE EXCEPTION 'Chave de idempotência pertence a outra parcela.' USING ERRCODE = '42501';
    END IF;
    RETURN to_jsonb(v_existing_payment);
  END IF;

  -- Funcionário nunca baixa parcela sem autorização aprovada da mesma parcela/valor/solicitante.
  IF v_role = 'employee' THEN
    SELECT * INTO v_auth
      FROM public.payment_authorizations
     WHERE installment_id = p_installment_id
       AND requested_by = v_uid
       AND status = 'approved'
       AND amount_cents = p_amount_cents
     ORDER BY decided_at NULLS LAST
     LIMIT 1
     FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Pagamento exige autorização aprovada para esta parcela e valor.' USING ERRCODE = '42501';
    END IF;
  END IF;

  IF v_inst.status = 'pago' THEN
    RAISE EXCEPTION 'Esta parcela já está totalmente paga.' USING ERRCODE = '22023';
  END IF;

  SELECT COALESCE(SUM(principal_amount),0), COALESCE(SUM(fr_profit_amount),0), COALESCE(SUM(employee_profit_amount),0)
    INTO v_paid_principal, v_paid_fr, v_paid_emp
    FROM public.payment_allocations WHERE installment_id = p_installment_id;

  v_remaining_principal := v_inst.principal_amount - v_paid_principal;
  v_remaining_fr := v_inst.fr_profit_amount - v_paid_fr;
  v_remaining_emp := v_inst.employee_profit_amount - v_paid_emp;

  IF p_amount_cents > (v_remaining_principal + v_remaining_fr + v_remaining_emp) THEN
    RAISE EXCEPTION 'Valor do pagamento excede o saldo devedor da parcela (Saldo: %)',
      (v_remaining_principal + v_remaining_fr + v_remaining_emp) USING ERRCODE = '22023';
  END IF;

  v_principal_alloc := LEAST(p_amount_cents, v_remaining_principal);
  v_fr_alloc := LEAST(p_amount_cents - v_principal_alloc, v_remaining_fr);
  v_emp_alloc := LEAST(p_amount_cents - v_principal_alloc - v_fr_alloc, v_remaining_emp);

  v_penalty_fr := FLOOR(p_penalty_cents / 2.0);
  v_penalty_emp := p_penalty_cents - v_penalty_fr;
  v_is_integral := (p_amount_cents >= (v_remaining_principal + v_remaining_fr + v_remaining_emp));

  INSERT INTO public.payments (
    installment_id, loan_id, client_id, employee_id, amount, penalty_amount, paid_at, method, notes,
    status, kind, created_by, idempotency_key
  )
  SELECT p_installment_id, l.id, l.client_id, l.employee_id, p_amount_cents, p_penalty_cents, p_paid_at,
         p_method::public.payment_method, p_notes, 'confirmado',
         (CASE WHEN v_is_integral THEN 'integral' ELSE 'parcial' END)::public.payment_kind, v_uid, v_key
    FROM public.loans l WHERE l.id = v_inst.loan_id
  RETURNING id INTO v_payment_id;

  INSERT INTO public.payment_allocations (
    payment_id, installment_id, principal_amount, fr_profit_amount, employee_profit_amount,
    fr_penalty_amount, employee_penalty_amount
  ) VALUES (
    v_payment_id, p_installment_id, v_principal_alloc, v_fr_alloc, v_emp_alloc, v_penalty_fr, v_penalty_emp
  );

  -- Consome a autorização de forma atômica (uso único).
  IF v_role = 'employee' THEN
    UPDATE public.payment_authorizations
       SET status = 'processed', processed_at = now(),
           metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('payment_id', v_payment_id)
     WHERE id = v_auth.id;
  END IF;

  v_new_paid_total := COALESCE(v_inst.paid_amount, 0) + p_amount_cents;

  UPDATE public.installments SET
    paid_amount = v_new_paid_total,
    outstanding_amount = GREATEST(0, total_amount - v_new_paid_total),
    penalty_amount = COALESCE(v_inst.penalty_amount, 0) + p_penalty_cents,
    status = (CASE WHEN v_new_paid_total >= total_amount THEN 'pago' ELSE 'parcial' END)::public.installment_status
  WHERE id = p_installment_id;

  INSERT INTO public.audit_events (entity_table, entity_id, action, payload, actor_user_id)
  VALUES ('payments', v_payment_id, 'payment_created',
          jsonb_build_object('idempotency_key', v_key, 'amount', p_amount_cents,
                             'penalty', p_penalty_cents, 'role', v_role,
                             'authorization_id', v_auth.id, 'employee_id', v_emp), v_uid);

  SELECT * INTO v_existing_payment FROM public.payments WHERE id = v_payment_id;
  RETURN to_jsonb(v_existing_payment);
EXCEPTION WHEN unique_violation THEN
  SELECT * INTO v_existing_payment FROM public.payments WHERE idempotency_key = v_key;
  RETURN to_jsonb(v_existing_payment);
END;
$$;

-- ---------- 6. Empréstimos: solicitar / decidir por RPC atômica ----------
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

  INSERT INTO public.loans (
    client_id, employee_id, frequency, principal_amount, fr_rate, fr_profit_amount,
    employee_profit_kind, employee_profit_input, employee_profit_amount, total_amount,
    installments_count, start_date, status, approval_status, requested_by, notes,
    penalty_kind_snapshot, penalty_value_snapshot, penalty_grace_days_snapshot,
    approval_snapshot, idempotency_key
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
    'aguardando_aprovacao', 'pending_approval', v_uid, p_reason,
    v_client.penalty_kind, v_client.penalty_value, v_client.penalty_grace_days,
    jsonb_build_object('terms', p_terms, 'reason', p_reason, 'requested_at', now()),
    p_idempotency_key
  ) RETURNING * INTO v_loan;

  INSERT INTO public.audit_events (entity_table, entity_id, action, payload, actor_user_id)
  VALUES ('loans', v_loan.id, 'LOAN_REQUESTED',
          jsonb_build_object('client_id', p_client_id, 'employee_id', v_client.employee_id,
                             'terms', p_terms, 'reason', p_reason), v_uid);
  RETURN to_jsonb(v_loan);
EXCEPTION WHEN unique_violation THEN
  SELECT * INTO v_loan FROM public.loans WHERE idempotency_key = p_idempotency_key;
  RETURN to_jsonb(v_loan);
END;
$$;

CREATE OR REPLACE FUNCTION public.decide_loan_approval(
  p_loan_id uuid,
  p_decision text,
  p_reason text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_loan public.loans%ROWTYPE;
  v_terms jsonb;
  v_i jsonb;
BEGIN
  IF v_uid IS NULL OR NOT app.actor_is_active() THEN
    RAISE EXCEPTION 'Usuário sem acesso ativo.' USING ERRCODE = '42501';
  END IF;
  IF p_decision NOT IN ('approved','rejected') THEN
    RAISE EXCEPTION 'Decisão inválida.' USING ERRCODE = '22023';
  END IF;
  IF p_decision = 'rejected' AND (p_reason IS NULL OR length(btrim(p_reason)) < 5) THEN
    RAISE EXCEPTION 'Rejeição exige justificativa (mínimo 5 caracteres).' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_loan FROM public.loans WHERE id = p_loan_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Contrato não encontrado.' USING ERRCODE = 'P0002';
  END IF;
  IF NOT app.can_decide(v_loan.requested_by, v_loan.employee_id) THEN
    RAISE EXCEPTION 'Sem permissão para decidir esta solicitação.' USING ERRCODE = '42501';
  END IF;

  IF v_loan.approval_status <> 'pending_approval' THEN
    RETURN to_jsonb(v_loan);  -- idempotente
  END IF;

  IF p_decision = 'rejected' THEN
    UPDATE public.loans
       SET approval_status = 'rejected', status = 'cancelado',
           approved_by = v_uid, approved_at = now(), rejection_reason = btrim(p_reason)
     WHERE id = v_loan.id RETURNING * INTO v_loan;

    INSERT INTO public.audit_events (entity_table, entity_id, action, payload, actor_user_id)
    VALUES ('loans', v_loan.id, 'LOAN_REJECTED',
            jsonb_build_object('requested_by', v_loan.requested_by, 'reason', btrim(p_reason)), v_uid);
    RETURN to_jsonb(v_loan);
  END IF;

  v_terms := COALESCE(v_loan.approval_snapshot->'terms', '{}'::jsonb);
  PERFORM app.validate_loan_terms(v_terms);

  IF EXISTS (SELECT 1 FROM public.installments WHERE loan_id = v_loan.id) THEN
    RAISE EXCEPTION 'Parcelas já geradas para este contrato.' USING ERRCODE = '23505';
  END IF;

  FOR v_i IN SELECT * FROM jsonb_array_elements(v_terms->'installments') LOOP
    INSERT INTO public.installments (
      loan_id, number, due_date, principal_amount, fr_profit_amount, employee_profit_amount,
      total_amount, outstanding_amount, paid_amount, penalty_amount, status
    ) VALUES (
      v_loan.id, (v_i->>'number')::int, (v_i->>'due_date')::date,
      (v_i->>'principal_amount')::numeric, (v_i->>'fr_profit_amount')::numeric,
      (v_i->>'employee_profit_amount')::numeric, (v_i->>'total_amount')::numeric,
      (v_i->>'total_amount')::numeric, 0, 0, 'pendente'
    );
  END LOOP;

  UPDATE public.loans
     SET approval_status = 'approved', status = 'ativo',
         approved_by = v_uid, approved_at = now()
   WHERE id = v_loan.id RETURNING * INTO v_loan;

  INSERT INTO public.audit_events (entity_table, entity_id, action, payload, actor_user_id)
  VALUES ('loans', v_loan.id, 'LOAN_APPROVED',
          jsonb_build_object('requested_by', v_loan.requested_by, 'terms', v_terms,
                             'fingerprint', app.loan_fingerprint(v_loan.id)), v_uid);
  RETURN to_jsonb(v_loan);
END;
$$;

-- ---------- 7. Renegociação: validação de termos, idempotência escopada, snapshot travado ----------
CREATE OR REPLACE FUNCTION public.request_loan_renegotiation(
  p_loan_id uuid, p_reason text, p_proposed_terms jsonb, p_idempotency_key text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_loan public.loans%ROWTYPE;
  v_existing public.loan_renegotiations%ROWTYPE;
  v_snapshot jsonb;
  v_row public.loan_renegotiations%ROWTYPE;
BEGIN
  IF v_uid IS NULL OR NOT app.actor_is_active() THEN
    RAISE EXCEPTION 'Usuário sem acesso ativo.' USING ERRCODE = '42501';
  END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) < 5 THEN
    RAISE EXCEPTION 'Informe uma justificativa com pelo menos 5 caracteres.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_loan FROM public.loans WHERE id = p_loan_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Contrato não encontrado.' USING ERRCODE = 'P0002'; END IF;
  IF NOT app.can_request_for(v_loan.employee_id) THEN
    RAISE EXCEPTION 'Sem permissão sobre esta carteira.' USING ERRCODE = '42501';
  END IF;

  -- Idempotência avaliada só após autenticar e validar escopo.
  SELECT * INTO v_existing FROM public.loan_renegotiations WHERE idempotency_key = p_idempotency_key;
  IF FOUND THEN
    IF v_existing.requested_by <> v_uid OR v_existing.original_loan_id <> p_loan_id THEN
      RAISE EXCEPTION 'Chave de idempotência pertence a outra solicitação.' USING ERRCODE = '42501';
    END IF;
    RETURN to_jsonb(v_existing);
  END IF;

  PERFORM app.validate_loan_terms(p_proposed_terms);

  IF v_loan.status NOT IN ('ativo') THEN
    RAISE EXCEPTION 'Somente contratos ativos podem ser renegociados.' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (SELECT 1 FROM public.loan_renegotiations r
              WHERE r.original_loan_id = p_loan_id AND r.status = 'pending_approval') THEN
    RAISE EXCEPTION 'Já existe uma renegociação aguardando aprovação para este contrato.' USING ERRCODE = '23505';
  END IF;

  v_snapshot := jsonb_build_object(
    'loan', to_jsonb(v_loan),
    'installments', COALESCE((SELECT jsonb_agg(to_jsonb(i) ORDER BY i.number)
                                FROM public.installments i WHERE i.loan_id = p_loan_id), '[]'::jsonb),
    'captured_at', now()
  );

  INSERT INTO public.loan_renegotiations (
    original_loan_id, status, requested_by, reason, original_snapshot, proposed_terms, idempotency_key
  ) VALUES (
    p_loan_id, 'pending_approval', v_uid, btrim(p_reason), v_snapshot, p_proposed_terms, p_idempotency_key
  ) RETURNING * INTO v_row;

  INSERT INTO public.audit_events (entity_table, entity_id, action, payload, actor_user_id)
  VALUES ('loan_renegotiations', v_row.id, 'RENEGOTIATION_REQUESTED',
          jsonb_build_object('original_loan_id', p_loan_id, 'reason', v_row.reason,
                             'proposed_terms', v_row.proposed_terms, 'original_snapshot', v_snapshot), v_uid);
  RETURN to_jsonb(v_row);
EXCEPTION WHEN unique_violation THEN
  SELECT * INTO v_existing FROM public.loan_renegotiations WHERE idempotency_key = p_idempotency_key;
  IF FOUND THEN RETURN to_jsonb(v_existing); END IF;
  RAISE;
END;
$$;

CREATE OR REPLACE FUNCTION public.decide_loan_renegotiation(
  p_renegotiation_id uuid, p_decision text, p_notes text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_r public.loan_renegotiations%ROWTYPE;
  v_loan public.loans%ROWTYPE;
  v_terms jsonb;
  v_new_loan public.loans%ROWTYPE;
  v_inst jsonb;
BEGIN
  IF v_uid IS NULL OR NOT app.actor_is_active() THEN
    RAISE EXCEPTION 'Usuário sem acesso ativo.' USING ERRCODE = '42501';
  END IF;
  IF p_decision NOT IN ('approved', 'rejected') THEN
    RAISE EXCEPTION 'Decisão inválida.' USING ERRCODE = '22023';
  END IF;
  IF p_decision = 'rejected' AND (p_notes IS NULL OR length(btrim(p_notes)) < 5) THEN
    RAISE EXCEPTION 'Rejeição exige justificativa (mínimo 5 caracteres).' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_r FROM public.loan_renegotiations WHERE id = p_renegotiation_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Renegociação não encontrada.' USING ERRCODE = 'P0002'; END IF;

  SELECT * INTO v_loan FROM public.loans WHERE id = v_r.original_loan_id FOR UPDATE;
  PERFORM 1 FROM public.installments WHERE loan_id = v_loan.id FOR UPDATE;

  IF NOT app.can_decide(v_r.requested_by, v_loan.employee_id) THEN
    RAISE EXCEPTION 'Sem permissão para decidir esta solicitação.' USING ERRCODE = '42501';
  END IF;

  IF v_r.status <> 'pending_approval' THEN
    RETURN to_jsonb(v_r);
  END IF;

  IF p_decision = 'rejected' THEN
    UPDATE public.loan_renegotiations
       SET status = 'rejected', decided_by = v_uid, decided_at = now(), decision_notes = btrim(p_notes)
     WHERE id = v_r.id RETURNING * INTO v_r;

    INSERT INTO public.audit_events (entity_table, entity_id, action, payload, actor_user_id)
    VALUES ('loan_renegotiations', v_r.id, 'RENEGOTIATION_REJECTED',
            jsonb_build_object('original_loan_id', v_r.original_loan_id, 'decision_notes', btrim(p_notes),
                               'requested_by', v_r.requested_by), v_uid);
    RETURN to_jsonb(v_r);
  END IF;

  -- Contrato não pode ter mudado desde a solicitação.
  IF app.loan_fingerprint(v_loan.id) <> app.snapshot_fingerprint(v_r.original_snapshot) THEN
    RAISE EXCEPTION 'O contrato mudou desde a solicitação. Refaça a renegociação.' USING ERRCODE = '40001';
  END IF;

  v_terms := v_r.proposed_terms;
  PERFORM app.validate_loan_terms(v_terms);

  INSERT INTO public.loans (
    client_id, employee_id, frequency, principal_amount, fr_rate, fr_profit_amount,
    employee_profit_kind, employee_profit_input, employee_profit_amount, total_amount,
    installments_count, start_date, status, approval_status, approved_by, approved_at,
    requested_by, notes,
    penalty_kind_snapshot, penalty_value_snapshot, penalty_grace_days_snapshot,
    delay_interest_rate_snapshot, delay_interest_kind_snapshot
  ) VALUES (
    v_loan.client_id, v_loan.employee_id,
    COALESCE((v_terms->>'frequency')::public.loan_frequency, v_loan.frequency),
    (v_terms->>'principal_amount')::numeric,
    COALESCE((v_terms->>'fr_rate')::numeric, 0),
    (v_terms->>'fr_profit_amount')::numeric,
    COALESCE((v_terms->>'employee_profit_kind')::public.employee_profit_kind, v_loan.employee_profit_kind),
    COALESCE((v_terms->>'employee_profit_input')::numeric, 0),
    (v_terms->>'employee_profit_amount')::numeric,
    (v_terms->>'total_amount')::numeric,
    (v_terms->>'installments_count')::int,
    COALESCE((v_terms->>'start_date')::date, CURRENT_DATE),
    'ativo', 'approved', v_uid, now(), v_r.requested_by,
    'Renegociação do contrato ' || v_loan.id::text,
    v_loan.penalty_kind_snapshot, v_loan.penalty_value_snapshot, v_loan.penalty_grace_days_snapshot,
    v_loan.delay_interest_rate_snapshot, v_loan.delay_interest_kind_snapshot
  ) RETURNING * INTO v_new_loan;

  FOR v_inst IN SELECT * FROM jsonb_array_elements(v_terms->'installments') LOOP
    INSERT INTO public.installments (
      loan_id, number, due_date, principal_amount, fr_profit_amount, employee_profit_amount,
      total_amount, outstanding_amount, paid_amount, penalty_amount, status
    ) VALUES (
      v_new_loan.id, (v_inst->>'number')::int, (v_inst->>'due_date')::date,
      (v_inst->>'principal_amount')::numeric, (v_inst->>'fr_profit_amount')::numeric,
      (v_inst->>'employee_profit_amount')::numeric, (v_inst->>'total_amount')::numeric,
      (v_inst->>'total_amount')::numeric, 0, 0, 'pendente'
    );
  END LOOP;

  UPDATE public.installments
     SET status = 'renegociado'
   WHERE loan_id = v_loan.id AND status IN ('pendente', 'parcial', 'atrasado');

  UPDATE public.loans SET status = 'renegociado' WHERE id = v_loan.id;

  UPDATE public.loan_renegotiations
     SET status = 'approved', decided_by = v_uid, decided_at = now(),
         decision_notes = p_notes, new_loan_id = v_new_loan.id
   WHERE id = v_r.id RETURNING * INTO v_r;

  INSERT INTO public.audit_events (entity_table, entity_id, action, payload, actor_user_id)
  VALUES ('loan_renegotiations', v_r.id, 'RENEGOTIATION_APPROVED',
          jsonb_build_object('original_loan_id', v_loan.id, 'new_loan_id', v_new_loan.id,
                             'requested_by', v_r.requested_by, 'decision_notes', p_notes,
                             'original_snapshot', v_r.original_snapshot,
                             'new_snapshot', to_jsonb(v_new_loan)), v_uid);
  RETURN to_jsonb(v_r);
END;
$$;

-- ---------- 8. Permissões mínimas de execução ----------
REVOKE EXECUTE ON FUNCTION public.process_payment_atomic(text, uuid, numeric, numeric, date, text, text, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_user_role(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_current_user_role() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.request_payment_authorization(uuid, integer, text, text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.decide_payment_authorization(uuid, text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.request_loan_approval(uuid, jsonb, text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.decide_loan_approval(uuid, text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.request_loan_renegotiation(uuid, text, jsonb, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.decide_loan_renegotiation(uuid, text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.claim_owner_access() FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.process_payment_atomic(text, uuid, numeric, numeric, date, text, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_role(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_current_user_role() TO authenticated;
GRANT EXECUTE ON FUNCTION public.request_payment_authorization(uuid, integer, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.decide_payment_authorization(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.request_loan_approval(uuid, jsonb, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.decide_loan_approval(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.request_loan_renegotiation(uuid, text, jsonb, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.decide_loan_renegotiation(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_owner_access() TO authenticated;