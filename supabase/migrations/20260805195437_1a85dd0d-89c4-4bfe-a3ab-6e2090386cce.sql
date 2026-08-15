ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS notification_preference text DEFAULT 'consolidated_daily' CHECK (notification_preference IN ('individual', 'consolidated_daily', 'both'));

CREATE TABLE IF NOT EXISTS public.employee_notifications (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id uuid REFERENCES public.employees(id) NOT NULL,
    loan_id uuid REFERENCES public.loans(id),
    installment_ids uuid[] NOT NULL,
    notification_type text NOT NULL,
    sent_at timestamptz DEFAULT now() NOT NULL,
    sent_by uuid REFERENCES auth.users(id),
    status text DEFAULT 'sent' NOT NULL,
    idempotency_key text UNIQUE NOT NULL,
    payload jsonb DEFAULT '{}'::jsonb
);

ALTER TABLE public.employee_notifications ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT ON public.employee_notifications TO authenticated;
GRANT ALL ON public.employee_notifications TO service_role;

DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can view all notifications' AND tablename = 'employee_notifications') THEN
        CREATE POLICY "Users can view all notifications" ON public.employee_notifications FOR SELECT TO authenticated USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can record their own notifications' AND tablename = 'employee_notifications') THEN
        CREATE POLICY "Users can record their own notifications" ON public.employee_notifications FOR INSERT TO authenticated WITH CHECK (auth.uid() = sent_by);
    END IF;
END $$;
