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
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

import { validateCPF, validatePhone } from "@/finance/validators";
import { Database } from "@/integrations/supabase/types";
import type { LoanRow } from "@/finance/aggregations";

type ClientRow = Database["public"]["Tables"]["clients"]["Row"] & {
  employees: { full_name: string } | null;
};
type EmployeeRow = Database["public"]["Tables"]["employees"]["Row"];
type PenaltyKind = Database["public"]["Enums"]["penalty_kind"];

export const Route = createFileRoute("/_authenticated/clientes")({
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
  const [freqFilter, setFreqFilter] = useState("todos");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [sel, setSel] = useState<ClientRow | null>(null);
  const { data: dbEmployees } = useEmployees();
  const {
    data: dbClients,
    mutateAsync: createClient,
    isPending: isCreating,
    isLoading: isLoadingClients,
  } = useClients();
  const { data: dbLoans } = useLoans();
  const requestLoanApprovalFn = useServerFn(requestLoanApproval);

  useEffect(() => {
    setCurrentPage(1);
  }, [busca, funcFilter, freqFilter]);

  const activeEmployees = useMemo(() => {
    if (!dbEmployees) return [];
    return dbEmployees.map((e) => ({ id: e.id, nome: e.full_name }));
  }, [dbEmployees]);

  const lista = useMemo(() => {
    if (!dbClients) return [];
    return (dbClients as ClientRow[]).filter((c) => {
      const matchesEmployee = funcFilter === "todos" || c.employee_id === funcFilter;
      const matchesSearch =
        busca.trim() === "" ||
        c.full_name.toLowerCase().includes(busca.toLowerCase()) ||
        c.phone.includes(busca);

      let matchesPeriodicity = true;
      if (freqFilter !== "todos") {
        const clientLoans = (dbLoans as unknown as LoanRow[])?.filter((l) => l.client_id === c.id) || [];
        matchesPeriodicity = clientLoans.some((l) => l.frequency === freqFilter);
      }

      return matchesEmployee && matchesSearch && matchesPeriodicity;
    });
  }, [dbClients, busca, funcFilter, freqFilter, dbLoans]);

  const listaPaginada = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize;
    return lista.slice(startIndex, startIndex + pageSize);
  }, [lista, currentPage, pageSize]);

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
  const [isImportMode, setIsImportMode] = useState(false);
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
    initial_loan_profit_input: "10",
    initial_loan_profit_kind: "percentual" as "fixo" | "percentual",
    initial_loan_start_date: undefined as Date | undefined,
    initial_loan_current_installment: "1",
    initial_loan_apply_interest_composition: false,
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
      if (isImportMode) {
        if (!formData.initial_loan_start_date) {
          toast.error("Preencha a data que iniciou o empréstimo");
          return;
        }
        const currentInst = parseInt(formData.initial_loan_current_installment);
        if (isNaN(currentInst) || currentInst <= 0 || currentInst > parsedInstallments) {
          toast.error("A parcela atual deve ser maior que zero e menor ou igual ao total de parcelas");
          return;
        }
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
        if (isImportMode) {
          const paidInstallments = Math.max(0, parseInt(formData.initial_loan_current_installment) - 1);
          await requestLoanApprovalFn({
            data: {
              client_id: client.id,
              capital_cents: Math.round(parseBRLInput(formData.initial_loan_capital) * 100),
              frequency: formData.initial_loan_frequency as any,
              installments_count: parseInt(formData.initial_loan_installments),
              employee_profit_input: parseFloat(formData.initial_loan_profit_input) || 0,
              employee_profit_kind: formData.initial_loan_profit_kind,
              start_date: formData.initial_loan_start_date
                ? formData.initial_loan_start_date.toISOString().slice(0, 10)
                : new Date().toISOString().slice(0, 10),
              apply_interest_composition: formData.initial_loan_apply_interest_composition,
              is_import: true,
              imported_paid_installments: paidInstallments,
            }
          });
          toast.success("Empréstimo em andamento importado com sucesso (aguardando aprovação)!");
        } else {
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
        initial_loan_profit_input: "10",
        initial_loan_profit_kind: "percentual",
        initial_loan_start_date: undefined,
        initial_loan_current_installment: "1",
        initial_loan_apply_interest_composition: false,
      });
    } catch (e: any) {
      toast.error(e.message || "Erro ao cadastrar cliente");
    } finally {
      setIsSaving(false);
    }
  };

  const handleExportPDF = () => {
    try {
      const doc = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: "a4",
      });

      // 1. Header background styling (Elegant Dark Gold/Black header banner)
      doc.setFillColor(18, 18, 18); // Graphite #121212
      doc.rect(0, 0, 210, 38, "F");

      // Draw stylized gold stripes/logo in header
      doc.setFillColor(212, 175, 55); // Gold #D4AF37
      doc.rect(15, 10, 12, 12, "F");
      
      doc.setTextColor(255, 255, 255);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.text("FR", 19, 18);

      // FR Financeiro Title
      doc.setFontSize(16);
      doc.text("FR FINANCEIRO", 32, 18);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(180, 180, 180);
      doc.text("Sistema de Gestão de Contratos de Crédito", 32, 23);

      // Report Info
      doc.setTextColor(255, 255, 255);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.text("RELATÓRIO DE CLIENTES", 135, 18);
      
      const todayStr = new Date().toLocaleString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(180, 180, 180);
      doc.text(`Emissão: ${todayStr}`, 135, 23);

      // Horizontal separator line under header
      doc.setDrawColor(212, 175, 55);
      doc.setLineWidth(1.5);
      doc.line(0, 38, 210, 38);

      // 2. Filter info text
      let filterText = "Filtros aplicados: ";
      if (busca) filterText += `Busca: "${busca}" | `;
      filterText += `Responsável: ${
        funcFilter === "todos"
          ? "Todos"
          : dbEmployees?.find((e) => e.id === funcFilter)?.full_name || "Todos"
      } | `;
      filterText += `Periodicidade: ${
        freqFilter === "todos"
          ? "Todas"
          : freqFilter.charAt(0).toUpperCase() + freqFilter.slice(1)
      }`;

      doc.setTextColor(120, 120, 120);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.text(filterText, 15, 46);

      // 3. Generate data rows for PDF AutoTable
      const tableHeaders = [
        ["Cliente", "CPF", "Contato", "Responsável", "Periodicidade", "Status"],
      ];

      const tableData = lista.map((c) => {
        const clientLoans = (dbLoans as unknown as LoanRow[])?.filter((l) => l.client_id === c.id) || [];
        const frequencies = Array.from(new Set(clientLoans.map((l) => l.frequency).filter((f): f is string => !!f)));
        const freqText = frequencies.length > 0
          ? frequencies.map((f) => f.toUpperCase()).join(", ")
          : "—";

        return [
          c.full_name,
          c.cpf || "Sem CPF",
          c.phone,
          c.employees?.full_name || "—",
          freqText,
          c.status === "ativo" ? "EM DIA" : "ATRASADO",
        ];
      });

      // 4. Render autoTable
      autoTable(doc, {
        head: tableHeaders,
        body: tableData,
        startY: 50,
        margin: { left: 15, right: 15 },
        theme: "striped",
        headStyles: {
          fillColor: [18, 18, 18],
          textColor: [255, 255, 255],
          fontSize: 8,
          fontStyle: "bold",
          halign: "left",
        },
        bodyStyles: {
          fontSize: 8,
          textColor: [50, 50, 50],
        },
        didDrawPage: (data) => {
          // Footer
          const pageCount = doc.getNumberOfPages();
          doc.setFont("helvetica", "normal");
          doc.setFontSize(7.5);
          doc.setTextColor(150, 150, 150);
          doc.text(
            `FR Financeiro - Página ${data.pageNumber} de ${pageCount}`,
            15,
            doc.internal.pageSize.height - 10
          );
        },
      });

      // Save PDF
      doc.save(`FR_Financeiro_Relatorio_Clientes_${new Date().toISOString().slice(0, 10)}.pdf`);
      toast.success("PDF exportado com sucesso!");
    } catch (err) {
      console.error(err);
      toast.error("Erro ao gerar arquivo PDF");
    }
  };

  return (
    <AppShell>
      <PageHeader
        title="Clientes"
        description={`${lista.length} clientes na carteira`}
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={handleExportPDF}
              className="border-gold text-gold hover:bg-gold/10 font-bold"
            >
              Exportar PDF
            </Button>
            <Button
              onClick={() => {
                setIsImportMode(true);
                setIsNewClientOpen(true);
              }}
              className="bg-success text-primary-foreground hover:bg-success/90 font-bold"
            >
              <Plus className="mr-2 h-4 w-4" /> Importar Cliente
            </Button>
            <Button
              onClick={() => {
                setIsImportMode(false);
                setIsNewClientOpen(true);
              }}
              className="bg-gold text-black hover:bg-gold/90 font-bold"
            >
              <Plus className="mr-2 h-4 w-4" /> Novo Cliente
            </Button>
          </div>
        }
      />

      <div className="grid gap-3 rounded-xl border border-border bg-card p-4 sm:grid-cols-[minmax(0,1fr)_200px_200px]">
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
            <SelectValue placeholder="Funcionário" />
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

        <Select value={freqFilter} onValueChange={setFreqFilter}>
          <SelectTrigger>
            <SelectValue placeholder="Periodicidade" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todas as frequências</SelectItem>
            <SelectItem value="diario">Diário</SelectItem>
            <SelectItem value="semanal">Semanal</SelectItem>
            <SelectItem value="quinzenal">Quinzenal</SelectItem>
            <SelectItem value="mensal">Mensal</SelectItem>
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
                listaPaginada.map((c) => (
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

      {/* Pagination controls */}
      {!isLoadingClients && lista.length > 0 && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground mt-4">
          <div className="flex items-center gap-2">
            <span>Mostrar</span>
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setCurrentPage(1);
              }}
              className="rounded-md border border-border bg-background px-2 py-1 text-foreground focus:outline-none focus:ring-1 focus:ring-gold text-xs"
            >
              <option value={50}>50</option>
              <option value={100}>100</option>
              <option value={150}>150</option>
            </select>
            <span>por página</span>
          </div>

          <div className="text-xs text-center sm:text-left">
            Exibindo <span className="font-bold text-foreground">{Math.min((currentPage - 1) * pageSize + 1, lista.length)}</span> a{" "}
            <span className="font-bold text-foreground">{Math.min(currentPage * pageSize, lista.length)}</span> de{" "}
            <span className="font-bold text-foreground">{lista.length}</span> clientes
          </div>

          <div className="flex items-center gap-1.5 text-xs">
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs font-semibold"
              onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
              disabled={currentPage === 1}
            >
              Anterior
            </Button>
            
            {/* Page numbers list */}
            {(() => {
              const totalPages = Math.ceil(lista.length / pageSize);
              const pages = [];
              let startPage = Math.max(1, currentPage - 2);
              let endPage = Math.min(totalPages, startPage + 4);
              if (endPage - startPage < 4) {
                startPage = Math.max(1, endPage - 4);
              }

              for (let i = startPage; i <= endPage; i++) {
                pages.push(
                  <Button
                    key={i}
                    variant={currentPage === i ? "default" : "outline"}
                    size="sm"
                    className={`h-8 w-8 text-xs ${currentPage === i ? "bg-gold text-black hover:bg-gold/90 font-bold" : ""}`}
                    onClick={() => setCurrentPage(i)}
                  >
                    {i}
                  </Button>
                );
              }
              return pages;
            })()}

            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs font-semibold"
              onClick={() => setCurrentPage((p) => Math.min(p + 1, Math.ceil(lista.length / pageSize)))}
              disabled={currentPage === Math.ceil(lista.length / pageSize)}
            >
              Próximo
            </Button>
          </div>
        </div>
      )}

      <Dialog open={isNewClientOpen} onOpenChange={setIsNewClientOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{isImportMode ? "Importar Cliente" : "Novo Cadastro de Cliente"}</DialogTitle>
            <DialogDescription>
              {isImportMode
                ? "Importe um cliente físico com empréstimo em andamento."
                : "Preencha os dados do cliente para iniciar novos contratos."}
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
                  {isImportMode
                    ? "Cadastrar Empréstimo em andamento para este Cliente"
                    : "Cadastrar Empréstimo Inicial para este Cliente"}
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

                {isImportMode ? (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="loan_profit_kind">Tipo de Lucro do Funcionário</Label>
                      <Select
                        value={formData.initial_loan_profit_kind}
                        onValueChange={(v) => setFormData((s) => ({ ...s, initial_loan_profit_kind: v as any }))}
                      >
                        <SelectTrigger id="loan_profit_kind" className="bg-surface">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="percentual">Percentual (%)</SelectItem>
                          <SelectItem value="fixo">Valor Fixo (R$)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="loan_profit_input">
                        {formData.initial_loan_profit_kind === "percentual" ? "Comissão (%)" : "Valor do Lucro (R$)"}
                      </Label>
                      <Input
                        id="loan_profit_input"
                        type="number"
                        min="0"
                        step="any"
                        placeholder={formData.initial_loan_profit_kind === "percentual" ? "10" : "0.00"}
                        value={formData.initial_loan_profit_input}
                        onChange={(e) => setFormData((s) => ({ ...s, initial_loan_profit_input: e.target.value }))}
                      />
                    </div>

                    <div className="space-y-2 col-span-1 sm:col-span-2">
                      <DatePicker
                        label="Data que Iniciou o Empréstimo *"
                        setDate={(d) => setFormData((s) => ({ ...s, initial_loan_start_date: d }))}
                        date={formData.initial_loan_start_date}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="loan_current_installment">Parcela Atual/Próxima a cobrar (xx) *</Label>
                      <Input
                        id="loan_current_installment"
                        type="number"
                        min="1"
                        placeholder="1"
                        value={formData.initial_loan_current_installment}
                        onChange={(e) => setFormData((s) => ({ ...s, initial_loan_current_installment: e.target.value }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="loan_installments">Total de Parcelas (yy) *</Label>
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

                    <div className="col-span-1 sm:col-span-2 flex items-center gap-2 pt-2">
                      <Checkbox
                        id="loan_apply_composition"
                        checked={formData.initial_loan_apply_interest_composition}
                        onCheckedChange={(checked) => setFormData((s) => ({ ...s, initial_loan_apply_interest_composition: !!checked }))}
                      />
                      <Label htmlFor="loan_apply_composition" className="text-sm font-semibold text-gold cursor-pointer select-none">
                        Recomposição de Juros (+30% a cada 30 dias excedentes ao primeiro mês)
                      </Label>
                    </div>
                  </>
                ) : (
                  <>
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
  const { data: loans, deleteLoan } = useLoans();
  const queryClient = useQueryClient();
  const [deletingLoanId, setDeletingLoanId] = useState<string | null>(null);

  const { data: documents, refetch: refetchDocuments } = useQuery({
    queryKey: ["client-documents", cliente?.id],
    queryFn: () => getClientDocumentsFn({ data: cliente?.id as string }),
    enabled: !!cliente?.id,
  });

  const [configPenaltyKind, setConfigPenaltyKind] = useState<PenaltyKind>(cliente?.penalty_kind ?? "nenhuma");
  const [configPenaltyValue, setConfigPenaltyValue] = useState(cliente?.penalty_value?.toString() ?? "0");
  const [configPenaltyGraceDays, setConfigPenaltyGraceDays] = useState(cliente?.penalty_grace_days?.toString() ?? "0");
  const [configDelayInterestKind, setConfigDelayInterestKind] = useState(cliente?.delay_interest_kind ?? "diario");
  const [configDelayInterestRate, setConfigDelayInterestRate] = useState(cliente?.delay_interest_rate?.toString() ?? "0");
  const [isSavingConfig, setIsSavingConfig] = useState(false);

  const [editFullName, setEditFullName] = useState(cliente?.full_name ?? "");
  const [editPhone, setEditPhone] = useState(cliente?.phone ?? "");
  const [editCPF, setEditCPF] = useState(cliente?.cpf ?? "");
  const [newAnnotation, setNewAnnotation] = useState("");
  const [isSavingAnnotation, setIsSavingAnnotation] = useState(false);

  useEffect(() => {
    if (cliente) {
      setConfigPenaltyKind(cliente.penalty_kind);
      setConfigPenaltyValue(cliente.penalty_value.toString());
      setConfigPenaltyGraceDays(cliente.penalty_grace_days.toString());
      setConfigDelayInterestKind(cliente.delay_interest_kind);
      setConfigDelayInterestRate(cliente.delay_interest_rate.toString());
      setEditFullName(cliente.full_name);
      setEditPhone(cliente.phone);
      setEditCPF(cliente.cpf || "");
    }
  }, [cliente]);

  const handleSaveConfig = async () => {
    if (!editFullName.trim() || !editPhone.trim()) {
      toast.error("Nome e Telefone são obrigatórios.");
      return;
    }

    if (!validatePhone(editPhone)) {
      toast.error("Telefone inválido.");
      return;
    }

    if (editCPF && !validateCPF(editCPF)) {
      toast.error("CPF inválido.");
      return;
    }

    setIsSavingConfig(true);
    try {
      if (!cliente) return;
      await updateClientFn({
        data: {
          id: cliente.id,
          updates: {
            full_name: editFullName,
            phone: editPhone,
            cpf: editCPF || null,
            penalty_kind: configPenaltyKind,
            penalty_value: parseInt(configPenaltyValue) || 0,
            penalty_grace_days: parseInt(configPenaltyGraceDays) || 0,
            delay_interest_kind: configDelayInterestKind,
            delay_interest_rate: parseFloat(configDelayInterestRate) || 0,
          },
        },
      });
      toast.success("Dados e configurações salvos com sucesso!");
      queryClient.invalidateQueries({ queryKey: ["clients"] });
      onUpdate();
    } catch (err) {
      toast.error("Erro ao salvar alterações.");
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

  const parsedNotes = useMemo(() => {
    if (!cliente?.notes) return [];
    return cliente.notes
      .split("\n")
      .filter((line) => line.trim() !== "")
      .map((line) => {
        const match = line.match(/^\[(\d{2}\/\d{2}\/\d{4} \d{2}:\d{2})\]\s*(.*)$/);
        if (match) {
          return {
            timestamp: match[1],
            text: match[2],
          };
        }
        return {
          timestamp: null,
          text: line,
        };
      });
  }, [cliente?.notes]);

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

  const handleDeleteLoan = async (loanId: string) => {
    if (
      !confirm(
        "Tem certeza de que deseja excluir este empréstimo? Todos os registros relacionados (parcelas, pagamentos, etc) serão apagados permanentemente do banco de dados."
      )
    )
      return;
    setDeletingLoanId(loanId);
    try {
      await deleteLoan(loanId);
      onUpdate();
    } catch (err) {
      console.error(err);
    } finally {
      setDeletingLoanId(null);
    }
  };

  const handleAddAnnotation = async () => {
    if (!newAnnotation.trim()) return;

    setIsSavingAnnotation(true);
    try {
      const timestamp = new Date().toLocaleString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
      const formattedAnnotation = `[${timestamp}] ${newAnnotation.trim()}`;
      const updatedNotes = cliente.notes
        ? `${cliente.notes}\n${formattedAnnotation}`
        : formattedAnnotation;

      await updateClientFn({
        data: {
          id: cliente.id,
          updates: { notes: updatedNotes },
        },
      });

      toast.success("Anotação adicionada com sucesso!");
      setNewAnnotation("");
      queryClient.invalidateQueries({ queryKey: ["clients"] });
      onUpdate();
    } catch (err) {
      toast.error("Erro ao adicionar anotação");
    } finally {
      setIsSavingAnnotation(false);
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
                Editar / Config.
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
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-gold">{formatBRL(l.total_amount / 100)}</span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                        onClick={() => handleDeleteLoan(l.id)}
                        disabled={deletingLoanId !== null}
                      >
                        {deletingLoanId === l.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
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
                  {(documents as any)?.map((doc: any) => (
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
                <div className="rounded-lg border border-border/40 p-4 space-y-3 bg-surface/30">
                  <h4 className="text-sm font-bold text-gold uppercase tracking-wider mb-2">Dados Cadastrais</h4>

                  <div className="space-y-1.5">
                    <Label htmlFor="edit-name">Nome Completo</Label>
                    <Input
                      id="edit-name"
                      value={editFullName}
                      onChange={(e) => setEditFullName(e.target.value)}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="edit-phone">Telefone</Label>
                    <Input
                      id="edit-phone"
                      value={editPhone}
                      onChange={(e) => setEditPhone(e.target.value)}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="edit-cpf">CPF</Label>
                    <Input
                      id="edit-cpf"
                      value={editCPF}
                      onChange={(e) => setEditCPF(e.target.value)}
                    />
                  </div>
                </div>

                <div className="rounded-lg border border-border/40 p-4 space-y-3 bg-surface/30">
                  <h4 className="text-sm font-bold text-gold uppercase tracking-wider mb-2">Configurações Financeiras</h4>

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
                </div>

                <Button
                  className="w-full bg-gold text-black hover:bg-gold/90 font-bold mt-2"
                  onClick={handleSaveConfig}
                  disabled={isSavingConfig}
                >
                  {isSavingConfig ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    "Salvar Dados e Configurações"
                  )}
                </Button>
              </div>
            </TabsContent>
          </Tabs>

          <div className="rounded-lg border border-border bg-surface p-4 space-y-4">
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground font-bold">Histórico de Observações</p>

              {parsedNotes.length === 0 ? (
                <p className="text-xs text-muted-foreground mt-2 italic text-center py-2">Nenhuma observação registrada.</p>
              ) : (
                <div className="mt-3 relative pl-4 border-l border-border space-y-4">
                  {parsedNotes.map((note, idx) => (
                    <div key={idx} className="relative">
                      {/* Timeline dot */}
                      <div className="absolute -left-[21px] top-1.5 w-2.5 h-2.5 rounded-full bg-gold border border-background" />

                      <div className="space-y-1">
                        {note.timestamp && (
                          <span className="text-[10px] text-gold font-semibold block">
                            {note.timestamp}
                          </span>
                        )}
                        <p className="text-xs text-foreground leading-relaxed break-words">
                          {note.text}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Add new annotation area */}
            <div className="pt-2 border-t border-border/40 space-y-2">
              <Label htmlFor="new-annotation" className="text-xs text-muted-foreground">Nova Anotação</Label>
              <textarea
                id="new-annotation"
                placeholder="Digite aqui informações importantes sobre este cliente (promessa de pagamento, etc)..."
                className="w-full text-xs p-2 rounded-md border border-border bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-gold min-h-[60px] resize-none"
                value={newAnnotation}
                onChange={(e) => setNewAnnotation(e.target.value)}
              />
              <Button
                size="sm"
                className="w-full bg-gold/10 text-gold hover:bg-gold/25 font-semibold text-xs py-1"
                onClick={handleAddAnnotation}
                disabled={isSavingAnnotation || !newAnnotation.trim()}
              >
                {isSavingAnnotation ? (
                  <Loader2 className="h-3 w-3 animate-spin mr-1" />
                ) : (
                  <Plus className="h-3.5 w-3.5 mr-1" />
                )}
                Adicionar Anotação ao Histórico
              </Button>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}