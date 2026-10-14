import { ServiceForm } from "./service-form";
import { Card, CardTitle } from "@/components/ui/card";
import { requireModule } from "@/lib/auth/session";
import { distinctCategories } from "@/lib/services";
import { createClient } from "@/lib/supabase/server";
import type { ConsentTemplateRow, TeamMemberRow } from "@/lib/types/database";

/** Services › Add service. Reads only the team and the active consent templates. */
export async function AddTab() {
  const session = await requireModule("services");
  const supabase = await createClient();

  const [{ data: team }, { data: templates }, { data: categoryRows }] = await Promise.all([
    supabase.from("team_members").select("*").eq("is_active", true).order("full_name"),
    supabase
      .from("consent_templates")
      .select("*")
      .order("is_active", { ascending: false })
      .order("name"),
    // Every category in use, archived services included, so a name is not
    // re-invented under a different spelling.
    supabase.from("services").select("category"),
  ]);

  const categories = distinctCategories(
    ((categoryRows ?? []) as { category: string }[]).map((row) => row.category),
  );

  const activeTemplates = ((templates ?? []) as ConsentTemplateRow[]).filter((t) => t.is_active);

  return (
    <Card className="max-w-3xl">
      <CardTitle>New service</CardTitle>
      <ServiceForm
        therapists={(team ?? []) as TeamMemberRow[]}
        templates={activeTemplates}
        currency={session.salon.currency}
        categories={categories}
      />
    </Card>
  );
}
