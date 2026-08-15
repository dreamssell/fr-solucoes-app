/** Regra de UI para exibir controles de decisão de aprovação. O banco continua a autoridade final. */
export type ActorRole = "owner" | "manager" | "employee" | null | undefined;

export interface DecisionActor {
  userId: string;
  role: ActorRole;
}

export interface DecisionRequest {
  requested_by: string | null;
}

export function canDecideApproval(
  me: DecisionActor | null | undefined,
  request: DecisionRequest,
): boolean {
  if (!me) return false;
  if (me.role !== "owner" && me.role !== "manager") return false;
  if (request.requested_by && request.requested_by === me.userId) return false;
  return true;
}

export function decisionBlockedMessage(
  me: DecisionActor | null | undefined,
  request: DecisionRequest,
): string | null {
  if (canDecideApproval(me, request)) return null;
  if (me && request.requested_by && request.requested_by === me.userId) {
    return "Você não pode aprovar a própria solicitação.";
  }
  return "Você não tem permissão para decidir.";
}
