"use client";

import { useActionState, useEffect, useMemo, useState } from "react";

import { checkoutAction, loyaltyBalanceAction, type PosFormState } from "./actions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/field";
import { Flash } from "@/components/ui/flash";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { ServiceTiles } from "@/components/ui/service-tiles";
import { SubmitButton } from "@/components/ui/submit-button";
import { CustomerPicker } from "@/components/customer-picker";
import { toPickable } from "@/lib/services";
import { formatMoney } from "@/lib/format";
import type { DealRow, ServiceRow } from "@/lib/types/database";

type PayMethod = "cash" | "card" | "bank_transfer" | "split";

const PAY_METHODS: { value: PayMethod; label: string }[] = [
  { value: "cash", label: "Cash" },
  { value: "card", label: "Card" },
  { value: "bank_transfer", label: "Bank transfer" },
  { value: "split", label: "Split" },
];

interface BasketLine {
  key: string;
  serviceId: string;
  staffId: string;
  quantity: number;
}

/**
 * The till.
 *
 * The figures shown here are an ESTIMATE for the person at the desk. They are
 * recomputed from the catalogue by `create_receipt()` in Postgres, and it is
 * that calculation which lands on the receipt. If the two ever disagree, the
 * server is right — which is why nothing below is submitted as a price.
 */
/**
 * A visit being brought to the till from the diary.
 *
 * `deposit` is what has already been paid against it. The till collects the
 * BALANCE -- `create_receipt()` nets the deposit off server-side -- so the
 * figures shown here have to do the same or the desk would ask for the whole
 * bill twice.
 */
export interface CheckoutPrefill {
  appointmentId: string;
  customerId: string;
  customerName: string;
  /** "Name — phone", as the picker shows a chosen customer. */
  customerLabel: string;
  deposit: number;
  lines: { serviceId: string; staffId: string; quantity: number }[];
}

