import { cn } from "@/lib/utils";
import type { StatusCobranca, StatusCliente } from "@/data/demo";

export function StatusPill({ status }: { status: StatusCobranca }) {
  const map: Record<StatusCobranca, string> = {
    recebido: "border-success/30 bg-success/5 text-success",
    pendente: "border-gold/30 bg-gold/5 text-gold",
    atrasado: "border-danger/30 bg-danger/5 text-danger",
  };
  const label = { recebido: "Recebido", pendente: "Pendente", atrasado: "Atrasado" }[status];
  return (
    <span
      className={cn(
        "inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium",
        map[status],
      )}
    >
      {label}
    </span>
  );
}

export function SituacaoPill({ situacao }: { situacao: StatusCliente }) {
  const map: Record<StatusCliente, string> = {
    "em dia": "border-success/30 bg-success/5 text-success",
    atrasado: "border-danger/30 bg-danger/5 text-danger",
    renegociado: "border-gold/30 bg-gold/5 text-gold",
    quitado: "border-border bg-muted text-muted-foreground",
  };
  return (
    <span
      className={cn(
        "inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium capitalize",
        map[situacao],
      )}
    >
      {situacao}
    </span>
  );
}

export function Stat({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "default" | "gold" | "success" | "danger";
}) {
  const toneCls = {
    default: "text-foreground",
    gold: "text-gold",
    success: "text-success",
    danger: "text-danger",
  }[tone];
  return (
    <div className="min-w-0">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={cn("mt-1 truncate font-display text-xl font-bold sm:text-2xl", toneCls)}>
        {value}
      </p>
      {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
