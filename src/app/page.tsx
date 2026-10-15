import { redirect } from "next/navigation";

import { loadSessionState, sessionEndedHref } from "@/lib/auth/session";

export default async function RootPage() {
  const state = await loadSessionState();
  if (state.status === "ok") redirect("/dashboard");
  // Signed in to Auth with nothing to sign in to: end the session rather than
  // bounce between here and /login.
  if (state.status === "inactive") redirect(sessionEndedHref("inactive"));
  redirect("/login");
}
