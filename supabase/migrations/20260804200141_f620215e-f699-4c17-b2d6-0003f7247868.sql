-- 1. Estrutura de owner_access
ALTER TABLE public.owner_access RENAME COLUMN user_id TO auth_user_id;
ALTER TABLE public.owner_access ALTER COLUMN auth_user_id DROP NOT NULL;

DO $$ BEGIN
  CREATE TYPE public.owner_access_type AS ENUM ('proprietario_definitivo', 'acesso_tecnico');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.owner_access
  ADD COLUMN email text NOT NULL,
  ADD COLUMN access_type public.owner_access_type NOT NULL DEFAULT 'proprietario_definitivo',
  ADD COLUMN is_temporary boolean NOT NULL DEFAULT false,
  ADD COLUMN expires_at timestamptz,
  ADD COLUMN linked_at timestamptz,
  ADD COLUMN deactivated_at timestamptz,
  ADD COLUMN deactivated_reason text;

ALTER TABLE public.owner_access
  ADD CONSTRAINT owner_access_email_normalized_chk CHECK (email = lower(btrim(email))),
  ADD CONSTRAINT owner_access_email_format_chk CHECK (email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$');

CREATE UNIQUE INDEX owner_access_email_uidx ON public.owner_access (email);
CREATE UNIQUE INDEX owner_access_auth_user_uidx ON public.owner_access (auth_user_id) WHERE auth_user_id IS NOT NULL;

-- 2. Normalização automática do e-mail
CREATE OR REPLACE FUNCTION public.normalize_owner_access_email()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.email := lower(btrim(NEW.email));
  RETURN NEW;
END;
$$;

CREATE TRIGGER owner_access_normalize_email
BEFORE INSERT OR UPDATE ON public.owner_access
FOR EACH ROW EXECUTE FUNCTION public.normalize_owner_access_email();

-- 3. Imutabilidade de campos sensíveis
CREATE OR REPLACE FUNCTION public.guard_owner_access_update()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.email IS DISTINCT FROM OLD.email THEN
    RAISE EXCEPTION 'E-mail da autorização não pode ser alterado.';
  END IF;
  IF NEW.access_type IS DISTINCT FROM OLD.access_type THEN
    RAISE EXCEPTION 'Tipo de acesso não pode ser alterado.';
  END IF;
  IF OLD.auth_user_id IS NOT NULL AND NEW.auth_user_id IS DISTINCT FROM OLD.auth_user_id THEN
    RAISE EXCEPTION 'Vínculo de usuário não pode ser alterado.';
  END IF;
  IF NEW.is_active = false AND OLD.is_active = true AND NEW.deactivated_at IS NULL THEN
    NEW.deactivated_at := now();
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER owner_access_guard_update
BEFORE UPDATE ON public.owner_access
FOR EACH ROW EXECUTE FUNCTION public.guard_owner_access_update();

CREATE OR REPLACE FUNCTION public.forbid_owner_access_delete()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  RAISE EXCEPTION 'Autorizações não podem ser apagadas. Desative o acesso.';
END;
$$;

CREATE TRIGGER owner_access_no_delete
BEFORE DELETE ON public.owner_access
FOR EACH ROW EXECUTE FUNCTION public.forbid_owner_access_delete();

-- 4. Auditoria de alterações de acesso
CREATE OR REPLACE FUNCTION public.audit_owner_access_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.audit_events (entity_table, entity_id, action, payload, actor_user_id)
  VALUES (
    'owner_access',
    NEW.id,
    TG_OP,
    jsonb_build_object(
      'email', NEW.email,
      'access_type', NEW.access_type,
      'is_active', NEW.is_active,
      'is_temporary', NEW.is_temporary,
      'auth_user_id', NEW.auth_user_id,
      'expires_at', NEW.expires_at
    ),
    auth.uid()
  );
  RETURN NULL;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.audit_owner_access_change() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER owner_access_audit
AFTER INSERT OR UPDATE ON public.owner_access
FOR EACH ROW EXECUTE FUNCTION public.audit_owner_access_change();

-- 5. Autorizações previamente cadastradas (sem vínculo com auth ainda)
INSERT INTO public.owner_access (email, access_type, is_temporary, is_active, notes)
VALUES
  ('feliperodrigues5521@gmail.com', 'proprietario_definitivo', false, true, 'Proprietário definitivo FR Financeiro'),
  ('cttestepedro@gmail.com', 'acesso_tecnico', true, true, 'Acesso técnico temporário — desativar antes da publicação');

-- 6. Autorização efetiva
CREATE OR REPLACE FUNCTION app.is_active_owner()
RETURNS boolean LANGUAGE sql STABLE SET search_path = public, pg_temp AS $$
  SELECT auth.uid() IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM public.owner_access oa
       WHERE oa.auth_user_id = auth.uid()
         AND oa.is_active
         AND (oa.expires_at IS NULL OR oa.expires_at > now())
     );
$$;

-- 7. Vínculo controlado entre auth.users e owner_access
CREATE OR REPLACE FUNCTION public.claim_owner_access()
RETURNS TABLE (authorized boolean, access_type public.owner_access_type, is_temporary boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_email text;
  v_confirmed timestamptz;
  v_deleted timestamptz;
  v_banned timestamptz;
  rec public.owner_access%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RETURN QUERY SELECT false, NULL::public.owner_access_type, NULL::boolean;
    RETURN;
  END IF;

  SELECT u.email, u.email_confirmed_at, u.deleted_at, u.banned_until
    INTO v_email, v_confirmed, v_deleted, v_banned
  FROM auth.users u WHERE u.id = v_uid;

  IF v_email IS NULL OR v_confirmed IS NULL OR v_deleted IS NOT NULL
     OR (v_banned IS NOT NULL AND v_banned > now()) THEN
    RETURN QUERY SELECT false, NULL::public.owner_access_type, NULL::boolean;
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM auth.identities i WHERE i.user_id = v_uid AND i.provider = 'google'
  ) THEN
    RETURN QUERY SELECT false, NULL::public.owner_access_type, NULL::boolean;
    RETURN;
  END IF;

  SELECT * INTO rec FROM public.owner_access oa
   WHERE oa.email = lower(btrim(v_email))
     AND oa.is_active
     AND (oa.expires_at IS NULL OR oa.expires_at > now());

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, NULL::public.owner_access_type, NULL::boolean;
    RETURN;
  END IF;

  IF rec.auth_user_id IS NOT NULL THEN
    IF rec.auth_user_id <> v_uid THEN
      RETURN QUERY SELECT false, NULL::public.owner_access_type, NULL::boolean;
      RETURN;
    END IF;
    RETURN QUERY SELECT true, rec.access_type, rec.is_temporary;
    RETURN;
  END IF;

  IF EXISTS (SELECT 1 FROM public.owner_access oa WHERE oa.auth_user_id = v_uid) THEN
    RETURN QUERY SELECT false, NULL::public.owner_access_type, NULL::boolean;
    RETURN;
  END IF;

  UPDATE public.owner_access
     SET auth_user_id = v_uid, linked_at = now()
   WHERE id = rec.id AND auth_user_id IS NULL;

  RETURN QUERY SELECT true, rec.access_type, rec.is_temporary;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.claim_owner_access() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_owner_access() TO authenticated;