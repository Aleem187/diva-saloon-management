import { setProductActiveAction } from "./actions";
import { ProductForm } from "./product-form";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Pill } from "@/components/ui/pill";
import { StatTile } from "@/components/ui/stat-tile";
import { requireModule } from "@/lib/auth/session";
import { formatMoney } from "@/lib/format";
import { distinctCategories, groupByCategory } from "@/lib/services";
import { createClient } from "@/lib/supabase/server";
import { isLowStock, type ProductRow } from "@/lib/types/database";

/** Products › Products: the retail catalogue, grouped by category, with stock. */
export async function ProductsTab() {
  const session = await requireModule("services");
  const supabase = await createClient();
  const currency = session.salon.currency;

  const { data } = await supabase
    .from("products")
    .select(
      "id, salon_id, name, sku, category, price, stock_quantity, low_stock_threshold, is_active, created_at, updated_at",
    )
    .order("is_active", { ascending: false })
    .order("category")
    .order("name");

  const all = (data ?? []) as ProductRow[];
  const active = all.filter((p) => p.is_active);
  const low = active.filter(isLowStock);
  const categories = distinctCategories(all.map((p) => p.category));
  const stockValue = active.reduce((sum, p) => sum + Number(p.price) * p.stock_quantity, 0);

  return (
    <div className="space-y-4">
      <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(190px,1fr))]">
        <StatTile label="Active products" value={active.length} />
        <StatTile
          label="Low or out of stock"
          value={low.length}
          hint={low.length > 0 ? "Listed below with a flag" : "Everything is above its threshold"}
        />
        <StatTile label="Stock value (at price)" value={formatMoney(stockValue, currency)} />
      </div>

      {all.length === 0 ? (
        <EmptyState>No products yet. Add your first one from the Add product tab.</EmptyState>
      ) : (
        groupByCategory(all).map(([category, inCategory]) => (
          <Card key={category} padding="none">
            <CardHeader
              title={category}
              description="Archiving keeps a product off the till without disturbing past sales."
            />
            <ul className="divide-y divide-line-soft">
              {inCategory.map((product) => (
                <li key={product.id} className="px-5 py-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-2 font-semibold">
                        <span>{product.name}</span>
                        {!product.is_active ? <Pill tone="critical">Archived</Pill> : null}
                        {product.is_active && product.stock_quantity === 0 ? (
                          <Pill tone="critical">Out of stock</Pill>
                        ) : product.is_active && isLowStock(product) ? (
                          <Pill tone="warning">Low stock</Pill>
                        ) : null}
                      </p>
                      <p className="mt-0.5 text-small text-muted">
                        {formatMoney(product.price, currency)} &middot; {product.stock_quantity} in
                        stock (flag at {product.low_stock_threshold})
                        {product.sku ? <> &middot; SKU {product.sku}</> : null}
                      </p>
                    </div>

                    <div className="flex items-start gap-2">
                      <ProductForm currency={currency} categories={categories} product={product} />
                      <form action={setProductActiveAction}>
                        <input type="hidden" name="productId" value={product.id} />
                        <input
                          type="hidden"
                          name="isActive"
                          value={product.is_active ? "false" : "true"}
                        />
                        <Button
                          type="submit"
                          variant={product.is_active ? "danger" : "ghost"}
                          size="sm"
                        >
                          {product.is_active ? "Archive" : "Restore"}
                        </Button>
                      </form>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        ))
      )}
    </div>
  );
}
