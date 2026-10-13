import Link from "next/link";

import type { DiaryAppointment } from "./diary-data";
import { STATUS_TINT } from "@/lib/appointment-status";
import { cn } from "@/components/ui/cn";
import { formatDayLabel, minutesFromTime, weekdayKey } from "@/lib/time";
import type { BusinessHours } from "@/lib/types/database";

const DEFAULT_HOURS = { open: "09:00", close: "18:00", closed: false };
const CHIPS_PER_DAY = 3;

/**
 * The week as seven day cards: how many are booked, a bar for how full the
 * day is, the first few appointments as links, and "+N more" through to that
 * day. Built only from the appointments already loaded.
 *
 * "How full" is booked minutes against the opening hours of every team member
 * on show, so a day with one therapist in a four-therapist salon reads as
 * quiet, not full.
 */
export function WeekCards({
  days,
  appointments,
  businessHours,
  teamSize,
  today,
}: {
  days: string[];
  appointments: DiaryAppointment[];
  businessHours: BusinessHours | null;
  teamSize: number;
  today: string;
}) {
  return (
    <div className="overflow-x-auto">
      <div className="grid min-w-[880px] gap-2.5 [grid-template-columns:repeat(7,minmax(120px,1fr))]">
        {days.map((day) => {
          const hours = businessHours?.[weekdayKey(day)] ?? DEFAULT_HOURS;
          const mine = appointments
            .filter((a) => a.localDate === day)
            .sort((a, b) => a.localStart.localeCompare(b.localStart));

          const booked = mine.reduce(
            (sum, a) => sum + (minutesFromTime(a.localEnd) - minutesFromTime(a.localStart)),
            0,
          );
          const capacity = hours.closed
            ? 0
            : (minutesFromTime(hours.close) - minutesFromTime(hours.open)) * teamSize;
          const fill = capacity > 0 ? Math.min(100, Math.round((booked / capacity) * 100)) : 0;
          const more = mine.length - CHIPS_PER_DAY;

          return (
            <section
              key={day}
              aria-label={formatDayLabel(day)}
              className={cn(
                "flex min-h-[260px] flex-col gap-2 rounded-xl border bg-surface p-3",
                day === today ? "border-accent" : "border-line",
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <strong>{formatDayLabel(day)}</strong>
                <span className="text-small text-muted">{hours.closed ? "—" : mine.length}</span>
              </div>

              <div
                role="progressbar"
                aria-label="How full the day is"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={fill}
                className="h-1.5 overflow-hidden rounded-full bg-track"
              >
                <div className="h-full rounded-full bg-accent" style={{ width: `${fill}%` }} />
              </div>

              {mine.slice(0, CHIPS_PER_DAY).map((a) => (
                <Link
                  key={a.id}
                  href={`/dashboard/calendar/${a.id}`}
                  className={cn(
                    "block rounded-lg px-2 py-1.5 text-fine no-underline",
                    STATUS_TINT[a.status],
                  )}
                >
                  <strong className="block truncate">
                    {a.localStart} · {a.customerName}
                  </strong>
                  <span className="block truncate">{a.blockTitle}</span>
                </Link>
              ))}

              {more > 0 ? (
                <Link
                  href={`/dashboard/calendar?tab=day&date=${day}`}
                  className="text-fine font-semibold text-accent hover:underline"
                >
                  +{more} more
                </Link>
              ) : null}

              {hours.closed ? <p className="my-auto text-small text-muted">Closed</p> : null}
            </section>
          );
        })}
      </div>
    </div>
  );
}
