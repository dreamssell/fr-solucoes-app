# Foundation Security Containment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

## Goal

Conter as vulnerabilidades críticas do bucket privado `documents` e da tabela `public.employee_notifications`, tornar os testes de RLS realmente executáveis contra PostgreSQL e reconciliar o drift entre `supabase/migrations` e `supabase_migrations.schema_migrations` — sem alterar dados de negócio, motor financeiro, telas de cálculo ou publicar.

Fonte do desenho aprovado: `docs/superpowers/specs/2026-08-07-foundation-security-containment-design.md`.

## Architecture

1. **Escopo derivado do banco.** Toda decisão de acesso usa as funções já existentes no schema `app`: `app.actor_role()`, `app.actor_employee_id()`, `app.actor_is_active()`, `app.can_request_for(uuid)`, `app.is_active_owner()`. Nenhum `employee_id`, `sent_by` ou papel vindo do frontend é confiado.
2. **Storage por caminho canônico.** Objetos do bucket `documents` passam a ser gravados em `clients/<client_uuid>/<object_uuid>.<ext>`. Uma função nova `app.storage_object_client_id(text)` extrai o UUID do cliente do `name` do objeto; `app.can_access_client_object(text)` resolve `clients.employee_id` e delega a `app.can_request_for`. Políticas separadas por operação (SELECT/INSERT/UPDATE/DELETE); nenhuma política `FOR ALL` por `bucket_id`.
3. **Notificações por escopo.** `employee_notifications` recebe políticas SELECT/INSERT que combinam `app.is_active_owner()`, `sent_by = auth.uid()`, `employee_id = app.actor_employee_id()` e `app.can_request_for(employee_id)`, sempre com `app.actor_is_active()`.
4. **Testes reais.** Um único arquivo executável de integração PostgreSQL, transacional, com `ROLLBACK` por caso, cobrindo seis perfis: proprietário, gerente, funcionário da equipe, funcionário fora da equipe, usuário desativado e autenticado sem perfil.
5. **Gate de drift com três estados.** Script determinístico que lê os arquivos de `supabase/migrations`, extrai a versão (prefixo de 14 dígitos) e compara com `supabase_migrations.schema_migrations`, tolerando os timestamps duplicados reais (`20260805000000_notifications_and_audit.sql` e `20260805000000_storage_and_penalties.sql`). O resultado é sempre um de três estados: `clean` (arquivos e histórico coincidem), `reconciled_legacy` (as divergências são exatamente as legadas já auditadas e declaradas no manifesto versionado `scripts/migration-reconciliation.json`, cujos efeitos foram comprovados como já presentes no schema real por comparação somente leitura) e `blocking_drift` (qualquer divergência não declarada). `clean` e `reconciled_legacy` saem com código 0; `blocking_drift` sai com código 1. O gate **nunca** insere linhas em `supabase_migrations.schema_migrations`: falsificar histórico é proibido.
6. **Storage DELETE restrito ao proprietário.** Decisão de segurança aprovada: `SELECT`, `INSERT` e `UPDATE` no bucket `documents` seguem o escopo derivado do cliente/funcionário, mas `DELETE` é permitido exclusivamente para `app.is_active_owner()`. Gerente e funcionário nunca apagam documentos, mesmo dentro do próprio escopo.
7. **TDD estrito.** Cada mudança de produção é precedida por um teste que falha (RED com comando comprobatório), seguida da implementação mínima (GREEN) e de um commit sugerido.

## Tech Stack

- TanStack Start v1 + React 19, Vite 7, TypeScript.
- Vitest para testes; `pg` (já usado em `src/finance/security.db.test.ts.skip`) para acesso direto ao PostgreSQL.
- Supabase (Lovable Cloud): PostgreSQL com RLS, schema auxiliar `app`, bucket privado `documents`.
- Supabase CLI apenas para `supabase migration new` (criação do arquivo; a aplicação segue o fluxo de migration do projeto).
- Scripts em TypeScript executados nativamente pelo Bun (`bun scripts/arquivo.ts`). Não usar `bunx tsx` nem adicionar a dependência `tsx`.

## Global Constraints

- Não alterar nenhuma linha de negócio de `clients`, `loans`, `installments`, `payments`, `employees`, `audit_events`, `payment_allocations`, `payment_authorizations`, `loan_renegotiations`.
- Não editar, renomear ou remover migrations já aplicadas em `supabase/migrations`.
- Não modificar motor financeiro (`src/finance/index.ts`), rateio, acerto, caixa ou layout visual.
- Não publicar em nenhuma etapa.
- Nenhuma política `FOR ALL` condicionada apenas a `bucket_id`.
- Nunca inserir, editar ou remover linhas de `supabase_migrations.schema_migrations`.
- `DELETE` em `storage.objects` do bucket `documents` é exclusivo de `app.is_active_owner()`.
- Nenhum uso de `service_role` no bundle do frontend; a chave só existe no runner de teste de banco via `process.env`.
- Ausência de perfil nunca equivale a proprietário.
- Toda migration nova é idempotente (`DROP POLICY IF EXISTS` antes de `CREATE POLICY`, `CREATE OR REPLACE FUNCTION`).

## Files Map

Arquivos **criados**:

