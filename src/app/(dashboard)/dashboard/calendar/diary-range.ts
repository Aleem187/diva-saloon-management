import {
  addDays,
  daysInRange,
  endOfMonth,
  salonToday,
  startOfMonth,
  startOfWeek,
} from "@/lib/time";

export type DiaryView = "day" | "week" | "agenda";

/**
 * A range longer than this is almost always a typo in the date box, and it
 * would pull an unbounded number of rows into one page.
 */
export const MAX_RANGE_DAYS = 366;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function asDate(value: unknown, fallback: string): string {
  return typeof value === "string" && ISO_DATE.test(value) ? value : fallback;
}

type Params = Record<string, string | string[] | undefined>;

/**
 * Which tab the URL asks for. `?tab=` is the key now; `?view=` is the old one
 * for day / week / agenda and is still honoured, so existing links keep
 * working.
 */
export function requestedTab(params: Params): string | undefined {
  const tab = params.tab;
  if (typeof tab === "string") return tab;
  const view = params.view;
  return typeof view === "string" ? view : undefined;
}

/**
 * The span a diary view covers. Day and week derive it from a single anchor
 * date; agenda takes an explicit pair. Keeping all three as a plain
 * [rangeStart, rangeEnd] means the query, the bucketing and the list are
 * written once. Same rules as before the redesign.
 */
export function diaryRange(
  view: DiaryView,
  params: Params,
  timeZone: string,
): {
  today: string;
  requested: string;
  rangeStart: string;
  rangeEnd: string;
  rangeTooLong: boolean;
  days: string[];
} {
  const today = salonToday(timeZone);
  const requested = asDate(params.date, today);

  let rangeStart: string;
  let rangeEnd: string;
  let rangeTooLong = false;

  if (view === "agenda") {
    rangeStart = asDate(params.from, startOfMonth(today));
    rangeEnd = asDate(params.to, endOfMonth(today));
    // A backwards range is a slip of the date pickers, not a reason to error.
    if (rangeEnd < rangeStart) [rangeStart, rangeEnd] = [rangeEnd, rangeStart];
    if (daysInRange(rangeStart, rangeEnd) > MAX_RANGE_DAYS) {
      rangeEnd = addDays(rangeStart, MAX_RANGE_DAYS - 1);
      rangeTooLong = true;
    }
  } else if (view === "week") {
    rangeStart = startOfWeek(requested);
    rangeEnd = addDays(rangeStart, 6);
  } else {
    rangeStart = requested;
    rangeEnd = requested;
  }

  // The grid still needs a day-by-day list; the agenda builds its own from
  // whichever days actually have appointments.
  const days =
    view === "agenda"
      ? []
      : Array.from({ length: daysInRange(rangeStart, rangeEnd) }, (_, i) => addDays(rangeStart, i));

  return { today, requested, rangeStart, rangeEnd, rangeTooLong, days };
}
