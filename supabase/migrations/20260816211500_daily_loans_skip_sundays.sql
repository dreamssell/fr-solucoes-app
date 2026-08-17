-- Helper function to calculate due date for daily periodicity skipping Sundays
CREATE OR REPLACE FUNCTION public.calculate_daily_due_date(p_start_date date, p_installment_number integer)
RETURNS date
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_current_date date := p_start_date;
  v_i integer;
BEGIN
  FOR v_i IN 1..p_installment_number LOOP
    v_current_date := v_current_date + 1;
    IF EXTRACT(dow FROM v_current_date) = 0 THEN
      v_current_date := v_current_date + 1;
    END IF;
  END LOOP;
  RETURN v_current_date;
END;
$$;

-- 1. Update all existing daily installments in public.installments
UPDATE public.installments i
SET due_date = public.calculate_daily_due_date(l.start_date, i.number)
FROM public.loans l
WHERE i.loan_id = l.id AND l.frequency = 'diario';

-- 2. Update all existing daily loans in public.loans (approval_snapshot)
DO $$
DECLARE
  v_loan RECORD;
  v_installments JSONB;
  v_updated_installments JSONB;
  v_item JSONB;
  v_new_due_date DATE;
BEGIN
  FOR v_loan IN 
    SELECT id, start_date, approval_snapshot 
    FROM public.loans 
    WHERE frequency = 'diario' AND approval_snapshot IS NOT NULL
  LOOP
    v_installments := v_loan.approval_snapshot->'terms'->'installments';
    IF v_installments IS NOT NULL AND jsonb_typeof(v_installments) = 'array' THEN
      v_updated_installments := '[]'::jsonb;
      FOR v_item IN SELECT * FROM jsonb_array_elements(v_installments) LOOP
        v_new_due_date := public.calculate_daily_due_date(v_loan.start_date, (v_item->>'number')::integer);
        v_item := jsonb_set(v_item, '{due_date}', to_jsonb(v_new_due_date::text));
        v_updated_installments := v_updated_installments || v_item;
      END LOOP;
      
      UPDATE public.loans
      SET approval_snapshot = jsonb_set(approval_snapshot, '{terms,installments}', v_updated_installments)
      WHERE id = v_loan.id;
    END IF;
  END LOOP;
END;
$$;

-- 3. Update proposed_terms in public.loan_renegotiations where frequency is daily
DO $$
DECLARE
  v_reneg RECORD;
  v_installments JSONB;
  v_updated_installments JSONB;
  v_item JSONB;
  v_start_date DATE;
  v_new_due_date DATE;
BEGIN
  FOR v_reneg IN 
    SELECT id, proposed_terms 
    FROM public.loan_renegotiations 
    WHERE proposed_terms->>'frequency' = 'diario'
  LOOP
    v_start_date := (v_reneg.proposed_terms->>'start_date')::date;
    v_installments := v_reneg.proposed_terms->'installments';
    IF v_installments IS NOT NULL AND jsonb_typeof(v_installments) = 'array' THEN
      v_updated_installments := '[]'::jsonb;
      FOR v_item IN SELECT * FROM jsonb_array_elements(v_installments) LOOP
        v_new_due_date := public.calculate_daily_due_date(v_start_date, (v_item->>'number')::integer);
        v_item := jsonb_set(v_item, '{due_date}', to_jsonb(v_new_due_date::text));
        v_updated_installments := v_updated_installments || v_item;
      END LOOP;
      
      UPDATE public.loan_renegotiations
      SET proposed_terms = jsonb_set(proposed_terms, '{installments}', v_updated_installments)
      WHERE id = v_reneg.id;
    END IF;
  END LOOP;
END;
$$;
