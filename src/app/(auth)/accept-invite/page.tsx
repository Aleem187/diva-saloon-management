import type { Metadata } from "next";

import { AcceptInviteForm } from "./accept-invite-form";
import { AuthCard } from "@/components/auth-shell";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Flash } from "@/components/ui/flash";
import { getSessionContext, ROLE_LABELS } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Accept your invitation" };

export default async function AcceptInvitePage() {
  // The invite link verifies an OTP before landing here, so an accepted
  // invitation already has a session, a profile, a salon and a role.
  const session = await getSessionContext();

  if (!session) {
    return (
      <AuthCard title="This invitation link is no longer valid">
        <Flash tone="error" className="mb-5">
          Invitation links expire after 7 days. Ask your salon owner to send a new one.
        </Flash>
        <ButtonLink href="/login" className="w-full">
          Go to sign in
        </ButtonLink>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title={`Join ${session.salon.name}`}
      subtitle="Set a password to finish setting up your login."
    >
      <Card padding="none" className="mb-[18px] flex items-center gap-3 bg-head p-3.5">
        <span
          aria-hidden
          className="grid size-11 flex-none place-items-center rounded-xl bg-soft font-heading font-bold text-accent-d"
        >
          {session.salon.name.charAt(0).toUpperCase()}
        </span>
        <div className="min-w-0">
          <p className="truncate font-semibold">{session.salon.name}</p>
          <p className="text-small text-muted">
            You&rsquo;ve been invited as{" "}
            <strong>{session.role?.name ?? ROLE_LABELS[session.profile.role]}</strong>
          </p>
        </div>
      </Card>

      <AcceptInviteForm defaultName={session.profile.full_name} />
    </AuthCard>
  );
}
