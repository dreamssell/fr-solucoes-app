import { describe, it, expect } from "vitest";
import { normalizeBrazilianPhone, getWhatsAppLink } from "../lib/format";

describe("WhatsApp Link Logic", () => {
  it("GREEN: deve normalizar números salvos com erros comuns", () => {
    expect(normalizeBrazilianPhone("(37) 99948-8474")).toBe("5537999488474");
    expect(normalizeBrazilianPhone("37999488474")).toBe("5537999488474");
    expect(normalizeBrazilianPhone("+55 37 99948-8474")).toBe("5537999488474");
    expect(normalizeBrazilianPhone("5537999488474")).toBe("5537999488474");
  });

  it("GREEN: não deve duplicar o 55 no link final", () => {
    const link = getWhatsAppLink("5537999488474");
    // Deve ser wa.me/55... e não wa.me/5555...
    expect(link).toBe("https://wa.me/5537999488474");
  });

  it("GREEN: deve retornar link vazio para telefones inválidos", () => {
    expect(getWhatsAppLink("")).toBe("");
    expect(getWhatsAppLink("123")).toBe("");
  });
});
