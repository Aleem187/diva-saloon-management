import { setBranchActiveAction } from "./branch-actions";
import { BranchForm } from "./branch-forms";
import { EditDisclosure } from "@/components/edit-disclosure";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Flash } from "@/components/ui/flash";
import { Pill } from "@/components/ui/pill";
import { requireOwner } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

/** Team › Branches: the locations of this salon. Owner only. */
export async function BranchesTab() {
  const session = await requireOwner();
  const supabase = await createClient();

  const [{ data: members }, { data: logins }] = await Promise.all([
    supabase.from("team_members").select("branch_id, is_active"),
    supabase.from("profiles").select("branch_id, is_active"),
  ]);

  const people = new Map<string, number>();
  for (const m of (members ?? []) as { branch_id: string; is_active: boolean }[]) {
    if (m.is_active) people.set(m.branch_id, (people.get(m.branch_id) ?? 0) + 1);
  }
  const signIns = new Map<string, number>();
  for (const p of (logins ?? []) as { branch_id: string | null; is_active: boolean }[]) {
    if (p.branch_id && p.is_active) signIns.set(p.branch_id, (signIns.get(p.branch_id) ?? 0) + 1);
  }

  const branches = session.branches;

  // Every salon has at least its Main Branch once the migration is applied, so
  // none at all means it has not been.
  if (branches.length === 0) {
    return (
      <Flash tone="warning">
        Branches are not available yet: the database update (migration 20261021000046_branches) has
        not been applied.
      </Flash>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="max-w-4xl">
        <CardTitle>Add a branch</CardTitle>
        <p className="-mt-2 mb-4 text-small text-muted">
          One salon, one subscription, one customer list and one price list; each branch has its own
          team, bookings, sales and payments. Choose which branch you are looking at, or all of them
          together, from the top bar.
        </p>
        <BranchForm />
      </Card>

      <Card padding="none">
        <CardHeader
          title="Your branches"
          description="A branch with history is closed, never deleted. Everyone except you works at one branch and sees only that branch."
        />
        <ul className="divide-y divide-line-soft">
          {branches.map((branch) => {
            const here = people.get(branch.id) ?? 0;
            return (
              <li key={branch.id} className="px-5 py-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 font-semibold">
                      <span>{branch.name}</span>
                      {branch.is_default ? <Pill tone="accent">Main</Pill> : null}
                      {!branch.is_active ? <Pill tone="critical">Closed</Pill> : null}
                    </p>
                    <p className="mt-0.5 text-small text-muted">
                      {branch.address || "No address"} &middot; {here} on the team &middot;{" "}
                      {signIns.get(branch.id) ?? 0} with a login
                    </p>
                    <div className="mt-2">
                      <EditDisclosure label="Edit">
                        <BranchForm branch={branch} />
                      </EditDisclosure>
                    </div>
                  </div>

                  {branch.is_default ? null : (
                    <form action={setBranchActiveAction} className="flex flex-col items-end gap-1">
                      <input type="hidden" name="branchId" value={branch.id} />
                      <input type="hidden" name="isActive" value={branch.is_active ? "false" : "true"} />
                      <Button
                        type="submit"
                        variant={branch.is_active ? "danger" : "ghost"}
                        size="sm"
                        disabled={branch.is_active && here > 0}
                      >
                        {branch.is_active ? "Close branch" : "Reopen"}
                      </Button>
                      {branch.is_active && here > 0 ? (
                        <span className="max-w-48 text-right text-fine text-muted">
                          Move its {here} {here === 1 ? "person" : "people"} elsewhere first.
                        </span>
                      ) : null}
                    </form>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </Card>
    </div>
  );
}
