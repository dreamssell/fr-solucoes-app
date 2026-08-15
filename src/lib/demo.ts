import { toast } from "sonner";

/** Retorno visual padrão para ações simuladas do protótipo. */
export const demoToast = (title: string, description?: string) =>
  toast(title, {
    description: description ?? "Ação apenas demonstrativa — nenhum dado foi salvo.",
  });
