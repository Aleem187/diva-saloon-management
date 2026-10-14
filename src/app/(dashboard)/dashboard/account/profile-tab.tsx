import { AccountForm } from "./account-form";
import { PasswordForm } from "./password-form";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Pill } from "@/components/ui/pill";
import { SidePanel, Split, SplitMain } from "@/components/ui/side-panel";
import { initialsOf } from "@/components/shell-sidebar-parts";
import { requireSession } from "@/lib/auth/session";
import { formatDate } from "@/lib/format";

/** Profile tab: edit your own name and phone, and see who you are signed in as. */
export async function ProfileTab() {
  const session = await requireSession();
  const { profile, salon } = session;
  const name = profile.full_name || session.email;

  return (
    <Split>
      <SplitMain>
        <Card>
          <CardTitle>Personal details</CardTitle>
          <p className="-mt-2 mb-4 text-small text-muted">
            Your name appears on receipts you issue and in the audit log.
          </p>
          <AccountForm
            email={session.email}
            fullName={profile.full_name}
            phone={profile.phone ?? ""}
          />
        </Card>

        <Card className="mt-4">
          <CardTitle>Password</CardTitle>
          {session.teamLogin ? (
            <p className="text-small text-muted">
              This is the shared team login, so its password belongs to everyone who uses it. The
              owner changes it under Team › Team login.
            </p>
          ) : (
            <>
              <p className="-mt-2 mb-4 text-small text-muted">
                Change the password you sign in with. Your role and salon are set by the owner and
                cannot be changed here.
              </p>
              <PasswordForm />
            </>
          )}
        </Card>
      </SplitMain>

      <SidePanel aria-label="Account summary">
        <div className="flex items-center gap-4 rounded-2xl bg-side p-5 text-on-accent">
          <span
            aria-hidden
            className="grid size-14 flex-none place-items-center rounded-full bg-accent text-lg font-bold text-on-accent"
          >
            {initialsOf(name)}
          </span>
          <div className="min-w-0">
            <p className="truncate font-heading text-section font-semibold">{name}</p>
            <p className="truncate text-small text-side-ink">{profile.phone ?? "No phone number"}</p>
            <div className="mt-2">
              <Pill tone="accent">{session.role?.name ?? "No role"}</Pill>
            </div>
          </div>
        </div>

        <dl className="text-small">
          <div className="flex items-center justify-between gap-3 border-b border-line-soft py-3">
            <dt className="text-muted">Salon</dt>
            <dd className="text-right">{salon.name}</dd>
          </div>
          <div className="flex items-center justify-between gap-3 py-3">
            <dt className="text-muted">Member since</dt>
            <dd>{formatDate(profile.created_at)}</dd>
          </div>
        </dl>

        <form action="/auth/signout" method="post">
          <Button type="submit" variant="danger" className="w-full">
            Sign out
          </Button>
        </form>
      </SidePanel>
    </Split>
  );
}
