/**
 * Agregações reais do FR Financeiro.
 * Todas as funções operam em centavos (inteiros) e sobre linhas vindas do banco.
 * Nenhum dado fictício é utilizado aqui.
 */

export type InstallmentRow = {
  id: string;
  number: number;
  due_date: string;
  total_amount: number;
  paid_amount: number;
  outstanding_amount: number;
  penalty_amount: number;
  principal_amount: number;
  fr_profit_amount: number;
  employee_profit_amount: number;
  status: string;
};

export type LoanRow = {
  id: string;
  client_id: string;
  employee_id: string;
  principal_amount: number;
  total_amount: number;
  employee_profit_amount: number;
  fr_profit_amount: number;
  status: string;
  installments_count?: number;
  start_date?: string;
  frequency?: string;
  clients?: { id?: string; full_name: string; phone?: string | null } | null;
  employees?: { id?: string; full_name: string } | null;
  installments?: InstallmentRow[];
};

export type PaymentRow = {
  id: string;
  employee_id: string;
  client_id: string;
  installment_id: string;
  amount: number;
  penalty_amount: number;
  paid_at: string;
  status: string;
  kind?: string;
  method?: string | null;
  installments?: (InstallmentRow & { loans?: LoanRow | null }) | null;
  clients?: { id?: string; full_name: string; phone?: string | null } | null;
  employees?: { id?: string; full_name: string } | null;
};

export const toDay = (iso: string) => (iso || "").split("T")[0] ?? "";

/** Status real do banco: enum employee_status = 'ativo' | 'inativo'. */
export const isEmployeeActive = (status: string | null | undefined) => status === "ativo";

export function countClientsByEmployee(clients: { employee_id: string }[]): Record<string, number> {
  const map: Record<string, number> = {};
  for (const c of clients) map[c.employee_id] = (map[c.employee_id] ?? 0) + 1;
  return map;
}

export function flattenInstallments(loans: LoanRow[]) {
  return loans.flatMap((loan) =>
    (loan.installments ?? []).map((inst) => ({
      ...inst,
      loan,
      client: loan.clients ?? null,
      employee: loan.employees ?? null,
      employee_id: loan.employee_id,
      client_id: loan.client_id,
    })),
  );
}

export type FlatInstallment = ReturnType<typeof flattenInstallments>[number];

export const isSettled = (status: string) => status === "pago" || status === "renegociado";

export type Indicators = {
  capitalEmprestadoCents: number;
  capitalRecuperadoCents: number;
  capitalAbertoCents: number;
  lucroContratadoCents: number;
  lucroRealizadoCents: number;
  lucroAbertoCents: number;
  multasRecebidasCents: number;
  saldoTotalReceberCents: number;
  parcelasVencidas: number;
  cobrancasHoje: number;
  contratosAtivos: number;
};

export function computeIndicators(
  loans: LoanRow[],
  payments: PaymentRow[],
  today: string,
): Indicators {
  const insts = flattenInstallments(loans);
  const activeLoans = loans.filter((l) => l.status !== "cancelado" && l.status !== "rascunho");
  const confirmedPayments = payments.filter((p) => p.status !== "estornado");

  const capitalEmprestadoCents = activeLoans.reduce((s, l) => s + l.principal_amount, 0);
  const lucroContratadoCents = activeLoans.reduce(
    (s, l) => s + l.fr_profit_amount + l.employee_profit_amount,
    0,
  );

  // Capital Recuperado: proporcional ao que foi pago nas parcelas
  const capitalRecuperadoCents = insts.reduce((s, i) => {
    if (i.total_amount <= 0) return s;
    return s + Math.round((i.paid_amount * i.principal_amount) / i.total_amount);
  }, 0);

  // Capital Aberto: O que sobra do principal original
  const capitalAbertoCents = capitalEmprestadoCents - capitalRecuperadoCents;

  const multasRecebidasCents = confirmedPayments.reduce((s, p) => s + (p.penalty_amount || 0), 0);

  // Lucro Realizado: Parte paga que não é capital
  const lucroRealizadoCents = insts.reduce((s, i) => {
    if (i.total_amount <= 0) return s;
    const capRec = Math.round((i.paid_amount * i.principal_amount) / i.total_amount);
    return s + (i.paid_amount - capRec);
  }, 0);

  const lucroAbertoCents = lucroContratadoCents - lucroRealizadoCents;
  const saldoTotalReceberCents = insts.reduce((s, i) => s + i.outstanding_amount, 0);

  const parcelasVencidas = insts.filter(
    (i) => !isSettled(i.status) && toDay(i.due_date) < today,
  ).length;

  const cobrancasHoje = insts.filter(
    (i) => !isSettled(i.status) && toDay(i.due_date) === today,
  ).length;

  return {
    capitalEmprestadoCents,
    capitalRecuperadoCents,
    capitalAbertoCents,
    lucroContratadoCents,
    lucroRealizadoCents,
    lucroAbertoCents,
    multasRecebidasCents,
    saldoTotalReceberCents,
    parcelasVencidas,
    cobrancasHoje,
    contratosAtivos: loans.filter((l) => l.status === "ativo").length,
  };
}

