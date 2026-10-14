import { AddStaffCard } from "./add-staff-form";
import { EmptyState } from "@/components/ui/empty-state";
import { requireOwner } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import type { ProfileRow, RoleRow, TeamMemberRow } from "@/lib/types/database";

/** Team › Add staff: create an account directly, with a password. Owner only. */
export async function AddStaffTab() {
  await requireOwner();
  const supabase = await createClient();

  const [{ data: roleRows }, { data: roster }, { data: logins }] = await Promise.all([
    supabase.from("roles").select("*").eq("is_owner", false).order("name"),
    supabase.from("team_members").select("*").eq("is_active", true).order("full_name"),
    supabase.from("profiles").select("team_member_id"),
  ]);

  const roles = (roleRows ?? []) as RoleRow[];
  // Only people who do not yet have a login can be given one.
  const withLogin = new Set(
    ((logins ?? []) as Pick<ProfileRow, "team_member_id">[]).map((p) => p.team_member_id).filter(Boolean),
  );
  const unlinked = ((roster ?? []) as TeamMemberRow[]).filter((m) => !withLogin.has(m.id));

  if (roles.length === 0) {
    return (
      <EmptyState>
        There is no role to give yet. Create one under Roles &amp; permissions first.
      </EmptyState>
    );
  }

  return <AddStaffCard roles={roles} roster={unlinked} />;
}
