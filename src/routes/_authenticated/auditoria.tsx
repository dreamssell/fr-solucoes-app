import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, useMemo } from "react";
import { Search, ShieldAlert, Clock, Database, User } from "lucide-react";
import { AppShell, PageHeader } from "@/components/fr/AppShell";
import { Input } from "@/components/ui/input";
import { getAuditEvents } from "@/lib/audit.functions";
import { formatDate } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/auditoria")({
  head: () => ({
    meta: [
      { title: "Auditoria — FR Financeiro" },
      {
        name: "description",
        content: "Logs de auditoria e ações realizadas no sistema.",
      },
    ],
  }),
  component: Auditoria,
});

function Auditoria() {
  const fetchAuditEvents = useServerFn(getAuditEvents);
  const [busca, setBusca] = useState("");

  const { data: events, isLoading, error } = useQuery({
    queryKey: ["auditEvents"],
    queryFn: () => fetchAuditEvents(),
  });

  const filteredEvents = useMemo(() => {
    if (!events) return [];
    return events.filter(
      (ev) =>
        busca.trim() === "" ||
        ev.action.toLowerCase().includes(busca.toLowerCase()) ||
        (ev.entity_table && ev.entity_table.toLowerCase().includes(busca.toLowerCase())) ||
        (ev.actor_user_id && ev.actor_user_id.toLowerCase().includes(busca.toLowerCase())),
    );
  }, [events, busca]);

  return (
    <AppShell>
      <PageHeader
        title="Logs de Auditoria"
        description="Rastreamento de ações críticas e operações realizadas no sistema."
      />

      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por ação, tabela ou ID do ator..."
          className="pl-9"
        />
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        {isLoading ? (
          <div className="flex h-48 items-center justify-center">
            <span className="text-sm text-muted-foreground">Carregando logs...</span>
          </div>
        ) : error ? (
          <div className="flex h-48 items-center justify-center text-destructive gap-2">
            <ShieldAlert className="h-5 w-5" />
            <span className="text-sm">Erro ao carregar logs de auditoria ou acesso negado.</span>
          </div>
        ) : filteredEvents.length === 0 ? (
          <div className="flex h-48 items-center justify-center">
            <span className="text-sm text-muted-foreground">Nenhum evento registrado.</span>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-graphite/40 text-xs font-bold uppercase tracking-wider text-muted-foreground border-b border-border">
                <tr>
                  <th className="p-4">Data/Hora</th>
                  <th className="p-4">Ação</th>
                  <th className="p-4">Tabela</th>
                  <th className="p-4">Ator ID</th>
                  <th className="p-4">Detalhes (Payload)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredEvents.map((ev) => (
                  <tr key={ev.id} className="hover:bg-graphite/20 transition-colors">
                    <td className="p-4 whitespace-nowrap text-muted-foreground font-mono text-xs">
                      <div className="flex items-center gap-1.5">
                        <Clock className="h-3.5 w-3.5 text-gold/60" />
                        {formatDate(ev.created_at)}
                      </div>
                    </td>
                    <td className="p-4 whitespace-nowrap font-bold text-foreground">
                      <span className="rounded bg-gold/10 px-2 py-0.5 text-xs text-gold border border-gold/20">
                        {ev.action}
                      </span>
                    </td>
                    <td className="p-4 whitespace-nowrap text-muted-foreground font-mono text-xs">
                      <div className="flex items-center gap-1.5">
                        <Database className="h-3.5 w-3.5" />
                        {ev.entity_table}
                      </div>
                    </td>
                    <td className="p-4 whitespace-nowrap text-muted-foreground font-mono text-xs max-w-[120px] truncate" title={ev.actor_user_id || "Sistema"}>
                      <div className="flex items-center gap-1.5">
                        <User className="h-3.5 w-3.5" />
                        {ev.actor_user_id ? ev.actor_user_id.slice(0, 8) + "..." : "Sistema"}
                      </div>
                    </td>
                    <td className="p-4 text-xs font-mono text-muted-foreground max-w-xs truncate" title={JSON.stringify(ev.payload)}>
                      {JSON.stringify(ev.payload)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AppShell>
  );
}
