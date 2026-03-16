import { TRPCError, initTRPC } from "@trpc/server";
import superjson from "superjson";
import { type Context } from "./context";

const FRIENDLY_MESSAGES: Partial<Record<string, string>> = {
  FORBIDDEN: "You don't have permission to perform this action. Please contact your admin for access.",
  UNAUTHORIZED: "You need to sign in to continue.",
  NOT_FOUND: "The requested resource was not found.",
};

const t = initTRPC.context<Context>().create({
  transformer: superjson,
  errorFormatter({ shape, error }) {
    const hasCustomMessage = error.message !== error.code;
    return {
      ...shape,
      message: hasCustomMessage
        ? error.message
        : FRIENDLY_MESSAGES[error.code] ?? shape.message,
    };
  },
});

export const router = t.router;
export const publicProcedure = t.procedure;
export const middleware = t.middleware;

const enforceUserIsAuthed = middleware(async ({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }
  return next({
    ctx: {
      user: ctx.user,
    },
  });
});

export const protectedProcedure = t.procedure.use(enforceUserIsAuthed);

/* ------------------------------------------------------------------ */
/*  RBAC helpers                                                       */
/* ------------------------------------------------------------------ */

export type MemberRole = "OWNER" | "ADMIN" | "MEMBER" | "VIEWER";

const ROLE_HIERARCHY: Record<MemberRole, number> = {
  VIEWER: 0,
  MEMBER: 1,
  ADMIN: 2,
  OWNER: 3,
};

export function hasMinRole(actual: MemberRole, required: MemberRole): boolean {
  return ROLE_HIERARCHY[actual] >= ROLE_HIERARCHY[required];
}

export function assertMinRole(actual: MemberRole, required: MemberRole): void {
  if (!hasMinRole(actual, required)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: `You need at least ${required} permission to perform this action. Your current role is ${actual}.`,
    });
  }
}

/**
 * Look up the caller's org membership. Returns null if not a member.
 */
export async function getOrgMembership(
  supabase: Context["supabase"],
  organizationId: string,
  userId: string,
) {
  const { data } = await supabase
    .from("organization_members")
    .select("role")
    .eq("workspaceId", organizationId)
    .eq("userId", userId)
    .single();

  return data as { role: MemberRole } | null;
}

/**
 * Check if a user has access to a specific project.
 * If project_members has not been populated yet (no entries), all org
 * members have access. Once entries exist, only listed users may access.
 */
export async function hasProjectAccess(
  supabase: Context["supabase"],
  projectId: string,
  userId: string,
): Promise<boolean> {
  const { count } = await supabase
    .from("project_members")
    .select("id", { count: "exact", head: true })
    .eq("projectId", projectId);

  if ((count ?? 0) === 0) return true;

  const { data } = await supabase
    .from("project_members")
    .select("id")
    .eq("projectId", projectId)
    .eq("userId", userId)
    .single();

  return !!data;
}

/**
 * Return the effective role for a user in a project context.
 * Uses the higher of the org role and project-specific role.
 */
export async function getEffectiveProjectRole(
  supabase: Context["supabase"],
  projectId: string,
  userId: string,
  orgRole: MemberRole,
): Promise<MemberRole> {
  const { data: pm } = await supabase
    .from("project_members")
    .select("role")
    .eq("projectId", projectId)
    .eq("userId", userId)
    .single();

  if (!pm) return orgRole;

  const projectRole = pm.role as MemberRole;
  return ROLE_HIERARCHY[projectRole] >= ROLE_HIERARCHY[orgRole]
    ? projectRole
    : orgRole;
}

/**
 * From a list of project IDs, return only those the user can access.
 */
export async function filterAccessibleProjectIds(
  supabase: Context["supabase"],
  projectIds: string[],
  userId: string,
): Promise<string[]> {
  if (projectIds.length === 0) return [];

  const { data: allPm } = await supabase
    .from("project_members")
    .select("projectId, userId")
    .in("projectId", projectIds);

  const pmByProject = new Map<string, Set<string>>();
  for (const pm of allPm ?? []) {
    if (!pmByProject.has(pm.projectId)) {
      pmByProject.set(pm.projectId, new Set());
    }
    pmByProject.get(pm.projectId)!.add(pm.userId);
  }

  return projectIds.filter((pid) => {
    const members = pmByProject.get(pid);
    if (!members || members.size === 0) return true;
    return members.has(userId);
  });
}
