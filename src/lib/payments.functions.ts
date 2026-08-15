import { callRpc, rpcErrorMessage } from "@/lib/rpc";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { allocatePayment, splitPenalty } from "@/finance";

const paymentInputSchema = z.object({
  installment_id: z.string().uuid(),
  amount_cents: z.number().int().positive(),
  penalty_cents: z.number().int().nonnegative(),
  payment_date: z.string(),
  payment_method: z.enum(["dinheiro", "pix", "transferencia"]),
  notes: z.string().optional().nullable(),
  idempotency_key: z.string().optional(),
  authorization_id: z.string().uuid().optional(),
});

export const requestPartialPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) =>
    z
      .object({
        installment_id: z.string().uuid(),
        amount_cents: z.number().int().positive(),
        reason: z.string().min(5),
        notes: z.string().optional(),
        idempotency_key: z.string(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    // Escrita direta bloqueada no banco: tudo passa pela RPC auditada.
    await callRpc(context.supabase, "request_payment_authorization", {
      p_installment_id: data.installment_id,
      p_amount_cents: data.amount_cents,
      p_reason: data.reason,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      p_notes: (data.notes as any) ?? null,
      p_idempotency_key: data.idempotency_key,
    });
    return { success: true };
  });

export const decidePartialPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) =>
    z
      .object({
        authorization_id: z.string().uuid(),
        decision: z.enum(["approved", "rejected"]),
        notes: z.string().optional(),
      })
      .superRefine((v, ctx) => {
        if (v.decision === "rejected" && (v.notes ?? "").trim().length < 5) {
          ctx.addIssue({
            code: "custom",
            message: "Rejeição exige justificativa (mínimo 5 caracteres).",
          });
        }
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    // Permissão, autoaprovação e escopo são decididos no banco (app.can_decide).
    await callRpc(context.supabase, "decide_payment_authorization", {
      p_authorization_id: data.authorization_id,
      p_decision: data.decision,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      p_notes: (data.notes as any) ?? null,
    });
    return { success: true };
  });

export const registerPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => paymentInputSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Use the atomic RPC to process the payment
    const { data: payment, error } = await supabase.rpc("process_payment_atomic", {
      p_idempotency_key: data.idempotency_key || crypto.randomUUID(),
      p_installment_id: data.installment_id,
      p_amount_cents: data.amount_cents,
      p_penalty_cents: data.penalty_cents,
      p_paid_at: data.payment_date,
      p_method: data.payment_method,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      p_notes: (data.notes as any) ?? null,
      p_user_id: userId,
    });

    if (error) {
      console.error("Payment registration error:", error);
      throw new Error(rpcErrorMessage(error, "Erro ao registrar pagamento"));
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return payment as any;
  });

export const getPayments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data, error } = await supabase
      .from("payments")
      .select("*, employees(full_name), clients(full_name), installments(*, loans(*, clients(*)))")
      .order("paid_at", { ascending: false });
    if (error) throw error;
    return data ?? [];
  });
