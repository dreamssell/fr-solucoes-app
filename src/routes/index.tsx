import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ShieldCheck, Lock, Mail, Key } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DemoBadge } from "@/components/fr/AppShell";
import { checkAccess, signOutLocal } from "@/auth/client";
import { supabase } from "@/integrations/supabase/client";
import {
  sanitizeRedirect,
  UNAUTHORIZED_MESSAGE,
  CANCELLED_MESSAGE,
  UNAVAILABLE_MESSAGE,
} from "@/auth";

const REDIRECT_KEY = "fr.redirect";

export const Route = createFileRoute("/")({
  ssr: false,
  validateSearch: (search: Record<string, unknown>): { redirect?: string; erro?: string } => ({
    ...(typeof search["redirect"] === "string" ? { redirect: search["redirect"] as string } : {}),
    ...(typeof search["erro"] === "string" ? { erro: search["erro"] as string } : {}),
  }),
  head: () => ({
    meta: [
      { title: "Entrar — FR Financeiro" },
      {
        name: "description",
        content: "Acesso exclusivo do proprietário ao painel do FR Financeiro.",
      },
      { property: "og:title", content: "Entrar — FR Financeiro" },
      {
        property: "og:description",
        content: "Acesso exclusivo do proprietário ao painel do FR Financeiro.",
      },
    ],
  }),
  component: Login,
});

function Login() {
  const navigate = useNavigate();
  const search = Route.useSearch();
  const [checking, setChecking] = useState(true);
  const [signingIn, setSigningIn] = useState(false);
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");

  useEffect(() => {
    if (search.redirect) {
      sessionStorage.setItem(REDIRECT_KEY, sanitizeRedirect(search.redirect));
    }
    if (search.erro === "nao_autorizado") {
      toast.error(UNAUTHORIZED_MESSAGE);
    }
    if (search.erro === "cancelado") {
      toast.message(CANCELLED_MESSAGE);
    }
    if (search.erro === "indisponivel") {
      toast.error(UNAVAILABLE_MESSAGE);
    }

    let active = true;
    (async () => {
      if (search.erro === "nao_autorizado") {
        await signOutLocal();
        if (active) setChecking(false);
        return;
      }
      const access = await checkAccess();
      if (!active) return;
      if (access.status === "authorized") {
        const target = sanitizeRedirect(search.redirect ?? sessionStorage.getItem(REDIRECT_KEY));
        sessionStorage.removeItem(REDIRECT_KEY);
        navigate({ to: target, replace: true });
        return;
      }
      if (access.status === "unauthorized") {
        await signOutLocal();
        toast.error(UNAUTHORIZED_MESSAGE);
      }
      setChecking(false);
    })();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function entrarComEmail(e: React.FormEvent) {
    e.preventDefault();
    if (!email || !senha) {
      toast.error("Preencha o e-mail e a senha");
      return;
    }
    setSigningIn(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password: senha,
      });
      if (error) {
        toast.error("E-mail ou senha incorretos");
        setSigningIn(false);
        return;
      }

      const access = await checkAccess();
      if (access.status === "authorized") {
        const target = sanitizeRedirect(sessionStorage.getItem(REDIRECT_KEY));
        sessionStorage.removeItem(REDIRECT_KEY);
        navigate({ to: target, replace: true });
        return;
      }
      if (access.status === "unavailable") {
        toast.error(UNAVAILABLE_MESSAGE);
        return;
      }
      await signOutLocal();
      toast.error(UNAUTHORIZED_MESSAGE);
    } catch {
      toast.error("Ocorreu um erro ao fazer login");
    } finally {
      setSigningIn(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto grid h-20 w-20 place-items-center rounded-2xl bg-gold/10 font-display text-2xl font-bold text-gold ring-1 ring-gold/20 shadow-lg shadow-gold/5">
            FR
          </div>
          <h1 className="mt-6 font-display text-3xl font-bold tracking-tight text-gradient-gold">
            FR Financeiro
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Controle de empréstimos, cobranças e acertos semanais
          </p>
        </div>

        <div className="rounded-2xl border border-border bg-card p-8 shadow-2xl">
          <div className="mb-6 flex items-center justify-center gap-2 rounded-xl bg-graphite/50 py-2.5 text-xs font-bold uppercase tracking-widest text-muted-foreground ring-1 ring-border">
            <Lock className="h-3.5 w-3.5 text-gold" />
            Acesso Restrito
          </div>

          <form onSubmit={entrarComEmail} className="space-y-4">
            <div className="space-y-1">
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">E-mail</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/60" />
                <Input
                  type="email"
                  placeholder="exemplo@frfinanceiro.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="pl-10"
                  disabled={signingIn || checking}
                  required
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Senha</label>
              <div className="relative">
                <Key className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/60" />
                <Input
                  type="password"
                  placeholder="Sua senha"
                  value={senha}
                  onChange={(e) => setSenha(e.target.value)}
                  className="pl-10"
                  disabled={signingIn || checking}
                  required
                />
              </div>
            </div>

            <Button
              type="submit"
              className="h-12 w-full bg-gold font-bold text-primary-foreground hover:bg-gold-soft transition-all active:scale-[0.98] mt-2"
              disabled={signingIn || checking}
            >
              {checking ? "Verificando acesso…" : signingIn ? "Entrando..." : "Entrar com E-mail"}
            </Button>
          </form>

          <p className="mt-4 text-center text-[11px] leading-relaxed text-muted-foreground">
            Acesso restrito a contas previamente autorizadas no sistema.
          </p>
        </div>

        <div className="mt-6 flex flex-col items-center gap-3">
          <DemoBadge />
          <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">
            <ShieldCheck className="h-3.5 w-3.5" /> Segurança Pro Max Habilitada
          </p>
        </div>
      </div>
    </div>
  );
}

function GoogleMark() {
  return (
    <svg viewBox="0 0 48 48" className="h-4 w-4" aria-hidden="true">
      <path
        fill="#FFC107"
        d="M43.6 20.1H42V20H24v8h11.3C33.7 32.7 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.1 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.6-.4-3.9z"
      />
      <path
        fill="#FF3D00"
        d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.1 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.3 0-9.7-3.3-11.3-8l-6.5 5C9.6 39.6 16.2 44 24 44z"
      />
      <path
        fill="#1976D2"
        d="M43.6 20.1H42V20H24v8h11.3c-.8 2.2-2.2 4.1-4.1 5.6l6.2 5.2C39.9 36.5 44 31 44 24c0-1.3-.1-2.6-.4-3.9z"
      />
    </svg>
  );
}
