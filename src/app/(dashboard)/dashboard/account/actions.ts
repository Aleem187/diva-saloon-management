"use server";

import { revalidatePath } from "next/cache";

import { AUDIT_ACTIONS, logAudit } from "@/lib/audit";
import { requireSession } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { changePasswordSchema, fieldErrors, profileUpdateSchema } from "@/lib/validation";

export interface AccountFormState {
  message?: string;
  success?: string;
  errors?: Record<string, string>;
}

/**
 * A user editing their own name and phone.
 *
 * Role, salon and active status are deliberately absent: the `profiles_update_self`
 * policy scopes the row, and `guard_profile_changes` rejects any attempt to move
 * tenant, change one's own role, or reactivate oneself.
 */
export async function updateAccountAction(
  _prevState: AccountFormState,
  formData: FormData,
): Promise<AccountFormState> {
  const session = await requireSession();

  const parsed = profileUpdateSchema.safeParse({
    fullName: formData.get("fullName"),
    phone: formData.get("phone") ?? "",
  });

  if (!parsed.success) {
    return { errors: fieldErrors(parsed.error) };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({
      full_name: parsed.data.fullName,
      phone: parsed.data.phone || null,
    })
    .eq("id", session.userId);

  if (error) {
    return { message: error.message };
  }

  revalidatePath("/dashboard", "layout");
  return { success: "Profile updated." };
}

/**
 * A signed-in person changing their own password.
 *
 * It asks for the current password first, so someone who finds a signed-in
 * screen cannot lock the owner of the account out. The change itself goes through
 * `auth.updateUser` as that person: it can only ever change their own login, and
 * it touches nothing about role or salon. The shared team login is excluded: its
 * password belongs to everyone using it, and only the owner changes it (Team ›
 * Team login), which also signs the other devices out.
 */
export async function changePasswordAction(
  _prevState: AccountFormState,
  formData: FormData,
): Promise<AccountFormState> {
  const session = await requireSession();

  if (session.teamLogin) {
    return {
      message:
        "This is the shared team login, so its password is changed by the owner under Team › Team login.",
    };
  }

  const parsed = changePasswordSchema.safeParse({
    currentPassword: formData.get("currentPassword"),
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };

  try {
    const supabase = await createClient();

    // Prove it is them. Signing in again also refreshes this device's session.
    const { error: checkError } = await supabase.auth.signInWithPassword({
      email: session.email,
      password: parsed.data.currentPassword,
    });
    if (checkError) {
      return { errors: { currentPassword: "That is not your current password." } };
    }

    const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
    if (error) return { message: error.message };

    await logAudit(session, {
      action: AUDIT_ACTIONS.ACCOUNT_PASSWORD_CHANGED,
      entityType: "profile",
      entityId: session.userId,
      metadata: {},
    });

    return { success: "Password changed. Use the new one next time you sign in." };
  } catch (error) {
    console.error("[account] changing the password failed:", error);
    return { message: "Your password could not be changed just now. Please try again." };
  }
}
