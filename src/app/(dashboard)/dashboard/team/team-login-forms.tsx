"use client";

import { useActionState } from "react";

import { changeTeamPasswordAction, createTeamLoginAction } from "./team-login-actions";
import type { TeamFormState } from "./actions";
import { Field, Select, TextField } from "@/components/ui/field";
import { Flash } from "@/components/ui/flash";
import { SubmitButton } from "@/components/ui/submit-button";
import type { RoleRow } from "@/lib/types/database";

export function CreateTeamLoginForm({ roles }: { roles: RoleRow[] }) {
  const [state, formAction] = useActionState<TeamFormState, FormData>(createTeamLoginAction, {});

  return (
    <form action={formAction} className="space-y-4">
      {state.message ? <Flash tone="error">{state.message}</Flash> : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label="Team login email"
          id="team-login-email"
          name="email"
          type="email"
          autoComplete="off"
          required
          requiredMark={false}
          placeholder="frontdesk@yoursalon.com"
          hint="People type this, with the team password, on the sign-in page. Use an inbox you control: password-reset emails for it go there."
          error={state.errors?.email}
        />

        <Field
          label="Role"
          htmlFor="team-login-role"
          error={state.errors?.roleId}
          hint="What everyone on this login can do. The owner role and roles that manage the team are not offered."
        >
          <Select id="team-login-role" name="roleId" defaultValue="" required>
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

      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label="Team password"
          id="team-login-password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          requiredMark={false}
          minLength={8}
          placeholder="At least 8 characters"
          error={state.errors?.password}
        />
        <TextField
          label="Confirm team password"
          id="team-login-confirm"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          required
          requiredMark={false}
          placeholder="Repeat password"
          error={state.errors?.confirmPassword}
        />
      </div>

      <SubmitButton pendingLabel="Creating...">Create team login</SubmitButton>
    </form>
  );
}

export function ChangeTeamPasswordForm() {
  const [state, formAction] = useActionState<TeamFormState, FormData>(changeTeamPasswordAction, {});

  return (
    <form action={formAction} className="space-y-4">
      {state.message ? <Flash tone="error">{state.message}</Flash> : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label="New team password"
          id="team-new-password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          requiredMark={false}
          minLength={8}
          placeholder="At least 8 characters"
          error={state.errors?.password}
        />
        <TextField
          label="Confirm new password"
          id="team-new-confirm"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          required
          requiredMark={false}
          placeholder="Repeat password"
          error={state.errors?.confirmPassword}
        />
      </div>

      <p className="text-fine text-muted">
        Changing the password signs every device out of the team login.
      </p>

      <SubmitButton pendingLabel="Saving...">Change team password</SubmitButton>
    </form>
  );
}
