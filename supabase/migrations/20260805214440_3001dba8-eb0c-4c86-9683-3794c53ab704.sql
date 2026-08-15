DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sandbox_exec') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.process_payment_atomic(text, uuid, numeric, numeric, date, text, text, uuid) TO sandbox_exec';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.get_user_role(uuid) TO sandbox_exec';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.get_current_user_role() TO sandbox_exec';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.request_payment_authorization(uuid, integer, text, text, text) TO sandbox_exec';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.decide_payment_authorization(uuid, text, text) TO sandbox_exec';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.request_loan_approval(uuid, jsonb, text, text) TO sandbox_exec';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.decide_loan_approval(uuid, text, text) TO sandbox_exec';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.request_loan_renegotiation(uuid, text, jsonb, text) TO sandbox_exec';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.decide_loan_renegotiation(uuid, text, text) TO sandbox_exec';
  END IF;
END $$;