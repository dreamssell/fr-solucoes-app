-- Create table to map client documents metadata
CREATE TABLE IF NOT EXISTS public.client_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid REFERENCES public.clients(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  file_path text NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL
);

-- Enable RLS
ALTER TABLE public.client_documents ENABLE ROW LEVEL SECURITY;

-- Grant permissions to authenticated
GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_documents TO authenticated;
GRANT ALL ON public.client_documents TO service_role;

-- Policies for client_documents
DROP POLICY IF EXISTS client_documents_select ON public.client_documents;
CREATE POLICY client_documents_select ON public.client_documents
  FOR SELECT TO authenticated
  USING (
    app.is_active_owner()
    OR EXISTS (
      SELECT 1 FROM public.clients c
      WHERE c.id = client_id
        AND app.can_access_client_object(c.full_name)
    )
  );

DROP POLICY IF EXISTS client_documents_insert ON public.client_documents;
CREATE POLICY client_documents_insert ON public.client_documents
  FOR INSERT TO authenticated
  WITH CHECK (
    app.is_active_owner()
    OR EXISTS (
      SELECT 1 FROM public.clients c
      WHERE c.id = client_id
        AND app.can_access_client_object(c.full_name)
    )
  );

DROP POLICY IF EXISTS client_documents_update ON public.client_documents;
CREATE POLICY client_documents_update ON public.client_documents
  FOR UPDATE TO authenticated
  USING (
    app.is_active_owner()
    OR EXISTS (
      SELECT 1 FROM public.clients c
      WHERE c.id = client_id
        AND app.can_access_client_object(c.full_name)
    )
  )
  WITH CHECK (
    app.is_active_owner()
    OR EXISTS (
      SELECT 1 FROM public.clients c
      WHERE c.id = client_id
        AND app.can_access_client_object(c.full_name)
    )
  );

DROP POLICY IF EXISTS client_documents_delete ON public.client_documents;
CREATE POLICY client_documents_delete ON public.client_documents
  FOR DELETE TO authenticated
  USING (
    app.is_active_owner()
    OR EXISTS (
      SELECT 1 FROM public.clients c
      WHERE c.id = client_id
        AND app.can_access_client_object(c.full_name)
    )
  );
