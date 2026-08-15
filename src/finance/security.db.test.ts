/**
 * Matriz REAL de RLS (PostgreSQL) para `storage.objects` do bucket `documents`
 * e `public.employee_notifications`.
 *
 * Regras desta suíte:
 * - Nenhum usuário é criado via Admin API. As identidades são apenas `sub`
 *   (UUID) injetados em `request.jwt.claims` dentro da transação.
 * - Todas as fixtures nascem e morrem dentro de `BEGIN ... ROLLBACK`.
 *   Nada é persistido no banco real.
 * - Ausência de erro NÃO é prova: cada caso afirma a contagem de linhas.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Client } from "pg";

const DB_URL = process.env["FR_TEST_DB_URL"] ?? process.env["SUPABASE_DB_URL"];

type Profiles = {
  owner: string;
  manager: string;
  employeeInTeam: string;
  employeeOutTeam: string;
  deactivated: string;
  noProfile: string;
};

type Fixture = {
  users: Profiles;
  emails: Record<keyof Profiles, string | null>;
  teamEmployeeId: string;
  outEmployeeId: string;
  deactivatedEmployeeId: string;
  teamClientId: string;
  outClientId: string;
  teamObjectPath: string;
  outObjectPath: string;
  teamNotificationId: string;
  outNotificationId: string;
};

let db: Client;

const uuid = () => crypto.randomUUID();

async function assertPrerequisites(c: Client) {
  await c.query("begin");
  try {
    await c.query("set local role authenticated");
  } catch {
    throw new Error(
      "O papel do banco usado nos testes não pode assumir `authenticated`. " +
        "É necessário um papel técnico de testes com `SET ROLE authenticated`, " +
        "leitura de `public`, `storage` e `USAGE` em `supabase_migrations` + " +
        "`SELECT` em `supabase_migrations.schema_migrations` (sem escrita).",
    );
  } finally {
    await c.query("rollback");
  }
}

async function seed(c: Client): Promise<Fixture> {
  const users: Profiles = {
    owner: uuid(),
    manager: uuid(),
    employeeInTeam: uuid(),
    employeeOutTeam: uuid(),
    deactivated: uuid(),
    noProfile: uuid(),
  };
  const mail = (tag: string) => `fr-rls-${tag}-${uuid()}@example.test`;

  // `app.actor_employee_id()` resolve o perfil comparando `employees.access_email`
  // com `auth.users.email` do `auth.uid()`. Sem linha em `auth.users`, nenhum
  // perfil real é representado. Tudo abaixo vive dentro da transação com ROLLBACK.
  const emails: Record<keyof Profiles, string | null> = {
    owner: mail("owner"),
    manager: mail("mgr"),
    employeeInTeam: mail("emp-team"),
    employeeOutTeam: mail("emp-out"),
    deactivated: mail("emp-off"),
    noProfile: null,
  };

  const insAuthUser = async (id: string, email: string) => {
    await c.query(
      `insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
       values ($1, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', $2, now(), now())`,
      [id, email],
    );
  };

  for (const key of ["manager", "employeeInTeam", "employeeOutTeam", "deactivated"] as const) {
    await insAuthUser(users[key], emails[key]!);
  }

  await c.query(
    `insert into public.owner_access (email, auth_user_id, is_active, access_type)
     values ($1, $2, true, 'proprietario_definitivo')`,
    [emails.owner, users.owner],
  );

  const insEmployee = async (
    name: string,
    accessEmail: string | null,
    role: string,
    active: boolean,
    team: string[] | null,
  ) => {
    const r = await c.query(
      `insert into public.employees (full_name, phone, whatsapp, access_email, role, is_active, status, managed_team_ids)
       values ($1, left(gen_random_uuid()::text,12), left(gen_random_uuid()::text,12), $2, $3, $4, $5, $6)
       returning id`,
      [name, accessEmail, role, active, active ? "ativo" : "inativo", team],
    );
    return r.rows[0].id as string;
  };

  // Vinculação exclusivamente por e-mail (nunca por `employees.auth_user_id`).
  const teamEmployeeId = await insEmployee(
    "emp-team",
    emails.employeeInTeam,
    "employee",
    true,
    null,
  );
  const outEmployeeId = await insEmployee(
    "emp-out",
    emails.employeeOutTeam,
    "employee",
    true,
    null,
  );
  const deactivatedEmployeeId = await insEmployee(
    "emp-off",
    emails.deactivated,
    "employee",
    false,
    null,
  );
  // `noProfile` permanece sem qualquer linha em `public.employees`.
  await insEmployee("mgr", emails.manager, "manager", true, [teamEmployeeId]);

  const insClient = async (employeeId: string, name: string) =>
    (
      await c.query(
        `insert into public.clients (employee_id, full_name, phone)
         values ($1,$2,left(gen_random_uuid()::text,12)) returning id`,
        [employeeId, name],
      )
    ).rows[0].id as string;

  const teamClientId = await insClient(teamEmployeeId, "Cliente Equipe");
  const outClientId = await insClient(outEmployeeId, "Cliente Fora");

  const teamObjectPath = `clients/${teamClientId}/${uuid()}.pdf`;
  const outObjectPath = `clients/${outClientId}/${uuid()}.pdf`;
  for (const p of [teamObjectPath, outObjectPath]) {
    await c.query(
      `insert into storage.objects (bucket_id, name, owner, metadata)
       values ('documents', $1, null, '{}'::jsonb)`,
      [p],
    );
  }

  const insNotif = async (employeeId: string, sentBy: string) =>
    (
      await c.query(
        `insert into public.employee_notifications
           (employee_id, installment_ids, notification_type, sent_by, status, idempotency_key)
         values ($1, ARRAY[]::uuid[], 'cobranca', $2, 'enviado', gen_random_uuid()::text) returning id`,
        [employeeId, sentBy],
      )
    ).rows[0].id as string;

  const teamNotificationId = await insNotif(teamEmployeeId, users.owner);
  const outNotificationId = await insNotif(outEmployeeId, users.owner);

  return {
    users,
    emails,
    teamEmployeeId,
    outEmployeeId,
    deactivatedEmployeeId,
    teamClientId,
    outClientId,
    teamObjectPath,
    outObjectPath,
    teamNotificationId,
    outNotificationId,
  };
}

async function withRollback(fn: (f: Fixture) => Promise<void>) {
  await db.query("begin");
  try {
    const fixture = await seed(db);
    await fn(fixture);
  } finally {
    await db.query("rollback");
  }
}

/** Assume a identidade dentro da transação corrente. */
async function asProfile(sub: string | null) {
  await db.query("reset role");
  await db.query("select set_config('request.jwt.claims', $1, true)", [
    sub ? JSON.stringify({ sub, role: "authenticated" }) : JSON.stringify({}),
  ]);
  await db.query("set local role authenticated");
}

