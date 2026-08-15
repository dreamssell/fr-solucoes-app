import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState, useEffect } from "react";
import { Search, Plus, Upload, Phone, User, FileText, Loader2, Trash2 } from "lucide-react";
import { AppShell, PageHeader } from "@/components/fr/AppShell";
import { SituacaoPill } from "@/components/fr/bits";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { DatePicker } from "@/components/ui/date-picker";
import { formatBRL, maskBRL, parseBRLInput } from "@/lib/format";
import { toast } from "sonner";
import { useEmployees } from "@/hooks/use-employees";
import { useClients } from "@/hooks/use-clients";
import { useLoans } from "@/hooks/use-loans";
import { useServerFn } from "@tanstack/react-start";
import { requestLoanApproval } from "@/lib/loans.functions";
import { Checkbox } from "@/components/ui/checkbox";

import { validateCPF, validatePhone } from "@/finance/validators";
import { Database } from "@/integrations/supabase/types";
import type { LoanRow } from "@/finance/aggregations";

type ClientRow = Database["public"]["Tables"]["clients"]["Row"] & {
  employees: { full_name: string } | null;
};
type EmployeeRow = Database["public"]["Tables"]["employees"]["Row"];
type PenaltyKind = Database["public"]["Enums"]["penalty_kind"];

export const Route = createFileRoute("/_authenticated/clientes2")({
  validateSearch: (search: Record<string, unknown>) => ({
    q: typeof search["q"] === "string" ? search["q"] : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Clientes — FR Financeiro" },
      {
        name: "description",
        content: "Carteira de clientes com saldo devedor, contratos e histórico.",
      },
      { property: "og:title", content: "Clientes — FR Financeiro" },
      {
        property: "og:description",
        content: "Carteira de clientes com saldo devedor, contratos e histórico.",
      },
    ],
  }),
  component: Clientes,
});

