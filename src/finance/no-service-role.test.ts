import { describe, it, expect } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { findServiceRoleLeaks } from "../../scripts/check-no-service-role";

describe("gate: service_role nunca no frontend", () => {
  it("src não contém referências fora da allowlist", () => {
    expect(findServiceRoleLeaks("src")).toEqual([]);
  });

  it("ocorrência em client.server.ts não é reportada", () => {
    const root = mkdtempSync(join(tmpdir(), "fr-sr-"));
    const dir = join(root, "src/integrations/supabase");
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, "client.server.ts"),
      "const k = process.env.SUPABASE_SERVICE_ROLE_KEY;",
    );
    const cwd = process.cwd();
    process.chdir(root);
    try {
      expect(findServiceRoleLeaks("src")).toEqual([]);
    } finally {
      process.chdir(cwd);
    }
  });

  it("ocorrência simulada em uma rota é reportada", () => {
    const root = mkdtempSync(join(tmpdir(), "fr-sr-"));
    const dir = join(root, "src/routes");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "leak.tsx"), 'const key = "service_role";');
    const cwd = process.cwd();
    process.chdir(root);
    try {
      const hits = findServiceRoleLeaks("src");
      expect(hits).toHaveLength(1);
      expect(relative(root, join(root, hits[0]!.file)).replace(/\\/g, "/")).toBe(
        "src/routes/leak.tsx",
      );
    } finally {
      process.chdir(cwd);
    }
  });
});
