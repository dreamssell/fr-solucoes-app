/**
/**
 * Utilitários de data e fuso horário para o FR Financeiro.
 * Centraliza o tratamento de datas em UTC e fuso de Brasília (UTC-3).
 */

/** Retorna a data atual ou de um objeto no formato YYYY-MM-DD local (America/Sao_Paulo). */
export function getLocalDateString(date: Date = new Date()): string {
  // Ajusta para o fuso de Brasília (UTC-3)
  const utc = date.getTime() + date.getTimezoneOffset() * 60000;
  const brasiliaDate = new Date(utc + 3600000 * -3);
  
  const y = brasiliaDate.getFullYear();
  const m = String(brasiliaDate.getMonth() + 1).padStart(2, "0");
  const d = String(brasiliaDate.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Formata uma data local no formato YYYY-MM-DD sem deslocamento UTC. */
export function formatLocalDateISO(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Compara se duas datas ISO são iguais considerando apenas o dia. */
export function isSameDay(isoA: string, isoB: string): boolean {
  return (isoA || "").split("T")[0] === (isoB || "").split("T")[0];
}
