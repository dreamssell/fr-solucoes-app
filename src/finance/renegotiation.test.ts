import { describe, it, expect } from "vitest";
import { buildRenegotiationTerms } from "@/finance/renegotiation";

const original = {
  id: "loan-1",
  principal_amount: 100000,
  total_amount: 160000,
  frequency: "mensal",
  installments_count: 4,
} as const;

describe("buildRenegotiationTerms", () => {
  it("gera termos propostos sem mutar o contrato original", () => {
    const snapshot = JSON.stringify(original);
    const terms = buildRenegotiationTerms({
      capitalCents: 120000,
      frequency: "mensal",
      installmentsCount: 4,
      employeeProfitKind: "percentual",
      employeeProfitInput: 20,
      startDate: "2026-01-31",
    });
    expect(JSON.stringify(original)).toBe(snapshot);
    expect(terms.installments_count).toBe(4);
    expect(terms.installments).toHaveLength(4);
    expect(terms.total_amount).toBe(
      terms.principal_amount + terms.fr_profit_amount + terms.employee_profit_amount,
    );
  });

  it("soma das parcelas fecha com o total (arredondamento em centavos)", () => {
    const terms = buildRenegotiationTerms({
      capitalCents: 142000_00,
      frequency: "mensal",
      installmentsCount: 3,
      employeeProfitKind: "fixo",
      employeeProfitInput: 1000,
      startDate: "2026-01-31",
    });
    const soma = terms.installments.reduce((a, i) => a + i.total_amount, 0);
    expect(soma).toBe(terms.total_amount);
  });

  it("vencimentos mensais não pulam mês a partir de 31", () => {
    const terms = buildRenegotiationTerms({
      capitalCents: 100000,
      frequency: "mensal",
      installmentsCount: 3,
      employeeProfitKind: "fixo",
      employeeProfitInput: 100,
      startDate: "2026-01-31",
    });
    expect(terms.installments.map((i) => i.due_date)).toEqual([
      "2026-02-28",
      "2026-03-31",
      "2026-04-30",
    ]);
  });
});
