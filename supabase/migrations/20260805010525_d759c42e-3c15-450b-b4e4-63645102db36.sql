DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'objects' AND schemaname = 'storage' AND policyname = 'Owners can manage documents') THEN
        CREATE POLICY "Owners can manage documents"
        ON storage.objects
        FOR ALL
        TO authenticated
        USING (bucket_id = 'documents')
        WITH CHECK (bucket_id = 'documents');
    END IF;
END $$;

ALTER TABLE public.clients 
ADD COLUMN IF NOT EXISTS delay_interest_kind TEXT DEFAULT 'diario' NOT NULL,
ADD COLUMN IF NOT EXISTS delay_interest_rate INTEGER DEFAULT 0 NOT NULL;
