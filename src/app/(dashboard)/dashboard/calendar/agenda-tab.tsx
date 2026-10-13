import { AppointmentRow } from "./appointment-list";
import { diaryRange } from "./diary-range";
import { loadDiary } from "./diary-data";
import { ButtonLink, Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/field";
import { requireSession } from "@/lib/auth/session";
import { formatMoney } from "@/lib/format";
import {
  addDays,
  daysInRange,
  endOfMonth,
  formatLongDayLabel,
  startOfMonth,
  startOfWeek,
} from "@/lib/time";
import { MAX_RANGE_DAYS } from "./diary-range";

type Params = Record<string, string | string[] | undefined>;

function agendaHref(from: string, to: string): string {
  return `/dashboard/calendar?tab=agenda&from=${from}&to=${to}`;
}

/** Calendar › Agenda: every appointment in a date range, grouped by day. */
export async function AgendaTab({ params }: { params: Params }) {
  const session = await requireSession();
  const range = diaryRange("agenda", params, session.salon.timezone);
  const { today, rangeStart, rangeEnd, rangeTooLong } = range;

  const diary = await loadDiary(session, range, { withHours: false });
  const { isFrontDesk, therapists, bookedByName, inRange, timeZone, currency } = diary;

  // Chronological: newest-first would read backwards for a schedule.
  const byDay = new Map<string, typeof inRange>();
  for (const appointment of inRange) {
    byDay.set(appointment.localDate, [...(byDay.get(appointment.localDate) ?? []), appointment]);
  }
  const agendaDays = [...byDay.keys()].sort();

  const rangeValue = inRange
    .filter((a) => a.status !== "cancelled" && a.status !== "no_show")
    .reduce((sum, a) => sum + Number(a.price_at_booking), 0);

  const span = daysInRange(rangeStart, rangeEnd);

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-wrap items-center gap-2">
          <ButtonLink
            href={agendaHref(addDays(rangeStart, -span), addDays(rangeStart, -1))}
            variant="ghost"
            size="sm"
          >
            &larr; Previous
          </ButtonLink>
          <ButtonLink href={agendaHref(startOfMonth(today), endOfMonth(today))} variant="ghost" size="sm">
            This month
          </ButtonLink>
          <ButtonLink
            href={agendaHref(addDays(rangeEnd, 1), addDays(rangeEnd, span))}
            variant="ghost"
            size="sm"
          >
            Next &rarr;
          </ButtonLink>
        </div>

        {/*
          A plain GET form: the range lives in the URL, so a particular span is
          linkable and survives a refresh.
        */}
        <form method="get" className="mt-4 flex flex-wrap items-end gap-3">
          <input type="hidden" name="tab" value="agenda" />
          <div className="w-44">
            <label htmlFor="agenda-from" className="mb-1.5 block text-small font-semibold">
              From
            </label>
            <Input id="agenda-from" name="from" type="date" defaultValue={rangeStart} />
          </div>
          <div className="w-44">
            <label htmlFor="agenda-to" className="mb-1.5 block text-small font-semibold">
              To
            </label>
            <Input id="agenda-to" name="to" type="date" defaultValue={rangeEnd} />
          </div>
          <Button type="submit" variant="ghost">
            Show range
          </Button>
        </form>

        <div className="mt-4 flex flex-wrap items-center gap-2 text-small">
          <span className="text-muted">Quick:</span>
          <ButtonLink href={agendaHref(today, today)} variant="ghost" size="sm">
            Today
          </ButtonLink>
          <ButtonLink
            href={agendaHref(startOfWeek(today), addDays(startOfWeek(today), 6))}
            variant="ghost"
            size="sm"
          >
            This week
          </ButtonLink>
          <ButtonLink href={agendaHref(startOfMonth(today), endOfMonth(today))} variant="ghost" size="sm">
            This month
          </ButtonLink>
          <ButtonLink href={agendaHref(addDays(today, -29), today)} variant="ghost" size="sm">
            Last 30 days
          </ButtonLink>
          <ButtonLink href={agendaHref(today, addDays(today, 29))} variant="ghost" size="sm">
            Next 30 days
          </ButtonLink>
        </div>

        {rangeTooLong ? (
          <p className="mt-3 text-small text-warning-fg">
            That range was longer than a year, so it has been trimmed to {MAX_RANGE_DAYS} days.
          </p>
        ) : null}
      </Card>

      <Card padding="none">
        <CardHeader
          title={`${inRange.length} appointment${inRange.length === 1 ? "" : "s"} over ${span} days`}
          description={`Worth ${formatMoney(rangeValue, currency)}, excluding cancellations and no-shows.`}
        />
        {agendaDays.length === 0 ? (
          <p className="px-5 py-6 text-center text-muted">Nothing booked in this range.</p>
        ) : (
          agendaDays.map((day) => (
            <section key={day}>
              <h4 className="flex items-baseline justify-between border-b border-line bg-head px-5 py-2">
                <span className="text-fine font-bold tracking-wide text-muted uppercase">
                  {formatLongDayLabel(day)}
                </span>
                <span className="text-fine text-muted">{byDay.get(day)?.length} booked</span>
              </h4>
              <ul className="divide-y divide-line-soft">
                {(byDay.get(day) ?? []).map((appointment) => (
                  <AppointmentRow
                    key={appointment.id}
                    appointment={appointment}
                    showDate={false}
                    isFrontDesk={isFrontDesk}
                    therapists={therapists.map((t) => ({ id: t.id, name: t.full_name }))}
                    currency={currency}
                    timeZone={timeZone}
                    bookedByName={bookedByName}
                  />
                ))}
              </ul>
            </section>
          ))
        )}
      </Card>
    </div>
  );
}
