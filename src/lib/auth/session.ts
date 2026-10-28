import "server-only";

import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";

import { BRANCH_COOKIE, isUuid } from "@/lib/branches";
import {
  claimTeamSession,
  TEAM_SESSION_COOKIE,
  teamEndedHref,
  type TeamEndedReason,
} from "@/lib/auth/team-login";
import { createClient } from "@/lib/supabase/server";
import type {
  AppModule,
  BranchRow,
  ProfileRow,
  RoleRow,
  SalonRow,
  TeamLoginRow,
  UserRole,
} from "@/lib/types/database";

export interface SessionContext {
  userId: string;
  email: string;
  profile: ProfileRow;
  salon: SalonRow;
  /**
   * Who this login is on the roster, or null.
   *
   * Since the Team/User split these are two different identities: `userId` is
   * the account that performs actions, `teamMemberId` is the person who
   * performs services. Anything asking "are these my appointments / my
   * earnings?" means the second one.
   */
  teamMemberId: string | null;
  /** The role this login holds, or null for an account with none yet. */
  role: RoleRow | null;
  /** What that role may reach. The owner's set is every module. */
  modules: Set<AppModule>;
  /** Owner of this salon: holds everything, and cannot be assigned. */
  isOwner: boolean;
  /** Set when this login is the salon's shared team login (its sessions are capped). */
  teamLogin: TeamLoginRow | null;
  /**
   * The branches this login can see: every one for an owner, only its own for
   * anyone else (Row Level Security decides, not this code).
   */
  branches: BranchRow[];
  /** The branch this login is assigned to; null for an owner (every branch). */
  branch: BranchRow | null;
  /**
   * The branch an owner has chosen in the top bar, or null for "All branches".
   * Always null for a login assigned to a branch: theirs is fixed.
   */
  activeBranch: BranchRow | null;
  /**
   * The branch whose data is on screen: the assigned one, else the chosen one,
   * else null (everything). What staff lists and forms should be narrowed to.
   */
  scopeBranchId: string | null;
}

/** Every module, for the owner -- who holds all of them by definition. */
const ALL_MODULES: AppModule[] = [
  "calendar",
  "customers",
  "pos",
  "services",
  "payroll",
  "reports",
  "team",
  "audit",
  "settings",
];

/**
 * Where a request stands:
 *   ok          a valid Auth user with an active profile in a salon
 *   anonymous   no valid Auth user (none, or a token the Auth server refuses)
 *   inactive    a valid Auth user with nothing to sign in to: no profile or
 *               salon, or a deactivated profile
 *
 * The last two were once both "null", and that conflation is what made a
 * deactivated login bounce between /dashboard and /login for ever: the proxy
 * sees a valid session and sends it away from /login, the dashboard sees no
 * usable account and sends it to /login. Telling them apart lets each be sent
 * somewhere that actually ends the loop (`/auth/session-ended`).
 */
export type SessionState =
  | { status: "ok"; session: SessionContext }
  | { status: "anonymous" }
  | { status: "inactive" };

/** Where to send someone who is signed in to Auth but has no usable session. */
export function sessionEndedHref(reason: "inactive" | "expired"): string {
  return `/auth/session-ended?reason=${reason}`;
}

/**
 * The signed-in user's profile and salon, with the reason when there is none.
 *
 * Both reads go through the RLS-bound server client, so the salon returned is
 * by construction the caller's own -- there is no code path here that could
 * select a different tenant.
 *
 * `cache()` de-duplicates this within a single request/render pass.
 */
