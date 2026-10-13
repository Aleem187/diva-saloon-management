import { Suspense } from "react";
import type { Metadata } from "next";

import { GenerateTab } from "./generate-tab";
import { PeriodsTab } from "./periods-tab";
import { SettingsTab } from "./settings-tab";
import { PageFlash } from "@/components/page-flash";
import { PageHeader } from "@/components/ui/page-header";
import { PageTabs } from "@/components/ui/page-tabs";
import { TabFallback } from "@/components/ui/tab-fallback";
import { TabPanel } from "@/components/ui/tab-panel";
import { requireModule } from "@/lib/auth/session";
import { resolveTabs, type TabDefinition } from "@/lib/tabs";

export const metadata: Metadata = { title: "Payroll" };

const TABS: TabDefinition[] = [
  { id: "periods", label: "Pay periods" },
  { id: "generate", label: "Generate period" },
  { id: "settings", label: "Pay settings" },
];

export default async function PayrollPage({ searchParams }: PageProps<"/dashboard/payroll">) {
  // The payroll module, exactly as before: the owner holds every module, and a
  // role may be given this one. Row Level Security is the real boundary.
  const session = await requireModule("payroll");
  const params = await searchParams;

  // Only the active tab below is rendered, so nothing else is fetched.
  const { tabs, active } = resolveTabs(session, TABS, params.tab);

  const periodId = typeof params.period === "string" ? params.period : "";
  const editId = typeof params.edit === "string" ? params.edit : "";

  return (
    <>
      <PageHeader
        title="Payroll"
        subtitle="Commission is read straight from the receipts, voided ones excluded, and counted by your salon's own timezone. Salaries are pro-rated across the period."
      />

      <PageFlash />

      {active ? (
        <>
          <PageTabs tabs={tabs} active={active} basePath="/dashboard/payroll" label="Payroll sections" />

          <TabPanel id={active}>
            <Suspense key={active} fallback={<TabFallback kpis={0} bodyHeight={360} />}>
              {active === "periods" ? <PeriodsTab periodId={periodId} /> : null}
              {active === "generate" ? <GenerateTab /> : null}
              {active === "settings" ? <SettingsTab editId={editId} /> : null}
            </Suspense>
          </TabPanel>
        </>
      ) : null}
    </>
  );
}
