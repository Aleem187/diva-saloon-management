"use client";

import { useActionState, useMemo, useState } from "react";

import { createBookingAction, type BookingFormState } from "./actions";
import { SubmitButton } from "@/components/ui/submit-button";
import { CustomerPicker } from "@/components/customer-picker";
import { ServicePicker } from "@/components/service-picker";
import { toPickable } from "@/lib/services";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { Flash } from "@/components/ui/flash";
import { formatDuration, formatMoney } from "@/lib/format";
import type { ServiceRow } from "@/lib/types/database";

interface Line {
  key: string;
  serviceId: string;
  quantity: number;
}

export function BookingForm({
  therapists,
  services,
  defaultDate,
  currency,
}: {
  therapists: { id: string; name: string }[];
  services: ServiceRow[];
  defaultDate: string;
  currency: string;
}) {
  const [state, formAction] = useActionState<BookingFormState, FormData>(
    createBookingAction,
    {},
  );

  // React clears an uncontrolled form once its action resolves, so a rejected
  // booking is re-seeded from what was entered rather than coming back blank.
  const was = (name: string, fallback = "") => state.values?.[name] ?? fallback;

  const pickable = useMemo(() => toPickable(services), [services]);
  const byId = useMemo(() => new Map(pickable.map((s) => [s.id, s])), [pickable]);

  const [lines, setLines] = useState<Line[]>(() => {
    try {
      const restored = JSON.parse(was("lines", "[]")) as Omit<Line, "key">[];
      return restored.map((line, index) => ({ ...line, key: `restored-${index}` }));
    } catch {
      return [];
    }
  });
  const [discount, setDiscount] = useState(was("discount", "0"));
  const [quotedTotal, setQuotedTotal] = useState(was("quotedTotal"));

  function addServices(ids: string[]) {
    setLines((current) => {
      const next = [...current];
      for (const id of ids) {
        const existing = next.find((l) => l.serviceId === id);
        // Adding the same service twice means "two of them", not a duplicate row.
        if (existing) existing.quantity = Math.min(20, existing.quantity + 1);
        else next.push({ key: `${id}-${Date.now()}-${next.length}`, serviceId: id, quantity: 1 });
      }
      return next;
    });
  }

  function setQuantity(key: string, quantity: number) {
    setLines((current) =>
      current.map((l) => (l.key === key ? { ...l, quantity: Math.max(1, Math.min(20, quantity)) } : l)),
    );
  }

  function removeLine(key: string) {
    setLines((current) => current.filter((l) => l.key !== key));
  }

  /* ---- an estimate for the desk; the server recomputes it ---- */
  const subtotal = lines.reduce((sum, line) => {
    const service = byId.get(line.serviceId);
    return sum + (service ? service.price * line.quantity : 0);
  }, 0);
  const minutes = lines.reduce((sum, line) => {
    const service = byId.get(line.serviceId);
    return sum + (service ? service.duration_minutes * line.quantity : 0);
  }, 0);

  const discountValue = Math.max(0, Number(discount) || 0);
  const overridden = quotedTotal.trim() !== "";
  const total = overridden
    ? Math.max(0, Number(quotedTotal) || 0)
    : Math.max(0, Math.round((subtotal - discountValue) * 100) / 100);

  const linesJson = JSON.stringify(
    lines.map((l) => ({ serviceId: l.serviceId, quantity: l.quantity })),
  );

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="lines" value={linesJson} />

      {state.message ? <Flash tone="error">{state.message}</Flash> : null}
      {state.success ? <Flash tone="success">{state.success}</Flash> : null}

      <CustomerPicker
        idPrefix="booking"
        errors={state.errors ?? {}}
        defaultMode={was("customerMode") === "new" ? "new" : "existing"}
        defaultCustomerId={was("customerId")}
        defaultName={was("newCustomerName")}
        defaultPhone={was("newCustomerPhone")}
      />

      <Field label="Team member" htmlFor="booking-staff" error={state.errors?.staffId}>
        <Select id="booking-staff" name="staffId" required defaultValue={was("staffId")}>
          <option value="">Choose a team member</option>
          {therapists.map((therapist) => (
            <option key={therapist.id} value={therapist.id}>
              {therapist.name}
            </option>
          ))}
        </Select>
      </Field>

      <div>
        <ServicePicker
          services={pickable}
          currency={currency}
          onAdd={addServices}
          label="Services on this booking"
        />
        {state.errors?.lines ? (
          <p className="mt-1 text-fine font-medium text-critical-fg">{state.errors.lines}</p>
        ) : null}

        {lines.length > 0 ? (
          <ul className="mt-3 divide-y divide-line-soft rounded-lg border border-line">
            {lines.map((line) => {
              const service = byId.get(line.serviceId);
              return (
                <li key={line.key} className="flex flex-wrap items-center gap-3 px-3 py-2">
                  <span className="min-w-0 flex-1 text-small text-ink">
                    {service?.name ?? "Service"}
                    <span className="ml-2 text-fine text-muted">{service?.category}</span>
                  </span>
                  <label className="flex items-center gap-1.5 text-fine text-muted">
                    Qty
                    <Input
                      type="number"
                      min={1}
                      max={20}
                      value={line.quantity}
                      onChange={(event) => setQuantity(line.key, Number(event.target.value) || 1)}
                      className="w-16"
                      aria-label={`Quantity of ${service?.name ?? "service"}`}
                    />
                  </label>
                  <span className="w-24 text-right text-small tabular-nums text-ink">
                    {formatMoney(service ? service.price * line.quantity : 0, currency)}
                  </span>
                  <Button type="button" variant="ghost" size="sm" onClick={() => removeLine(line.key)}>
                    Remove
                  </Button>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="mt-2 text-fine text-muted">
            Search above, or press &ldquo;All services&rdquo; to tick several at once.
          </p>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Date" htmlFor="booking-date" error={state.errors?.date}>
          <Input
            id="booking-date"
            name="date"
            type="date"
            defaultValue={was("date", defaultDate)}
            required
          />
        </Field>

        <Field
          label="Start time"
          htmlFor="booking-time"
          error={state.errors?.time}
          hint={minutes > 0 ? `Blocks ${formatDuration(minutes)}` : undefined}
        >
          <Input
            id="booking-time"
            name="time"
            type="time"
            step="300"
            defaultValue={was("time")}
            required
          />
        </Field>

        <Field label="Notes" htmlFor="booking-notes" error={state.errors?.notes}>
          <Input
            id="booking-notes"
            name="notes"
            defaultValue={was("notes")}
            placeholder="Anything the therapist should know"
          />
        </Field>
      </div>

      <div className="rounded-lg border border-line bg-head p-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label={`Discount (${currency})`}
            htmlFor="booking-discount"
            error={state.errors?.discount}
            hint="Taken off the calculated subtotal."
          >
            <Input
              id="booking-discount"
              name="discount"
              type="number"
              step="0.01"
              min="0"
              value={discount}
              onChange={(event) => setDiscount(event.target.value)}
              disabled={overridden}
            />
          </Field>

          <Field
            label={`Quoted total (${currency})`}
            htmlFor="booking-quoted"
            error={state.errors?.quotedTotal}
            hint="Leave blank to add the services up. Set it to quote a package price instead."
          >
            <Input
              id="booking-quoted"
              name="quotedTotal"
              type="number"
              step="0.01"
              min="0"
              value={quotedTotal}
              onChange={(event) => setQuotedTotal(event.target.value)}
              placeholder={formatMoney(subtotal - discountValue, currency)}
            />
          </Field>
        </div>

        <dl className="mt-3 space-y-1 border-t border-line pt-3 text-small">
          <div className="flex justify-between text-muted">
            <dt>Services subtotal</dt>
            <dd className="tabular-nums">{formatMoney(subtotal, currency)}</dd>
          </div>
          {!overridden && discountValue > 0 ? (
            <div className="flex justify-between text-muted">
              <dt>Discount</dt>
              <dd className="tabular-nums">&minus; {formatMoney(discountValue, currency)}</dd>
            </div>
          ) : null}
          <div className="flex justify-between border-t border-line pt-1.5 text-base font-semibold text-ink">
            <dt>{overridden ? "Quoted price" : "Total"}</dt>
            <dd className="tabular-nums">{formatMoney(total, currency)}</dd>
          </div>
        </dl>
      </div>

      {/*
        Walk-in is about how the booking arrived, not who the customer is, so it
        stays its own checkbox: a walk-in can be a regular, and a new customer
        can have phoned ahead.
      */}
      <label className="flex items-start gap-2 text-small text-ink">
        <input
          type="checkbox"
          name="isWalkIn"
          defaultChecked={was("isWalkIn") === "on"}
          className="mt-0.5 size-4 rounded border-field text-accent "
        />
        <span>
          Walk-in
          <span className="block text-fine text-muted">
            Books into the slot even if the therapist is already busy, rather than
            being refused for a clash.
          </span>
        </span>
      </label>

      <SubmitButton pendingLabel="Booking...">Book appointment</SubmitButton>
    </form>
  );
}
