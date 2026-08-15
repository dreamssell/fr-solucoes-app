ALTER TABLE public.employees 
ADD COLUMN IF NOT EXISTS commission_rate_percent NUMERIC(5,2) DEFAULT 10.00 NOT NULL CHECK (commission_rate_percent >= 0 AND commission_rate_percent <= 100),
ADD COLUMN IF NOT EXISTS penalty_split_percent NUMERIC(5,2) DEFAULT 50.00 NOT NULL CHECK (penalty_split_percent >= 0 AND penalty_split_percent <= 100);