| Caminho | Responsabilidade |
|---|---|
| `scripts/baseline-snapshot.ts` | Coleta somente leitura: contagens das tabelas de negócio, políticas atuais, buckets, layout real de `storage.objects.name`, histórico de migrations. Imprime JSON em stdout; não escreve no banco nem em disco. |
| `scripts/migration-drift.ts` | Compara arquivos de `supabase/migrations` com `supabase_migrations.schema_migrations` e com o manifesto de reconciliação, devolvendo um relatório tipado com estado `clean` \| `reconciled_legacy` \| `blocking_drift`. Exporta funções puras para teste. |
| `scripts/migration-reconciliation.json` | Manifesto versionado das divergências legadas aceitas: para cada versão, o arquivo, o `sha256` do conteúdo, os objetos/efeitos esperados no schema e a consulta somente leitura que comprova sua presença. Só é alterado por decisão explícita e revisada. |
| `src/finance/migration-drift.test.ts` | Testes unitários das funções puras de parsing/classificação de drift (duplicatas de timestamp, divergências declaradas no manifesto, divergências não declaradas, órfãos nos dois sentidos). |
| `scripts/drift-gate.ts` | Entry point executável do gate: lê o banco e o manifesto, chama `scripts/migration-drift.ts`, verifica as evidências somente leitura e sai com código 1 apenas em `blocking_drift`. |
| `src/finance/security.db.test.ts` | Substituto executável de `security.db.test.ts.skip`: matriz real de RLS para `storage.objects`, `employee_notifications` e tabelas financeiras, transacional com `ROLLBACK`. |
| `src/lib/storage-path.ts` | Funções puras `buildClientObjectPath(clientId, fileName)` e `parseClientObjectPath(path)` para o caminho canônico. |
| `src/lib/storage-path.test.ts` | Testes das funções puras de caminho canônico, incluindo rejeição de caminho inválido e de path traversal. |
| `scripts/check-no-service-role.ts` | Verificação estática: nenhuma ocorrência de `service_role` fora de `src/integrations/supabase/client.server.ts`, `scripts/` e arquivos `*.test.ts`. |
| `src/finance/no-service-role.test.ts` | Teste que executa a verificação acima e falha quando houver vazamento no frontend. |
| `supabase/migrations/<gerado>_foundation_security_containment.sql` | Migration corretiva: funções de escopo de storage, políticas separadas de `storage.objects`, políticas de `employee_notifications`, grants/revokes explícitos. Timestamp gerado por `supabase migration new`. |

Arquivos **modificados**:

| Caminho | Mudança |
|---|---|
| `src/lib/clients.functions.ts` | `getUploadUrl` passa a exigir `clientId`, validar escopo lendo `clients` com o cliente autenticado do contexto e gerar o caminho canônico via `buildClientObjectPath`. |
| `src/routes/_authenticated/clientes.tsx` | `handleFileUpload` passa `clientId: cliente.id` para `getUploadUrlFn`. Nenhuma outra alteração visual. |
| `package.json` | Adiciona scripts `baseline`, `drift:check` e `test:db`. Nenhuma dependência nova. |
| `docs/superpowers/specs/2026-08-07-foundation-security-containment-design.md` | Não é modificado. Listado aqui apenas para deixar explícito que permanece intacto. |

Arquivos **removidos**:

| Caminho | Motivo |
|---|---|
| `src/finance/security.db.test.ts.skip` | Substituído pelo arquivo executável `src/finance/security.db.test.ts`. |
| `src/finance/idempotency.red.test.ts` | Removido apenas se, na leitura da Tarefa 8, contiver asserções triviais/placeholder; a cobertura real de idempotência vive em `security.db.test.ts`. |
| `src/finance/idempotency.green.test.ts` | Mesmo critério da linha acima. |

## Tarefas

### Tarefa 1 — Baseline somente leitura

**Files:** `scripts/baseline-snapshot.ts`, `package.json`

**Interfaces:**

```ts
// scripts/baseline-snapshot.ts
export type BusinessCounts = {
  clients: number; loans: number; installments: number;
  payments: number; employees: number; audit_events: number;
};
export type Baseline = {
  capturedAt: string;
  counts: BusinessCounts;
  policies: Array<{ schema: string; table: string; policy: string; cmd: string; using: string | null; check: string | null }>;
  buckets: Array<{ id: string; public: boolean }>;
  storageObjectSample: Array<{ name: string; segments: number }>;
  appliedMigrations: string[];
};
export async function captureBaseline(connectionString: string): Promise<Baseline>;
```

Consultas obrigatórias (todas `SELECT`):

```sql
SELECT 'clients' t, count(*) c FROM public.clients
UNION ALL SELECT 'loans', count(*) FROM public.loans
UNION ALL SELECT 'installments', count(*) FROM public.installments
UNION ALL SELECT 'payments', count(*) FROM public.payments
UNION ALL SELECT 'employees', count(*) FROM public.employees
UNION ALL SELECT 'audit_events', count(*) FROM public.audit_events;

SELECT schemaname, tablename, policyname, cmd, qual, with_check
  FROM pg_policies
 WHERE (schemaname = 'storage' AND tablename = 'objects')
    OR (schemaname = 'public' AND tablename IN ('employee_notifications','clients','loans','installments'));

SELECT id, public FROM storage.buckets;

SELECT name, array_length(string_to_array(name, '/'), 1) AS segments
  FROM storage.objects WHERE bucket_id = 'documents' ORDER BY created_at LIMIT 200;

SELECT version FROM supabase_migrations.schema_migrations ORDER BY version;
```

**Steps:**

