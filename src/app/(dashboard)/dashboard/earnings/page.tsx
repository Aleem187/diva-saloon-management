import { Suspense } from "react";
import type { Metadata } from "next";

import { HistoryTab } from "./history-tab";
import { RecentTab } from "./recent-tab";
import { SummaryTab } from "./summary-tab";
import { Flash } from "@/components/ui/flash";
import { PageHeader } from "@/components/ui/page-header";
import { PageTabs } from "@/components/ui/page-tabs";
import { TabFallback } from "@/components/ui/tab-fallback";
import { TabPanel } from "@/components/ui/tab-panel";
import { requireRole } from "@/lib/auth/session";
import { resolveTabs, type TabDefinition } from "@/lib/tabs";

export const metadata: Metadata = { title: "My earnings" };

const TABS: TabDefinition[] = [
  { id: "summary", label: "Summary" },
  { id: "history", label: "Payroll history" },
  { id: "recent", label: "Recent services" },
];

export default async function EarningsPage({ searchParams }: PageProps<"/dashboard/earnings">) {
  // Read-only, and scoped to the caller by RLS rather than by the queries:
  // payroll_entries and receipt_line_items both restrict a therapist to their
  // own rows, and staff_compensation to their own rate. The legacy role test is
  // kept as it was (decision D1), so a receptionist-labelled login is still sent
  // back to the dashboard.
  const session = await requireRole("staff", "owner");
  const params = await searchParams;

  // Only the active tab below is rendered, so nothing else is fetched.
  const { tabs, active } = resolveTabs(session, TABS, params.tab);

  return (
    <>
      <PageHeader
        title="My earnings"
        subtitle="Your own services and commission. Payroll itself is run by the salon owner."
      />

      {session.teamMemberId ? null : (
        <Flash tone="info" className="mb-4">
          This account is not linked to anyone on the team, so no services or earnings are
          recorded against it. If that is wrong, an owner can link it from the Team page.
        </Flash>
      )}

      {active ? (
        <>
          <PageTabs tabs={tabs} active={active} basePath="/dashboard/earnings" label="My earnings sections" />

          <TabPanel id={active}>
            <Suspense key={active} fallback={<TabFallback kpis={3} bodyHeight={260} />}>
              {active === "summary" ? <SummaryTab /> : null}
              {active === "history" ? <HistoryTab /> : null}
              {active === "recent" ? <RecentTab /> : null}
            </Suspense>
          </TabPanel>
        </>
      ) : null}
    </>
  );
}
