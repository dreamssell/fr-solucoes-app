const DAY_MS = 24 * 60 * 60 * 1000;

function daysInMonthUTC(year: number, monthIndex: number): number {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

/**
 * Calcula o vencimento de uma parcela em UTC.
 * Mensal: mantém o dia âncora (29/30/31) e faz clamp para o último dia
 * do mês de destino (fevereiro comum/bissexto), sem nunca pular de mês.
 */
export function calculateDueDate(
  startDate: Date,
  installmentNumber: number,
  frequency: string,
): Date {
  const base = startDate.getTime();

  if (frequency === "diario") return new Date(base + installmentNumber * DAY_MS);
  if (frequency === "semanal") return new Date(base + installmentNumber * 7 * DAY_MS);
  if (frequency === "quinzenal") return new Date(base + installmentNumber * 15 * DAY_MS);

  if (frequency === "mensal") {
    const year = startDate.getUTCFullYear();
    const month = startDate.getUTCMonth();
    const day = startDate.getUTCDate();

    const targetMonthAbs = month + installmentNumber;
    const targetYear = year + Math.floor(targetMonthAbs / 12);
    const targetMonth = ((targetMonthAbs % 12) + 12) % 12;
    const targetDay = Math.min(day, daysInMonthUTC(targetYear, targetMonth));

    return new Date(
      Date.UTC(
        targetYear,
        targetMonth,
        targetDay,
        startDate.getUTCHours(),
        startDate.getUTCMinutes(),
        startDate.getUTCSeconds(),
        startDate.getUTCMilliseconds(),
      ),
    );
  }

  return new Date(base);
}