- [ ] Criar `scripts/baseline-snapshot.ts` exportando `captureBaseline` e um bloco `main` que lê `process.env["SUPABASE_DB_URL"]`, imprime `JSON.stringify(baseline, null, 2)` e encerra com código 0.
- [ ] Garantir que o script abre a conexão com `BEGIN READ ONLY` e termina com `ROLLBACK`.
- [ ] Adicionar em `package.json`: `"baseline": "bun scripts/baseline-snapshot.ts"`.
- [ ] Executar `bun run baseline > /tmp/baseline-before.json` e conferir que o JSON contém as seis contagens, a lista de políticas de `storage.objects` e a amostra de `name`.
- [ ] Registrar no relatório final quantos objetos do bucket já usam 1, 2 ou 3 segmentos de caminho (entrada da Tarefa 5).
- [ ] Commit sugerido: `chore(security): adiciona snapshot de baseline somente leitura`.

### Tarefa 2 — RED do gate de drift de três estados (funções puras)

**Files:** `src/finance/migration-drift.test.ts`, `scripts/migration-reconciliation.json`

**Interfaces (a serem implementadas na Tarefa 3):**

```ts
// scripts/migration-drift.ts
export type MigrationFile = { file: string; version: string };
export type DriftState = "clean" | "reconciled_legacy" | "blocking_drift";

/** Entrada do manifesto versionado scripts/migration-reconciliation.json */
export type ReconciliationEntry = {
  version: string;
  file: string;
  sha256: string;
  reason: string;
  /** Objetos que a migration deveria ter criado e que já existem no schema real. */
  expectedObjects: string[];
  /** SELECT somente leitura que devolve uma única coluna booleana `present`. */
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
  /** Divergências cobertas pelo manifesto, com fingerprint conferido. */
  reconciledLegacy: ReconciliationEntry[];
  /** Divergências sem entrada válida no manifesto — causam blocking_drift. */
  unreconciled: MigrationFile[];
  /** Entradas do manifesto cujo sha256 não confere ou que não correspondem a divergência real. */
  staleManifestEntries: ReconciliationEntry[];
};

export function parseMigrationFiles(fileNames: string[]): MigrationFile[];
export function compareMigrations(
  files: MigrationFile[],
  applied: string[],
  manifest: ReconciliationManifest,
  fileHashes: Record<string, string>,
): DriftReport;
```

Forma do manifesto (`scripts/migration-reconciliation.json`), preenchido na Tarefa 4 com os valores reais medidos:

```json
{
  "generatedAt": "<ISO-8601 do diagnóstico>",
  "entries": [
    {
      "version": "<14 dígitos>",
      "file": "<nome do arquivo em supabase/migrations>",
      "sha256": "<sha256 do conteúdo do arquivo>",
      "reason": "Aplicada fora do fluxo versionado; efeitos já presentes no schema real, comprovados por consulta somente leitura.",
      "expectedObjects": ["<schema.objeto>", "..."],
      "evidenceQuery": "SELECT (count(*) = <n>) AS present FROM pg_catalog... /* somente leitura */"
    }
  ]
}
```

**Steps:**

- [ ] Criar `src/finance/migration-drift.test.ts` importando `parseMigrationFiles`, `compareMigrations` e os tipos de `../../scripts/migration-drift`.
- [ ] Teste 1: `parseMigrationFiles(["20260805111700_cleanup_qa_data.sql","20260805202000_fix_idempotency.sql"])` devolve versões `"20260805111700"` e `"20260805202000"`.
- [ ] Teste 2: os dois arquivos com timestamp `20260805000000` (`_notifications_and_audit` e `_storage_and_penalties`) aparecem em `duplicatedVersions` com os dois nomes, e a duplicidade sozinha não muda o estado para `blocking_drift`.
- [ ] Teste 3: sem divergências e com manifesto vazio, `state === "clean"`.
- [ ] Teste 4: arquivo sem versão aplicada, **com** entrada de manifesto cujo `sha256` confere, entra em `reconciledLegacy` e `state === "reconciled_legacy"`.
- [ ] Teste 5: arquivo sem versão aplicada, **sem** entrada de manifesto, entra em `unreconciled` e `state === "blocking_drift"`.
- [ ] Teste 6: arquivo sem versão aplicada com entrada de manifesto cujo `sha256` **não** confere entra simultaneamente em `unreconciled` e `staleManifestEntries`, e `state === "blocking_drift"`.
- [ ] Teste 7: versão aplicada sem arquivo entra em `appliedVersionsWithoutFile` e `state === "blocking_drift"` (o manifesto nunca reconcilia este sentido).
- [ ] Teste 8: entrada de manifesto que não corresponde a nenhuma divergência real entra em `staleManifestEntries` e `state === "blocking_drift"`.
- [ ] Comando RED: `bunx vitest run src/finance/migration-drift.test.ts` — deve falhar com erro de módulo inexistente `scripts/migration-drift`.
- [ ] Commit sugerido: `test(security): RED do gate de drift de tres estados`.

### Tarefa 3 — GREEN do comparador de drift

**Files:** `scripts/migration-drift.ts`

**Steps:**

