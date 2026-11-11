import { Suspense } from "react";
import type { Metadata } from "next";

import { AddTab } from "./add-tab";
import { ProductsTab } from "./products-tab";
import { PageFlash } from "@/components/page-flash";
import { ButtonLink } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { PageTabs } from "@/components/ui/page-tabs";
import { TabFallback } from "@/components/ui/tab-fallback";
import { TabPanel } from "@/components/ui/tab-panel";
import { requireModule } from "@/lib/auth/session";
import { resolveTabs, type TabDefinition } from "@/lib/tabs";

export const metadata: Metadata = { title: "Products" };

const TABS: TabDefinition[] = [
  { id: "products", label: "Products" },
  { id: "add", label: "Add product" },
];

export default async function ProductsPage({ searchParams }: PageProps<"/dashboard/products">) {
  const session = await requireModule("services");
  const params = await searchParams;

  // Only the active tab below is rendered, so nothing else is fetched.
  const { tabs, active } = resolveTabs(session, TABS, params.tab);

  return (
    <>
      <PageHeader
        title="Products"
        subtitle="Retail products you sell at the till: price, stock and when to reorder."
        actions={
          <ButtonLink href="/dashboard/products?tab=add" size="sm">
            Add product
          </ButtonLink>
        }
      />

      <PageFlash />

      {active ? (
        <>
          <PageTabs
            tabs={tabs}
            active={active}
            basePath="/dashboard/products"
            label="Products sections"
          />

          <TabPanel id={active}>
            <Suspense key={active} fallback={<TabFallback kpis={3} bodyHeight={360} />}>
              {active === "products" ? <ProductsTab /> : null}
              {active === "add" ? <AddTab /> : null}
            </Suspense>
          </TabPanel>
        </>
      ) : null}
    </>
  );
}
