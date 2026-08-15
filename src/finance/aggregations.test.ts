import { describe, it, expect } from "vitest";
import {
  isEmployeeActive,
  countClientsByEmployee,
  computeIndicators,
  buildSettlement,
  dailyReceipts,
  lastDays,
  currentWeek,
  flattenInstallments,
  type LoanRow,
  type PaymentRow,
} from "./aggregations";

const inst = (over: Record<string, unknown> = {}) => ({
  id: "i1",
  number: 1,
  due_date: "2026-08-05",
  total_amount: 100000,
  paid_amount: 0,
  outstanding_amount: 100000,
  penalty_amount: 0,
  principal_amount: 62500,
  fr_profit_amount: 12500,
  employee_profit_amount: 25000,
  status: "pendente",
  ...over,
});

const loan: LoanRow = {
  id: "l1",
  client_id: "c1",
  employee_id: "e1",
  principal_amount: 100000,
  total_amount: 160000,
  employee_profit_amount: 40000,
  fr_profit_amount: 20000,
  status: "ativo",
  clients: { full_name: "Cliente Teste" },
  employees: { full_name: "Funcionário Teste" },
  installments: [
    inst({
      id: "i1",
      number: 1,
      due_date: "2026-08-04",
      status: "pago",
      paid_amount: 80000,
      outstanding_amount: 0,
      total_amount: 80000,
      principal_amount: 50000,
      fr_profit_amount: 10000,
      employee_profit_amount: 20000,
    }),
    inst({
      id: "i2",
      number: 2,
      due_date: "2026-08-05",
      total_amount: 80000,
      outstanding_amount: 80000,
      principal_amount: 50000,
      fr_profit_amount: 10000,
      employee_profit_amount: 20000,
    }),
  ],
};

const payment: PaymentRow = {
  id: "p1",
  employee_id: "e1",
  client_id: "c1",
  installment_id: "i1",
  amount: 80000,
  penalty_amount: 1000,
  paid_at: "2026-08-04",
  status: "confirmado",
  installments: {
    ...inst({
      id: "i1",
      number: 1,
      total_amount: 80000,
      principal_amount: 50000,
      fr_profit_amount: 10000,
      employee_profit_amount: 20000,
    }),
    loans: loan,
  } as unknown as NonNullable<PaymentRow["installments"]>,
};

describe("status do funcionário", () => {
  it("usa o enum real do banco", () => {
    expect(isEmployeeActive("ativo")).toBe(true);
    expect(isEmployeeActive("active")).toBe(false);
    expect(isEmployeeActive("inativo")).toBe(false);
  });
});

describe("carteira por funcionário", () => {
  it("conta clientes reais", () => {
    expect(
      countClientsByEmployee([{ employee_id: "e1" }, { employee_id: "e1" }, { employee_id: "e2" }]),
    ).toEqual({ e1: 2, e2: 1 });
  });
});

describe("indicadores do dashboard", () => {
  const ind = computeIndicators([loan], [payment], "2026-08-05");

  it("zera tudo sem dados reais", () => {
    const vazio = computeIndicators([], [], "2026-08-05");
    expect(vazio.capitalEmprestadoCents).toBe(0);
    expect(vazio.capitalAbertoCents).toBe(0);
  });

  it("soma capital, aberto e recuperado", () => {
    expect(ind.capitalEmprestadoCents).toBe(100000);
    expect(ind.capitalRecuperadoCents).toBe(50000);
    expect(ind.capitalAbertoCents).toBe(50000);
  });

  it("calcula lucro realizado separado de multas", () => {
    expect(ind.lucroRealizadoCents).toBe(30000);
    expect(ind.multasRecebidasCents).toBe(1000);
  });

  it("conta vencidas e cobranças de hoje", () => {
    expect(ind.parcelasVencidas).toBe(0);
    expect(ind.cobrancasHoje).toBe(1);
    expect(ind.contratosAtivos).toBe(1);
  });

  it("achata parcelas com cliente e funcionário", () => {
    const flat = flattenInstallments([loan]);
    expect(flat).toHaveLength(2);
    expect(flat[0]!.client?.full_name).toBe("Cliente Teste");
  });
});

describe("gráfico de recebimentos", () => {
  it("agrupa por dia", () => {
    const days = lastDays("2026-08-05", 2);
    expect(days).toEqual(["2026-08-04", "2026-08-05"]);
    expect(dailyReceipts([payment], days)).toEqual([
      { dia: "2026-08-04", valorCents: 81000 },
      { dia: "2026-08-05", valorCents: 0 },
    ]);
  });
});

describe("acerto semanal real", () => {
  it("monta linhas somente de pagamentos reais do funcionário", () => {
    const s = buildSettlement([payment], [loan], "e1", "2026-08-02", "2026-08-08");
    expect(s.linhas).toHaveLength(1);
    expect(s.totalRecebidoCents).toBe(80000);
    expect(s.totalMultasCents).toBe(1000);
    // Lucro funcionário: 20.000 (do inst payload acima)
    // Multa funcionário: 500
    expect(s.brutoCents).toBe(20500);
    expect(s.naoPagoCents).toBe(80000);
  });

  it("retorna acerto zerado para funcionário sem movimento", () => {
    const s = buildSettlement([payment], [loan], "e2", "2026-08-02", "2026-08-08");
    expect(s.linhas).toHaveLength(0);
    expect(s.brutoCents).toBe(0);
    expect(s.naoPagoCents).toBe(0);
  });

  it("calcula a semana corrente", () => {
    expect(currentWeek("2026-08-05")).toEqual({ start: "2026-08-02", end: "2026-08-08" });
  });
});
