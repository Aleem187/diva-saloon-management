import "server-only";

import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

import { BRANCH_COOKIE, BRANCH_HEADER, isUuid } from "@/lib/branches";
import { supabasePublishableKey, supabaseUrl } from "@/lib/env";
import type { Database } from "@/lib/types/database";

/**
 * Request-scoped Supabase client for Server Components, Server Actions and
 * Route Handlers. It carries the user's session cookies, so Row Level Security
 * applies: this client can only reach rows belonging to the caller's salon.
 *
 * This is the client that should be used for essentially all data access.
 */
export async function createClient() {
  const cookieStore = await cookies();

  /*
   * The owner's chosen branch, sent to the database as a header. Postgres uses it
   * only to NARROW what an owner sees (every query and report at once); for a
   * login assigned to a branch it is ignored, and anything that is not a UUID is
   * dropped here and again there. It is not a permission: forging it can only
   * show less.
   */
  const chosen = cookieStore.get(BRANCH_COOKIE)?.value;

  return createServerClient<Database>(supabaseUrl(), supabasePublishableKey(), {
    global: isUuid(chosen) ? { headers: { [BRANCH_HEADER]: chosen } } : undefined,
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Server Components cannot write cookies. That is fine: the proxy
          // (src/proxy.ts) refreshes the session on every request, so the
          // cookies are already up to date by the time we render.
        }
      },
    },
  });
}
