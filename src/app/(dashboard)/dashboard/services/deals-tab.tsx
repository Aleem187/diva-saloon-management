import { archiveDealAction } from "./actions";
import { DealForm } from "./deal-form";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Pill, type PillTone } from "@/components/ui/pill";
import { requireModule } from "@/lib/auth/session";
import { formatMoney } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { salonToday } from "@/lib/time";
import type { DealRow, DealServiceRow, ServiceRow } from "@/lib/types/database";

const DEAL_TYPE_LABEL = {
  percentage: "% off",
  fixed_amount: "Amount off",
  bundle_price: "Bundle price",
} as const;

/** Where a deal stands today. Dates only: nothing here is a price. */
function dealStatus(deal: DealRow, today: string): { label: string; tone: PillTone } {
  if (!deal.is_active) return { label: "Archived", tone: "neutral" };
  if (deal.ends_on < today) return { label: "Ended", tone: "neutral" };
  if (deal.starts_on > today) return { label: "Scheduled", tone: "warning" };
  return { label: "Running", tone: "good" };
}

/** Services › Deals: time-boxed offers the front desk applies at checkout. */
export async function DealsTab() {
  const session = await requireModule("services");
  const supabase = await createClient();
  const currency = session.salon.currency;
  const today = salonToday(session.salon.timezone);

  const [{ data: deals }, { data: dealServices }, { data: services }] = await Promise.all([
    supabase
      .from("deals")
      .select("*")
      .order("is_active", { ascending: false })
      .order("ends_on", { ascending: false }),
    supabase.from("deal_services").select("*"),
    supabase.from("services").select("*").order("is_active", { ascending: false }).order("name"),
  ]);

  const activeServices = ((services ?? []) as ServiceRow[]).filter((s) => s.is_active);

  const nameById = new Map<string, string>();
  for (const s of (services ?? []) as ServiceRow[]) nameById.set(s.id, s.name);

  const servicesByDeal = new Map<string, string[]>();
  for (const link of (dealServices ?? []) as DealServiceRow[]) {
    servicesByDeal.set(link.deal_id, [...(servicesByDeal.get(link.deal_id) ?? []), link.service_id]);
  }

  const rows = (deals ?? []) as DealRow[];

  return (
    <div className="space-y-4">
      <Card className="max-w-3xl">
        <CardTitle>Create a deal</CardTitle>
        <DealForm services={activeServices} currency={currency} />
      </Card>

      {rows.length === 0 ? (
        <EmptyState>No deals yet.</EmptyState>
      ) : (
        <div className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(300px,1fr))]">
          {rows.map((deal) => {
            const linked = servicesByDeal.get(deal.id) ?? [];
            const status = dealStatus(deal, today);
            return (
              <Card key={deal.id} className="flex flex-col gap-2">
                <div className="flex items-center justify-between gap-2">
                  <Pill tone={status.tone}>{status.label}</Pill>
                  <span className="text-fine text-muted">{DEAL_TYPE_LABEL[deal.deal_type]}</span>
                </div>
                <p className="font-heading text-kpi font-semibold">
                  {deal.deal_type === "percentage"
                    ? `${deal.value}%`
                    : formatMoney(deal.value, currency)}
                </p>
                <p className="font-semibold">{deal.name}</p>
                <p className="text-small text-muted">
                  {linked.length === 0
                    ? "No services linked"
                    : linked.map((id) => nameById.get(id) ?? "?").join(", ")}
                </p>
                <p className="text-small">
                  {deal.starts_on} to {deal.ends_on}
                </p>
                <div className="mt-1 flex items-start gap-2">
                  <DealForm
                    services={activeServices}
                    currency={currency}
                    deal={deal}
                    linkedServiceIds={linked}
                  />
                  {deal.is_active ? (
                    <form action={archiveDealAction}>
                      <input type="hidden" name="dealId" value={deal.id} />
                      <Button type="submit" variant="danger" size="sm">
                        Archive
                      </Button>
                    </form>
                  ) : null}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
