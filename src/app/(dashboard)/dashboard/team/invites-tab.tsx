import { revokeInviteAction } from "./actions";
import { InviteForm } from "./invite-form";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { requireModule } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import type { InvitationRow, ProfileRow, RoleRow, TeamMemberRow } from "@/lib/types/database";

/** Team › Invitations: give someone a login, and see who has not accepted yet. */
export async function InvitesTab() {
  await requireModule("team");
  const supabase = await createClient();

  const [{ data: roster }, { data: members }, { data: invitations }, { data: roleRows }] =
    await Promise.all([
      supabase
        .from("team_members")
        .select("*")
        .order("is_active", { ascending: false })
        .order("full_name"),
      supabase.from("profiles").select("*"),
      supabase
        .from("invitations")
        .select("*")
        .eq("status", "pending")
        .order("created_at", { ascending: false }),
      supabase.from("roles").select("*").order("is_owner", { ascending: false }).order("name"),
    ]);

  const team = (roster ?? []) as TeamMemberRow[];
  const logins = (members ?? []) as ProfileRow[];
  const roles = (roleRows ?? []) as RoleRow[];

  /** The owner role is never offered: it is not a permission setting. */
  const assignable = roles.filter((r) => !r.is_owner);
  const roleById = new Map<string, RoleRow>();
  for (const r of roles) roleById.set(r.id, r);

  // Only people without a login can be given one.
  const withLogin = new Set(logins.map((p) => p.team_member_id).filter(Boolean));
  const unlinked = team.filter((m) => !withLogin.has(m.id));

  const pending = (invitations ?? []) as InvitationRow[];

  return (
    <div className="space-y-4">
      <Card className="max-w-4xl">
        <CardTitle>Give someone a login</CardTitle>
        <p className="-mt-2 mb-4 text-small text-muted">
          An account lets them sign in. They receive an email link to set their own password.
        </p>
        <InviteForm roster={unlinked.filter((m) => m.is_active)} roles={assignable} />
      </Card>

      {pending.length > 0 ? (
        <Card padding="none">
          <CardHeader title="Pending invitations" description="Invitations expire after 7 days." />
          <ul className="divide-y divide-line-soft">
            {pending.map((invitation) => (
              <li
                key={invitation.id}
                className="flex flex-wrap items-center justify-between gap-3 px-5 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate font-semibold">{invitation.email}</p>
                  <p className="text-small text-muted">
                    {roleById.get(invitation.role_id ?? "")?.name ?? "No role"} &middot; expires{" "}
                    {new Date(invitation.expires_at).toLocaleDateString()}
                  </p>
                </div>
                <form action={revokeInviteAction}>
                  <input type="hidden" name="invitationId" value={invitation.id} />
                  <Button type="submit" variant="danger" size="sm">
                    Revoke
                  </Button>
                </form>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}
