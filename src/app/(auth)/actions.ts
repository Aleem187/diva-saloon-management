"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { AUDIT_ACTIONS } from "@/lib/audit";
import {
  claimTeamSession,
  isTeamLoginUser,
  newSessionKey,
  TEAM_COOKIE_OPTIONS,
  TEAM_ENDED_MESSAGES,
  TEAM_SESSION_COOKIE,
} from "@/lib/auth/team-login";
import { siteUrl } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import {
  fieldErrors,
  forgotPasswordSchema,
  resetPasswordSchema,
  setPasswordSchema,
  signInSchema,
  signUpSchema,
} from "@/lib/validation";
import { submittedValues } from "@/lib/form-values";

export interface FormState {
  message?: string;
  errors?: Record<string, string>;
  /**
   * What the user typed, echoed back.
   *
   * React resets an uncontrolled form once its action resolves, so without
   * this a rejected submission would come back blank and everything would have
   * to be re-entered to fix one field.
   */
  values?: Record<string, string>;
  /** Set when signup succeeded but the account still needs email confirmation. */
  pendingConfirmation?: string;
  /** Set when a password-reset request was accepted (whether or not the account exists). */
  resetRequested?: string;
}

/**
 * Create a salon and its owner.
 *
 * The salon row, its settings row, the owner profile and the first audit entry
 * are all created by the `handle_new_user` trigger inside the same transaction
 * as the auth user. That means there is no window in which an auth user exists
 * without a tenant -- if the trigger raises, the signup itself fails.
 */
export async function signUpAction(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = signUpSchema.safeParse({
    salonName: formData.get("salonName"),
    businessType: formData.get("businessType"),
    fullName: formData.get("fullName"),
    email: formData.get("email"),
    password: formData.get("password"),
    country: formData.get("country"),
    timezone: formData.get("timezone"),
    currency: formData.get("currency"),
  });

  if (!parsed.success) {
    return { errors: fieldErrors(parsed.error), values: submittedValues(formData) };
  }

  const input = parsed.data;
  const supabase = await createClient();

  const { data, error } = await supabase.auth.signUp({
    email: input.email,
    password: input.password,
    options: {
      // Same reasoning as the invitation: the default template returns the
      // session in a fragment, which only the browser can read.
      emailRedirectTo: `${siteUrl()}/auth/callback?next=${encodeURIComponent("/dashboard")}`,
      // Read by the handle_new_user trigger to build the salon.
      data: {
        full_name: input.fullName,
        salon_name: input.salonName,
        business_type: input.businessType,
        country: input.country,
        timezone: input.timezone,
        currency: input.currency,
      },
    },
  });

  if (error) {
    return { message: error.message, values: submittedValues(formData) };
  }

  // Email confirmation is on: no session yet, so tell them to check their inbox.
  if (!data.session) {
    return { pendingConfirmation: input.email };
  }

  revalidatePath("/", "layout");
  redirect("/dashboard");
}

