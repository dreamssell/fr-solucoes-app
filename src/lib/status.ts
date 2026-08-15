import type { StatusCobranca } from "@/data/demo";

/** Converte o status de parcela do banco no status visual usado pelo StatusPill. */
export function toPillStatus(status: string): StatusCobranca {
  if (status === "pago") return "recebido";
  if (status === "atrasado" || status === "prejuizo") return "atrasado";
  return "pendente";
}
