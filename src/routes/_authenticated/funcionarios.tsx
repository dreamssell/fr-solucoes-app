import { rpcErrorMessage, type RpcError } from "@/lib/rpc";
import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo, useEffect } from "react";
import { MessageCircle, Loader2, Check, AlertCircle, Plus, Trash2 } from "lucide-react";
import { AppShell, PageHeader } from "@/components/fr/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatBRL, formatDate, getWhatsAppLink, normalizeBrazilianPhone } from "@/lib/format";
import { validateCPF } from "@/finance/validators";
import { useEmployees } from "@/hooks/use-employees";
import { useClients } from "@/hooks/use-clients";
import { useLoans } from "@/hooks/use-loans";
import { usePayments } from "@/hooks/use-payments";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  updateEmployeePreference,
  createEmployee,
  updateEmployee,
  deleteEmployee,
} from "@/lib/employees.functions";
import { toast } from "sonner";
import {
  isEmployeeActive,
  countClientsByEmployee,
  flattenInstallments,
  isSettled,
  toDay,
  buildSettlement,
  currentWeek,
  type LoanRow,
  type PaymentRow,
} from "@/finance/aggregations";
import { parseFuncionariosSearch, findEmployeeCard } from "./-funcionarios.helpers";

export const Route = createFileRoute("/_authenticated/funcionarios")({
  validateSearch: parseFuncionariosSearch,
  head: () => ({
    meta: [
      { title: "Funcionários — FR Financeiro" },
      {
        name: "description",
        content: "Equipe de campo com carteira, recebimentos da semana e próximos acertos.",
      },
      { property: "og:title", content: "Funcionários — FR Financeiro" },
      {
        property: "og:description",
        content: "Equipe de campo com carteira, recebimentos da semana e próximos acertos.",
      },
    ],
  }),
  component: Funcionarios,
});

type EmployeeCard = {
  id: string;
  nome: string;
  phone: string;
  whatsapp: string;
  pix_key: string;
  notes: string;
  cpf: string;
  ativo: boolean;
  clientes: number;
  recebidoSemanaCents: number;
  atrasos: number;
  commission_rate_percent: number;
  penalty_split_percent: number;
};

const onlyDigits = (v: string) => (v || "").replace(/\D/g, "");