export const loadSessionState = cache(async (): Promise<SessionState> => {
  const supabase = await createClient();

  // getUser() revalidates the JWT against Supabase Auth. Never trust
  // getSession() for authorisation -- its contents are not verified.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { status: "anonymous" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  // No profile, or a deactivated one: no tenant, therefore no access.
  if (!profile || !profile.is_active) return { status: "inactive" };

  /*
   * Everything the profile points at, fetched together. These four depend only
   * on the profile, not on one another, and this runs on EVERY dashboard
   * request, so reading them one after another (as this once did) was two extra
   * database round trips on every click. Whether the login is the shared team
   * login decides below whether the session is checked against its device limit.
   */
  const [{ data: salon }, { data: teamLogin }, { data: role }, { data: grants }, { data: branchRows }] =
    await Promise.all([
      supabase.from("salons").select("*").eq("id", profile.salon_id).maybeSingle(),
      supabase.from("team_logins").select("*").eq("profile_id", user.id).maybeSingle(),
      profile.role_id
        ? supabase.from("roles").select("*").eq("id", profile.role_id).maybeSingle()
        : Promise.resolve({ data: null }),
      profile.role_id
        ? supabase.from("role_modules").select("module").eq("role_id", profile.role_id)
        : Promise.resolve({ data: [] as { module: AppModule }[] }),
      supabase.from("branches").select("*").order("created_at"),
    ]);

  if (!salon) return { status: "inactive" };

  /*
   * The shared team login may be signed in on a limited number of devices at
   * once. Every dashboard render and Server Action passes through here, so this
   * is where a device over the limit, or one the owner has signed out, is
   * stopped. It is sent to a handler that signs it out first -- a plain
   * redirect to /login would be bounced straight back by the proxy, because the
   * session is still live. A missing cookie counts as ended: the only way to
   * hold one is to have signed in through the sign-in form.
   */
  if (teamLogin) {
    /*
     * The check can fail in ways that are not "this device is refused" -- a
     * dropped connection, an unreadable cookie store. Those must not become a
     * crashed page, and must not read as permission either: they end the
     * session cleanly with their own message. The redirect is made OUTSIDE the
     * try, because redirect() works by throwing.
     */
    let outcome: "ok" | TeamEndedReason = "missing";
    try {
      const key = (await cookies()).get(TEAM_SESSION_COOKIE)?.value;
      if (key) {
        const userAgent = (await headers()).get("user-agent") ?? "";
        const claimed = await claimTeamSession(supabase, key, userAgent);
        outcome = claimed === "ok" || claimed === "not_team" ? "ok" : claimed;
      }
    } catch (error) {
      console.error("[team-login] checking the session failed:", error);
      outcome = "error";
    }
    if (outcome !== "ok") redirect(teamEndedHref(outcome));
  }

  /*
   * The role and its modules, read once per request.
   *
   * This mirrors `has_module()` in Postgres, which is where access is actually
   * enforced. Nothing here is the security boundary -- it decides which links
   * to draw and which pages to bounce, and the database refuses the rest
   * regardless.
   */
  const isOwner = Boolean((role as RoleRow | null)?.is_owner);
  const modules = new Set<AppModule>(
    isOwner ? ALL_MODULES : ((grants ?? []) as { module: AppModule }[]).map((g) => g.module),
  );

  const branches = (branchRows ?? []) as BranchRow[];
  const assigned = profile.branch_id ? (branches.find((b) => b.id === profile.branch_id) ?? null) : null;
  // The owner's choice, honoured only if it names an open branch of this salon.
  const chosenId = (await cookies()).get(BRANCH_COOKIE)?.value;
  const activeBranch =
    !profile.branch_id && isUuid(chosenId)
      ? (branches.find((b) => b.id === chosenId && b.is_active) ?? null)
      : null;

  return {
    status: "ok",
    session: {
      userId: user.id,
      email: user.email ?? profile.email,
      profile,
      salon,
      teamMemberId: profile.team_member_id,
      role: (role as RoleRow | null) ?? null,
      modules,
      isOwner,
      teamLogin: (teamLogin as TeamLoginRow | null) ?? null,
      branches,
      branch: assigned,
      activeBranch,
      scopeBranchId: assigned?.id ?? activeBranch?.id ?? null,
    },
  };
});

/** The session, or null. For pages that show something else when there is none. */
export async function getSessionContext(): Promise<SessionContext | null> {
  const state = await loadSessionState();
  return state.status === "ok" ? state.session : null;
}

/** Require any signed-in, active member of a salon. */
export async function requireSession(): Promise<SessionContext> {
  const state = await loadSessionState();
  if (state.status === "ok") return state.session;

  /*
   * Never straight to /login. The proxy only checks that a token is well-formed
   * and signed, so anyone who reaches here with no usable session (a switched-off
   * login, a token the Auth server has since revoked) still looks signed in to
   * it and would be sent straight back. /auth/session-ended signs them out first.
   */
  redirect(sessionEndedHref(state.status === "inactive" ? "inactive" : "expired"));
}

/**
 * Require one of the given roles.
 *
 * Kept for the few places that genuinely mean a job title rather than a
 * permission. Prefer `requireModule()`: since Phase 7b a salon defines its own
 * roles, so "is this person a receptionist?" is rarely the question worth
 * asking -- "may they take payment?" is.
 */
export async function requireRole(...roles: UserRole[]): Promise<SessionContext> {
  const session = await requireSession();
  if (!roles.includes(session.profile.role)) redirect("/dashboard?denied=1");
  return session;
}

/**
 * Require a module.
 *
 * The page-level counterpart of `has_module()` in the database. Bouncing here
 * is a courtesy -- it shows a clear refusal instead of an empty page -- and
 * the policies would return nothing anyway.
 */
export async function requireModule(module: AppModule): Promise<SessionContext> {
  const session = await requireSession();
  if (!session.modules.has(module)) redirect("/dashboard?denied=1");
  return session;
}

/** Areas that are the salon owner's alone, rather than a delegated module. */
export async function requireOwner(): Promise<SessionContext> {
  const session = await requireSession();
  if (!session.isOwner) redirect("/dashboard?denied=1");
  return session;
}

/**
 * Module check for use inside Server Actions, where a redirect would swallow
 * the error. Throws instead, so the action can return a message to the form.
 */
export function assertModule(session: SessionContext, module: AppModule): void {
  if (!session.modules.has(module)) {
    throw new Error("Your role does not include this.");
  }
}

/**
 * Role check for use inside Server Actions.
 *
 * "owner" here means the salon's owner role, not the legacy enum -- so a
 * custom role can never satisfy it by being named "Owner".
 */
export function assertRole(session: SessionContext, ...roles: UserRole[]): void {
  if (roles.includes("owner") && session.isOwner) return;
  if (!roles.includes(session.profile.role)) {
    throw new Error("You do not have permission to perform this action.");
  }
}

export const ROLE_LABELS: Record<UserRole, string> = {
  owner: "Owner / Admin",
  staff: "Staff / Therapist",
  receptionist: "Receptionist",
};

export const ROLE_DESCRIPTIONS: Record<UserRole, string> = {
  owner: "Full access, including staff, payroll, reporting, audit log and billing.",
  staff: "Own schedule, own appointments and consent forms, own commission history.",
  receptionist: "Bookings, customer profiles, consent forms and POS receipts.",
};
