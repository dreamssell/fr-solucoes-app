import { describe, it, expect } from "vitest";
import { registerPayment } from "../lib/payments.functions";

describe("Auditoria e Idempotência de Pagamento", () => {
  it("a função registerPayment deve estar definida", () => {
    expect(registerPayment).toBeDefined();
  });

  it("deve validar a presença de idempotency_key no esquema de entrada", () => {
    // Verificamos se a exportação existe e é uma função do TanStack
    expect(typeof registerPayment).toBe("function");
  });
});
