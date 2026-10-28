"use server";

import { revalidatePath } from "next/cache";

import { AUDIT_ACTIONS, logAudit } from "@/lib/audit";
import { assertRole, requireSession } from "@/lib/auth/session";
import { siteUrl } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/branches";
import { fieldErrors, staffAccountSchema } from "@/lib/validation";
import type { UserRole } from "@/lib/types/database";

export interface StaffFormState {
  message?: string;
  errors?: Record<string, string>;
  /**
   * Set on success, so the owner can copy and hand over the sign-in details. The
   * password is the one the owner just typed; it is returned once, to them, and
   * is not stored, logged or put in the audit trail.
   */
  created?: {
    fullName: string;
    email: string;
    password: string;
    roleName: string;
    branchName: string | null;
    loginUrl: string;
  };
}

const FAILED =
  "The account could not be created just now, and nothing was changed. Please try again. If it keeps happening, the server log has the reason.";

/**
 * Create a staff account directly, with email and password, instead of sending
 * an invitation email.
 *
 * Owner only. It rides the same path as an invitation: an `invitations` row
 * naming the salon, the role and the roster choice is written first, then the
 * Auth admin API creates the (already confirmed) user, and `handle_new_user()`
 * reads that row inside Postgres to build the profile. So the salon and the role
 * come from the database, decided here by the owner's own session -- NOT from the
 * user metadata, which a signup request could forge. Metadata carries only the
 * display name.
 *
 * What was made is tracked so a failure at any point puts it back; a half-made
 * account would leave a pending invitation that blocks the next attempt.
 */
export async function createStaffAction(
  _prevState: StaffFormState,
  formData: FormData,
): Promise<StaffFormState> {
  const session = await requireSession();
  try {
    assertRole(session, "owner");
  } catch (error) {
    return { message: (error as Error).message };
  }

  const parsed = staffAccountSchema.safeParse({
    fullName: formData.get("fullName"),
    email: formData.get("email"),
    roleId: formData.get("roleId"),
    password: formData.get("password"),
  });
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };

  const { fullName, email, roleId, password } = parsed.data;

  /*
   * Which person this login is for, as on the invitation form:
   *   a uuid  -> an existing roster entry gets the account
   *   "none"  -> a login that performs no services (an accountant, say)
   *   ""      -> make a roster entry for them
   */
  const wanted = String(formData.get("teamMemberId") ?? "");
  const teamMemberId = wanted && wanted !== "none" ? wanted : null;
  const createRosterEntry = wanted !== "none";

  let invitationId: string | null = null;
  let createdUserId: string | null = null;
  const supabase = await createClient();

  async function undo() {
    try {
      if (createdUserId) await createAdminClient().auth.admin.deleteUser(createdUserId);
      if (invitationId) {
        await supabase.from("invitations").delete().eq("id", invitationId).select("id");
      }
    } catch (error) {
      console.error("[staff] could not undo a failed account creation:", error);
    }
  }

  try {
    // The role must be one of this salon's and must not be the owner role: the
    // form never offers it, so reaching here with it is a hand-made request.
    const { data: chosenRole } = await supabase
      .from("roles")
      .select("id, name, is_owner")
      .eq("id", roleId)
      .maybeSingle();
    if (!chosenRole) return { errors: { roleId: "Choose a role." } };
    if (chosenRole.is_owner) {
      return { errors: { roleId: "The owner role cannot be given to a new account." } };
    }

    /*
     * Which branch. Someone already on the team keeps theirs (a login and the
     * person it belongs to are at one branch). Otherwise the owner names one, or
     * it is the salon's only open branch. The database re-checks all of it.
     */
    let branchId = String(formData.get("branchId") ?? "");
    const openBranches = session.branches.filter((b) => b.is_active);

    if (teamMemberId) {
      const { data: member } = await supabase
        .from("team_members")
        .select("id, is_active, branch_id")
        .eq("id", teamMemberId)
        .maybeSingle();
      if (!member || !member.is_active) {
        return { errors: { teamMemberId: "Choose someone on the active team." } };
      }
      branchId = member.branch_id;
      const { data: taken } = await supabase
        .from("profiles")
        .select("id")
        .eq("team_member_id", teamMemberId)
        .maybeSingle();
      if (taken) return { errors: { teamMemberId: "That team member already has a login." } };
    }

    if (!branchId && openBranches.length === 1) branchId = openBranches[0].id;
    const branch = isUuid(branchId) ? openBranches.find((b) => b.id === branchId) : undefined;
    // Before the branches migration is applied there are none to choose, and
    // nothing to record; after it, every login needs one.
    if (session.branches.length > 0 && !branch) {
      return { errors: { branchId: "Choose a branch." } };
    }

    const { data: existing } = await supabase
      .from("profiles")
      .select("id")
      .ilike("email", email)
      .maybeSingle();
    if (existing) return { errors: { email: "This person is already on your team." } };

    // A failed earlier try for this address can leave its invitation behind.
    await supabase
      .from("invitations")
      .delete()
      .ilike("email", email)
      .eq("status", "pending")
      .select("id");

    // `invitations.role` is the pre-roles enum, still NOT NULL; role_id is the
    // authority. Filled with the nearest legacy equivalent, as invitations do.
    const legacyRole: UserRole = chosenRole.name === "Receptionist" ? "receptionist" : "staff";

    const { data: invitation, error: inviteError } = await supabase
      .from("invitations")
      .insert({
        salon_id: session.profile.salon_id,
        email,
        role: legacyRole,
        role_id: roleId,
        full_name: fullName,
        invited_by: session.userId,
        team_member_id: teamMemberId,
        create_roster_entry: createRosterEntry,
        ...(branch ? { branch_id: branch.id } : {}),
      })
      .select("id")
      .single();
    if (inviteError || !invitation) {
      if (inviteError?.code === "23505") {
        return { errors: { email: "There is already a pending invitation for this email." } };
      }
      return { message: inviteError?.message ?? FAILED };
    }
    invitationId = invitation.id;

    // Service role, for the Auth admin API only: creating the user.
    const admin = createAdminClient();
    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    });

    if (createError || !created.user) {
      console.error("[staff] creating the Auth user failed:", createError);
      await undo();
      if (createError?.message.toLowerCase().includes("already been registered")) {
        return {
          errors: {
            email:
              "That email already has an account on this platform. Each user can belong to one salon only.",
          },
        };
      }
      return { message: createError?.message ?? FAILED };
    }
    createdUserId = created.user.id;

    // The account exists now. Nothing after this may take it back: a failure to
    // write the audit entry or refresh the page must not delete a good login.
    try {
      await logAudit(session, {
        action: AUDIT_ACTIONS.STAFF_CREATED,
        entityType: "profile",
        entityId: created.user.id,
        metadata: {
          email,
          role: chosenRole.name,
          role_id: roleId,
          team_member_id: teamMemberId,
          branch_id: branch?.id ?? null,
        },
      });
      revalidatePath("/dashboard/team");
    } catch (error) {
      console.error("[staff] the account was created but follow-up failed:", error);
    }

    return {
      created: {
        fullName,
        email,
        password,
        roleName: chosenRole.name,
        branchName: branch?.name ?? null,
        loginUrl: `${siteUrl()}/login`,
      },
    };
  } catch (error) {
    console.error("[staff] creating the account failed:", error);
    await undo();
    return { message: FAILED };
  }
}
