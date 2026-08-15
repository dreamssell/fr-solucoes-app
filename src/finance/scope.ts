/**
 * Regras puras de escopo e autoaprovação do FR Financeiro.
 * O banco (RPCs SECURITY DEFINER + RLS) é a fonte de verdade; estas funções
 * espelham as mesmas regras para a UI e para os testes.
 */

export type ActorRole = "owner" | "manager" | "employee";

export type Actor = {
  userId: string;
  role: ActorRole | null;
  isActive: boolean;
  employeeId: string | null;
  teamIds: string[];
};

export type ScopeDecision = { allowed: boolean; reason?: string };

const deny = (reason: string): ScopeDecision => ({ allowed: false, reason });
const allow: ScopeDecision = { allowed: true };

export type EmployeeLink = {
  id: string;
  role: string | null;
  is_active: boolean | null;
  managed_team_ids: string[] | null;
};

export function resolveActor(input: {
  userId: string;
  isOwnerAccess: boolean;
  employee: EmployeeLink | null;
}): Actor {
  const { userId, isOwnerAccess, employee } = input;

  if (isOwnerAccess) {
    return {
      userId,
      role: "owner",
      isActive: true,
      employeeId: employee?.id ?? null,
      teamIds: employee?.managed_team_ids ?? [],
    };
  }

  if (!employee) {
    return { userId, role: null, isActive: false, employeeId: null, teamIds: [] };
  }

  const role = (["owner", "manager", "employee"] as const).includes(employee.role as ActorRole)
    ? (employee.role as ActorRole)
    : "employee";

  return {
    userId,
    role,
    isActive: employee.is_active === true,
    employeeId: employee.id,
    teamIds: employee.managed_team_ids ?? [],
  };
}

/** Quem pode SOLICITAR (pagamento parcial, empréstimo, renegociação) para uma carteira. */
export function canRequestFor(actor: Actor, targetEmployeeId: string): ScopeDecision {
  if (!actor.isActive || !actor.role) return deny("Usuário sem acesso ativo.");
  if (actor.role === "owner") return allow;
  if (actor.role === "manager") {
    return actor.employeeId === targetEmployeeId || actor.teamIds.includes(targetEmployeeId)
      ? allow
      : deny("Carteira fora da equipe do gerente.");
  }
  return actor.employeeId === targetEmployeeId
    ? allow
    : deny("Acesso restrito à própria carteira.");
}

/** Quem pode DECIDIR (aprovar/rejeitar). Nunca a própria solicitação. */
export function canDecide(
  actor: Actor,
  request: { requestedByUserId: string; targetEmployeeId: string },
): ScopeDecision {
  if (!actor.isActive || !actor.role) return deny("Usuário sem acesso ativo.");
  if (actor.role === "employee") return deny("Funcionário não aprova solicitações.");
  if (actor.userId === request.requestedByUserId) {
    return deny("Não é permitido aprovar a própria solicitação.");
  }
  if (actor.role === "owner") return allow;
  return actor.teamIds.includes(request.targetEmployeeId) ||
    actor.employeeId === request.targetEmployeeId
    ? allow
    : deny("Solicitação fora da equipe do gerente.");
}
