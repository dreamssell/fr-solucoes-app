import { describe, it, expect } from "vitest";
import { resolveActor, canRequestFor, canDecide, type Actor } from "@/finance/scope";

const owner: Actor = { userId: "u1", role: "owner", isActive: true, employeeId: null, teamIds: [] };
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
const inactive: Actor = { ...manager, isActive: false };

describe("resolveActor", () => {
  it("marca dono ativo como owner mesmo sem cadastro de funcionário", () => {
    expect(resolveActor({ userId: "u1", isOwnerAccess: true, employee: null }).role).toBe("owner");
  });
  it("usa papel e status do funcionário vinculado", () => {
    const a = resolveActor({
      userId: "u2",
      isOwnerAccess: false,
      employee: { id: "e2", role: "manager", is_active: true, managed_team_ids: ["e3"] },
    });
    expect(a).toMatchObject({ role: "manager", employeeId: "e2", isActive: true, teamIds: ["e3"] });
  });
  it("usuário sem vínculo é inativo e sem papel", () => {
    const a = resolveActor({ userId: "u9", isOwnerAccess: false, employee: null });
    expect(a.isActive).toBe(false);
    expect(a.role).toBeNull();
  });
});

describe("canRequestFor", () => {
  it("owner solicita para qualquer carteira", () => {
    expect(canRequestFor(owner, "e3").allowed).toBe(true);
  });
  it("gerente solicita dentro da equipe", () => {
    expect(canRequestFor(manager, "e3").allowed).toBe(true);
  });
  it("gerente fora da equipe é bloqueado", () => {
    expect(canRequestFor(manager, "e7").allowed).toBe(false);
  });
  it("funcionário só na própria carteira", () => {
    expect(canRequestFor(employee, "e3").allowed).toBe(true);
    expect(canRequestFor(employee, "e2").allowed).toBe(false);
  });
  it("usuário inativo é bloqueado", () => {
    expect(canRequestFor(inactive, "e3").allowed).toBe(false);
  });
});

describe("canDecide", () => {
  it("funcionário nunca aprova", () => {
    expect(canDecide(employee, { requestedByUserId: "u1", targetEmployeeId: "e3" }).allowed).toBe(
      false,
    );
  });
  it("ninguém aprova a própria solicitação", () => {
    expect(canDecide(owner, { requestedByUserId: "u1", targetEmployeeId: "e3" }).allowed).toBe(
      false,
    );
    expect(canDecide(manager, { requestedByUserId: "u2", targetEmployeeId: "e3" }).allowed).toBe(
      false,
    );
  });
  it("owner aprova solicitação de terceiros", () => {
    expect(canDecide(owner, { requestedByUserId: "u3", targetEmployeeId: "e3" }).allowed).toBe(
      true,
    );
  });
  it("gerente aprova só dentro da equipe", () => {
    expect(canDecide(manager, { requestedByUserId: "u3", targetEmployeeId: "e3" }).allowed).toBe(
      true,
    );
    expect(canDecide(manager, { requestedByUserId: "u3", targetEmployeeId: "e9" }).allowed).toBe(
      false,
    );
  });
  it("usuário inativo é bloqueado", () => {
    expect(canDecide(inactive, { requestedByUserId: "u3", targetEmployeeId: "e3" }).allowed).toBe(
      false,
    );
  });
});
