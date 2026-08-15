import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Minus, Printer, Loader2 } from "lucide-react";
import { AppShell, PageHeader } from "@/components/fr/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { formatBRL, formatDate } from "@/lib/format";
import { toast } from "sonner";
import { useEmployees } from "@/hooks/use-employees";
import { useLoans } from "@/hooks/use-loans";
import { usePayments } from "@/hooks/use-payments";
import {
  buildSettlement,
  currentWeek,
  type LoanRow,
  type PaymentRow,
} from "@/finance/aggregations";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/acertos")({
  validateSearch: (search: Record<string, unknown>) => ({
    employee_id: typeof search["employee_id"] === "string" ? search["employee_id"] : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Acerto semanal — FR Financeiro" },
      {
        name: "description",
        content: "Fechamento semanal por funcionário com descontos, multas e valor líquido.",
      },
      { property: "og:title", content: "Acerto semanal — FR Financeiro" },
      {
        property: "og:description",
        content: "Fechamento semanal por funcionário com descontos, multas e valor líquido.",
      },
    ],
  }),
  component: Acertos,
});

type Desconto = { id: string; descricao: string; valorCents: number };

const shiftWeek = (week: { start: string; end: string }, weeks: number) => {
  const s = new Date(`${week.start}T12:00:00`);
  s.setDate(s.getDate() + weeks * 7);
  const e = new Date(s);
  e.setDate(s.getDate() + 6);
  return {
    start: s.toISOString().split("T")[0] as string,
    end: e.toISOString().split("T")[0] as string,
  };
};

