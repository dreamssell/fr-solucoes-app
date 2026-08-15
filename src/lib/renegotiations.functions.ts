import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { callRpc } from "@/lib/rpc";

export const getMyRole = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    // Sem fallback: usuário sem perfil ativo fica sem permissão.
    const role = await callRpc<string | null>(supabase, "get_current_user_role", {});
    return { userId, role: role ?? null };
  });

export const listRenegotiations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data, error } = await supabase
      .from("loan_renegotiations")
      .select("*")
      .order("requested_at", { ascending: false });
    if (error) throw error;
    return data ?? [];
  });

export const requestRenegotiation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) =>
    z
      .object({
        loan_id: z.string().uuid(),
        reason: z.string().trim().min(10, "Descreva a justificativa (mínimo 10 caracteres)."),
        proposed_terms: z.record(z.string(), z.unknown()),
        idempotency_key: z.string().min(8),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    await callRpc(context.supabase, "request_loan_renegotiation", {
      p_loan_id: data.loan_id,
      p_reason: data.reason,
      p_proposed_terms: data.proposed_terms,
      p_idempotency_key: data.idempotency_key,
    });
    return { success: true } as const;
  });

export const decideRenegotiation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) =>
    z
      .object({
        renegotiation_id: z.string().uuid(),
        decision: z.enum(["approved", "rejected"]),
        notes: z.string().trim().optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    await callRpc(context.supabase, "decide_loan_renegotiation", {
      p_renegotiation_id: data.renegotiation_id,
      p_decision: data.decision,
      p_notes: data.notes ?? null,
    });
    return { success: true } as const;
  });
