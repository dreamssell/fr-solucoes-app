/**
 * Termos propostos de renegociação (puro, em centavos).
 * Nada aqui altera o contrato original: apenas descreve a proposta que será
 * avaliada e, se aprovada, materializada pela RPC decide_loan_renegotiation.
 */
import { buildLoan, type Frequencia } from "@/finance";
import { calculateDueDate } from "@/finance/calculate-due-date";

export type RenegotiationInput = {
  capitalCents: number;
  frequency: Frequencia | string;
  installmentsCount: number;
  employeeProfitKind: "fixo" | "percentual";
  /** Reais quando fixo, percentual (ex.: 20 = 20%) quando percentual. */
  employeeProfitInput: number;
  /** ISO yyyy-mm-dd */
  startDate: string;
};

export type ProposedInstallment = {
  number: number;
  due_date: string;
  principal_amount: number;
  fr_profit_amount: number;
  employee_profit_amount: number;
  total_amount: number;
};

export type ProposedTerms = {
  frequency: string;
  installments_count: number;
  start_date: string;
  principal_amount: number;
  fr_rate: number;
  fr_profit_amount: number;
  employee_profit_kind: "fixo" | "percentual";
  employee_profit_input: number;
  employee_profit_amount: number;
  total_amount: number;
  installments: ProposedInstallment[];
};

const isoDay = (d: Date) => d.toISOString().slice(0, 10);

export function buildRenegotiationTerms(input: RenegotiationInput): ProposedTerms {
  const calculated = buildLoan({
    capitalCents: input.capitalCents,
    frequencia: input.frequency as Frequencia,
    lucroFuncionario:
      input.employeeProfitKind === "fixo"
        ? { tipo: "fixo", valor: Math.round(input.employeeProfitInput * 100) }
        : { tipo: "percentual", valor: input.employeeProfitInput / 100 },
    qtdParcelas: input.installmentsCount,
  });

  const start = new Date(`${input.startDate}T00:00:00.000Z`);

  const installments: ProposedInstallment[] = calculated.parcelas.map((p) => ({
    number: p.numero,
    due_date: isoDay(calculateDueDate(start, p.numero, String(input.frequency))),
    principal_amount: Math.round(p.valorCents * (calculated.capitalCents / calculated.totalCents)),
    fr_profit_amount: Math.round(p.valorCents * (calculated.lucroFrCents / calculated.totalCents)),
    employee_profit_amount: Math.round(
      p.valorCents * (calculated.lucroFuncionarioCents / calculated.totalCents),
    ),
    total_amount: p.valorCents,
  }));

  return {
    frequency: String(input.frequency),
    installments_count: input.installmentsCount,
    start_date: input.startDate,
    principal_amount: calculated.capitalCents,
    fr_rate: calculated.taxaFr,
    fr_profit_amount: calculated.lucroFrCents,
    employee_profit_kind: input.employeeProfitKind,
    employee_profit_input: input.employeeProfitInput,
    employee_profit_amount: calculated.lucroFuncionarioCents,
    total_amount: calculated.totalCents,
    installments,
  };
}
