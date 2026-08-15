import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseFuncionariosSearch, findEmployeeCard } from "./_authenticated/-funcionarios.helpers";

const SOURCE = readFileSync(
  resolve(process.cwd(), "src/routes/_authenticated/funcionarios.tsx"),
  "utf8",
);

/** Recorta o corpo do componente principal da rota. */
function componentBody(): string {
  const start = SOURCE.indexOf("function Funcionarios()");
  expect(start).toBeGreaterThan(-1);
  const nextFn = SOURCE.indexOf("\nfunction ", start + 10);
  return SOURCE.slice(start, nextFn === -1 ? SOURCE.length : nextFn);
}

describe("/funcionarios — ordem dos hooks", () => {
  it("não chama nenhum hook depois do retorno condicional de carregamento", () => {
    const body = componentBody();
    const earlyReturn = body.indexOf("if (isLoading)");
    expect(earlyReturn).toBeGreaterThan(-1);
    const afterEarlyReturn = body.slice(earlyReturn);
    const hooksDepois = afterEarlyReturn.match(/\buse[A-Z]\w*\s*\(/g) ?? [];
    expect(hooksDepois).toEqual([]);
  });

  it("não usa useMemo para efeito colateral de seleção (setSel)", () => {
    const body = componentBody();
    const memoBlocks = body.match(/useMemo\([\s\S]*?\}, \[[^\]]*\]\);/g) ?? [];
    expect(memoBlocks.some((b) => b.includes("setSel"))).toBe(false);
    expect(body).toContain("useEffect(");
  });
});

describe("/funcionarios — busca (search params)", () => {
  const cards = [
    { id: "a", nome: "Átila" },
    { id: "b", nome: "Alef" },
  ];

  it("sem id: nenhuma seleção automática", () => {
    const { id } = parseFuncionariosSearch({});
    expect(id).toBeUndefined();
    expect(findEmployeeCard(cards, id)).toBeNull();
  });

  it("com id válido: seleciona o funcionário correspondente", () => {
    const { id } = parseFuncionariosSearch({ id: "b" });
    expect(findEmployeeCard(cards, id)?.nome).toBe("Alef");
  });

  it("com id inexistente ou inválido: não seleciona nada", () => {
    expect(findEmployeeCard(cards, parseFuncionariosSearch({ id: "zzz" }).id)).toBeNull();
    expect(parseFuncionariosSearch({ id: 42 }).id).toBeUndefined();
    expect(parseFuncionariosSearch({ id: "  " }).id).toBeUndefined();
  });

  it("transição carregando → carregado: lista vazia não seleciona, depois seleciona", () => {
    const { id } = parseFuncionariosSearch({ id: "a" });
    expect(findEmployeeCard([], id)).toBeNull();
    expect(findEmployeeCard(cards, id)?.nome).toBe("Átila");
  });
});
