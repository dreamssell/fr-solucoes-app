import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Search, MessageCircle, ListChecks, Loader2, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell, PageHeader } from "@/components/fr/AppShell";
import { StatusPill } from "@/components/fr/bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
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
import { formatBRL, formatDate, getWhatsAppLink } from "@/lib/format";
import { toPillStatus } from "@/lib/status";
import { useEmployees } from "@/hooks/use-employees";
import { useLoans } from "@/hooks/use-loans";
import {
  flattenInstallments,
  isSettled,
  type FlatInstallment,
  type LoanRow,
} from "@/finance/aggregations";
import { toast } from "sonner";
import { getLocalDateString } from "@/lib/dates";

export const Route = createFileRoute("/_authenticated/cobrancas")({
  validateSearch: (search: Record<string, unknown>) => ({
    employee_id: typeof search["employee_id"] === "string" ? search["employee_id"] : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Cobranças do dia — FR Financeiro" },
      {
        name: "description",
        content:
          "Cobranças diárias organizadas por funcionário, com filtros e preparo de mensagem.",
      },
      { property: "og:title", content: "Cobranças do dia — FR Financeiro" },
      {
        property: "og:description",
        content:
          "Cobranças diárias organizadas por funcionário, com filtros e preparo de mensagem.",
      },
    ],
  }),
  component: Cobrancas,
});

