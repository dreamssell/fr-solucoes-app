-- Fix Linter Warnings
ALTER FUNCTION public.audit_financial_change() SET search_path = public;
REVOKE EXECUTE ON FUNCTION public.audit_financial_change() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.audit_financial_change() TO authenticated, service_role;