async function asSeeder() {
  await db.query("reset role");
}

async function count(sql: string, params: unknown[] = []) {
  await db.query("savepoint sp");
  try {
    const r = await db.query(sql, params);
    await db.query("release savepoint sp");
    return r.rows.length;
  } catch (e) {
    await db.query("rollback to savepoint sp");
    throw e;
  }
}

async function expectDenied(sql: string, params: unknown[] = []) {
  await db.query("savepoint sp");
  let denied = false;
  try {
    await db.query(sql, params);
  } catch {
    denied = true;
  }
  await db.query("rollback to savepoint sp");
  expect(denied).toBe(true);
}

beforeAll(async () => {
  if (!DB_URL) {
    throw new Error(
      "FR_TEST_DB_URL/SUPABASE_DB_URL ausente: a matriz de RLS exige banco real. " +
        "Esta suíte nunca deve ser ignorada silenciosamente.",
    );
  }
  db = new Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });
  await db.connect();
  await assertPrerequisites(db);
}, 60_000);

afterAll(async () => {
  if (db) await db.end();
});

describe("Sanidade das fixtures — identidade resolvida pelo banco", () => {
  it("public.get_current_user_role() devolve o papel real de cada perfil", async () => {
    await withRollback(async (f) => {
      const roleOf = async (sub: string | null) => {
        await asProfile(sub);
        const r = await db.query(`select public.get_current_user_role() as role`);
        return r.rows[0].role as string | null;
      };

      expect(await roleOf(f.users.owner)).toBe("owner");
      expect(await roleOf(f.users.manager)).toBe("manager");
      expect(await roleOf(f.users.employeeInTeam)).toBe("employee");
      expect(await roleOf(f.users.employeeOutTeam)).toBe("employee");
      expect(await roleOf(f.users.deactivated)).toBeNull();
      expect(await roleOf(f.users.noProfile)).toBeNull();

      await asSeeder();
    });
  });
});

