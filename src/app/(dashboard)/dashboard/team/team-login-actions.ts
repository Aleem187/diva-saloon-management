"use server";

import { revalidatePath } from "next/cache";

import type { TeamFormState } from "./actions";
import { AUDIT_ACTIONS, logAudit } from "@/lib/audit";
import { assertRole, requireSession } from "@/lib/auth/session";
import { redirectWithFlash } from "@/lib/flash";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { fieldErrors, resetPasswordSchema, teamLoginSchema } from "@/lib/validation";
import type { UserRole } from "@/lib/types/database";

const BACK = "/dashboard/team";
const TAB = { tab: "teamlogin" };

/**
 * Set up the salon's shared team login.
 *
 * The owner alone may do this: it hands a credential to however many people
 * know the password. It rides the same machinery as an invitation -- an
 * `invitations` row naming the role, then the Auth admin API creating the user
 * -- so `handle_new_user` builds the profile exactly as it does for anyone
 * else, with the chosen role and no roster entry. The password is never logged.
 */
export async function createTeamLoginAction(
  _prevState: TeamFormState,
  formData: FormData,
): Promise<TeamFormState> {
  const session = await requireSession();
  try {
    assertRole(session, "owner");
  } catch (error) {
    return { message: (error as Error).message };
  }

  const parsed = teamLoginSchema.safeParse({
    email: formData.get("email"),
    roleId: formData.get("roleId"),
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };

  const { email, roleId, password } = parsed.data;
  const supabase = await createClient();

  // One per salon (the table also says so; this gives the owner a clear message).
  const { data: existingLogin } = await supabase.from("team_logins").select("profile_id").maybeSingle();
  if (existingLogin) return { message: "This salon already has a team login." };

  /*
   * The role must be one of this salon's, not the owner role, and must not hold
   * the Team module: a password many people know should not be able to edit
   * roles or invite more accounts. The form filters the same way; this refuses
   * a hand-made request.
   */
  const { data: chosenRole } = await supabase
    .from("roles")
    .select("id, name, is_owner")
    .eq("id", roleId)
    .maybeSingle();
  if (!chosenRole) return { errors: { roleId: "Choose a role." } };
  if (chosenRole.is_owner) {
    return { errors: { roleId: "The team login cannot hold the owner role." } };
  }
  const { data: grants } = await supabase.from("role_modules").select("module").eq("role_id", roleId);
  if ((grants ?? []).some((g) => g.module === "team")) {
    return {
      errors: { roleId: "A role that can manage the team cannot be shared. Choose another role." },
    };
  }

  const { data: existing } = await supabase.from("profiles").select("id").ilike("email", email).maybeSingle();
  if (existing) return { errors: { email: "That email already has a login." } };

  const legacyRole: UserRole = chosenRole.name === "Receptionist" ? "receptionist" : "staff";

  const { data: invitation, error: inviteError } = await supabase
    .from("invitations")
    .insert({
      salon_id: session.profile.salon_id,
      email,
      role: legacyRole,
      role_id: roleId,
      full_name: "Team login",
      invited_by: session.userId,
      team_member_id: null,
      create_roster_entry: false,
    })
    .select("id")
    .single();
  if (inviteError) {
    if (inviteError.code === "23505") {
      return { errors: { email: "There is already a pending invitation for this email." } };
    }
    return { message: inviteError.message };
  }

  // Service role, for the Auth admin API only: creating the user.
  const admin = createAdminClient();
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: "Team login" },
  });

  if (createError || !created.user) {
    await supabase.from("invitations").delete().eq("id", invitation.id);
    if (createError?.message.toLowerCase().includes("already been registered")) {
      return { errors: { email: "That email already has an account on this platform." } };
    }
    return { message: createError?.message ?? "The team login could not be created." };
  }

  const { error: markError } = await supabase.from("team_logins").insert({
    profile_id: created.user.id,
    salon_id: session.profile.salon_id,
    created_by: session.userId,
  });

  if (markError) {
    // Without the marker the account would be an ordinary, uncapped login.
    // Undo it rather than leave one behind.
    await admin.auth.admin.deleteUser(created.user.id);
    return { message: `The team login could not be set up: ${markError.message}` };
  }

  await logAudit(session, {
    action: AUDIT_ACTIONS.TEAM_LOGIN_CREATED,
    entityType: "profile",
    entityId: created.user.id,
    metadata: { email, role: chosenRole.name, role_id: roleId },
  });

  revalidatePath(BACK);
  return redirectWithFlash(BACK, "success", `Team login created for ${email}.`, TAB);
}

/**
 * Change the team login's password, and sign every device out.
 *
 * Rotating a shared password usually means someone should no longer have it, so
 * the devices signed in under the old one are ended too. (They are refused at
 * their next request.)
 */
export async function changeTeamPasswordAction(
  _prevState: TeamFormState,
  formData: FormData,
): Promise<TeamFormState> {
  const session = await requireSession();
  try {
    assertRole(session, "owner");
  } catch (error) {
    return { message: (error as Error).message };
  }

  const parsed = resetPasswordSchema.safeParse({
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };

  const supabase = await createClient();
  const { data: login } = await supabase.from("team_logins").select("profile_id").maybeSingle();
  if (!login) return { message: "This salon has no team login." };

  const admin = createAdminClient();
  const { error } = await admin.auth.admin.updateUserById(login.profile_id, {
    password: parsed.data.password,
  });
  if (error) return { message: error.message };

  const { data: signedOut } = await supabase.rpc("revoke_team_sessions", { p_session_id: null });

  await logAudit(session, {
    action: AUDIT_ACTIONS.TEAM_LOGIN_PASSWORD_CHANGED,
    entityType: "profile",
    entityId: login.profile_id,
    metadata: { devices_signed_out: signedOut ?? 0 },
  });

  revalidatePath(BACK);
  return redirectWithFlash(
    BACK,
    "success",
    "Team password changed. Every device was signed out and needs the new password.",
    TAB,
  );
}

/** Sign one device (or, with no id, every device) out of the team login. Owner only. */
export async function revokeTeamSessionAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  try {
    assertRole(session, "owner");
  } catch {
    return redirectWithFlash(BACK, "error", "Only the owner can do that.", TAB);
  }

  const sessionId = String(formData.get("sessionId") ?? "");
  const supabase = await createClient();
  const { data: count, error } = await supabase.rpc("revoke_team_sessions", {
    p_session_id: sessionId || null,
  });

  revalidatePath(BACK);

  // The function reports how many it signed out; none is not success (rule 7).
  if (error || !count) {
    return redirectWithFlash(
      BACK,
      "error",
      error ? error.message : "Nothing to sign out: that device is already signed out.",
      TAB,
    );
  }

  await logAudit(session, {
    action: AUDIT_ACTIONS.TEAM_LOGIN_SESSIONS_REVOKED,
    entityType: "session",
    entityId: sessionId || null,
    metadata: { devices: count, scope: sessionId ? "one" : "all" },
  });

  return redirectWithFlash(
    BACK,
    "success",
    count === 1 ? "Signed 1 device out." : `Signed ${count} devices out.`,
    TAB,
  );
}
