CREATE OR REPLACE FUNCTION public.audit_financial_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
    INSERT INTO public.audit_events (entity_table, entity_id, action, payload, actor_user_id)
    VALUES (TG_TABLE_NAME, NEW.id, TG_OP, row_to_json(NEW)::jsonb, auth.uid());
    RETURN NEW;
END;
$function$;