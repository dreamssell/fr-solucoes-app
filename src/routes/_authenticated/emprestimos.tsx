import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Search, Plus, Info, ChevronDown, Loader2, ShieldAlert } from "lucide-react";
import { AppShell, PageHeader } from "@/components/fr/AppShell";
import { StatusPill } from "@/components/fr/bits";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { DatePicker } from "@/components/ui/date-picker";
import { formatBRL, formatDate, maskBRL, parseBRLInput } from "@/lib/format";
import { formatLocalDateISO } from "@/lib/dates";
import { toast } from "sonner";
import { buildLoan, type Frequencia } from "@/finance";
import { useLoans } from "@/hooks/use-loans";
import { useClients } from "@/hooks/use-clients";
import { useEmployees } from "@/hooks/use-employees";
import { RenegociarButton, RenegociacoesPanel } from "@/components/fr/Renegociacao";
import { useMyRole } from "@/hooks/use-renegotiations";
import {
  canDecideApproval,
  decisionBlockedMessage,
  type ActorRole,
} from "@/finance/approval-permissions";
import { Database } from "@/integrations/supabase/types";
import { toPillStatus } from "@/lib/status";

type LoanRow = Database["public"]["Tables"]["loans"]["Row"] & {
  clients: { full_name: string } | null;
  employees: { full_name: string } | null;
  installments: Database["public"]["Tables"]["installments"]["Row"][];
};

export const Route = createFileRoute("/_authenticated/emprestimos")({
  head: () => ({
    meta: [
      { title: "Empréstimos — FR Financeiro" },
      {
        name: "description",
        content: "Contratos com capital, lucro da FR, lucro do funcionário e parcelas.",
      },
      { property: "og:title", content: "Empréstimos — FR Financeiro" },
      {
        property: "og:description",
        content: "Contratos com capital, lucro da FR, lucro do funcionário e parcelas.",
      },
    ],
  }),
  component: Emprestimos,
});