- [ ] Implementar `parseMigrationFiles`: aceitar apenas nomes que casem `/^(\d{14})_.+\.sql$/`; ignorar qualquer outro arquivo.
- [ ] Implementar `compareMigrations`: agrupar arquivos por versão; preencher `duplicatedVersions` quando houver mais de um arquivo na mesma versão; calcular `filesWithoutAppliedVersion` e `appliedVersionsWithoutFile`.
- [ ] Classificar cada item de `filesWithoutAppliedVersion`: se existir entrada de manifesto com mesma `version` + `file` e `fileHashes[file] === entry.sha256`, vai para `reconciledLegacy`; caso contrário vai para `unreconciled` (e a entrada divergente também para `staleManifestEntries`).
- [ ] Marcar como `staleManifestEntries` toda entrada do manifesto sem divergência correspondente (manifesto obsoleto também bloqueia).
- [ ] Definir o estado: `blocking_drift` se `unreconciled`, `appliedVersionsWithoutFile` ou `staleManifestEntries` não estiverem vazios; senão `reconciled_legacy` se `reconciledLegacy` não estiver vazio; senão `clean`.
- [ ] Manter o módulo puro: nenhuma leitura de disco, de banco ou de relógio dentro dessas duas funções — hashes e manifesto entram por parâmetro.
- [ ] Comando GREEN: `bunx vitest run src/finance/migration-drift.test.ts` — 8 testes verdes.
- [ ] Commit sugerido: `feat(security): classificador de drift em tres estados`.

### Tarefa 4 — Gate de drift executável e diagnóstico do drift real

**Files:** `scripts/drift-gate.ts`, `scripts/migration-reconciliation.json`, `package.json`

**Interfaces:**

```ts
// scripts/drift-gate.ts
import type { DriftReport, ReconciliationManifest } from "./migration-drift";

export async function runDriftGate(
  connectionString: string,
  migrationsDir: string,
  manifestPath: string,
): Promise<DriftReport & { evidence: Array<{ version: string; present: boolean }> }>;
```

**Steps:**

- [ ] Implementar `runDriftGate`: `readdirSync(migrationsDir)` → `parseMigrationFiles` → `sha256` de cada arquivo (`createHash("sha256")` sobre o conteúdo bruto) → ler o manifesto → `SELECT version FROM supabase_migrations.schema_migrations ORDER BY version` → `compareMigrations`.
- [ ] Executar toda a leitura de banco dentro de `BEGIN READ ONLY` … `ROLLBACK`. O gate nunca escreve, e em particular **nunca** insere linhas em `supabase_migrations.schema_migrations`.
- [ ] Para cada entrada de `reconciledLegacy`, executar a `evidenceQuery` da entrada (validada como `SELECT` único, sem ponto e vírgula extra e sem DML) e exigir `present === true`; qualquer `present === false` rebaixa o resultado para `blocking_drift`.
- [ ] No `main`, imprimir o relatório formatado com o estado e a lista de evidências, e `process.exit(report.state === "blocking_drift" ? 1 : 0)`.
- [ ] Adicionar em `package.json`: `"drift:check": "bun scripts/drift-gate.ts"`.
- [ ] Diagnóstico RED do drift real: rodar `bun run drift:check` com o manifesto ainda vazio (`{"generatedAt":"…","entries":[]}`) — deve sair com código 1 e estado `blocking_drift`, listando em `unreconciled` as quatro migrations não registradas. Copiar a saída para o relatório de aceite.
- [ ] Para cada uma das quatro versões, comparar somente leitura o SQL do arquivo com o schema real (`pg_policies`, `pg_proc`, `information_schema.columns`, `pg_trigger`) e comprovar que seus objetos/efeitos já existem. Registrar por versão: `sha256`, `expectedObjects` e a `evidenceQuery` usada.
- [ ] Preencher `scripts/migration-reconciliation.json` com essas quatro entradas comprovadas e versioná-lo no repositório.
- [ ] Comando GREEN do gate: `bun run drift:check` — código de saída 0 e estado `reconciled_legacy`, com `present: true` para as quatro entradas.
- [ ] Registrar as quatro versões diagnosticadas no cabeçalho comentado da migration corretiva (criada na Tarefa 10) como referência de auditoria; **não** inserir linhas em `supabase_migrations.schema_migrations` e **não** editar nenhum arquivo de migration existente.
- [ ] Confirmar que, após a Tarefa 10, o estado permanece `reconciled_legacy` (a migration corretiva nova é registrada normalmente pelo fluxo do projeto e não gera nova divergência).
- [ ] Commit sugerido: `feat(security): gate de drift com manifesto de reconciliacao legada`.

### Tarefa 5 — Diagnóstico do layout de caminhos do bucket

**Files:** nenhum arquivo de produção; usa `scripts/baseline-snapshot.ts`

**Steps:**

- [ ] Executar `bun run baseline` e extrair a seção `storageObjectSample`.
- [ ] Classificar cada `name` em: legado de um segmento (`<uuid>.<ext>`, formato atual gerado por `getUploadUrl`) e canônico de três segmentos (`clients/<uuid>/<uuid>.<ext>`).
- [ ] Confirmar por consulta que nenhum objeto existente será renomeado, movido ou apagado nesta entrega.
- [ ] Documentar no relatório: total de objetos legados e a decisão de que as políticas SELECT continuam permitindo leitura de caminho legado **somente** para proprietário, enquanto INSERT passa a exigir o caminho canônico.
- [ ] Commit sugerido: nenhum (etapa somente leitura).

### Tarefa 6 — RED das funções puras de caminho canônico

**Files:** `src/lib/storage-path.test.ts`

**Interfaces (a implementar na Tarefa 7):**

