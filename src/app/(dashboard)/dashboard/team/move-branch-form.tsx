import { moveToBranchAction } from "./branch-actions";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/field";
import type { BranchRow } from "@/lib/types/database";

/**
 * Move a team member (their login goes with them) or a login on its own to
 * another branch. Owner only: the action and the database functions both check.
 * Past bookings and sales stay at the branch where they happened.
 */
export function MoveBranchForm({
  kind,
  id,
  currentBranchId,
  branches,
  label,
}: {
  kind: "member" | "login";
  id: string;
  currentBranchId: string;
  branches: BranchRow[];
  label: string;
}) {
  const open = branches.filter((b) => b.is_active);
  if (open.length < 2) return null;

  return (
    <form action={moveToBranchAction} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="id" value={id} />
      <label htmlFor={`move-${kind}-${id}`} className="sr-only">
        Branch for {label}
      </label>
      <Select
        id={`move-${kind}-${id}`}
        name="branchId"
        defaultValue={currentBranchId}
        className="w-44 max-w-full"
      >
        {open.map((branch) => (
          <option key={branch.id} value={branch.id}>
            {branch.name}
          </option>
        ))}
      </Select>
      <Button type="submit" variant="ghost" size="sm">
        Move
      </Button>
    </form>
  );
}
