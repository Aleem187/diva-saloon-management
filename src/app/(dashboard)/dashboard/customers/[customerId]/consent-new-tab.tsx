import { ConsentForm } from "./consent-form";
import { Card, CardTitle } from "@/components/ui/card";
import { requireSession } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { formatDayLabel, instantToSalonDate, instantToSalonTime } from "@/lib/time";
import type {
  AppointmentRow,
  ConsentTemplateItemRow,
  ConsentTemplateRow,
  ServiceRow,
} from "@/lib/types/database";

/** Customer › New consent: collect and sign a form. */
export async function ConsentNewTab({ customerId }: { customerId: string }) {
  const session = await requireSession();
  const supabase = await createClient();
  const timeZone = session.salon.timezone;

  const [{ data: services }, { data: templates }, { data: templateItems }, { data: appointments }] =
    await Promise.all([
      supabase.from("services").select("*").eq("is_active", true).order("name"),
      supabase.from("consent_templates").select("*").eq("is_active", true).order("name"),
      supabase.from("consent_template_items").select("*").order("sort_order"),
      // RLS narrows this to the caller: a therapist sees only their own visits
      // with this customer.
      supabase
        .from("appointments")
        .select("*")
        .eq("customer_id", customerId)
        .order("starts_at", { ascending: false }),
    ]);

  const serviceById = new Map<string, string>();
  for (const s of (services ?? []) as ServiceRow[]) serviceById.set(s.id, s.name);

  const itemsByTemplate: Record<string, ConsentTemplateItemRow[]> = {};
  for (const item of (templateItems ?? []) as ConsentTemplateItemRow[]) {
    (itemsByTemplate[item.template_id] ??= []).push(item);
  }

  // Only visits that actually happened, or are about to, are worth attaching a
  // consent form to.
  const attachable = ((appointments ?? []) as AppointmentRow[])
    .filter((a) => a.status !== "cancelled" && a.status !== "no_show")
    .slice(0, 25)
    .map((a) => ({
      id: a.id,
      serviceId: a.service_id,
      label: `${formatDayLabel(instantToSalonDate(a.starts_at, timeZone))} ${instantToSalonTime(
        a.starts_at,
        timeZone,
      )} — ${serviceById.get(a.service_id) ?? "Treatment"}`,
    }));

  return (
    <Card className="max-w-3xl">
      <CardTitle>Collect a new consent form</CardTitle>
      <p className="-mt-2 mb-4 text-small text-muted">
        Recorded against you as the collecting team member.
      </p>
      <ConsentForm
        customerId={customerId}
        services={(services ?? []) as ServiceRow[]}
        templates={(templates ?? []) as ConsentTemplateRow[]}
        itemsByTemplate={itemsByTemplate}
        appointments={attachable}
      />
    </Card>
  );
}
