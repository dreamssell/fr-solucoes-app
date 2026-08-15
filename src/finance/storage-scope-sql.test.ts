/**
 * Contrato do SQL de contenção (sem banco): a função de escopo de storage
 * precisa ser TOTAL (nunca lançar erro por UUID malformado) e as funções
 * precisam ter superfície de execução mínima.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/** Migration OFICIAL aplicada ao banco (imutável). */
export const APPLIED_CONTAINMENT_MIGRATION =
  "supabase/migrations/20260807212156_4ff18e04-2474-44ba-85c7-89054400048e.sql";

const SQL = readFileSync(APPLIED_CONTAINMENT_MIGRATION, "utf8");

/** Mesma regex da função, reconstruída a partir do SQL (fonte única). */
function extractPathRegex(): RegExp {
  const parts = SQL.split("~*")[1]!.split("THEN")[0]!;
  const literals = [...parts.matchAll(/'([^']*)'/g)].map((m) => m[1]!);
  return new RegExp(literals.join(""), "i");
}

const RE = extractPathRegex();
const V4 = "6f1e2c3a-4b5d-4e6f-8a9b-0c1d2e3f4a5b";
const V4B = "11112222-3333-4444-8555-666677778888";

describe("app.storage_object_client_id — regex total", () => {
  it("aceita o caminho canônico com UUID v4 nos dois segmentos", () => {
    expect(RE.test(`clients/${V4}/${V4B}.pdf`)).toBe(true);
  });

  it("rejeita UUID malformado que antes passava (36 chars quaisquer)", () => {
    const malformados = [
      "------------------------------------",
      "gggggggg-gggg-gggg-gggg-gggggggggggg",
      "6f1e2c3a4b5d4e6f8a9b0c1d2e3f4a5b0000",
      "6f1e2c3a-4b5d-0e6f-8a9b-0c1d2e3f4a5b", // versão 0 inválida
      "6f1e2c3a-4b5d-4e6f-ca9b-0c1d2e3f4a5b", // variante inválida
    ];
    for (const bad of malformados) {
      expect(RE.test(`clients/${bad}/${V4B}.pdf`)).toBe(false);
      expect(RE.test(`clients/${V4}/${bad}.pdf`)).toBe(false);
    }
  });

  it("rejeita legado, travessia, subpasta e extensão inválida", () => {
    expect(RE.test(`${V4}.pdf`)).toBe(false);
    expect(RE.test("clients/../x.pdf")).toBe(false);
    expect(RE.test(`clients/${V4}/sub/${V4B}.pdf`)).toBe(false);
    expect(RE.test(`clients/${V4}/${V4B}.`)).toBe(false);
    expect(RE.test(`clients/${V4}/${V4B}.umaextensaomuitolonga`)).toBe(false);
  });
});

describe("Permissões das funções de escopo", () => {
  for (const fn of ["app.storage_object_client_id(text)", "app.can_access_client_object(text)"]) {
    it(`${fn} revoga PUBLIC e concede só authenticated/service_role`, () => {
      expect(SQL).toContain(`REVOKE ALL ON FUNCTION ${fn} FROM PUBLIC;`);
      expect(SQL).toContain(`GRANT EXECUTE ON FUNCTION ${fn} TO authenticated, service_role;`);
      expect(SQL).not.toContain(`GRANT EXECUTE ON FUNCTION ${fn} TO anon`);
    });
  }

  it("can_access_client_object é SECURITY DEFINER com owner e search_path fixos", () => {
    const body = SQL.split("CREATE OR REPLACE FUNCTION app.can_access_client_object")[1]!;
    expect(body).toContain("SECURITY DEFINER");
    expect(body).toContain("SET search_path = public, pg_temp");
    expect(SQL).toContain("ALTER FUNCTION app.can_access_client_object(text) OWNER TO postgres;");
  });
});

describe("Grants do papel técnico de testes", () => {
  it("verifica schema e tabela de migrations antes de conceder", () => {
    const bloco = SQL.split("fr_test_runner")[0]! + SQL.split("DO $$").pop()!;
    expect(bloco).toContain("pg_namespace WHERE nspname = 'supabase_migrations'");
    expect(bloco).toContain("c.relname = 'schema_migrations'");
  });
});
