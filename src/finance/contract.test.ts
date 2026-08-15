import { describe, it, expect } from "vitest";
import { allocatePayment, buildLoan } from "./index";

describe("Finance Engine - Fixed Loan Contract Validation", () => {
  it("should validate the exact components of a R$ 142.000,00 loan", () => {
    // 142k total = 100k capital + 12k FR + 30k Func
    // Em centavos:
    const capital = 10000000;
    const lucroFunc = 3000000;
    const taxaFr = 0.12;

    const loan = buildLoan({
      capitalCents: capital,
      frequencia: "diario",
      lucroFuncionario: { tipo: "fixo", valor: lucroFunc },
      qtdParcelas: 8,
      taxaFrExcepcional: taxaFr,
    });

    // Validating totals
    expect(loan.capitalCents).toBe(10000000); // R$ 100.000,00
    expect(loan.lucroFrCents).toBe(1200000); // R$ 12.000,00
    expect(loan.lucroFuncionarioCents).toBe(3000000); // R$ 30.000,00
    expect(loan.totalCents).toBe(14200000); // R$ 142.000,00

    // Each installment: 142.000 / 8 = 17.750,00
    const expectedParcela = 1775000;
    loan.parcelas.forEach((p) => {
      expect(p.valorCents).toBe(expectedParcela);

      const breakdown = allocatePayment(p.valorCents, {
        capitalCents: loan.capitalCents,
        lucroFrCents: loan.lucroFrCents,
        lucroFuncionarioCents: loan.lucroFuncionarioCents,
      });

      // Per installment (exact division):
      // Capital: 12.500,00 -> 1.250.000
      // FR: 1.500,00 -> 150.000
      // Func: 3.750,00 -> 375.000
      expect(breakdown.capitalCents).toBe(1250000);
      expect(breakdown.lucroFrCents).toBe(150000);
      expect(breakdown.lucroFuncionarioCents).toBe(375000);
    });
  });
});
