import { Suspense } from "react";
import type { Metadata } from "next";

import { AccessTab } from "./access-tab";
import { BillingTab } from "./billing-tab";
import { ProfileTab } from "./profile-tab";
import { PageFlash } from "@/components/page-flash";
import { Flash } from "@/components/ui/flash";
import { PageHeader } from "@/components/ui/page-header";
import { PageTabs } from "@/components/ui/page-tabs";
import { TabFallback } from "@/components/ui/tab-fallback";
import { TabPanel } from "@/components/ui/tab-panel";
import { requireSession } from "@/lib/auth/session";
import { ownerOnly, resolveTabs, type TabDefinition } from "@/lib/tabs";

export const metadata: Metadata = { title: "My account" };

/* Billings is the salon's money, so it is the owner's alone. */
const TABS: TabDefinition[] = [
  { id: "profile", label: "Profile" },
  { id: "access", label: "Access" },
  { id: "billing", label: "Billings", visibleFor: ownerOnly },
];

export default async function AccountPage({ searchParams }: PageProps<"/dashboard/account">) {
  const session = await requireSession();
  const params = await searchParams;

  // Which tabs this visitor may use, and which is active. Only the active tab
  // below is rendered, so nothing else is fetched.
  const { tabs, active } = resolveTabs(session, TABS, params.tab);

  return (
    <>
      <PageHeader
        title="My account"
        subtitle="Your personal details and what you can access"
      />

      {/*
        Messages that arrive in the URL are fixed wording picked by a code, never
        text from the URL itself: a link cannot put its own words on screen.
      */}
      {params.reason === "inactive" ? (
        <Flash tone="warning" className="mb-4">
          Your salon&rsquo;s subscription is not active, so the rest of the dashboard is paused.
          Start or restore it below and everything comes back.
        </Flash>
      ) : null}
      {params.checkout === "success" ? (
        <Flash tone="success" className="mb-4">
          Thank you — your subscription is being set up. This page updates as soon as Stripe
          confirms it, which usually takes a few seconds.
        </Flash>
      ) : null}
      {params.checkout === "cancelled" ? (
        <Flash tone="info" className="mb-4">
          Checkout was cancelled. Nothing was charged.
        </Flash>
      ) : null}

      <PageFlash />

      {active ? (
        <>
          <PageTabs
            tabs={tabs}
            active={active}
            basePath="/dashboard/account"
            label="Account sections"
          />

          <TabPanel id={active}>
            {/* Keyed on the tab, so switching shows the fallback for the new one. */}
            <Suspense key={active} fallback={<TabFallback kpis={0} bodyHeight={260} />}>
              {active === "profile" ? <ProfileTab /> : null}
              {active === "access" ? <AccessTab /> : null}
              {active === "billing" ? <BillingTab sub={params.sub} /> : null}
            </Suspense>
          </TabPanel>
        </>
      ) : null}
    </>
  );
}
