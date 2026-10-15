import { Suspense } from "react";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { ConsentNewTab } from "./consent-new-tab";
import { ConsentTab } from "./consent-tab";
import { LoyaltyTab } from "./loyalty-tab";
import { ProfileTab } from "./profile-tab";
import { ReceiptsTab } from "./receipts-tab";
import { VisitsTab } from "./visits-tab";
import { PageFlash } from "@/components/page-flash";
import { PageHeader } from "@/components/ui/page-header";
import { PageTabs } from "@/components/ui/page-tabs";
import { Pill } from "@/components/ui/pill";
import { TabFallback } from "@/components/ui/tab-fallback";
import { TabPanel } from "@/components/ui/tab-panel";
import { requireSession } from "@/lib/auth/session";
import { isFrontDeskSession } from "@/lib/front-desk";
import { formatDate, formatMoney } from "@/lib/format";
import { resolveTabs, type TabDefinition } from "@/lib/tabs";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Customer" };

/*
 * Loyalty and Receipts are front-desk information; a therapist gets neither
 * (the legacy owner / receptionist test the page has always used). Everything
 * else is for anyone who can open the profile, and RLS decides what each of
 * them finds inside it.
 */
const TABS: TabDefinition[] = [
  { id: "profile", label: "Profile" },
  { id: "loyalty", label: "Loyalty", visibleFor: isFrontDeskSession },
  { id: "receipts", label: "Receipts", visibleFor: isFrontDeskSession },
  { id: "visits", label: "Visits" },
  { id: "consent", label: "Consent records" },
  { id: "consent-new", label: "New consent" },
];

export default async function CustomerDetailPage({
  params,
  searchParams,
}: PageProps<"/dashboard/customers/[customerId]">) {
  const { customerId } = await params;
  const query = await searchParams;
  const session = await requireSession();
  const supabase = await createClient();

  const canManage = isFrontDeskSession(session);

  /*
   * The customer and their loyalty balance are independent reads, so they are
   * made together. (They used to be one after the other, which added a database
   * round trip to every visit to a customer's page.) Loyalty is front-desk
   * information; a therapist gets none, and the call is not made for them.
   */
  const [{ data: customer }, { data: loyaltyBalance }] = await Promise.all([
    // RLS scopes this to the caller's salon, so a foreign id simply is not found.
    supabase.from("customers").select("*").eq("id", customerId).maybeSingle(),
    canManage
      ? supabase.rpc("customer_loyalty_balance", { p_customer_id: customerId })
      : Promise.resolve({ data: null }),
  ]);

  if (!customer) notFound();

  const { tabs, active } = resolveTabs(session, TABS, query.tab);
  const currency = session.salon.currency;

  return (
    <>
      <PageHeader
        breadcrumb={[{ label: "Customers", href: "/dashboard/customers" }, { label: customer.full_name }]}
        title={customer.full_name}
        subtitle={`${customer.phone}${customer.email ? ` · ${customer.email}` : ""} · customer since ${formatDate(customer.created_at)}`}
        actions={
          canManage ? (
            <Pill tone="good">Loyalty balance {formatMoney(Number(loyaltyBalance ?? 0), currency)}</Pill>
          ) : null
        }
      />

      <PageFlash />

      {active ? (
        <>
          <PageTabs
            tabs={tabs}
            active={active}
            basePath={`/dashboard/customers/${customerId}`}
            label="Customer sections"
          />

          <TabPanel id={active}>
            <Suspense key={active} fallback={<TabFallback kpis={0} bodyHeight={300} />}>
              {active === "profile" ? <ProfileTab customer={customer} canManage={canManage} /> : null}
              {active === "loyalty" ? (
                <LoyaltyTab customerId={customerId} balance={Number(loyaltyBalance ?? 0)} />
              ) : null}
              {active === "receipts" ? <ReceiptsTab customerId={customerId} /> : null}
              {active === "visits" ? <VisitsTab customerId={customerId} /> : null}
              {active === "consent" ? <ConsentTab customerId={customerId} /> : null}
              {active === "consent-new" ? <ConsentNewTab customerId={customerId} /> : null}
            </Suspense>
          </TabPanel>
        </>
      ) : null}
    </>
  );
}
