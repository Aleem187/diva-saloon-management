import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { supabasePublishableKey, supabaseUrl } from "@/lib/env";

/**
 * Runs before every matched request.
 *
 * Two jobs:
 *   1. Refresh the Supabase session and write the rotated cookies onto the
 *      response, so Server Components (which cannot set cookies) always see a
 *      valid session.
 *   2. A coarse signed-in / signed-out gate on route groups.
 *
 * This is a convenience gate, not the security boundary. Role checks live in
 * `@/lib/auth/session` and the real enforcement is Row Level Security in
 * Postgres -- a request that slips past here still cannot read another tenant.
 */

/** Routes reachable without a session. */
const PUBLIC_PATHS = ["/login", "/signup", "/forgot-password"];

/**
 * Auth plumbing that must stay reachable in both states, and the Stripe webhook:
 * Stripe has no session, and the route authenticates by verifying the request's
 * signature instead.
 *
 * `/reset-password` is here, not in PUBLIC_PATHS, because a recovery link signs
 * the person in BEFORE sending them there: a signed-out-only route would bounce
 * them to the dashboard and they could never set the new password. The page
 * itself says "link expired" when there is no session.
 */
const ALWAYS_ALLOWED_PREFIXES = ["/auth/", "/api/stripe/webhook", "/reset-password"];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export async function proxy(request: NextRequest) {
  /*
   * Hand the path to Server Components. A layout cannot see the URL, and the
   * billing gate in the dashboard layout has to let the Billings page through
   * while it redirects everything else. Convenience only, never a decision:
   * the layout is what enforces.
   *
   * The headers are copied at the moment each response is made, not once up
   * front: refreshing the session rewrites the request's cookies, and those
   * rotated cookies must be what the Server Components see.
   */
  const forward = () => {
    const headers = new Headers(request.headers);
    headers.set("x-pathname", request.nextUrl.pathname);
    return NextResponse.next({ request: { headers } });
  };

  let response = forward();

  const supabase = createServerClient(supabaseUrl(), supabasePublishableKey(), {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = forward();
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
        // Responses that set auth cookies must never be cached by a CDN,
        // or one user's token could be served to another.
        for (const [key, value] of Object.entries(headers)) {
          response.headers.set(key, value);
        }
      },
    },
  });

  /*
   * Who is this? Answered here from the token itself.
   *
   * getClaims() refreshes an expired session (that is what writes the rotated
   * cookies above, and it must run on every request) and then verifies the access
   * token's signature LOCALLY against the project's published public keys. This
   * project signs with ES256, so there is no call to the Auth server on the hot
   * path: the keys are fetched once and cached. (A project still on the older
   * shared-secret signing would fall back to asking the server, losing the
   * saving but not the correctness.)
   *
   * What a local check cannot know is whether the Auth server has since revoked
   * the session, or whether the login has been switched off. That is fine here
   * because this gate is a convenience, not the boundary: every page and Server
   * Action still calls getUser() in getSessionContext(), which asks the server,
   * and a request that fails it is sent to /auth/session-ended, which signs it
   * out. Without that step a revoked-but-unexpired token would bounce between
   * /login (this file sends signed-in visitors away from it) and /dashboard.
   */
  const { data: claimsData } = await supabase.auth.getClaims();
  const user = claimsData?.claims?.sub ? { id: claimsData.claims.sub } : null;

  const { pathname } = request.nextUrl;

  if (ALWAYS_ALLOWED_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
    return response;
  }

  if (!user && !isPublicPath(pathname)) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/login";
    redirectUrl.search = "";
    // Remember where they were headed so login can send them back.
    if (pathname !== "/") redirectUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(redirectUrl);
  }

  if (user && isPublicPath(pathname)) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/dashboard";
    redirectUrl.search = "";
    return NextResponse.redirect(redirectUrl);
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Everything except static assets and image files -- without this the auth
     * check would also run for CSS, JS and images and block them from loading.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
