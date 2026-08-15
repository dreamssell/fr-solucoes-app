-- 1. Configuração do Bucket Privado 'documents'
INSERT INTO storage.buckets (id, name, public) 
VALUES ('documents', 'documents', false)
ON CONFLICT (id) DO NOTHING;

-- 2. Políticas de RLS para o Bucket 'documents'
-- Apenas usuários autenticados (Owners) podem gerenciar documentos
CREATE POLICY "Owners can manage documents"
ON storage.objects
FOR ALL
TO authenticated
USING (bucket_id = 'documents')
WITH CHECK (bucket_id = 'documents');

-- 3. Atualização da tabela clients para suporte a multas e documentos
-- (Algumas colunas já podem existir do scaffold anterior, mas garantimos os tipos)
DO $$ 
BEGIN
    -- Garantir colunas de multas
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE table_name = 'clients' AND column_name = 'penalty_kind') THEN
        ALTER TABLE public.clients ADD COLUMN penalty_kind public.penalty_kind DEFAULT 'fixa' NOT NULL;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE table_name = 'clients' AND column_name = 'penalty_value') THEN
        ALTER TABLE public.clients ADD COLUMN penalty_value INTEGER DEFAULT 0 NOT NULL;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE table_name = 'clients' AND column_name = 'penalty_grace_days') THEN
        ALTER TABLE public.clients ADD COLUMN penalty_grace_days INTEGER DEFAULT 0 NOT NULL;
    END IF;

    -- Garantir colunas de juros de atraso
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE table_name = 'clients' AND column_name = 'delay_interest_kind') THEN
        ALTER TABLE public.clients ADD COLUMN delay_interest_kind TEXT DEFAULT 'diario' NOT NULL;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE table_name = 'clients' AND column_name = 'delay_interest_rate') THEN
        ALTER TABLE public.clients ADD COLUMN delay_interest_rate INTEGER DEFAULT 0 NOT NULL;
    END IF;
END $$;

-- 4. Garantir que o storage tenha acesso ao schema public se necessário (raro, mas preventivo)
GRANT ALL ON SCHEMA public TO service_role;
