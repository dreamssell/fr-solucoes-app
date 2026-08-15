import { describe, it, expect } from "vitest";
import { normalizeBrazilianPhone, getWhatsAppLink } from "./format";

describe("normalizeBrazilianPhone", () => {
  it("should normalize standard DDD + number", () => {
    expect(normalizeBrazilianPhone("(37) 99948-8474")).toBe("5537999488474");
    expect(normalizeBrazilianPhone("37999488474")).toBe("5537999488474");
  });

  it("should handle +55 prefix correctly", () => {
    expect(normalizeBrazilianPhone("+55 37 99948-8474")).toBe("5537999488474");
    expect(normalizeBrazilianPhone("5537999488474")).toBe("5537999488474");
  });

  it("should return null for empty or invalid phones", () => {
    expect(normalizeBrazilianPhone("")).toBeNull();
    expect(normalizeBrazilianPhone("123")).toBeNull();
    expect(normalizeBrazilianPhone("invalid")).toBeNull();
  });

  it("should validate digits length (10 or 11 plus 55 prefix)", () => {
    // 55 + 37 + 999488474 = 13 digits (mobile)
    expect(normalizeBrazilianPhone("37999488474")).toHaveLength(13);
    // 55 + 37 + 32211234 = 12 digits (landline)
    expect(normalizeBrazilianPhone("3732211234")).toHaveLength(12);
  });
});

describe("getWhatsAppLink", () => {
  it("should generate a valid link for normalized phone", () => {
    const phone = "37999488474";
    expect(getWhatsAppLink(phone)).toBe("https://wa.me/5537999488474");
  });

  it("should include message if provided", () => {
    const phone = "37999488474";
    const msg = "Olá!";
    expect(getWhatsAppLink(phone, msg)).toContain("text=Ol%C3%A1!");
  });

  it("should return empty string for invalid phone", () => {
    expect(getWhatsAppLink("")).toBe("");
  });
});
