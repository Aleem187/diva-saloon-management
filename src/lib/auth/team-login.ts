import "server-only";

import { createHash, randomBytes } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, TeamSessionOutcome } from "@/lib/types/database";

/*
 * The team login's per-device session key.
 *
 * Each device that signs in with the shared login is handed a random key in an
 * httpOnly cookie. The database stores only its SHA-256 and counts the live
 * ones (claim_team_session), which is how "at most 3 at once" is enforced.
 * Policy lives in migration 20261014000041; this file is the app's half.
 */

export const TEAM_SESSION_COOKIE = "team_session";

/** Why a team device was turned away. A fixed set: it travels in a URL. */
export type TeamEndedReason = "limit" | "revoked" | "missing";

export const TEAM_ENDED_MESSAGES: Record<TeamEndedReason, string> = {
  limit:
    "The team login is already in use on 3 devices, which is the most it allows. Sign out of one of them, or ask the owner to sign a device out, then try again.",
  revoked: "The owner signed this device out of the team login. Sign in again to continue.",
  missing: "Your team login session ended. Sign in again to continue.",
};

export function isTeamEndedReason(value: unknown): value is TeamEndedReason {
  return value === "limit" || value === "revoked" || value === "missing";
}

/** Where a refused team device is sent: a handler that signs it out, then explains. */
export function teamEndedHref(reason: TeamEndedReason): string {
  return `/auth/team-ended?reason=${reason}`;
}

export function newSessionKey(): string {
  return randomBytes(32).toString("base64url");
}

export function hashSessionKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

export const TEAM_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
  path: "/",
  // The row, not the cookie, decides whether a session still counts.
  maxAge: 60 * 60 * 24 * 30,
} as const;

type Client = SupabaseClient<Database>;

/** Ask the database whether this device holds a place. */
export async function claimTeamSession(
  supabase: Client,
  key: string,
  userAgent: string,
): Promise<TeamSessionOutcome> {
  const { data, error } = await supabase.rpc("claim_team_session", {
    p_key_hash: hashSessionKey(key),
    p_user_agent: userAgent,
  });

  // If the check itself fails, fail CLOSED: an unreadable answer must not read
  // as permission to use a shared login that is meant to be capped.
  if (error || !data) return "limit";
  return data;
}

/** Free this device's place. Quietly does nothing for anyone who is not the team login. */
export async function releaseTeamSession(supabase: Client, key: string | undefined): Promise<void> {
  if (!key) return;
  await supabase.rpc("release_team_session", { p_key_hash: hashSessionKey(key) });
}

/** Is the signed-in user the team login? (RLS lets the team login read its own row.) */
export async function isTeamLoginUser(supabase: Client, userId: string): Promise<boolean> {
  const { data } = await supabase
    .from("team_logins")
    .select("profile_id")
    .eq("profile_id", userId)
    .maybeSingle();
  return Boolean(data);
}

/**
 * A compact "Chrome on Windows" from a user-agent string, for the owner's list
 * of devices. Display only; unrecognised agents fall back to a short prefix.
 */
export function describeDevice(userAgent: string): string {
  if (!userAgent) return "Unknown device";
  const browser =
    /Edg\//.test(userAgent)
      ? "Edge"
      : /OPR\/|Opera/.test(userAgent)
        ? "Opera"
        : /Firefox\//.test(userAgent)
          ? "Firefox"
          : /Chrome\//.test(userAgent)
            ? "Chrome"
            : /Safari\//.test(userAgent)
              ? "Safari"
              : null;
  const system = /iPhone|iPad/.test(userAgent)
    ? "iOS"
    : /Android/.test(userAgent)
      ? "Android"
      : /Windows/.test(userAgent)
        ? "Windows"
        : /Mac OS X|Macintosh/.test(userAgent)
          ? "macOS"
          : /Linux/.test(userAgent)
            ? "Linux"
            : null;
  if (browser && system) return `${browser} on ${system}`;
  return browser ?? system ?? userAgent.slice(0, 40);
}