```ts
// src/lib/storage-path.ts
export const CLIENT_OBJECT_PREFIX = "clients";
export function buildClientObjectPath(clientId: string, fileName: string): string;
export function parseClientObjectPath(path: string): { clientId: string; objectId: string; ext: string } | null;
```

**Steps:**

- [ ] Teste 1: `buildClientObjectPath("6f1e...uuid", "rg.PNG")` devolve `clients/6f1e...uuid/<uuid>.png` (extensão minúscula, UUID gerado por `crypto.randomUUID()`).
- [ ] Teste 2: `buildClientObjectPath` lança quando `clientId` não é UUID v4 válido.
- [ ] Teste 3: `buildClientObjectPath` lança quando o nome do arquivo não tem extensão ou contém `/` ou `..`.
- [ ] Teste 4: `parseClientObjectPath("clients/<uuid>/<uuid>.pdf")` devolve os três campos.
- [ ] Teste 5: `parseClientObjectPath` devolve `null` para `"<uuid>.pdf"` (legado), `"clients/../x.pdf"` e `"clients/<uuid>/sub/x.pdf"`.
- [ ] Comando RED: `bunx vitest run src/lib/storage-path.test.ts` — falha por módulo inexistente.
- [ ] Commit sugerido: `test(security): RED do caminho canonico de documentos`.

### Tarefa 7 — GREEN das funções de caminho canônico

**Files:** `src/lib/storage-path.ts`

```ts
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EXT_RE = /^[a-z0-9]{1,10}$/;

export const CLIENT_OBJECT_PREFIX = "clients";

export function buildClientObjectPath(clientId: string, fileName: string): string {
  if (!UUID_RE.test(clientId)) throw new Error("clientId inválido");
  if (fileName.includes("/") || fileName.includes("..")) throw new Error("nome de arquivo inválido");
  const ext = (fileName.split(".").pop() ?? "").toLowerCase();
  if (!fileName.includes(".") || !EXT_RE.test(ext)) throw new Error("extensão inválida");
  return `${CLIENT_OBJECT_PREFIX}/${clientId}/${crypto.randomUUID()}.${ext}`;
}

export function parseClientObjectPath(path: string) {
  const parts = path.split("/");
  if (parts.length !== 3 || parts[0] !== CLIENT_OBJECT_PREFIX) return null;
  const [, clientId, file] = parts;
  const ext = (file.split(".").pop() ?? "").toLowerCase();
  const objectId = file.slice(0, file.length - ext.length - 1);
  if (!UUID_RE.test(clientId) || !UUID_RE.test(objectId) || !EXT_RE.test(ext)) return null;
  return { clientId, objectId, ext };
}
```

**Steps:**

- [ ] Criar `src/lib/storage-path.ts` exatamente com a superfície acima.
- [ ] Comando GREEN: `bunx vitest run src/lib/storage-path.test.ts` — 5 testes verdes.
- [ ] Commit sugerido: `feat(security): caminho canonico de documentos por cliente`.

### Tarefa 8 — Inventário e remoção de testes falsos

**Files:** `src/finance/idempotency.red.test.ts`, `src/finance/idempotency.green.test.ts`, `src/finance/security.db.test.ts.skip`

**Steps:**

- [ ] Ler integralmente `src/finance/idempotency.red.test.ts` e `src/finance/idempotency.green.test.ts` e classificar cada `it` em: cobertura real de comportamento ou placeholder (asserção trivial, `expect(true)`, mock que não exercita a RPC).
- [ ] Se todos os casos forem placeholders, remover os dois arquivos com `rm` e garantir que a idempotência de `public.process_payment_atomic` fique coberta pelo caso real da Tarefa 12.
- [ ] Se houver caso real, manter o arquivo e remover apenas o `it` placeholder, registrando a decisão no relatório.
- [ ] Verificar com `rg -n "describe.skip|it.skip|it.todo|xit\(|\.only\(" src` que a suíte não tem testes ignorados.
- [ ] Comando de comprovação: `bunx vitest run` — verde, sem `skipped`.
- [ ] Commit sugerido: `test(security): remove testes placeholder de idempotencia`.

### Tarefa 9 — RED de RLS real para storage e notificações

**Files:** `src/finance/security.db.test.ts` (novo), remoção de `src/finance/security.db.test.ts.skip`

**Decisão aprovada — papel técnico de testes (a ser aplicada na Tarefa 10):**

A migration corretiva concederá ao papel técnico de testes **somente**:

```sql
GRANT USAGE ON SCHEMA supabase_migrations TO <papel_tecnico_de_testes>;
GRANT SELECT ON supabase_migrations.schema_migrations TO <papel_tecnico_de_testes>;
```

Nenhuma escrita é concedida: sem `INSERT`, `UPDATE`, `DELETE`, `TRUNCATE`, sem
`ALTER DEFAULT PRIVILEGES` e sem qualquer permissão adicional em
`supabase_migrations`. O objetivo é exclusivamente permitir que o gate de drift
e a suíte de RLS leiam o histórico aplicado; o histórico continua imutável e
nenhuma linha pode ser inserida ou corrigida artificialmente.

