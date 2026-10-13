import { Suspense } from "react";
import type { Metadata } from "next";

import { AddTab } from "./add-tab";
import { ConsentTab } from "./consent-tab";
import { DealsTab } from "./deals-tab";
import { ServicesTab } from "./services-tab";
import { PageFlash } from "@/components/page-flash";
import { ButtonLink } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { PageTabs } from "@/components/ui/page-tabs";
import { TabFallback } from "@/components/ui/tab-fallback";
import { TabPanel } from "@/components/ui/tab-panel";
import { requireModule } from "@/lib/auth/session";
import { resolveTabs, type TabDefinition } from "@/lib/tabs";

export const metadata: Metadata = { title: "Services" };

const TABS: TabDefinition[] = [
  { id: "services", label: "Services" },
  { id: "add", label: "Add service" },
  { id: "consent", label: "Consent templates" },
  { id: "deals", label: "Deals" },
];

export default async function ServicesPage({ searchParams }: PageProps<"/dashboard/services">) {
  const session = await requireModule("services");
  const params = await searchParams;

  // Only the active tab below is rendered, so nothing else is fetched.
  const { tabs, active } = resolveTabs(session, TABS, params.tab);

  return (
    <>
      <PageHeader
        title="Services & pricing"
        subtitle="What you sell, who can perform it, and the consent wording that applies."
        actions={
          <>
            <ButtonLink href="/dashboard/services?tab=deals" variant="ghost" size="sm">
              New deal
            </ButtonLink>
            <ButtonLink href="/dashboard/services?tab=add" size="sm">
              Add service
            </ButtonLink>
          </>
        }
      />

      <PageFlash />

      {active ? (
        <>
          <PageTabs
            tabs={tabs}
            active={active}
            basePath="/dashboard/services"
            label="Services sections"
          />

          <TabPanel id={active}>
            <Suspense key={active} fallback={<TabFallback kpis={3} bodyHeight={360} />}>
              {active === "services" ? <ServicesTab /> : null}
              {active === "add" ? <AddTab /> : null}
              {active === "consent" ? <ConsentTab /> : null}
              {active === "deals" ? <DealsTab /> : null}
            </Suspense>
          </TabPanel>
        </>
      ) : null}
    </>
  );
}
