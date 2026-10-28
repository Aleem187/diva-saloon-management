import { changeRoleAction, linkLoginAction, setActiveAction } from "./actions";
import { MoveBranchForm } from "./move-branch-form";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Select } from "@/components/ui/field";
import { Pill } from "@/components/ui/pill";
import { requireModule } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import type { ProfileRow, RoleRow, TeamMemberRow } from "@/lib/types/database";

/** Team › Linked accounts: each login, who it is, what it holds, and whether it can sign in. */
export async function AccountsTab() {
  const session = await requireModule("team");
  const supabase = await createClient();

  const [{ data: roster }, { data: members }, { data: roleRows }] = await Promise.all([
    supabase
      .from("team_members")
      .select("*")
      .order("is_active", { ascending: false })
      .order("full_name"),
    supabase
      .from("profiles")
      .select("*")
      .order("is_active", { ascending: false })
      .order("created_at", { ascending: true }),
    supabase.from("roles").select("*").order("is_owner", { ascending: false }).order("name"),
  ]);

  const team = (roster ?? []) as TeamMemberRow[];
  const logins = (members ?? []) as ProfileRow[];
  const roles = (roleRows ?? []) as RoleRow[];

  const roleById = new Map<string, RoleRow>();
  for (const r of roles) roleById.set(r.id, r);
  /** The owner role is never offered: it is not a permission setting. */
  const assignable = roles.filter((r) => !r.is_owner);

  const loginByMember = new Map<string, ProfileRow>();
  for (const p of logins) {
    if (p.team_member_id) loginByMember.set(p.team_member_id, p);
  }

  if (logins.length === 0) return <EmptyState>No accounts yet.</EmptyState>;

  return (
    <Card padding="none">
      <CardHeader
        title="Accounts"
        description="Removing access deactivates the account rather than deleting it, so bookings, receipts and the audit trail stay intact."
      />
      <ul className="divide-y divide-line-soft">
        {logins.map((member) => {
          const isSelf = member.id === session.userId;
          const linked = team.find((m) => m.id === member.team_member_id);

          return (
            <li key={member.id} className="px-5 py-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 font-semibold">
                    <span className="truncate">{member.full_name || member.email}</span>
                    {isSelf ? <Pill tone="accent">You</Pill> : null}
                    {!member.is_active ? <Pill tone="critical">Deactivated</Pill> : null}
                    {session.branches.length > 1 ? (
                      <Pill tone="neutral">
                        {member.branch_id
                          ? (session.branches.find((b) => b.id === member.branch_id)?.name ?? "Branch")
                          : "Every branch"}
                      </Pill>
                    ) : null}
                  </p>
                  <p className="truncate text-small text-muted">{member.email}</p>
                  <p className="mt-0.5 text-small text-muted">
                    {linked ? (
                      <>On the team as {linked.full_name}</>
                    ) : (
                      /*
                        States the consequence and the remedy rather than
                        passing judgement. An account with no roster entry is a
                        perfectly valid thing -- an administrator, a bookkeeper
                        -- it just cannot be the answer to "who performed this
                        service?".
                      */
                      <>
                        Can sign in, but is not on the team — so cannot be booked or paid. Link
                        them below if they should be.
                      </>
                    )}
                  </p>

                  {/*
                    Linking is what lets someone see their own earnings: the
                    earnings page reads the ROSTER entry, because that is what
                    appointments and payroll reference.
                  */}
                  <form action={linkLoginAction} className="mt-2 flex flex-wrap items-center gap-2">
                    <input type="hidden" name="profileId" value={member.id} />
                    <label htmlFor={`link-${member.id}`} className="sr-only">
                      Team member for {member.email}
                    </label>
                    <Select
                      id={`link-${member.id}`}
                      name="memberId"
                      defaultValue={member.team_member_id ?? ""}
                      className="w-56 max-w-full"
                    >
                      <option value="">Not on the team</option>
                      {team
                        .filter(
                          (m) =>
                            m.id === member.team_member_id ||
                            // A login and its team member are at one branch, so only
                            // people of this login's branch are offered.
                            (!loginByMember.has(m.id) &&
                              m.is_active &&
                              (!member.branch_id || m.branch_id === member.branch_id)),
                        )
                        .map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.full_name}
                          </option>
                        ))}
                    </Select>
                    <Button type="submit" variant="ghost" size="sm">
                      Link
                    </Button>
                  </form>

                  {/* Owner only. A login linked to a team member moves with them. */}
                  {session.isOwner && member.branch_id ? (
                    <div className="mt-2">
                      <MoveBranchForm
                        kind="login"
                        id={member.id}
                        currentBranchId={member.branch_id}
                        branches={session.branches}
                        label={member.email}
                      />
                    </div>
                  ) : null}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {/*
                    The owner's own role is shown but never editable, and the
                    owner role is not in the list for anyone else -- it is
                    created with the salon and the database refuses to assign
                    it.
                  */}
                  {isSelf || roleById.get(member.role_id ?? "")?.is_owner ? (
                    <span className="text-small text-muted">
                      {roleById.get(member.role_id ?? "")?.name ?? "No role"}
                    </span>
                  ) : (
                    <form action={changeRoleAction} className="flex items-center gap-2">
                      <input type="hidden" name="profileId" value={member.id} />
                      <label htmlFor={`role-${member.id}`} className="sr-only">
                        Role for {member.full_name || member.email}
                      </label>
                      <Select
                        id={`role-${member.id}`}
                        name="roleId"
                        defaultValue={member.role_id ?? ""}
                        className="w-44"
                      >
                        {member.role_id ? null : <option value="">No role</option>}
                        {assignable.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.name}
                          </option>
                        ))}
                      </Select>
                      <Button type="submit" variant="ghost" size="sm">
                        Save
                      </Button>
                    </form>
                  )}

                  {!isSelf ? (
                    <form action={setActiveAction}>
                      <input type="hidden" name="profileId" value={member.id} />
                      <input
                        type="hidden"
                        name="isActive"
                        value={member.is_active ? "false" : "true"}
                      />
                      <Button
                        type="submit"
                        variant={member.is_active ? "danger" : "ghost"}
                        size="sm"
                      >
                        {member.is_active ? "Deactivate" : "Reactivate"}
                      </Button>
                    </form>
                  ) : null}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