/** Recebimentos agrupados por dia, para o gráfico do dashboard. */
export function dailyReceipts(payments: PaymentRow[], days: string[]) {
  return days.map((dia) => ({
    dia,
    valorCents: payments
      .filter((p) => p.status !== "estornado" && toDay(p.paid_at) === dia)
      .reduce((s, p) => s + p.amount + (p.penalty_amount || 0), 0),
  }));
}

export function lastDays(today: string, count: number): string[] {
  const base = new Date(`${today}T12:00:00`);
  const out: string[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(base);
    d.setDate(d.getDate() - i);
    out.push(d.toISOString().split("T")[0] as string);
  }
  return out;
}

export type SettlementLine = {
  paymentId: string;
  clientId: string;
  clientName: string;
  parcela: number;
  data: string;
  recebidoCents: number;
  multaCents: number;
};

export type Settlement = {
  linhas: SettlementLine[];
  totalRecebidoCents: number;
  totalMultasCents: number;
  capitalRecuperadoCents: number;
  lucroFrCents: number;
  lucroFuncionarioCents: number;
  multaFrCents: number;
  multaFuncionarioCents: number;
  brutoCents: number; // Agora representa o lucro total do funcionário (comissão + metade da multa)
  naoPagoCents: number;
};

/** Acerto de um funcionário no período [start, end] (datas AAAA-MM-DD, inclusivas). */
export function buildSettlement(
  payments: PaymentRow[],
  loans: LoanRow[],
  employeeId: string,
  start: string,
  end: string,
  penaltySplitPercent: number = 50,
): Settlement {
  const statusFilter = (p: PaymentRow) =>
    p.status !== "estornado" &&
    p.employee_id === employeeId &&
    toDay(p.paid_at) >= start &&
    toDay(p.paid_at) <= end;

  const linhas: SettlementLine[] = payments
    .filter(statusFilter)
    .map((p) => ({
      paymentId: p.id,
      clientId: p.client_id,
      clientName: p.installments?.loans?.clients?.full_name ?? "Cliente",
      parcela: p.installments?.number ?? 0,
      data: toDay(p.paid_at),
      recebidoCents: p.amount,
      multaCents: p.penalty_amount || 0,
    }));

  const totalRecebidoCents = linhas.reduce((s, l) => s + l.recebidoCents, 0);
  const totalMultasCents = linhas.reduce((s, l) => s + l.multaCents, 0);

  // Cálculo detalhado da composição
  let capitalRecuperadoCents = 0;
  let lucroFrCents = 0;
  let lucroFuncionarioCents = 0;

  payments
    .filter(statusFilter)
    .forEach((p) => {
      const inst = p.installments;
      if (!inst || inst.total_amount <= 0) return;

      // Proporção do pagamento em relação ao total da parcela
      const ratio = p.amount / inst.total_amount;
      capitalRecuperadoCents += Math.round(inst.principal_amount * ratio);
      lucroFrCents += Math.round(inst.fr_profit_amount * ratio);
      lucroFuncionarioCents += Math.round(inst.employee_profit_amount * ratio);
    });

  const ratioEmp = penaltySplitPercent / 100;
  const multaFuncionarioCents = Math.round(totalMultasCents * ratioEmp);
  const multaFrCents = totalMultasCents - multaFuncionarioCents;

  const naoPagoCents = flattenInstallments(loans)
    .filter(
      (i) =>
        i.employee_id === employeeId &&
        !isSettled(i.status) &&
        toDay(i.due_date) >= start &&
        toDay(i.due_date) <= end,
    )
    .reduce((s, i) => s + i.outstanding_amount, 0);

  return {
    linhas,
    totalRecebidoCents,
    totalMultasCents,
    capitalRecuperadoCents,
    lucroFrCents,
    lucroFuncionarioCents,
    multaFrCents,
    multaFuncionarioCents,
    brutoCents: lucroFuncionarioCents + multaFuncionarioCents,
    naoPagoCents,
  };
}

/** Semana corrente (quarta a terça não importa: usamos domingo→sábado). */
export function currentWeek(today: string): { start: string; end: string } {
  const base = new Date(`${today}T12:00:00`);
  const start = new Date(base);
  start.setDate(base.getDate() - base.getDay());
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return {
    start: start.toISOString().split("T")[0] as string,
    end: end.toISOString().split("T")[0] as string,
  };
}
