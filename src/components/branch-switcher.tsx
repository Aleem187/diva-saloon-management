"use client";

import { useRef } from "react";

import { setActiveBranchAction } from "@/app/(dashboard)/dashboard/branch-actions";
import { ALL_BRANCHES } from "@/lib/branches";

/**
 * The owner's branch choice, in the top bar: "All branches" for the whole salon
 * together, or one branch at a time. Choosing submits at once; the page redraws
 * for that branch.
 */
export function BranchSwitcher({
  branches,
  activeId,
}: {
  branches: { id: string; name: string }[];
  activeId: string | null;
}) {
  const form = useRef<HTMLFormElement>(null);

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
        onChange={() => form.current?.requestSubmit()}
        className="min-h-9 rounded-[10px] border border-field bg-surface px-3 text-small font-semibold text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
      >
        <option value={ALL_BRANCHES}>All branches</option>
        {branches.map((branch) => (
          <option key={branch.id} value={branch.id}>
            {branch.name}
          </option>
        ))}
      </select>
      <noscript>
        <button type="submit" className="text-small font-semibold text-accent">
          Switch
        </button>
      </noscript>
    </form>
  );
}
