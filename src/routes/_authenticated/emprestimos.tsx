import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { Search, Plus, Info, ChevronDown, Loader2 } from "lucide-react";
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
import { Database } from "@/integrations/supabase/types";
import { toPillStatus } from "@/lib/status";

type LoanRow = Database["public"]["Tables"]["loans"]["Row"] & {
  clients: { full_name: string } | null;
  employees: { full_name: string } | null;
  installments: Database["public"]["Tables"]["installments"]["Row"][];
};

const getDayOfWeekName = (dateStr: string) => {
  if (!dateStr) return "";
  const parts = dateStr.split("-");
  if (parts.length !== 3) return "";
  const yStr = parts[0];
  const mStr = parts[1];
  const dStr = parts[2];
  if (!yStr || !mStr || !dStr) return "";
  const year = parseInt(yStr, 10);
  const month = parseInt(mStr, 10) - 1;
  const day = parseInt(dStr, 10);
  const date = new Date(year, month, day);
  
  const dayNames = [
    "Domingo",
    "Segunda-feira",
    "Terça-feira",
    "Quarta-feira",
    "Quinta-feira",
    "Sexta-feira",
    "Sábado"
  ];
  return dayNames[date.getDay()];
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
  const {
    data: dbLoans,
    requestLoanApproval,
    isRequesting,
    isLoading: isLoadingLoans,
  } = useLoans();
  const { data: dbClients } = useClients();
  const { data: dbEmployees } = useEmployees();
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());

  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  useEffect(() => {
    setCurrentPage(1);
  }, [busca, funcFilter, freqFilter]);

  const [newLoan, setNewLoan] = useState({
    clienteId: "",
    capital: "",
    frequencia: "diario" as Frequencia,
    qtdParcelas: "1",
    lucroFrValor: "12",
    lucroFrTipo: "percentual" as "fixo" | "percentual",
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
        startDate: newLoan.startDate,
        lucroFr: newLoan.lucroFrValor
          ? (newLoan.lucroFrTipo === "fixo"
              ? {
                  tipo: "fixo",
                  valor: Math.round(parseBRLInput(newLoan.lucroFrValor || "0") * 100),
                }
              : { tipo: "percentual", valor: parseFloat(newLoan.lucroFrValor || "0") / 100 })
          : undefined,
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

  const listaPaginada = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize;
    return lista.slice(startIndex, startIndex + pageSize);
  }, [lista, currentPage, pageSize]);

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
      doc.text("RELATÓRIO DE CONTRATOS", 135, 18);
      
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

      // 2. Summary Card Section (Capital Investido, Lucro FR, Lucro Funcionários)
      doc.setFillColor(245, 245, 245);
      doc.rect(15, 45, 180, 24, "F");
      
      doc.setTextColor(100, 100, 100);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7);
      doc.text("CAPITAL INVESTIDO", 25, 52);
      doc.text("PREVISÃO LUCRO FR", 85, 52);
      doc.text("LUCRO FUNCIONÁRIOS", 145, 52);

      doc.setTextColor(18, 18, 18);
      doc.setFontSize(11);
      doc.text(formatBRL(totais.capital / 100), 25, 59);
      
      doc.setTextColor(212, 175, 55); // Gold
      doc.text(formatBRL(totais.fr / 100), 85, 59);
      
      doc.setTextColor(46, 117, 89); // Green
      doc.text(formatBRL(totais.func / 100), 145, 59);

      // 3. Filter info text
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
      doc.text(filterText, 15, 76);

      // 4. Generate data rows for PDF AutoTable
      const tableHeaders = [
        ["Cliente", "Responsável", "Periodicidade", "Parcelas", "Capital", "Total Geral", "Vencimento"],
      ];

      const tableData = lista.map((loan) => {
        const sortedInst = loan.installments ? [...loan.installments].sort((a, b) => a.number - b.number) : [];
        const firstDueDate = sortedInst[0]?.due_date || loan.start_date;
        const dayOfWeek = firstDueDate ? getDayOfWeekName(firstDueDate) : "";

        return [
          loan.clients?.full_name || "Desconhecido",
          loan.employees?.full_name || "—",
          loan.frequency.toUpperCase(),
          `${loan.installments_count.toString().padStart(2, "0")}x`,
          formatBRL(loan.principal_amount / 100),
          formatBRL(loan.total_amount / 100),
          loan.frequency === "semanal" && dayOfWeek ? `Toda ${dayOfWeek}` : "Conforme parcelas",
        ];
      });

      // 5. Render autoTable
      autoTable(doc, {
        head: tableHeaders,
        body: tableData,
        startY: 80,
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
        columnStyles: {
          4: { halign: "right" },
          5: { halign: "right" },
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
      doc.save(`FR_Financeiro_Relatorio_Contratos_${new Date().toISOString().slice(0, 10)}.pdf`);
      toast.success("PDF exportado com sucesso!");
    } catch (err) {
      console.error(err);
      toast.error("Erro ao gerar arquivo PDF");
    }
  };

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
        fr_profit_input: newLoan.lucroFrValor
          ? (newLoan.lucroFrTipo === "fixo"
              ? parseBRLInput(newLoan.lucroFrValor)
              : parseFloat(newLoan.lucroFrValor || "0"))
          : undefined,
        fr_profit_kind: newLoan.lucroFrValor ? newLoan.lucroFrTipo : undefined,
      });
      setIsNewLoanOpen(false);
      setIdempotencyKey(crypto.randomUUID());
      setNewLoan({
        clienteId: "",
        capital: "",
        frequencia: "diario",
        qtdParcelas: "1",
        lucroFrValor: "12",
        lucroFrTipo: "percentual",
        lucroFuncionarioValor: "",
        lucroFuncionarioTipo: "fixo",
        startDate: new Date(),
      });
    } catch (e) {
      // handled by hook
    }
  };



  return (
    <AppShell>
      <PageHeader
        title="Empréstimos"
        description={`${lista.length} contratos ativos`}
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
              onClick={() => setIsNewLoanOpen(true)}
              className="bg-gold text-black hover:bg-gold/90"
            >
              <Plus className="mr-2 h-4 w-4" /> Novo Empréstimo
            </Button>
          </div>
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
          listaPaginada.map((e) => {
            const sortedInst = e.installments ? [...e.installments].sort((a, b) => a.number - b.number) : [];
            const firstDueDate = sortedInst[0]?.due_date || e.start_date;
            const dayOfWeek = firstDueDate ? getDayOfWeekName(firstDueDate) : "";
            const vencimentoText = e.frequency === "semanal" && dayOfWeek ? ` - Vence toda ${dayOfWeek}` : "";
            const employeeName = e.employees?.full_name?.split(" ")[0] || "—";
            const formattedDate = formatDate(e.start_date);
            const totalParcelas = e.installments_count.toString().padStart(2, "0");

            return (
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
                        Atendido por {employeeName} - {formattedDate} - {totalParcelas} PARCELAS{vencimentoText}
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
            );
          })
        )}
        {!isLoadingLoans && lista.length === 0 && (
          <p className="rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
            Nenhum empréstimo encontrado.
          </p>
        )}
      </div>

      {/* Pagination controls */}
      {!isLoadingLoans && lista.length > 0 && (
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
              <option value={20}>20</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
            <span>por página</span>
          </div>

          <div className="text-xs text-center sm:text-left">
            Exibindo <span className="font-bold text-foreground">{Math.min((currentPage - 1) * pageSize + 1, lista.length)}</span> a{" "}
            <span className="font-bold text-foreground">{Math.min(currentPage * pageSize, lista.length)}</span> de{" "}
            <span className="font-bold text-foreground">{lista.length}</span> empréstimos
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
                onValueChange={(v: Frequencia) =>
                  setNewLoan((s) => {
                    const defaultRates: Record<Frequencia, number> = {
                      diario: 12,
                      semanal: 20,
                      quinzenal: 30,
                      mensal: 30,
                    };
                    return {
                      ...s,
                      frequencia: v,
                      lucroFrValor: String(defaultRates[v]),
                      lucroFrTipo: "percentual",
                    };
                  })
                }
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
              <Label htmlFor="loan-fr-lucro">Lucro FR Financeiro</Label>
              <div className="flex gap-2">
                <Input
                  id="loan-fr-lucro"
                  type="text"
                  placeholder={newLoan.lucroFrTipo === "fixo" ? "0,00" : "Percentual"}
                  className="flex-1"
                  value={newLoan.lucroFrValor}
                  onChange={(e) => {
                    const val = e.target.value;
                    setNewLoan((s) => ({
                      ...s,
                      lucroFrValor: s.lucroFrTipo === "fixo" ? maskBRL(val) : val,
                    }));
                  }}
                />
                <Select
                  value={newLoan.lucroFrTipo}
                  onValueChange={(v: "fixo" | "percentual") =>
                    setNewLoan((s) => ({ ...s, lucroFrTipo: v, lucroFrValor: "" }))
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
                "Cadastrar empréstimo"
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
