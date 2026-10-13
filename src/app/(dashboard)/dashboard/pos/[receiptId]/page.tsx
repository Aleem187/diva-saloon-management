import { Suspense } from "react";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { HistoryTab } from "./history-tab";
import { ReceiptTab } from "./receipt-tab";
import { VoidTab } from "./void-tab";
import { PageFlash } from "@/components/page-flash";
import { PageHeader } from "@/components/ui/page-header";
import { PageTabs } from "@/components/ui/page-tabs";
import { Pill } from "@/components/ui/pill";
import { TabFallback } from "@/components/ui/tab-fallback";
import { TabPanel } from "@/components/ui/tab-panel";
import { requireModule } from "@/lib/auth/session";
import { formatDateTime } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { resolveTabs, type TabDefinition } from "@/lib/tabs";
import type { ReceiptRow } from "@/lib/types/database";

export const metadata: Metadata = { title: "Receipt" };

export default async function ReceiptPage({
  params,
  searchParams,
}: PageProps<"/dashboard/pos/[receiptId]">) {
  const { receiptId } = await params;
  const query = await searchParams;
  const session = await requireModule("pos");
  const supabase = await createClient();

  // RLS decides visibility: a receipt from another salon is simply not found.
  const { data: receipt } = await supabase
    .from("receipts")
    .select("*")
    .eq("id", receiptId)
    .maybeSingle();

  if (!receipt) notFound();
  const r = receipt as ReceiptRow;

  // Voiding is the owner's alone, and only an issued receipt can be voided.
  const canVoid = session.profile.role === "owner" && r.status === "issued";

  const tabDefinitions: TabDefinition[] = [
    { id: "receipt", label: "Receipt" },
    { id: "history", label: "Payment history" },
    { id: "void", label: "Void", visibleFor: () => canVoid },
  ];
  const { tabs, active } = resolveTabs(session, tabDefinitions, query.tab);

  return (
    <>
      {/* Everything around the receipt itself stays off the printed page. */}
      <div className="print:hidden">
        <PageHeader
          breadcrumb={[
            { label: "Point of sale", href: "/dashboard/pos?tab=receipts" },
            { label: `Receipt #${r.receipt_number}` },
          ]}
          title={`Receipt #${r.receipt_number}`}
          subtitle={formatDateTime(r.created_at)}
          actions={
            <Pill tone={r.status === "voided" ? "critical" : "good"}>
              {r.status === "voided" ? "Voided" : "Issued"}
            </Pill>
          }
        />

        <PageFlash />

        {active ? (
          <PageTabs
            tabs={tabs}
            active={active}
            basePath={`/dashboard/pos/${receiptId}`}
            label="Receipt sections"
          />
        ) : null}
      </div>

      {active ? (
        <TabPanel id={active}>
          <Suspense key={active} fallback={<TabFallback kpis={0} bodyHeight={420} />}>
            {active === "receipt" ? <ReceiptTab receipt={r} /> : null}
            {active === "history" ? <HistoryTab receipt={r} /> : null}
            {active === "void" ? <VoidTab receiptId={r.id} /> : null}
          </Suspense>
        </TabPanel>
      ) : null}
    </>
  );
}
