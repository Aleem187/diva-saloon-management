import { AppointmentRow } from "./appointment-list";
import { CalendarGrid } from "./calendar-grid";
import { diaryRange } from "./diary-range";
import { loadDiary } from "./diary-data";
import { STATUS_LABEL, STATUS_ORDER, STATUS_TINT } from "@/lib/appointment-status";
import { WeekCards } from "./week-cards";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { cn } from "@/components/ui/cn";
import { EmptyState } from "@/components/ui/empty-state";
import { StatTile } from "@/components/ui/stat-tile";
import { requireSession } from "@/lib/auth/session";
import { formatMoney } from "@/lib/format";
import {
  addDays,
  formatDayLabel,
  formatLongDayLabel,
  minutesFromTime,
  weekdayKey,
} from "@/lib/time";

const DEFAULT_HOURS = { open: "09:00", close: "18:00", closed: false };

type Params = Record<string, string | string[] | undefined>;

/** Calendar › Day and Week: the diary for one day, or seven. */
export async function DiaryTab({ view, params }: { view: "day" | "week"; params: Params }) {
  const session = await requireSession();
  const range = diaryRange(view, params, session.salon.timezone);
  const { today, requested, rangeStart, rangeEnd, days } = range;

  const diary = await loadDiary(session, range, { withHours: true });
  const { isFrontDesk, therapists, columns, businessHours, bookedByName, inRange, timeZone, currency } =
    diary;

  // Bound the grid to the widest opening across the days on screen, so a
  // Saturday with different hours still fits.
  let earliest = 24 * 60;
  let latest = 0;
  for (const day of days) {
    const hours = businessHours?.[weekdayKey(day)] ?? DEFAULT_HOURS;
    if (hours.closed) continue;
    earliest = Math.min(earliest, minutesFromTime(hours.open));
    latest = Math.max(latest, minutesFromTime(hours.close));
  }
  if (earliest >= latest) {
    earliest = minutesFromTime(DEFAULT_HOURS.open);
    latest = minutesFromTime(DEFAULT_HOURS.close);
  }

  const live = inRange.filter((a) => a.status !== "cancelled" && a.status !== "no_show");
  const liveValue = live.reduce((sum, a) => sum + Number(a.price_at_booking), 0);

  const step = view === "week" ? 7 : 1;
  const href = (date: string) => `/dashboard/calendar?tab=${view}&date=${date}`;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(190px,1fr))]">
        <StatTile label={view === "week" ? "Booked this week" : "Booked today"} value={live.length} />
        <StatTile label="Booked value" value={formatMoney(liveValue, currency)} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <ButtonLink href={href(addDays(rangeStart, -step))} variant="ghost" size="sm">
          &larr; Previous
        </ButtonLink>
        <ButtonLink href={href(today)} variant="ghost" size="sm">
          {view === "week" ? "This week" : "Today"}
        </ButtonLink>
        <ButtonLink href={href(addDays(rangeStart, step))} variant="ghost" size="sm">
          Next &rarr;
        </ButtonLink>
        <span className="ml-1 font-heading text-section font-semibold">
          {view === "week"
            ? `${formatDayLabel(rangeStart)} – ${formatDayLabel(rangeEnd)}`
            : formatLongDayLabel(requested)}
        </span>
      </div>

      {view === "day" ? (
        columns.length === 0 ? (
          <EmptyState>
            Nobody on the team roster yet. Add someone from the Team page before booking — they
            do not need a login.
          </EmptyState>
        ) : (
          <CalendarGrid
            days={days}
            columns={columns.map((c) => ({ id: c.id, name: c.full_name }))}
            appointments={live.map((a) => ({
              id: a.id,
              staffId: a.staff_id,
              date: a.localDate,
              start: a.localStart,
              end: a.localEnd,
              status: a.status,
              isWalkIn: a.is_walk_in,
              title: a.blockTitle,
              subtitle: a.customerName,
            }))}
            openMinutes={earliest}
            closeMinutes={latest}
            businessHours={businessHours}
            view="day"
          />
        )
      ) : columns.length === 0 ? (
        <EmptyState>
          Nobody on the team roster yet. Add someone from the Team page before booking — they do
          not need a login.
        </EmptyState>
      ) : (
        <WeekCards
          days={days}
          appointments={live}
          businessHours={businessHours}
          teamSize={columns.length}
          today={today}
        />
      )}

      <ul className="flex flex-wrap gap-x-4 gap-y-2 text-fine text-muted" aria-label="Colour key">
        {STATUS_ORDER.map((status) => (
          <li key={status} className="flex items-center gap-1.5">
            <span aria-hidden className={cn("inline-block h-3 w-4 rounded-sm", STATUS_TINT[status])} />
            {STATUS_LABEL[status]}
          </li>
        ))}
      </ul>

      <Card padding="none">
        <CardHeader
          title={view === "week" ? "Appointments this week" : "Appointments this day"}
          description={
            isFrontDesk
              ? "Cancellations and no-shows keep their reason on the record."
              : "Your own schedule. Booking and status changes are handled at the front desk."
          }
        />
        {inRange.length === 0 ? (
          <p className="px-5 py-6 text-center text-muted">Nothing booked.</p>
        ) : (
          <ul className="divide-y divide-line-soft">
            {inRange.map((appointment) => (
              <AppointmentRow
                key={appointment.id}
                appointment={appointment}
                showDate
                isFrontDesk={isFrontDesk}
                therapists={therapists.map((t) => ({ id: t.id, name: t.full_name }))}
                currency={currency}
                timeZone={timeZone}
                bookedByName={bookedByName}
              />
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
