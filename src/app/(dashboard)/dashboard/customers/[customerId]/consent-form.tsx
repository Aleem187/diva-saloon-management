"use client";

import { useActionState, useMemo, useState } from "react";

import { createConsentFormAction, type CustomerFormState } from "../actions";
import { SubmitButton } from "@/components/ui/submit-button";
import { SignaturePad } from "@/components/signature-pad";
import { Field, FileInput, Select, Textarea } from "@/components/ui/field";
import { Flash } from "@/components/ui/flash";
import { ATTACHMENT_MAX_FILES } from "@/lib/attachments";
import type {
  ConsentTemplateItemRow,
  ConsentTemplateRow,
  ServiceRow,
} from "@/lib/types/database";

export interface ConsentAppointmentOption {
  id: string;
  label: string;
  serviceId: string | null;
}

export function ConsentForm({
  customerId,
  services,
  templates,
  itemsByTemplate,
  appointments,
}: {
  customerId: string;
  services: ServiceRow[];
  templates: ConsentTemplateRow[];
  itemsByTemplate: Record<string, ConsentTemplateItemRow[]>;
  appointments: ConsentAppointmentOption[];
}) {
  const [state, formAction] = useActionState<CustomerFormState, FormData>(
    createConsentFormAction,
    {},
  );

  const [appointmentId, setAppointmentId] = useState("");
  const [serviceId, setServiceId] = useState("");
  const [templateId, setTemplateId] = useState("");

  // Picking a service pulls in the consent wording the owner attached to it,
  // which is the normal path; the template can still be overridden by hand.
  const effectiveTemplateId = useMemo(() => {
    if (templateId) return templateId;
    const service = services.find((s) => s.id === serviceId);
    return service?.consent_template_id ?? "";
  }, [templateId, serviceId, services]);

  const template = templates.find((t) => t.id === effectiveTemplateId);
  const items = effectiveTemplateId ? (itemsByTemplate[effectiveTemplateId] ?? []) : [];

  // Serialised alongside the form so the wording is snapshotted server-side.
  const responsesJson = JSON.stringify(
    items.map((item) => ({
      itemId: item.id,
      label: item.label,
      isRequired: item.is_required,
      checked: false,
    })),
  );

  if (state.success) {
    return (
      <Flash tone="success">
        {state.success} It is now under Consent records.
      </Flash>
    );
  }

  return (
    <form
      action={formAction}
      className="space-y-5"
      encType="multipart/form-data"
      key={effectiveTemplateId}
    >
      <input type="hidden" name="customerId" value={customerId} />
      <input type="hidden" name="templateId" value={effectiveTemplateId} />

      {state.message ? <Flash tone="error">{state.message}</Flash> : null}

      <Field
        label="Visit"
        htmlFor="consent-appointment"
        error={state.errors?.appointmentId}
        hint="Linking the visit is what lets the treating therapist read this form."
      >
        <Select
          id="consent-appointment"
          name="appointmentId"
          value={appointmentId}
          onChange={(event) => {
            const next = event.target.value;
            setAppointmentId(next);
            // Pull the treatment across from the booking, so the right consent
            // wording is offered without the front desk having to match it up.
            const chosen = appointments.find((a) => a.id === next);
            if (chosen?.serviceId) {
              setServiceId(chosen.serviceId);
              setTemplateId("");
            }
          }}
        >
          <option value="">Not linked to a booking</option>
          {appointments.map((appointment) => (
            <option key={appointment.id} value={appointment.id}>
              {appointment.label}
            </option>
          ))}
        </Select>
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Treatment" htmlFor="consent-service" error={state.errors?.serviceId}>
          <Select
            id="consent-service"
            name="serviceId"
            value={serviceId}
            onChange={(event) => {
              setServiceId(event.target.value);
              setTemplateId("");
            }}
          >
            <option value="">Not tied to a specific service</option>
            {services.map((service) => (
              <option key={service.id} value={service.id}>
                {service.name}
              </option>
            ))}
          </Select>
        </Field>

        <Field
          label="Consent wording"
          htmlFor="consent-template"
          error={state.errors?.templateId}
          hint={
            template
              ? `Using "${template.name}".`
              : "Choose a treatment to pull in its consent wording."
          }
        >
          <Select
            id="consent-template"
            value={effectiveTemplateId}
            onChange={(event) => setTemplateId(event.target.value)}
          >
            <option value="">No template</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      {items.length > 0 ? (
        <fieldset className="rounded-lg border border-line bg-head p-4">
          <legend className="px-1 text-small font-medium text-ink">
            Consent statements
          </legend>
          <p className="mb-3 text-fine text-muted">
            Read each statement to the customer. Required statements must all be agreed
            to — this is checked again on the server.
          </p>
          <ConsentCheckboxes items={items} />
        </fieldset>
      ) : null}

      <input type="hidden" name="responses" value={responsesJson} id="consent-responses" />

      {!template || template.requires_medical_history ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Medical history"
            htmlFor="consent-history"
            error={state.errors?.medicalHistory}
          >
            <Textarea
              id="consent-history"
              name="medicalHistory"
              rows={4}
              placeholder="Conditions, medication, previous treatments..."
            />
          </Field>

          <Field label="Allergies" htmlFor="consent-allergies" error={state.errors?.allergies}>
            <Textarea
              id="consent-allergies"
              name="allergies"
              rows={4}
              placeholder="Known allergies and reactions..."
            />
          </Field>
        </div>
      ) : null}

      <Field
        label="Attachments (optional)"
        htmlFor="consent-attachments"
        error={state.errors?.attachments}
        hint={`PDF, JPG, PNG or WebP · up to ${ATTACHMENT_MAX_FILES} files, 10 MB each. Lab results, referrals, reference photos.`}
      >
        <FileInput
          id="consent-attachments"
          name="attachments"
          multiple
          accept="application/pdf,image/jpeg,image/png,image/webp"
        />
      </Field>

      <p className="text-fine text-muted">
        Attach anything supporting before signing. Signing seals the record, and
        files cannot be added to it afterwards &mdash; collect a new form instead.
      </p>

      <SignaturePad name="signature" error={state.errors?.signature} />

      <SubmitButton pendingLabel="Recording...">Record consent</SubmitButton>
    </form>
  );
}

/**
 * The checkboxes keep the serialised `responses` payload in step, so the
 * server receives the exact wording shown on screen alongside each answer.
 */
function ConsentCheckboxes({ items }: { items: ConsentTemplateItemRow[] }) {
  const [checked, setChecked] = useState<Record<string, boolean>>({});

  function toggle(id: string, value: boolean) {
    const next = { ...checked, [id]: value };
    setChecked(next);

    const input = document.getElementById("consent-responses") as HTMLInputElement | null;
    if (input) {
      input.value = JSON.stringify(
        items.map((item) => ({
          itemId: item.id,
          label: item.label,
          isRequired: item.is_required,
          checked: Boolean(next[item.id]),
        })),
      );
    }
  }

  return (
    <div className="space-y-2">
      {items.map((item) => (
        <label key={item.id} className="flex items-start gap-2.5 text-small text-ink">
          <input
            type="checkbox"
            checked={Boolean(checked[item.id])}
            onChange={(event) => toggle(item.id, event.target.checked)}
            className="mt-0.5 size-4 shrink-0 accent-accent"
          />
          <span>
            {item.label}
            {item.is_required ? <span className="ml-1 text-critical-fg">*</span> : null}
          </span>
        </label>
      ))}
    </div>
  );
}
