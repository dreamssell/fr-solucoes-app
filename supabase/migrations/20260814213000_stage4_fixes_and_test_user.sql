-- Migração: Ajustes de Segurança e Criação do Usuário de Teste

-- 1. Enforcar hierarquia de papéis no banco de dados (gerente não aprova solicitações do proprietário)
CREATE OR REPLACE FUNCTION app.can_decide(_requested_by uuid, _employee_id uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE r text := app.actor_role();
BEGIN
  IF r IS NULL OR r = 'employee' THEN RETURN false; END IF;
  IF _requested_by = auth.uid() THEN RETURN false; END IF;
  IF r = 'owner' THEN RETURN true; END IF;
  
  -- Se o ator for gerente (manager), ele NÃO pode decidir solicitações criadas por um proprietário (owner) ativo
  IF r = 'manager' AND EXISTS (
    SELECT 1 FROM public.owner_access oa 
     WHERE oa.auth_user_id = _requested_by 
       AND oa.is_active 
       AND (oa.expires_at IS NULL OR oa.expires_at > now())
  ) THEN
    RETURN false;
  END IF;

  RETURN _employee_id = ANY(app.actor_team_ids()) OR _employee_id = app.actor_employee_id();
END;
$$;

-- 2. Criação do usuário de teste teste@frfinanceiro.com
DO $$
DECLARE
  new_user_id uuid := '8f4c3a9b-7e6d-5c4b-3a2b-1c0d9e8f7a6b'; -- UUID fixo para consistência
  user_email text := 'teste@frfinanceiro.com';
  hashed_pwd text;
BEGIN
  -- Criação de senha hash usando crypt (senha: Trocar5enh@123)
  -- Supabase possui a extensão pgcrypto instalada em extensions/pgcrypto
  hashed_pwd := extensions.crypt('Trocar5enh@123', extensions.gen_salt('bf'));

  -- Inserir usuário em auth.users se não existir
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = user_email) THEN
    INSERT INTO auth.users (
      id,
      instance_id,
      email,
      encrypted_password,
      email_confirmed_at,
      raw_app_meta_data,
      raw_user_meta_data,
      created_at,
      updated_at,
      role,
      aud,
      confirmation_token,
      recovery_token,
      email_change_token_new,
      email_change
    ) VALUES (
      new_user_id,
      '00000000-0000-0000-0000-000000000000',
      user_email,
      hashed_pwd,
      now(),
      '{"provider": "email", "providers": ["email", "google"]}'::jsonb,
      '{}'::jsonb,
      now(),
      now(),
      'authenticated',
      'authenticated',
      '',
      '',
      '',
      ''
    );

    -- Inserir identidade google simulada para satisfazer a claim_owner_access
    INSERT INTO auth.identities (
      id,
      provider_id,
      user_id,
      identity_data,
      provider,
      last_sign_in_at,
      created_at,
      updated_at
    ) VALUES (
      new_user_id,
      new_user_id::text,
      new_user_id,
      jsonb_build_object('sub', new_user_id::text, 'email', user_email, 'email_verified', true),
      'google',
      now(),
      now(),
      now()
    );

    -- Autorizar acesso em public.owner_access como proprietario_definitivo ativo
    INSERT INTO public.owner_access (
      email,
      access_type,
      is_active,
      is_temporary,
      auth_user_id,
      linked_at
    ) VALUES (
      user_email,
      'proprietario_definitivo',
      true,
      false,
      new_user_id,
      now()
    );
  END IF;
END
$$;