function Clientes() {
  const { q: searchParam } = Route.useSearch();
  const [busca, setBusca] = useState(searchParam || "");
  const [funcFilter, setFuncFilter] = useState("todos");
  const [sel, setSel] = useState<ClientRow | null>(null);
  const { data: dbEmployees } = useEmployees();
  const {
    data: dbClients,
    mutateAsync: createClient,
    isPending: isCreating,
    isLoading: isLoadingClients,
  } = useClients();
  const requestLoanApprovalFn = useServerFn(requestLoanApproval);

  const activeEmployees = useMemo(() => {
    if (!dbEmployees) return [];
    return dbEmployees.map((e) => ({ id: e.id, nome: e.full_name }));
  }, [dbEmployees]);

  const lista = useMemo(() => {
    if (!dbClients) return [];
    return (dbClients as ClientRow[]).filter(
      (c) =>
        (funcFilter === "todos" || c.employee_id === funcFilter) &&
        (busca.trim() === "" ||
          c.full_name.toLowerCase().includes(busca.toLowerCase()) ||
          c.phone.includes(busca)),
    );
  }, [dbClients, busca, funcFilter]);

  const [isNewClientOpen, setIsNewClientOpen] = useState(false);
  const [newDocs, setNewDocs] = useState<Array<{ id: string; name: string; file: File | null }>>([]);
  const [isSaving, setIsSaving] = useState(false);

  const getUploadUrlFn = useServerFn(getUploadUrl);
  const createClientDocumentFn = useServerFn(createClientDocument);

  const addDocField = () => {
    if (newDocs.length >= 7) return;
    setNewDocs((prev) => [...prev, { id: crypto.randomUUID(), name: "", file: null }]);
  };

  const removeDocField = (id: string) => {
    setNewDocs((prev) => prev.filter((d) => d.id !== id));
  };

  const updateDocName = (id: string, name: string) => {
    setNewDocs((prev) => prev.map((d) => (d.id === id ? { ...d, name } : d)));
  };

  const handleDocFileChange = (id: string, file: File | null) => {
    if (file && file.size > 10 * 1024 * 1024) {
      toast.error("O arquivo deve ter no máximo 10MB.");
      return;
    }
    const allowedTypes = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
    if (file && !allowedTypes.includes(file.type.toLowerCase())) {
      toast.error("Formato não suportado. Use PDF ou Imagens (JPG, PNG, WEBP).");
      return;
    }
    setNewDocs((prev) => prev.map((d) => (d.id === id ? { ...d, file } : d)));
  };
  const [formData, setFormData] = useState({
    full_name: "",
    phone: "",
    cpf: "",
    rg: "",
    birth_date: undefined as Date | undefined,
    employee_id: "",
    profession: "",
    reported_income: "",
    pix_key: "",
    notes: "",
    create_initial_loan: false,
    initial_loan_capital: "",
    initial_loan_installments: "10",
    initial_loan_frequency: "diario",
  });

  const handleCreate = async () => {
    if (!formData.full_name || !formData.phone || !formData.employee_id) {
      toast.error("Preencha os campos obrigatórios: Nome, Telefone e Funcionário");
      return;
    }

    if (!validatePhone(formData.phone)) {
      toast.error("Telefone inválido");
      return;
    }

    if (formData.cpf && !validateCPF(formData.cpf)) {
      toast.error("CPF inválido");
      return;
    }

    let income: number | null = null;
    if (formData.reported_income) {
      const parsed = parseBRLInput(formData.reported_income);
      if (isNaN(parsed) || parsed < 0) {
        toast.error("Renda declarada deve ser um valor numérico válido maior ou igual a zero");
        return;
      }
      income = parsed;
    }

    if (formData.create_initial_loan) {
      if (!formData.initial_loan_capital || !formData.initial_loan_installments) {
        toast.error("Preencha o valor do empréstimo e a quantidade de parcelas");
        return;
      }
      const parsedCapital = parseBRLInput(formData.initial_loan_capital);
      if (isNaN(parsedCapital) || parsedCapital <= 0) {
        toast.error("Valor do empréstimo inválido");
        return;
      }
      const parsedInstallments = parseInt(formData.initial_loan_installments);
      if (isNaN(parsedInstallments) || parsedInstallments <= 0) {
        toast.error("Quantidade de parcelas deve ser maior que zero");
        return;
      }
    }

    // Validate documents have both name and file selected
    const validDocs = newDocs.filter((d) => d.file !== null && d.name.trim() !== "");
    const incompleteDocs = newDocs.filter((d) => (d.file === null && d.name.trim() !== "") || (d.file !== null && d.name.trim() === ""));
    if (incompleteDocs.length > 0) {
      toast.error("Preencha o nome e selecione o arquivo para todos os documentos adicionados.");
      return;
    }

    setIsSaving(true);
    try {
      const client = await createClient({
        full_name: formData.full_name,
        phone: formData.phone,
        cpf: formData.cpf || null,
        rg: formData.rg || null,
        birth_date: formData.birth_date?.toISOString() || null,
        employee_id: formData.employee_id,
        profession: formData.profession || null,
        reported_income: income,
        pix_key: formData.pix_key || null,
        notes: formData.notes || null,
      });

      if (client?.id) {
        // Upload documents
        for (const doc of validDocs) {
          if (doc.file) {
            const { url, path } = await getUploadUrlFn({
              data: { clientId: client.id, fileName: doc.file.name, contentType: doc.file.type },
            });

            const uploadRes = await fetch(url, {
              method: "PUT",
              body: doc.file,
              headers: { "Content-Type": doc.file.type },
            });

            if (!uploadRes.ok) throw new Error(`Falha no upload do arquivo ${doc.name}`);

            await createClientDocumentFn({
              data: {
                client_id: client.id,
                name: doc.name,
                file_path: path,
              },
            });
          }
        }
      }

      if (formData.create_initial_loan && client?.id) {
        const selectedEmployee = dbEmployees?.find(e => e.id === formData.employee_id);
        const commissionRate = selectedEmployee?.commission_rate_percent ?? 10;

        await requestLoanApprovalFn({
          data: {
            client_id: client.id,
            capital_cents: Math.round(parseBRLInput(formData.initial_loan_capital) * 100),
            frequency: formData.initial_loan_frequency as any,
            installments_count: parseInt(formData.initial_loan_installments),
            employee_profit_input: commissionRate,
            employee_profit_kind: "percentual",
            start_date: new Date().toISOString().slice(0, 10),
          }
        });
        toast.success("Empréstimo inicial solicitado para aprovação!");
      }

      setIsNewClientOpen(false);
      setNewDocs([]);
      setFormData({
        full_name: "",
        phone: "",
        cpf: "",
        rg: "",
        birth_date: undefined,
        employee_id: "",
        profession: "",
        reported_income: "",
        pix_key: "",
        notes: "",
        create_initial_loan: false,
        initial_loan_capital: "",
        initial_loan_installments: "10",
        initial_loan_frequency: "diario",
      });
    } catch (e: any) {
      toast.error(e.message || "Erro ao cadastrar cliente");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <AppShell>
      <PageHeader
        title="Clientes"
        description={`${lista.length} clientes na carteira`}
        actions={
          <Button
            onClick={() => setIsNewClientOpen(true)}
            className="bg-gold text-black hover:bg-gold/90"
          >
            <Plus className="mr-2 h-4 w-4" /> Novo Cliente
          </Button>
        }
      />

      <div className="grid gap-3 rounded-xl border border-border bg-card p-4 sm:grid-cols-[minmax(0,1fr)_240px]">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar cliente por nome ou telefone"
            className="pl-9"
          />
        </div>
        <Select value={funcFilter} onValueChange={setFuncFilter}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os funcionários</SelectItem>
            {activeEmployees.map((f) => (
              <SelectItem key={f.id} value={f.id}>
                {f.nome}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm">
            <thead>
              <tr className="border-b border-border bg-graphite/30 text-left text-xs font-bold uppercase tracking-widest text-muted-foreground">
                <th className="px-6 py-4">Cliente</th>
                <th className="px-6 py-4">Contato</th>
                <th className="px-6 py-4">Responsável</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {isLoadingClients ? (
                <tr>
                  <td colSpan={5} className="p-12 text-center">
                    <div className="flex flex-col items-center justify-center gap-3">
                      <Loader2 className="h-6 w-6 animate-spin text-gold" />
                      <p className="text-muted-foreground font-medium">
                        Buscando base de clientes...
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                lista.map((c) => (
                  <tr key={c.id} className="group transition-colors hover:bg-gold/[0.02]">
                    <td className="px-6 py-4">
                      <p className="font-bold text-foreground">{c.full_name}</p>
                      <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-tight">
                        {c.cpf || "Sem CPF"}
                      </p>
                    </td>
                    <td className="px-6 py-4 text-muted-foreground font-medium">{c.phone}</td>
                    <td className="px-6 py-4">
                      <span className="inline-flex items-center rounded-md bg-graphite px-2 py-1 text-[11px] font-bold text-muted-foreground">
                        {c.employees?.full_name?.split(" ")[0] || "—"}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <SituacaoPill situacao={c.status === "ativo" ? "em dia" : "atrasado"} />
                    </td>
                    <td className="px-6 py-4 text-right">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 rounded-lg font-bold text-gold hover:bg-gold/10 hover:text-gold"
                        onClick={() => setSel(c)}
                      >
                        GERENCIAR
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {!isLoadingClients && lista.length === 0 && (
          <div className="p-12 text-center">
            <p className="text-sm font-medium text-muted-foreground">
              Nenhum registro encontrado para esta busca.
            </p>
          </div>
        )}
      </div>

      <Dialog open={isNewClientOpen} onOpenChange={setIsNewClientOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Novo Cadastro de Cliente</DialogTitle>
            <DialogDescription>
              Preencha os dados do cliente para iniciar novos contratos.
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 gap-4 py-4 sm:grid-cols-2">
            <div className="col-span-1 space-y-2 sm:col-span-2">
              <Label htmlFor="nome">Nome Completo *</Label>
              <div className="relative">
                <User className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  id="nome"
                  placeholder="Ex: João Silva"
                  className="pl-9"
                  value={formData.full_name}
                  onChange={(e) => setFormData((s) => ({ ...s, full_name: e.target.value }))}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="telefone">Telefone *</Label>
              <div className="relative">
                <Phone className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  id="telefone"
                  placeholder="(00) 00000-0000"
                  className="pl-9"
                  value={formData.phone}
                  onChange={(e) => setFormData((s) => ({ ...s, phone: e.target.value }))}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="rg">RG</Label>
              <div className="relative">
                <FileText className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  id="rg"
                  placeholder="00.000.000-0"
                  className="pl-9"
                  value={formData.rg}
                  onChange={(e) => setFormData((s) => ({ ...s, rg: e.target.value }))}
                />
              </div>
            </div>

            <div className="space-y-2">
              <DatePicker
                label="Data de Nascimento"
                setDate={(d) => setFormData((s) => ({ ...s, birth_date: d }))}
                date={formData.birth_date}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="funcionario">Funcionário Responsável *</Label>
              <Select
                value={formData.employee_id}
                onValueChange={(v) => setFormData((s) => ({ ...s, employee_id: v }))}
              >
                <SelectTrigger id="funcionario" className="bg-surface">
                  <SelectValue placeholder="Selecione o funcionário" />
                </SelectTrigger>
                <SelectContent>
                  {activeEmployees.map((f) => (
                    <SelectItem key={f.id} value={f.id}>
                      {f.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="col-span-1 space-y-2 sm:col-span-2">
              <div className="h-px bg-border my-2" />
              <h4 className="text-sm font-semibold text-gold">
                Informações Profissionais e Financeiras
              </h4>
            </div>

            <div className="space-y-2">
              <Label htmlFor="profissao">Profissão</Label>
              <Input
                id="profissao"
                placeholder="Ex: Vendedor"
                value={formData.profession}
                onChange={(e) => setFormData((s) => ({ ...s, profession: e.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="renda">Renda Mensal Informada (R$)</Label>
              <Input
                id="renda"
                type="text"
                placeholder="0,00"
                value={formData.reported_income}
                onChange={(e) => setFormData((s) => ({ ...s, reported_income: maskBRL(e.target.value) }))}
              />
            </div>

            <div className="col-span-1 space-y-2 sm:col-span-2">
              <Label htmlFor="pix">Chave PIX</Label>
              <Input
                id="pix"
                placeholder="CPF, Celular ou E-mail"
                value={formData.pix_key}
                onChange={(e) => setFormData((s) => ({ ...s, pix_key: e.target.value }))}
              />
            </div>

            <div className="col-span-1 space-y-2 sm:col-span-2">
              <div className="h-px bg-border my-2" />
              <div className="flex items-center justify-between">
                <Label className="text-sm font-semibold text-gold">Documentação (Máx 7)</Label>
                {newDocs.length < 7 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-gold h-7 font-bold flex items-center gap-1"
                    onClick={addDocField}
                  >
                    <Plus className="h-3.5 w-3.5" /> Adicionar
                  </Button>
                )}
              </div>

              <div className="space-y-3 mt-2">
                {newDocs.map((doc) => (
                  <div key={doc.id} className="grid grid-cols-[1fr_1fr_auto] gap-2 items-end border border-border/40 p-2.5 rounded-lg bg-surface/50">
                    <div className="space-y-1">
                      <Label className="text-[10px] text-muted-foreground">Nome do Documento</Label>
                      <Input
                        placeholder="Ex: RG, CNH, Comprovante"
                        value={doc.name}
                        onChange={(e) => updateDocName(doc.id, e.target.value)}
                        className="h-9"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] text-muted-foreground">Arquivo (Até 10MB)</Label>
                      <Input
                        type="file"
                        accept=".pdf,.jpg,.jpeg,.png,.webp"
                        className="h-9 text-xs file:hidden text-muted-foreground truncate cursor-pointer bg-card"
                        onChange={(e) => handleDocFileChange(doc.id, e.target.files?.[0] || null)}
                      />
                    </div>
                    <Button
                      type="button"
                      variant="destructive"
                      size="icon"
                      className="h-9 w-9 bg-danger hover:bg-danger/90 shrink-0"
                      onClick={() => removeDocField(doc.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
                {newDocs.length === 0 && (
                  <p className="text-xs text-muted-foreground text-center py-2 italic">
                    Nenhum documento anexado. Clique em Adicionar para subir arquivos.
                  </p>
                )}
              </div>
            </div>

            <div className="col-span-1 space-y-2 sm:col-span-2">
              <Label htmlFor="observacoes">Observações</Label>
              <Input
                id="observacoes"
                placeholder="Anotações adicionais"
                value={formData.notes}
                onChange={(e) => setFormData((s) => ({ ...s, notes: e.target.value }))}
              />
            </div>

            <div className="col-span-1 space-y-2 sm:col-span-2">
              <div className="h-px bg-border my-2" />
              <div className="flex items-center gap-2">
                <Checkbox
                  id="create_loan"
                  checked={formData.create_initial_loan}
                  onCheckedChange={(checked) => setFormData((s) => ({ ...s, create_initial_loan: !!checked }))}
                />
                <Label htmlFor="create_loan" className="text-sm font-semibold text-gold cursor-pointer select-none">
                  Cadastrar Empréstimo Inicial para este Cliente
                </Label>
              </div>
            </div>

            {formData.create_initial_loan && (
              <>
                <div className="space-y-2 col-span-1 sm:col-span-2">
                  <Label htmlFor="loan_capital">Valor do Empréstimo (Capital) *</Label>
                  <Input
                    id="loan_capital"
                    placeholder="R$ 0,00"
                    value={formData.initial_loan_capital}
                    onChange={(e) => setFormData((s) => ({ ...s, initial_loan_capital: maskBRL(e.target.value) }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="loan_installments">Quantidade de Parcelas *</Label>
                  <Input
                    id="loan_installments"
                    type="number"
                    min="1"
                    placeholder="10"
                    value={formData.initial_loan_installments}
                    onChange={(e) => setFormData((s) => ({ ...s, initial_loan_installments: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="loan_frequency">Frequência de Cobrança</Label>
                  <Select
                    value={formData.initial_loan_frequency}
                    onValueChange={(v) => setFormData((s) => ({ ...s, initial_loan_frequency: v as any }))}
                  >
                    <SelectTrigger id="loan_frequency" className="bg-surface">
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
              </>
            )}
          </div>

          <DialogFooter className="mt-6 flex-col gap-2 sm:flex-row">
            <Button variant="outline" onClick={() => setIsNewClientOpen(false)}>
              Cancelar
            </Button>
            <Button
              className="bg-gold text-black hover:bg-gold/90"
              onClick={handleCreate}
              disabled={isCreating || isSaving}
            >
              {isCreating || isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Cadastrar Cliente"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ClientePainel
        cliente={sel}
        onClose={() => setSel(null)}
        onUpdate={() => setSel(null)}
        employees={dbEmployees}
      />
    </AppShell>
  );
}

import {
  getSignedUrl,
  getUploadUrl,
  updateClient,
  getClientDocuments,
  createClientDocument,
  deleteClientDocument,
} from "@/lib/clients.functions";
import { useQuery, useQueryClient } from "@tanstack/react-query";

export function ClientePainel({
  cliente,
  onClose,
  onUpdate,
  employees: dbEmployees,
}: {
  cliente: ClientRow | null;
  onClose: () => void;
  onUpdate: () => void;
  employees?: EmployeeRow[] | null | undefined;
}) {
  const [isUploading, setIsUploading] = useState(false);
  const getSignedUrlFn = useServerFn(getSignedUrl);
  const getUploadUrlFn = useServerFn(getUploadUrl);
  const updateClientFn = useServerFn(updateClient);
  const createClientDocumentFn = useServerFn(createClientDocument);
  const deleteClientDocumentFn = useServerFn(deleteClientDocument);
  const getClientDocumentsFn = useServerFn(getClientDocuments);
  const { data: loans } = useLoans();
  const queryClient = useQueryClient();

  const { data: documents, refetch: refetchDocuments } = useQuery({
    queryKey: ["client-documents", cliente.id],
    queryFn: () => getClientDocumentsFn({ data: cliente.id }),
    enabled: !!cliente.id,
  });

  const [configPenaltyKind, setConfigPenaltyKind] = useState<PenaltyKind>(cliente?.penalty_kind ?? "nenhuma");
  const [configPenaltyValue, setConfigPenaltyValue] = useState(cliente?.penalty_value?.toString() ?? "0");
  const [configPenaltyGraceDays, setConfigPenaltyGraceDays] = useState(cliente?.penalty_grace_days?.toString() ?? "0");
  const [configDelayInterestKind, setConfigDelayInterestKind] = useState(cliente?.delay_interest_kind ?? "diario");
  const [configDelayInterestRate, setConfigDelayInterestRate] = useState(cliente?.delay_interest_rate?.toString() ?? "0");
  const [isSavingConfig, setIsSavingConfig] = useState(false);

  useEffect(() => {
    if (cliente) {
      setConfigPenaltyKind(cliente.penalty_kind);
      setConfigPenaltyValue(cliente.penalty_value.toString());
      setConfigPenaltyGraceDays(cliente.penalty_grace_days.toString());
      setConfigDelayInterestKind(cliente.delay_interest_kind);
      setConfigDelayInterestRate(cliente.delay_interest_rate.toString());
    }
  }, [cliente]);

  const handleSaveConfig = async () => {
    setIsSavingConfig(true);
    try {
      await updateClientFn({
        data: {
          id: cliente.id,
          updates: {
            penalty_kind: configPenaltyKind,
            penalty_value: parseInt(configPenaltyValue) || 0,
            penalty_grace_days: parseInt(configPenaltyGraceDays) || 0,
            delay_interest_kind: configDelayInterestKind,
            delay_interest_rate: parseFloat(configDelayInterestRate) || 0,
          },
        },
      });
      toast.success("Configurações salvas com sucesso!");
      queryClient.invalidateQueries({ queryKey: ["clients"] });
      onUpdate();
    } catch (err) {
      toast.error("Erro ao salvar configurações");
    } finally {
      setIsSavingConfig(false);
    }
  };

  const clientLoans = useMemo(() => {
    if (!loans || !cliente) return [];
    return (loans as unknown as LoanRow[]).filter((l) => l.client_id === cliente.id);
  }, [loans, cliente]);

  const arrears = useMemo(() => {
    return clientLoans.flatMap((l) => (l.installments ?? []).filter((p) => p.status === "vencida"));
  }, [clientLoans]);

  if (!cliente) return null;

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const docNameInput = prompt("Digite um nome/descrição para este documento (ex: RG, CNH):");
    if (docNameInput === null) return;
    const docName = docNameInput.trim() || file.name;

    setIsUploading(true);
    try {
      const { url, path } = await getUploadUrlFn({
        data: { clientId: cliente.id, fileName: file.name, contentType: file.type },
      });

      const uploadRes = await fetch(url, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type },
      });

      if (!uploadRes.ok) throw new Error("Falha no upload");

      await createClientDocumentFn({
        data: {
          client_id: cliente.id,
          name: docName,
          file_path: path,
        },
      });

      toast.success("Documento enviado com sucesso!");
      refetchDocuments();
    } catch (err) {
      console.error(err);
      toast.error("Erro ao enviar documento");
    } finally {
      setIsUploading(false);
    }
  };

  const handleDeleteDocument = async (id: string) => {
    if (!confirm("Tem certeza que deseja excluir este documento?")) return;
    try {
      await deleteClientDocumentFn({ data: id });
      toast.success("Documento excluído com sucesso!");
      refetchDocuments();
    } catch (err) {
      toast.error("Erro ao excluir documento");
    }
  };

  const openDocument = async (path: string) => {
    try {
      const signedUrl = await getSignedUrlFn({ data: path });
      window.open(signedUrl, "_blank");
    } catch (err) {
      toast.error("Erro ao recuperar documento");
    }
  };

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle className="text-lg">{cliente.full_name}</SheetTitle>
          <SheetDescription>
            {cliente.phone} · {cliente.employees?.full_name || "Sem responsável"}
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-5 px-4 pb-8">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg border border-border bg-surface p-3">
              <p className="text-xs text-muted-foreground">CPF / RG</p>
              <p className="font-display font-medium">
                {cliente.cpf || cliente.rg || "Não informado"}
              </p>
            </div>
            <div className="rounded-lg border border-border bg-surface p-3">
              <p className="text-xs text-muted-foreground">Situação</p>
              <div className="mt-1">
                <SituacaoPill situacao={cliente.status === "ativo" ? "em dia" : "atrasado"} />
              </div>
            </div>
          </div>

          <Tabs defaultValue="emprestimos">
            <TabsList className="w-full">
              <TabsTrigger value="emprestimos" className="flex-1">
                Empréstimos
              </TabsTrigger>
              <TabsTrigger value="atrasos" className="flex-1 text-red-500">
                Atrasos
              </TabsTrigger>
              <TabsTrigger value="documentos" className="flex-1">
                Documentos
              </TabsTrigger>
              <TabsTrigger value="avisos" className="flex-1">
                Avisos
              </TabsTrigger>
              <TabsTrigger value="multas" className="flex-1 text-gold">
                Config.
              </TabsTrigger>
            </TabsList>

            <TabsContent value="emprestimos" className="space-y-3 pt-4">
              {clientLoans.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  Nenhum contrato ativo.
                </p>
              ) : (
                clientLoans.map((l) => (
                  <div
                    key={l.id}
                    className="rounded-lg border border-border bg-surface p-3 flex justify-between items-center"
                  >
                    <div>
                      <p className="text-sm font-medium">
                        {l.installments_count ?? 0}x de{" "}
                        {formatBRL(l.total_amount / Math.max(1, l.installments_count ?? 1) / 100)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Início: {l.start_date ? new Date(l.start_date).toLocaleDateString() : "—"}
                      </p>
                    </div>
                    <span className="font-bold text-gold">{formatBRL(l.total_amount / 100)}</span>
                  </div>
                ))
              )}
            </TabsContent>

            <TabsContent value="atrasos" className="pt-4 space-y-4">
              {arrears.length === 0 ? (
                <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-4 text-center">
                  <p className="text-sm text-red-200">
                    Não há parcelas em atraso para este cliente.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {arrears.map((p) => (
                    <div
                      key={p.id}
                      className="rounded-lg border border-red-600/30 bg-red-600/5 p-3 flex justify-between items-center"
                    >
                      <div>
                        <p className="text-sm font-medium">Parcela {p.number}</p>
                        <p className="text-xs text-red-200">
                          Vencimento: {new Date(p.due_date).toLocaleDateString()}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-red-500">
                          {formatBRL(p.outstanding_amount / 100)}
                        </p>
                        <p className="text-[10px] text-muted-foreground uppercase">Atrasada</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="documentos" className="pt-4 space-y-4">
              <div className="space-y-3">
                <Label>Documentação do Cliente</Label>

                <div className="grid grid-cols-1 gap-2">
                  {documents?.map((doc) => (
                    <div
                      key={doc.id}
                      className="flex items-center justify-between rounded-md border border-border bg-surface p-2.5"
                    >
                      <div className="flex flex-col min-w-0">
                        <span className="text-xs font-bold text-foreground truncate max-w-[200px]">
                          {doc.name}
                        </span>
                        <span className="text-[10px] text-muted-foreground truncate max-w-[200px]">
                          {doc.file_path.split("/").pop()}
                        </span>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-gold h-7 font-semibold"
                          onClick={() => openDocument(doc.file_path)}
                        >
                          Visualizar
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-danger hover:text-danger hover:bg-danger/10 h-7"
                          onClick={() => handleDeleteDocument(doc.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  ))}
                  {(!documents || documents.length === 0) && (
                    <p className="text-xs text-muted-foreground text-center py-6 italic">
                      Nenhum documento cadastrado para este cliente.
                    </p>
                  )}
                </div>

                <div className="flex flex-col gap-2">
                  <Label htmlFor="file-upload" className="cursor-pointer">
                    <div className="flex w-full items-center justify-center gap-2 rounded-md border border-dashed border-gold/40 py-4 hover:bg-gold/5 transition-colors">
                      {isUploading ? (
                        <Loader2 className="h-4 w-4 animate-spin text-gold" />
                      ) : (
                        <Upload className="h-4 w-4 text-gold" />
                      )}
                      <span className="text-sm text-gold font-medium">
                        {isUploading ? "Enviando..." : "Enviar Documento"}
                      </span>
                    </div>
                  </Label>
                  <input
                    id="file-upload"
                    type="file"
                    className="hidden"
                    onChange={handleFileUpload}
                    disabled={isUploading}
                    accept=".pdf,.jpg,.jpeg,.png"
                  />
                  <p className="text-xs text-muted-foreground text-center">
                    Formatos aceitos: PDF, JPG, PNG.
                  </p>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="avisos" className="pt-4 space-y-4">
              <div className="rounded-lg border border-border bg-card p-4">
                <h4 className="text-sm font-bold text-gold mb-2">Histórico de Avisos</h4>
                <p className="text-xs text-muted-foreground mb-4">
                  Registro de comunicações manuais confirmadas.
                </p>
                <div className="space-y-2">
                  {/* Aqui viria o histórico de employee_notifications filtrado por cliente_id se houvesse a coluna, 
                        ou via loan_id. Por brevidade, manteremos a estrutura para expansão. */}
                  <p className="text-xs text-center py-4 text-muted-foreground italic">
                    Nenhum aviso registrado recentemente.
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  className="flex-1 bg-success text-white hover:bg-success/90"
                  onClick={() => {
                    const empPhone =
                      dbEmployees?.find((e) => e.id === cliente.employee_id)?.whatsapp || "";
                    const text = `Olá! Preciso de um retorno sobre o cliente ${cliente.full_name}.`;
                    window.open(
                      `https://wa.me/${empPhone.replace(/\D/g, "")}?text=${encodeURIComponent(text)}`,
                      "_blank",
                    );
                  }}
                >
                  <Phone className="h-4 w-4 mr-2" />
                  Avisar Funcionário
                </Button>
              </div>
            </TabsContent>

            <TabsContent value="multas" className="pt-4 space-y-6">
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Tipo de Multa Padrão</Label>
                  <Select
                    value={configPenaltyKind}
                    onValueChange={(v) => setConfigPenaltyKind(v as PenaltyKind)}
                  >
                    <SelectTrigger className="bg-surface">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="nenhuma">Sem Multa</SelectItem>
                      <SelectItem value="valor_fixo">Fixa (R$)</SelectItem>
                      <SelectItem value="percentual_fixo">Percentual Fixo (%)</SelectItem>
                      <SelectItem value="percentual_dia">Percentual por Dia (%)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Valor da Multa</Label>
                    <Input
                      type="number"
                      value={configPenaltyValue}
                      onChange={(e) => setConfigPenaltyValue(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Carência (Dias)</Label>
                    <Input
                      type="number"
                      value={configPenaltyGraceDays}
                      onChange={(e) => setConfigPenaltyGraceDays(e.target.value)}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Tipo de Juros de Atraso</Label>
                  <Select
                    value={configDelayInterestKind}
                    onValueChange={setConfigDelayInterestKind}
                  >
                    <SelectTrigger className="bg-surface">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="diario">Diário (%)</SelectItem>
                      <SelectItem value="unico">Taxa Única (%)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Taxa de Juros (%)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={configDelayInterestRate}
                    onChange={(e) => setConfigDelayInterestRate(e.target.value)}
                  />
                </div>

                <Button
                  className="w-full bg-gold text-black hover:bg-gold/90 font-bold mt-2"
                  onClick={handleSaveConfig}
                  disabled={isSavingConfig}
                >
                  {isSavingConfig ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    "Salvar Configurações"
                  )}
                </Button>
              </div>
            </TabsContent>
          </Tabs>

          <div className="rounded-lg border border-border bg-surface p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Observações</p>
            <p className="mt-1 text-sm">{cliente.notes || "Nenhuma observação."}</p>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
