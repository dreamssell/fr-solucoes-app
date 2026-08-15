/**
 * Comparador puro de drift de migrations.
 *
 * Nenhuma leitura de disco, de banco ou de relogio acontece aqui: arquivos,
 * historico aplicado, manifesto e hashes entram sempre por parametro.
 */

export type MigrationFile = { file: string; version: string };
export type DriftState = "clean" | "reconciled_legacy" | "blocking_drift";

/** Entrada do manifesto versionado scripts/migration-reconciliation.json */
export type ReconciliationEntry = {
  version: string;
  file: string;
  sha256: string;
  reason: string;
  /** Objetos que a migration deveria ter criado e que ja existem no schema real. */
  expectedObjects: string[];
  /** SELECT somente leitura que devolve uma unica coluna booleana `present`. */
  evidenceQuery: string;
};

export type ReconciliationManifest = {
  generatedAt: string;
  entries: ReconciliationEntry[];
};

export type DriftReport = {
  state: DriftState;
  filesWithoutAppliedVersion: MigrationFile[];
  appliedVersionsWithoutFile: string[];
  duplicatedVersions: Array<{ version: string; files: string[] }>;
  /** Divergencias cobertas pelo manifesto, com fingerprint conferido. */
  reconciledLegacy: ReconciliationEntry[];
  /** Divergencias sem entrada valida no manifesto — causam blocking_drift. */
  unreconciled: MigrationFile[];
  /** Entradas do manifesto cujo sha256 nao confere ou sem divergencia correspondente. */
  staleManifestEntries: ReconciliationEntry[];
};

const MIGRATION_FILE_PATTERN = /^(\d{14})_.+\.sql$/;

export function parseMigrationFiles(fileNames: string[]): MigrationFile[] {
  return fileNames
    .map((file) => {
      const match = MIGRATION_FILE_PATTERN.exec(file);
      return match ? { file, version: match[1]! } : null;
    })
    .filter((item): item is MigrationFile => item !== null);
}

export function compareMigrations(
  files: MigrationFile[],
  applied: string[],
  manifest: ReconciliationManifest,
  fileHashes: Record<string, string>,
): DriftReport {
  const appliedSet = new Set(applied);

  const byVersion = new Map<string, string[]>();
  for (const { version, file } of files) {
    byVersion.set(version, [...(byVersion.get(version) ?? []), file]);
  }

  const duplicatedVersions = [...byVersion.entries()]
    .filter(([, group]) => group.length > 1)
    .map(([version, group]) => ({ version, files: [...group].sort() }));

  const filesWithoutAppliedVersion = files.filter(({ version }) => !appliedSet.has(version));

  const fileVersions = new Set(files.map(({ version }) => version));
  const appliedVersionsWithoutFile = applied.filter((version) => !fileVersions.has(version));

  const reconciledLegacy: ReconciliationEntry[] = [];
  const unreconciled: MigrationFile[] = [];
  const staleManifestEntries: ReconciliationEntry[] = [];
  const usedEntries = new Set<ReconciliationEntry>();

  for (const divergence of filesWithoutAppliedVersion) {
    const entry = manifest.entries.find(
      (candidate) => candidate.version === divergence.version && candidate.file === divergence.file,
    );

    if (entry && fileHashes[divergence.file] === entry.sha256) {
      usedEntries.add(entry);
      reconciledLegacy.push(entry);
      continue;
    }

    unreconciled.push(divergence);
    if (entry) {
      usedEntries.add(entry);
      staleManifestEntries.push(entry);
    }
  }

  for (const entry of manifest.entries) {
    if (!usedEntries.has(entry)) staleManifestEntries.push(entry);
  }

  const state: DriftState =
    unreconciled.length > 0 ||
    appliedVersionsWithoutFile.length > 0 ||
    staleManifestEntries.length > 0
      ? "blocking_drift"
      : reconciledLegacy.length > 0
        ? "reconciled_legacy"
        : "clean";

  return {
    state,
    filesWithoutAppliedVersion,
    appliedVersionsWithoutFile,
    duplicatedVersions,
    reconciledLegacy,
    unreconciled,
    staleManifestEntries,
  };
}
