import { NextResponse, type NextRequest } from "next/server";

import {
  isTeamLoginUser,
  releaseTeamSession,
  TEAM_SESSION_COOKIE,
} from "@/lib/auth/team-login";
import { createClient } from "@/lib/supabase/server";

/** POST-only sign out, so a stray link preview cannot end a session. */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const response = NextResponse.redirect(new URL("/login", request.nextUrl.origin), {
    status: 303,
  });

  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user && (await isTeamLoginUser(supabase, user.id))) {
      // Several people share this account. Signing out must end THIS device only
      // -- the default global sign-out would end everyone's -- and free its place.
      await releaseTeamSession(supabase, request.cookies.get(TEAM_SESSION_COOKIE)?.value);
      await supabase.auth.signOut({ scope: "local" });
      response.cookies.delete(TEAM_SESSION_COOKIE);
      return response;
    }

    await supabase.auth.signOut();
  } catch (error) {
    // Whatever failed, the person asked to leave: end this device's session and
    // go to the sign-in page. "local" because if we could not tell whether this
    // is the shared login, ending everyone's session would be the wrong guess.
    console.error("[sign-out] failed, ending this device's session only:", error);
    try {
      await supabase.auth.signOut({ scope: "local" });
    } catch {
      /* nothing more can be done from here */
    }
    response.cookies.delete(TEAM_SESSION_COOKIE);
  }

  return response;
}
