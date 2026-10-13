import { STATUS_TINT } from "@/lib/appointment-status";
import { Card } from "@/components/ui/card";
import { cn } from "@/components/ui/cn";
import { formatDayLabel, minutesFromTime, timeFromMinutes, weekdayKey } from "@/lib/time";
import type { AppointmentStatus, BusinessHours } from "@/lib/types/database";

interface GridAppointment {
  id: string;
  staffId: string;
  date: string;
  start: string;
  end: string;
  status: AppointmentStatus;
  isWalkIn: boolean;
  title: string;
  subtitle: string;
}

/** One pixel per minute would be huge; this keeps an hour readable but compact. */
const PX_PER_MINUTE = 1.1;

/**
 * The diary grid.
 *
 * A day view gives each therapist a column; a week view gives each day a
 * column for the single therapist in focus, or stacks therapists per day.
 * Times are already salon-local by the time they arrive here.
 */
export function CalendarGrid({
  days,
  columns,
  appointments,
  openMinutes,
  closeMinutes,
  businessHours,
  view,
}: {
  days: string[];
  columns: { id: string; name: string }[];
  appointments: GridAppointment[];
  openMinutes: number;
  closeMinutes: number;
  businessHours: BusinessHours | null;
  view: "day" | "week";
}) {
  const totalMinutes = Math.max(60, closeMinutes - openMinutes);
  const height = totalMinutes * PX_PER_MINUTE;

  // Hour lines across the whole opening span.
  const firstHour = Math.floor(openMinutes / 60);
  const lastHour = Math.ceil(closeMinutes / 60);
  const hours = Array.from({ length: lastHour - firstHour + 1 }, (_, i) => (firstHour + i) * 60);

  // In week view the columns are days; in day view they are therapists.
  const headers =
    view === "week"
      ? days.map((day) => ({ key: day, label: formatDayLabel(day), day }))
      : columns.map((column) => ({ key: column.id, label: column.name, day: days[0] }));

  function slotsFor(headerKey: string, day: string): GridAppointment[] {
    return view === "week"
      ? appointments.filter((a) => a.date === day)
      : appointments.filter((a) => a.date === day && a.staffId === headerKey);
  }

  return (
    <Card padding="none" className="overflow-hidden">
      <div className="overflow-x-auto">
        <div className="min-w-2xl">
          {/* Column headings */}
          <div
            className="grid border-b border-line bg-head"
            style={{ gridTemplateColumns: `4rem repeat(${headers.length}, minmax(9rem, 1fr))` }}
          >
            <div className="px-2 py-2.5 text-fine font-medium text-muted">Time</div>
            {headers.map((header) => {
              const closed = businessHours?.[weekdayKey(header.day)]?.closed ?? false;
              return (
                <div
                  key={header.key}
                  className="border-l border-line px-2.5 py-2.5 text-small font-semibold text-ink"
                >
                  {header.label}
                  {closed ? <span className="ml-1 font-normal text-muted">(closed)</span> : null}
                </div>
              );
            })}
          </div>

          {/* Body */}
          <div
            className="relative grid"
            style={{
              gridTemplateColumns: `4rem repeat(${headers.length}, minmax(9rem, 1fr))`,
              height: `${height}px`,
            }}
          >
            {/* Hour gutter */}
            <div className="relative">
              {hours.map((minute) => (
                <div
                  key={minute}
                  className="absolute right-2 -translate-y-1/2 text-fine tabular-nums text-muted"
                  style={{ top: `${(minute - openMinutes) * PX_PER_MINUTE}px` }}
                >
                  {timeFromMinutes(minute)}
                </div>
              ))}
            </div>

            {headers.map((header) => {
              const closed = businessHours?.[weekdayKey(header.day)]?.closed ?? false;
              return (
                <div
                  key={header.key}
                  className={cn("relative border-l border-line", closed && "bg-head")}
                >
                  {/* Hour rules */}
                  {hours.map((minute) => (
                    <div
                      key={minute}
                      className="absolute inset-x-0 border-t border-line-soft"
                      style={{ top: `${(minute - openMinutes) * PX_PER_MINUTE}px` }}
                    />
                  ))}

                  {slotsFor(header.key, header.day).map((appointment) => {
                    const start = minutesFromTime(appointment.start);
                    const end = minutesFromTime(appointment.end);
                    const top = (start - openMinutes) * PX_PER_MINUTE;
                    const blockHeight = Math.max(18, (end - start) * PX_PER_MINUTE);

                    return (
                      <div
                        key={appointment.id}
                        className={cn(
                          "absolute inset-x-1.5 overflow-hidden rounded-[10px] px-2 py-1 text-fine leading-tight",
                          STATUS_TINT[appointment.status],
                        )}
                        style={{ top: `${top}px`, height: `${blockHeight}px` }}
                        title={`${appointment.start}–${appointment.end} · ${appointment.title} · ${appointment.subtitle}`}
                      >
                        <p className="truncate font-semibold">
                          {appointment.start} {appointment.title}
                        </p>
                        <p className="truncate opacity-80">
                          {appointment.subtitle}
                          {appointment.isWalkIn ? " · walk-in" : ""}
                        </p>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </Card>
  );
}
