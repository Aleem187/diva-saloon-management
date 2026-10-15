import { NextResponse, type NextRequest } from "next/server";

import { loadSessionState } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

const MESSAGES = {
  inactive:
    "This login has been switched off. Ask the salon owner to turn it back on, then sign in again.",
  expired: "Your session has ended. Please sign in again.",
} as const;

/**
 * Where someone lands who is signed in to Auth but has no usable session: a
 * deactivated login, a login with no salon, or a token the Auth server has
 * since revoked.
 *
 * It ends the session and THEN shows the sign-in page. Redirecting straight to
 * /login does not work, because the proxy sends anyone with a valid-looking
 * session away from /login again, and the dashboard sends them back: an endless
 * loop. Clearing the session is what breaks it.
 *
 * It only ever signs out a session that really is unusable. If this session
 * turns out to be fine, the visitor is sent on to the dashboard instead, so a
 * crafted link cannot be used to log someone out.
 */
export async function GET(request: NextRequest) {
  const state = await loadSessionState();
  if (state.status === "ok") {
    return NextResponse.redirect(new URL("/dashboard", request.nextUrl.origin));
  }

  const destination = new URL("/login", request.nextUrl.origin);
  // The words come from what the check found, never from the link: nothing in the
  // URL is shown to the visitor.
  destination.searchParams.set(
    "error",
    MESSAGES[state.status === "inactive" ? "inactive" : "expired"],
  );
  const response = NextResponse.redirect(destination);

  try {
    // "local": this device only. The login may be in use elsewhere (a shared
    // account, or a person on two devices) and that is not this request's call.
    await (await createClient()).auth.signOut({ scope: "local" });
  } catch (error) {
    console.error("[session-ended] sign-out failed, clearing the cookies directly:", error);
  }

  // Belt and braces: if the Auth server would not answer (a revoked session
  // often will not), the cookies must still go, or the loop is back.
  for (const { name } of request.cookies.getAll()) {
    if (name.startsWith("sb-")) response.cookies.delete(name);
  }
  return response;
}
