"use server";

import { revalidatePath } from "next/cache";

import type { TeamFormState } from "./actions";
import { AUDIT_ACTIONS, logAudit } from "@/lib/audit";
import { assertRole, requireSession } from "@/lib/auth/session";
import { isUuid } from "@/lib/branches";
import { redirectWithFlash } from "@/lib/flash";
import { createClient } from "@/lib/supabase/server";
import { branchSchema, fieldErrors } from "@/lib/validation";

const PATH = "/dashboard/team";
const TAB = { tab: "branches" };

/**
 * Branches belong to the owner: creating one, renaming it, closing it, and moving
 * people between them. Each is checked twice, here and by Row Level Security and
 * the database functions, so a hand-made request gets the same answer.
 */

export async function createBranchAction(
  _prevState: TeamFormState,
  formData: FormData,
): Promise<TeamFormState> {
  const session = await requireSession();
  try {
    assertRole(session, "owner");
  } catch (error) {
    return { message: (error as Error).message };
  }

  const parsed = branchSchema.safeParse({
    name: formData.get("name"),
    address: formData.get("address") ?? "",
  });
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };

  const supabase = await createClient();
  const { data: created, error } = await supabase
    .from("branches")
    .insert({
      salon_id: session.profile.salon_id,
      name: parsed.data.name,
      address: parsed.data.address,
    })
    .select("id")
    .maybeSingle();

  if (error) {
    if (error.code === "23505") return { errors: { name: "You already have a branch with that name." } };
    return { message: error.message };
  }
  if (!created) return { message: "The branch could not be created." };

  await logAudit(session, {
    action: AUDIT_ACTIONS.BRANCH_CREATED,
    entityType: "branch",
    entityId: created.id,
    metadata: { name: parsed.data.name },
  });

  revalidatePath("/dashboard", "layout");
  return { success: `${parsed.data.name} created.` };
}

export async function updateBranchAction(
  _prevState: TeamFormState,
  formData: FormData,
): Promise<TeamFormState> {
  const session = await requireSession();
  try {
    assertRole(session, "owner");
  } catch (error) {
    return { message: (error as Error).message };
  }

  const branchId = String(formData.get("branchId") ?? "");
  const parsed = branchSchema.safeParse({
    name: formData.get("name"),
    address: formData.get("address") ?? "",
  });
  if (!isUuid(branchId)) return { message: "That branch could not be found." };
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };

  const supabase = await createClient();
  const { data: saved, error } = await supabase
    .from("branches")
    .update({ name: parsed.data.name, address: parsed.data.address })
    .eq("id", branchId)
    .select("id")
    .maybeSingle();

  if (error) {
    if (error.code === "23505") return { errors: { name: "You already have a branch with that name." } };
    return { message: error.message };
  }
  // A zero-row update is not an error to PostgREST: check there was a row.
  if (!saved) return { message: "That branch could not be found." };

  await logAudit(session, {
    action: AUDIT_ACTIONS.BRANCH_UPDATED,
    entityType: "branch",
    entityId: branchId,
    metadata: { name: parsed.data.name },
  });

  revalidatePath("/dashboard", "layout");
  return { success: "Branch updated." };
}

/**
 * Close a branch, or reopen it. A branch with history is never deleted. Closing
 * is refused while people still work there or visits are still to come, so
 * nobody is left stranded at a branch that no longer takes bookings; the database
 * also insists the Main Branch and at least one other stay open.
 *
 * Every outcome is SAID on the page. This used to return silently when it
 * refused, or when the database did, so the button looked dead.
 */
export async function setBranchActiveAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  try {
    assertRole(session, "owner");
  } catch {
    return redirectWithFlash(PATH, "error", "Only the owner can open or close a branch.", TAB);
  }

  const branchId = String(formData.get("branchId") ?? "");
  const isActive = formData.get("isActive") === "true";
  if (!isUuid(branchId)) {
    return redirectWithFlash(PATH, "error", "That branch could not be found.", TAB);
  }

  const supabase = await createClient();

  if (!isActive) {
    const [{ count: people }, { count: upcoming }] = await Promise.all([
      supabase
        .from("team_members")
        .select("id", { count: "exact", head: true })
        .eq("branch_id", branchId)
        .eq("is_active", true),
      // Counted without the owner's view filter in mind: the filter can hide a
      // branch's visits, so this is only a first, friendly check. The people
      // check above and the database are the ones that decide.
      supabase
        .from("appointments")
        .select("id", { count: "exact", head: true })
        .eq("branch_id", branchId)
        .in("status", ["booked", "confirmed"])
        .gt("ends_at", new Date().toISOString()),
    ]);
    if ((people ?? 0) > 0) {
      return redirectWithFlash(
        PATH,
        "error",
        `Not closed: ${people} ${people === 1 ? "person still works" : "people still work"} there. Move them to another branch first.`,
        TAB,
      );
    }
    if ((upcoming ?? 0) > 0) {
      return redirectWithFlash(
        PATH,
        "error",
        `Not closed: it still has ${upcoming} upcoming ${upcoming === 1 ? "appointment" : "appointments"}. Complete or cancel ${upcoming === 1 ? "it" : "them"} first.`,
        TAB,
      );
    }
  }

  const { data: updated, error } = await supabase
    .from("branches")
    .update({ is_active: isActive })
    .eq("id", branchId)
    .select("id, name")
    .maybeSingle();

  if (error) {
    // The database's own sentence ("The Main Branch cannot be closed", "A salon must
    // keep at least one open branch") is written for the owner.
    return redirectWithFlash(PATH, "error", error.message.replace(/^.*?:\s*/, ""), TAB);
  }
  // A zero-row update is not an error to PostgREST: say nothing changed.
  if (!updated) {
    return redirectWithFlash(
      PATH,
      "error",
      "Nothing changed: that branch could not be updated. It may have been removed, or you may not be allowed to change it.",
      TAB,
    );
  }

  await logAudit(session, {
    action: isActive ? AUDIT_ACTIONS.BRANCH_REOPENED : AUDIT_ACTIONS.BRANCH_CLOSED,
    entityType: "branch",
    entityId: branchId,
    metadata: { name: updated.name },
  });

  revalidatePath("/dashboard", "layout");
  return redirectWithFlash(
    PATH,
    "success",
    isActive ? `${updated.name} reopened.` : `${updated.name} closed.`,
    TAB,
  );
}

/** Move a team member (with their login) or a login on its own to another branch. */
export async function moveToBranchAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  assertRole(session, "owner");

  const kind = String(formData.get("kind") ?? "");
  const id = String(formData.get("id") ?? "");
  const branchId = String(formData.get("branchId") ?? "");
  if (!isUuid(id) || !isUuid(branchId) || (kind !== "member" && kind !== "login")) return;

  const supabase = await createClient();
  const { error } =
    kind === "member"
      ? await supabase.rpc("move_team_member_to_branch", { p_member_id: id, p_branch_id: branchId })
      : await supabase.rpc("move_login_to_branch", { p_profile_id: id, p_branch_id: branchId });
  if (error) {
    // The function refuses with a sentence written for the owner (for example
    // "they still have upcoming appointments"); hand it back on the page.
    return redirectWithFlash(PATH, "error", error.message.replace(/^.*?:\s*/, ""), { tab: "branches" });
  }

  await logAudit(session, {
    action: AUDIT_ACTIONS.BRANCH_MEMBER_MOVED,
    entityType: kind === "member" ? "team_member" : "profile",
    entityId: id,
    metadata: { branch_id: branchId },
  });

  revalidatePath("/dashboard", "layout");
}
