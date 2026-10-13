import { Suspense } from "react";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { KitDemo } from "./kit-demo";
import { PageFlash } from "@/components/page-flash";
import { PageHeader } from "@/components/ui/page-header";
import { PageTabs, SubTabs } from "@/components/ui/page-tabs";
import { TabFallback } from "@/components/ui/tab-fallback";
import { TabPanel } from "@/components/ui/tab-panel";
import { fontVariables } from "@/lib/fonts";
import { resolveTabs, type TabDefinition } from "@/lib/tabs";

export const metadata: Metadata = { title: "UI kit (dev)" };

const DEMO_TABS: TabDefinition<null>[] = [
  { id: "one", label: "First" },
  { id: "two", label: "Second (slow)", count: 3 },
  { id: "three", label: "Third" },
];
const DEMO_SUBS: TabDefinition<null>[] = [
  { id: "a", label: "Part A" },
  { id: "b", label: "Part B" },
];

/** A tab body that takes a moment, so the Suspense fallback can be seen. */
async function SlowTab({ name }: { name: string }) {
  await new Promise((resolve) => setTimeout(resolve, 900));
  return <p className="text-muted">{name} finished loading. Only this tab fetched.</p>;
}

/**
 * Every redesign component in every state, for review. Development only: in a
 * production build this route is a 404, so the kit is never reachable by
 * customers.
 *
 * It is not under the dashboard layout, so no salon data is read -- but the
 * proxy still asks for a sign-in like any other non-public route.
 */
export default async function DevUiPage({ searchParams }: PageProps<"/dev/ui">) {
  if (process.env.NODE_ENV === "production") notFound();

  const params = await searchParams;
  const { tabs, active } = resolveTabs(null, DEMO_TABS, params.tab);
  const { tabs: subs, active: sub } = resolveTabs(null, DEMO_SUBS, params.sub);

  const tabsDemo = (
    <div className="space-y-4">
      <PageHeader
        breadcrumb={[{ label: "Calendar", href: "/dev/ui" }, { label: "Appointment" }]}
        title="Page header"
        subtitle="Breadcrumb, title, subtitle and actions."
        actions={<span className="text-small text-muted">actions go here</span>}
      />
      {active ? (
        <>
          <PageTabs tabs={tabs} active={active} basePath="/dev/ui" label="Demo sections" />
          <TabPanel id={active}>
            <Suspense key={active} fallback={<TabFallback kpis={2} bodyHeight={120} />}>
              {active === "two" ? <SlowTab name="Second" /> : <p className="text-muted">The {active} tab.</p>}
            </Suspense>
            {sub ? (
              <div className="mt-4">
                <SubTabs
                  tabs={subs}
                  active={sub}
                  basePath="/dev/ui"
                  params={{ tab: active }}
                  label="Demo parts"
                />
                <TabPanel id={sub} param="sub">
                  <p className="text-muted">Sub-tab {sub}.</p>
                </TabPanel>
              </div>
            ) : null}
          </TabPanel>
        </>
      ) : null}
    </div>
  );

  return <KitDemo fontClass={fontVariables} flashSlot={<PageFlash />} tabsDemo={tabsDemo} />;
}
