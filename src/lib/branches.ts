/*
 * Branch helpers shared by server and client code. A plain module (no
 * "use client", no server-only imports): CLAUDE.md rule 9.
 *
 * The owner's choice in the top bar ("All branches" or one branch) is kept in a
 * cookie and sent to the database on every request as a header. Postgres reads
 * it (request.headers) and uses it ONLY to narrow what an owner sees; a login
 * assigned to a branch is limited to that branch by Row Level Security whatever
 * is sent. See migration 20261021000046_branches.
 */

import type { BranchRow } from "@/lib/types/database";

export const BRANCH_COOKIE = "branch";
export const BRANCH_HEADER = "x-branch-id";
/** The select's value for "no branch chosen": the whole salon. */
export const ALL_BRANCHES = "all";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (value: unknown): value is string =>
  typeof value === "string" && UUID.test(value);

/**
 * Only the people who work at the branch being looked at. For a login tied to a
 * branch that is its own; for an owner it is the branch chosen in the top bar,
 * or everyone when none is. (The database refuses a booking against another
 * branch's person either way; this just stops the form offering one.)
 */
export function staffInScope<T extends { branch_id: string }>(
  team: T[],
  scope: { branchId: string | null },
): T[] {
  return scope.branchId ? team.filter((member) => member.branch_id === scope.branchId) : team;
}

/** "Salon · Branch" for a heading, naming the branch only when there is a choice of them. */
export function branchLabel(branch: BranchRow | null, branchCount: number): string | null {
  return branch && branchCount > 1 ? branch.name : null;
}
