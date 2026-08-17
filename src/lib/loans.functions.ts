import { callRpc } from "@/lib/rpc";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { buildLoan, Frequencia } from "@/finance";
import { calculateDueDate } from "@/finance/calculate-due-date";
const loanInputSchema = z.object({
  client_id: z.string().uuid(),
  capital_cents: z.number().int().positive(),
  frequency: z.enum(["diario", "semanal", "quinzenal", "mensal"]),
  installments_count: z.number().int().positive(),
  employee_profit_input: z.number().nonnegative(),
  employee_profit_kind: z.enum(["fixo", "percentual"]),
  start_date: z.string(),
  notes: z.string().optional().nullable(),
  apply_interest_composition: z.boolean().optional(),
});

const buildTerms = (data: z.infer<typeof loanInputSchema>) => {
  const calculated = buildLoan({
    capitalCents: data.capital_cents,
    frequencia: data.frequency as Frequencia,
    lucroFuncionario:
      data.employee_profit_kind === "fixo"
        ? { tipo: "fixo", valor: Math.round(data.employee_profit_input * 100) }
        : { tipo: "percentual", valor: data.employee_profit_input / 100 },
    qtdParcelas: data.installments_count,
    applyInterestComposition: data.apply_interest_composition,
    startDate: new Date(data.start_date),
  });

  const startDate = new Date(data.start_date);
  const installments = calculated.parcelas.map((p) => {
    const principal = Math.round(p.valorCents * (calculated.capitalCents / calculated.totalCents));
    const fr = Math.round(p.valorCents * (calculated.lucroFrCents / calculated.totalCents));
    return {
      number: p.numero,
      due_date: calculateDueDate(startDate, p.numero, data.frequency).toISOString().slice(0, 10),
      principal_amount: principal,
      fr_profit_amount: fr,
      employee_profit_amount: p.valorCents - principal - fr,
      total_amount: p.valorCents,
    };
  });

  return {
    principal_amount: calculated.capitalCents,
    fr_profit_amount: installments.reduce((a, i) => a + i.fr_profit_amount, 0),
    employee_profit_amount: installments.reduce((a, i) => a + i.employee_profit_amount, 0),
    total_amount: calculated.totalCents,
    installments_count: data.installments_count,
    frequency: data.frequency,
    start_date: data.start_date,
    fr_rate: calculated.taxaFr,
    employee_profit_kind: data.employee_profit_kind,
    employee_profit_input: data.employee_profit_input,
    installments,
  };
};

export const requestLoanApproval = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) =>
    loanInputSchema
      .extend({ idempotency_key: z.string().min(8), reason: z.string().trim().optional() })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    // Sem INSERT direto: a RPC valida ator, escopo, termos e idempotência.
    const loan = await callRpc<{ id: string; approval_status: string }>(
      context.supabase,
      "request_loan_approval",
      {
        p_client_id: data.client_id,
        p_terms: buildTerms(data),
        p_reason: data.reason ?? data.notes ?? null,
        p_idempotency_key: data.idempotency_key,
      },
    );
    return { id: loan.id, approval_status: loan.approval_status };
  });

export const decideLoanApproval = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) =>
    z
      .object({
        loan_id: z.string().uuid(),
        decision: z.enum(["approved", "rejected"]),
        reason: z.string().optional(),
      })
      .superRefine((v, ctx) => {
        if (v.decision === "rejected" && (v.reason ?? "").trim().length < 5) {
          ctx.addIssue({
            code: "custom",
            message: "Rejeição exige justificativa (mínimo 5 caracteres).",
          });
        }
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    // Decisão atômica no banco: sem autoaprovação, escopo respeitado e parcelas geradas uma única vez.
    await callRpc(context.supabase, "decide_loan_approval", {
      p_loan_id: data.loan_id,
      p_decision: data.decision,
      p_reason: data.reason ?? null,
    });
    return { success: true };
  });

// REMOVIDO: createLoan (INSERT direto em loans/installments sem aprovação).
// Toda criação de contrato passa por requestLoanApproval + decideLoanApproval (RPCs atômicas).

export const getLoans = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data, error } = await supabase
      .from("loans")
      .select("*, clients(full_name, employees(full_name)), installments(*)")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[getLoans] Error fetching loans:", error);
      throw error;
    }

    // 'loans' não tem FK direta para 'employees' (a FK é composta via clients).
    // Normalizamos o nome do responsável a partir do cliente.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (data ?? []).map((loan: any) => ({
      ...loan,
      employees: loan.clients?.employees ?? null,
    }));
  });

export const deleteLoan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) =>
    z
      .object({
        loan_id: z.string().uuid(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    await callRpc(context.supabase, "delete_loan_cascade", {
      p_loan_id: data.loan_id,
    });
    return { success: true };
  });
