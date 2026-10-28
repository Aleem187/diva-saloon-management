"use client";

import { useRouter } from "next/navigation";
import { useRef } from "react";

import { setActiveBranchAction } from "@/app/(dashboard)/dashboard/branch-actions";
import { ALL_BRANCHES } from "@/lib/branches";

/** The menu entry that opens Team > Branches rather than choosing a branch. */
const ADD_BRANCH = "__add_branch__";

/**
 * The owner's branch choice, in the top bar: "All branches" for the whole salon
 * together, or one branch at a time. Choosing submits at once; the page redraws
 * for that branch. The last entry opens Team > Branches to add another; a
 * salon with a single branch sees that branch's name and the add entry.
 */
export function BranchSwitcher({
  branches,
  activeId,
}: {
  branches: { id: string; name: string }[];
  activeId: string | null;
}) {
  const form = useRef<HTMLFormElement>(null);
  const router = useRouter();
  const current = activeId ?? ALL_BRANCHES;
  const single = branches.length === 1 ? branches[0] : null;

  return (
    <form ref={form} action={setActiveBranchAction} className="flex items-center gap-2">
      <label htmlFor="branch-switcher" className="text-small font-semibold text-muted">
        Branch
      </label>
      <select
        id="branch-switcher"
        name="branch"
        // Keyed on the choice so it is rebuilt when the server confirms a new one.
        // An uncontrolled select keeps its first default, and React resets a form
        // to that default once its action finishes: without this the box slid
        // back to "All branches" while the pages were already narrowed to a branch.
        key={activeId ?? ALL_BRANCHES}
        defaultValue={activeId ?? ALL_BRANCHES}
        onChange={(event) => {
          if (event.currentTarget.value === ADD_BRANCH) {
            // Not a choice: put the box back and go to the form.
            event.currentTarget.value = current;
            router.push("/dashboard/team?tab=branches");
            return;
          }
          form.current?.requestSubmit();
        }}
        className="min-h-9 rounded-[10px] border border-field bg-surface px-3 text-small font-semibold text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
      >
        {single ? (
          // One branch: nothing to narrow to, so its name stands for "everything".
          <option value={ALL_BRANCHES}>{single.name}</option>
        ) : (
          <>
            <option value={ALL_BRANCHES}>All branches</option>
            {branches.map((branch) => (
              <option key={branch.id} value={branch.id}>
                {branch.name}
              </option>
            ))}
          </>
        )}
        <option value={ADD_BRANCH}>+ Add new branch</option>
      </select>
      <noscript>
        <button type="submit" className="text-small font-semibold text-accent">
          Switch
        </button>
      </noscript>
    </form>
  );
}
