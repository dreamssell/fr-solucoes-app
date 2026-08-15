import { describe, it, expect } from "vitest";
import { CLIENT_OBJECT_PREFIX, buildClientObjectPath, parseClientObjectPath } from "./storage-path";

const CLIENT_ID = "6f1e2c3a-4b5d-4e6f-8a9b-0c1d2e3f4a5b";
const OBJECT_ID = "11112222-3333-4444-5555-666677778888";

describe("caminho canonico de documentos do cliente", () => {
  it("gera clients/<clientId>/<uuid>.<ext> com extensao minuscula", () => {
    const path = buildClientObjectPath(CLIENT_ID, "rg.PNG");
    const parsed = parseClientObjectPath(path);
    expect(path.startsWith(`${CLIENT_OBJECT_PREFIX}/${CLIENT_ID}/`)).toBe(true);
    expect(path.endsWith(".png")).toBe(true);
    expect(parsed).not.toBeNull();
    expect(parsed!.clientId).toBe(CLIENT_ID);
    expect(parsed!.ext).toBe("png");
  });

  it("rejeita clientId que nao e UUID", () => {
    expect(() => buildClientObjectPath("nao-uuid", "rg.png")).toThrow();
  });

  it("rejeita nome de arquivo sem extensao ou com travessia de diretorio", () => {
    expect(() => buildClientObjectPath(CLIENT_ID, "semextensao")).toThrow();
    expect(() => buildClientObjectPath(CLIENT_ID, "pasta/rg.png")).toThrow();
    expect(() => buildClientObjectPath(CLIENT_ID, "..rg")).toThrow();
  });

  it("faz parse de um caminho canonico completo", () => {
    expect(parseClientObjectPath(`clients/${CLIENT_ID}/${OBJECT_ID}.pdf`)).toEqual({
      clientId: CLIENT_ID,
      objectId: OBJECT_ID,
      ext: "pdf",
    });
  });

  it("devolve null para legado, travessia e subpastas", () => {
    expect(parseClientObjectPath(`${OBJECT_ID}.pdf`)).toBeNull();
    expect(parseClientObjectPath("clients/../x.pdf")).toBeNull();
    expect(parseClientObjectPath(`clients/${CLIENT_ID}/sub/x.pdf`)).toBeNull();
  });
});
