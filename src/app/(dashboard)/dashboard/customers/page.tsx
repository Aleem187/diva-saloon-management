import { Suspense } from "react";
import type { Metadata } from "next";

import { AddTab } from "./add-tab";
import { DirectoryTab } from "./directory-tab";
import { PageFlash } from "@/components/page-flash";
import { ButtonLink } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { PageTabs } from "@/components/ui/page-tabs";
import { TabFallback } from "@/components/ui/tab-fallback";
import { TabPanel } from "@/components/ui/tab-panel";
import { requireModule } from "@/lib/auth/session";
import { resolveTabs, type TabDefinition } from "@/lib/tabs";

export const metadata: Metadata = { title: "Customers" };

const TABS: TabDefinition[] = [
  { id: "directory", label: "Directory" },
  { id: "add", label: "Add customer" },
];

export default async function CustomersPage({ searchParams }: PageProps<"/dashboard/customers">) {
  // Staff can read customers but not manage them, so this page is front desk.
  const session = await requireModule("customers");
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q.trim() : "";

  // Only the active tab below is rendered, so nothing else is fetched.
  const { tabs, active } = resolveTabs(session, TABS, params.tab);

  return (
    <>
      <PageHeader
        title="Customers"
        subtitle="Look someone up by phone number or name, or add a new profile."
        actions={
          <ButtonLink href="/dashboard/customers?tab=add" variant="ghost" size="sm">
            Add customer
          </ButtonLink>
        }
      />

      <PageFlash />

      {active ? (
        <>
          <PageTabs
            tabs={tabs}
            active={active}
            basePath="/dashboard/customers"
            label="Customer sections"
          />

          <TabPanel id={active}>
            <Suspense key={active} fallback={<TabFallback kpis={0} bodyHeight={360} />}>
              {active === "directory" ? <DirectoryTab q={q} /> : null}
              {active === "add" ? <AddTab /> : null}
            </Suspense>
          </TabPanel>
        </>
      ) : null}
    </>
  );
}
