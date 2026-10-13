import { deleteRoleAction } from "./actions";
import { RoleForm } from "./role-form";
import { EditDisclosure } from "@/components/edit-disclosure";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Pill } from "@/components/ui/pill";
import { requireModule } from "@/lib/auth/session";
import { MODULES } from "@/lib/modules";
import { createClient } from "@/lib/supabase/server";
import type { AppModule, ProfileRow, RoleModuleRow, RoleRow } from "@/lib/types/database";

/** Team › Roles & permissions: what each kind of account can reach. */
export async function RolesTab() {
  await requireModule("team");
  const supabase = await createClient();

  const [{ data: roleRows }, { data: roleModuleRows }, { data: members }] = await Promise.all([
    supabase.from("roles").select("*").order("is_owner", { ascending: false }).order("name"),
    supabase.from("role_modules").select("*"),
    supabase.from("profiles").select("*"),
  ]);

  const roles = (roleRows ?? []) as RoleRow[];
  const logins = (members ?? []) as ProfileRow[];

  const modulesByRole = new Map<string, AppModule[]>();
  for (const row of (roleModuleRows ?? []) as RoleModuleRow[]) {
    modulesByRole.set(row.role_id, [...(modulesByRole.get(row.role_id) ?? []), row.module]);
  }

  // How many logins hold each role, so a role in use is not offered for
  // deletion with no explanation.
  const holders = new Map<string, number>();
  for (const p of logins) {
    if (p.role_id) holders.set(p.role_id, (holders.get(p.role_id) ?? 0) + 1);
  }

  const moduleLabel = new Map(MODULES.map((m) => [m.module, m.label]));

  return (
    <div className="space-y-4">
      <Card padding="none">
        <CardHeader
          title="Roles"
          description="What each kind of account can reach. Enforced by the database, not just by hiding links — unticking a box removes the data, not only the menu item."
        />

        <ul className="divide-y divide-line-soft">
          {roles.map((role) => {
            const held = modulesByRole.get(role.id) ?? [];
            const inUse = holders.get(role.id) ?? 0;

            return (
              <li key={role.id} className="px-5 py-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 font-semibold">
                      {role.name}
                      {role.is_owner ? <Pill tone="accent">The owner</Pill> : null}
                      {role.is_system && !role.is_owner ? <Pill tone="neutral">Built in</Pill> : null}
                      <span className="text-small font-normal text-muted">
                        {inUse === 0
                          ? "nobody"
                          : `${inUse} ${inUse === 1 ? "account" : "accounts"}`}
                      </span>
                    </p>

                    <p className="mt-0.5 text-small text-muted">
                      {role.is_owner
                        ? "Everything, including anything added in future. Cannot be renamed, deleted, or given to anyone else."
                        : held.length === 0
                          ? "Nothing beyond their own work — their own diary and their own earnings."
                          : held
                              .map((m) => moduleLabel.get(m) ?? m)
                              .sort()
                              .join(", ")}
                    </p>

                    {!role.is_owner ? (
                      <div className="mt-2">
                        <EditDisclosure label="Edit permissions">
                          <RoleForm role={role} modules={held} />
                        </EditDisclosure>
                      </div>
                    ) : null}
                  </div>

                  {!role.is_owner && !role.is_system && inUse === 0 ? (
                    <form action={deleteRoleAction}>
                      <input type="hidden" name="roleId" value={role.id} />
                      <Button type="submit" variant="danger" size="sm">
                        Delete
                      </Button>
                    </form>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>

        <div className="border-t border-line px-5 py-4">
          <EditDisclosure label="Add a role">
            <RoleForm />
          </EditDisclosure>
        </div>
      </Card>
    </div>
  );
}