function Emprestimos() {
  const [busca, setBusca] = useState("");
  const [funcFilter, setFuncFilter] = useState("todos");
  const [freqFilter, setFreqFilter] = useState("todos");
  const [isNewLoanOpen, setIsNewLoanOpen] = useState(false);
  const [selectedPendentes, setSelectedPendentes] = useState<string[]>([]);

  const {
    data: dbLoans,
    requestLoanApproval,
    decideLoanApproval,
    isRequesting,
    isDeciding,
    isLoading: isLoadingLoans,
  } = useLoans();
  const { data: dbClients } = useClients();
  const { data: dbEmployees } = useEmployees();
  const { data: me } = useMyRole();
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());
  const [rejectReasons, setRejectReasons] = useState<Record<string, string>>({});

  const pendentes = useMemo(
    () =>
      ((dbLoans ?? []) as unknown as LoanRow[]).filter(
        (e) => e.approval_status === "pending_approval",
      ),
    [dbLoans],
  );

  const handleBulkDecide = async (decision: "approved" | "rejected") => {
    const decs = selectedPendentes.filter(id => {
      const p = pendentes.find(x => x.id === id);
      const actor = me ? { userId: me.userId, role: me.role as ActorRole } : null;
      return p && canDecideApproval(actor, { requested_by: p.requested_by ?? null });
    });
    if (decs.length === 0) {
      toast.error("Nenhum empréstimo selecionado elegível para aprovação.");
      return;
    }

    const bulkReason = (rejectReasons["bulk"] ?? "").trim();
    if (decision === "rejected" && bulkReason.length < 5) {
      toast.error("A rejeição em lote exige uma justificativa geral (mínimo 5 caracteres).");
      return;
    }

    try {
      toast.loading("Processando decisões...", { id: "bulk-decide" });
      await Promise.all(
        decs.map(id => decideLoanApproval({ loan_id: id, decision, reason: decision === "rejected" ? bulkReason : undefined }))
      );
      toast.success("Decisões registradas com sucesso!", { id: "bulk-decide" });
      setSelectedPendentes([]);
      setRejectReasons(s => ({ ...s, bulk: "" }));
    } catch {
      toast.error("Erro ao registrar decisões em lote.", { id: "bulk-decide" });
    }
  };

  const [newLoan, setNewLoan] = useState({
    clienteId: "",
    capital: "",
    frequencia: "diario" as Frequencia,
    qtdParcelas: "1",
    lucroFuncionarioValor: "",
    lucroFuncionarioTipo: "fixo" as "fixo" | "percentual",
    startDate: new Date(),
  });

  const preview = useMemo(() => {
    if (!newLoan.capital || !newLoan.qtdParcelas) return null;
    try {
      return buildLoan({
        capitalCents: Math.round(parseBRLInput(newLoan.capital) * 100),
        frequencia: newLoan.frequencia,
        lucroFuncionario:
          newLoan.lucroFuncionarioTipo === "fixo"
            ? {
                tipo: "fixo",
                valor: Math.round(parseBRLInput(newLoan.lucroFuncionarioValor || "0") * 100),
              }
            : { tipo: "percentual", valor: parseFloat(newLoan.lucroFuncionarioValor || "0") / 100 },
        qtdParcelas: parseInt(newLoan.qtdParcelas),
      });
    } catch (e) {
      return null;
    }
  }, [newLoan]);

  const lista = useMemo(() => {
    if (!dbLoans) return [];
    return (dbLoans as unknown as LoanRow[]).filter(
      (e) =>
        e.approval_status !== "pending_approval" &&
        (funcFilter === "todos" || e.employee_id === funcFilter) &&
        (freqFilter === "todos" || e.frequency === freqFilter) &&
        (busca.trim() === "" ||
          (e.clients?.full_name ?? "").toLowerCase().includes(busca.toLowerCase())),
    );
  }, [dbLoans, busca, funcFilter, freqFilter]);


  const totais = useMemo(
    () =>
      lista.reduce(
        (acc, e) => ({
          capital: acc.capital + e.principal_amount,
          fr: acc.fr + e.fr_profit_amount,
          func: acc.func + e.employee_profit_amount,
        }),
        { capital: 0, fr: 0, func: 0 },
      ),
    [lista],
  );

  const handleCreate = async () => {
    if (!newLoan.clienteId || !newLoan.capital || !newLoan.qtdParcelas) {
      toast.error("Preencha todos os campos obrigatórios");
      return;
    }

    try {
      await requestLoanApproval({
        client_id: newLoan.clienteId,
        capital_cents: Math.round(parseBRLInput(newLoan.capital) * 100),
        frequency: newLoan.frequencia,
        installments_count: parseInt(newLoan.qtdParcelas),
        employee_profit_input: newLoan.lucroFuncionarioTipo === "fixo"
          ? parseBRLInput(newLoan.lucroFuncionarioValor)
          : parseFloat(newLoan.lucroFuncionarioValor || "0"),
        employee_profit_kind: newLoan.lucroFuncionarioTipo,
        start_date: formatLocalDateISO(newLoan.startDate),
        idempotency_key: idempotencyKey,
      });
      setIsNewLoanOpen(false);
      setIdempotencyKey(crypto.randomUUID());
      setNewLoan({
        clienteId: "",
        capital: "",
        frequencia: "diario",
        qtdParcelas: "1",
        lucroFuncionarioValor: "",
        lucroFuncionarioTipo: "fixo",
        startDate: new Date(),
      });
    } catch (e) {
      // handled by hook
    }
  };

  const handleDecide = async (loanId: string, decision: "approved" | "rejected") => {
    const reason = (rejectReasons[loanId] ?? "").trim();
    if (decision === "rejected" && reason.length < 5) {
      toast.error("Rejeição exige justificativa com pelo menos 5 caracteres.");
      return;
    }
    try {
      await decideLoanApproval({ loan_id: loanId, decision, reason });
      setRejectReasons((s) => ({ ...s, [loanId]: "" }));
    } catch {
      // handled by hook
    }
  };

  return (
    <AppShell>
      <PageHeader
        title="Empréstimos"
        description={`${lista.length} contratos ativos`}
        actions={
          <Button
            onClick={() => setIsNewLoanOpen(true)}
            className="bg-gold text-black hover:bg-gold/90"
          >
            <Plus className="mr-2 h-4 w-4" /> Novo Empréstimo
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Resumo label="Capital investido" valor={formatBRL(totais.capital / 100)} />
        <Resumo label="Lucro FR Financeiro" valor={formatBRL(totais.fr / 100)} tone="text-gold" />
        <Resumo
          label="Lucro dos funcionários"
          valor={formatBRL(totais.func / 100)}
          tone="text-success"
        />
      </div>

      {pendentes.length > 0 && (
        <section className="rounded-xl border border-gold/40 bg-gold/5 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gold/20 pb-2">
            <h2 className="font-display text-sm font-bold uppercase tracking-wider text-gold">
              Aguardando aprovação ({pendentes.length})
            </h2>
            {pendentes.some((p) => {
              const actor = me ? { userId: me.userId, role: me.role as ActorRole } : null;
              return canDecideApproval(actor, { requested_by: p.requested_by ?? null });
            }) && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Checkbox
                  checked={
                    selectedPendentes.length > 0 &&
                    selectedPendentes.length ===
                      pendentes.filter((p) => {
                        const actor = me ? { userId: me.userId, role: me.role as ActorRole } : null;
                        return canDecideApproval(actor, { requested_by: p.requested_by ?? null });
                      }).length
                  }
                  onCheckedChange={(checked) => {
                    if (checked) {
                      const decs = pendentes
                        .filter((p) => {
                          const actor = me ? { userId: me.userId, role: me.role as ActorRole } : null;
                          return canDecideApproval(actor, { requested_by: p.requested_by ?? null });
                        })
                        .map((p) => p.id);
                      setSelectedPendentes(decs);
                    } else {
                      setSelectedPendentes([]);
                    }
                  }}
                />
                <span>Selecionar todos elegíveis</span>
              </div>
            )}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            A decisão é validada no banco: ninguém aprova a própria solicitação e funcionários não
            decidem.
          </p>
          <ul className="mt-3 space-y-3">
            {pendentes.map((p) =>
              (() => {
                const actor = me ? { userId: me.userId, role: me.role as ActorRole } : null;
                const podeDecidir = canDecideApproval(actor, {
                  requested_by: p.requested_by ?? null,
                });
                const bloqueio = decisionBlockedMessage(actor, {
                  requested_by: p.requested_by ?? null,
                });
                return (
                  <li key={p.id} className="rounded-lg border border-border bg-card p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-3 min-w-0">
                        {podeDecidir && (
                          <Checkbox
                            checked={selectedPendentes.includes(p.id)}
                            onCheckedChange={(checked) => {
                              setSelectedPendentes((s) =>
                                checked ? [...s, p.id] : s.filter((x) => x !== p.id),
                              );
                            }}
                          />
                        )}
                        <div className="min-w-0">
                          <p className="truncate font-semibold">
                            {p.clients?.full_name ?? "Cliente"}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {formatBRL(p.principal_amount / 100)} · {p.installments_count}x ·{" "}
                            {p.frequency}
                          </p>
                        </div>
                      </div>
                      <span className="rounded-full border border-gold/40 bg-gold/10 px-2.5 py-0.5 text-[10px] font-bold uppercase text-gold">
                        Aguardando aprovação
                      </span>
                    </div>
                    {!podeDecidir ? (
                      <p className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                        <ShieldAlert className="h-3.5 w-3.5" />
                        {bloqueio}
                      </p>
                    ) : (
                      <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
                        <Input
                          placeholder="Justificativa (obrigatória para rejeitar)"
                          value={rejectReasons[p.id] ?? ""}
                          onChange={(e) =>
                            setRejectReasons((s) => ({ ...s, [p.id]: e.target.value }))
                          }
                        />
                        <Button
                          size="sm"
                          className="bg-success text-primary-foreground hover:bg-success/90"
                          disabled={isDeciding}
                          onClick={() => handleDecide(p.id, "approved")}
                        >
                          Aprovar
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-danger/40 text-danger hover:bg-danger/10 hover:text-danger"
                          disabled={isDeciding}
                          onClick={() => handleDecide(p.id, "rejected")}
                        >
                          Rejeitar
                        </Button>
                      </div>
                    )}
                  </li>
                );
              })(),
            )}
          </ul>

          {selectedPendentes.length > 0 && (
            <div className="mt-4 rounded-lg border border-gold/30 bg-gold/10 p-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <span className="text-xs font-semibold text-gold">
                {selectedPendentes.length} contrato(s) selecionado(s) para decisão em lote
              </span>
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  placeholder="Justificativa em lote (rejeição)"
                  value={rejectReasons["bulk"] ?? ""}
                  onChange={(e) =>
                    setRejectReasons((s) => ({ ...s, bulk: e.target.value }))
                  }
                  className="h-9 max-w-[200px]"
                />
                <Button
                  size="sm"
                  className="bg-success text-primary-foreground hover:bg-success/90 h-9"
                  disabled={isDeciding}
                  onClick={() => handleBulkDecide("approved")}
                >
                  Aprovar Selecionados
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="border-danger/40 text-danger hover:bg-danger/10 hover:text-danger h-9"
                  disabled={isDeciding}
                  onClick={() => handleBulkDecide("rejected")}
                >
                  Rejeitar Selecionados
                </Button>
              </div>
            </div>
          )}
        </section>
      )}

      <div className="grid gap-3 rounded-xl border border-border bg-card p-4 sm:grid-cols-[minmax(0,1fr)_200px_200px]">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por cliente"
            className="pl-9"
          />
        </div>
        <Select value={freqFilter} onValueChange={setFreqFilter}>
          <SelectTrigger>
            <SelectValue placeholder="Periodicidade" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todas frequências</SelectItem>
            <SelectItem value="diario">Diário</SelectItem>
            <SelectItem value="semanal">Semanal</SelectItem>
            <SelectItem value="quinzenal">Quinzenal</SelectItem>
            <SelectItem value="mensal">Mensal</SelectItem>
          </SelectContent>
        </Select>
        <Select value={funcFilter} onValueChange={setFuncFilter}>
          <SelectTrigger>
            <SelectValue placeholder="Funcionário" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os funcionários</SelectItem>
            {dbEmployees?.map((f) => (
              <SelectItem key={f.id} value={f.id}>
                {f.full_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-3">
        <RenegociacoesPanel />
        {isLoadingLoans ? (
          <div className="flex flex-col items-center justify-center p-12 gap-3 text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin text-gold" />
            <p className="text-sm">Carregando contratos reais...</p>
          </div>
        ) : (
          lista.map((e) => (
            <Collapsible
              key={e.id}
              className="overflow-hidden rounded-2xl border border-border bg-card transition-all hover:border-gold/20"
            >
              <CollapsibleTrigger className="group grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-4 p-5 text-left">
                <div className="flex items-center gap-4 min-w-0">
                  <div className="hidden h-10 w-10 shrink-0 place-items-center rounded-xl bg-graphite font-display text-xs font-bold text-gold sm:grid">
                    FR
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-base font-bold text-foreground">
                      {e.clients?.full_name || "Desconhecido"}
                    </p>
                    <p className="truncate text-xs font-medium text-muted-foreground uppercase tracking-tight">
                      {e.employees?.full_name?.split(" ")[0] || "—"} · {formatDate(e.start_date)} ·{" "}
                      {e.installments_count} PARCELAS
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-4">
                  <div className="text-right">
                    <p className="font-display text-lg font-bold text-gold">
                      {formatBRL(e.total_amount / 100)}
                    </p>
                    <p className="text-[10px] font-bold text-muted-foreground uppercase">
                      {e.frequency}
                    </p>
                  </div>
                  <ChevronDown className="h-5 w-5 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
                </div>
              </CollapsibleTrigger>

              <CollapsibleContent>
                <div className="border-t border-border p-4">
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <Bloco label="Capital" valor={formatBRL(e.principal_amount / 100)} />
                    <Bloco
                      label="Lucro FR Financeiro"
                      valor={formatBRL(e.fr_profit_amount / 100)}
                      tone="text-gold"
                    />
                    <Bloco
                      label="Lucro do funcionário"
                      valor={formatBRL(e.employee_profit_amount / 100)}
                      tone="text-success"
                    />
                    <Bloco label="Total do cliente" valor={formatBRL(e.total_amount / 100)} />
                  </div>

                  <div className="mt-4 flex justify-end">
                    <RenegociarButton loan={e} />
                  </div>

                  <div className="mt-4 overflow-x-auto">
                    <table className="w-full min-w-[520px] text-sm">
                      <thead>
                        <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                          <th className="py-2 pr-4">Parcela</th>
                          <th className="py-2 pr-4">Vencimento</th>
                          <th className="py-2 pr-4">Valor</th>
                          <th className="py-2 pr-4">Pago</th>
                          <th className="py-2">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {e.installments
                          ?.slice()
                          .sort((a, b) => a.number - b.number)
                          .map((p) => (
                            <tr key={p.id} className="border-b border-border/50 last:border-0">
                              <td className="py-2 pr-4">
                                {p.number}/{e.installments_count}
                              </td>
                              <td className="py-2 pr-4 text-muted-foreground">
                                {formatDate(p.due_date)}
                              </td>
                              <td className="py-2 pr-4">{formatBRL(p.total_amount / 100)}</td>
                              <td className="py-2 pr-4 text-muted-foreground">
                                {p.paid_amount > 0 ? formatBRL(p.paid_amount / 100) : "—"}
                              </td>
                              <td className="py-2">
                                <StatusPill status={toPillStatus(p.status)} />
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </CollapsibleContent>
            </Collapsible>
          ))
        )}
        {!isLoadingLoans && lista.length === 0 && (
          <p className="rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
            Nenhum empréstimo encontrado.
          </p>
        )}
      </div>

      <Dialog open={isNewLoanOpen} onOpenChange={setIsNewLoanOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Novo Empréstimo</DialogTitle>
            <DialogDescription>
              Configure o novo contrato de crédito. O cálculo de taxas e parcelas é automático.
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 gap-4 py-4 sm:grid-cols-2">
            <div className="col-span-1 space-y-2 sm:col-span-2">
              <Label htmlFor="loan-cliente">Cliente *</Label>
              <Select
                onValueChange={(v) => setNewLoan((s) => ({ ...s, clienteId: v }))}
                value={newLoan.clienteId}
              >
                <SelectTrigger id="loan-cliente" className="bg-surface">
                  <SelectValue placeholder="Selecione o cliente" />
                </SelectTrigger>
                <SelectContent>
                  {dbClients?.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.full_name} ({c.employees?.full_name || "S/R"})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="loan-capital">Capital Solicitado (R$) *</Label>
              <Input
                id="loan-capital"
                type="text"
                placeholder="0,00"
                value={newLoan.capital}
                onChange={(e) => setNewLoan((s) => ({ ...s, capital: maskBRL(e.target.value) }))}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="loan-freq">Periodicidade *</Label>
              <Select
                value={newLoan.frequencia}
                onValueChange={(v: Frequencia) => setNewLoan((s) => ({ ...s, frequencia: v }))}
              >
                <SelectTrigger id="loan-freq" className="bg-surface">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="diario">Diário (Taxa 12%)</SelectItem>
                  <SelectItem value="semanal">Semanal (Taxa 20%)</SelectItem>
                  <SelectItem value="quinzenal">Quinzenal (Taxa 30%)</SelectItem>
                  <SelectItem value="mensal">Mensal (Taxa 30%)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="loan-parcelas">Quantidade de Parcelas *</Label>
              <Input
                id="loan-parcelas"
                type="number"
                min="1"
                value={newLoan.qtdParcelas}
                onChange={(e) => setNewLoan((s) => ({ ...s, qtdParcelas: e.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="loan-func-lucro">Lucro do Funcionário</Label>
              <div className="flex gap-2">
                <Input
                  id="loan-func-lucro"
                  type="text"
                  placeholder={newLoan.lucroFuncionarioTipo === "fixo" ? "0,00" : "Percentual"}
                  className="flex-1"
                  value={newLoan.lucroFuncionarioValor}
                  onChange={(e) => {
                    const val = e.target.value;
                    setNewLoan((s) => ({
                      ...s,
                      lucroFuncionarioValor: s.lucroFuncionarioTipo === "fixo" ? maskBRL(val) : val,
                    }));
                  }}
                />
                <Select
                  value={newLoan.lucroFuncionarioTipo}
                  onValueChange={(v: "fixo" | "percentual") =>
                    setNewLoan((s) => ({ ...s, lucroFuncionarioTipo: v }))
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

            <div className="space-y-2">
              <DatePicker
                label="Data de Início"
                date={newLoan.startDate}
                setDate={(d) => d && setNewLoan((s) => ({ ...s, startDate: d }))}
              />
            </div>

            {preview && (
              <div className="col-span-1 space-y-3 rounded-lg border border-gold/30 bg-gold/5 p-4 sm:col-span-2">
                <div className="flex items-center gap-2 text-gold">
                  <Info className="h-4 w-4" />
                  <h4 className="text-sm font-semibold uppercase tracking-wider">Resumo Real</h4>
                </div>
                <div className="grid grid-cols-2 gap-y-2 text-sm sm:grid-cols-4">
                  <div>
                    <p className="text-xs text-muted-foreground">Capital</p>
                    <p className="font-bold">{formatBRL(preview.capitalCents / 100)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Lucro FR</p>
                    <p className="font-bold text-gold">{formatBRL(preview.lucroFrCents / 100)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Lucro Func.</p>
                    <p className="font-bold text-success">
                      {formatBRL(preview.lucroFuncionarioCents / 100)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Total Cliente</p>
                    <p className="font-bold">{formatBRL(preview.totalCents / 100)}</p>
                  </div>
                </div>
                <div className="border-t border-gold/20 pt-2 text-xs">
                  <p className="font-medium text-gold">
                    {preview.qtdParcelas} parcelas de{" "}
                    {formatBRL((preview.parcelas[0]?.valorCents ?? 0) / 100)}
                    {preview.parcelas.length > 1 &&
                      preview.parcelas[0]?.valorCents !==
                        preview.parcelas[preview.parcelas.length - 1]?.valorCents && (
                        <span className="ml-1 text-muted-foreground">
                          (com ajuste de centavos na última)
                        </span>
                      )}
                  </p>
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="mt-6">
            <Button variant="outline" onClick={() => setIsNewLoanOpen(false)}>
              Cancelar
            </Button>
            <Button
              className="bg-gold text-black hover:bg-gold/90"
              disabled={!preview || !newLoan.clienteId || isRequesting}
              onClick={handleCreate}
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
    </AppShell>
  );
}

function Resumo({
  label,
  valor,
  tone,
}: {
  label: string;
  valor: string;
  tone?: string | undefined;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`mt-1 truncate font-display text-xl font-bold ${tone ?? ""}`}>{valor}</p>
    </div>
  );
}

function Bloco({
  label,
  valor,
  tone,
}: {
  label: string;
  valor: string;
  tone?: string | undefined;
}) {
  return (
    <div className="min-w-0 rounded-lg border border-border bg-surface p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`mt-0.5 truncate font-display font-bold ${tone ?? ""}`}>{valor}</p>
    </div>
  );
}
