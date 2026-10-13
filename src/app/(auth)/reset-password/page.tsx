import type { Metadata } from "next";

import { ResetPasswordForm } from "./reset-password-form";
import { AuthCard } from "@/components/auth-shell";
import { ButtonLink } from "@/components/ui/button";
import { Flash } from "@/components/ui/flash";
import { getSessionContext } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Choose a new password" };

export default async function ResetPasswordPage() {
  // The emailed link signs the person in and then lands here, so a reset in
  // progress always has a session. Without one the link was used or has expired.
  const session = await getSessionContext();

  if (!session) {
    return (
      <AuthCard title="This reset link is no longer valid">
        <Flash tone="error" className="mb-5">
          Reset links work once and expire after a while. Request a new one and use it straight
          away.
        </Flash>
        <ButtonLink href="/forgot-password" className="w-full">
          Request a new link
        </ButtonLink>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Choose a new password" subtitle={`Signed in as ${session.email}.`}>
      <ResetPasswordForm />
    </AuthCard>
  );
}
