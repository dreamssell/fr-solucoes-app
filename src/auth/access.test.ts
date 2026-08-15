import { describe, it, expect, vi } from "vitest";
import { resolveAccess, decideGuardAction, type AccessResult } from "./index";
import { createAccessChecker } from "./access-cache";

describe("resolveAccess", () => {
  it("erro técnico da RPC => unavailable", () => {
    expect(
      resolveAccess({ user: { id: "u1" }, claim: null, error: new Error("network") }).status,
    ).toBe("unavailable");
  });
  it("claim false sem erro => unauthorized", () => {
    expect(resolveAccess({ user: { id: "u1" }, claim: { authorized: false } }).status).toBe(
      "unauthorized",
    );
  });
  it("claim true => authorized", () => {
    expect(resolveAccess({ user: { id: "u1" }, claim: { authorized: true } }).status).toBe(
      "authorized",
    );
  });
  it("claim ausente sem erro => unauthorized", () => {
    expect(resolveAccess({ user: { id: "u1" }, claim: null }).status).toBe("unauthorized");
  });
  it("sem usuário => anonymous", () => {
    expect(resolveAccess({ user: null, claim: null }).status).toBe("anonymous");
  });
});

describe("decideGuardAction", () => {
  it("authorized libera", () => {
    expect(decideGuardAction({ status: "authorized" })).toEqual({ action: "allow" });
  });
  it("unauthorized desloga", () => {
    expect(decideGuardAction({ status: "unauthorized", message: "x" })).toEqual({
      action: "signout-unauthorized",
    });
  });
  it("anonymous apenas redireciona", () => {
    expect(decideGuardAction({ status: "anonymous" })).toEqual({ action: "redirect-login" });
  });
  it("unavailable não desloga nem vira nao_autorizado", () => {
    const d = decideGuardAction({ status: "unavailable", message: "y" } as AccessResult);
    expect(d).toEqual({ action: "redirect-unavailable" });
  });
});

describe("createAccessChecker", () => {
  function setup(seq: AccessResult[]) {
    let now = 0;
    const fetcher = vi.fn(async () => seq.shift() ?? ({ status: "authorized" } as AccessResult));
    const checker = createAccessChecker({ fetchAccess: fetcher, now: () => now, ttlMs: 60_000 });
    return { checker, fetcher, tick: (ms: number) => (now += ms) };
  }

  it("não repete RPC dentro do TTL", async () => {
    const { checker, fetcher, tick } = setup([{ status: "authorized" }]);
    expect((await checker.checkAccess()).status).toBe("authorized");
    tick(30_000);
    expect((await checker.checkAccess()).status).toBe("authorized");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("revalida após o TTL", async () => {
    const { checker, fetcher, tick } = setup([{ status: "authorized" }, { status: "authorized" }]);
    await checker.checkAccess();
    tick(61_000);
    await checker.checkAccess();
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("deduplica chamadas concorrentes", async () => {
    const { checker, fetcher } = setup([{ status: "authorized" }]);
    const [a, b] = await Promise.all([checker.checkAccess(), checker.checkAccess()]);
    expect(a.status).toBe("authorized");
    expect(b.status).toBe("authorized");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("falha técnica com cache válido preserva acesso", async () => {
    const { checker, tick } = setup([
      { status: "authorized" },
      { status: "unavailable", message: "z" } as AccessResult,
    ]);
    await checker.checkAccess();
    tick(61_000);
    expect((await checker.checkAccess()).status).toBe("authorized");
  });

  it("invalidate limpa o cache", async () => {
    const { checker, fetcher } = setup([{ status: "authorized" }, { status: "anonymous" }]);
    await checker.checkAccess();
    checker.invalidate();
    expect((await checker.checkAccess()).status).toBe("anonymous");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("unauthorized real não é mascarado pelo cache", async () => {
    const { checker, tick } = setup([
      { status: "authorized" },
      { status: "unauthorized", message: "m" },
    ]);
    await checker.checkAccess();
    tick(61_000);
    expect((await checker.checkAccess()).status).toBe("unauthorized");
  });
});
