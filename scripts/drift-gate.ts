/**
 * Gate de drift executavel. Somente leitura: BEGIN READ ONLY ... ROLLBACK.
 * NUNCA insere linhas em supabase_migrations.schema_migrations.
 */
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import pg from "pg";

import {
  compareMigrations,
  parseMigrationFiles,
  type DriftReport,
  type ReconciliationManifest,
} from "./migration-drift";

export type DriftGateResult = DriftReport & {
  evidence: Array<{ version: string; present: boolean }>;
  /** Preenchido quando o historico aplicado nao pode ser lido pelo papel atual. */
  historyError?: string;
};

/** Aceita apenas um unico SELECT somente leitura. */
function assertReadOnlySelect(query: string): void {
  const normalized = query.trim().replace(/;$/, "");
  if (normalized.includes(";")) throw new Error(`evidenceQuery com multiplos statements: ${query}`);
  if (!/^select\s/i.test(normalized)) throw new Error(`evidenceQuery nao e SELECT: ${query}`);
  if (/\b(insert|update|delete|drop|alter|create|grant|revoke|truncate|copy)\b/i.test(normalized)) {
    throw new Error(`evidenceQuery contem DML/DDL: ${query}`);
  }
}

export async function runDriftGate(
  connectionString: string,
  migrationsDir: string,
  manifestPath: string,
): Promise<DriftGateResult> {
  const fileNames = readdirSync(migrationsDir);
  const files = parseMigrationFiles(fileNames);

  const fileHashes: Record<string, string> = {};
  for (const { file } of files) {
    fileHashes[file] = createHash("sha256")
      .update(readFileSync(join(migrationsDir, file)))
      .digest("hex");
  }

  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as ReconciliationManifest;

  const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    await client.query("BEGIN READ ONLY");

    let appliedVersions: string[];
    try {
      const applied = await client.query<{ version: string }>(
        `SELECT version FROM supabase_migrations.schema_migrations ORDER BY version`,
      );
      appliedVersions = applied.rows.map((r) => r.version);
    } catch (error) {
      // Sem historico legivel nao ha como provar ausencia de drift: bloqueia.
      await client.query("ROLLBACK");
      return {
        state: "blocking_drift",
        filesWithoutAppliedVersion: [],
        appliedVersionsWithoutFile: [],
        duplicatedVersions: [],
        reconciledLegacy: [],
        unreconciled: files,
        staleManifestEntries: manifest.entries,
        evidence: [],
        historyError: `Historico de migrations ilegivel pelo papel atual: ${
          error instanceof Error ? error.message : String(error)
        }`,
      };
    }

    const report = compareMigrations(files, appliedVersions, manifest, fileHashes);

    const evidence: Array<{ version: string; present: boolean }> = [];
    for (const entry of report.reconciledLegacy) {
      assertReadOnlySelect(entry.evidenceQuery);
      const result = await client.query<{ present: boolean }>(entry.evidenceQuery);
      evidence.push({ version: entry.version, present: result.rows[0]?.present === true });
    }

    await client.query("ROLLBACK");

    const state = evidence.some((e) => !e.present) ? "blocking_drift" : report.state;
    return { ...report, state, evidence };
  } finally {
    await client.end();
  }
}

if (import.meta.main) {
  const url = process.env["SUPABASE_DB_URL"];
  if (!url) {
    console.error("SUPABASE_DB_URL nao definido");
    process.exit(1);
  }
  const report = await runDriftGate(
    url,
    "supabase/migrations",
    "scripts/migration-reconciliation.json",
  );
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.state === "blocking_drift" ? 1 : 0);
}
