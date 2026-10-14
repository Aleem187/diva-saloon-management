import "server-only";

import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";

import {
  claimTeamSession,
  TEAM_SESSION_COOKIE,
  teamEndedHref,
  type TeamEndedReason,
} from "@/lib/auth/team-login";
import { createClient } from "@/lib/supabase/server";
import type {
  AppModule,
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
 * The signed-in user's profile and salon, or null.
 *
 * Both reads go through the RLS-bound server client, so the salon returned is
 * by construction the caller's own -- there is no code path here that could
 * select a different tenant.
 *
 * `cache()` de-duplicates this within a single request/render pass.
 */
export const getSessionContext = cache(async (): Promise<SessionContext | null> => {
  const supabase = await createClient();

  // getUser() revalidates the JWT against Supabase Auth. Never trust
  // getSession() for authorisation -- its contents are not verified.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  // No profile, or a deactivated one: no tenant, therefore no access.
  if (!profile || !profile.is_active) return null;

  /*
   * Everything the profile points at, fetched together. These four depend only
   * on the profile, not on one another, and this runs on EVERY dashboard
   * request, so reading them one after another (as this once did) was two extra
   * database round trips on every click. Whether the login is the shared team
   * login decides below whether the session is checked against its device limit.
   */
  const [{ data: salon }, { data: teamLogin }, { data: role }, { data: grants }] =
    await Promise.all([
      supabase.from("salons").select("*").eq("id", profile.salon_id).maybeSingle(),
      supabase.from("team_logins").select("*").eq("profile_id", user.id).maybeSingle(),
      profile.role_id
        ? supabase.from("roles").select("*").eq("id", profile.role_id).maybeSingle()
        : Promise.resolve({ data: null }),
      profile.role_id
        ? supabase.from("role_modules").select("module").eq("role_id", profile.role_id)
        : Promise.resolve({ data: [] as { module: AppModule }[] }),
    ]);

  if (!salon) return null;

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

  return {
    userId: user.id,
    email: user.email ?? profile.email,
    profile,
    salon,
    teamMemberId: profile.team_member_id,
    role: (role as RoleRow | null) ?? null,
    modules,
    isOwner,
    teamLogin: (teamLogin as TeamLoginRow | null) ?? null,
  };
});

/** Require any signed-in, active member of a salon. */
export async function requireSession(): Promise<SessionContext> {
  const session = await getSessionContext();
  if (!session) redirect("/login");
  return session;
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