describe("RLS real — storage.objects (bucket documents)", () => {
  it("leitura por perfil respeita o escopo da carteira", async () => {
    await withRollback(async (f) => {
      const q = `select name from storage.objects where bucket_id='documents' and name in ($1,$2)`;
      const args = [f.teamObjectPath, f.outObjectPath];

      await asProfile(f.users.owner);
      expect(await count(q, args)).toBe(2);

      await asProfile(f.users.manager);
      expect(await count(q, args)).toBe(1);

      await asProfile(f.users.employeeInTeam);
      expect(await count(q, args)).toBe(1);

      await asProfile(f.users.employeeOutTeam);
      expect(await count(q, args)).toBe(1);

      await asProfile(f.users.deactivated);
      expect(await count(q, args)).toBe(0);

      await asProfile(f.users.noProfile);
      expect(await count(q, args)).toBe(0);

      await asSeeder();
    });
  });

  it("escrita fora do caminho canônico ou fora do escopo é rejeitada", async () => {
    await withRollback(async (f) => {
      await asProfile(f.users.employeeInTeam);
      await expectDenied(
        `insert into storage.objects (bucket_id, name, metadata) values ('documents', $1, '{}'::jsonb)`,
        [`${crypto.randomUUID()}.pdf`],
      );
      await expectDenied(
        `insert into storage.objects (bucket_id, name, metadata) values ('documents', $1, '{}'::jsonb)`,
        [`clients/${f.outClientId}/${crypto.randomUUID()}.pdf`],
      );
      await expectDenied(`update storage.objects set name = name || '.x' where name = $1`, [
        f.outObjectPath,
      ]);
      await asSeeder();
    });
  });

  it("caminho legado de um segmento é rejeitado no INSERT para todos os perfis", async () => {
    await withRollback(async (f) => {
      for (const sub of [
        f.users.owner,
        f.users.manager,
        f.users.employeeInTeam,
        f.users.employeeOutTeam,
      ]) {
        await asProfile(sub);
        await expectDenied(
          `insert into storage.objects (bucket_id, name, metadata) values ('documents', $1, '{}'::jsonb)`,
          [`${crypto.randomUUID()}.pdf`],
        );
      }
      await asSeeder();
    });
  });

  it("caminho canônico dentro do escopo é aceito no INSERT", async () => {
    await withRollback(async (f) => {
      await asProfile(f.users.employeeInTeam);
      const path = `clients/${f.teamClientId}/${crypto.randomUUID()}.pdf`;
      await db.query(
        `insert into storage.objects (bucket_id, name, metadata) values ('documents', $1, '{}'::jsonb)`,
        [path],
      );
      expect(await count(`select name from storage.objects where name = $1`, [path])).toBe(1);
      await asSeeder();
    });
  });

  it("DELETE de documentos é exclusivo do proprietário ativo", async () => {
    await withRollback(async (f) => {
      for (const sub of [
        f.users.manager,
        f.users.employeeInTeam,
        f.users.employeeOutTeam,
        f.users.deactivated,
        f.users.noProfile,
      ]) {
        await asProfile(sub);
        await db.query("savepoint sp");
        await db.query(`delete from storage.objects where name = $1`, [f.teamObjectPath]);
        await db.query("release savepoint sp");
        await asSeeder();
        expect(
          (await db.query(`select 1 from storage.objects where name = $1`, [f.teamObjectPath])).rows
            .length,
        ).toBe(1);
      }

      await asProfile(f.users.owner);
      await db.query(`delete from storage.objects where name = $1`, [f.teamObjectPath]);
      await asSeeder();
      expect(
        (await db.query(`select 1 from storage.objects where name = $1`, [f.teamObjectPath])).rows
          .length,
      ).toBe(0);
    });
  });
});

