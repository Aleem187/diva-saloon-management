import { Suspense } from "react";
import type { Metadata } from "next";

import { ReceiptsTab } from "./receipts-tab";
import { TillTab } from "./till-tab";
import { PageFlash } from "@/components/page-flash";
import { PageHeader } from "@/components/ui/page-header";
import { PageTabs } from "@/components/ui/page-tabs";
import { TabFallback } from "@/components/ui/tab-fallback";
import { TabPanel } from "@/components/ui/tab-panel";
import { requireModule } from "@/lib/auth/session";
import { resolveTabs, type TabDefinition } from "@/lib/tabs";

export const metadata: Metadata = { title: "POS" };

const TABS: TabDefinition[] = [
  { id: "till", label: "Till" },
  { id: "receipts", label: "Receipts" },
];

export default async function PosPage({ searchParams }: PageProps<"/dashboard/pos">) {
  const session = await requireModule("pos");
  const params = await searchParams;

  /*
   * ?tab= decides. A link that carries a date range or a status filter -- the
   * ones the receipts list has always produced -- and no tab means "show me
   * those receipts", so it opens Receipts rather than the till.
   */
  const asksForReceipts = "from" in params || "to" in params || "status" in params;
  const requested = typeof params.tab === "string" ? params.tab : asksForReceipts ? "receipts" : undefined;

  // Only the active tab below is rendered, so nothing else is fetched.
  const { tabs, active } = resolveTabs(session, TABS, requested);

  return (
    <>
      <PageHeader
        title="Point of sale"
        subtitle="Prices, discounts, loyalty and the total are all calculated on the server — the till only says what was done."
      />

      <PageFlash />

      {active ? (
        <>
          <PageTabs tabs={tabs} active={active} basePath="/dashboard/pos" label="POS sections" />

          <TabPanel id={active}>
            {/*
              Keyed on the tab AND the booking being checked out, so moving from
              one booking's checkout straight to another remounts the till: the
              basket and the chosen customer are seeded once in useState.
            */}
            <Suspense
              key={`${active}-${typeof params.appointment === "string" ? params.appointment : ""}`}
              fallback={<TabFallback kpis={0} bodyHeight={420} />}
            >
              {active === "till" ? <TillTab params={params} /> : null}
              {active === "receipts" ? <ReceiptsTab params={params} /> : null}
            </Suspense>
          </TabPanel>
        </>
      ) : null}
    </>
  );
}
