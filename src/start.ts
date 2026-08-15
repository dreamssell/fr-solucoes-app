import { createStart } from "@tanstack/react-start";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";

// O bloco const errorMiddleware = createMiddleware()... foi deletado

export const startInstance = createStart(() => ({
  functionMiddleware: [attachSupabaseAuth],
  // A linha requestMiddleware também foi deletada para não causar erros
}));