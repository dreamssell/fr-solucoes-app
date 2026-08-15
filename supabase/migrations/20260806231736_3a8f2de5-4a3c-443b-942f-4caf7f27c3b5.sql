-- Escopo de leitura por papel (owner / manager / employee). Somente políticas.

DROP POLICY IF EXISTS "employees_select" ON public.employees;
CREATE POLICY "employees_select" ON public.employees
  FOR SELECT TO authenticated
  USING (app.actor_is_active() AND app.can_request_for(id));

DROP POLICY IF EXISTS "clients_select" ON public.clients;
CREATE POLICY "clients_select" ON public.clients
  FOR SELECT TO authenticated
  USING (app.actor_is_active() AND app.can_request_for(employee_id));

DROP POLICY IF EXISTS "clients_insert" ON public.clients;
CREATE POLICY "clients_insert" ON public.clients
  FOR INSERT TO authenticated
  WITH CHECK (app.actor_is_active() AND app.can_request_for(employee_id));

DROP POLICY IF EXISTS "clients_update" ON public.clients;
CREATE POLICY "clients_update" ON public.clients
  FOR UPDATE TO authenticated
  USING (app.actor_is_active() AND app.can_request_for(employee_id))
  WITH CHECK (app.actor_is_active() AND app.can_request_for(employee_id));

DROP POLICY IF EXISTS "loans_select" ON public.loans;
CREATE POLICY "loans_select" ON public.loans
  FOR SELECT TO authenticated
  USING (app.actor_is_active() AND app.can_request_for(employee_id));

DROP POLICY IF EXISTS "installments_select" ON public.installments;
CREATE POLICY "installments_select" ON public.installments
  FOR SELECT TO authenticated
  USING (app.actor_is_active() AND app.can_request_for(app.loan_employee_id(loan_id)));

-- Escrita de loans/installments permanece exclusiva das RPCs SECURITY DEFINER.
REVOKE INSERT, UPDATE, DELETE ON public.loans FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.installments FROM authenticated;
GRANT SELECT ON public.loans TO authenticated;
GRANT SELECT ON public.installments TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.clients TO authenticated;
GRANT SELECT ON public.employees TO authenticated;
GRANT ALL ON public.loans, public.installments, public.clients, public.employees TO service_role;