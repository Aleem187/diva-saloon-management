import { AttachmentLink } from "./attachment-link";
import { SignatureViewer } from "./signature-viewer";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Pill } from "@/components/ui/pill";
import { requireSession } from "@/lib/auth/session";
import { formatDateTime } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import type {
  ConsentFormAttachmentRow,
  ConsentFormResponseRow,
  ConsentFormRow,
  ProfileRow,
  ServiceRow,
} from "@/lib/types/database";

/**
 * Customer › Consent records. SENSITIVE MEDICAL INFORMATION: which forms come
 * back is decided by the database (`can_access_consent_form()`), never here.
 */
export async function ConsentTab({ customerId }: { customerId: string }) {
  const session = await requireSession();
  const supabase = await createClient();

  const [{ data: forms }, { data: responses }, { data: attachments }, { data: services }, { data: team }] =
    await Promise.all([
      // Only the forms this user is allowed to see come back -- a therapist gets
      // just their own. That filtering is the database's, not ours.
      supabase
        .from("consent_forms")
        .select("*")
        .eq("customer_id", customerId)
        .order("created_at", { ascending: false }),
      supabase.from("consent_form_responses").select("*").order("sort_order"),
      // RLS narrows these to the forms this user may read, exactly as it does
      // the forms themselves.
      supabase.from("consent_form_attachments").select("*").order("created_at"),
      supabase.from("services").select("*").eq("is_active", true).order("name"),
      supabase.from("profiles").select("id, full_name, email"),
    ]);

  const nameById = new Map<string, string>();
  for (const p of (team ?? []) as Pick<ProfileRow, "id" | "full_name" | "email">[]) {
    nameById.set(p.id, p.full_name || p.email);
  }
  const serviceById = new Map<string, string>();
  for (const s of (services ?? []) as ServiceRow[]) serviceById.set(s.id, s.name);

  const responsesByForm = new Map<string, ConsentFormResponseRow[]>();
  for (const r of (responses ?? []) as ConsentFormResponseRow[]) {
    responsesByForm.set(r.form_id, [...(responsesByForm.get(r.form_id) ?? []), r]);
  }

  const attachmentsByForm = new Map<string, ConsentFormAttachmentRow[]>();
  for (const a of (attachments ?? []) as ConsentFormAttachmentRow[]) {
    attachmentsByForm.set(a.form_id, [...(attachmentsByForm.get(a.form_id) ?? []), a]);
  }

  const signedForms = ((forms ?? []) as ConsentFormRow[]).filter((f) => f.signed_at);

  return (
    <Card padding="none">
      <CardHeader
        title="Consent & medical intake"
        description="One record per visit. Signed records cannot be edited — collect a new one if anything changes."
      />
      {signedForms.length === 0 ? (
        <div className="p-5">
          <EmptyState>
            {session.profile.role === "staff"
              ? "No consent forms that you collected for this customer."
              : "No consent forms recorded yet."}
          </EmptyState>
        </div>
      ) : (
        <ul className="divide-y divide-line-soft">
          {signedForms.map((form) => {
            const formResponses = responsesByForm.get(form.id) ?? [];
            return (
              <li key={form.id} className="px-5 py-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="flex flex-wrap items-center gap-2 font-semibold">
                    {form.service_id ? (
                      <span>{serviceById.get(form.service_id) ?? "Treatment"}</span>
                    ) : (
                      <span>General consent</span>
                    )}
                    <Pill tone="good">Signed</Pill>
                  </p>
                  <span className="text-small text-muted">
                    {formatDateTime(form.signed_at)} &middot; collected by{" "}
                    {form.collected_by
                      ? (nameById.get(form.collected_by) ?? "a former team member")
                      : "a former team member"}
                  </span>
                </div>

                {formResponses.length > 0 ? (
                  <ul className="mt-2 space-y-1">
                    {formResponses.map((response) => (
                      <li key={response.id} className="text-small text-muted">
                        <span className={response.checked ? "text-good-fg" : "text-critical-fg"}>
                          {response.checked ? "✓" : "✗"}
                        </span>{" "}
                        {response.label}
                      </li>
                    ))}
                  </ul>
                ) : null}

                {form.medical_history || form.allergies ? (
                  <div className="mt-3 grid gap-3 rounded-[10px] bg-head p-3 sm:grid-cols-2">
                    {form.medical_history ? (
                      <div>
                        <p className="text-fine font-semibold tracking-[0.05em] text-muted uppercase">
                          Medical history
                        </p>
                        <p className="mt-0.5 whitespace-pre-wrap">{form.medical_history}</p>
                      </div>
                    ) : null}
                    {form.allergies ? (
                      <div>
                        <p className="text-fine font-semibold tracking-[0.05em] text-muted uppercase">
                          Allergies
                        </p>
                        <p className="mt-0.5 whitespace-pre-wrap">{form.allergies}</p>
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {(attachmentsByForm.get(form.id) ?? []).length > 0 ? (
                  <div className="mt-3">
                    <p className="text-fine font-semibold tracking-[0.05em] text-muted uppercase">
                      Attachments
                    </p>
                    <ul className="mt-1 divide-y divide-line-soft">
                      {(attachmentsByForm.get(form.id) ?? []).map((attachment) => (
                        <AttachmentLink
                          key={attachment.id}
                          id={attachment.id}
                          fileName={attachment.file_name}
                          mimeType={attachment.mime_type}
                          sizeBytes={attachment.size_bytes}
                        />
                      ))}
                    </ul>
                  </div>
                ) : null}

                {form.signature_path ? (
                  <div className="mt-3">
                    <SignatureViewer formId={form.id} />
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
