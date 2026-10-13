import type { Metadata } from "next";

import { AuthCallback } from "./auth-callback";
import { AuthShell } from "@/components/auth-shell";
import { Card } from "@/components/ui/card";

export const metadata: Metadata = { title: "Signing you in" };

/**
 * Where every emailed auth link lands.
 *
 * WHY THIS IS A CLIENT PAGE AND NOT A ROUTE HANDLER. Supabase's default email
 * templates point at GoTrue's own `/auth/v1/verify`, which verifies the token
 * and then redirects the browser here with the session in a URL FRAGMENT:
 *
 *     /auth/callback#access_token=...&refresh_token=...&type=invite
 *
 * A fragment is never sent to the server. No route handler, proxy or server
 * component can see it, however it is written -- so the exchange has to happen
 * in the browser. `/auth/confirm` was a route handler expecting `token_hash`
 * in the query string, which is what a CUSTOMISED template produces; against
 * the default template it saw an empty query and sent everyone to
 * "Invalid or incomplete link".
 *
 * It handles all three shapes, so it works whether or not the email templates
 * are ever customised.
 *
 * This route lives under /auth alongside the confirm handler, which is not in
 * the (auth) route group, so it wraps itself in the same `AuthShell` the group
 * layout uses.
 */
export default function AuthCallbackPage() {
  return (
    <AuthShell>
      <Card padding="lg">
        <AuthCallback />
      </Card>
    </AuthShell>
  );
}