describe("RLS real — public.employee_notifications", () => {
  it("leitura por perfil respeita o escopo", async () => {
    await withRollback(async (f) => {
      const q = `select id from public.employee_notifications where id in ($1,$2)`;
      const args = [f.teamNotificationId, f.outNotificationId];

      await asProfile(f.users.owner);
      expect(await count(q, args)).toBe(2);

      await asProfile(f.users.manager);
      expect(await count(q, args)).toBe(1);

      await asProfile(f.users.employeeInTeam);
      expect(await count(q, args)).toBe(1);

      await asProfile(f.users.employeeOutTeam);
      expect(await count(q, args)).toBe(1);

      await asProfile(f.users.deactivated);
      expect(await count(q, args)).toBe(0);

      await asProfile(f.users.noProfile);
      expect(await count(q, args)).toBe(0);

      await asSeeder();
    });
  });

  it("INSERT com sent_by de terceiro ou employee_id fora do escopo é rejeitado", async () => {
    await withRollback(async (f) => {
      const ins = `insert into public.employee_notifications
        (employee_id, installment_ids, notification_type, sent_by, status, idempotency_key)
        values ($1, ARRAY[]::uuid[], 'cobranca', $2, 'enviado', gen_random_uuid()::text)`;

      await asProfile(f.users.employeeInTeam);
      await expectDenied(ins, [f.teamEmployeeId, f.users.owner]);
      await expectDenied(ins, [f.outEmployeeId, f.users.employeeInTeam]);

      await asProfile(f.users.noProfile);
      await expectDenied(ins, [f.teamEmployeeId, f.users.noProfile]);

      await asProfile(f.users.deactivated);
      await expectDenied(ins, [f.teamEmployeeId, f.users.deactivated]);

      await asSeeder();
    });
  });
});

describe("Idempotência real de public.process_payment_atomic", () => {
  it("duas chamadas com a mesma chave devolvem o mesmo payment.id", async () => {
    await withRollback(async (f) => {
      // Contrato mínimo dentro da transação (tudo desfeito no ROLLBACK).
      const loanId = (
        await db.query(
          `insert into public.loans
             (client_id, employee_id, frequency, principal_amount, fr_rate, fr_profit_amount,
              employee_profit_kind, employee_profit_input, employee_profit_amount, total_amount,
              installments_count, start_date, status, approval_status)
           values ($1,$2,'semanal',100000,0.2,20000,'fixo',40000,40000,160000,1,current_date,'ativo','approved')
           returning id`,
          [f.teamClientId, f.teamEmployeeId],
        )
      ).rows[0].id as string;

      const instId = (
        await db.query(
          `insert into public.installments
             (loan_id, number, due_date, principal_amount, fr_profit_amount, employee_profit_amount,
              total_amount, outstanding_amount, paid_amount, penalty_amount, status)
           values ($1,1,current_date,100000,20000,40000,160000,160000,0,0,'pendente')
           returning id`,
          [loanId],
        )
      ).rows[0].id as string;

      await asProfile(f.users.owner);
      const key = `idem-${crypto.randomUUID()}`;
      const call = async () =>
        (
          await db.query(
            `select public.process_payment_atomic($1,$2,$3,$4,current_date,'pix',null,null) as r`,
            [key, instId, 160000, 0],
          )
        ).rows[0].r as { id: string };

      const first = await call();
      const second = await call();
      expect(second.id).toBe(first.id);
      expect(await count(`select id from public.payments where idempotency_key = $1`, [key])).toBe(
        1,
      );

      await asSeeder();
    });
  });
});

