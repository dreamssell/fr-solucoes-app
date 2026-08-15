-- =====================================================================
-- foundation_security_containment
-- =====================================================================

CREATE OR REPLACE FUNCTION app.storage_object_client_id(p_name text)
RETURNS uuid
LANGUAGE sql
IMMUTABLE
SET search_path = pg_temp
AS $$
  SELECT CASE
    WHEN p_name ~* ('^clients/'
      || '[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}'
      || '/'
      || '[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}'
      || '\.[a-z0-9]{1,10}$')
    THEN (split_part(p_name, '/', 2))::uuid
    ELSE NULL
  END;
$$;

CREATE OR REPLACE FUNCTION app.can_access_client_object(p_name text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT app.actor_is_active()
     AND EXISTS (
       SELECT 1
         FROM public.clients c
        WHERE c.id = app.storage_object_client_id(p_name)
          AND app.can_request_for(c.employee_id)
     );
$$;

ALTER FUNCTION app.can_access_client_object(text) OWNER TO postgres;

REVOKE ALL ON FUNCTION app.storage_object_client_id(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.can_access_client_object(text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION app.storage_object_client_id(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION app.can_access_client_object(text) TO authenticated, service_role;

DROP POLICY IF EXISTS "Owners can manage documents" ON storage.objects;
DROP POLICY IF EXISTS "Owners can access documents" ON storage.objects;
DROP POLICY IF EXISTS "documents_select_scoped" ON storage.objects;
DROP POLICY IF EXISTS "documents_insert_scoped" ON storage.objects;
DROP POLICY IF EXISTS "documents_update_scoped" ON storage.objects;
DROP POLICY IF EXISTS "documents_delete_scoped" ON storage.objects;

CREATE POLICY "documents_select_scoped" ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'documents'
  AND (app.is_active_owner() OR app.can_access_client_object(name))
);

CREATE POLICY "documents_insert_scoped" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'documents'
  AND app.storage_object_client_id(name) IS NOT NULL
  AND (app.is_active_owner() OR app.can_access_client_object(name))
);

CREATE POLICY "documents_update_scoped" ON storage.objects
FOR UPDATE TO authenticated
USING (
  bucket_id = 'documents'
  AND (app.is_active_owner() OR app.can_access_client_object(name))
)
WITH CHECK (
  bucket_id = 'documents'
  AND app.storage_object_client_id(name) IS NOT NULL
  AND (app.is_active_owner() OR app.can_access_client_object(name))
);

CREATE POLICY "documents_delete_scoped" ON storage.objects
FOR DELETE TO authenticated
USING (bucket_id = 'documents' AND app.is_active_owner());

ALTER TABLE public.employee_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view all notifications" ON public.employee_notifications;
DROP POLICY IF EXISTS "Users can record their own notifications" ON public.employee_notifications;
DROP POLICY IF EXISTS "notifications_select_scoped" ON public.employee_notifications;
DROP POLICY IF EXISTS "notifications_insert_scoped" ON public.employee_notifications;

REVOKE ALL ON public.employee_notifications FROM anon;
GRANT SELECT, INSERT ON public.employee_notifications TO authenticated;
GRANT ALL ON public.employee_notifications TO service_role;

CREATE POLICY "notifications_select_scoped" ON public.employee_notifications
FOR SELECT TO authenticated
USING (
  app.actor_is_active() AND (
    app.is_active_owner()
    OR sent_by = auth.uid()
    OR employee_id = app.actor_employee_id()
    OR app.can_request_for(employee_id)
  )
);

CREATE POLICY "notifications_insert_scoped" ON public.employee_notifications
FOR INSERT TO authenticated
WITH CHECK (
  app.actor_is_active()
  AND sent_by = auth.uid()
  AND (app.is_active_owner() OR app.can_request_for(employee_id))
);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'fr_test_runner')
     AND EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'supabase_migrations') THEN
    EXECUTE 'GRANT USAGE ON SCHEMA supabase_migrations TO fr_test_runner';
    IF EXISTS (
      SELECT 1 FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'supabase_migrations'
         AND c.relname = 'schema_migrations'
         AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
    ) THEN
      EXECUTE 'GRANT SELECT ON supabase_migrations.schema_migrations TO fr_test_runner';
    END IF;
  END IF;
END
$$;