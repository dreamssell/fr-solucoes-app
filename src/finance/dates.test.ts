import { describe, it, expect } from "vitest";
import { calculateDueDate } from "./calculate-due-date";

// Datas de contrato chegam como 'YYYY-MM-DD' (meia-noite UTC).
const start = (iso: string) => new Date(iso);
const ymd = (d: Date) => d.toISOString().slice(0, 10);

describe("Cálculo de Datas de Vencimento", () => {
  it("31/01 -> fevereiro bissexto (29)", () => {
    expect(ymd(calculateDueDate(start("2024-01-31"), 1, "mensal"))).toBe("2024-02-29");
  });

  it("31/01 -> fevereiro comum (28)", () => {
    expect(ymd(calculateDueDate(start("2023-01-31"), 1, "mensal"))).toBe("2023-02-28");
  });

  it("29/01 -> fevereiro comum (28) e bissexto (29)", () => {
    expect(ymd(calculateDueDate(start("2023-01-29"), 1, "mensal"))).toBe("2023-02-28");
    expect(ymd(calculateDueDate(start("2024-01-29"), 1, "mensal"))).toBe("2024-02-29");
  });

  it("30/01 -> fevereiro (clamp) sem pular mês", () => {
    expect(ymd(calculateDueDate(start("2024-01-30"), 1, "mensal"))).toBe("2024-02-29");
    expect(ymd(calculateDueDate(start("2023-01-30"), 1, "mensal"))).toBe("2023-02-28");
  });

  it("31/03 -> abril (30 dias)", () => {
    expect(ymd(calculateDueDate(start("2024-03-31"), 1, "mensal"))).toBe("2024-04-30");
  });

  it("não pula meses em sequência a partir do dia 31", () => {
    const s = start("2024-01-31");
    const meses = [1, 2, 3, 4, 5, 6].map((n) => ymd(calculateDueDate(s, n, "mensal")));
    expect(meses).toEqual([
      "2024-02-29",
      "2024-03-31",
      "2024-04-30",
      "2024-05-31",
      "2024-06-30",
      "2024-07-31",
    ]);
  });

  it("mantém o dia âncora após meses curtos (29/30/31)", () => {
    expect(ymd(calculateDueDate(start("2024-08-31"), 2, "mensal"))).toBe("2024-10-31");
    expect(ymd(calculateDueDate(start("2024-01-31"), 13, "mensal"))).toBe("2025-02-28");
    expect(ymd(calculateDueDate(start("2024-12-31"), 2, "mensal"))).toBe("2025-02-28");
  });

  it("fim de ano e viradas de ano", () => {
    expect(ymd(calculateDueDate(start("2024-12-31"), 1, "mensal"))).toBe("2025-01-31");
    expect(ymd(calculateDueDate(start("2024-02-29"), 12, "mensal"))).toBe("2025-02-28");
  });

  it("frequências diária, semanal e quinzenal preservam o dia UTC e diária pula domingos", () => {
    expect(ymd(calculateDueDate(start("2024-01-31"), 1, "diario"))).toBe("2024-02-01"); // Quarta -> Quinta
    expect(ymd(calculateDueDate(start("2024-02-03"), 1, "diario"))).toBe("2024-02-05"); // Sábado -> Segunda (pula Domingo 2024-02-04)
    expect(ymd(calculateDueDate(start("2024-02-03"), 2, "diario"))).toBe("2024-02-06"); // Sábado -> Terça (pula Domingo 2024-02-04)
    expect(ymd(calculateDueDate(start("2024-01-31"), 2, "semanal"))).toBe("2024-02-14");
    expect(ymd(calculateDueDate(start("2024-01-31"), 1, "quinzenal"))).toBe("2024-02-15");
  });
});
