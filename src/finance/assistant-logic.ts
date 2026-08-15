import { formatBRL } from "@/lib/format";
import {
  toDay,
  isSettled,
  flattenInstallments,
  type LoanRow,
  type PaymentRow,
} from "./aggregations";

export type AlertPriority = "Crítico" | "Atenção" | "Informativo";

export interface Alert {
  id: string;
  type: string;
  title: string;
  description: string;
  priority: AlertPriority;
  date: string; // ISO date for sorting
  targetPath: string;
  buttonLabel: string;
}

export function getGreeting(hourOverride?: number): string {
  // Horário de Brasília (UTC-3)
  const now = new Date();
  const utc = now.getTime() + now.getTimezoneOffset() * 60000;
  const brasiliaDate = new Date(utc + 3600000 * -3);
  const hour = hourOverride !== undefined ? hourOverride : brasiliaDate.getHours();

  let salutation = "Boa noite";

  if (hour >= 5 && hour < 12) salutation = "Bom dia";
  else if (hour >= 12 && hour < 18) salutation = "Boa tarde";

  return `${salutation}, senhor Felipe. Veja o que precisa da sua atenção agora.`;
}

export function classifyAlerts(alerts: Alert[]): Alert[] {
  const priorityMap: Record<AlertPriority, number> = {
    Crítico: 0,
    Atenção: 1,
    Informativo: 2,
  };

  return [...alerts].sort((a, b) => {
    if (priorityMap[a.priority] !== priorityMap[b.priority]) {
      return priorityMap[a.priority] - priorityMap[b.priority];
    }
    return a.date.localeCompare(b.date);
  });
}

interface GenerateAlertsInput {
  loans: LoanRow[];
  payments: PaymentRow[];
  today: string;
}

export function generateAlerts({ loans, payments, today }: GenerateAlertsInput): Alert[] {
  const alerts: Alert[] = [];

  // 1. Parcelas Vencidas (Crítico)
  loans.forEach((loan) => {
    (loan.installments || []).forEach((inst) => {
      if (!isSettled(inst.status) && toDay(inst.due_date) < today) {
        alerts.push({
          id: `overdue-${inst.id}`,
          type: "parcela_atrasada",
          title: "Parcela Atrasada",
          description: `O cliente ${loan.clients?.full_name || "Desconhecido"} está com a parcela ${inst.number} vencida (${formatBRL(inst.outstanding_amount / 100)}).`,
          priority: "Crítico",
          date: inst.due_date,
          targetPath: `/cobrancas?installment=${inst.id}`,
          buttonLabel: "Ver parcela",
        });
      }
    });
  });

  // 2. Pagamentos aguardando confirmação (Atenção)
  payments
    .filter((p) => p.status === "pendente")
    .forEach((p) => {
      alerts.push({
        id: `pay-auth-${p.id}`,
        type: "pagamento_pendente",
        title: "Pagamento Pendente",
        description: `O pagamento de ${formatBRL((p.amount + (p.penalty_amount || 0)) / 100)} aguarda confirmação (Cliente: ${p.clients?.full_name || "Desconhecido"}).`,
        priority: "Atenção",
        date: p.paid_at,
        targetPath: `/recebimentos?id=${p.id}`,
        buttonLabel: "Analisar pagamento",
      });
    });

  // 3. Cobranças de Hoje ainda não enviadas (Atenção)
  // Agrupar por funcionário
  const instsHoje = flattenInstallments(loans).filter(
    (i) => !isSettled(i.status) && toDay(i.due_date) === today,
  );

  const empIds = Array.from(new Set(instsHoje.map((i) => i.loan.employee_id)));
  empIds.forEach((empId) => {
    const insts = instsHoje.filter((i) => i.loan.employee_id === empId);
    const firstInst = insts[0];
    if (firstInst) {
      const empName = firstInst.loan?.employees?.full_name || "Funcionário";
      alerts.push({
        id: `collection-${empId}-${today}`,
        type: "cobranca_diaria",
        title: "Relação de Cobrança",
        description: `Existem ${insts.length} cobranças previstas para ${empName} hoje.`,
        priority: "Atenção",
        date: today,
        targetPath: `/cobrancas?employee_id=${empId}`,
        buttonLabel: "Conferir envios",
      });
    }
  });

  // 4. Acertos Semanais Prontos (Atenção)
  // Lógica: Se estamos no final da semana (ex: Segunda/Terça) ou se há muito lucro acumulado sem acerto.
  // Por ora, vamos alertar por funcionário com lucro realizado > 0.
  const empProfits = loans.reduce(
    (acc, l) => {
      const profit = (l.installments || [])
        .filter((i) => isSettled(i.status))
        .reduce((s, i) => s + (i.employee_profit_amount || 0), 0);
      if (profit > 0) acc[l.employee_id] = (acc[l.employee_id] || 0) + profit;
      return acc;
    },
    {} as Record<string, number>,
  );

  Object.entries(empProfits).forEach(([empId, profit]) => {
    const loan = loans.find((l) => l.employee_id === empId);
    const emp = loan?.employees;
    alerts.push({
      id: `settlement-${empId}`,
      type: "acerto_semanal",
      title: "Acerto Pronto",
      description: `O acerto semanal de ${emp?.full_name || "Funcionário"} está pronto para conferência.`,
      priority: "Atenção",
      date: today,
      targetPath: `/acertos?employee_id=${empId}`,
      buttonLabel: `Conferir acerto de ${(emp?.full_name || "").split(" ")[0]}`,
    });
  });

  return classifyAlerts(alerts);
}
