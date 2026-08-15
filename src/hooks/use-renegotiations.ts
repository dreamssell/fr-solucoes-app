import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { rpcErrorMessage, type RpcError } from "@/lib/rpc";
import {
  decideRenegotiation,
  getMyRole,
  listRenegotiations,
  requestRenegotiation,
} from "@/lib/renegotiations.functions";

export function useMyRole() {
  const fetchRole = useServerFn(getMyRole);
  return useQuery({ queryKey: ["my-role"], queryFn: () => fetchRole() });
}

export function useRenegotiations() {
  const queryClient = useQueryClient();
  const fetchAll = useServerFn(listRenegotiations);
  const request = useServerFn(requestRenegotiation);
  const decide = useServerFn(decideRenegotiation);

  const query = useQuery({ queryKey: ["renegotiations"], queryFn: () => fetchAll() });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["renegotiations"] });
    queryClient.invalidateQueries({ queryKey: ["loans"] });
  };

  const requestMutation = useMutation({
    mutationFn: (payload: {
      loan_id: string;
      reason: string;
      proposed_terms: Record<string, unknown>;
      idempotency_key: string;
    }) => request({ data: payload }),
    onSuccess: () => {
      invalidate();
      toast.success("Renegociação enviada para aprovação.");
    },
    onError: (error: unknown) =>
      toast.error(rpcErrorMessage(error as RpcError, "Não foi possível solicitar a renegociação.")),
  });

  const decideMutation = useMutation({
    mutationFn: (payload: {
      renegotiation_id: string;
      decision: "approved" | "rejected";
      notes?: string;
    }) => decide({ data: payload }),
    onSuccess: (_d, vars) => {
      invalidate();
      toast.success(
        vars.decision === "approved" ? "Renegociação aprovada." : "Renegociação rejeitada.",
      );
    },
    onError: (error: unknown) =>
      toast.error(rpcErrorMessage(error as RpcError, "Não foi possível registrar a decisão.")),
  });

  return {
    ...query,
    requestRenegotiation: requestMutation.mutateAsync,
    isRequesting: requestMutation.isPending,
    decideRenegotiation: decideMutation.mutateAsync,
    isDeciding: decideMutation.isPending,
  };
}
