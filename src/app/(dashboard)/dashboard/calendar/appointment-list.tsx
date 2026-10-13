import Link from "next/link";
import type { ReactNode } from "react";

import { AppointmentActions } from "./appointment-actions";
import type { DiaryAppointment } from "./diary-data";
import { STATUS_LABEL, STATUS_TONE } from "@/lib/appointment-status";
import { Pill } from "@/components/ui/pill";
import { formatMoney } from "@/lib/format";
import { formatDayLabel, formatInstantInSalon } from "@/lib/time";

type Therapist = { id: string; name: string };

/** One appointment: when, what, who, how much, and where it stands. */
function AppointmentDetail({
  appointment,
  showDate,
  currency,
  timeZone,
  bookedByName,
}: {
  appointment: DiaryAppointment;
  showDate: boolean;
  currency: string;
  timeZone: string;
  bookedByName: Map<string, string>;
}) {
  const subtotal = Number(appointment.services_subtotal);
  const discount = Number(appointment.discount_amount);
  const quoted = appointment.quoted_total === null ? null : Number(appointment.quoted_total);

  return (
    <div className="min-w-0">
      <p className="flex flex-wrap items-center gap-2 font-semibold text-ink">
        <span className="tabular-nums">
          {appointment.localStart}&ndash;{appointment.localEnd}
        </span>
        <Link
          href={`/dashboard/calendar/${appointment.id}`}
          className="text-accent hover:underline"
        >
          {appointment.serviceSummary}
        </Link>
        <Pill tone={STATUS_TONE[appointment.status]}>{STATUS_LABEL[appointment.status]}</Pill>
        {appointment.is_walk_in ? <Pill tone="warning">Walk-in</Pill> : null}
        {/*
          The payment state, which is a separate axis from the service
          state: a visit can be paid in advance and not yet done, or done
          and still owed for.
        */}
        {appointment.balance && Number(appointment.balance.amount_paid) > 0 ? (
          Number(appointment.balance.balance) > 0.005 ? (
            <Pill tone="warning">
              Part-paid {formatMoney(appointment.balance.amount_paid, currency)}
            </Pill>
          ) : (
            <Pill tone="good">Paid</Pill>
          )
        ) : null}
      </p>

      <p className="mt-0.5 text-small text-muted">
        {showDate ? `${formatDayLabel(appointment.localDate)} · ` : ""}
        <Link
          href={`/dashboard/customers/${appointment.customer_id}`}
          className="text-accent hover:underline"
        >
          {appointment.customerName}
        </Link>{" "}
        &middot; {appointment.staffName}
      </p>

      {/* Every line, with what each one costs. */}
      {appointment.lines.length > 0 ? (
        <ul className="mt-1.5 space-y-0.5">
          {appointment.lines.map((line) => (
            <li key={line.id} className="text-fine text-muted">
              &bull; {line.service_name}
              {line.quantity > 1 ? ` ×${line.quantity}` : ""}
              <span className="ml-1.5 tabular-nums">
                {formatMoney(Number(line.unit_price) * line.quantity, currency)}
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      <p className="mt-1.5 flex flex-wrap items-baseline gap-x-2 text-fine text-muted">
        <span className="font-semibold tabular-nums text-ink">
          {formatMoney(appointment.price_at_booking, currency)}
        </span>
        {discount > 0 ? (
          <span className="text-good-fg">
            subtotal {formatMoney(subtotal, currency)} &minus; {formatMoney(discount, currency)}{" "}
            discount
          </span>
        ) : null}
        {quoted !== null ? (
          <span className="text-accent-d">
            quoted price, services total {formatMoney(subtotal, currency)}
          </span>
        ) : null}
      </p>

      <p className="mt-1 text-fine text-muted">
        Booked {formatInstantInSalon(appointment.created_at, timeZone)}
        {/* created_by is a LOGIN, not a roster entry -- it records who took
            the booking at the desk, which is a different question from who
            performs it. */}
        {appointment.created_by
          ? ` by ${bookedByName.get(appointment.created_by) ?? "a colleague"}`
          : ""}
      </p>

      {appointment.notes ? <p className="mt-1 text-fine text-muted">{appointment.notes}</p> : null}
      {appointment.resolution_reason ? (
        <p className="mt-1 text-fine text-critical-fg">Reason: {appointment.resolution_reason}</p>
      ) : null}
    </div>
  );
}

/**
 * The detail beside its actions, as one list row. Actions are the front
 * desk's; everyone else gets the detail alone.
 */
export function AppointmentRow({
  appointment,
  showDate,
  isFrontDesk,
  therapists,
  currency,
  timeZone,
  bookedByName,
}: {
  appointment: DiaryAppointment;
  showDate: boolean;
  isFrontDesk: boolean;
  therapists: Therapist[];
  currency: string;
  timeZone: string;
  bookedByName: Map<string, string>;
}): ReactNode {
  return (
    <li className="flex flex-wrap items-start justify-between gap-3 px-5 py-3">
      <AppointmentDetail
        appointment={appointment}
        showDate={showDate}
        currency={currency}
        timeZone={timeZone}
        bookedByName={bookedByName}
      />
      {isFrontDesk ? (
        <AppointmentActions
          appointmentId={appointment.id}
          status={appointment.status}
          staffId={appointment.staff_id}
          date={appointment.localDate}
          time={appointment.localStart}
          therapists={therapists}
        />
      ) : null}
    </li>
  );
}
