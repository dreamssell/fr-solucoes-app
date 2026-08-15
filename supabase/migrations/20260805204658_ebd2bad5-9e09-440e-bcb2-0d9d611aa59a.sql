-- Corrected security fix migration v2
-- 1. Resolve Search Path Mutable and Public Execution for get_user_role
ALTER FUNCTION public.get_user_role(user_id uuid) SET search_path = public;
REVOKE ALL ON FUNCTION public.get_user_role(user_id uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.get_user_role(user_id uuid) TO authenticated;

-- 2. Add RLS for loan_renegotiations (Table was created but policies were missing)
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can view renegotiations') THEN
        CREATE POLICY "Users can view renegotiations" ON public.loan_renegotiations
            FOR SELECT TO authenticated USING (true);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can request renegotiations') THEN
        CREATE POLICY "Users can request renegotiations" ON public.loan_renegotiations
            FOR INSERT TO authenticated WITH CHECK (auth.uid() = requested_by);
    END IF;
END $$;

-- 3. Refine RLS for payment_authorizations to allow managers and owners to decide
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Managers and owners can update authorizations') THEN
        CREATE POLICY "Managers and owners can update authorizations" ON public.payment_authorizations
            FOR UPDATE TO authenticated
            USING (
                public.get_user_role(auth.uid()) IN ('owner', 'manager')
            )
            WITH CHECK (
                public.get_user_role(auth.uid()) IN ('owner', 'manager')
            );
    END IF;
END $$;

-- 4. Refine RLS for loan_renegotiations for managers and owners
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Managers and owners can update renegotiations') THEN
        CREATE POLICY "Managers and owners can update renegotiations" ON public.loan_renegotiations
            FOR UPDATE TO authenticated
            USING (
                public.get_user_role(auth.uid()) IN ('owner', 'manager')
            )
            WITH CHECK (
                public.get_user_role(auth.uid()) IN ('owner', 'manager')
            );
    END IF;
END $$;

-- 5. Grant sequence usage
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;
