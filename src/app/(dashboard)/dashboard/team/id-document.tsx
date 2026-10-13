"use client";

import { useActionState, useState, useTransition } from "react";

import {
  getStaffDocumentUrlAction,
  removeStaffDocumentAction,
  uploadStaffDocumentAction,
  type TeamFormState,
} from "./actions";
import { SubmitButton } from "@/components/ui/submit-button";
import { EditDisclosure } from "@/components/edit-disclosure";
import { Button } from "@/components/ui/button";
import { Field, FileInput, Input } from "@/components/ui/field";
import { Flash } from "@/components/ui/flash";
import type { StaffDocumentRow } from "@/lib/types/database";

function readableSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * The ID card held for one team member.
 *
 * Only ever rendered for the owner -- the roster tab checks that before drawing it,
 * and the row itself is behind an owner-only policy, so there
 * are two independent reasons a staff member never sees this.
 */
export function IdDocument({
  staffId,
  name,
  document,
}: {
  staffId: string;
  name: string;
  document?: StaffDocumentRow;
}) {
  const [state, formAction] = useActionState<TeamFormState, FormData>(
    uploadStaffDocumentAction,
    {},
  );

  return (
    <EditDisclosure label={document ? "ID card on file" : "Add ID card"}>
      <div className="space-y-3">
        <p className="text-fine text-muted">
          For your records only. {name} cannot see this, and neither can anyone else on
          the team.
        </p>

        {document ? <OnFile document={document} /> : null}

        <form action={formAction} className="space-y-3">
          <input type="hidden" name="staffId" value={staffId} />

          {state.message ? <Flash tone="error">{state.message}</Flash> : null}
          {state.success ? <Flash tone="success">{state.success}</Flash> : null}

          <Field
            label={document ? "Replace with" : "ID card image or PDF"}
            htmlFor={`doc-${staffId}`}
            error={state.errors?.document}
            hint="JPG, PNG, WebP or PDF, up to 10 MB."
          >
            <FileInput
              id={`doc-${staffId}`}
              name="document"
              accept="image/jpeg,image/png,image/webp,application/pdf"
              required
            />
          </Field>

          <Field label="Note" htmlFor={`docnote-${staffId}`}>
            <Input
              id={`docnote-${staffId}`}
              name="note"
              maxLength={500}
              defaultValue={document?.note ?? ""}
              placeholder="e.g. CNIC, expires 2030"
            />
          </Field>

          <SubmitButton size="sm" variant="ghost" pendingLabel="Uploading...">
            {document ? "Replace document" : "Upload document"}
          </SubmitButton>
        </form>
      </div>
    </EditDisclosure>
  );
}

function OnFile({ document }: { document: StaffDocumentRow }) {
  const [failed, setFailed] = useState(false);
  const [pending, startTransition] = useTransition();

  // The URL is minted on demand and expires after a minute, so it cannot be
  // copied out of the page and shared.
  function open() {
    startTransition(async () => {
      const url = await getStaffDocumentUrlAction(document.id);
      if (url) window.open(url, "_blank", "noopener,noreferrer");
      else setFailed(true);
    });
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line bg-surface px-3 py-2">
      <span className="min-w-0 text-small text-ink">
        <span className="truncate font-medium">{document.file_name}</span>
        <span className="ml-2 text-fine text-muted">{readableSize(document.size_bytes)}</span>
        {document.note ? (
          <span className="block text-fine text-muted">{document.note}</span>
        ) : null}
      </span>

      <span className="flex items-center gap-2">
        {failed ? <span className="text-fine text-critical-fg">Could not open that file.</span> : null}
        <Button type="button" variant="ghost" size="sm" onClick={open} disabled={pending}>
          {pending ? "Opening..." : "View"}
        </Button>
        <form action={removeStaffDocumentAction}>
          <input type="hidden" name="documentId" value={document.id} />
          <Button type="submit" variant="danger" size="sm">
            Remove
          </Button>
        </form>
      </span>
    </div>
  );
}
