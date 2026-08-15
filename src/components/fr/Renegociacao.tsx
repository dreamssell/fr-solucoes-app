import { useMemo, useState } from "react";
import { Loader2, RefreshCw, Check, X, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatBRL, formatDate } from "@/lib/format";
import { buildRenegotiationTerms } from "@/finance/renegotiation";
import { useMyRole, useRenegotiations } from "@/hooks/use-renegotiations";

type RenegotiationRow = {
  id: string;
  reason: string;
  status: string;
  requested_by: string;
  requested_at: string;
  decided_at: string | null;
};

const STATUS_LABEL: Record<string, string> = {
  pending_approval: "Aguardando aprovação",
  approved: "Aprovada",
  rejected: "Rejeitada",
  processed: "Processada",
  cancelled: "Cancelada",
};

const STATUS_CLASS: Record<string, string> = {
  pending_approval: "bg-gold/15 text-gold",
  approved: "bg-success/15 text-success",
  rejected: "bg-destructive/15 text-destructive",
  processed: "bg-success/15 text-success",
  cancelled: "bg-muted text-muted-foreground",
};

export function StatusRenegociacao({ status }: { status: string }) {
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${STATUS_CLASS[status] ?? "bg-muted text-muted-foreground"}`}
    >
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}

/** Botão + diálogo de solicitação de renegociação de um contrato específico. */
type LoanLike = {
  id: string;
  principal_amount: number;
  frequency: string;
  installments_count: number;
  employee_profit_input: number;
  employee_profit_kind: "fixo" | "percentual";
};

export function RenegociarButton({ loan }: { loan: LoanLike }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    capital: String((loan.principal_amount ?? 0) / 100),
    frequencia: loan.frequency as string,
    parcelas: String(loan.installments_count ?? 1),
    lucroValor: String(loan.employee_profit_input ?? 0),
    lucroTipo: (loan.employee_profit_kind ?? "fixo") as "fixo" | "percentual",
    inicio: new Date().toISOString().slice(0, 10),
    motivo: "",
  });
  const { requestRenegotiation, isRequesting } = useRenegotiations();

  const terms = useMemo(() => {
    const capitalCents = Math.round(parseFloat(form.capital || "0") * 100);
    const parcelas = parseInt(form.parcelas || "0", 10);
    if (!capitalCents || !parcelas) return null;
    try {
      return buildRenegotiationTerms({
        capitalCents,
        frequency: form.frequencia,
        installmentsCount: parcelas,
        employeeProfitKind: form.lucroTipo,
        employeeProfitInput: parseFloat(form.lucroValor || "0"),
        startDate: form.inicio,
      });
    } catch {
      return null;
    }
  }, [form]);

  const motivoValido = form.motivo.trim().length >= 10;

  const submit = async () => {
    if (!terms || !motivoValido) return;
    await requestRenegotiation({
      loan_id: loan.id,
      reason: form.motivo.trim(),
      proposed_terms: terms as unknown as Record<string, unknown>,
      idempotency_key: `reneg-${loan.id}-${terms.total_amount}-${terms.installments_count}-${terms.start_date}`,
    });
    setOpen(false);
  };

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <RefreshCw className="mr-2 h-3.5 w-3.5" /> Renegociar
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Solicitar renegociação</DialogTitle>
            <DialogDescription>
              O contrato original e suas parcelas permanecem inalterados até a aprovação.
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 gap-4 py-2 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="rn-capital">Novo capital (R$)</Label>
              <Input
                id="rn-capital"
                type="number"
                value={form.capital}
                onChange={(e) => setForm((s) => ({ ...s, capital: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="rn-freq">Periodicidade</Label>
              <Select
                value={form.frequencia}
                onValueChange={(v) => setForm((s) => ({ ...s, frequencia: v }))}
              >
                <SelectTrigger id="rn-freq" className="bg-surface">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="diario">Diário</SelectItem>
                  <SelectItem value="semanal">Semanal</SelectItem>
                  <SelectItem value="quinzenal">Quinzenal</SelectItem>
                  <SelectItem value="mensal">Mensal</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="rn-parcelas">Parcelas</Label>
              <Input
                id="rn-parcelas"
                type="number"
                min="1"
                value={form.parcelas}
                onChange={(e) => setForm((s) => ({ ...s, parcelas: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="rn-inicio">Início</Label>
              <Input
                id="rn-inicio"
                type="date"
                value={form.inicio}
                onChange={(e) => setForm((s) => ({ ...s, inicio: e.target.value }))}
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="rn-lucro">Lucro do funcionário</Label>
              <div className="flex gap-2">
                <Input
                  id="rn-lucro"
                  type="number"
                  className="flex-1"
                  value={form.lucroValor}
                  onChange={(e) => setForm((s) => ({ ...s, lucroValor: e.target.value }))}
                />
                <Select
                  value={form.lucroTipo}
                  onValueChange={(v: "fixo" | "percentual") =>
                    setForm((s) => ({ ...s, lucroTipo: v }))
                  }
                >
                  <SelectTrigger className="w-[100px] bg-surface">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="fixo">R$</SelectItem>
                    <SelectItem value="percentual">%</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="rn-motivo">Justificativa *</Label>
              <Textarea
                id="rn-motivo"
                rows={3}
                value={form.motivo}
                placeholder="Descreva o motivo da renegociação (mínimo 10 caracteres)"
                onChange={(e) => setForm((s) => ({ ...s, motivo: e.target.value }))}
              />
              {!motivoValido && form.motivo.length > 0 && (
                <p className="text-xs text-destructive">Justificativa muito curta.</p>
              )}
            </div>

            {terms && (
              <div className="grid grid-cols-2 gap-3 rounded-lg border border-gold/30 bg-gold/5 p-4 text-sm sm:col-span-2 sm:grid-cols-4">
                <div>
                  <p className="text-xs text-muted-foreground">Capital</p>
                  <p className="font-bold">{formatBRL(terms.principal_amount / 100)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Lucro FR</p>
                  <p className="font-bold text-gold">{formatBRL(terms.fr_profit_amount / 100)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Lucro func.</p>
                  <p className="font-bold text-success">
                    {formatBRL(terms.employee_profit_amount / 100)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Total</p>
                  <p className="font-bold">{formatBRL(terms.total_amount / 100)}</p>
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button
              className="bg-gold text-black hover:bg-gold/90"
              disabled={!terms || !motivoValido || isRequesting}
              onClick={submit}
            >
              {isRequesting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Enviar para aprovação"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Painel de renegociações com aprovação/rejeição (owner e gerente). */
export function RenegociacoesPanel() {
  const { data, isLoading, error, decideRenegotiation, isDeciding } = useRenegotiations();
  const { data: me } = useMyRole();
  const podeDecidir = me?.role === "owner" || me?.role === "manager";
  const [notes, setNotes] = useState<Record<string, string>>({});

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin text-gold" /> Carregando renegociações...
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
        {(error as Error).message}
      </div>
    );
  }

  const lista = (data ?? []) as RenegotiationRow[];
  if (lista.length === 0) return null;

  return (
    <div className="space-y-3 rounded-2xl border border-border bg-card p-4">
      <h3 className="font-display text-sm font-bold uppercase tracking-wide text-muted-foreground">
        Renegociações
      </h3>
      {lista.map((r) => {
        const isMine = me?.userId === r.requested_by;
        const bloqueado = !podeDecidir || isMine;
        return (
          <div key={r.id} className="rounded-xl border border-border bg-surface p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{r.reason}</p>
                <p className="text-xs text-muted-foreground">
                  Solicitada em {formatDate(r.requested_at)}
                  {r.decided_at ? ` · Decidida em ${formatDate(r.decided_at)}` : ""}
                </p>
              </div>
              <StatusRenegociacao status={r.status} />
            </div>

            {r.status === "pending_approval" && (
              <div className="mt-3 space-y-2">
                {bloqueado ? (
                  <p className="flex items-center gap-2 text-xs text-muted-foreground">
                    <ShieldAlert className="h-3.5 w-3.5" />
                    {isMine
                      ? "Você não pode aprovar a própria solicitação."
                      : "Você não tem permissão para decidir."}
                  </p>
                ) : (
                  <>
                    <Input
                      placeholder="Justificativa da decisão (obrigatória para rejeitar, mín. 5 caracteres)"
                      value={notes[r.id] ?? ""}
                      onChange={(e) => setNotes((s) => ({ ...s, [r.id]: e.target.value }))}
                    />
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        disabled={isDeciding}
                        className="bg-success text-black hover:bg-success/90"
                        onClick={() =>
                          decideRenegotiation({
                            renegotiation_id: r.id,
                            decision: "approved",
                            notes: notes[r.id] ?? "",
                          })
                        }
                      >
                        {isDeciding ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Check className="h-3.5 w-3.5" />
                        )}
                        <span className="ml-1">Aprovar</span>
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        disabled={isDeciding || (notes[r.id] ?? "").trim().length < 5}
                        onClick={() =>
                          decideRenegotiation({
                            renegotiation_id: r.id,
                            decision: "rejected",
                            notes: notes[r.id] ?? "",
                          })
                        }
                      >
                        <X className="h-3.5 w-3.5" /> <span className="ml-1">Rejeitar</span>
                      </Button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
