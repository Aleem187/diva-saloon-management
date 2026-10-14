"use client";

import { useActionState, useState } from "react";

import { saveServiceAction, type CatalogueFormState } from "./actions";
import { CategoryField } from "./category-field";
import { SubmitButton } from "@/components/ui/submit-button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Flash } from "@/components/ui/flash";
import { EditDisclosure } from "@/components/edit-disclosure";
import { formatMoney } from "@/lib/format";
import type {
  CommissionBasis,
  ConsentTemplateRow,
  ServiceRow,
  TeamMemberRow,
} from "@/lib/types/database";

export function ServiceForm({
  therapists,
  templates,
  currency,
  service,
  assignedStaffIds = [],
  categories,
}: {
  therapists: TeamMemberRow[];
  /** The salon's existing categories, to pick from or avoid duplicating. */
  categories: string[];
  templates: ConsentTemplateRow[];
  currency: string;
  service?: ServiceRow;
  assignedStaffIds?: string[];
}) {
  const [state, formAction] = useActionState<CatalogueFormState, FormData>(
    saveServiceAction,
    {},
  );
  const isEdit = Boolean(service);

  const body = (
    <form action={formAction} className="space-y-4">
      {service ? <input type="hidden" name="serviceId" value={service.id} /> : null}

      {state.message ? <Flash tone="error">{state.message}</Flash> : null}
      {state.success ? <Flash tone="success">{state.success}</Flash> : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Service name" htmlFor={`name-${service?.id ?? "new"}`} error={state.errors?.name}>
          <Input
            id={`name-${service?.id ?? "new"}`}
            name="name"
            defaultValue={service?.name}
            required
            placeholder="Gel manicure"
          />
        </Field>

        <CategoryField
          id={`category-${service?.id ?? "new"}`}
          categories={categories}
          defaultValue={service?.category ?? ""}
          error={state.errors?.category}
        />

        <Field
          label={`Price (${currency})`}
          htmlFor={`price-${service?.id ?? "new"}`}
          error={state.errors?.price}
        >
          <Input
            id={`price-${service?.id ?? "new"}`}
            name="price"
            type="number"
            step="0.01"
            min="0"
            defaultValue={service?.price}
            required
          />
        </Field>

        <Field
          label="Duration"
          htmlFor={`duration-${service?.id ?? "new"}`}
          error={state.errors?.durationMinutes}
          hint="Minutes. This is how long the therapist's calendar is blocked."
        >
          <Input
            id={`duration-${service?.id ?? "new"}`}
            name="durationMinutes"
            type="number"
            step="5"
            min="5"
            defaultValue={service?.duration_minutes ?? 30}
            required
          />
        </Field>
      </div>

      <Field
        label="Description"
        htmlFor={`description-${service?.id ?? "new"}`}
        error={state.errors?.description}
      >
        <Textarea
          id={`description-${service?.id ?? "new"}`}
          name="description"
          rows={2}
          defaultValue={service?.description}
        />
      </Field>

      <Field
        label="Consent template"
        htmlFor={`consent-${service?.id ?? "new"}`}
        error={state.errors?.consentTemplateId}
        hint="Required before this treatment can be performed, if set."
      >
        <Select
          id={`consent-${service?.id ?? "new"}`}
          name="consentTemplateId"
          defaultValue={service?.consent_template_id ?? ""}
        >
          <option value="">No consent form needed</option>
          {templates.map((template) => (
            <option key={template.id} value={template.id}>
              {template.name}
            </option>
          ))}
        </Select>
      </Field>

      <ServiceCommission service={service} currency={currency} errors={state.errors ?? {}} />

      <fieldset>
        <legend className="mb-1.5 text-small font-medium text-ink">
          Who can perform this
        </legend>
        <p className="mb-2 text-fine text-muted">
          Leave all unticked to allow any therapist. Receptionists are not listed —
          they do not perform treatments.
        </p>
        <div className="flex flex-wrap gap-3">
          {therapists.length === 0 ? (
            <p className="text-fine text-muted">No therapists on the team yet.</p>
          ) : (
            therapists.map((person) => (
              <label key={person.id} className="flex items-center gap-2 text-small text-ink">
                <input
                  type="checkbox"
                  name="staffIds"
                  value={person.id}
                  defaultChecked={assignedStaffIds.includes(person.id)}
                  className="size-4 accent-accent"
                />
                {person.full_name}
              </label>
            ))
          )}
        </div>
      </fieldset>

      <SubmitButton pendingLabel="Saving...">
        {isEdit ? "Save changes" : "Add service"}
      </SubmitButton>
    </form>
  );

  if (!isEdit) return body;

  return <EditDisclosure label="Edit">{body}</EditDisclosure>;
}

/**
 * What this service pays whoever performs it.
 *
 * A DEFAULT, not a rule: a staff member with a rate of their own overrides it
 * entirely. Setting it here means a salon can price commission by treatment --
 * a colour paying more than a blow-dry -- without configuring every therapist
 * individually.
 */
function ServiceCommission({
  service,
  currency,
  errors,
}: {
  service?: ServiceRow;
  currency: string;
  errors: Record<string, string | undefined>;
}) {
  const [basis, setBasis] = useState<"" | CommissionBasis>(service?.commission_basis ?? "");
  const id = service?.id ?? "new";

  return (
    <div className="rounded-lg border border-line bg-head p-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Commission for this service"
          htmlFor={`comm-basis-${id}`}
          error={errors.commissionBasis}
          hint="Overridden by anyone who has a rate of their own."
        >
          <Select
            id={`comm-basis-${id}`}
            name="commissionBasis"
            value={basis}
            onChange={(event) => setBasis(event.target.value as "" | CommissionBasis)}
          >
            <option value="">None</option>
            <option value="percentage">% of the price</option>
            <option value="fixed_per_service">Fixed amount</option>
          </Select>
        </Field>

        {basis === "percentage" ? (
          <Field
            label="Rate"
            htmlFor={`comm-pct-${id}`}
            error={errors.commissionPercent}
            hint={
              service
                ? `Currently ${formatMoney(
                    (Number(service.price) * Number(service.commission_rate ?? 0)),
                    currency,
                  )} per booking at the list price.`
                : undefined
            }
          >
            <div className="flex items-center gap-1.5">
              <Input
                id={`comm-pct-${id}`}
                name="commissionPercent"
                type="number"
                step="0.01"
                min="0"
                max="100"
                defaultValue={((service?.commission_rate ?? 0) * 100).toFixed(2)}
                required
              />
              <span className="pb-2 text-small text-muted">%</span>
            </div>
          </Field>
        ) : basis === "fixed_per_service" ? (
          <Field
            label={`Amount (${currency})`}
            htmlFor={`comm-fixed-${id}`}
            error={errors.commissionFixed}
          >
            <Input
              id={`comm-fixed-${id}`}
              name="commissionFixed"
              type="number"
              step="0.01"
              min="0"
              defaultValue={
                Number(service?.commission_fixed ?? 0) > 0
                  ? String(service?.commission_fixed)
                  : ""
              }
              placeholder="0.00"
              required
            />
          </Field>
        ) : null}
      </div>

      {/* The unused rate is still submitted, so its column is cleared rather
          than keeping a stale figure from a previous basis. */}
      {basis !== "percentage" ? (
        <input type="hidden" name="commissionPercent" value="0" />
      ) : null}
      {basis !== "fixed_per_service" ? (
        <input type="hidden" name="commissionFixed" value="0" />
      ) : null}
    </div>
  );
}
