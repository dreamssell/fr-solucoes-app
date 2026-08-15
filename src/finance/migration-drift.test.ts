import { describe, expect, it } from "vitest";

import {
  compareMigrations,
  parseMigrationFiles,
  type ReconciliationEntry,
  type ReconciliationManifest,
} from "../../scripts/migration-drift";

const emptyManifest: ReconciliationManifest = {
  generatedAt: "2026-08-07T00:00:00.000Z",
  entries: [],
};

function manifestOf(entries: ReconciliationEntry[]): ReconciliationManifest {
  return { generatedAt: "2026-08-07T00:00:00.000Z", entries };
}

const legacyEntry: ReconciliationEntry = {
  version: "20260805111700",
  file: "20260805111700_cleanup_qa_data.sql",
  sha256: "abc123",
  reason: "Aplicada fora do fluxo versionado; efeitos ja presentes no schema real.",
  expectedObjects: ["public.clients"],
  evidenceQuery: "SELECT true AS present",
};

describe("parseMigrationFiles", () => {
  it("extrai a versao de 14 digitos dos nomes validos", () => {
    expect(
      parseMigrationFiles([
        "20260805111700_cleanup_qa_data.sql",
        "20260805202000_fix_idempotency.sql",
      ]),
    ).toEqual([
      { file: "20260805111700_cleanup_qa_data.sql", version: "20260805111700" },
      { file: "20260805202000_fix_idempotency.sql", version: "20260805202000" },
    ]);
  });

  it("ignora arquivos fora do padrao", () => {
    expect(parseMigrationFiles(["README.md", "notes.sql", "2026_bad.sql"])).toEqual([]);
  });
});

describe("compareMigrations", () => {
  it("trata timestamps duplicados reais sem bloquear", () => {
    const files = parseMigrationFiles([
      "20260805000000_notifications_and_audit.sql",
      "20260805000000_storage_and_penalties.sql",
    ]);
    const report = compareMigrations(files, ["20260805000000"], emptyManifest, {});

    expect(report.duplicatedVersions).toEqual([
      {
        version: "20260805000000",
        files: [
          "20260805000000_notifications_and_audit.sql",
          "20260805000000_storage_and_penalties.sql",
        ],
      },
    ]);
    expect(report.state).toBe("clean");
  });

  it("retorna clean quando arquivos e historico coincidem", () => {
    const files = parseMigrationFiles(["20260805202000_fix_idempotency.sql"]);
    const report = compareMigrations(files, ["20260805202000"], emptyManifest, {});

    expect(report.state).toBe("clean");
    expect(report.filesWithoutAppliedVersion).toEqual([]);
    expect(report.unreconciled).toEqual([]);
  });

  it("reconcilia divergencia legada quando o sha256 do manifesto confere", () => {
    const files = parseMigrationFiles([legacyEntry.file]);
    const report = compareMigrations(files, [], manifestOf([legacyEntry]), {
      [legacyEntry.file]: "abc123",
    });

    expect(report.reconciledLegacy).toEqual([legacyEntry]);
    expect(report.unreconciled).toEqual([]);
    expect(report.staleManifestEntries).toEqual([]);
    expect(report.state).toBe("reconciled_legacy");
  });

  it("bloqueia divergencia sem entrada de manifesto", () => {
    const files = parseMigrationFiles([legacyEntry.file]);
    const report = compareMigrations(files, [], emptyManifest, {
      [legacyEntry.file]: "abc123",
    });

    expect(report.unreconciled).toEqual(files);
    expect(report.reconciledLegacy).toEqual([]);
    expect(report.state).toBe("blocking_drift");
  });

  it("bloqueia quando o sha256 do manifesto nao confere", () => {
    const files = parseMigrationFiles([legacyEntry.file]);
    const report = compareMigrations(files, [], manifestOf([legacyEntry]), {
      [legacyEntry.file]: "outro-hash",
    });

    expect(report.unreconciled).toEqual(files);
    expect(report.staleManifestEntries).toEqual([legacyEntry]);
    expect(report.state).toBe("blocking_drift");
  });

  it("bloqueia versao aplicada sem arquivo, mesmo com manifesto", () => {
    const report = compareMigrations([], ["20260805111700"], manifestOf([legacyEntry]), {});

    expect(report.appliedVersionsWithoutFile).toEqual(["20260805111700"]);
    expect(report.state).toBe("blocking_drift");
  });

  it("bloqueia entrada de manifesto obsoleta", () => {
    const files = parseMigrationFiles([legacyEntry.file]);
    const report = compareMigrations(files, ["20260805111700"], manifestOf([legacyEntry]), {
      [legacyEntry.file]: "abc123",
    });

    expect(report.staleManifestEntries).toEqual([legacyEntry]);
    expect(report.state).toBe("blocking_drift");
  });
});
