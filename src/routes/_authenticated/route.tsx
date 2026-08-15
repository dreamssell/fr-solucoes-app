import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { decideGuardAction } from "@/auth";
import { checkAccess, signOutLocal } from "@/auth/client";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    const decision = decideGuardAction(await checkAccess());

    if (decision.action === "allow") return;

    if (decision.action === "signout-unauthorized") {
      await signOutLocal();
      throw redirect({ to: "/", search: { erro: "nao_autorizado" } });
    }

    if (decision.action === "redirect-unavailable") {
      // Falha técnica: preserva a sessão e o destino interno seguro.
      throw redirect({ to: "/", search: { redirect: location.href, erro: "indisponivel" } });
    }

    throw redirect({ to: "/", search: { redirect: location.href } });
  },
  pendingComponent: AuthPending,
  component: () => <Outlet />,
});

function AuthPending() {
  return (
    <div className="grid min-h-screen place-items-center bg-background">
      <div className="flex flex-col items-center gap-3">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-gold/30 border-t-gold" />
        <p className="text-sm text-muted-foreground">Verificando acesso…</p>
      </div>
    </div>
  );
}
