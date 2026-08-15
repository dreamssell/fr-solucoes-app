import { describe, it, expect } from "vitest";
import { validateCPF, validatePhone } from "./validators";

describe("Validação de Clientes", () => {
  it("deve validar CPF corretamente", () => {
    expect(validateCPF("12345678909")).toBe(true);
    expect(validateCPF("11111111111")).toBe(false);
    expect(validateCPF("123")).toBe(false);
  });

  it("deve validar telefone corretamente", () => {
    expect(validatePhone("11999999999")).toBe(true);
    expect(validatePhone("1199999999")).toBe(true);
    expect(validatePhone("123")).toBe(false);
  });
});
