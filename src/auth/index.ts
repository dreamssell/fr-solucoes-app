/**
 * Regras puras de autenticação/autorização do FR Financeiro.
 * Sem dependência de UI ou de rede — testáveis isoladamente.
 */

export const AUTH_ROUTE = "/";
export const DEFAULT_ROUTE = "/dashboard";
export const UNAUTHORIZED_MESSAGE =
  "Esta conta não possui autorização para acessar o FR Financeiro.";
export const CANCELLED_MESSAGE = "Login cancelado. Nenhuma sessão foi iniciada.";
export const UNAVAILABLE_MESSAGE =
  "Não foi possível verificar seu acesso agora. Verifique a conexão e tente novamente.";

export type OwnerAccessType = "proprietario_definitivo" | "acesso_tecnico";

export type OwnerAccessClaim = {
  authorized: boolean;
  access_type?: OwnerAccessType | null;
  is_temporary?: boolean | null;
};

export type AccessInput = {
  user: { id: string; user_metadata?: unknown } | null | undefined;
  claim: OwnerAccessClaim | null | undefined;
  error?: unknown;
};

export type AccessResult =
  | { status: "authorized" }
  | { status: "anonymous" }
  | { status: "unauthorized"; message: string }
  | { status: "unavailable"; message: string };

export type GuardAction =
  | { action: "allow" }
  | { action: "signout-unauthorized" }
  | { action: "redirect-login" }
  | { action: "redirect-unavailable" };

/** Decisão pura do guard: apenas negativa verificada encerra a sessão. */
export function decideGuardAction(access: AccessResult): GuardAction {
  switch (access.status) {
    case "authorized":
      return { action: "allow" };
    case "unauthorized":
      return { action: "signout-unauthorized" };
    case "unavailable":
      return { action: "redirect-unavailable" };
    default:
      return { action: "redirect-login" };
  }
}

export function normalizeEmail(email?: string | null): string {
  return (email ?? "").trim().toLowerCase();
}

/** Só aceita caminho relativo interno; qualquer URL externa vira o destino padrão. */
export function sanitizeRedirect(target?: string | null): string {
  if (!target) return DEFAULT_ROUTE;
  const value = target.trim();
  if (!value.startsWith("/")) return DEFAULT_ROUTE;
  if (value.startsWith("//") || value.startsWith("/\\")) return DEFAULT_ROUTE;
  if (value.includes("\\")) return DEFAULT_ROUTE;
  if (/^\/+$/.test(value)) return DEFAULT_ROUTE;
  if (value === AUTH_ROUTE) return DEFAULT_ROUTE;
  return value;
}

/**
 * A decisão nunca considera user_metadata: apenas o resultado verificado no banco
 * (RPC `claim_owner_access`, protegida por auth.uid()).
 */
export function resolveAccess({ user, claim, error }: AccessInput): AccessResult {
  if (!user?.id) return { status: "anonymous" };
  // Falha técnica (rede/RPC indisponível) nunca equivale a acesso negado.
  if (error) return { status: "unavailable", message: UNAVAILABLE_MESSAGE };
  if (!claim || claim.authorized !== true) {
    return { status: "unauthorized", message: UNAUTHORIZED_MESSAGE };
  }
  return { status: "authorized" };
}
