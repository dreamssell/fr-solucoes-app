import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { canRequestFor, canDecide, type Actor } from "@/finance/scope";

const dir = "supabase/migrations";
const sql = readdirSync(dir)
  .filter((f) => f.endsWith(".sql"))
  .map((f) => readFileSync(join(dir, f), "utf8"))
  .join("\n")
  .toLowerCase();

/** Contrato de RLS: SELECT precisa ser por escopo, não só dono ativo. */
describe("RLS: políticas de leitura por escopo", () => {
  for (const table of ["employees", "clients", "loans"]) {
    it(`${table}_select usa app.can_request_for`, () => {
      const policy = sql.split(`policy "${table}_select"`).pop() ?? "";
      const body = policy.slice(0, 400);
      expect(body).toContain("app.actor_is_active()");
      expect(body).toContain("app.can_request_for");
      expect(body).not.toContain("app.is_active_owner()");
    });
  }

  it("installments_select resolve o funcionário pelo empréstimo", () => {
    const body = (sql.split('policy "installments_select"').pop() ?? "").slice(0, 400);
    expect(body).toContain("app.can_request_for(app.loan_employee_id(loan_id))");
    expect(body).not.toContain("app.is_active_owner()");
  });

  it("escrita de loans/installments continua exclusiva das RPCs", () => {
    expect(sql).not.toMatch(/policy "(loans|installments)_(insert|update)"/);
  });

  it("clients_insert/clients_update ficam no escopo autorizado", () => {
    for (const p of ["clients_insert", "clients_update"]) {
      const body = (sql.split(`policy "${p}"`).pop() ?? "").slice(0, 400);
      expect(body).toContain("app.can_request_for(employee_id)");
    }
    expect(sql).toContain("forbid_client_employee_change");
  });
});

/** Espelho lógico das mesmas regras (owner/manager/employee). */
describe("RLS: escopo lógico equivalente", () => {
  const owner: Actor = {
    userId: "u1",
    role: "owner",
    isActive: true,
    employeeId: null,
    teamIds: [],
  };
  const manager: Actor = {
    userId: "u2",
    role: "manager",
    isActive: true,
    employeeId: "e2",
    teamIds: ["e3"],
  };
  const employee: Actor = {
    userId: "u3",
    role: "employee",
    isActive: true,
    employeeId: "e3",
    teamIds: [],
  };
  const semPerfil: Actor = {
    userId: "u4",
    role: null,
    isActive: false,
    employeeId: null,
    teamIds: [],
  };
  const inativo: Actor = { ...employee, isActive: false };

  it("owner vê tudo", () => expect(canRequestFor(owner, "e9").allowed).toBe(true));
  it("manager vê só a equipe", () => {
    expect(canRequestFor(manager, "e3").allowed).toBe(true);
    expect(canRequestFor(manager, "e9").allowed).toBe(false);
  });
  it("employee vê só a própria carteira e nunca decide", () => {
    expect(canRequestFor(employee, "e3").allowed).toBe(true);
    expect(canRequestFor(employee, "e2").allowed).toBe(false);
    expect(canDecide(employee, { requestedByUserId: "u1", targetEmployeeId: "e3" }).allowed).toBe(
      false,
    );
  });
  it("inativo e sem perfil são bloqueados", () => {
    expect(canRequestFor(inativo, "e3").allowed).toBe(false);
    expect(canRequestFor(semPerfil, "e3").allowed).toBe(false);
  });
});
