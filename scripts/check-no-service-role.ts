import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

export type ServiceRoleHit = { file: string; line: number; text: string };

/** Caminhos onde a referência a service_role é legítima (somente servidor/tooling). */
const ALLOWED: Array<string | RegExp> = [
  "src/integrations/supabase/client.server.ts",
  /^scripts\//,
  /\.test\.tsx?$/,
  /\.server\.tsx?$/,
];

const PATTERN = /service_role|SUPABASE_SERVICE_ROLE_KEY/;
const SKIP_DIRS = new Set(["node_modules", "dist", ".git", ".output", ".vinxi"]);

function isAllowed(rel: string): boolean {
  return ALLOWED.some((rule) => (typeof rule === "string" ? rel === rule : rule.test(rel)));
}

function walk(dir: string, out: string[]) {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(entry)) out.push(full);
  }
}

export function findServiceRoleLeaks(rootDir: string): ServiceRoleHit[] {
  const files: string[] = [];
  walk(rootDir, files);
  const hits: ServiceRoleHit[] = [];
  for (const file of files) {
    const rel = relative(process.cwd(), file).split(sep).join("/");
    if (isAllowed(rel)) continue;
    const lines = readFileSync(file, "utf8").split("\n");
    lines.forEach((text, i) => {
      if (PATTERN.test(text)) hits.push({ file: rel, line: i + 1, text: text.trim() });
    });
  }
  return hits;
}

if (import.meta.main) {
  const hits = findServiceRoleLeaks("src");
  if (hits.length > 0) {
    for (const h of hits) console.error(`${h.file}:${h.line}: ${h.text}`);
    console.error(`\n${hits.length} referência(s) a service_role fora da allowlist.`);
    process.exit(1);
  }
  console.log("OK: nenhuma referência a service_role no frontend.");
}
