import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useEffect, useRef, useState } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Cell,
} from "recharts";
import {
  ArrowUpRight,
  Loader2,
  TrendingUp,
  Users,
  AlertTriangle,
  CheckCircle2,
  Wallet,
  PieChart,
  Bell,
  ArrowRight,
  Clock,
} from "lucide-react";
import { AppShell, PageHeader } from "@/components/fr/AppShell";
import { formatBRL, formatDate } from "@/lib/format";
import { useLoans } from "@/hooks/use-loans";
import { usePayments } from "@/hooks/use-payments";
import { useClients } from "@/hooks/use-clients";
import { useEmployees } from "@/hooks/use-employees";
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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  computeIndicators,
  dailyReceipts,
  lastDays,
  flattenInstallments,
  isSettled,
  toDay,
  type LoanRow,
  type PaymentRow,
} from "@/finance/aggregations";
import { cn } from "@/lib/utils";
import { getGreeting, generateAlerts, type Alert } from "@/finance/assistant-logic";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

type ClientRow = Database["public"]["Tables"]["clients"]["Row"];
import { useQuery } from "@tanstack/react-query";
import { EditableText } from "@/components/fr/EditableText";
import { DashboardEditor } from "@/components/fr/DashboardEditor";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { useEditorStore } from "@/lib/editor-store";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — FR Financeiro" },
      {
        name: "description",
        content: "Visão geral de capital, recebimentos, lucro e cobranças do dia.",
      },
      { property: "og:title", content: "Dashboard — FR Financeiro" },
      {
        property: "og:description",
        content: "Visão geral de capital, recebimentos, lucro e cobranças do dia.",
      },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const navigate = useNavigate();
  const { setDashboardText } = useEditorStore();
  const [persistedTexts] = useLocalStorage<Record<string, string>>("fr-dashboard-texts", {});

  // Sincroniza os textos persistidos apenas uma vez, na montagem.
  const syncedRef = useRef(false);
  useEffect(() => {
    if (syncedRef.current) return;
    syncedRef.current = true;
    Object.entries(persistedTexts).forEach(([key, val]) => {
      setDashboardText(key, val);
    });
  }, [persistedTexts, setDashboardText]);
  const { data: loansData, isLoading: loadingLoans } = useLoans();
  const { data: paymentsData, isLoading: loadingPayments } = usePayments();
  const { data: clientsData, isLoading: loadingClients } = useClients();

  // Realtime user profile for greeting
  const { data: user } = useQuery({
    queryKey: ["auth-user"],
    queryFn: async () => {
      const { data } = await supabase.auth.getUser();
      return data.user;
    },
  });

  const [funcFilter, setFuncFilter] = useState("todos");
  const [periodoFilter, setPeriodoFilter] = useState("7");
  const { data: dbEmployees } = useEmployees();

  const [isWaConfigOpen, setIsWaConfigOpen] = useState(false);
  const [waGatewayUrl, setWaGatewayUrl] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("fr-wa-gateway-url") || "https://wa.me/{{phone}}";
    }
    return "https://wa.me/{{phone}}";
  });

  const handleSaveWaConfig = () => {
    localStorage.setItem("fr-wa-gateway-url", waGatewayUrl);
    toast.success("Configuração do gateway do WhatsApp salva com sucesso!");
    setIsWaConfigOpen(false);
  };

  const loans = useMemo(() => (loansData ?? []) as unknown as LoanRow[], [loansData]);
  const payments = useMemo(() => (paymentsData ?? []) as unknown as PaymentRow[], [paymentsData]);
  const clients = useMemo(() => (clientsData ?? []) as ClientRow[], [clientsData]);

  const filteredLoans = useMemo(() => {
    if (funcFilter === "todos") return loans;
    return loans.filter((l) => l.employee_id === funcFilter);
  }, [loans, funcFilter]);

  const filteredPayments = useMemo(() => {
    if (funcFilter === "todos") return payments;
    return payments.filter((p) => p.employee_id === funcFilter);
  }, [payments, funcFilter]);

  const hoje = new Date().toISOString().split("T")[0] as string;

  const hour = new Date().getHours();
  const greeting = useMemo(() => getGreeting(), []);

  const alerts = useMemo(
    () => generateAlerts({ loans: filteredLoans, payments: filteredPayments, today: hoje }),
    [filteredLoans, filteredPayments, hoje],
  );

  const ind = useMemo(() => computeIndicators(filteredLoans, filteredPayments, hoje), [filteredLoans, filteredPayments, hoje]);

  const grafico = useMemo(
    () =>
      dailyReceipts(filteredPayments, lastDays(hoje, Number(periodoFilter))).map((d) => ({
        dia: formatDate(d.dia).slice(0, 5),
        valor: d.valorCents / 100,
      })),
    [filteredPayments, hoje, periodoFilter],
  );

  const prioritarias = useMemo(
    () =>
      flattenInstallments(filteredLoans)
        .filter((i) => !isSettled(i.status) && toDay(i.due_date) <= hoje)
        .sort((a, b) => toDay(a.due_date).localeCompare(toDay(b.due_date)))
        .slice(0, 5),
    [filteredLoans, hoje],
  );

  const stats = [
    {
      label: "Total Emprestado",
      value: formatBRL(ind.capitalEmprestadoCents / 100),
      sub: `${ind.contratosAtivos} contratos ativos`,
      icon: TrendingUp,
      to: "/emprestimos",
      tone: "text-foreground",
    },
    {
      label: "Total a Receber",
      value: formatBRL(ind.saldoTotalReceberCents / 100),
      sub: "Saldo total pendente",
      icon: Wallet,
      to: "/cobrancas",
      tone: "text-gold",
    },
    {
      label: "Lucro e Juros",
      value: formatBRL(ind.lucroContratadoCents / 100),
      sub: `Realizado: ${formatBRL(ind.lucroRealizadoCents / 100)}`,
      icon: PieChart,
      to: "/acertos",
      tone: "text-success",
    },
    {
      label: "Valores Recebidos",
      value: formatBRL(ind.capitalRecuperadoCents / 100),
      sub: "Capital já retornado",
      icon: CheckCircle2,
      to: "/recebimentos",
      tone: "text-success",
    },
    {
      label: "Parcelas Atrasadas",
      value: String(ind.parcelasVencidas),
      sub: "Vencidas até hoje",
      icon: AlertTriangle,
      to: "/cobrancas",
      tone: "text-danger",
    },
    {
      label: "Clientes Inadimplentes",
      value: String(clients.filter((c) => (c.status as string) === "atrasado").length),
      sub: "Status de atraso",
      icon: Users,
      to: "/clientes",
      tone: "text-danger",
    },
  ];

  if (loadingLoans || loadingPayments || loadingClients) {
    return (
      <AppShell>
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-gold" />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="mb-8 flex flex-col gap-1">
        <h1 className="font-display text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
          {getGreeting()}
        </h1>
        <p className="text-muted-foreground">
          <EditableText
            id="dash-subtitle"
            defaultText={
              alerts.length > 0
                ? `Você tem ${alerts.length} pendências que exigem sua atenção.`
                : "Tudo conferido por enquanto. Nenhuma pendência exige sua atenção."
            }
          />
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 mb-4 mt-2">
        <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Filtros & Configurações</h2>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setIsWaConfigOpen(true)}
          className="border-gold/35 hover:bg-gold/10 text-gold h-8"
        >
          Configurar WhatsApp
        </Button>
      </div>

      <div className="grid gap-3 mb-6 rounded-xl border border-border bg-card p-4 sm:grid-cols-2">
        <div className="space-y-1">
          <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Filtrar por Funcionário</label>
          <Select value={funcFilter} onValueChange={setFuncFilter}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os funcionários</SelectItem>
              {dbEmployees?.map((emp) => (
                <SelectItem key={emp.id} value={emp.id}>
                  {emp.full_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Período do Gráfico</label>
          <Select value={periodoFilter} onValueChange={setPeriodoFilter}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">Últimos 7 dias</SelectItem>
              <SelectItem value="15">Últimos 15 dias</SelectItem>
              <SelectItem value="30">Últimos 30 dias</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {alerts.length > 0 && (
        <section className="mb-8">
          <div className="mb-4 flex items-center gap-2">
            <Bell className="h-5 w-5 text-gold" />
            <h2 className="text-lg font-bold tracking-tight">
              <EditableText id="dash-attention-title" defaultText="Precisa da sua atenção" />
            </h2>
          </div>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {alerts.map((alert) => (
              <div
                key={alert.id}
                className={cn(
                  "relative flex flex-col gap-4 overflow-hidden rounded-2xl border bg-card p-5 transition-all hover:shadow-lg",
                  alert.priority === "Crítico"
                    ? "border-danger/30 hover:border-danger/50 shadow-danger/5"
                    : alert.priority === "Atenção"
                      ? "border-gold/30 hover:border-gold/50 shadow-gold/5"
                      : "border-border hover:border-muted-foreground/30",
                )}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex gap-3">
                    <div
                      className={cn(
                        "mt-1 rounded-full p-1.5",
                        alert.priority === "Crítico"
                          ? "bg-danger/10 text-danger"
                          : alert.priority === "Atenção"
                            ? "bg-gold/10 text-gold"
                            : "bg-muted/10 text-muted-foreground",
                      )}
                    >
                      <AlertTriangle className="h-4 w-4" />
                    </div>
                    <div>
                      <h3 className="font-bold text-foreground">{alert.title}</h3>
                      <p className="mt-1 text-sm text-muted-foreground leading-relaxed">
                        {alert.description}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-wider",
                        alert.priority === "Crítico"
                          ? "bg-danger text-danger-foreground"
                          : alert.priority === "Atenção"
                            ? "bg-gold text-gold-foreground"
                            : "bg-muted text-muted-foreground",
                      )}
                    >
                      {alert.priority}
                    </span>
                    <div className="flex items-center gap-1 text-[10px] text-muted-foreground/60">
                      <Clock className="h-3 w-3" />
                      {formatDate(alert.date)}
                    </div>
                  </div>
                </div>

                <Link
                  to={alert.targetPath}
                  className={cn(
                    "flex items-center justify-center gap-2 rounded-xl py-2 text-sm font-bold transition-all",
                    alert.priority === "Crítico"
                      ? "bg-danger/10 text-danger hover:bg-danger/20"
                      : alert.priority === "Atenção"
                        ? "bg-gold/10 text-gold hover:bg-gold/20"
                        : "bg-muted/30 text-foreground hover:bg-muted/50",
                  )}
                >
                  {alert.buttonLabel}
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            ))}
          </div>
        </section>
      )}

      <PageHeader
        title={persistedTexts["dash-resumo-title"] || "Resumo Operacional"}
        description={
          persistedTexts["dash-resumo-desc"] || "Indicadores consolidados da sua carteira."
        }
      />

      {/* Hidden editable fields for the header in edit mode */}
      <div
        className={cn(
          "mb-6 flex flex-col gap-2 p-4 border border-gold/20 rounded-xl bg-gold/5",
          !useEditorStore.getState().isEditing && "hidden",
        )}
      >
        <p className="text-[10px] font-bold text-gold uppercase tracking-widest">
          Edição do Cabeçalho
        </p>
        <EditableText
          id="dash-resumo-title"
          defaultText="Resumo Operacional"
          className="text-xl font-bold"
        />
        <EditableText
          id="dash-resumo-desc"
          defaultText="Indicadores consolidados da sua carteira."
          className="text-sm"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {stats.map((s) => (
          <div
            key={s.label}
            className="group relative flex flex-col overflow-hidden rounded-2xl border border-border bg-card transition-all hover:border-gold/30 hover:shadow-lg hover:shadow-gold/5"
          >
            <div className="flex flex-1 items-start justify-between p-6">
              <div className="space-y-1">
                <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
                  {s.label}
                </p>
                <p
                  className={cn(
                    "font-display text-2xl font-bold tracking-tight sm:text-3xl",
                    s.tone,
                  )}
                >
                  {s.value}
                </p>
                <p className="text-xs text-muted-foreground/80">{s.sub}</p>
              </div>
              <div className="rounded-xl bg-graphite p-3 transition-colors group-hover:bg-gold/10">
                <s.icon className="h-5 w-5 text-muted-foreground transition-colors group-hover:text-gold" />
              </div>
            </div>

            <Link
              to={s.to}
              className="flex items-center justify-center gap-2 border-t border-border/50 bg-muted/20 py-3 text-[10px] font-black uppercase tracking-widest text-muted-foreground transition-colors hover:bg-gold/10 hover:text-gold"
            >
              Ver detalhes <ArrowRight className="h-3 w-3" />
            </Link>

            <div className="absolute bottom-0 left-0 h-1 w-0 bg-gold transition-all group-hover:w-full" />
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
        <section className="rounded-2xl border border-border bg-card p-6">
          <div className="mb-6 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold tracking-tight">Fluxo de Recebimentos</h2>
              <p className="text-sm text-muted-foreground">Volume financeiro dos últimos 7 dias</p>
            </div>
            <Link
              to="/recebimentos"
              search={{ id: undefined, installment_id: undefined }}
              className="flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-gold hover:opacity-80 transition-opacity"
            >
              DETALHAR RECEBIMENTOS <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={grafico}
                margin={{ left: -15, right: 10, top: 10 }}
                onClick={(data) => {
                  if (data && data.activePayload) {
                    // Navigate to receipts when clicking a bar
                    window.location.href = "/recebimentos";
                  }
                }}
                style={{ cursor: "pointer" }}
              >
                <defs>
                  <linearGradient id="barGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="oklch(0.72 0.09 85)" stopOpacity={1} />
                    <stop offset="100%" stopColor="oklch(0.72 0.09 85)" stopOpacity={0.6} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 3" />
                <XAxis
                  dataKey="dia"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 12, fill: "oklch(0.65 0.01 240)", fontWeight: 500 }}
                  dy={10}
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 12, fill: "oklch(0.65 0.01 240)", fontWeight: 500 }}
                  tickFormatter={(v: number) => `R$ ${v >= 1000 ? (v / 1000).toFixed(1) + "k" : v}`}
                />
                <Tooltip
                  cursor={{ fill: "oklch(0.25 0.01 240)", opacity: 0.4 }}
                  contentStyle={{
                    background: "oklch(0.16 0.01 240)",
                    border: "1px solid oklch(0.22 0.01 240)",
                    borderRadius: 12,
                    boxShadow: "0 10px 15px -3px rgba(0,0,0,0.5)",
                    fontSize: 13,
                    color: "white",
                  }}
                  itemStyle={{ color: "oklch(0.72 0.09 85)" }}
                  formatter={(v) => [formatBRL(Number(v)), "Recebido"]}
                />
                <Bar dataKey="valor" radius={[6, 6, 0, 0]} maxBarSize={45}>
                  {grafico.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill="url(#barGradient)" />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="flex flex-col rounded-2xl border border-border bg-card p-6">
          <div className="mb-6 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold tracking-tight">Cobranças Prioritárias</h2>
              <p className="text-sm text-muted-foreground">Parcelas vencidas e urgentes</p>
            </div>
            <Link
              to="/cobrancas"
              search={{ employee_id: undefined }}
              className="flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-gold hover:opacity-80 transition-opacity"
            >
              VER TODAS <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="flex-1 space-y-4">
            {prioritarias.map((c) => (
              <Link
                key={c.id}
                to="/cobrancas"
                search={{ employee_id: c.employee_id }}
                className="flex items-center justify-between rounded-xl border border-border bg-graphite/30 p-4 transition-all hover:bg-graphite/50 hover:border-gold/30"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-foreground">
                    {c.client?.full_name ?? "Cliente"}
                  </p>
                  <p className="truncate text-xs text-muted-foreground mt-0.5">
                    {(c.employee?.full_name ?? "—").split(" ")[0]} · P{c.number} ·{" "}
                    {formatDate(c.due_date)}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="font-display text-sm font-bold text-gold">
                    {formatBRL(c.outstanding_amount / 100)}
                  </p>
                  <span className="mt-1 block text-[10px] font-bold uppercase tracking-tighter text-danger">
                    Atrasado
                  </span>
                </div>
              </Link>
            ))}
            {prioritarias.length === 0 && (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="mb-3 rounded-full bg-success/10 p-3">
                  <CheckCircle2 className="h-6 w-6 text-success" />
                </div>
                <p className="text-sm font-medium text-muted-foreground">
                  Nenhuma cobrança pendente.
                </p>
              </div>
            )}
          </div>
        </section>
      </div>

      <Dialog open={isWaConfigOpen} onOpenChange={setIsWaConfigOpen}>
        <DialogContent className="sm:max-w-md bg-zinc-950 border-zinc-800 text-white">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-gold">Gateway do WhatsApp</DialogTitle>
            <DialogDescription className="text-zinc-400">
              Configure o modelo de URL do link gerado para os envios de mensagens de cobrança.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase text-zinc-300">URL do Gateway</label>
              <Input
                value={waGatewayUrl}
                onChange={(e) => setWaGatewayUrl(e.target.value)}
                placeholder="Ex: https://wa.me/{{phone}}"
                className="bg-zinc-900 border-zinc-700 text-white"
              />
              <p className="text-[11px] text-zinc-400 leading-normal mt-1">
                Utilize as tags <code className="bg-zinc-800 px-1 py-0.5 rounded font-mono text-[10px] text-white">{"{{phone}}"}</code> para inserir o número e <code className="bg-zinc-800 px-1 py-0.5 rounded font-mono text-[10px] text-white">{"{{message}}"}</code> para o corpo da mensagem.
              </p>
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" className="border-zinc-700 text-zinc-300 hover:bg-zinc-800 hover:text-white" onClick={() => setIsWaConfigOpen(false)}>Cancelar</Button>
            <Button className="bg-gold text-black hover:bg-gold/90 font-bold" onClick={handleSaveWaConfig}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <DashboardEditor />
    </AppShell>
  );
}
