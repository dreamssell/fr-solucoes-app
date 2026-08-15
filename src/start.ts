import { createStart, createMiddleware } from "@tanstack/react-start";
import { renderErrorPage } from "./lib/error-page";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";

const errorMiddleware = createMiddleware().server(async ({ next }) => {
  // ... (mantenha todo o bloco do errorMiddleware intacto)
});

// AQUI: Você apaga o bloco do "const csrfMiddleware = ..." 

export const startInstance = createStart(() => ({
  functionMiddleware: [attachSupabaseAuth],
  // AQUI: Deixe apenas o errorMiddleware
  requestMiddleware: [errorMiddleware],
}));