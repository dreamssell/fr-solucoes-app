/**
 * Motor financeiro puro do FR Financeiro.
 * Sem dependência de UI e sem acesso ao banco.
 * Todos os valores monetários são inteiros em CENTAVOS (nunca float).
 */

import { calculateDueDate } from "./calculate-due-date";

export type Frequencia = "diario" | "semanal" | "quinzenal" | "mensal";

export const FR_DEFAULT_RATES: Record<Frequencia, number> = {
  diario: 0.12,
  semanal: 0.2,
  quinzenal: 0.3,
  mensal: 0.3,
};

export type LucroFuncionario =
  { tipo: "percentual"; valor: number } | { tipo: "fixo"; valor: number };

export interface ComponentesFinanceiros {
  capitalCents: number;
  lucroFrCents: number;
  lucroFuncionarioCents: number;
}

export interface ParcelaCalculada {
  numero: number;
  valorCents: number;
}

export type LucroFr =
  { tipo: "percentual"; valor: number } | { tipo: "fixo"; valor: number };

export interface LoanInput {
  capitalCents: number;
  frequencia: Frequencia;
  lucroFuncionario: LucroFuncionario;
  qtdParcelas: number;
  /** Taxa excepcional da FR para este empréstimo (fração, ex.: 0.15). */
  taxaFrExcepcional?: number;
  applyInterestComposition?: boolean;
  startDate?: Date;
  lucroFr?: LucroFr;
}

export interface LoanCalculado {
  capitalCents: number;
  frequencia: Frequencia;
  taxaFr: number;
  lucroFrCents: number;
  lucroFuncionarioCents: number;
  totalCents: number;
  qtdParcelas: number;
  parcelas: ParcelaCalculada[];
}

function assertCents(value: number, label: string): void {
  if (!Number.isFinite(value) || !Number.isInteger(value)) {
    throw new Error(`${label} deve ser um inteiro em centavos`);
  }
  if (value < 0) throw new Error(`${label} não pode ser negativo`);
}

function assertRate(rate: number, label: string): void {
  if (!Number.isFinite(rate) || rate < 0) {
    throw new Error(`${label} inválida`);
  }
}

export function frProfitCents(
  capitalCents: number,
  frequencia: Frequencia,
  taxaExcepcional?: number,
): number {
  assertCents(capitalCents, "capital");
  const taxa = taxaExcepcional ?? FR_DEFAULT_RATES[frequencia];
  if (taxa === undefined) throw new Error("frequência inválida");
  assertRate(taxa, "taxa da FR");
  return Math.round(capitalCents * taxa);
}

export function employeeProfitCents(capitalCents: number, lucro: LucroFuncionario): number {
  assertCents(capitalCents, "capital");
  if (!Number.isFinite(lucro.valor) || lucro.valor < 0) {
    throw new Error("lucro do funcionário não pode ser negativo");
  }
  if (lucro.tipo === "percentual") return Math.round(capitalCents * lucro.valor);
  assertCents(lucro.valor, "lucro fixo do funcionário");
  return lucro.valor;
}

export function splitInstallments(totalCents: number, qtdParcelas: number): ParcelaCalculada[] {
  assertCents(totalCents, "total");
  if (!Number.isInteger(qtdParcelas) || qtdParcelas < 1) {
    throw new Error("quantidade de parcelas deve ser >= 1");
  }
  const base = Math.floor(totalCents / qtdParcelas);
  const parcelas: ParcelaCalculada[] = [];
  for (let i = 1; i < qtdParcelas; i += 1) {
    parcelas.push({ numero: i, valorCents: base });
  }
  // Ajuste de centavos somente na última parcela.
  parcelas.push({ numero: qtdParcelas, valorCents: totalCents - base * (qtdParcelas - 1) });
  return parcelas;
}