export async function signInAction(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = signInSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { errors: fieldErrors(parsed.error) };
  }

  const supabase = await createClient();
  const { data: signedIn, error } = await supabase.auth.signInWithPassword(parsed.data);

  if (error || !signedIn.user) {
    // Deliberately vague: do not confirm whether an email exists.
    return { message: "Incorrect email or password." };
  }

  /*
   * The shared team login may be open on a limited number of devices at once.
   * Taking a place happens here, at sign-in, because only here can the device's
   * key cookie be set; every later request just re-checks it. The password was
   * right, so telling this person the limit is reached leaks nothing.
   */
  try {
    if (await isTeamLoginUser(supabase, signedIn.user.id)) {
      const key = newSessionKey();
      const userAgent = (await headers()).get("user-agent") ?? "";
      const outcome = await claimTeamSession(supabase, key, userAgent);

      if (outcome !== "ok") {
        // Leave a trace for the owner, while the refused device still has the
        // access to write one. (Written as the team login itself: the policy
        // only lets an actor record entries as themselves.)
        const { data: profile } = await supabase
          .from("profiles")
          .select("salon_id, role")
          .eq("id", signedIn.user.id)
          .maybeSingle();
        if (profile) {
          await supabase.from("audit_logs").insert({
            salon_id: profile.salon_id,
            actor_id: signedIn.user.id,
            actor_email: signedIn.user.email ?? null,
            actor_role: profile.role,
            action: AUDIT_ACTIONS.TEAM_LOGIN_LIMIT_REACHED,
            entity_type: "profile",
            entity_id: signedIn.user.id,
            metadata: {},
          });
        }
        // "local": end only THIS device's session. The default would sign the
        // login out everywhere, including the devices legitimately using it.
        await supabase.auth.signOut({ scope: "local" });
        return { message: TEAM_ENDED_MESSAGES.limit };
      }

      (await cookies()).set(TEAM_SESSION_COOKIE, key, TEAM_COOKIE_OPTIONS);
    }
  } catch (error) {
    // Could not tell whether this is the shared login, or take a place on it.
    // Fail closed: no session, and a message, not a crashed page.
    console.error("[team-login] sign-in check failed:", error);
    try {
      await supabase.auth.signOut({ scope: "local" });
    } catch {
      /* the session cookie is ours to clear; nothing more to do */
    }
    return { message: TEAM_ENDED_MESSAGES.error };
  }

  const next = formData.get("next");
  const destination =
    typeof next === "string" && next.startsWith("/") && !next.startsWith("//")
      ? next
      : "/dashboard";

  revalidatePath("/", "layout");
  redirect(destination);
}

export async function signOutAction(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/login");
}

/**
 * Finishes an invited user's onboarding: they arrive with a session created by
 * the invite link, and set their own password and name here.
 *
 * Their profile, salon and role were already assigned by the trigger when the
 * invite created their auth user -- none of that is client-supplied.
 */
export async function acceptInviteAction(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = setPasswordSchema.safeParse({
    fullName: formData.get("fullName"),
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });

  if (!parsed.success) {
    return { errors: fieldErrors(parsed.error) };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { message: "Your invitation link has expired. Ask your salon owner to resend it." };
  }

  const { error } = await supabase.auth.updateUser({
    password: parsed.data.password,
    data: { full_name: parsed.data.fullName },
  });

  if (error) {
    return { message: error.message };
  }

  // The trigger seeds full_name from the invite; the user's own spelling wins.
  const { error: profileError } = await supabase
    .from("profiles")
    .update({ full_name: parsed.data.fullName })
    .eq("id", user.id);

  if (profileError) {
    return { message: profileError.message };
  }

  revalidatePath("/", "layout");
  redirect("/dashboard");
}

/**
 * Ask for a password-reset email.
 *
 * The answer is the same whether or not the address belongs to an account, so
 * this form cannot be used to find out who has one -- the same reasoning as the
 * deliberately vague sign-in error. Only a failure to SEND (rate limit, mail
 * outage) says anything different, and that reveals nothing about the account.
 *
 * The link lands on /auth/callback, which handles every shape of emailed token
 * (fragment, code, token hash) and then moves on to `next`.
 */
export async function forgotPasswordAction(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = forgotPasswordSchema.safeParse({ email: formData.get("email") });

  if (!parsed.success) {
    return { errors: fieldErrors(parsed.error), values: submittedValues(formData) };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${siteUrl()}/auth/callback?next=${encodeURIComponent("/reset-password")}`,
  });

  if (error) {
    return {
      message: "We could not send the email just now. Please try again in a few minutes.",
      values: submittedValues(formData),
    };
  }

  return { resetRequested: parsed.data.email };
}

/**
 * Set a new password for the person the emailed link signed in.
 *
 * The recovery link has already created a session by the time they get here;
 * without one there is nothing to change, so the action refuses rather than
 * trusting the form. Nobody's password is changed except the signed-in user's.
 */
export async function resetPasswordAction(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = resetPasswordSchema.safeParse({
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });

  if (!parsed.success) {
    return { errors: fieldErrors(parsed.error) };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { message: "This reset link has expired. Request a new one from the sign-in page." };
  }

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });

  if (error) {
    return { message: error.message };
  }

  revalidatePath("/", "layout");
  redirect("/dashboard");
}
