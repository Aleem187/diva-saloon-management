import type { SessionContext } from "@/lib/auth/session";

/**
 * The legacy front-desk test: the login's coarse `profile.role` is owner or
 * receptionist. It is NOT a module check, and it does not follow a role change
 * (see decision D1 in docs/redesign-map.md). Pages that have always branched on
 * it keep doing so; new code should ask `session.modules` instead.
 *
 * Not a "use client" module (CLAUDE.md rule 9).
 */
export function isFrontDeskSession(session: SessionContext): boolean {
  return session.profile.role === "owner" || session.profile.role === "receptionist";
}
