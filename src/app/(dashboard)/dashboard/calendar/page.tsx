import { Suspense } from "react";
import type { Metadata } from "next";

import { AgendaTab } from "./agenda-tab";
import { BookingTab } from "./booking-tab";
import { DiaryTab } from "./diary-tab";
import { diaryRange, requestedTab, type DiaryView } from "./diary-range";
import { isFrontDeskSession } from "@/lib/front-desk";
import { PageFlash } from "@/components/page-flash";
import { PageHeader } from "@/components/ui/page-header";
import { PageTabs } from "@/components/ui/page-tabs";
import { TabFallback } from "@/components/ui/tab-fallback";
import { TabPanel } from "@/components/ui/tab-panel";
import { requireSession } from "@/lib/auth/session";
import { resolveTabs, type TabDefinition } from "@/lib/tabs";
import { formatDayLabel, formatLongDayLabel } from "@/lib/time";

export const metadata: Metadata = { title: "Appointments" };

/*
 * Booking is the front desk's (the legacy test the page has always used; the
 * action also needs the calendar module). A therapist sees the first three.
 */
const TABS: TabDefinition[] = [
  { id: "day", label: "Day" },
  { id: "week", label: "Week" },
  { id: "agenda", label: "Bookings" },
  { id: "book", label: "New booking", visibleFor: isFrontDeskSession },
];

export default async function CalendarPage({ searchParams }: PageProps<"/dashboard/calendar">) {
  const session = await requireSession();
  const params = await searchParams;
  const timeZone = session.salon.timezone;

  // ?tab= (or the older ?view=). Only the active tab below is rendered, so
  // nothing else is fetched.
  const { tabs, active } = resolveTabs(session, TABS, requestedTab(params));

  // The header describes the span on screen, as it always has.
  const view: DiaryView = active === "week" ? "week" : active === "agenda" ? "agenda" : "day";
  const { rangeStart, rangeEnd, requested } = diaryRange(view, params, timeZone);
  const subtitle =
    view === "agenda"
      ? `${formatLongDayLabel(rangeStart)} to ${formatLongDayLabel(rangeEnd)} · times shown in ${timeZone}`
      : view === "week"
        ? `Week of ${formatDayLabel(rangeStart)} · times shown in ${timeZone}`
        : `${formatLongDayLabel(rangeStart)} · times shown in ${timeZone}`;

  return (
    <>
      <PageHeader title="Appointments" subtitle={subtitle} />

      <PageFlash />

      {active ? (
        <>
          <PageTabs
            tabs={tabs}
            active={active}
            basePath="/dashboard/calendar"
            params={{ date: requested }}
            label="Calendar sections"
          />

          <TabPanel id={active}>
            <Suspense key={active} fallback={<TabFallback kpis={2} bodyHeight={420} />}>
              {active === "day" ? <DiaryTab view="day" params={params} /> : null}
              {active === "week" ? <DiaryTab view="week" params={params} /> : null}
              {active === "agenda" ? <AgendaTab params={params} /> : null}
              {active === "book" ? <BookingTab params={params} /> : null}
            </Suspense>
          </TabPanel>
        </>
      ) : null}
    </>
  );
}
