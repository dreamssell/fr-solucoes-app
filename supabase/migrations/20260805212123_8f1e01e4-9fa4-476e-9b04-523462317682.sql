-- ============================================================
-- ESCOPO / AUTOAPROVAÇÃO + RENEGOCIAÇÃO ATÔMICA
-- ============================================================

CREATE OR REPLACE FUNCTION app.actor_employee_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT e.id FROM public.employees e
   WHERE e.access_email IS NOT NULL
     AND lower(btrim(e.access_email)) = (SELECT lower(btrim(u.email)) FROM auth.users u WHERE u.id = auth.uid())
   LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION app.actor_role()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT CASE
    WHEN auth.uid() IS NULL THEN NULL
    WHEN app.is_active_owner() THEN 'owner'
    ELSE (SELECT e.role::text FROM public.employees e
           WHERE e.id = app.actor_employee_id() AND e.is_active AND e.status = 'ativo')
  END;
$$;

CREATE OR REPLACE FUNCTION app.actor_is_active()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT app.actor_role() IS NOT NULL;
$$;

CREATE OR REPLACE FUNCTION app.actor_team_ids()
RETURNS uuid[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT COALESCE((SELECT e.managed_team_ids FROM public.employees e WHERE e.id = app.actor_employee_id()), '{}'::uuid[]);
$$;

-- Pode SOLICITAR sobre a carteira de _employee_id?
CREATE OR REPLACE FUNCTION app.can_request_for(_employee_id uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE r text := app.actor_role();
BEGIN
  IF r IS NULL THEN RETURN false; END IF;
  IF r = 'owner' THEN RETURN true; END IF;
  IF r = 'manager' THEN
    RETURN _employee_id = app.actor_employee_id() OR _employee_id = ANY(app.actor_team_ids());
  END IF;
  RETURN _employee_id = app.actor_employee_id();
END;
$$;

-- Pode DECIDIR (aprovar/rejeitar)? Nunca a própria solicitação.
CREATE OR REPLACE FUNCTION app.can_decide(_requested_by uuid, _employee_id uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE r text := app.actor_role();
BEGIN
  IF r IS NULL OR r = 'employee' THEN RETURN false; END IF;
  IF _requested_by = auth.uid() THEN RETURN false; END IF;
  IF r = 'owner' THEN RETURN true; END IF;
  RETURN _employee_id = ANY(app.actor_team_ids()) OR _employee_id = app.actor_employee_id();
END;
$$;

CREATE OR REPLACE FUNCTION app.loan_employee_id(_loan_id uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT l.employee_id FROM public.loans l WHERE l.id = _loan_id;
$$;

CREATE OR REPLACE FUNCTION app.installment_employee_id(_installment_id uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT l.employee_id FROM public.installments i JOIN public.loans l ON l.id = i.loan_id WHERE i.id = _installment_id;
$$;

REVOKE ALL ON FUNCTION app.actor_employee_id(), app.actor_role(), app.actor_is_active(), app.actor_team_ids(),
  app.can_request_for(uuid), app.can_decide(uuid, uuid), app.loan_employee_id(uuid), app.installment_employee_id(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION app.actor_employee_id(), app.actor_role(), app.actor_is_active(), app.actor_team_ids(),
  app.can_request_for(uuid), app.can_decide(uuid, uuid), app.loan_employee_id(uuid), app.installment_employee_id(uuid)
  TO authenticated, service_role;

-- ============================================================
-- RLS: autorizações de pagamento parcial
-- ============================================================
DROP POLICY IF EXISTS "Users can view relevant authorizations" ON public.payment_authorizations;
DROP POLICY IF EXISTS "Users can request authorizations" ON public.payment_authorizations;
DROP POLICY IF EXISTS "Managers and owners can update authorizations" ON public.payment_authorizations;

CREATE POLICY "auth_select_scoped" ON public.payment_authorizations FOR SELECT TO authenticated
  USING (app.can_request_for(app.installment_employee_id(installment_id)));
CREATE POLICY "auth_insert_scoped" ON public.payment_authorizations FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = requested_by AND app.can_request_for(app.installment_employee_id(installment_id)));
CREATE POLICY "auth_update_decider" ON public.payment_authorizations FOR UPDATE TO authenticated
  USING (app.can_decide(requested_by, app.installment_employee_id(installment_id)))
  WITH CHECK (app.can_decide(requested_by, app.installment_employee_id(installment_id)));

-- ============================================================
-- RLS: renegociações (escrita apenas pelas RPCs)
-- ============================================================
DROP POLICY IF EXISTS "Users can view renegotiations" ON public.loan_renegotiations;
DROP POLICY IF EXISTS "Users can request renegotiations" ON public.loan_renegotiations;
DROP POLICY IF EXISTS "Managers and owners can update renegotiations" ON public.loan_renegotiations;

CREATE POLICY "reneg_select_scoped" ON public.loan_renegotiations FOR SELECT TO authenticated
  USING (app.can_request_for(app.loan_employee_id(original_loan_id)));

REVOKE INSERT, UPDATE, DELETE ON public.loan_renegotiations FROM authenticated, anon;
GRANT SELECT ON public.loan_renegotiations TO authenticated;
GRANT ALL ON public.loan_renegotiations TO service_role;

-- ============================================================
-- RPC: solicitar renegociação (não altera nada do contrato)
-- ============================================================
CREATE OR REPLACE FUNCTION public.request_loan_renegotiation(
  p_loan_id uuid,
  p_reason text,
  p_proposed_terms jsonb,
  p_idempotency_key text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
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

  SELECT * INTO v_existing FROM public.loan_renegotiations WHERE idempotency_key = p_idempotency_key;
  IF FOUND THEN RETURN to_jsonb(v_existing); END IF;

  SELECT * INTO v_loan FROM public.loans WHERE id = p_loan_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Contrato não encontrado.' USING ERRCODE = 'P0002'; END IF;

  IF NOT app.can_request_for(v_loan.employee_id) THEN
    RAISE EXCEPTION 'Sem permissão sobre esta carteira.' USING ERRCODE = '42501';
  END IF;

  IF v_loan.status NOT IN ('ativo') THEN
    RAISE EXCEPTION 'Somente contratos ativos podem ser renegociados.' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (SELECT 1 FROM public.loan_renegotiations r
              WHERE r.original_loan_id = p_loan_id AND r.status = 'pending_approval') THEN
    RAISE EXCEPTION 'Já existe uma renegociação aguardando aprovação para este contrato.' USING ERRCODE = '23505';
  END IF;

  v_snapshot := jsonb_build_object(
    'loan', to_jsonb(v_loan),
    'installments', COALESCE((SELECT jsonb_agg(to_jsonb(i) ORDER BY i.number) FROM public.installments i WHERE i.loan_id = p_loan_id), '[]'::jsonb),
    'captured_at', now()
  );

  INSERT INTO public.loan_renegotiations (
    original_loan_id, status, requested_by, reason, original_snapshot, proposed_terms, idempotency_key
  ) VALUES (
    p_loan_id, 'pending_approval', v_uid, btrim(p_reason), v_snapshot, COALESCE(p_proposed_terms, '{}'::jsonb), p_idempotency_key
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

-- ============================================================
-- RPC: decidir renegociação (atômica e idempotente)
-- ============================================================
CREATE OR REPLACE FUNCTION public.decide_loan_renegotiation(
  p_renegotiation_id uuid,
  p_decision text,
  p_notes text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
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

  SELECT * INTO v_r FROM public.loan_renegotiations WHERE id = p_renegotiation_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Renegociação não encontrada.' USING ERRCODE = 'P0002'; END IF;

  SELECT * INTO v_loan FROM public.loans WHERE id = v_r.original_loan_id FOR UPDATE;

  IF NOT app.can_decide(v_r.requested_by, v_loan.employee_id) THEN
    RAISE EXCEPTION 'Sem permissão para decidir esta solicitação.' USING ERRCODE = '42501';
  END IF;

  -- Idempotência: decisão já tomada devolve o estado atual sem mutar nada.
  IF v_r.status <> 'pending_approval' THEN
    RETURN to_jsonb(v_r);
  END IF;

  IF p_decision = 'rejected' THEN
    UPDATE public.loan_renegotiations
       SET status = 'rejected', decided_by = v_uid, decided_at = now(), decision_notes = p_notes
     WHERE id = v_r.id RETURNING * INTO v_r;

    INSERT INTO public.audit_events (entity_table, entity_id, action, payload, actor_user_id)
    VALUES ('loan_renegotiations', v_r.id, 'RENEGOTIATION_REJECTED',
            jsonb_build_object('original_loan_id', v_r.original_loan_id, 'decision_notes', p_notes,
                               'requested_by', v_r.requested_by), v_uid);
    RETURN to_jsonb(v_r);
  END IF;

  v_terms := v_r.proposed_terms;

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
    (v_terms->>'fr_rate')::numeric,
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

  FOR v_inst IN SELECT * FROM jsonb_array_elements(COALESCE(v_terms->'installments', '[]'::jsonb)) LOOP
    INSERT INTO public.installments (
      loan_id, number, due_date, principal_amount, fr_profit_amount, employee_profit_amount,
      total_amount, outstanding_amount, paid_amount, penalty_amount, status
    ) VALUES (
      v_new_loan.id,
      (v_inst->>'number')::int,
      (v_inst->>'due_date')::date,
      (v_inst->>'principal_amount')::numeric,
      (v_inst->>'fr_profit_amount')::numeric,
      (v_inst->>'employee_profit_amount')::numeric,
      (v_inst->>'total_amount')::numeric,
      (v_inst->>'total_amount')::numeric,
      0, 0, 'pendente'
    );
  END LOOP;

  -- Contrato original é encerrado por renegociação (sem apagar histórico).
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

REVOKE ALL ON FUNCTION public.request_loan_renegotiation(uuid, text, jsonb, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.decide_loan_renegotiation(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_loan_renegotiation(uuid, text, jsonb, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.decide_loan_renegotiation(uuid, text, text) TO authenticated, service_role;