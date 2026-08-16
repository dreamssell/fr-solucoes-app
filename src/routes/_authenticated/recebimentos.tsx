import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Plus, Upload, Loader2, AlertCircle, CheckCircle2, Download } from "lucide-react";
import { AppShell, PageHeader } from "@/components/fr/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatBRL, formatDate, maskBRL, parseBRLInput } from "@/lib/format";
import { useClients } from "@/hooks/use-clients";
import { useLoans } from "@/hooks/use-loans";
import { flattenInstallments, type LoanRow, type PaymentRow } from "@/finance/aggregations";
import { useEmployees } from "@/hooks/use-employees";
import { useServerFn } from "@tanstack/react-start";
import { getPayments, registerPayment, requestPartialPayment } from "@/lib/payments.functions";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { callRpc, rpcErrorMessage, type RpcError } from "@/lib/rpc";

export const Route = createFileRoute("/_authenticated/recebimentos")({
  validateSearch: (search: Record<string, unknown>) => ({
    id: typeof search["id"] === "string" ? search["id"] : undefined,
    installment_id:
      typeof search["installment_id"] === "string" ? search["installment_id"] : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Recebimentos — FR Financeiro" },
      {
        name: "description",
        content: "Registro de pagamentos integrais e parciais com alocação automática.",
      },
      { property: "og:title", content: "Recebimentos — FR Financeiro" },
      {
        property: "og:description",
        content: "Registro de pagamentos integrais e parciais com alocação automática.",
      },
    ],
  }),
  component: Recebimentos,
});

