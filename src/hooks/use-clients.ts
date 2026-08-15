import { rpcErrorMessage, type RpcError } from "@/lib/rpc";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getClients, createClient, type CreateClientInput } from "@/lib/clients.functions";
import { toast } from "sonner";

export function useClients() {
  const queryClient = useQueryClient();
  const fetchClients = useServerFn(getClients);
  const saveClient = useServerFn(createClient);

  const query = useQuery({
    queryKey: ["clients"],
    queryFn: () => fetchClients(),
  });

  const mutation = useMutation({
    mutationFn: (payload: CreateClientInput) => saveClient({ data: payload }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["clients"] });
      toast.success("Cliente cadastrado com sucesso!");
    },
    onError: (error: unknown) => {
      toast.error(rpcErrorMessage(error as RpcError, "Erro ao cadastrar cliente"));
    },
  });

  return {
    ...query,
    createClient: mutation.mutateAsync,
    mutateAsync: mutation.mutateAsync,
    isCreating: mutation.isPending,
    isPending: mutation.isPending,
  };
}
