import { NextResponse, type NextRequest } from "next/server";

import {
  isTeamEndedReason,
  isTeamLoginUser,
  releaseTeamSession,
  TEAM_ENDED_MESSAGES,
  TEAM_SESSION_COOKIE,
} from "@/lib/auth/team-login";
import { createClient } from "@/lib/supabase/server";

/**
 * Where a team-login device lands when the dashboard refuses it: over the
 * 3-device limit, signed out by the owner, or its session key lost.
 *
 * It signs the device out BEFORE sending it to /login. Redirecting straight
 * there would not work: the Supabase session is still live, so the proxy would
 * bounce the visitor back to the dashboard, which would refuse them again.
 *
 * It only ever ends the team login's own session (and only on this device), so a
 * crafted link cannot sign anyone else out. The reason is one of three fixed
 * words mapped to fixed text here; nothing from the URL is shown.
 */
export async function GET(request: NextRequest) {
  const reasonParam = request.nextUrl.searchParams.get("reason");
  const reason = isTeamEndedReason(reasonParam) ? reasonParam : "missing";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const destination = new URL("/login", request.nextUrl.origin);
  destination.searchParams.set("error", TEAM_ENDED_MESSAGES[reason]);
  const response = NextResponse.redirect(destination);

  if (user && (await isTeamLoginUser(supabase, user.id))) {
    await releaseTeamSession(supabase, request.cookies.get(TEAM_SESSION_COOKIE)?.value);
    await supabase.auth.signOut({ scope: "local" });
    response.cookies.delete(TEAM_SESSION_COOKIE);
  }

  return response;
}
