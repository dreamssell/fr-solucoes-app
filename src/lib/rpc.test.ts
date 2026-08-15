import { describe, it, expect } from "vitest";
import { callRpc, rpcErrorMessage } from "./rpc";

type Res = { data: unknown; error: { message: string; code?: string } | null };
const client = (res: Res) => ({ rpc: async () => res });

describe("padronização de erros de RPC", () => {
  it("retorna os dados quando não há erro", async () => {
    const data = await callRpc(
      client({ data: "owner", error: null }) as never,
      "get_user_role",
      {},
    );
    expect(data).toBe("owner");
  });

  it("lança erro tratável quando a RPC falha", async () => {
    const c = client({
      data: null,
      error: { message: "permission denied for table loans", code: "42501" },
    });
    await expect(callRpc(c as never, "process_payment_atomic", {})).rejects.toThrow(/permissão/i);
  });

  it("traduz erros comuns para mensagens úteis na interface", () => {
    expect(rpcErrorMessage({ message: "permission denied", code: "42501" })).toMatch(/permissão/i);
    expect(rpcErrorMessage({ message: "duplicate key value", code: "23505" })).toMatch(
      /já foi registrad/i,
    );
    expect(rpcErrorMessage({ message: "Falha de rede" })).toContain("Falha de rede");
    expect(rpcErrorMessage(null)).toMatch(/erro/i);
  });
});
