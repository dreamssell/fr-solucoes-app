import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { callRpc } from "@/lib/rpc";

export const getAuditEvents = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;

    // Apenas proprietários podem acessar os logs de auditoria
    const role = await callRpc<string | null>(supabase, "get_user_role", { user_id: userId });
    if (role !== "owner") {
      throw new Error("Acesso restrito ao proprietário.");
    }

    const { data, error } = await supabase
      .from("audit_events")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) throw error;
    return data;
  });