function Cobrancas() {
  const { employee_id: employeeIdParam } = Route.useSearch();

  const [busca, setBusca] = useState("");
  const [funcFilter, setFuncFilter] = useState(employeeIdParam || "todos");
  const [statusFilter, setStatusFilter] = useState("pendente"); // Default to pending
  const [dataFilter, setDataFilter] = useState(getLocalDateString());
  const [selecionados, setSelecionados] = useState<string[]>([]);
  const [mensagem, setMensagem] = useState<string | null>(null);
  const [notifying, setNotifying] = useState<{ empId: string; instIds: string[] } | null>(null);
  const [notifIdempotencyKey, setNotifIdempotencyKey] = useState("");

  const { data: dbEmployees } = useEmployees();
  const { data: dbLoans, isLoading: isLoadingLoans } = useLoans();

  const allInstallments = useMemo(() => {
    if (!dbLoans) return [];
    return flattenInstallments(dbLoans as unknown as LoanRow[]);
  }, [dbLoans]);

  const filteredInstallments = useMemo(() => {
    const hoje = getLocalDateString();
    return allInstallments.filter((inst) => {
      const okBusca =
        busca.trim() === "" ||
        inst.client?.full_name?.toLowerCase().includes(busca.toLowerCase()) ||
        inst.client?.phone?.includes(busca);

      const okFunc = funcFilter === "todos" || inst.employee?.id === funcFilter;

      const instDate = (inst.due_date || "").split("T")[0] ?? "";
      const quitada = isSettled(inst.status);

      let okStatus = true;
      if (statusFilter === "pendente") okStatus = !quitada && instDate === (dataFilter || hoje);
      else if (statusFilter === "atrasado") okStatus = !quitada && instDate < hoje;
      else if (statusFilter === "pago") okStatus = inst.status === "pago";

      return okBusca && okFunc && okStatus;
    });
  }, [allInstallments, busca, funcFilter, statusFilter, dataFilter]);

  const grupos = useMemo(() => {
    if (!dbEmployees) return [];
    return dbEmployees
      .map((f) => ({
        funcionario: f,
        itens: filteredInstallments.filter((i) => i.employee?.id === f.id),
      }))
      .filter((g) => g.itens.length > 0);
  }, [dbEmployees, filteredInstallments]);

  const toggle = (id: string) =>
    setSelecionados((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const prepararIndividual = (inst: FlatInstallment) => {
    const firstName = inst.client?.full_name?.split(" ")[0] || "Cliente";
    const delayDays = Math.max(
      0,
      Math.floor(
        (Date.now() - new Date(`${(inst.due_date || "").split("T")[0]}T12:00:00`).getTime()) /
          86400000,
      ),
    );

    setMensagem(
      `Olá, ${firstName}! Aqui é do FR Financeiro.\n` +
        `Sua parcela ${inst.number} venceu em ${formatDate(inst.due_date)}.\n` +
        (delayDays > 0 ? `Atraso de ${delayDays} dia(s).\n` : "") +
        `Valor em aberto: ${formatBRL(inst.outstanding_amount / 100)}.\n` +
        `Podemos confirmar o pagamento hoje?`,
    );
  };

  const prepararLista = (empId?: string, forceItems?: FlatInstallment[]) => {
    const selecionadas =
      forceItems || filteredInstallments.filter((i) => selecionados.includes(i.id));
    if (selecionadas.length === 0) {
      toast.error("Selecione ao menos um cliente para montar a lista.");
      return;
    }

    const targetEmpId =
      empId || (selecionadas.length > 0 ? (selecionadas[0]?.employee?.id ?? null) : null);
    const targetEmp = dbEmployees?.find((f) => f.id === targetEmpId);

    const total = selecionadas.reduce((s, i) => s + i.outstanding_amount, 0);

    const texto =
      `LISTA DE COBRANÇA — ${formatDate(dataFilter || "")}\n\n` +
      (targetEmp ? `Responsável: ${targetEmp.full_name}\n\n` : "") +
      selecionadas
        .map(
          (i) =>
            `• ${i.client?.full_name} — parcela ${i.number} — ${formatBRL(i.outstanding_amount / 100)}`,
        )
        .join("\n") +
      `\n\nTotal previsto: ${formatBRL(total / 100)}`;

    setMensagem(texto);
    if (targetEmpId) {
      setNotifying({ empId: targetEmpId, instIds: selecionadas.map((i) => i.id) });
      setNotifIdempotencyKey(`notif-coll-${targetEmpId}-${getLocalDateString()}-${crypto.randomUUID().slice(0, 8)}`);
    }
  };

  const handleConfirmNotification = async () => {
    if (!notifying) return;

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const { error } = await supabase.from("employee_notifications").insert({
        employee_id: notifying.empId,
        installment_ids: notifying.instIds,
        notification_type: "collection_route",
        sent_by: user?.id || null,
        idempotency_key: notifIdempotencyKey,
        payload: { message: mensagem },
      });

      if (error) {
        if (error.code === "23505") {
          toast.info("Aviso já registrado para este funcionário hoje.");
        } else {
          throw error;
        }
      } else {
        toast.success("Confirmação de aviso registrada com sucesso!");
      }
      setMensagem(null);
      setNotifying(null);
    } catch (err: unknown) {
      toast.error(
        "Erro ao registrar confirmação: " + (err instanceof Error ? err.message : String(err)),
      );
    }
  };

  const totalDia = filteredInstallments.reduce((s, c) => s + c.outstanding_amount, 0);

  return (
    <AppShell>
      <PageHeader
        title="Cobranças do dia"
        description={`${filteredInstallments.length} parcelas · total ${formatBRL(totalDia / 100)}`}
        actions={
          <Button
            className="bg-gold text-black hover:bg-gold/90"
            onClick={() => prepararLista()}
            disabled={selecionados.length === 0}
          >
            <ListChecks className="h-4 w-4 mr-2" />
            Preparar lista ({selecionados.length})
          </Button>
        }
      />

      <div className="grid gap-3 rounded-xl border border-border bg-card p-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar cliente ou telefone"
            className="pl-9"
          />
        </div>
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
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger>
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os status</SelectItem>
            <SelectItem value="pendente">Pendentes</SelectItem>
            <SelectItem value="atrasado">Vencidas (Atraso)</SelectItem>
            <SelectItem value="pago">Recebidas</SelectItem>
          </SelectContent>
        </Select>
        <Input type="date" value={dataFilter} onChange={(e) => setDataFilter(e.target.value)} />
      </div>

      {isLoadingLoans ? (
        <div className="flex flex-col items-center justify-center p-12 gap-3 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin text-gold" />
          <p className="text-sm">Carregando cobranças reais...</p>
        </div>
      ) : grupos.length === 0 ? (
        <p className="rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
          Nenhuma cobrança encontrada para este dia.
        </p>
      ) : (
        grupos.map((g) => (
          <section
            key={g.funcionario.id}
            className="rounded-xl border border-border bg-card overflow-hidden"
          >
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-border bg-muted/30 px-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{g.funcionario.full_name}</p>
                <p className="text-xs text-muted-foreground">
                  {g.itens.length} parcelas ·{" "}
                  {formatBRL(g.itens.reduce((s, i) => s + i.outstanding_amount, 0) / 100)}
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="bg-gold/10 border-gold/30 text-gold hover:bg-gold/20"
                onClick={() => prepararLista(g.funcionario.id, g.itens)}
              >
                Preparar Rota do Dia
              </Button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="w-10 px-4 py-2"></th>
                    <th className="px-4 py-2">Cliente</th>
                    <th className="px-4 py-2 text-center">Parcela</th>
                    <th className="px-4 py-2">Vencimento</th>
                    <th className="px-4 py-2">Valor</th>
                    <th className="px-4 py-2">Status</th>
                    <th className="px-4 py-2 text-right">Ação</th>
                  </tr>
                </thead>
                <tbody>
                  {g.itens.map((c) => (
                    <tr
                      key={c.id}
                      className="border-b border-border/60 last:border-0 hover:bg-muted/20 transition-colors"
                    >
                      <td className="px-4 py-3 text-center">
                        {c.status !== "pago" && (
                          <Checkbox
                            checked={selecionados.includes(c.id)}
                            onCheckedChange={() => toggle(c.id)}
                            aria-label="Selecionar"
                          />
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-medium">{c.client?.full_name}</p>
                        <p className="text-xs text-muted-foreground">{c.client?.phone}</p>
                      </td>
                      <td className="px-4 py-3 text-center text-muted-foreground">{c.number}</td>
                      <td className="px-4 py-3 text-muted-foreground">{formatDate(c.due_date)}</td>
                      <td className="px-4 py-3 font-display font-bold text-gold">
                        {formatBRL(c.outstanding_amount / 100)}
                      </td>
                      <td className="px-4 py-3">
                        <StatusPill status={toPillStatus(c.status)} />
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-gold/40 text-gold hover:bg-gold/10 hover:text-gold"
                          onClick={() => prepararIndividual(c)}
                        >
                          Preparar mensagem
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ))
      )}

      <Dialog open={mensagem !== null} onOpenChange={(o) => !o && setMensagem(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Mensagem de cobrança</DialogTitle>
            <DialogDescription>Texto pronto para envio assistido via WhatsApp.</DialogDescription>
          </DialogHeader>
          <Textarea
            value={mensagem ?? ""}
            onChange={(e) => setMensagem(e.target.value)}
            className="min-h-48 font-mono text-xs bg-muted/30"
          />
          <DialogFooter className="gap-2 sm:justify-between pt-4">
            <Button
              variant="outline"
              onClick={() => {
                setMensagem(null);
                setNotifying(null);
              }}
            >
              Fechar
            </Button>
            <div className="flex gap-2">
              <Button
                className="bg-success text-white hover:bg-success/90"
                onClick={() => {
                  const emp = dbEmployees?.find((f) => f.id === notifying?.empId);
                  const phone = emp?.whatsapp || "";
                  const link = getWhatsAppLink(phone, mensagem || "");
                  if (!link) {
                    toast.error("Funcionário sem telefone válido para WhatsApp.");
                    return;
                  }
                  toast.success("Abrindo WhatsApp...");
                  window.open(link, "_blank");
                }}
              >
                <MessageCircle className="h-4 w-4 mr-2" />
                Abrir WhatsApp
              </Button>
              {notifying && (
                <Button
                  className="bg-gold text-black hover:bg-gold/90"
                  onClick={handleConfirmNotification}
                >
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                  Confirmar que avisei
                </Button>
              )}
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