describe("Prova de rollback — nada é persistido", () => {
  it("contagem de public.clients é idêntica antes e depois, em nova conexão", async () => {
    const before = new Client({
      connectionString: DB_URL,
      ssl: { rejectUnauthorized: false },
    });
    await before.connect();
    const readCount = async (c: Client) =>
      Number((await c.query(`select count(*)::int as n from public.clients`)).rows[0].n);
    const readAll = async (c: Client) => ({
      clients: await readCount(c),
      notifications: Number(
        (await c.query(`select count(*)::int as n from public.employee_notifications`)).rows[0].n,
      ),
      objects: Number(
        (
          await c.query(
            `select count(*)::int as n from storage.objects where bucket_id = 'documents'`,
          )
        ).rows[0].n,
      ),
    });
    const antesTudo = await readAll(before);
    const antes = antesTudo.clients;
    await before.end();

    await withRollback(async () => {
      expect(await readCount(db)).toBeGreaterThanOrEqual(antes);
    });

    const after = new Client({
      connectionString: DB_URL,
      ssl: { rejectUnauthorized: false },
    });
    await after.connect();
    const depoisTudo = await readAll(after);
    const depois = depoisTudo.clients;
    await after.end();

    expect(depois).toBe(antes);
    expect(depoisTudo.notifications).toBe(antesTudo.notifications);
    expect(depoisTudo.objects).toBe(antesTudo.objects);
  });
});

describe("Funções de escopo de storage — totalidade e permissão", () => {
  it("UUID malformado devolve NULL em vez de erro de cast", async () => {
    await db.query("begin");
    try {
      const bad = [
        "clients/------------------------------------/6f1e2c3a-4b5d-4e6f-8a9b-0c1d2e3f4a5b.pdf",
        "clients/gggggggg-gggg-gggg-gggg-gggggggggggg/6f1e2c3a-4b5d-4e6f-8a9b-0c1d2e3f4a5b.pdf",
        "clients/6f1e2c3a-4b5d-0e6f-8a9b-0c1d2e3f4a5b/6f1e2c3a-4b5d-4e6f-8a9b-0c1d2e3f4a5b.pdf",
        "clients/6f1e2c3a-4b5d-4e6f-ca9b-0c1d2e3f4a5b/6f1e2c3a-4b5d-4e6f-8a9b-0c1d2e3f4a5b.pdf",
        "clients/../x.pdf",
        "arquivo-legado.pdf",
      ];
      for (const p of bad) {
        const r = await db.query(`select app.storage_object_client_id($1) as id`, [p]);
        expect(r.rows[0].id).toBeNull();
      }
      const okPath = `clients/${crypto.randomUUID()}/${crypto.randomUUID()}.pdf`;
      const ok = await db.query(`select app.storage_object_client_id($1) as id`, [okPath]);
      expect(ok.rows[0].id).toBe(okPath.split("/")[1]);
    } finally {
      await db.query("rollback");
    }
  });

  it("PUBLIC não tem EXECUTE na ACL; anon negado; authenticated/service_role permitidos", async () => {
    // PUBLIC não é papel: `has_function_privilege('public', ...)` resolveria o
    // papel chamado "public" (inexistente) e falharia. A concessão implícita a
    // PUBLIC só é verificável na ACL da função (grantee = 0 em aclexplode).
    const publicGrants = async (fn: string) =>
      Number(
        (
          await db.query(
            `select count(*)::int as n
               from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
              where p.oid = $1::regprocedure
                and a.grantee = 0
                and a.privilege_type = 'EXECUTE'`,
            [fn],
          )
        ).rows[0].n,
      );

    const perm = async (role: string, fn: string) =>
      (await db.query(`select has_function_privilege($1, $2, 'EXECUTE') as ok`, [role, fn])).rows[0]
        .ok as boolean;

    for (const fn of ["app.storage_object_client_id(text)", "app.can_access_client_object(text)"]) {
      // ACL não nula prova REVOKE explícito; grantee 0 (PUBLIC) sem EXECUTE.
      expect(
        (
          await db.query(
            `select proacl is not null as acl from pg_proc where oid = $1::regprocedure`,
            [fn],
          )
        ).rows[0].acl,
      ).toBe(true);
      expect(await publicGrants(fn)).toBe(0);
      expect(await perm("anon", fn)).toBe(false);
      expect(await perm("authenticated", fn)).toBe(true);
      expect(await perm("service_role", fn)).toBe(true);
    }
  });
});
