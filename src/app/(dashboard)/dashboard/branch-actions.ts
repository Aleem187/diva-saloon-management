"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";

import { ALL_BRANCHES, BRANCH_COOKIE, isUuid } from "@/lib/branches";
import { requireSession } from "@/lib/auth/session";

/**
 * The owner's "All branches / Branch 2" choice in the top bar.
 *
 * It only ever NARROWS what the owner sees (see the migration): the cookie is
 * sent to the database as a header that Postgres treats as a filter, never as a
 * permission. A login assigned to a branch has no choice to make, and a value
 * that is not one of the owner's own open branches is simply forgotten.
 */
export async function setActiveBranchAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  if (!session.isOwner) return;

  const wanted = String(formData.get("branch") ?? ALL_BRANCHES);
  const store = await cookies();

  const valid =
    isUuid(wanted) && session.branches.some((branch) => branch.id === wanted && branch.is_active);

  if (valid) {
    store.set(BRANCH_COOKIE, wanted, {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 60 * 60 * 24 * 365,
    });
  } else {
    store.delete(BRANCH_COOKIE);
  }

  // Every page is rendered for one branch or all of them, so every page redraws.
  revalidatePath("/dashboard", "layout");
}
