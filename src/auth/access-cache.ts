import type { AccessResult } from "./index";

export type AccessCheckerOptions = {
  fetchAccess: () => Promise<AccessResult>;
  now?: () => number;
  ttlMs?: number;
};

export type AccessChecker = {
  checkAccess: () => Promise<AccessResult>;
  invalidate: () => void;
};

/**
 * Reaproveita uma autorização já verificada por um TTL curto e deduplica
 * chamadas concorrentes. Falha técnica não derruba um acesso ainda em cache.
 */
export function createAccessChecker({
  fetchAccess,
  now = () => Date.now(),
  ttlMs = 60_000,
}: AccessCheckerOptions): AccessChecker {
  let authorizedUntil = 0;
  let lastAuthorizedAt: number | null = null;
  let inFlight: Promise<AccessResult> | null = null;

  async function run(): Promise<AccessResult> {
    const result = await fetchAccess();
    if (result.status === "authorized") {
      lastAuthorizedAt = now();
      authorizedUntil = lastAuthorizedAt + ttlMs;
      return result;
    }
    // Indisponibilidade técnica não derruba um acesso recentemente verificado.
    if (
      result.status === "unavailable" &&
      lastAuthorizedAt !== null &&
      now() - lastAuthorizedAt <= ttlMs * 2
    ) {
      return { status: "authorized" };
    }
    if (result.status !== "unavailable") {
      authorizedUntil = 0;
      lastAuthorizedAt = null;
    }
    return result;
  }

  return {
    async checkAccess() {
      if (now() < authorizedUntil) return { status: "authorized" };
      if (inFlight) return inFlight;
      inFlight = run().finally(() => {
        inFlight = null;
      });
      return inFlight;
    },
    invalidate() {
      authorizedUntil = 0;
      lastAuthorizedAt = null;
      inFlight = null;
    },
  };
}