function Recebimentos() {
  const [aberto, setAberto] = useState(false);
  const [showAuthDialog, setShowAuthDialog] = useState(false);
  const { id: paymentIdParam, installment_id: installmentIdParam } = Route.useSearch();

  const queryClient = useQueryClient();

  // Real data hooks
  const { data: dbClients } = useClients();
  const { data: dbLoans } = useLoans();
  const { data: dbEmployees } = useEmployees();

  const getPaymentsFn = useServerFn(getPayments);
  const registerPaymentFn = useServerFn(registerPayment);
  const requestPartialFn = useServerFn(requestPartialPayment);

  const { data: userRole } = useQuery({
    queryKey: ["userRole"],
    queryFn: async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return null;
      return await callRpc<string | null>(supabase, "get_current_user_role", {});
    },
  });

  const { data: paymentsData, isLoading: isLoadingPayments } = useQuery({
    queryKey: ["payments"],
    queryFn: () => getPaymentsFn(),
  });
  const payments = useMemo(() => (paymentsData ?? []) as PaymentRow[], [paymentsData]);

  const handleExportCSV = () => {
    if (payments.length === 0) {
      toast.info("Nenhum recebimento para exportar.");
      return;
    }
    const headers = ["ID", "Cliente", "Parcela", "Data Pagamento", "Valor (R$)", "Multa (R$)", "Forma", "Status", "Registrado por"];
    const rows = payments.map((p) => [
      p.id,
      p.installments?.loans?.clients?.full_name ?? "—",
      p.installments?.number ?? "—",
      formatDate(p.paid_at),
      (p.amount / 100).toFixed(2),
      ((p.penalty_amount || 0) / 100).toFixed(2),
      p.payment_method,
      p.status,
      p.employees?.full_name ?? "—"
    ]);

    const csvContent =
      "\uFEFF" +
      [headers.join(";"), ...rows.map((r) => r.map((val) => `"${String(val).replace(/"/g, '""')}"`).join(";"))].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `recebimentos_${new Date().toISOString().split("T")[0]}.csv`);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("Relatório CSV exportado com sucesso!");
  };

  const mutation = useMutation({
    mutationFn: async () => {
      const valCents = Math.round(parseBRLInput(formData.valor) * 100);
      const multaCents = Math.round(parseBRLInput(formData.multa || "0") * 100);
      const descontoCents = formData.tipo === "antecipacao" ? Math.round(parseBRLInput(formData.desconto || "0") * 100) : 0;

      if (formData.tipo === "integral" || formData.tipo === "parcial") {
        return registerPaymentFn({
          data: {
            installment_id: formData.parcelaId,
            amount_cents: valCents,
            penalty_cents: multaCents,
            payment_date: formData.data,
            payment_method: formData.forma,
            notes: formData.obs || null,
            idempotency_key: formData.paymentIntentId,
          },
        });
      }

      if (!selectedInstallment || !dbLoans) {
        throw new Error("Selecione uma parcela para identificar o contrato.");
      }

      const loan = (dbLoans as unknown as LoanRow[]).find((l) => l.id === selectedInstallment.loan_id);
      if (!loan) {
        throw new Error("Contrato não encontrado");
      }

      const openInsts = (loan.installments ?? [])
        .filter((p) => p.status !== "pago")
        .sort((a, b) => a.number - b.number);

      if (openInsts.length === 0) {
        throw new Error("Nenhuma parcela em aberto encontrada para este contrato");
      }

      if (formData.tipo === "quitar") {
        let first = true;
        for (const inst of openInsts) {
          await registerPaymentFn({
            data: {
              installment_id: inst.id,
              amount_cents: inst.outstanding_amount,
              penalty_cents: first ? multaCents : 0,
              payment_date: formData.data,
              payment_method: formData.forma,
              notes: formData.obs ? `${formData.obs} (Quitação)` : "Quitação de empréstimo",
              idempotency_key: `${formData.paymentIntentId}-quitar-${inst.id}`,
            },
          });
          first = false;
        }
        return { success: true };
      }

      if (formData.tipo === "antecipacao") {
        let totalCentsToApply = valCents + descontoCents;
        let first = true;
        
        for (const inst of openInsts) {
          if (totalCentsToApply <= 0) break;
          
          const allocatedCents = Math.min(totalCentsToApply, inst.outstanding_amount);
          if (allocatedCents > 0) {
            await registerPaymentFn({
              data: {
                installment_id: inst.id,
                amount_cents: allocatedCents,
                penalty_cents: first ? multaCents : 0,
                payment_date: formData.data,
                payment_method: formData.forma,
                notes: `[Antecipação] Valor Pago: ${formData.valor} | Desconto: ${formData.desconto}. ${formData.obs || ""}`.trim(),
                idempotency_key: `${formData.paymentIntentId}-antecipa-${inst.id}`,
              },
            });
            totalCentsToApply -= allocatedCents;
            first = false;
          }
        }
        return { success: true };
      }
    },
    onSuccess: () => {
      toast.success("Pagamento registrado com sucesso!");
      queryClient.invalidateQueries({ queryKey: ["payments"] });
      queryClient.invalidateQueries({ queryKey: ["loans"] });
      setAberto(false);
      resetForm();
    },
    onError: (err: unknown) => {
      toast.error(rpcErrorMessage(err as RpcError, "Erro ao registrar pagamento"));
    },
  });

  const partialAuthMutation = useMutation({
    mutationFn: requestPartialFn,
    onSuccess: () => {
      toast.success("Solicitação de pagamento parcial enviada para aprovação!");
      setAberto(false);
      setShowAuthDialog(false);
      resetForm();
    },
    onError: (err: unknown) => {
      toast.error(rpcErrorMessage(err as RpcError, "Erro ao solicitar autorização"));
    },
  });

  // Form state
  const [formData, setFormData] = useState({
    clienteId: "",
    parcelaId: "",
    tipo: "integral" as "integral" | "parcial" | "quitar" | "antecipacao",
    valor: "",
    multa: "0",
    desconto: "0",
    data: new Date().toISOString().split("T")[0],
    forma: "pix" as "pix" | "dinheiro" | "transferencia",
    obs: "",
    paymentIntentId: crypto.randomUUID(),
  });

  const resetForm = () => {
    setFormData({
      clienteId: "",
      parcelaId: "",
      tipo: "integral",
      valor: "",
      multa: "0",
      desconto: "0",
      data: new Date().toISOString().split("T")[0],
      forma: "pix",
      obs: "",
      paymentIntentId: crypto.randomUUID(),
    });
  };

  // Pre-fill from URL params
  useMemo(() => {
    if (installmentIdParam && dbLoans) {
      const allInsts = flattenInstallments(dbLoans as unknown as LoanRow[]);
      const target = allInsts.find((i) => i.id === installmentIdParam);
      if (target) {
        setFormData((s) => ({
          ...s,
          clienteId: target.loan.client_id,
          parcelaId: target.id,
          valor: maskBRL(target.outstanding_amount.toString()),
        }));
        setAberto(true);
      }
    }
  }, [installmentIdParam, dbLoans]);

  const selectedClientLoans = useMemo(() => {
    if (!dbLoans || !formData.clienteId) return [];
    return (dbLoans as unknown as LoanRow[]).filter((l) => l.client_id === formData.clienteId);
  }, [dbLoans, formData.clienteId]);

  const availableInstallments = useMemo(() => {
    return selectedClientLoans
      .flatMap((l) => (l.installments ?? []).filter((p) => p.status !== "pago"))
      .sort((a, b) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime());
  }, [selectedClientLoans]);

  const selectedInstallment = useMemo(() => {
    return availableInstallments.find((i) => i.id === formData.parcelaId);
  }, [availableInstallments, formData.parcelaId]);

  // Auto-fill value if integral or quitar
  useEffect(() => {
    if (formData.tipo === "integral" && selectedInstallment) {
      setFormData((s) => ({
        ...s,
        valor: maskBRL(selectedInstallment.outstanding_amount.toString()),
      }));
    } else if (formData.tipo === "quitar" && selectedInstallment && dbLoans) {
      const loan = (dbLoans as unknown as LoanRow[]).find((l) => l.id === selectedInstallment.loan_id);
      if (loan) {
        const openInsts = (loan.installments ?? []).filter((p) => p.status !== "pago");
        const totalOpen = openInsts.reduce((sum, p) => sum + p.outstanding_amount, 0);
        setFormData((s) => ({
          ...s,
          valor: maskBRL(totalOpen.toString()),
        }));
      }
    }
  }, [formData.tipo, selectedInstallment, dbLoans]);

  const totalPeriodo = useMemo(() => {
    return payments.reduce((s, r) => s + r.amount + (r.penalty_amount || 0), 0);
  }, [payments]);

  const handleRegister = async () => {
    if (!formData.parcelaId || !formData.valor) {
      toast.error("Preencha os campos obrigatórios");
      return;
    }

    if ((formData.tipo === "quitar" || formData.tipo === "antecipacao") && userRole === "employee") {
      toast.error("Quitação e Antecipação são permitidas apenas para Administradores/Gerentes.");
      return;
    }

    const valCents = Math.round(parseBRLInput(formData.valor) * 100);
    const descontoCents = formData.tipo === "antecipacao" ? Math.round(parseBRLInput(formData.desconto || "0") * 100) : 0;

    if (formData.tipo === "antecipacao" && selectedInstallment && dbLoans) {
      const loan = (dbLoans as unknown as LoanRow[]).find((l) => l.id === selectedInstallment.loan_id);
      if (loan) {
        const openInsts = (loan.installments ?? []).filter((p) => p.status !== "pago");
        const totalOpen = openInsts.reduce((sum, p) => sum + p.outstanding_amount, 0);
        if (valCents + descontoCents > totalOpen) {
          toast.error(`O valor antecipado com desconto excede o saldo devedor total do empréstimo (${formatBRL(totalOpen / 100)})`);
          return;
        }
      }
    }

    if (formData.tipo === "parcial" && userRole === "employee") {
      setShowAuthDialog(true);
      return;
    }

    mutation.mutate();
  };

  const handleRequestPartial = () => {
    const valCents = Math.round(parseBRLInput(formData.valor) * 100);
    partialAuthMutation.mutate({
      data: {
        installment_id: formData.parcelaId,
        amount_cents: valCents,
        reason: formData.obs || "Pagamento parcial solicitado",
        notes: "Solicitação via tela de recebimentos",
        idempotency_key: `auth-${formData.paymentIntentId}`,
      },
    });
  };

  return (
    <AppShell>
      <PageHeader
        title="Recebimentos"
        description={`${payments.length} lançamentos · ${formatBRL(totalPeriodo / 100)} recebidos`}
        actions={
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={handleExportCSV}
              className="border-gold/40 text-gold hover:bg-gold/10"
            >
              <Download className="h-4 w-4 mr-2" /> Exportar CSV
            </Button>
            <Button className="bg-gold text-black hover:bg-gold/90" onClick={() => setAberto(true)}>
              <Plus className="h-4 w-4 mr-2" /> Registrar pagamento
            </Button>
          </div>
        }
      />

      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full min-w-[780px] text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="px-4 py-3">Data</th>
              <th className="px-4 py-3">Cliente</th>
              <th className="px-4 py-3">Funcionário</th>
              <th className="px-4 py-3 text-center">Parcela</th>
              <th className="px-4 py-3">Tipo</th>
              <th className="px-4 py-3">Forma</th>
              <th className="px-4 py-3">Multa</th>
              <th className="px-4 py-3 text-right">Valor</th>
            </tr>
          </thead>
          <tbody>
            {isLoadingPayments ? (
              <tr>
                <td colSpan={8} className="p-12 text-center text-muted-foreground">
                  <div className="flex items-center justify-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin text-gold" />
                    Carregando recebimentos...
                  </div>
                </td>
              </tr>
            ) : payments.length === 0 ? (
              <tr>
                <td colSpan={8} className="p-12 text-center text-muted-foreground">
                  Nenhum recebimento registrado.
                </td>
              </tr>
            ) : (
              payments.map((r) => (
                <tr
                  key={r.id}
                  className="border-b border-border/60 last:border-0 hover:bg-muted/20"
                >
                  <td className="px-4 py-3 text-muted-foreground">{formatDate(r.paid_at)}</td>
                  <td className="px-4 py-3 font-medium">
                    <Link
                      to="/clientes"
                      search={{ q: r.installments?.loans?.clients?.full_name }}
                      className="hover:text-gold transition-colors"
                    >
                      {r.installments?.loans?.clients?.full_name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    <Link
                      to="/funcionarios"
                      search={{ id: r.employees?.id }}
                      className="hover:text-gold transition-colors"
                    >
                      {r.employees?.full_name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-center text-muted-foreground">
                    {r.installments?.number}
                  </td>
                  <td className="px-4 py-3 uppercase tracking-tighter text-[10px]">
                    <span
                      className={`rounded-full border px-2 py-0.5 ${r.kind === "integral" ? "border-success/40 bg-success/10 text-success" : "border-gold/40 bg-gold/10 text-gold"}`}
                    >
                      {r.kind}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground uppercase">{r.method}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {r.penalty_amount > 0 ? formatBRL(r.penalty_amount / 100) : "—"}
                  </td>
                  <td className="px-4 py-3 text-right font-display font-bold text-success">
                    {formatBRL((r.amount + r.penalty_amount) / 100)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Registrar pagamento</DialogTitle>
            <DialogDescription>
              Lance o recebimento de uma parcela. A alocação entre capital e lucro é automática.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Cliente</Label>
              <Select
                value={formData.clienteId}
                onValueChange={(v) => setFormData((s) => ({ ...s, clienteId: v, parcelaId: "" }))}
              >
                <SelectTrigger className="bg-muted/30">
                  <SelectValue placeholder="Selecione o cliente" />
                </SelectTrigger>
                <SelectContent>
                  {dbClients?.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.full_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Parcela Pendente</Label>
                <Select
                  value={formData.parcelaId}
                  onValueChange={(v) => setFormData((s) => ({ ...s, parcelaId: v }))}
                  disabled={!formData.clienteId}
                >
                  <SelectTrigger className="bg-muted/30">
                    <SelectValue placeholder="Selecione a parcela" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableInstallments.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        P. {p.number} — {formatBRL(p.outstanding_amount / 100)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Data do pagamento</Label>
                <Input
                  type="date"
                  value={formData.data}
                  onChange={(e) => setFormData((s) => ({ ...s, data: e.target.value }))}
                  className="bg-muted/30"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Tipo de pagamento</Label>
              <RadioGroup
                value={formData.tipo}
                onValueChange={(v) =>
                  setFormData((s) => ({ ...s, tipo: v as "integral" | "parcial" | "quitar" | "antecipacao" }))
                }
                className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:gap-4"
              >
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <RadioGroupItem value="integral" /> Integral
                </label>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <RadioGroupItem value="parcial" /> Parcial
                </label>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <RadioGroupItem value="quitar" disabled={userRole === "employee"} /> Quitar Empréstimo
                  {userRole === "employee" && <span className="text-[9px] text-muted-foreground">(Apenas Adm)</span>}
                </label>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <RadioGroupItem value="antecipacao" disabled={userRole === "employee"} /> Antecipação
                  {userRole === "employee" && <span className="text-[9px] text-muted-foreground">(Apenas Adm)</span>}
                </label>
              </RadioGroup>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Valor recebido (R$)</Label>
                <Input
                  value={formData.valor}
                  onChange={(e) => setFormData((s) => ({ ...s, valor: maskBRL(e.target.value) }))}
                  inputMode="decimal"
                  className="bg-muted/30"
                  readOnly={formData.tipo === "integral" || formData.tipo === "quitar"}
                />
              </div>
              <div className="space-y-2">
                <Label>Multa recebida (R$)</Label>
                <Input
                  value={formData.multa}
                  onChange={(e) => setFormData((s) => ({ ...s, multa: maskBRL(e.target.value) }))}
                  inputMode="decimal"
                  className="bg-muted/30"
                />
              </div>
              {formData.tipo === "antecipacao" && (
                <div className="space-y-2 col-span-2">
                  <Label>Desconto concedido (R$)</Label>
                  <Input
                    value={formData.desconto}
                    onChange={(e) => setFormData((s) => ({ ...s, desconto: maskBRL(e.target.value) }))}
                    inputMode="decimal"
                    className="bg-muted/30"
                  />
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label>Forma de pagamento</Label>
              <Select
                value={formData.forma}
                onValueChange={(v) =>
                  setFormData((s) => ({ ...s, forma: v as "pix" | "dinheiro" | "transferencia" }))
                }
              >
                <SelectTrigger className="bg-muted/30">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="dinheiro">Dinheiro</SelectItem>
                  <SelectItem value="pix">PIX</SelectItem>
                  <SelectItem value="transferencia">Transferência</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Observação</Label>
              <Textarea
                value={formData.obs}
                onChange={(e) => setFormData((s) => ({ ...s, obs: e.target.value }))}
                placeholder="Anotação opcional"
                className="bg-muted/30"
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:justify-between pt-4">
            <Button variant="outline" onClick={() => setAberto(false)}>
              Cancelar
            </Button>
            <Button
              className="bg-success text-white hover:bg-success/90"
              onClick={handleRegister}
              disabled={mutation.isPending}
            >
              {mutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Confirmar recebimento"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showAuthDialog} onOpenChange={setShowAuthDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-gold" />
              Autorização Necessária
            </DialogTitle>
            <DialogDescription>
              Pagamentos parciais exigem aprovação da gerência ou proprietário. Deseja enviar uma
              solicitação de autorização?
            </DialogDescription>
          </DialogHeader>
          <div className="bg-muted/30 p-4 rounded-lg space-y-2">
            <p className="text-sm">
              <strong>Valor solicitado:</strong> {formatBRL(parseFloat(formData.valor || "0"))}
            </p>
            <p className="text-sm">
              <strong>Motivo:</strong> {formData.obs || "Não informado"}
            </p>
          </div>
          <DialogFooter className="gap-2 pt-4">
            <Button variant="outline" onClick={() => setShowAuthDialog(false)}>
              Voltar
            </Button>
            <Button
              className="bg-gold text-black hover:bg-gold/90"
              onClick={handleRequestPartial}
              disabled={partialAuthMutation.isPending}
            >
              {partialAuthMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Solicitar Aprovação"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
