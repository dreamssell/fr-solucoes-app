import { describe, it, expect } from "vitest";
import { allocatePayment, buildLoan } from "./index";

describe("Finance Engine - Fixed Loan Contract Validation", () => {
  it("should validate the exact components of a R$ 112.000,00 loan", () => {
    // 112k total = 100k capital + 12k interest (FR net: 9k, Func: 3k)
    // Em centavos:
    const capital = 10000000;
    const lucroFunc = 300000;
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
    expect(loan.lucroFrCents).toBe(900000); // R$ 9.000,00
    expect(loan.lucroFuncionarioCents).toBe(300000); // R$ 3.000,00
    expect(loan.totalCents).toBe(11200000); // R$ 112.000,00

    // Each installment: 112.000 / 8 = 14.000,00
    const expectedParcela = 1400000;
    loan.parcelas.forEach((p) => {
      expect(p.valorCents).toBe(expectedParcela);

      const breakdown = allocatePayment(p.valorCents, {
        capitalCents: loan.capitalCents,
        lucroFrCents: loan.lucroFrCents,
        lucroFuncionarioCents: loan.lucroFuncionarioCents,
      });

      // Per installment (exact division):
      // Capital: 1.250.000
      // FR: 112.500
      // Func: 37.500
      expect(breakdown.capitalCents).toBe(1250000);
      expect(breakdown.lucroFrCents).toBe(112500);
      expect(breakdown.lucroFuncionarioCents).toBe(37500);
    });
  });
});
