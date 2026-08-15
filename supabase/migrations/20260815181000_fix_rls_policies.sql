-- 1. Grant delete permissions on employees to authenticated users
GRANT DELETE ON public.employees TO authenticated;

-- 2. Create the DELETE policy on employees for active owners
DROP POLICY IF EXISTS employees_delete ON public.employees;
CREATE POLICY employees_delete ON public.employees
  FOR DELETE TO authenticated
  USING (app.is_active_owner());

-- 3. Recreate storage insert policy to allow owners to upload anything, and validate client paths for normal employees
DROP POLICY IF EXISTS "documents_insert_scoped" ON storage.objects;
CREATE POLICY "documents_insert_scoped" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'documents'
    AND (
      app.is_active_owner()
      OR (
        app.storage_object_client_id(name) IS NOT NULL
        AND app.can_access_client_object(name)
      )
    )
  );

-- 4. Recreate storage update policy to allow owners to update anything, and validate client paths for normal employees
DROP POLICY IF EXISTS "documents_update_scoped" ON storage.objects;
CREATE POLICY "documents_update_scoped" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'documents'
    AND (
      app.is_active_owner()
      OR app.can_access_client_object(name)
    )
  )
  WITH CHECK (
    bucket_id = 'documents'
    AND (
      app.is_active_owner()
      OR (
        app.storage_object_client_id(name) IS NOT NULL
        AND app.can_access_client_object(name)
      )
    )
  );
