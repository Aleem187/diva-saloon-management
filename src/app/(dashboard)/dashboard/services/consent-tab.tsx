import { archiveConsentTemplateAction } from "./actions";
import { ConsentTemplateForm } from "./consent-template-form";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Pill } from "@/components/ui/pill";
import { requireModule } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import type { ConsentTemplateItemRow, ConsentTemplateRow, ServiceRow } from "@/lib/types/database";

/** Services › Consent templates. The wording a signed form copies; editing never changes a signed one. */
export async function ConsentTab() {
  await requireModule("services");
  const supabase = await createClient();

  const [{ data: templates }, { data: templateItems }, { data: services }] = await Promise.all([
    supabase
      .from("consent_templates")
      .select("*")
      .order("is_active", { ascending: false })
      .order("name"),
    supabase.from("consent_template_items").select("*").order("sort_order"),
    supabase.from("services").select("*").order("is_active", { ascending: false }).order("name"),
  ]);

  const itemsByTemplate = new Map<string, ConsentTemplateItemRow[]>();
  for (const item of (templateItems ?? []) as ConsentTemplateItemRow[]) {
    itemsByTemplate.set(item.template_id, [...(itemsByTemplate.get(item.template_id) ?? []), item]);
  }

  const usedBy = new Map<string, string[]>();
  for (const s of (services ?? []) as ServiceRow[]) {
    if (s.consent_template_id) {
      usedBy.set(s.consent_template_id, [...(usedBy.get(s.consent_template_id) ?? []), s.name]);
    }
  }

  const rows = (templates ?? []) as ConsentTemplateRow[];

  return (
    <div className="space-y-4">
      <Card className="max-w-3xl">
        <CardTitle>New template</CardTitle>
        <p className="-mt-2 mb-4 text-small text-muted">
          Treatment-specific wording. A signed form keeps a copy of its statements, so editing a
          template never changes what someone already agreed to.
        </p>
        <ConsentTemplateForm />
      </Card>

      {rows.length === 0 ? (
        <EmptyState>No consent templates yet.</EmptyState>
      ) : (
        <Card padding="none">
          <CardHeader title="Templates" />
          <ul className="divide-y divide-line-soft">
            {rows.map((template) => {
              const items = itemsByTemplate.get(template.id) ?? [];
              const used = usedBy.get(template.id) ?? [];
              return (
                <li
                  key={template.id}
                  className="flex flex-wrap items-start justify-between gap-3 px-5 py-3"
                >
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 font-semibold">
                      {template.name}
                      {!template.is_active ? <Pill tone="critical">Archived</Pill> : null}
                      {template.requires_medical_history ? (
                        <Pill tone="accent">Medical intake</Pill>
                      ) : null}
                    </p>
                    <p className="mt-0.5 text-small text-muted">
                      {used.length > 0 ? `Used by ${used.join(", ")}` : "Not linked to a service"}
                    </p>
                    <ul className="mt-1.5 space-y-0.5">
                      {items.map((item) => (
                        <li key={item.id} className="text-small text-muted">
                          &bull; {item.label}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className="flex items-start gap-2">
                    <ConsentTemplateForm template={template} items={items} />
                    {template.is_active ? (
                      <form action={archiveConsentTemplateAction}>
                        <input type="hidden" name="templateId" value={template.id} />
                        <Button type="submit" variant="danger" size="sm">
                          Archive
                        </Button>
                      </form>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </div>
  );
}
