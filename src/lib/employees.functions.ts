import { callRpc } from "@/lib/rpc";
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getEmployees = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("employees")
      .select("*")
      .order("full_name", { ascending: true });

    if (error) throw error;
    return data;
  });

export const updateEmployeePreference = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) =>
    z
      .object({
        employeeId: z.string().uuid(),
        preference: z.enum(["individual", "consolidated_daily", "both"]),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Check if user is owner
    const userData = await callRpc<string | null>(supabase, "get_user_role", { user_id: userId });
    if (userData !== "owner") {
      throw new Error("Apenas proprietários podem alterar configurações de funcionários.");
    }

    const { data: employee, error: empError } = await supabase
      .from("employees")
      .select("notification_preference, full_name")
      .eq("id", data.employeeId)
      .single();

    if (empError) throw empError;

    const { error } = await supabase
      .from("employees")
      .update({ notification_preference: data.preference })
      .eq("id", data.employeeId);

    if (error) throw error;

    // Log the change for audit
    await supabase.from("audit_events").insert({
      entity_table: "employees",
      entity_id: data.employeeId,
      action: "update_preference",
      payload: {
        old_values: { notification_preference: employee.notification_preference },
        new_values: { notification_preference: data.preference },
      },
      actor_user_id: userId,
    });

    return { success: true };
  });

import { z } from "zod";

export const createEmployee = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) =>
    z.object({
      full_name: z.string().min(2),
      whatsapp: z.string().min(8),
      phone: z.string().min(8),
      cpf: z.string().optional().nullable(),
      pix_key: z.string().optional().nullable(),
      notes: z.string().optional().nullable(),
      commission_rate_percent: z.number().min(0).max(100).optional(),
      penalty_split_percent: z.number().min(0).max(100).optional(),
    }).parse(data)
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    // Check owner
    const role = await callRpc<string | null>(supabase, "get_user_role", { user_id: userId });
    if (role !== "owner") {
      throw new Error("Apenas proprietários podem cadastrar funcionários.");
    }
    
    const { data: employee, error } = await supabase
      .from("employees")
      .insert({
        full_name: data.full_name,
        whatsapp: data.whatsapp,
        phone: data.phone,
        cpf: data.cpf || null,
        pix_key: data.pix_key || null,
        notes: data.notes || null,
        status: "ativo",
        commission_rate_percent: data.commission_rate_percent ?? 10,
        penalty_split_percent: data.penalty_split_percent ?? 50,
      })
      .select()
      .single();
      
    if (error) throw error;
    
    // Audit
    await supabase.from("audit_events").insert({
      entity_table: "employees",
      entity_id: employee.id,
      action: "create",
      payload: employee,
      actor_user_id: userId,
    });
    
    return employee;
  });

export const updateEmployee = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) =>
    z.object({
      id: z.string().uuid(),
      updates: z.object({
        full_name: z.string().min(2).optional(),
        whatsapp: z.string().min(8).optional(),
        phone: z.string().min(8).optional(),
        cpf: z.string().optional().nullable(),
        pix_key: z.string().optional().nullable(),
        notes: z.string().optional().nullable(),
        status: z.enum(["ativo", "inativo"]).optional(),
        commission_rate_percent: z.number().min(0).max(100).optional(),
        penalty_split_percent: z.number().min(0).max(100).optional(),
      })
    }).parse(data)
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    // Check owner
    const role = await callRpc<string | null>(supabase, "get_user_role", { user_id: userId });
    if (role !== "owner") {
      throw new Error("Apenas proprietários podem editar funcionários.");
    }
    
    const { data: oldEmp } = await supabase
      .from("employees")
      .select("*")
      .eq("id", data.id)
      .single();
      
    const { data: employee, error } = await supabase
      .from("employees")
      .update(data.updates as any)
      .eq("id", data.id)
      .select()
      .single();
      
    if (error) throw error;
    
    // Audit
    await supabase.from("audit_events").insert({
      entity_table: "employees",
      entity_id: employee.id,
      action: "update",
      payload: { old_values: oldEmp, new_values: employee },
      actor_user_id: userId,
    });
    
    return employee;
  });

export const deleteEmployee = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) =>
    z.object({
      id: z.string().uuid(),
    }).parse(data)
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    // Check owner
    const role = await callRpc<string | null>(supabase, "get_user_role", { user_id: userId });
    if (role !== "owner") {
      throw new Error("Apenas proprietários podem excluir funcionários.");
    }
    
    const { data: employee } = await supabase
      .from("employees")
      .select("*")
      .eq("id", data.id)
      .single();
      
    const { error } = await supabase
      .from("employees")
      .delete()
      .eq("id", data.id);
      
    if (error) {
      if (error.code === "23503") {
        throw new Error("Não é possível excluir este funcionário pois ele possui clientes ou cobranças associadas. Altere seu status para Inativo em vez disso.");
      }
      throw error;
    }
    
    // Audit
    await supabase.from("audit_events").insert({
      entity_table: "employees",
      entity_id: data.id,
      action: "delete",
      payload: employee,
      actor_user_id: userId,
    });
    
    return { success: true };
  });