**Pré-requisito adicional da suíte de RLS (diagnóstico de causa raiz):**
`app.actor_employee_id()` resolve o perfil comparando `public.employees.access_email`
com `auth.users.email` do `auth.uid()` — não usa `employees.auth_user_id`. Por isso
as fixtures de `src/finance/security.db.test.ts` inserem linhas mínimas em
`auth.users` (id igual ao `sub`, e-mail conhecido) para `manager`,
`employeeInTeam`, `employeeOutTeam` e `deactivated`, dentro da mesma transação
com `ROLLBACK`, e usam exatamente esses e-mails em `access_email`. O papel
técnico de testes precisa, portanto, de `SET ROLE authenticated` e de
`INSERT`/`SELECT` transacional em `auth.users`. Enquanto esse papel não existir,
a suíte permanece bloqueada por ambiente (bloqueio explícito, nunca contornado).

**Interfaces:**

```ts
import { Client } from "pg";

type Profile = "owner" | "manager" | "employee_in_team" | "employee_out_team" | "deactivated" | "no_profile";

async function withRollback<T>(fn: (c: Client) => Promise<T>): Promise<T>;
async function asProfile(c: Client, userId: string): Promise<void>; // SET LOCAL request.jwt.claims / role authenticated
```

Assunção de identidade dentro da transação (obrigatória em todos os casos):

```sql
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', $1::text, 'role','authenticated')::text, true);
-- asserções
ROLLBACK;
```

**Steps:**

- [ ] Copiar de `src/finance/security.db.test.ts.skip` os utilitários já existentes de criação de usuário via Admin API e adaptar para o novo arquivo executável.
- [ ] Substituir o guard `const d = enabled ? describe : describe.skip` por falha explícita: quando `SUPABASE_DB_URL`, `SUPABASE_URL` ou `SUPABASE_SERVICE_ROLE_KEY` faltarem, o arquivo lança em `beforeAll` com mensagem clara — nunca ignora silenciosamente.
- [ ] Criar dentro da transação de cada caso os funcionários e clientes de fixture (com `ROLLBACK` garantido em `finally`), cobrindo os seis perfis de `Profile`.
- [ ] Casos de `storage.objects` (bucket `documents`), inserindo objeto de fixture em `clients/<client_uuid>/<object_uuid>.pdf`: owner lê; gerente lê apenas objeto de cliente da própria equipe; funcionário lê apenas objeto da própria carteira; funcionário fora da equipe recebe 0 linhas; desativado recebe 0 linhas; autenticado sem perfil recebe 0 linhas.
- [ ] Casos negativos de escrita em `storage.objects`: INSERT com caminho fora do padrão canônico é rejeitado; UPDATE fora do escopo é rejeitado.
- [ ] Casos de DELETE em `storage.objects` (decisão de segurança aprovada: exclusivo do proprietário): owner apaga; gerente e funcionário são rejeitados **mesmo dentro do próprio escopo**; desativado e sem perfil são rejeitados.
- [ ] Casos de `public.employee_notifications`: owner vê tudo; remetente vê o próprio registro; funcionário destinatário vê o registro em que `employee_id = app.actor_employee_id()`; gerente vê registros da própria equipe; funcionário fora da equipe, desativado e sem perfil recebem 0 linhas; INSERT com `sent_by` diferente de `auth.uid()` é rejeitado; INSERT com `employee_id` fora do escopo é rejeitado.
- [ ] Cada caso afirma linhas esperadas com `expect(rows).toHaveLength(n)` — ausência de erro não é aceita como prova.
- [ ] Remover `src/finance/security.db.test.ts.skip` com `rm`.
- [ ] Comando RED: `bunx vitest run src/finance/security.db.test.ts` — deve falhar mostrando que a política `FOR ALL` por `bucket_id` permite leitura indevida e que `employee_notifications` é visível para todo autenticado (`USING true`).
- [ ] Commit sugerido: `test(security): RED da matriz real de RLS de storage e notificacoes`.

### Tarefa 10 — GREEN: migration corretiva

**Files:** `supabase/migrations/<gerado>_foundation_security_containment.sql`

**Steps:**

- [ ] Criar o arquivo com `supabase migration new foundation_security_containment` (o timestamp é gerado pela CLI; não inventar).
- [ ] Cabeçalho comentado: objetivo, diagnóstico de drift das quatro versões não registradas e declaração de que nenhuma migration aplicada é alterada.
- [ ] Escrever as funções de escopo de storage:

```sql
CREATE OR REPLACE FUNCTION app.storage_object_client_id(p_name text)
RETURNS uuid LANGUAGE sql IMMUTABLE SET search_path = pg_temp AS $$
  SELECT CASE
    WHEN p_name ~ '^clients/[0-9a-f-]{36}/[0-9a-f-]{36}\.[a-z0-9]{1,10}$'
    THEN (split_part(p_name, '/', 2))::uuid
    ELSE NULL
  END;
$$;

CREATE OR REPLACE FUNCTION app.can_access_client_object(p_name text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT app.actor_is_active()
     AND EXISTS (
       SELECT 1 FROM public.clients c
        WHERE c.id = app.storage_object_client_id(p_name)
          AND app.can_request_for(c.employee_id)
     );
$$;
```

- [ ] Remover as políticas inseguras de forma idempotente:

```sql
DROP POLICY IF EXISTS "Owners can manage documents" ON storage.objects;
DROP POLICY IF EXISTS "Owners can access documents" ON storage.objects;
DROP POLICY IF EXISTS "Users can view all notifications" ON public.employee_notifications;
DROP POLICY IF EXISTS "Users can record their own notifications" ON public.employee_notifications;
```

- [ ] Criar políticas separadas por operação em `storage.objects` (sem `FOR ALL`):