export function buildLoan(input: LoanInput): LoanCalculado {
  assertCents(input.capitalCents, "capital");
  if (!Number.isInteger(input.qtdParcelas) || input.qtdParcelas < 1) {
    throw new Error("quantidade de parcelas deve ser >= 1");
  }

  const lucroFuncionarioCents = employeeProfitCents(input.capitalCents, input.lucroFuncionario);

  let lucroFrCents = 0;
  let taxaFr = 0;

  if (input.lucroFr) {
    if (input.lucroFr.tipo === "percentual") {
      lucroFrCents = Math.round(input.capitalCents * input.lucroFr.valor);
      taxaFr = input.lucroFr.valor;
    } else {
      assertCents(input.lucroFr.valor, "lucro fixo da FR");
      lucroFrCents = input.lucroFr.valor;
      taxaFr = input.capitalCents > 0 ? (lucroFrCents / input.capitalCents) : 0;
    }
  } else {
    taxaFr = input.taxaFrExcepcional ?? FR_DEFAULT_RATES[input.frequencia];
    if (taxaFr === undefined) throw new Error("frequência inválida");

    const totalProfitCents = Math.round(input.capitalCents * taxaFr);
    lucroFrCents = totalProfitCents - lucroFuncionarioCents;
  }

  const totalCents = input.capitalCents + lucroFrCents + lucroFuncionarioCents;

  return {
    capitalCents: input.capitalCents,
    frequencia: input.frequencia,
    taxaFr,
    lucroFrCents,
    lucroFuncionarioCents,
    totalCents,
    qtdParcelas: input.qtdParcelas,
    parcelas: splitInstallments(totalCents, input.qtdParcelas),
  };
}

/**
 * Aloca um pagamento (integral ou parcial) proporcionalmente entre capital,
 * lucro FR e lucro do funcionário. Usa maior resto para conservar o total.
 */
export function allocatePayment(
  valorCents: number,
  saldo: ComponentesFinanceiros,
): ComponentesFinanceiros {
  assertCents(valorCents, "valor do pagamento");
  assertCents(saldo.capitalCents, "saldo de capital");
  assertCents(saldo.lucroFrCents, "saldo de lucro FR");
  assertCents(saldo.lucroFuncionarioCents, "saldo de lucro do funcionário");

  const total = saldo.capitalCents + saldo.lucroFrCents + saldo.lucroFuncionarioCents;
  if (valorCents > total) throw new Error("pagamento maior que o saldo devedor");
  if (total === 0) return { capitalCents: 0, lucroFrCents: 0, lucroFuncionarioCents: 0 };

  const pesos = [saldo.capitalCents, saldo.lucroFrCents, saldo.lucroFuncionarioCents];
  const exatos = pesos.map((p) => (valorCents * p) / total);
  const base = exatos.map((v) => Math.floor(v));
  let resto = valorCents - base.reduce((a, b) => a + b, 0);
  const ordem = exatos
    .map((v, i) => ({ i, frac: v - Math.floor(v) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (const { i } of ordem) {
    if (resto <= 0) break;
    const current = base[i];
    if (current !== undefined) {
      base[i] = current + 1;
      resto -= 1;
    }
  }
  return {
    capitalCents: base[0] ?? 0,
    lucroFrCents: base[1] ?? 0,
    lucroFuncionarioCents: base[2] ?? 0,
  };
}

/** Multa recebida: 50% FR e 50% funcionário; centavo ímpar fica com a FR. */
export function splitPenalty(multaCents: number): { frCents: number; funcionarioCents: number } {
  assertCents(multaCents, "multa");
  const funcionarioCents = Math.floor(multaCents / 2);
  return { frCents: multaCents - funcionarioCents, funcionarioCents };
}

export interface SaldoEmAberto {
  capitalEmAbertoCents: number;
  lucroFrEmAbertoCents: number;
  lucroFuncionarioEmAbertoCents: number;
}

/** Prejuízo definitivo: o funcionário só assume o capital perdido. */
export function employeeDebtFromLoss(saldo: SaldoEmAberto): number {
  assertCents(saldo.capitalEmAbertoCents, "capital em aberto");
  assertCents(saldo.lucroFrEmAbertoCents, "lucro FR em aberto");
  assertCents(saldo.lucroFuncionarioEmAbertoCents, "lucro do funcionário em aberto");
  return saldo.capitalEmAbertoCents;
}
