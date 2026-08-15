import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { Database } from "@/integrations/supabase/types";
import { buildClientObjectPath } from "@/lib/storage-path";

type ClientInsert = Database["public"]["Tables"]["clients"]["Insert"];
type ClientUpdate = Database["public"]["Tables"]["clients"]["Update"];
type PenaltyKind = NonNullable<ClientInsert["penalty_kind"]>;

const clientSchema = z.object({
  full_name: z.string().min(3),
  phone: z.string().min(10),
  cpf: z.string().nullable().optional(),
  rg: z.string().nullable().optional(),
  birth_date: z.string().nullable().optional(),
  employee_id: z.string().uuid(),
  profession: z.string().nullable().optional(),
  reported_income: z.number().nullable().optional(),
  pix_key: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  penalty_kind: z.enum(["nenhuma", "percentual_dia", "percentual_fixo", "valor_fixo"]).optional(),
  penalty_value: z.number().optional(),
  penalty_grace_days: z.number().optional(),
  delay_interest_kind: z.string().optional(),
  delay_interest_rate: z.number().optional(),
});

export type CreateClientInput = z.infer<typeof clientSchema>;

export const createClient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => clientSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    // Duplicity check by phone
    const { data: existing } = await supabase
      .from("clients")
      .select("id")
      .eq("phone", data.phone)
      .maybeSingle();

    if (existing) {
      throw new Error("Cliente já cadastrado com este telefone");
    }

    const insertData: ClientInsert = {
      full_name: data.full_name,
      phone: data.phone,
      employee_id: data.employee_id,
      cpf: data.cpf ?? null,
      rg: data.rg ?? null,
      birth_date: data.birth_date ? data.birth_date.slice(0, 10) : null,
      profession: data.profession ?? null,
      reported_income: data.reported_income ?? null,
      pix_key: data.pix_key ?? null,
      notes: data.notes ?? null,
      penalty_kind: (data.penalty_kind as PenaltyKind | undefined) ?? "nenhuma",
      penalty_value: data.penalty_value ?? 0,
      penalty_grace_days: data.penalty_grace_days ?? 0,
      delay_interest_kind: data.delay_interest_kind ?? "diario",
      delay_interest_rate: data.delay_interest_rate ?? 0,
    };

    const { data: client, error } = await supabase
      .from("clients")
      .insert(insertData)
      .select()
      .single();

    if (error) throw error;
    return client;
  });

export const updateClient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) =>
    z.object({ id: z.string().uuid(), updates: clientSchema.partial() }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: client, error } = await supabase
      .from("clients")
      .update(data.updates as ClientUpdate)
      .eq("id", data.id)
      .select()
      .single();
    if (error) throw error;
    return client;
  });

export const getClients = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data, error } = await supabase
      .from("clients")
      .select("*, employees(full_name)")
      .order("full_name");
    if (error) throw error;
    return data;
  });

export const getSignedUrl = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((path: string) => z.string().parse(path))
  .handler(async ({ data: path, context }) => {
    const { supabase } = context;

    // Validar se o path está no formato clients/{client_id}/{filename}
    const parts = path.split("/");
    if (parts[0] !== "clients" || !parts[1]) {
      throw new Error("Caminho de arquivo inválido.");
    }
    const clientId = parts[1];

    // Verificar se o cliente correspondente está no escopo do usuário
    const { data: client, error: clientError } = await supabase
      .from("clients")
      .select("id")
      .eq("id", clientId)
      .maybeSingle();

    if (clientError || !client) {
      throw new Error("Cliente fora do escopo ou não encontrado.");
    }

    const { data, error } = await supabase.storage.from("documents").createSignedUrl(path, 3600);
    if (error) throw error;
    return data.signedUrl;
  });

export const getUploadUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { clientId: string; fileName: string; contentType: string }) =>
    z
      .object({
        clientId: z.string().uuid(),
        fileName: z.string().min(1),
        contentType: z.string().min(1),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    // Validar tipo de arquivo
    const allowedTypes = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
    if (!allowedTypes.includes(data.contentType.toLowerCase())) {
      throw new Error("Formato de arquivo não suportado. Apenas imagens e PDFs são permitidos.");
    }

    // RLS aplica-se ao ator: cliente fora do escopo não é visível.
    const { data: client, error: clientError } = await supabase
      .from("clients")
      .select("id")
      .eq("id", data.clientId)
      .single();
    if (clientError || !client) throw new Error("Cliente fora do escopo do usuário");

    const filePath = buildClientObjectPath(data.clientId, data.fileName);

    const { data: uploadData, error } = await supabase.storage
      .from("documents")
      .createSignedUploadUrl(filePath);

    if (error) throw error;
    return { url: uploadData.signedUrl, path: filePath, token: uploadData.token };
  });
