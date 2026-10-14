import { Suspense } from "react";
import type { Metadata } from "next";

import { AccessTab } from "./access-tab";
import { TodayTab } from "./today-tab";
import { TrialTab } from "./trial-tab";
import { Flash } from "@/components/ui/flash";
import { PageHeader } from "@/components/ui/page-header";
import { PageTabs } from "@/components/ui/page-tabs";
import { TabFallback } from "@/components/ui/tab-fallback";
import { TabPanel } from "@/components/ui/tab-panel";
import { requireSession } from "@/lib/auth/session";
import { ownerOnly, resolveTabs, type TabDefinition } from "@/lib/tabs";

export const metadata: Metadata = { title: "Overview" };

const TABS: TabDefinition[] = [
  { id: "today", label: "Today" },
  { id: "trial", label: "Trial & plan", visibleFor: ownerOnly },
  { id: "access", label: "Your access" },
];

export default async function DashboardPage({ searchParams }: PageProps<"/dashboard">) {
  const session = await requireSession();
  const params = await searchParams;
  const { profile, salon } = session;

  // Which tabs this visitor may use, and which is active. Only the active tab
  // below is rendered, so nothing else is fetched.
  const { tabs, active } = resolveTabs(session, TABS, params.tab);

  return (
    <>
      <PageHeader
        title={`Welcome${profile.full_name ? `, ${profile.full_name.split(" ")[0]}` : ""}`}
        subtitle={`${session.role?.name ?? "No role"} at ${salon.name}`}
      />

      {params.denied ? (
        <Flash tone="warning" className="mb-4">
          You don&rsquo;t have access to that area.
        </Flash>
      ) : null}

      {active ? (
        <>
          <PageTabs tabs={tabs} active={active} basePath="/dashboard" label="Overview sections" />

          <TabPanel id={active}>
            {/* Keyed on the tab, so switching shows the fallback for the new one. */}
            <Suspense key={active} fallback={<TabFallback kpis={1} bodyHeight={220} />}>
              {active === "today" ? <TodayTab /> : null}
              {active === "trial" ? <TrialTab /> : null}
              {active === "access" ? <AccessTab /> : null}
            </Suspense>
          </TabPanel>
        </>
      ) : null}
    </>
  );
}
