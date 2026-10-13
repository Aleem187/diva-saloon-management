import { setServiceActiveAction } from "./actions";
import { ServiceForm } from "./service-form";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Pill } from "@/components/ui/pill";
import { StatTile } from "@/components/ui/stat-tile";
import { requireModule } from "@/lib/auth/session";
import { formatDuration, formatMoney } from "@/lib/format";
import { groupByCategory } from "@/lib/services";
import { createClient } from "@/lib/supabase/server";
import type {
  ConsentTemplateRow,
  ServiceRow,
  ServiceStaffRow,
  TeamMemberRow,
} from "@/lib/types/database";

/** Services › Services: the menu, grouped by category. */
export async function ServicesTab() {
  const session = await requireModule("services");
  const supabase = await createClient();
  const currency = session.salon.currency;

  const [{ data: services }, { data: serviceStaff }, { data: templates }, { data: team }] =
    await Promise.all([
      supabase
        .from("services")
        .select("*")
        .order("is_active", { ascending: false })
        .order("category")
        .order("name"),
      supabase.from("service_staff").select("*"),
      supabase
        .from("consent_templates")
        .select("*")
        .order("is_active", { ascending: false })
        .order("name"),
      supabase.from("team_members").select("*").eq("is_active", true).order("full_name"),
    ]);

  // Everyone on the roster, which is exactly the set who perform treatments.
  const therapists = (team ?? []) as TeamMemberRow[];
  const activeTemplates = (templates ?? []).filter((t: ConsentTemplateRow) => t.is_active);
  const all = (services ?? []) as ServiceRow[];
  const active = all.filter((s) => s.is_active);

  const staffByService = new Map<string, string[]>();
  for (const link of (serviceStaff ?? []) as ServiceStaffRow[]) {
    staffByService.set(link.service_id, [...(staffByService.get(link.service_id) ?? []), link.staff_id]);
  }

  const nameById = new Map<string, string>();
  for (const p of therapists) nameById.set(p.id, p.full_name);
  for (const t of (templates ?? []) as ConsentTemplateRow[]) nameById.set(t.id, t.name);

  return (
    <div className="space-y-4">
      <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(190px,1fr))]">
        <StatTile label="Active services" value={active.length} />
        <StatTile label="Categories" value={groupByCategory(active).length} />
        <StatTile
          label="Need a consent form"
          value={active.filter((s) => s.consent_template_id).length}
        />
      </div>

      {all.length === 0 ? (
        <EmptyState>No services yet. Add your first one from the Add service tab.</EmptyState>
      ) : (
        groupByCategory(all).map(([category, inCategory]) => (
          <Card key={category} padding="none">
            <CardHeader
              title={category}
              description="Archiving keeps a service out of new bookings and bills without disturbing past records."
            />
            <ul className="divide-y divide-line-soft">
              {inCategory.map((service) => {
                const assigned = staffByService.get(service.id) ?? [];
                return (
                  <li key={service.id} className="px-5 py-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="flex flex-wrap items-center gap-2 font-semibold">
                          <span>{service.name}</span>
                          {!service.is_active ? <Pill tone="critical">Archived</Pill> : null}
                          {service.consent_template_id ? (
                            <Pill tone="accent">
                              Consent: {nameById.get(service.consent_template_id) ?? "template"}
                            </Pill>
                          ) : null}
                        </p>
                        <p className="mt-0.5 text-small text-muted">
                          {formatMoney(service.price, currency)} &middot;{" "}
                          {formatDuration(service.duration_minutes)} &middot;{" "}
                          {assigned.length === 0
                            ? "any therapist"
                            : assigned.map((id) => nameById.get(id) ?? "?").join(", ")}
                        </p>
                        {service.description ? (
                          <p className="mt-1 text-small text-muted">{service.description}</p>
                        ) : null}
                      </div>

                      <div className="flex items-start gap-2">
                        <ServiceForm
                          therapists={therapists}
                          templates={activeTemplates}
                          currency={currency}
                          service={service}
                          assignedStaffIds={assigned}
                        />
                        <form action={setServiceActiveAction}>
                          <input type="hidden" name="serviceId" value={service.id} />
                          <input
                            type="hidden"
                            name="isActive"
                            value={service.is_active ? "false" : "true"}
                          />
                          <Button
                            type="submit"
                            variant={service.is_active ? "danger" : "ghost"}
                            size="sm"
                          >
                            {service.is_active ? "Archive" : "Restore"}
                          </Button>
                        </form>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </Card>
        ))
      )}
    </div>
  );
}
