import { describe, it, expect } from "vitest";
import {
  buildLoan,
  employeeDebtFromLoss,
  splitInstallments,
  allocatePayment,
  splitPenalty,
} from "./index";

describe("FR Financeiro - Motor Financeiro (Etapa 4)", () => {
  describe("Cálculos Básicos", () => {
    it("deve calcular lucro da FR corretamente para 12% diário", () => {
      const loan = buildLoan({
        capitalCents: 100000,
        frequencia: "diario",
        lucroFuncionario: { tipo: "fixo", valor: 0 },
        qtdParcelas: 1,
      });
      expect(loan.lucroFrCents).toBe(12000);
      expect(loan.totalCents).toBe(112000);
    });

    it("deve calcular lucro da FR corretamente para 20% semanal", () => {
      const loan = buildLoan({
        capitalCents: 100000,
        frequencia: "semanal",
        lucroFuncionario: { tipo: "fixo", valor: 0 },
        qtdParcelas: 1,
      });
      expect(loan.lucroFrCents).toBe(20000);
    });

    it("deve calcular lucro da FR corretamente para 30% quinzenal", () => {
      const loan = buildLoan({
        capitalCents: 100000,
        frequencia: "quinzenal",
        lucroFuncionario: { tipo: "fixo", valor: 0 },
        qtdParcelas: 1,
      });
      expect(loan.lucroFrCents).toBe(30000);
    });

    it("deve calcular lucro da FR corretamente para 30% mensal", () => {
      const loan = buildLoan({
        capitalCents: 100000,
        frequencia: "mensal",
        lucroFuncionario: { tipo: "fixo", valor: 0 },
        qtdParcelas: 1,
      });
      expect(loan.lucroFrCents).toBe(30000);
    });

    it("deve suportar lucro do funcionário em percentual", () => {
      const loan = buildLoan({
        capitalCents: 100000,
        frequencia: "diario",
        lucroFuncionario: { tipo: "percentual", valor: 0.1 },
        qtdParcelas: 1,
      });
      expect(loan.lucroFuncionarioCents).toBe(10000);
      expect(loan.totalCents).toBe(122000);
    });
  });

  describe("Exemplo Obrigatório", () => {
    it("deve bater o exemplo: 1000 capital + 200 FR + 400 func = 1600 total", () => {
      const loan = buildLoan({
        capitalCents: 100000,
        frequencia: "semanal",
        lucroFuncionario: { tipo: "fixo", valor: 40000 },
        qtdParcelas: 1,
        taxaFrExcepcional: 0.2,
      });
      expect(loan.capitalCents).toBe(100000);
      expect(loan.lucroFrCents).toBe(20000);
      expect(loan.lucroFuncionarioCents).toBe(40000);
      expect(loan.totalCents).toBe(160000);
    });
  });

  describe("Periodicidade e Geração de Parcelas", () => {
    it("deve gerar parcelas diárias corretamente", () => {
      const loan = buildLoan({
        capitalCents: 100000,
        frequencia: "diario",
        lucroFuncionario: { tipo: "fixo", valor: 40000 },
        qtdParcelas: 5,
      });
      expect(loan.parcelas).toHaveLength(5);
      expect(loan.totalCents).toBe(152000);
    });

    it("deve ajustar centavos na última parcela", () => {
      const total = 100001;
      const parcelas = splitInstallments(total, 3);
      expect(parcelas[0]?.valorCents).toBe(33333);
      expect(parcelas[1]?.valorCents).toBe(33333);
      expect(parcelas[2]?.valorCents).toBe(33335);
    });
  });

  describe("Multas e Atrasos", () => {
    it("deve dividir multa 50/50 com ajuste para FR", () => {
      const split1 = splitPenalty(1000);
      expect(split1.frCents).toBe(500);
      expect(split1.funcionarioCents).toBe(500);

      const split2 = splitPenalty(1001);
      expect(split2.frCents).toBe(501);
      expect(split2.funcionarioCents).toBe(500);
    });
  });

  describe("Alocação de Pagamentos", () => {
    it("deve alocar pagamento parcial proporcionalmente", () => {
      const saldo = {
        capitalCents: 100000,
        lucroFrCents: 20000,
        lucroFuncionarioCents: 40000,
      };
      const pgto = 80000;
      const aloc = allocatePayment(pgto, saldo);
      expect(aloc.capitalCents).toBe(50000);
      expect(aloc.lucroFrCents).toBe(10000);
      expect(aloc.lucroFuncionarioCents).toBe(20000);
    });
  });

  describe("Prejuízo", () => {
    it("deve atribuir dívida ao funcionário apenas pelo capital", () => {
      const saldo = {
        capitalEmAbertoCents: 50000,
        lucroFrEmAbertoCents: 10000,
        lucroFuncionarioEmAbertoCents: 20000,
      };
      const divida = employeeDebtFromLoss(saldo);
      expect(divida).toBe(50000);
    });
  });

  describe("Rejeição de Valores Inválidos", () => {
    it("deve rejeitar capital negativo", () => {
      expect(() =>
        buildLoan({
          capitalCents: -100,
          frequencia: "diario",
          lucroFuncionario: { tipo: "fixo", valor: 0 },
          qtdParcelas: 1,
        }),
      ).toThrow();
    });

    it("deve rejeitar qtd parcelas < 1", () => {
      expect(() =>
        buildLoan({
          capitalCents: 1000,
          frequencia: "diario",
          lucroFuncionario: { tipo: "fixo", valor: 0 },
          qtdParcelas: 0,
        }),
      ).toThrow();
    });
  });
});
