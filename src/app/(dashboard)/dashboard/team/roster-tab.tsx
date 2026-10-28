import { setTeamMemberActiveAction } from "./actions";
import { IdDocument } from "./id-document";
import { MoveBranchForm } from "./move-branch-form";
import { RosterForm } from "./roster-form";
import { initialsOf } from "@/components/shell-sidebar-parts";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Pill } from "@/components/ui/pill";
import { StatTile } from "@/components/ui/stat-tile";
import { EditDisclosure } from "@/components/edit-disclosure";
import { requireModule } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import type { ProfileRow, RoleRow, StaffDocumentRow, TeamMemberRow } from "@/lib/types/database";

/** Team › Roster: who works here, who can sign in, and (owner) their ID on file. */
export async function RosterTab() {
  const session = await requireModule("team");
  const supabase = await createClient();

  const [{ data: roster }, { data: members }, { data: roleRows }, { data: documents }] =
    await Promise.all([
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
      // Owner-only by policy as well as by this check: nobody else is shown it.
      session.isOwner
        ? supabase.from("staff_documents").select("*").eq("doc_type", "id_card")
        : Promise.resolve({ data: [] as StaffDocumentRow[] }),
    ]);

  const team = (roster ?? []) as TeamMemberRow[];
  const logins = (members ?? []) as ProfileRow[];
  const roleById = new Map<string, RoleRow>();
  for (const r of (roleRows ?? []) as RoleRow[]) roleById.set(r.id, r);

  const documentByStaff = new Map<string, StaffDocumentRow>();
  for (const row of (documents ?? []) as StaffDocumentRow[]) {
    documentByStaff.set(row.staff_id, row);
  }

  // Which roster entries already have an account, so neither list has to be
  // read twice to answer "can this person sign in?".
  const loginByMember = new Map<string, ProfileRow>();
  for (const p of logins) {
    if (p.team_member_id) loginByMember.set(p.team_member_id, p);
  }

  const active = team.filter((m) => m.is_active);

  return (
    <div className="space-y-4">
      <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(190px,1fr))]">
        <StatTile label="Active team" value={active.length} />
        <StatTile label="With a login" value={team.filter((m) => loginByMember.has(m.id)).length} />
        {session.isOwner ? (
          <StatTile
            label="ID document missing"
            value={active.filter((m) => !documentByStaff.has(m.id)).length}
            tone="critical"
          />
        ) : null}
        <StatTile label="Inactive" value={team.length - active.length} />
      </div>

      <Card className="max-w-4xl">
        <CardTitle>Add to the team</CardTitle>
        <p className="-mt-2 mb-4 text-small text-muted">
          A name is enough. No email is needed — someone only needs an account if they want to
          sign in and check their own earnings.
        </p>
        <RosterForm
          branches={session.branches.filter((b) => b.is_active)}
          defaultBranchId={session.scopeBranchId}
        />
      </Card>

      {team.length === 0 ? (
        <EmptyState>Nobody on the team yet. Add your first person above.</EmptyState>
      ) : (
        <Card padding="none">
          <CardHeader
            title="The team"
            description="Who performs services and who payroll pays. Taking someone off the team keeps their history — bookings, receipts and payslips all stay intact."
          />
          <ul className="divide-y divide-line-soft">
            {team.map((member) => {
              const login = loginByMember.get(member.id);
              return (
                <li key={member.id} className="px-5 py-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex min-w-0 items-start gap-3">
                      <span
                        aria-hidden
                        className="grid size-9 flex-none place-items-center rounded-full bg-soft text-small font-bold text-accent-d"
                      >
                        {initialsOf(member.full_name)}
                      </span>
                      <div className="min-w-0">
                        <p className="flex flex-wrap items-center gap-2 font-semibold">
                          <span className="truncate">{member.full_name}</span>
                          {!member.is_active ? <Pill tone="critical">Off the team</Pill> : null}
                          {session.branches.length > 1 ? (
                            <Pill tone="neutral">
                              {session.branches.find((b) => b.id === member.branch_id)?.name ?? "Branch"}
                            </Pill>
                          ) : null}
                          {login ? (
                            <Pill tone="accent">Can sign in</Pill>
                          ) : (
                            <Pill tone="neutral">No login</Pill>
                          )}
                        </p>
                        {member.specialty ? (
                          <p className="mt-0.5 text-small text-muted">{member.specialty}</p>
                        ) : null}
                        {login ? (
                          <p className="mt-0.5 text-small text-muted">
                            {login.email} &middot;{" "}
                            {roleById.get(login.role_id ?? "")?.name ?? "No role"}
                          </p>
                        ) : null}

                        <div className="mt-2 flex flex-wrap items-start gap-2">
                          <EditDisclosure label="Edit">
                            <RosterForm member={member} />
                          </EditDisclosure>
                          {session.isOwner ? (
                            <MoveBranchForm
                              kind="member"
                              id={member.id}
                              currentBranchId={member.branch_id}
                              branches={session.branches}
                              label={member.full_name}
                            />
                          ) : null}
                          {session.isOwner ? (
                            <IdDocument
                              staffId={member.id}
                              name={member.full_name}
                              document={documentByStaff.get(member.id)}
                            />
                          ) : null}
                        </div>
                      </div>
                    </div>

                    <form action={setTeamMemberActiveAction}>
                      <input type="hidden" name="memberId" value={member.id} />
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
                        {member.is_active ? "Remove from team" : "Bring back"}
                      </Button>
                    </form>
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </div>
  );
}
