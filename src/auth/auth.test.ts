import { describe, it, expect } from "vitest";
import { normalizeEmail } from "./index";

describe("Auth Logic (Etapa 4)", () => {
  it("deve normalizar emails corretamente", () => {
    expect(normalizeEmail(" FELIPE@gmail.com ")).toBe("felipe@gmail.com");
  });
});
