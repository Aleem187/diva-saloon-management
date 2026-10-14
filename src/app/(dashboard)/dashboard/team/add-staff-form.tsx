"use client";

import { useActionState, useState } from "react";

import { createStaffAction, type StaffFormState } from "./staff-actions";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Field, Input, Select, TextField } from "@/components/ui/field";
import { Flash } from "@/components/ui/flash";
import { SubmitButton } from "@/components/ui/submit-button";
import type { RoleRow, TeamMemberRow } from "@/lib/types/database";

/** A readable 12-character password from the browser's own random source. */
function generatePassword(): string {
  const alphabet = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = new Uint32Array(12);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (n) => alphabet[n % alphabet.length]).join("");
}

/**
 * Add a staff member directly. On success the sign-in details are shown once, so
 * the owner can copy them and hand them over; the member can then change their
 * own password under My account.
 */
export function AddStaffForm({
  roles,
  roster,
}: {
  roles: RoleRow[];
  roster: TeamMemberRow[];
}) {
  // Remounting on "Add another" is the simplest way to clear the action's state.
  const [round, setRound] = useState(0);
  return <AddStaffRound key={round} roles={roles} roster={roster} onAnother={() => setRound(round + 1)} />;
}

function AddStaffRound({
  roles,
  roster,
  onAnother,
}: {
  roles: RoleRow[];
  roster: TeamMemberRow[];
  onAnother: () => void;
}) {
  const [state, formAction] = useActionState<StaffFormState, FormData>(createStaffAction, {});
  const [password, setPassword] = useState("");
  const [copied, setCopied] = useState(false);

  if (state.created) {
    const c = state.created;
    const details = `Sign in at: ${c.loginUrl}\nEmail: ${c.email}\nPassword: ${c.password}`;

    async function copy() {
      try {
        await navigator.clipboard.writeText(details);
        setCopied(true);
      } catch {
        setCopied(false);
      }
    }

    return (
      <div className="space-y-4">
        <Flash tone="success">
          <p className="font-semibold">
            {c.fullName}&rsquo;s account is ready ({c.roleName}).
          </p>
          <p className="mt-1">
            Give them these details now. For their security the password is not shown again, and
            they can change it themselves under My account.
          </p>
        </Flash>

        <Card padding="md" className="space-y-3 bg-head">
          <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-small">
            <dt className="text-muted">Sign in at</dt>
            <dd className="break-all">{c.loginUrl}</dd>
            <dt className="text-muted">Email</dt>
            <dd className="break-all font-semibold">{c.email}</dd>
            <dt className="text-muted">Password</dt>
            <dd className="font-mono font-semibold break-all">{c.password}</dd>
          </dl>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" onClick={copy}>
              Copy sign-in details
            </Button>
            {copied ? (
              <span role="status" className="text-small font-semibold text-good-fg">
                Copied
              </span>
            ) : null}
          </div>
        </Card>

        <Button type="button" variant="ghost" onClick={onAnother}>
          Add another staff member
        </Button>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      {state.message ? <Flash tone="error">{state.message}</Flash> : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label="Full name"
          id="staff-name"
          name="fullName"
          autoComplete="off"
          required
          requiredMark={false}
          placeholder="Hafsa Khan"
          error={state.errors?.fullName}
        />
        <TextField
          label="Email"
          id="staff-email"
          name="email"
          type="email"
          autoComplete="off"
          required
          requiredMark={false}
          placeholder="hafsa@yoursalon.com"
          hint="They sign in with this. No email is sent."
          error={state.errors?.email}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Role" htmlFor="staff-role" error={state.errors?.roleId}>
          <Select id="staff-role" name="roleId" defaultValue="" required>
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

        <Field
          label="Password"
          htmlFor="staff-password"
          error={state.errors?.password}
          hint="At least 8 characters. You will see it once, to hand over."
        >
          <div className="flex items-center gap-2">
            <Input
              id="staff-password"
              name="password"
              type="text"
              autoComplete="off"
              spellCheck={false}
              required
              minLength={8}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Choose or generate"
            />
            <Button type="button" variant="ghost" onClick={() => setPassword(generatePassword())}>
              Generate
            </Button>
          </div>
        </Field>
      </div>

      <Field
        label="This account belongs to"
        htmlFor="staff-member"
        error={state.errors?.teamMemberId}
        hint="Someone who performs services needs to be on the team list for bookings, receipts and commission."
      >
        <Select id="staff-member" name="teamMemberId" defaultValue="">
          <option value="">Someone new: add them to the team</option>
          {roster.map((member) => (
            <option key={member.id} value={member.id}>
              {member.full_name}
            </option>
          ))}
          <option value="none">No one: a login that performs no services</option>
        </Select>
      </Field>

      <SubmitButton pendingLabel="Creating...">Create account</SubmitButton>
    </form>
  );
}

export function AddStaffCard({ roles, roster }: { roles: RoleRow[]; roster: TeamMemberRow[] }) {
  return (
    <Card className="max-w-4xl">
      <CardTitle>Add a staff member</CardTitle>
      <p className="-mt-2 mb-4 text-small text-muted">
        Create their account yourself, with a password of your choosing, and give them the details.
        Nothing is emailed, so there is no invitation to expire or bounce. They can change their
        password and name under My account, but not their role.
      </p>
      <AddStaffForm roles={roles} roster={roster} />
    </Card>
  );
}
