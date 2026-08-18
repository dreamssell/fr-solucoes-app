import { rpcErrorMessage } from "@/lib/rpc";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getLoans, requestLoanApproval, decideLoanApproval, deleteLoan } from "@/lib/loans.functions";
import { toast } from "sonner";

export type LoanRequestPayload = {
  client_id: string;
  capital_cents: number;
  frequency: "diario" | "semanal" | "quinzenal" | "mensal";
  installments_count: number;
  employee_profit_input: number;
  employee_profit_kind: "fixo" | "percentual";
  start_date: string;
  notes?: string | null;
  reason?: string;
  idempotency_key: string;
  apply_interest_composition?: boolean;
};

export type LoanDecisionPayload = {
  loan_id: string;
  decision: "approved" | "rejected";
  reason?: string;
};

export function useLoans() {
  const queryClient = useQueryClient();
  const fetchLoans = useServerFn(getLoans);
  const requestLoan = useServerFn(requestLoanApproval);
  const decideLoan = useServerFn(decideLoanApproval);
  const removeLoan = useServerFn(deleteLoan);

  const query = useQuery({
    queryKey: ["loans"],
    queryFn: () => fetchLoans(),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["loans"] });

  // Escrita SEMPRE via RPC de aprovação: nunca cria contrato ativo direto.
  const requestMutation = useMutation({
    mutationFn: (payload: LoanRequestPayload) => requestLoan({ data: payload }),
    onSuccess: () => {
      invalidate();
      toast.success("Solicitação enviada — aguardando aprovação.");
    },
    onError: (error: unknown) => {
      toast.error(rpcErrorMessage(error as { message?: string }, "Erro ao solicitar contrato"));
    },
  });

  const decideMutation = useMutation({
    mutationFn: (payload: LoanDecisionPayload) => decideLoan({ data: payload }),
    onSuccess: (_data, vars) => {
      invalidate();
      toast.success(vars.decision === "approved" ? "Contrato aprovado." : "Solicitação rejeitada.");
    },
    onError: (error: unknown) => {
      toast.error(rpcErrorMessage(error as { message?: string }, "Erro ao registrar decisão"));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (loanId: string) => removeLoan({ data: { loan_id: loanId } }),
    onSuccess: () => {
      invalidate();
      toast.success("Empréstimo excluído com sucesso.");
    },
    onError: (error: unknown) => {
      toast.error(rpcErrorMessage(error as { message?: string }, "Erro ao excluir empréstimo"));
    },
  });

  return {
    ...query,
    requestLoanApproval: requestMutation.mutateAsync,
    mutateAsync: requestMutation.mutateAsync,
    isRequesting: requestMutation.isPending,
    isCreating: requestMutation.isPending,
    isPending: requestMutation.isPending,
    decideLoanApproval: decideMutation.mutateAsync,
    isDeciding: decideMutation.isPending,
    deleteLoan: deleteMutation.mutateAsync,
    isDeleting: deleteMutation.isPending,
  };
}
