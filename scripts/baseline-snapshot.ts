/**
 * Snapshot de baseline SOMENTE LEITURA.
 * Toda a leitura ocorre dentro de BEGIN READ ONLY ... ROLLBACK.
 */
import pg from "pg";

export type BusinessCounts = {
  clients: number;
  loans: number;
  installments: number;
  payments: number;
  employees: number;
  audit_events: number;
};

export type Baseline = {
  capturedAt: string;
  counts: BusinessCounts;
  policies: Array<{
    schema: string;
    table: string;
    policy: string;
    cmd: string;
    using: string | null;
    check: string | null;
  }>;
  buckets: Array<{ id: string; public: boolean }>;
  storageObjectSample: Array<{ name: string; segments: number }>;
  appliedMigrations: string[];
  /** Preenchido quando o historico aplicado nao pode ser lido pelo papel atual. */
  appliedMigrationsError?: string;
};

export async function captureBaseline(connectionString: string): Promise<Baseline> {
  const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    await client.query("BEGIN READ ONLY");

    const counts = await client.query<{ t: string; c: string }>(
      `SELECT 'clients' t, count(*) c FROM public.clients
       UNION ALL SELECT 'loans', count(*) FROM public.loans
       UNION ALL SELECT 'installments', count(*) FROM public.installments
       UNION ALL SELECT 'payments', count(*) FROM public.payments
       UNION ALL SELECT 'employees', count(*) FROM public.employees
       UNION ALL SELECT 'audit_events', count(*) FROM public.audit_events`,
    );

    const policies = await client.query(
      `SELECT schemaname, tablename, policyname, cmd, qual, with_check
         FROM pg_policies
        WHERE (schemaname = 'storage' AND tablename = 'objects')
           OR (schemaname = 'public' AND tablename IN ('employee_notifications','clients','loans','installments'))
        ORDER BY schemaname, tablename, policyname`,
    );

    const buckets = await client.query(`SELECT id, public FROM storage.buckets ORDER BY id`);

    const objects = await client.query(
      `SELECT name, array_length(string_to_array(name, '/'), 1) AS segments
         FROM storage.objects WHERE bucket_id = 'documents' ORDER BY created_at LIMIT 200`,
    );

    let appliedMigrations: string[] = [];
    let appliedMigrationsError: string | undefined;
    try {
      const migrations = await client.query<{ version: string }>(
        `SELECT version FROM supabase_migrations.schema_migrations ORDER BY version`,
      );
      appliedMigrations = migrations.rows.map((r) => r.version);
    } catch (error) {
      appliedMigrationsError = error instanceof Error ? error.message : String(error);
    }

    await client.query("ROLLBACK");

    const countMap = Object.fromEntries(counts.rows.map((r) => [r.t, Number(r.c)]));

    return {
      capturedAt: new Date().toISOString(),
      counts: countMap as unknown as BusinessCounts,
      policies: policies.rows.map((r) => ({
        schema: r.schemaname,
        table: r.tablename,
        policy: r.policyname,
        cmd: r.cmd,
        using: r.qual,
        check: r.with_check,
      })),
      buckets: buckets.rows.map((r) => ({ id: r.id, public: r.public })),
      storageObjectSample: objects.rows.map((r) => ({
        name: r.name,
        segments: Number(r.segments),
      })),
      appliedMigrations,
      ...(appliedMigrationsError ? { appliedMigrationsError } : {}),
    };
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
  const baseline = await captureBaseline(url);
  console.log(JSON.stringify(baseline, null, 2));
  process.exit(0);
}
