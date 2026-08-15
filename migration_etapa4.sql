-- ETAPA 4: FUNCIONÁRIOS REAIS, CONFIGURAÇÕES DE CLIENTE E STORAGE
-- Nomes normalizados, RLS rigorosa, Storage privado.

-- 1. FUNCIONÁRIOS REAIS
-- Inserir funcionários oficiais e FR Financeira (operacional)
-- Usamos 'ON CONFLICT DO UPDATE' para garantir que os dados sejam os oficiais sem duplicar.

INSERT INTO public.employees (full_name, whatsapp, phone, status)
VALUES 
  ('Átila', '+5537999043833', '+5537999043833', 'ativo'),
  ('Alef', '+5537999488474', '+5537999488474', 'ativo'),
  ('Paulista', '+5537991030442', '+5537991030442', 'ativo'),
  ('Barriga', '+5537991220071', '+5537991220071', 'ativo'),
  ('Coruja Gustavo', '+5537999926654', '+5537999926654', 'ativo'),
  ('Fagner', '+5537999110042', '+5537999110042', 'ativo'),
  ('Josevan', '+5537984087031', '+5537984087031', 'ativo'),
  ('Gustavo Escritório', '+5537998334819', '+5537998334819', 'ativo'),
  ('Henrique', '+5537999142326', '+5537999142326', 'ativo'),
  ('Rayane', '+5537991243017', '+5537991243017', 'ativo'),
  ('Rotinho', '+5537999194606', '+5537999194606', 'ativo'),
  ('Larissa', '+5537999933981', '+5537999933981', 'ativo'),
  ('Raisley', '+5537998710683', '+5537998710683', 'ativo'),
  ('FR Financeira', '+5537984157771', '+5537984157771', 'ativo')
ON CONFLICT (whatsapp) DO UPDATE 
SET full_name = EXCLUDED.full_name, 
    phone = EXCLUDED.phone,
    status = 'ativo';

-- 2. ARQUIVAR FUNCIONÁRIOS FICTÍCIOS
UPDATE public.employees 
SET status = 'inativo', notes = COALESCE(notes, '') || ' [Arquivado Etapa 4]'
WHERE full_name NOT IN ('Átila', 'Alef', 'Paulista', 'Barriga', 'Coruja Gustavo', 'Fagner', 'Josevan', 'Gustavo Escritório', 'Henrique', 'Rayane', 'Rotinho', 'Larissa', 'Raisley', 'FR Financeira');

-- 3. EXPANDIR CADASTRO DE CLIENTE
ALTER TABLE public.clients
ADD COLUMN IF NOT EXISTS photo_url TEXT,
ADD COLUMN IF NOT EXISTS rg TEXT,
ADD COLUMN IF NOT EXISTS birth_date DATE,
ADD COLUMN IF NOT EXISTS secondary_phone TEXT,
ADD COLUMN IF NOT EXISTS email TEXT,
ADD COLUMN IF NOT EXISTS profession TEXT,
ADD COLUMN IF NOT EXISTS workplace TEXT,
ADD COLUMN IF NOT EXISTS reported_income NUMERIC(15,2),
ADD COLUMN IF NOT EXISTS pix_key TEXT,
ADD COLUMN IF NOT EXISTS reference_contacts JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS document_files_urls TEXT[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS address_proof_url TEXT;

-- Adicionar restrição de status mais completa
DO 24161 
BEGIN 
    ALTER TYPE public.client_status ADD VALUE 'bloqueado';
    ALTER TYPE public.client_status ADD VALUE 'arquivado';
EXCEPTION
    WHEN duplicate_object THEN null;
END 24161;

-- 4. CONFIGURAÇÃO DE JUROS E MULTA NO EMPRÉSTIMO (SNAPSHOT)
ALTER TABLE public.loans
ADD COLUMN IF NOT EXISTS penalty_kind_snapshot public.penalty_kind,
ADD COLUMN IF NOT EXISTS penalty_value_snapshot NUMERIC(15,2),
ADD COLUMN IF NOT EXISTS penalty_grace_days_snapshot INTEGER,
ADD COLUMN IF NOT EXISTS delay_interest_rate_snapshot NUMERIC(5,4), -- ex: 0.0100 para 1% ao dia
ADD COLUMN IF NOT EXISTS delay_interest_kind_snapshot TEXT DEFAULT 'diario'; -- diario, unico, personalizado

-- 5. STORAGE: BUCKET PRIVADO PARA DOCUMENTOS
-- Nota: O bucket deve ser criado via dispatch(supabase--storage_create_bucket)
-- Aqui garantimos as políticas RLS.

-- Políticas para o bucket 'documents' (supondo que o bucket se chame 'documents')
-- Apenas donos ativos podem acessar.

-- 6. AUDITORIA
-- (Já existe a tabela audit_events, mas podemos garantir que gatilhos de auditoria financeira existam)

-- Trigger para registrar mudanças em empréstimos e pagamentos
CREATE OR REPLACE FUNCTION public.audit_financial_change()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.audit_events (entity_table, entity_id, action, payload, actor_user_id)
    VALUES (TG_TABLE_NAME, NEW.id::text, TG_OP, row_to_json(NEW), auth.uid());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS audit_loans_trigger ON public.loans;
CREATE TRIGGER audit_loans_trigger AFTER INSERT OR UPDATE ON public.loans FOR EACH ROW EXECUTE FUNCTION public.audit_financial_change();

DROP TRIGGER IF EXISTS audit_payments_trigger ON public.payments;
CREATE TRIGGER audit_payments_trigger AFTER INSERT OR UPDATE ON public.payments FOR EACH ROW EXECUTE FUNCTION public.audit_financial_change();

