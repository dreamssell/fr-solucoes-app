/**
 * Utilitários genéricos de captura de erro da aplicação.
 * Remove todas as transmissões de telemetria da Lovable.
 */

export function reportLovableError(error: unknown, context: Record<string, unknown> = {}) {
  console.error("Erro capturado no runtime:", error, context);
}