function Acertos() {
  const { employee_id: employeeIdParam } = Route.useSearch();

  const { data: dbEmployees, isLoading: loadingEmp } = useEmployees();
  const { data: dbLoans, isLoading: loadingLoans } = useLoans();
  const { data: dbPayments, isLoading: loadingPay } = usePayments();

  const loans = useMemo(() => (dbLoans ?? []) as unknown as LoanRow[], [dbLoans]);
  const payments = useMemo(() => (dbPayments ?? []) as unknown as PaymentRow[], [dbPayments]);
  const hoje = new Date().toISOString().split("T")[0] as string;

  const [funcId, setFuncId] = useState<string>(employeeIdParam || "");
  const [semanaOffset, setSemanaOffset] = useState(0);
  const [extras, setExtras] = useState<Record<string, Desconto[]>>({});
  const [modalDesconto, setModalDesconto] = useState(false);
  const [desc, setDesc] = useState("");
  const [valorDesc, setValorDesc] = useState("");

  const employees = dbEmployees ?? [];
  const selecionado = employees.find((e) => e.id === funcId) ?? employees[0];
  const selId = selecionado?.id ?? "";
  const semana = shiftWeek(currentWeek(hoje), semanaOffset);

  const penaltySplitPercent = selecionado && "penalty_split_percent" in selecionado ? Number((selecionado as any).penalty_split_percent ?? 50) : 50;
  const acerto = useMemo(
    () => buildSettlement(payments, loans, selId, semana.start, semana.end, penaltySplitPercent),
    [payments, loans, selId, semana.start, semana.end, penaltySplitPercent],
  );

  const descontos = extras[selId] ?? [];
  const totalDescontosCents = descontos.reduce((s, d) => s + d.valorCents, 0);
  const liquidoCents = acerto.brutoCents - totalDescontosCents;

  const porCliente = useMemo(() => {
    const map = new Map<string, { nome: string; linhas: typeof acerto.linhas }>();
    for (const l of acerto.linhas) {
      const prev = map.get(l.clientId) ?? { nome: l.clientName, linhas: [] };
      map.set(l.clientId, { nome: l.clientName, linhas: [...prev.linhas, l] });
    }
    return [...map.entries()];
  }, [acerto]);

  const adicionarDesconto = () => {
    const v = Number(valorDesc.replace(/\./g, "").replace(",", "."));
    if (!desc.trim() || !v) {
      toast.error("Informe a descrição e o valor do desconto.");
      return;
    }
    setExtras((e) => ({
      ...e,
      [selId]: [
        ...(e[selId] ?? []),
        { id: `${Date.now()}`, descricao: desc, valorCents: Math.round(v * 100) },
      ],
    }));
    setDesc("");
    setValorDesc("");
    setModalDesconto(false);
  };

  if (loadingEmp || loadingLoans || loadingPay) {
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
      <PageHeader
        title="Acerto semanal"
        description={`${selecionado?.full_name ?? "—"} · ${formatDate(semana.start)} a ${formatDate(semana.end)}`}
        actions={
          <>
            <Button variant="outline" onClick={() => window.print()}>
              <Printer className="h-4 w-4" /> Imprimir/Compartilhar
            </Button>
            <Button
              variant="outline"
              className="border-gold/40 text-gold hover:bg-gold/10 hover:text-gold"
              onClick={() => setModalDesconto(true)}
              disabled={!selId}
            >
              <Minus className="h-4 w-4" /> Adicionar desconto
            </Button>
          </>
        }
      />

      <div className="grid gap-3 rounded-xl border border-border bg-card p-4 sm:grid-cols-2">
        <Select value={selId} onValueChange={setFuncId}>
          <SelectTrigger>
            <SelectValue placeholder="Selecione o funcionário" />
          </SelectTrigger>
          <SelectContent>
            {employees.map((e) => (
              <SelectItem key={e.id} value={e.id}>
                {e.full_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={String(semanaOffset)} onValueChange={(v) => setSemanaOffset(Number(v))}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="0">Semana atual</SelectItem>
            <SelectItem value="-1">Semana anterior</SelectItem>
            <SelectItem value="-2">Duas semanas atrás</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <Card
          label="Total Recebido"
          valor={formatBRL(acerto.totalRecebidoCents / 100)}
          sub="Bruto coletado"
        />
        <Card
          label="Multas Totais"
          valor={formatBRL(acerto.totalMultasCents / 100)}
          sub={`FR: ${formatBRL(acerto.multaFrCents / 100)} | Func: ${formatBRL(acerto.multaFuncionarioCents / 100)}`}
        />
        <Card
          label="Comissão Bruta"
          valor={formatBRL(acerto.brutoCents / 100)}
          tone="text-gold"
          sub={`Lucro: ${formatBRL(acerto.lucroFuncionarioCents / 100)} + Multa`}
        />
        <Card
          label="Descontos"
          valor={formatBRL(totalDescontosCents / 100)}
          tone="text-danger"
          sub="Débitos lançados"
        />
        <Card
          label="Líquido Final"
          valor={formatBRL(liquidoCents / 100)}
          tone={liquidoCents >= 0 ? "text-success" : "text-danger"}
          sub="Valor a pagar"
        />
      </div>

      <section className="rounded-xl border border-border bg-card">
        <div className="border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold">Recebimentos do período</h2>
          <p className="text-xs text-muted-foreground">
            Em aberto no período:{" "}
            <span className="text-danger">{formatBRL(acerto.naoPagoCents / 100)}</span>
          </p>
        </div>
        <ul className="divide-y divide-border">
          {porCliente.map(([id, grupo]) => (
            <li key={id} className="px-4 py-3">
              <p className="text-sm font-medium">{grupo.nome}</p>
              <ul className="mt-2 space-y-1">
                {grupo.linhas.map((l) => (
                  <li
                    key={l.paymentId}
                    className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 text-xs text-muted-foreground"
                  >
                    <span>
                      parcela {l.parcela} · {formatDate(l.data)}
                    </span>
                    <span className="font-display font-semibold text-success">
                      {formatBRL((l.recebidoCents + l.multaCents) / 100)}
                    </span>
                  </li>
                ))}
              </ul>
            </li>
          ))}
          {porCliente.length === 0 && (
            <li className="px-4 py-10 text-center text-sm text-muted-foreground">
              Nenhum recebimento neste período.
            </li>
          )}
        </ul>
      </section>

      {descontos.length > 0 && (
        <section className="rounded-xl border border-border bg-card p-4">
          <h2 className="text-sm font-semibold">Descontos do acerto</h2>
          <ul className="mt-2 divide-y divide-border text-sm">
            {descontos.map((d) => (
              <li key={d.id} className="flex justify-between py-2">
                <span className="text-muted-foreground">{d.descricao}</span>
                <span className="font-display font-semibold text-danger">
                  - {formatBRL(d.valorCents / 100)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <Dialog open={modalDesconto} onOpenChange={setModalDesconto}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Adicionar desconto</DialogTitle>
            <DialogDescription>Lançamento no acerto de {selecionado?.full_name}.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label>Descrição</Label>
              <Input
                value={desc}
                onChange={(e) => setDesc(e.target.value)}
                placeholder="Adiantamento, combustível..."
              />
            </div>
            <div className="space-y-2">
              <Label>Valor (R$)</Label>
              <Input
                value={valorDesc}
                onChange={(e) => setValorDesc(e.target.value)}
                inputMode="decimal"
              />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:justify-between">
            <Button variant="outline" onClick={() => setModalDesconto(false)}>
              Cancelar
            </Button>
            <Button className="bg-gold text-black hover:bg-gold/90" onClick={adicionarDesconto}>
              Adicionar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

function Card({
  label,
  valor,
  tone,
  sub,
}: {
  label: string;
  valor: string;
  tone?: string;
  sub?: string;
}) {
  return (
    <div className="group relative overflow-hidden rounded-2xl border border-border bg-card p-5 transition-all hover:border-gold/20">
      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
        {label}
      </p>
      <p
        className={cn(
          "mt-2 truncate font-display text-xl font-bold tracking-tight sm:text-2xl",
          tone,
        )}
      >
        {valor}
      </p>
      {sub && <p className="mt-1 text-xs font-medium text-muted-foreground/60">{sub}</p>}
      <div className="absolute bottom-0 left-0 h-0.5 w-0 bg-gold transition-all group-hover:w-full" />
    </div>
  );
}
