/** Helpers puros da rota /funcionarios (mantidos fora do componente para testes e Fast Refresh). */

export type FuncionariosSearch = { id: string | undefined };

export function parseFuncionariosSearch(search: Record<string, unknown>): FuncionariosSearch {
  const raw = search["id"];
  return { id: typeof raw === "string" && raw.trim() !== "" ? raw : undefined };
}

export function findEmployeeCard<T extends { id: string }>(
  cards: readonly T[],
  id: string | undefined,
): T | null {
  if (!id) return null;
  return cards.find((c) => c.id === id) ?? null;
}