function Funcionarios() {
  const { id: idParam } = Route.useSearch();
  const [busca, setBusca] = useState("");
  const [sel, setSel] = useState<EmployeeCard | null>(null);
  const { data: dbEmployees, isLoading } = useEmployees();
  const { data: dbClients } = useClients();
  const { data: dbLoans } = useLoans();
  const { data: dbPayments } = usePayments();

  const loans = useMemo(() => (dbLoans ?? []) as unknown as LoanRow[], [dbLoans]);
  const payments = useMemo(() => (dbPayments ?? []) as unknown as PaymentRow[], [dbPayments]);
  const hoje = new Date().toISOString().split("T")[0] as string;
  const semana = currentWeek(hoje);

  const cards = useMemo<EmployeeCard[]>(() => {
    if (!dbEmployees) return [];
    const clientCount = countClientsByEmployee((dbClients ?? []) as { employee_id: string }[]);
    const insts = flattenInstallments(loans);

    return dbEmployees.map((emp) => ({
      id: emp.id,
      nome: emp.full_name,
      phone: emp.phone,
      whatsapp: emp.whatsapp,
      pix_key: emp.pix_key ?? "",
      notes: emp.notes ?? "",
      cpf: emp.cpf ?? "",
      ativo: isEmployeeActive(emp.status as string),
      clientes: clientCount[emp.id] ?? 0,
      recebidoSemanaCents: payments
        .filter(
          (p) =>
            p.status !== "estornado" &&
            p.employee_id === emp.id &&
            toDay(p.paid_at) >= semana.start &&
            toDay(p.paid_at) <= semana.end,
        )
        .reduce((s, p) => s + p.amount + (p.penalty_amount || 0), 0),
      atrasos: insts.filter(
        (i) => i.employee_id === emp.id && !isSettled(i.status) && toDay(i.due_date) < hoje,
      ).length,
      commission_rate_percent: Number((emp as any).commission_rate_percent ?? 10),
      penalty_split_percent: Number((emp as any).penalty_split_percent ?? 50),
    }));
  }, [dbEmployees, dbClients, loans, payments, hoje, semana.start, semana.end]);

  const [isNewEmployeeOpen, setIsNewEmployeeOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [newFormData, setNewFormData] = useState({
    full_name: "",
    phone: "",
    whatsapp: "",
    cpf: "",
    pix_key: "",
    notes: "",
    commission_rate_percent: "10",
    penalty_split_percent: "50",
  });
  const queryClient = useQueryClient();
  const createEmployeeFn = useServerFn(createEmployee);

  const handleCreateEmployee = async () => {
    if (!newFormData.full_name || !newFormData.phone || !newFormData.whatsapp) {
      toast.error("Preencha os campos obrigatórios: Nome, Telefone e WhatsApp.");
      return;
    }

    const normPhone = normalizeBrazilianPhone(newFormData.phone);
    if (!normPhone) {
      toast.error("Telefone inválido.");
      return;
    }

    const normWhatsapp = normalizeBrazilianPhone(newFormData.whatsapp);
    if (!normWhatsapp) {
      toast.error("WhatsApp inválido.");
      return;
    }

    if (newFormData.cpf && !validateCPF(newFormData.cpf)) {
      toast.error("CPF inválido.");
      return;
    }

    setIsCreating(true);
    try {
      await createEmployeeFn({
        data: {
          full_name: newFormData.full_name,
          phone: normPhone,
          whatsapp: normWhatsapp,
          cpf: newFormData.cpf || undefined,
          pix_key: newFormData.pix_key || undefined,
          notes: newFormData.notes || undefined,
          commission_rate_percent: newFormData.commission_rate_percent !== "" ? parseFloat(newFormData.commission_rate_percent) : 10,
          penalty_split_percent: newFormData.penalty_split_percent !== "" ? parseFloat(newFormData.penalty_split_percent) : 50,
        }
      });
      toast.success("Colaborador cadastrado com sucesso!");
      queryClient.invalidateQueries({ queryKey: ["employees"] });
      setIsNewEmployeeOpen(false);
      setNewFormData({
        full_name: "",
        phone: "",
        whatsapp: "",
        cpf: "",
        pix_key: "",
        notes: "",
        commission_rate_percent: "10",
        penalty_split_percent: "50",
      });
    } catch (err) {
      toast.error(rpcErrorMessage(err as RpcError, "Erro ao cadastrar funcionário"));
    } finally {
      setIsCreating(false);
    }
  };

  // Deep linking via search param (efeito colateral: nunca em useMemo).
  useEffect(() => {
    const target = findEmployeeCard(cards, idParam);
    if (target) setSel(target);
  }, [idParam, cards]);

  if (isLoading) {
    return (
      <AppShell>
        <div className="flex h-64 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-gold/30 border-t-gold" />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <PageHeader title="Funcionários" description={`${cards.length} colaboradores cadastrados`} />

      <div className="mb-4 flex items-center justify-between gap-3">
        <Input
          placeholder="Buscar funcionário por nome..."
          value={busca}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setBusca(e.target.value)}
          className="max-w-md"
        />
        <Button
          onClick={() => setIsNewEmployeeOpen(true)}
          className="bg-gold text-black hover:bg-gold/90 font-bold flex items-center gap-1.5"
        >
          <Plus className="h-4 w-4" /> Novo Colaborador
        </Button>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {cards
          .filter((f) => f.nome.toLowerCase().includes(busca.toLowerCase()))
          .map((f) => (
            <article key={f.id} className="rounded-xl border border-border bg-card p-4">
              <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
                <div className="min-w-0">
                  <p className="truncate font-semibold">{f.nome}</p>
                  <p className="truncate text-xs text-muted-foreground">{f.whatsapp}</p>
                </div>
                <span
                  className={`shrink-0 rounded-full border px-2.5 py-0.5 text-xs ${
                    f.ativo
                      ? "border-success/40 bg-success/12 text-success"
                      : "border-border bg-muted text-muted-foreground"
                  }`}
                >
                  {f.ativo ? "Ativo" : "Inativo"}
                </span>
              </div>

              <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <Item label="Clientes" valor={String(f.clientes)} />
                <Item
                  label="Recebido na semana"
                  valor={formatBRL(f.recebidoSemanaCents / 100)}
                  tone="text-success"
                />
                <Item
                  label="Atrasos"
                  valor={String(f.atrasos)}
                  tone={f.atrasos > 0 ? "text-danger" : undefined}
                />
                <Item
                  label="Semana"
                  valor={`${formatDate(semana.start).slice(0, 5)}–${formatDate(semana.end).slice(0, 5)}`}
                  tone="text-gold"
                />
              </dl>

              <div className="mt-4 flex flex-wrap gap-2">
                <Button
                  asChild
                  size="sm"
                  className="bg-success text-primary-foreground hover:bg-success/90"
                  disabled={!getWhatsAppLink(f.whatsapp)}
                >
                  <a href={getWhatsAppLink(f.whatsapp)} target="_blank" rel="noreferrer noopener">
                    <MessageCircle className="h-4 w-4" /> WhatsApp
                  </a>
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="border-gold/40 text-gold hover:bg-gold/10 hover:text-gold"
                  onClick={() => setSel(f)}
                >
                  Ver painel
                </Button>
              </div>
            </article>
          ))}
      </div>

      {sel && (
        <PainelFuncionario
          funcionario={sel}
          loans={loans}
          payments={payments}
          semana={semana}
          hoje={hoje}
          onClose={() => setSel(null)}
        />
      )}

      {isNewEmployeeOpen && (
        <Dialog open onOpenChange={setIsNewEmployeeOpen}>
          <DialogContent className="sm:max-w-md bg-card">
            <DialogHeader>
              <DialogTitle className="text-gold font-bold text-lg">Novo Colaborador</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="new_name">Nome Completo *</Label>
                <Input
                  id="new_name"
                  placeholder="Nome do colaborador"
                  value={newFormData.full_name}
                  onChange={(e) => setNewFormData((s) => ({ ...s, full_name: e.target.value }))}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="new_phone">Telefone *</Label>
                  <Input
                    id="new_phone"
                    placeholder="(00) 00000-0000"
                    value={newFormData.phone}
                    onChange={(e) => setNewFormData((s) => ({ ...s, phone: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="new_whatsapp">WhatsApp *</Label>
                  <Input
                    id="new_whatsapp"
                    placeholder="00900000000"
                    value={newFormData.whatsapp}
                    onChange={(e) => setNewFormData((s) => ({ ...s, whatsapp: e.target.value }))}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="new_cpf">CPF (opcional)</Label>
                  <Input
                    id="new_cpf"
                    placeholder="000.000.000-00"
                    value={newFormData.cpf}
                    onChange={(e) => setNewFormData((s) => ({ ...s, cpf: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="new_pix">Chave PIX (opcional)</Label>
                  <Input
                    id="new_pix"
                    placeholder="CPF, E-mail, Celular..."
                    value={newFormData.pix_key}
                    onChange={(e) => setNewFormData((s) => ({ ...s, pix_key: e.target.value }))}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="new_commission">Comissão Padrão (%)</Label>
                  <Input
                    id="new_commission"
                    type="number"
                    value={newFormData.commission_rate_percent}
                    onChange={(e) => setNewFormData((s) => ({ ...s, commission_rate_percent: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="new_penalty">Divisão de Multa (%)</Label>
                  <Input
                    id="new_penalty"
                    type="number"
                    value={newFormData.penalty_split_percent}
                    onChange={(e) => setNewFormData((s) => ({ ...s, penalty_split_percent: e.target.value }))}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="new_notes">Observações</Label>
                <Input
                  id="new_notes"
                  placeholder="Notas adicionais"
                  value={newFormData.notes}
                  onChange={(e) => setNewFormData((s) => ({ ...s, notes: e.target.value }))}
                />
              </div>
            </div>
            <DialogFooter className="flex gap-2">
              <Button variant="outline" onClick={() => setIsNewEmployeeOpen(false)}>
                Cancelar
              </Button>
              <Button
                className="bg-gold text-black hover:bg-gold/90 font-bold"
                onClick={handleCreateEmployee}
                disabled={isCreating}
              >
                {isCreating ? <Loader2 className="h-4 w-4 animate-spin" /> : "Cadastrar Colaborador"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </AppShell>
  );
}

function PainelFuncionario({
  funcionario,
  loans,
  payments,
  semana,
  hoje,
  onClose,
}: {
  funcionario: EmployeeCard;
  loans: LoanRow[];
  payments: PaymentRow[];
  semana: { start: string; end: string };
  hoje: string;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const updatePrefFn = useServerFn(updateEmployeePreference);
  const updateEmployeeFn = useServerFn(updateEmployee);
  const deleteEmployeeFn = useServerFn(deleteEmployee);

  const [editName, setEditName] = useState(funcionario.nome);
  const [editPhone, setEditPhone] = useState(funcionario.phone);
  const [editWhatsapp, setEditWhatsapp] = useState(funcionario.whatsapp);
  const [editCpf, setEditCpf] = useState(funcionario.cpf);
  const [editPixKey, setEditPixKey] = useState(funcionario.pix_key);
  const [editNotes, setEditNotes] = useState(funcionario.notes);
  const [editCommission, setEditCommission] = useState(funcionario.commission_rate_percent.toString());
  const [editPenaltySplit, setEditPenaltySplit] = useState(funcionario.penalty_split_percent.toString());
  const [editStatus, setEditStatus] = useState<"ativo" | "inativo">(funcionario.ativo ? "ativo" : "inativo");
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const [activeTab, setActiveTab] = useState("carteira");
  const [carteiraPage, setCarteiraPage] = useState(1);
  const [cobrancasPage, setCobrancasPage] = useState(1);
  const [cobrancasFreqFilter, setCobrancasFreqFilter] = useState("todos");

  const carteiraPageSize = 10;
  const cobrancasPageSize = 10;

  useEffect(() => {
    setCobrancasPage(1);
  }, [cobrancasFreqFilter]);

  useEffect(() => {
    setEditName(funcionario.nome);
    setEditPhone(funcionario.phone);
    setEditWhatsapp(funcionario.whatsapp);
    setEditCpf(funcionario.cpf);
    setEditPixKey(funcionario.pix_key);
    setEditNotes(funcionario.notes);
    setEditCommission(funcionario.commission_rate_percent.toString());
    setEditPenaltySplit(funcionario.penalty_split_percent.toString());
    setEditStatus(funcionario.ativo ? "ativo" : "inativo");
  }, [funcionario]);

  const handleUpdateEmployee = async () => {
    if (!editName || !editPhone || !editWhatsapp) {
      toast.error("Nome, Telefone e WhatsApp são obrigatórios.");
      return;
    }

    const normPhone = normalizeBrazilianPhone(editPhone);
    if (!normPhone) {
      toast.error("Telefone inválido.");
      return;
    }

    const normWhatsapp = normalizeBrazilianPhone(editWhatsapp);
    if (!normWhatsapp) {
      toast.error("WhatsApp inválido.");
      return;
    }

    if (editCpf && !validateCPF(editCpf)) {
      toast.error("CPF inválido.");
      return;
    }

    setIsSaving(true);
    try {
      await updateEmployeeFn({
        data: {
          id: funcionario.id,
          updates: {
            full_name: editName,
            phone: normPhone,
            whatsapp: normWhatsapp,
            cpf: editCpf || null,
            pix_key: editPixKey || null,
            notes: editNotes || null,
            commission_rate_percent: editCommission !== "" ? parseFloat(editCommission) : 10,
            penalty_split_percent: editPenaltySplit !== "" ? parseFloat(editPenaltySplit) : 50,
            status: editStatus,
          }
        }
      });
      toast.success("Colaborador atualizado com sucesso!");
      queryClient.invalidateQueries({ queryKey: ["employees"] });
    } catch (err) {
      toast.error(rpcErrorMessage(err as RpcError, "Erro ao atualizar funcionário"));
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteEmployee = async () => {
    if (!confirm(`Tem certeza que deseja excluir o colaborador ${funcionario.nome}?`)) {
      return;
    }
    setIsDeleting(true);
    try {
      await deleteEmployeeFn({
        data: { id: funcionario.id }
      });
      toast.success("Colaborador excluído com sucesso!");
      queryClient.invalidateQueries({ queryKey: ["employees"] });
      onClose();
    } catch (err) {
      toast.error(rpcErrorMessage(err as RpcError, "Erro ao excluir funcionário"));
    } finally {
      setIsDeleting(false);
    }
  };

  const { data: dbEmployees } = useEmployees();
  const employeeData = dbEmployees?.find((e) => e.id === funcionario.id);
  const pref = employeeData?.notification_preference || "consolidated_daily";

  const mutation = useMutation({
    mutationFn: (newPref: "individual" | "consolidated_daily" | "both") =>
      updatePrefFn({ data: { employeeId: funcionario.id, preference: newPref } }),
    onSuccess: () => {
      toast.success("Preferência atualizada com sucesso!");
      queryClient.invalidateQueries({ queryKey: ["employees"] });
    },
    onError: (err: unknown) => {
      toast.error(rpcErrorMessage(err as RpcError, "Erro ao salvar preferência"));
    },
  });

    const insts = flattenInstallments(loans).filter((i) => i.employee_id === funcionario.id);

  const carteira = useMemo(() => {
    const map = new Map<string, { nome: string; saldoCents: number; frequencies: Set<string> }>();
    for (const i of insts) {
      const nome = i.client?.full_name ?? "Cliente";
      const freq = i.loan?.frequency;
      const prev = map.get(i.client_id) ?? { nome, saldoCents: 0, frequencies: new Set<string>() };
      if (freq) prev.frequencies.add(freq);
      map.set(i.client_id, {
        nome,
        saldoCents: prev.saldoCents + i.outstanding_amount,
        frequencies: prev.frequencies,
      });
    }
    return [...map.entries()].map(([id, v]) => ({
      id,
      ...v,
      freqText: v.frequencies.size > 0
        ? Array.from(v.frequencies)
            .map((f) => f.charAt(0).toUpperCase() + f.slice(1))
            .join(", ")
        : "—",
    }));
  }, [insts]);

  const paginatedCarteira = useMemo(() => {
    const start = (carteiraPage - 1) * carteiraPageSize;
    return carteira.slice(start, start + carteiraPageSize);
  }, [carteira, carteiraPage]);

  const filteredCobrancas = useMemo(() => {
    const rawCobrancas = insts
      .filter((i) => !isSettled(i.status) && toDay(i.due_date) <= hoje)
      .sort((a, b) => toDay(a.due_date).localeCompare(toDay(b.due_date)));
      
    if (cobrancasFreqFilter === "todos") return rawCobrancas;
    return rawCobrancas.filter((c) => c.loan?.frequency === cobrancasFreqFilter);
  }, [insts, hoje, cobrancasFreqFilter]);

  const paginatedCobrancas = useMemo(() => {
    const start = (cobrancasPage - 1) * cobrancasPageSize;
    return filteredCobrancas.slice(start, start + cobrancasPageSize);
  }, [filteredCobrancas, cobrancasPage]);

  const whatsappMessage = useMemo(() => {
    const periodicityLabel = cobrancasFreqFilter === "todos"
      ? "Todas"
      : cobrancasFreqFilter.charAt(0).toUpperCase() + cobrancasFreqFilter.slice(1);
      
    const uniqueClientsCount = new Set(filteredCobrancas.map((c) => c.client_id)).size;

    let text = `Clientes ${funcionario.nome} - ${periodicityLabel} - ${uniqueClientsCount}\n`;
    
    filteredCobrancas.forEach((c) => {
      const clientName = c.client?.full_name ?? "Cliente";
      const installmentNum = c.number.toString().padStart(2, "0");
      const totalInstallments = (c.loan?.installments_count ?? 0).toString().padStart(2, "0");
      const value = formatBRL(c.outstanding_amount / 100);
      
      text += `${clientName} - Parcela ${installmentNum} de ${totalInstallments} - ${value}\n`;
    });
    
    return text.trim();
  }, [cobrancasFreqFilter, filteredCobrancas, funcionario.nome]);

  const rawEmp = dbEmployees?.find((e) => e.id === funcionario.id);
  const penaltySplitPercent = rawEmp && "penalty_split_percent" in rawEmp ? Number((rawEmp as any).penalty_split_percent ?? 50) : 50;
  const acerto = buildSettlement(payments, loans, funcionario.id, semana.start, semana.end, penaltySplitPercent);

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <div className="flex items-center justify-between">
            <SheetTitle className="text-lg">{funcionario.nome}</SheetTitle>
            <span
              className={`rounded-full border px-2.5 py-0.5 text-[10px] uppercase font-bold ${funcionario.ativo ? "border-success/40 bg-success/12 text-success" : "border-border bg-muted text-muted-foreground"}`}
            >
              {funcionario.ativo ? "Ativo" : "Inativo"}
            </span>
          </div>
          <SheetDescription>
            {funcionario.whatsapp} · semana {formatDate(semana.start)} a {formatDate(semana.end)}
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-5 px-4 pb-8">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="w-full">
              <TabsTrigger value="carteira" className="flex-1">
                Carteira
              </TabsTrigger>
              <TabsTrigger value="cobrancas" className="flex-1">
                Cobranças
              </TabsTrigger>
              <TabsTrigger value="acertos" className="flex-1">
                Acertos
              </TabsTrigger>
              <TabsTrigger value="config" className="flex-1">
                Config.
              </TabsTrigger>
            </TabsList>

            <TabsContent value="carteira" className="pt-4 space-y-3">
              <div className="rounded-lg border border-border">
                <div className="grid grid-cols-[1fr_100px_90px] gap-3 px-3 py-2 text-xs font-bold uppercase tracking-wider text-muted-foreground bg-graphite/30 border-b border-border">
                  <span>Cliente</span>
                  <span>Periodicidade</span>
                  <span className="text-right">Valor</span>
                </div>
                <ul className="divide-y divide-border">
                  {paginatedCarteira.map((c) => (
                    <li
                      key={c.id}
                      className="grid grid-cols-[1fr_100px_90px] gap-3 px-3 py-2.5 text-sm items-center"
                    >
                      <span className="min-w-0 truncate font-semibold">{c.nome}</span>
                      <span className="text-xs text-muted-foreground capitalize">{c.freqText}</span>
                      <span className="shrink-0 font-display font-semibold text-gold text-right">
                        {formatBRL(c.saldoCents / 100)}
                      </span>
                    </li>
                  ))}
                  {carteira.length === 0 && (
                    <li className="px-3 py-6 text-center text-sm text-muted-foreground">
                      Sem contratos vinculados.
                    </li>
                  )}
                </ul>
              </div>

              {carteira.length > carteiraPageSize && (
                <div className="flex items-center justify-between pt-2">
                  <span className="text-xs text-muted-foreground">
                    Exibindo {Math.min((carteiraPage - 1) * carteiraPageSize + 1, carteira.length)} a{" "}
                    {Math.min(carteiraPage * carteiraPageSize, carteira.length)} de {carteira.length}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-[11px] px-2.5 font-semibold"
                      onClick={() => setCarteiraPage((p) => Math.max(p - 1, 1))}
                      disabled={carteiraPage === 1}
                    >
                      Anterior
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-[11px] px-2.5 font-semibold"
                      onClick={() => setCarteiraPage((p) => Math.min(p + 1, Math.ceil(carteira.length / carteiraPageSize)))}
                      disabled={carteiraPage === Math.ceil(carteira.length / carteiraPageSize)}
                    >
                      Próximo
                    </Button>
                  </div>
                </div>
              )}
            </TabsContent>

            <TabsContent value="cobrancas" className="pt-4 space-y-3">
              <div className="flex justify-between items-center mb-2">
                <span className="text-xs font-semibold text-muted-foreground">Filtrar por periodicidade</span>
                <Select value={cobrancasFreqFilter} onValueChange={setCobrancasFreqFilter}>
                  <SelectTrigger className="w-[160px] h-8 text-xs bg-surface">
                    <SelectValue placeholder="Frequência" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todas</SelectItem>
                    <SelectItem value="diario">Diário</SelectItem>
                    <SelectItem value="semanal">Semanal</SelectItem>
                    <SelectItem value="quinzenal">Quinzenal</SelectItem>
                    <SelectItem value="mensal">Mensal</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="rounded-lg border border-border">
                <div className="grid grid-cols-[1fr_95px_85px_80px] gap-2 px-2 py-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground bg-graphite/30 border-b border-border">
                  <span>Cliente / Parcela</span>
                  <span>Periodicidade</span>
                  <span>Status</span>
                  <span className="text-right">Valor</span>
                </div>
                <ul className="divide-y divide-border">
                  {paginatedCobrancas.map((c) => {
                    const isToday = toDay(c.due_date) === hoje;
                    const isOverdue = toDay(c.due_date) < hoje;

                    return (
                      <li
                        key={c.id}
                        className="grid grid-cols-[1fr_95px_85px_80px] gap-2 px-2 py-2.5 text-xs items-center"
                      >
                        <span className="min-w-0">
                          <span className="block truncate font-semibold text-foreground">{c.client?.full_name ?? "Cliente"}</span>
                          <span className="block text-[9px] text-muted-foreground uppercase tracking-tight">
                            parc. {c.number.toString().padStart(2, "0")} · {formatDate(c.due_date)}
                          </span>
                        </span>
                        <span className="text-xs text-muted-foreground capitalize">
                          {c.loan?.frequency || "—"}
                        </span>
                        <span>
                          {isToday ? (
                            <span className="inline-flex items-center rounded-md bg-gold/10 px-1.5 py-0.5 text-[9px] font-bold text-gold uppercase tracking-wider">
                              Vence hoje
                            </span>
                          ) : isOverdue ? (
                            <span className="inline-flex items-center rounded-md bg-danger/10 px-1.5 py-0.5 text-[9px] font-bold text-danger uppercase tracking-wider">
                              Pendente
                            </span>
                          ) : (
                            "—"
                          )}
                        </span>
                        <span className="shrink-0 font-display font-semibold text-right">
                          {formatBRL(c.outstanding_amount / 100)}
                        </span>
                      </li>
                    );
                  })}
                  {filteredCobrancas.length === 0 && (
                    <li className="px-3 py-6 text-center text-sm text-muted-foreground">
                      Nenhuma cobrança pendente.
                    </li>
                  )}
                </ul>
              </div>

              {filteredCobrancas.length > cobrancasPageSize && (
                <div className="flex items-center justify-between pt-2">
                  <span className="text-xs text-muted-foreground">
                    Exibindo {Math.min((cobrancasPage - 1) * cobrancasPageSize + 1, filteredCobrancas.length)} a{" "}
                    {Math.min(cobrancasPage * cobrancasPageSize, filteredCobrancas.length)} de {filteredCobrancas.length}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-[11px] px-2.5 font-semibold"
                      onClick={() => setCobrancasPage((p) => Math.max(p - 1, 1))}
                      disabled={cobrancasPage === 1}
                    >
                      Anterior
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-[11px] px-2.5 font-semibold"
                      onClick={() => setCobrancasPage((p) => Math.min(p + 1, Math.ceil(filteredCobrancas.length / cobrancasPageSize)))}
                      disabled={cobrancasPage === Math.ceil(filteredCobrancas.length / cobrancasPageSize)}
                    >
                      Próximo
                    </Button>
                  </div>
                </div>
              )}
            </TabsContent>

            <TabsContent value="acertos" className="space-y-3 pt-4">
              <div className="rounded-lg border border-border bg-surface p-4 text-sm">
                <p className="text-xs text-muted-foreground">
                  Período {formatDate(semana.start)} a {formatDate(semana.end)}
                </p>
                <p className="mt-2 flex justify-between">
                  <span className="text-muted-foreground">Pagamentos confirmados</span>
                  <span className="font-semibold text-success">{acerto.linhas.length}</span>
                </p>
                <p className="mt-1 flex justify-between">
                  <span className="text-muted-foreground">Total recebido</span>
                  <span className="font-semibold text-success">
                    {formatBRL(acerto.brutoCents / 100)}
                  </span>
                </p>
                <p className="mt-1 flex justify-between">
                  <span className="text-muted-foreground">Em aberto no período</span>
                  <span className="font-semibold text-danger">
                    {formatBRL(acerto.naoPagoCents / 100)}
                  </span>
                </p>
              </div>
              <p className="text-xs text-muted-foreground">
                Fechamento completo na tela <span className="text-gold">Acertos</span>.
              </p>
            </TabsContent>
            <TabsContent value="config" className="pt-4 space-y-6">
              <div className="rounded-lg border border-border bg-card p-4 space-y-4">
                <div>
                  <h4 className="text-sm font-bold text-gold mb-1">Preferência de Aviso</h4>
                  <p className="text-xs text-muted-foreground">
                    Como o sistema deve preparar as mensagens de WhatsApp.
                  </p>
                </div>

                <div className="space-y-3">
                  <div
                    onClick={() => mutation.mutate("individual")}
                    className={`flex cursor-pointer items-center justify-between rounded-md border p-3 transition-colors ${pref === "individual" ? "border-gold/40 bg-gold/5" : "border-border hover:bg-muted/30"} ${!funcionario.ativo || mutation.isPending ? "opacity-50 pointer-events-none" : ""}`}
                  >
                    <div>
                      <p className="text-sm font-medium">Aviso individual</p>
                      <p className="text-[10px] text-muted-foreground">
                        Preparar após cada recebimento.
                      </p>
                    </div>
                    {pref === "individual" ? (
                      <Check className="h-4 w-4 text-gold" />
                    ) : (
                      <div className="h-4 w-4 rounded-full border border-border" />
                    )}
                  </div>

                  <div
                    onClick={() => mutation.mutate("consolidated_daily")}
                    className={`flex cursor-pointer items-center justify-between rounded-md border p-3 transition-colors ${pref === "consolidated_daily" ? "border-gold/40 bg-gold/5" : "border-border hover:bg-muted/30"} ${!funcionario.ativo || mutation.isPending ? "opacity-50 pointer-events-none" : ""}`}
                  >
                    <div>
                      <p className="text-sm font-medium">Resumo diário consolidado</p>
                      <p className="text-[10px] text-muted-foreground">
                        Reunir todos os pagamentos do dia.
                      </p>
                    </div>
                    {pref === "consolidated_daily" ? (
                      <Check className="h-4 w-4 text-gold" />
                    ) : (
                      <div className="h-4 w-4 rounded-full border border-border" />
                    )}
                  </div>

                  <div
                    onClick={() => mutation.mutate("both")}
                    className={`flex cursor-pointer items-center justify-between rounded-md border p-3 transition-colors ${pref === "both" ? "border-gold/40 bg-gold/5" : "border-border hover:bg-muted/30"} ${!funcionario.ativo || mutation.isPending ? "opacity-50 pointer-events-none" : ""}`}
                  >
                    <div>
                      <p className="text-sm font-medium">Ambos</p>
                      <p className="text-[10px] text-muted-foreground">
                        Escolher no momento do envio.
                      </p>
                    </div>
                    {pref === "both" ? (
                      <Check className="h-4 w-4 text-gold" />
                    ) : (
                      <div className="h-4 w-4 rounded-full border border-border" />
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-center gap-2 py-2">
                  {mutation.isPending ? (
                    <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                      <Loader2 className="h-3 w-3 animate-spin" /> Salvando...
                    </div>
                  ) : mutation.isError ? (
                    <div className="flex items-center gap-1.5 text-[10px] text-danger">
                      <AlertCircle className="h-3 w-3" /> Erro ao salvar
                    </div>
                  ) : (
                    <p className="text-[10px] text-center text-muted-foreground italic">
                      Configuração de envio de avisos automatizada.
                    </p>
                  )}
                </div>
              </div>

              <div className="rounded-lg border border-border bg-card p-4 space-y-4">
                <h4 className="text-sm font-bold text-gold mb-1">Dados Gerais & Comissões</h4>
                
                <div className="space-y-2">
                  <Label>Nome Completo</Label>
                  <Input value={editName} onChange={(e) => setEditName(e.target.value)} />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Telefone</Label>
                    <Input value={editPhone} onChange={(e) => setEditPhone(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>WhatsApp</Label>
                    <Input value={editWhatsapp} onChange={(e) => setEditWhatsapp(e.target.value)} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>CPF (opcional)</Label>
                    <Input value={editCpf} onChange={(e) => setEditCpf(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>Chave PIX (opcional)</Label>
                    <Input value={editPixKey} onChange={(e) => setEditPixKey(e.target.value)} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Comissão Padrão (%)</Label>
                    <Input type="number" value={editCommission} onChange={(e) => setEditCommission(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>Divisão de Multa (%)</Label>
                    <Input type="number" value={editPenaltySplit} onChange={(e) => setEditPenaltySplit(e.target.value)} />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Status</Label>
                  <Select value={editStatus} onValueChange={(v: any) => setEditStatus(v)}>
                    <SelectTrigger className="bg-surface">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ativo">Ativo</SelectItem>
                      <SelectItem value="inativo">Inativo</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Observações</Label>
                  <Input value={editNotes} onChange={(e) => setEditNotes(e.target.value)} />
                </div>

                <div className="flex gap-2 pt-2">
                  <Button
                    className="flex-1 bg-gold text-black hover:bg-gold/90 font-bold"
                    onClick={handleUpdateEmployee}
                    disabled={isSaving}
                  >
                    {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Salvar Alterações"}
                  </Button>
                  
                  <Button
                    variant="destructive"
                    className="bg-danger text-white hover:bg-danger/90"
                    onClick={handleDeleteEmployee}
                    disabled={isDeleting}
                  >
                    {isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
            </TabsContent>
          </Tabs>

          <Button
            asChild
            className="w-full bg-success text-primary-foreground hover:bg-success/90"
            disabled={!getWhatsAppLink(funcionario.whatsapp)}
          >
            <a
              href={getWhatsAppLink(funcionario.whatsapp, whatsappMessage)}
              target="_blank"
              rel="noreferrer noopener"
            >
              <MessageCircle className="h-4 w-4" /> Falar no WhatsApp
            </a>
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Item({ label, valor, tone }: { label: string; valor: string; tone?: string | undefined }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={`truncate font-display font-bold ${tone ?? ""}`}>{valor}</dd>
    </div>
  );
}
