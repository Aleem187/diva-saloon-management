"use client";

import { useActionState, useState } from "react";

import { inviteMemberAction, type TeamFormState } from "./actions";
import { SubmitButton } from "@/components/ui/submit-button";
import { Field, Input, Select } from "@/components/ui/field";
import { Flash } from "@/components/ui/flash";
import type { BranchRow, RoleRow, TeamMemberRow } from "@/lib/types/database";

/**
 * Creating a login.
 *
 * The account can belong to someone already on the team -- "give Hafsa a
 * login" -- or stand alone for an administrator who manages the salon but
 * performs no services. The third option makes a fresh roster entry, which is
 * what every invitation did implicitly before the Team/User split.
 */
export function InviteForm({
  roster,
  roles,
  branches,
  defaultBranchId,
}: {
  roster: TeamMemberRow[];
  roles: RoleRow[];
  /** The open branches the inviter may invite into (one for a branch manager). */
  branches: BranchRow[];
  defaultBranchId: string | null;
}) {
  // Someone already on the team keeps the branch they work at.
  const [existingMember, setExistingMember] = useState("");
  const [state, formAction] = useActionState<TeamFormState, FormData>(
    inviteMemberAction,
    {},
  );

  return (
    <form action={formAction} className="space-y-4">
      {state.message ? <Flash tone="error">{state.message}</Flash> : null}
      {state.success ? <Flash tone="success">{state.success}</Flash> : null}

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Email" htmlFor="invite-email" error={state.errors?.email}>
          <Input
            id="invite-email"
            name="email"
            type="email"
            required
            placeholder="therapist@salon.com"
          />
        </Field>

        <Field label="Name" htmlFor="invite-name" error={state.errors?.fullName}>
          <Input id="invite-name" name="fullName" placeholder="Optional" />
        </Field>

        {/*
          The salon's own roles. The owner role is not among them -- it is
          created with the salon and the database refuses to assign it, so
          offering it here would only produce a confusing failure.
        */}
        <Field label="Role" htmlFor="invite-role" error={state.errors?.roleId}>
          <Select id="invite-role" name="roleId" defaultValue="" required>
            <option value="" disabled>
              Choose a role
            </option>
            {roles.map((role) => (
              <option key={role.id} value={role.id}>
                {role.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <Field
        label="This account belongs to"
        htmlFor="invite-member"
        error={state.errors?.teamMemberId}
        hint="Only people without a login are listed."
      >
        <Select
          id="invite-member"
          name="teamMemberId"
          defaultValue=""
          onChange={(event) => setExistingMember(event.target.value)}
        >
          <option value="">Someone new — add them to the team</option>
          {roster.map((member) => (
            <option key={member.id} value={member.id}>
              {member.full_name}
              {member.specialty ? ` — ${member.specialty}` : ""}
            </option>
          ))}
          <option value="none">Nobody — an admin who performs no services</option>
        </Select>
      </Field>

      {branches.length > 1 ? (
        <Field
          label="Branch"
          htmlFor="invite-branch"
          error={state.errors?.branchId}
          hint={
            existingMember && existingMember !== "none"
              ? "Someone already on the team keeps the branch they work at."
              : "They will see only this branch."
          }
        >
          <Select
            id="invite-branch"
            name="branchId"
            defaultValue={defaultBranchId ?? ""}
            disabled={Boolean(existingMember) && existingMember !== "none"}
            required
          >
            <option value="" disabled>
              Choose a branch
            </option>
            {branches.map((branch) => (
              <option key={branch.id} value={branch.id}>
                {branch.name}
              </option>
            ))}
          </Select>
        </Field>
      ) : null}

      <SubmitButton pendingLabel="Sending invitation...">Send invitation</SubmitButton>
    </form>
  );
}
