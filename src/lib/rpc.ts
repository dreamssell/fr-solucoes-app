export type RpcError =
  { message?: string; code?: string; details?: string; hint?: string } | null | undefined;

/** Converte um erro de RPC/PostgREST em uma mensagem útil para a interface. */
export function rpcErrorMessage(
  error: RpcError,
  fallback = "Ocorreu um erro inesperado. Tente novamente.",
): string {
  if (!error) return fallback;
  const code = error.code ?? "";
  const raw = (error.message ?? "").trim();

  if (code === "42501" || /permission denied|row-level security|not authorized/i.test(raw)) {
    return "Você não tem permissão para executar esta operação.";
  }
  if (code === "23505" || /duplicate key/i.test(raw)) {
    return "Esta operação já foi registrada anteriormente.";
  }
  if (code === "23503") {
    return "Registro relacionado não encontrado. Atualize a página e tente novamente.";
  }
  if (code === "PGRST202" || /could not find the function/i.test(raw)) {
    return "Operação indisponível no servidor. Contate o suporte.";
  }
  if (/failed to fetch|network/i.test(raw)) {
    return "Falha de conexão com o servidor. Verifique sua internet.";
  }
  return raw || fallback;
}

export class RpcCallError extends Error {
  readonly fn: string;
  readonly code?: string;
  constructor(fn: string, error: RpcError) {
    super(rpcErrorMessage(error));
    this.name = "RpcCallError";
    this.fn = fn;
    if (error?.code) this.code = error.code;
  }
}

// Compatível com o cliente Supabase gerado (nomes de RPC tipados) e com stubs de teste.
type MinimalRpcClient = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rpc: (fn: any, args?: any) => PromiseLike<{ data: any; error: RpcError }>;
};

/** Chama uma RPC lançando erro tratável (mensagem pronta para exibir na UI). */
export async function callRpc<T = unknown>(
  client: MinimalRpcClient,
  fn: string,
  args: Record<string, unknown> = {},
): Promise<T> {
  const { data, error } = await client.rpc(fn, args);
  if (error) throw new RpcCallError(fn, error);
  return data as T;
}