```sql
CREATE POLICY "documents_select_scoped" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'documents' AND (app.is_active_owner() OR app.can_access_client_object(name)));

CREATE POLICY "documents_insert_scoped" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'documents'
  AND app.storage_object_client_id(name) IS NOT NULL
  AND (app.is_active_owner() OR app.can_access_client_object(name)));

CREATE POLICY "documents_update_scoped" ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'documents' AND (app.is_active_owner() OR app.can_access_client_object(name)))
WITH CHECK (bucket_id = 'documents'
  AND app.storage_object_client_id(name) IS NOT NULL
  AND (app.is_active_owner() OR app.can_access_client_object(name)));

CREATE POLICY "documents_delete_scoped" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'documents' AND app.is_active_owner());
```

> Decisão de segurança aprovada: `DELETE` no bucket `documents` é restrito a `app.is_active_owner()`. `SELECT`, `INSERT` e `UPDATE` seguem o escopo por cliente/funcionário; a remoção de documentos **não** segue o mesmo escopo, por ser irreversível e destruir prova documental.

- [ ] Criar políticas de `employee_notifications`:

```sql
ALTER TABLE public.employee_notifications ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.employee_notifications FROM anon;
GRANT SELECT, INSERT ON public.employee_notifications TO authenticated;
GRANT ALL ON public.employee_notifications TO service_role;

CREATE POLICY "notifications_select_scoped" ON public.employee_notifications FOR SELECT TO authenticated
USING (
  app.actor_is_active() AND (
    app.is_active_owner()
    OR sent_by = auth.uid()
    OR employee_id = app.actor_employee_id()
    OR app.can_request_for(employee_id)
  )
);

CREATE POLICY "notifications_insert_scoped" ON public.employee_notifications FOR INSERT TO authenticated
WITH CHECK (
  app.actor_is_active()
  AND sent_by = auth.uid()
  AND (app.is_active_owner() OR app.can_request_for(employee_id))
);
```

- [ ] Garantir que nenhuma política de `UPDATE`/`DELETE` é criada para `employee_notifications` (registro é imutável, como já ocorre hoje).
- [ ] Aplicar a migration pelo fluxo de migration do projeto e reexecutar o comando GREEN: `bunx vitest run src/finance/security.db.test.ts` — matriz completa verde.
- [ ] Confirmar por consulta que não resta política `FOR ALL` por `bucket_id`: `SELECT policyname, cmd, qual FROM pg_policies WHERE schemaname='storage' AND tablename='objects';`
- [ ] Commit sugerido: `feat(security): politicas escopadas de storage e notificacoes`.

### Tarefa 11 — RED/GREEN do upload canônico no servidor e na tela

**Files:** `src/lib/clients.functions.ts`, `src/routes/_authenticated/clientes.tsx`, `src/finance/security.db.test.ts`

**Interface nova de `getUploadUrl`:**

```ts
export const getUploadUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { clientId: string; fileName: string; contentType: string }) =>
    z.object({
      clientId: z.string().uuid(),
      fileName: z.string().min(1),
      contentType: z.string().min(1),
    }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context; // cliente autenticado; RLS aplica-se ao ator
    const { data: client, error: clientError } = await supabase
      .from("clients").select("id").eq("id", data.clientId).single();
    if (clientError || !client) throw new Error("Cliente fora do escopo do usuário");

    const filePath = buildClientObjectPath(data.clientId, data.fileName);
    const { data: uploadData, error } = await supabase.storage
      .from("documents").createSignedUploadUrl(filePath);
    if (error) throw error;
    return { url: uploadData.signedUrl, path: filePath, token: uploadData.token };
  });
```

**Steps:**

- [ ] Acrescentar em `src/finance/security.db.test.ts` um caso RED que insere em `storage.objects` um objeto com caminho de um segmento (`<uuid>.pdf`) assumindo a identidade de funcionário e espera rejeição por política.
- [ ] Comando RED: `bunx vitest run src/finance/security.db.test.ts -t "caminho legado"` — falha enquanto o servidor ainda gera caminho de um segmento.
- [ ] Alterar `getUploadUrl` em `src/lib/clients.functions.ts` exatamente conforme a interface acima, importando `buildClientObjectPath` de `@/lib/storage-path`. Não usar `supabaseAdmin`. Não aceitar `employee_id` do frontend.
- [ ] Manter `getSignedUrl` inalterado para preservar a leitura de caminhos legados existentes pelo proprietário.
- [ ] Em `src/routes/_authenticated/clientes.tsx`, alterar apenas a chamada em `handleFileUpload` para `getUploadUrlFn({ data: { clientId: cliente.id, fileName: file.name, contentType: file.type } })`. Nenhuma mudança de layout, texto ou estilo.
- [ ] Não migrar, renomear nem apagar objetos existentes no bucket.
- [ ] Comando GREEN: `bunx vitest run src/finance/security.db.test.ts` e `bunx tsc --noEmit`.
- [ ] Commit sugerido: `feat(security): upload de documentos com caminho canonico validado no servidor`.

### Tarefa 12 — Matriz completa por perfil e prova de rollback

**Files:** `src/finance/security.db.test.ts`

**Steps:**

