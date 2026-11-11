import { ProductForm } from "./product-form";
import { Card, CardTitle } from "@/components/ui/card";
import { requireModule } from "@/lib/auth/session";
import { distinctCategories } from "@/lib/services";
import { createClient } from "@/lib/supabase/server";

/** Products › Add product. Reads only the categories already in use. */
export async function AddTab() {
  const session = await requireModule("services");
  const supabase = await createClient();

  // Every category in use, archived products included, so a name is not
  // re-invented under a different spelling.
  const { data } = await supabase.from("products").select("category");
  const categories = distinctCategories(((data ?? []) as { category: string }[]).map((r) => r.category));

  return (
    <Card className="max-w-3xl">
      <CardTitle>New product</CardTitle>
      <ProductForm currency={session.salon.currency} categories={categories} />
    </Card>
  );
}