export function Till({
  services,
  therapists,
  deals,
  servicesByDeal,
  currency,
  prefill,
}: {
  services: ServiceRow[];
  therapists: { id: string; name: string }[];
  deals: DealRow[];
  servicesByDeal: Record<string, string[]>;
  currency: string;
  prefill?: CheckoutPrefill;
}) {
  const [state, formAction] = useActionState<PosFormState, FormData>(checkoutAction, {});

  // React clears an uncontrolled form once its action resolves, and the basket
  // itself lives in state, so a refused sale is re-seeded from what was rung up
  // rather than having to be entered again.
  const was = (name: string, fallback = "") => state.values?.[name] ?? fallback;

  const [customerId, setCustomerId] = useState(was("customerId", prefill?.customerId ?? ""));
  const [balance, setBalance] = useState(0);
  const [lines, setLines] = useState<BasketLine[]>(() => {
    // A rejected sale takes precedence: it carries what the desk had just
    // typed, which is newer than whatever the booking said.
    try {
      const restored = JSON.parse(was("lines", "[]")) as Omit<BasketLine, "key">[];
      if (restored.length > 0) {
        return restored.map((line, index) => ({ ...line, key: `restored-${index}` }));
      }
    } catch {
      /* fall through to the booking */
    }
    return (prefill?.lines ?? []).map((line, index) => ({
      ...line,
      key: `booked-${index}`,
    }));
  });
  const [dealId, setDealId] = useState(was("dealId"));
  const [redeem, setRedeem] = useState(was("loyaltyRedeem", "0"));
  const [paymentMethod, setPaymentMethod] = useState<PayMethod>(
    (PAY_METHODS.find((m) => m.value === was("paymentMethod"))?.value ?? "cash") as PayMethod,
  );
  const [cash, setCash] = useState(was("cashAmount", "0"));
  const [card, setCard] = useState(was("cardAmount", "0"));
  const [transfer, setTransfer] = useState(was("transferAmount", "0"));

  const serviceById = useMemo(
    () => new Map(services.map((s) => [s.id, s])),
    [services],
  );

  // Fetch the balance when the customer changes. Server-side, through RLS.
  // Clearing on deselect happens in the change handler, not here, so this
  // effect only ever reacts to a fetch completing.
  useEffect(() => {
    if (!customerId) return;

    let cancelled = false;
    loyaltyBalanceAction(customerId).then((value) => {
      if (!cancelled) setBalance(value);
    });
    return () => {
      cancelled = true;
    };
  }, [customerId]);

  function chooseCustomer(nextId: string) {
    setCustomerId(nextId);
    // Drop the previous customer's balance immediately rather than showing it
    // against the new one while the fetch is in flight.
    setBalance(0);
    setRedeem("0");
  }

  const pickable = useMemo(() => toPickable(services), [services]);

  function addServices(ids: string[]) {
    setLines((current) => {
      const next = [...current];
      for (const id of ids) {
        // The same service twice means two of them, not two rows to scroll past.
        const existing = next.find((l) => l.serviceId === id);
        if (existing) existing.quantity = Math.min(99, existing.quantity + 1);
        else
          next.push({
            key: `${id}-${Date.now()}-${next.length}`,
            serviceId: id,
            staffId: therapists[0]?.id ?? "",
            quantity: 1,
          });
      }
      return next;
    });
  }

  function updateLine(key: string, patch: Partial<BasketLine>) {
    setLines((current) => current.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  function removeLine(key: string) {
    setLines((current) => current.filter((l) => l.key !== key));
  }

  /* ---- estimate only; the server recomputes all of this ---- */
  const gross = lines.reduce((sum, line) => {
    const service = serviceById.get(line.serviceId);
    return sum + (service ? Number(service.price) * line.quantity : 0);
  }, 0);

  const deal = deals.find((d) => d.id === dealId);
  const eligibleGross = deal
    ? lines.reduce((sum, line) => {
        const service = serviceById.get(line.serviceId);
        const eligible = (servicesByDeal[deal.id] ?? []).includes(line.serviceId);
        return sum + (service && eligible ? Number(service.price) * line.quantity : 0);
      }, 0)
    : 0;

  let discount = 0;
  if (deal && eligibleGross > 0) {
    if (deal.deal_type === "percentage") {
      discount = Math.round(eligibleGross * Number(deal.value)) / 100;
    } else if (deal.deal_type === "fixed_amount") {
      discount = Math.min(Number(deal.value), eligibleGross);
    } else {
      discount = Math.max(0, eligibleGross - Number(deal.value));
    }
  }

  const bill = Math.max(0, Math.round((gross - discount) * 100) / 100);
  const maxRedeem = Math.min(balance, bill);
  const redeemValue = Math.min(Math.max(Number(redeem) || 0, 0), maxRedeem);
  const total = Math.round((bill - redeemValue) * 100) / 100;

  // What the customer has already handed over for this visit, and therefore
  // what is left to take now. Mirrors create_receipt(): nothing is collected
  // when the deposit has overtaken the bill.
  const deposit =
    prefill && customerId === prefill.customerId ? prefill.deposit : 0;
  const dueNow = Math.max(0, Math.round((total - deposit) * 100) / 100);
  const overpaid = Math.round((deposit - total) * 100) / 100;

  const linesJson = JSON.stringify(
    lines
      .filter((l) => l.serviceId && l.staffId)
      .map((l) => ({
        serviceId: l.serviceId,
        staffId: l.staffId,
        quantity: l.quantity,
      })),
  );

  const splitTotal =
    Math.round(
      ((Number(cash) || 0) + (Number(card) || 0) + (Number(transfer) || 0)) * 100,
    ) / 100;
  const splitMismatch = paymentMethod === "split" && splitTotal !== dueNow;

  // How many of each service are in the basket, for the badge on its tile.
  const counts: Record<string, number> = {};
  for (const line of lines) counts[line.serviceId] = (counts[line.serviceId] ?? 0) + line.quantity;

  return (
    <form action={formAction} className="flex flex-wrap items-start gap-4">
      <input type="hidden" name="lines" value={linesJson} />
      <input type="hidden" name="loyaltyRedeem" value={redeemValue} />
      <input type="hidden" name="paymentMethod" value={paymentMethod} />
      {/*
        The customer stays editable -- the wrong booking can be opened, and a
        locked field would leave no way out. But changing it away from the
        booking's own customer means this sale is no longer that visit, so the
        link is dropped rather than letting create_receipt() refuse it with
        "that appointment belongs to a different customer".
      */}
      {prefill && customerId === prefill.customerId ? (
        <input type="hidden" name="appointmentId" value={prefill.appointmentId} />
      ) : null}

      {/* ---- the menu ------------------------------------------------ */}
      <div className="min-w-0 flex-[999_1_460px] space-y-4">
        {prefill ? (
          <Flash tone="info">
            Checking out {prefill.customerName}&rsquo;s booking. The services and the customer
            are filled in from the diary, and anything already paid is taken off what the till
            asks for.
          </Flash>
        ) : null}

        {state.message ? <Flash tone="error">{state.message}</Flash> : null}

        <ServiceTiles
          services={pickable}
          currency={currency}
          counts={counts}
          onAdd={(id) => addServices([id])}
        />
        {state.errors?.lines ? (
          <p className="text-small font-semibold text-critical-fg">{state.errors.lines}</p>
        ) : null}
      </div>

      {/* ---- the current sale ---------------------------------------- */}
      <Card
        role="region"
        aria-label="Current sale"
        className="min-w-0 flex-[1_1_360px] space-y-4 lg:sticky lg:top-4"
      >
        <h2 className="font-heading text-section font-semibold">Current sale</h2>

        <div className="space-y-3">
          {/*
            The booking's customer is already known, so the desk should not
            have to search for them again. `was()` reads only from a REJECTED
            sale, which is empty on a fresh "Raise the bill" -- the prefill is
            the fallback. Getting this wrong is invisible in the loyalty
            balance, which is driven by the Till's own state and so looked
            right while the picker sat empty.
          */}
          <CustomerPicker
            idPrefix="pos"
            errors={state.errors ?? {}}
            defaultMode={was("customerMode") === "new" ? "new" : "existing"}
            defaultCustomerId={was("customerId", prefill?.customerId ?? "")}
            defaultCustomerLabel={prefill?.customerLabel ?? ""}
            defaultName={was("newCustomerName")}
            defaultPhone={was("newCustomerPhone")}
            onCustomerChange={chooseCustomer}
          />

          {customerId ? (
            <div className="rounded-[10px] bg-head px-3 py-2">
              <p className="text-fine font-semibold tracking-[0.05em] text-muted uppercase">
                Loyalty balance
              </p>
              <p className="mt-0.5 font-heading text-section font-semibold tabular-nums">
                {formatMoney(balance, currency)}
              </p>
            </div>
          ) : null}
        </div>

        <div>
          <p className="mb-2 text-small text-muted">
            Each line records who performed it — that is what payroll reads.
          </p>
          {lines.length === 0 ? (
            <p className="py-4 text-center text-muted">Tap a service to add it to the sale.</p>
          ) : (
            <ul className="divide-y divide-line-soft">
              {lines.map((line) => {
                const service = serviceById.get(line.serviceId);
                return (
                  <li key={line.key} className="space-y-2 py-3 first:pt-0">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold">{service?.name ?? "Service"}</p>
                        <p className="text-fine text-muted">{service?.category}</p>
                      </div>
                      <p className="font-semibold tabular-nums">
                        {formatMoney(service ? Number(service.price) * line.quantity : 0, currency)}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-end gap-2">
                      <Field
                        label="Performed by"
                        htmlFor={`staff-${line.key}`}
                        className="min-w-36 flex-1"
                      >
                        <Select
                          id={`staff-${line.key}`}
                          value={line.staffId}
                          onChange={(event) => updateLine(line.key, { staffId: event.target.value })}
                        >
                          {therapists.map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.name}
                            </option>
                          ))}
                        </Select>
                      </Field>
                      <Field label="Qty" htmlFor={`qty-${line.key}`}>
                        <Input
                          id={`qty-${line.key}`}
                          type="number"
                          min={1}
                          max={99}
                          value={line.quantity}
                          onChange={(event) =>
                            updateLine(line.key, { quantity: Number(event.target.value) || 1 })
                          }
                          className="w-20"
                        />
                      </Field>
                      <Button type="button" variant="ghost" onClick={() => removeLine(line.key)}>
                        Remove
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <Field label="Deal" htmlFor="pos-deal" error={state.errors?.dealId}>
          <Select
            id="pos-deal"
            name="dealId"
            value={dealId}
            onChange={(event) => setDealId(event.target.value)}
          >
            <option value="">No deal</option>
            {deals.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </Select>
        </Field>

        <Field
          label="Redeem loyalty"
          htmlFor="pos-redeem"
          error={state.errors?.loyaltyRedeem}
          hint={`Up to ${formatMoney(maxRedeem, currency)} — the lower of the balance and the bill.`}
        >
          <div className="flex items-center gap-2">
            <Input
              id="pos-redeem"
              type="number"
              step="0.01"
              min="0"
              max={maxRedeem}
              value={redeem}
              onChange={(event) => setRedeem(event.target.value)}
            />
            <Button
              type="button"
              variant="ghost"
              onClick={() => setRedeem(String(maxRedeem))}
              disabled={maxRedeem <= 0}
            >
              Max
            </Button>
          </div>
        </Field>

        <dl className="space-y-1.5 border-t border-dashed border-field pt-4 text-small">
          <Row label="Subtotal" value={formatMoney(gross, currency)} />
          {discount > 0 ? (
            <Row label={`Deal (${deal?.name})`} value={`− ${formatMoney(discount, currency)}`} />
          ) : null}
          {redeemValue > 0 ? (
            <Row label="Loyalty redeemed" value={`− ${formatMoney(redeemValue, currency)}`} />
          ) : null}
          <div className="flex items-center justify-between pt-1 font-semibold text-ink">
            <dt>Total</dt>
            <dd className="font-heading text-kpi tabular-nums">{formatMoney(total, currency)}</dd>
          </div>

          {deposit > 0 ? (
            <>
              <Row label="Already paid" value={`− ${formatMoney(deposit, currency)}`} />
              <div className="flex items-center justify-between border-t border-line pt-2 font-semibold text-accent-d">
                <dt>{overpaid > 0 ? "To refund" : "To collect now"}</dt>
                <dd className="tabular-nums">
                  {formatMoney(overpaid > 0 ? overpaid : dueNow, currency)}
                </dd>
              </div>
            </>
          ) : null}

          {overpaid > 0 ? (
            <p className="pt-1 text-fine text-warning-fg">
              The deposit is larger than the bill. The sale will go through collecting nothing,
              and the difference shows as owed back on the appointment, where it can be refunded.
            </p>
          ) : null}

          <p className="pt-1 text-fine text-muted">
            Shown as a guide. The receipt is calculated on the server from the price list.
          </p>
        </dl>

        <div>
          <p className="mb-1.5 text-small font-semibold">
            Payment method
          </p>
          <SegmentedControl
            aria-label="Payment method"
            fullWidth
            options={PAY_METHODS}
            value={paymentMethod}
            onValueChange={setPaymentMethod}
          />
          {state.errors?.paymentMethod ? (
            <p role="alert" className="mt-1.5 text-fine text-critical-fg">
              {state.errors.paymentMethod}
            </p>
          ) : null}
        </div>

        {paymentMethod === "split" ? (
          <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(110px,1fr))]">
            <Field label="Cash" htmlFor="pos-cash" error={state.errors?.cashAmount}>
              <Input
                id="pos-cash"
                name="cashAmount"
                type="number"
                step="0.01"
                min="0"
                value={cash}
                onChange={(event) => setCash(event.target.value)}
              />
            </Field>
            <Field label="Card" htmlFor="pos-card" error={state.errors?.cardAmount}>
              <Input
                id="pos-card"
                name="cardAmount"
                type="number"
                step="0.01"
                min="0"
                value={card}
                onChange={(event) => setCard(event.target.value)}
              />
            </Field>
            <Field label="Bank transfer" htmlFor="pos-transfer" error={state.errors?.transferAmount}>
              <Input
                id="pos-transfer"
                name="transferAmount"
                type="number"
                step="0.01"
                min="0"
                value={transfer}
                onChange={(event) => setTransfer(event.target.value)}
              />
            </Field>
          </div>
        ) : null}

        {splitMismatch ? (
          <Flash tone="warning">
            The split adds up to {formatMoney(splitTotal, currency)}, but the total is{" "}
            {formatMoney(dueNow, currency)}. The server will refuse this.
          </Flash>
        ) : null}

        <Field label="Receipt note" htmlFor="pos-notes" error={state.errors?.notes}>
          <Input
            id="pos-notes"
            name="notes"
            defaultValue={was("notes")}
            placeholder="Anything to record on the receipt"
          />
        </Field>

        <SubmitButton className="w-full" pendingLabel="Taking payment...">
          {deposit > 0 ? `Take ${formatMoney(dueNow, currency)}` : "Take payment"}
        </SubmitButton>
      </Card>
    </form>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-muted">
      <dt>{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  );
}