- [ ] Garantir que a matriz cobre os seis perfis (`owner`, `manager`, `employee_in_team`, `employee_out_team`, `deactivated`, `no_profile`) para `storage.objects` e `employee_notifications`, com caso permitido e caso negado em cada célula. Na coluna `DELETE` de `storage.objects` a única célula permitida é `owner`.
- [ ] Acrescentar caso de idempotência real de `public.process_payment_atomic`: duas chamadas com a mesma `p_idempotency_key` retornam o mesmo `payments.id` dentro da transação, com `ROLLBACK` ao final.
- [ ] Acrescentar teste de prova de rollback: contar `public.clients` no início, inserir fixture, `ROLLBACK`, recontar em nova conexão e exigir igualdade.
- [ ] Comando: `bunx vitest run src/finance/security.db.test.ts` — verde, com saída listando cada perfil e cada objeto.
- [ ] Commit sugerido: `test(security): matriz completa por perfil e prova de rollback`.

### Tarefa 13 — Verificação de ausência de `service_role` no frontend

**Files:** `scripts/check-no-service-role.ts`, `src/finance/no-service-role.test.ts`

**Interfaces:**

```ts
// scripts/check-no-service-role.ts
export type ServiceRoleHit = { file: string; line: number; text: string };
export function findServiceRoleLeaks(rootDir: string): ServiceRoleHit[];
```

Regra de allowlist (permitido apenas no servidor):

```ts
const ALLOWED = [
  "src/integrations/supabase/client.server.ts",
  /^scripts\//,
  /\.test\.ts$/,
];
```

**Steps:**

- [ ] Escrever primeiro `src/finance/no-service-role.test.ts` com: (a) caso que exige `findServiceRoleLeaks("src")` vazio; (b) caso que confirma que uma ocorrência em `src/integrations/supabase/client.server.ts` **não** é reportada; (c) caso que confirma que uma ocorrência simulada em um caminho de rota **é** reportada.
- [ ] Comando RED: `bunx vitest run src/finance/no-service-role.test.ts` — falha por módulo inexistente.
- [ ] Implementar `findServiceRoleLeaks` varrendo arquivos `.ts`/`.tsx` sob `rootDir`, ignorando a allowlist, procurando `service_role` e `SUPABASE_SERVICE_ROLE_KEY`.
- [ ] Comando GREEN: `bunx vitest run src/finance/no-service-role.test.ts`.
- [ ] Verificação adicional do bundle: `bun run build` seguido de `rg -n "service_role" dist` — nenhum resultado.
- [ ] Commit sugerido: `test(security): gate de ausencia de service_role no frontend`.

### Tarefa 14 — Contagens antes/depois idênticas

**Files:** nenhum arquivo de produção

**Steps:**

- [ ] Executar `bun run baseline > /tmp/baseline-after.json`.
- [ ] Comparar com `diff <(jq .counts /tmp/baseline-before.json) <(jq .counts /tmp/baseline-after.json)` — saída vazia obrigatória.
- [ ] Anexar ao relatório o `diff` das seções `policies` de antes e depois, evidenciando apenas remoção das políticas inseguras e criação das políticas escopadas.
- [ ] Commit sugerido: nenhum (etapa de evidência).

### Tarefa 15 — Execução final integral

**Files:** `package.json` (scripts `test:db` e `drift:check`)

**Steps:**

- [ ] `bunx vitest run` — suíte completa verde, zero `skipped`.
- [ ] `bunx tsc --noEmit` — zero erros.
- [ ] `bunx eslint .` — zero erros e zero warnings.
- [ ] `bun run build` — build de produção concluído.
- [ ] `bun run test:db` (`vitest run src/finance/security.db.test.ts`) — evidência por perfil e por objeto, com `ROLLBACK` confirmado.
- [ ] `bun run drift:check` — código de saída 0 e estado `clean` ou `reconciled_legacy`; `blocking_drift` reprova o aceite. Anexar ao relatório o estado, as entradas reconciliadas e suas evidências.
- [ ] Confirmar que `supabase_migrations.schema_migrations` não recebeu nenhuma inserção manual: comparar a lista de versões aplicadas do `/tmp/baseline-before.json` com a de `/tmp/baseline-after.json`; a única diferença aceita é a versão da migration corretiva aplicada pelo fluxo do projeto.
- [ ] Confirmar que nenhum script usa `bunx tsx`: `rg -n "bunx tsx" package.json scripts` — sem resultados.
- [ ] `SELECT policyname, cmd, qual, with_check FROM pg_policies WHERE (schemaname='storage' AND tablename='objects') OR (schemaname='public' AND tablename='employee_notifications');` — conferir o conjunto final.
- [ ] Confirmar explicitamente no relatório: nenhuma publicação realizada.
- [ ] Commit sugerido: `chore(security): evidencias de aceite da contencao da fundacao`.

## Rollback

- O rollback é uma **migration nova** criada com `supabase migration new revert_foundation_security_containment`; nenhuma migration aplicada é editada, renomeada ou removida.
- Conteúdo do rollback: `DROP POLICY IF EXISTS` para `documents_select_scoped`, `documents_insert_scoped`, `documents_update_scoped`, `documents_delete_scoped`, `notifications_select_scoped`, `notifications_insert_scoped`; `DROP FUNCTION IF EXISTS app.can_access_client_object(text)` e `app.storage_object_client_id(text)`; recriação das políticas anteriores apenas se houver decisão explícita de restaurar o estado inseguro (não recomendado; a alternativa preferida é corrigir para frente).
- Como a entrega não altera dados, o rollback não envolve restauração de linhas. As contagens da Tarefa 14 permanecem válidas antes e depois de qualquer rollback estrutural.
