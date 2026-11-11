"use client";

import { memo, useMemo, useState } from "react";

import { cn } from "./cn";
import { Input } from "./field";
import { formatMoney } from "@/lib/format";
import { useDebouncedValue } from "@/lib/use-debounced-value";

/** What the till needs of a product: never a cost, and no more than it sells by. */
export interface SellableProduct {
  id: string;
  name: string;
  sku: string;
  category: string;
  price: number;
  stock_quantity: number;
}

/**
 * The retail products, under their own heading beside the service menu: search
 * by name, SKU or category, tap to add. `counts` is how many of each are already
 * in the basket; a product at its stock limit (or out of stock) cannot be added.
 * The database refuses an oversell regardless -- this just says so sooner.
 */
function ProductTilesImpl({
  products,
  currency,
  counts,
  onAdd,
}: {
  products: SellableProduct[];
  currency: string;
  counts: Record<string, number>;
  onAdd: (productId: string) => void;
}) {
  const [query, setQuery] = useState("");
  const debounced = useDebouncedValue(query);
  const searched = query.trim() ? debounced : "";

  const shown = useMemo(() => {
    const q = searched.trim().toLowerCase();
    if (!q) return products;
    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q),
    );
  }, [products, searched]);

  return (
    <section aria-labelledby="pos-products-heading" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="pos-products-heading" className="font-heading text-section font-semibold">
          Retail products
        </h2>
        <div className="max-w-xs min-w-44 flex-1">
          <label htmlFor="product-tiles-search" className="sr-only">
            Find a product
          </label>
          <Input
            id="product-tiles-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Find a product"
            autoComplete="off"
          />
        </div>
      </div>

      {shown.length === 0 ? (
        <p className="text-muted">
          {products.length === 0 ? "No products yet." : "No products match that search."}
        </p>
      ) : (
        <ul className="grid gap-2.5 [grid-template-columns:repeat(auto-fill,minmax(160px,1fr))]">
          {shown.map((product) => {
            const count = counts[product.id] ?? 0;
            const left = product.stock_quantity - count;
            return (
              <li key={product.id} className="relative">
                <button
                  type="button"
                  onClick={() => onAdd(product.id)}
                  disabled={left <= 0}
                  aria-label={`Add ${product.name}`}
                  className={cn(
                    "flex min-h-14 w-full flex-col justify-between gap-2 rounded-xl border p-3 text-left transition-colors hover:border-ring hover:bg-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-55 disabled:hover:border-line disabled:hover:bg-surface",
                    count > 0 ? "border-accent bg-soft" : "border-line bg-surface",
                  )}
                >
                  <span>
                    <span className="block text-fine font-semibold tracking-[0.05em] text-muted uppercase">
                      {product.category}
                    </span>
                    <strong className="block">{product.name}</strong>
                  </span>
                  <span className="flex items-center justify-between gap-2">
                    <span
                      className={cn(
                        "text-small",
                        left <= 0 ? "font-semibold text-critical-fg" : "text-muted",
                      )}
                    >
                      {product.stock_quantity <= 0 ? "Out of stock" : `${left} left`}
                    </span>
                    <span className="font-heading font-semibold tabular-nums">
                      {formatMoney(product.price, currency)}
                    </span>
                  </span>
                </button>
                {count > 0 ? (
                  <span
                    aria-hidden
                    className="pointer-events-none absolute -top-1.5 -right-1.5 grid min-w-5 place-items-center rounded-full bg-accent px-1.5 text-fine font-bold text-on-accent"
                  >
                    {count}
                  </span>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/** Memoised like the service menu: the till redraws on every keystroke elsewhere. */
export const ProductTiles = memo(ProductTilesImpl);
