import { describe, expect, it } from "vitest";
import { canDecideApproval, decisionBlockedMessage } from "./approval-permissions";

const owner = { userId: "u-owner", role: "owner" as const };
const manager = { userId: "u-manager", role: "manager" as const };
const employee = { userId: "u-emp", role: "employee" as const };

describe("fila de empréstimos — permissão de decisão", () => {
  it("owner pode decidir solicitação de outro", () => {
    expect(canDecideApproval(owner, { requested_by: "u-emp" })).toBe(true);
  });

  it("manager pode decidir solicitação de outro", () => {
    expect(canDecideApproval(manager, { requested_by: "u-emp" })).toBe(true);
  });

  it("employee nunca decide", () => {
    expect(canDecideApproval(employee, { requested_by: "u-owner" })).toBe(false);
    expect(decisionBlockedMessage(employee, { requested_by: "u-owner" })).toBe(
      "Você não tem permissão para decidir.",
    );
  });

  it("ninguém aprova a própria solicitação", () => {
    expect(canDecideApproval(owner, { requested_by: "u-owner" })).toBe(false);
    expect(canDecideApproval(manager, { requested_by: "u-manager" })).toBe(false);
    expect(decisionBlockedMessage(owner, { requested_by: "u-owner" })).toBe(
      "Você não pode aprovar a própria solicitação.",
    );
  });

  it("sem papel/sem sessão fica bloqueado", () => {
    expect(canDecideApproval(null, { requested_by: "x" })).toBe(false);
    expect(canDecideApproval({ userId: "u", role: null }, { requested_by: "x" })).toBe(false);
  });

  it("solicitante desconhecido não libera autoaprovação indevida", () => {
    expect(canDecideApproval(owner, { requested_by: null })).toBe(true);
  });
});
