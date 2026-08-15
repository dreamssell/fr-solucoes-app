import { supabase } from "@/integrations/supabase/client";
import {
  resolveAccess,
  UNAVAILABLE_MESSAGE,
  type AccessResult,
  type OwnerAccessClaim,
} from "./index";
import { createAccessChecker } from "./access-cache";

/**
 * Valida identidade (getUser, revalidado no servidor de auth) e autorização
 * (RPC claim_owner_access, que confere auth.uid() e owner_access no banco).
 */
async function fetchAccess(): Promise<AccessResult> {
  let userData: { user: { id: string } | null } | null = null;
  try {
    const { data, error } = await supabase.auth.getUser();
    if (error) {
      // Sessão ausente é anônimo; qualquer outra falha é indisponibilidade técnica.
      const message = String(error.message ?? "");
      if (/session|jwt|not authenticated|missing/i.test(message)) return { status: "anonymous" };
      return { status: "unavailable", message: UNAVAILABLE_MESSAGE };
    }
    userData = data;
  } catch {
    return { status: "unavailable", message: UNAVAILABLE_MESSAGE };
  }
  if (!userData?.user) return { status: "anonymous" };

  try {
    const { data, error } = await supabase.rpc("claim_owner_access");
    const claim = (Array.isArray(data) ? data[0] : data) as OwnerAccessClaim | null;
    return resolveAccess({ user: userData.user, claim, error: error ?? undefined });
  } catch (error) {
    return resolveAccess({ user: userData.user, claim: null, error });
  }
}

const checker = createAccessChecker({ fetchAccess });

export async function checkAccess(): Promise<AccessResult> {
  return checker.checkAccess();
}

export async function signOutLocal(): Promise<void> {
  checker.invalidate();
  try {
    await supabase.auth.signOut({ scope: "local" });
  } catch {
    /* sessão já encerrada */
  }
}
