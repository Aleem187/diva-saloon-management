"use client";

import { memo, useMemo, useState } from "react";

import { cn } from "./cn";
import { Input } from "./field";
import { SegmentedControl } from "./segmented-control";
import { formatDuration, formatMoney } from "@/lib/format";
import type { PickableService } from "@/lib/services";

const ALL = "All";

/**
 * The menu as tiles: filter by category, search by name, tap to add. Built
 * only from the services it is given, and it adds nothing itself -- `onAdd`
 * receives the id, and the caller decides what a sale or booking does with it.
 *
 * `counts` is how many of each service are already in the basket, shown as a
 * badge on the tile.
 */
function ServiceTilesImpl({
  services,
  currency,
  counts,
  onAdd,
  label = "Find a service",
}: {
  services: PickableService[];
  currency: string;
  counts: Record<string, number>;
  onAdd: (serviceId: string) => void;
  label?: string;
}) {
  const [category, setCategory] = useState<string>(ALL);
  const [query, setQuery] = useState("");

  const categories = useMemo(() => {
    const names = new Set(services.map((s) => s.category?.trim() || "General"));
    return [ALL, ...[...names].sort((a, b) => a.localeCompare(b))];
  }, [services]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return services.filter(
      (s) =>
        (category === ALL || (s.category?.trim() || "General") === category) &&
        (!q || s.name.toLowerCase().includes(q)),
    );
  }, [services, category, query]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="max-w-full overflow-x-auto">
          <SegmentedControl
            aria-label="Category"
            options={categories.map((c) => ({ value: c, label: c }))}
            value={category}
            onValueChange={setCategory}
          />
        </div>
        <div className="max-w-xs min-w-44 flex-1">
          <label htmlFor="service-tiles-search" className="sr-only">
            {label}
          </label>
          <Input
            id="service-tiles-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={label}
            autoComplete="off"
          />
        </div>
      </div>

      {shown.length === 0 ? (
        <p className="text-muted">
          {services.length === 0 ? "No services defined yet." : "No services match that search."}
        </p>
      ) : (
        <ul className="grid gap-2.5 [grid-template-columns:repeat(auto-fill,minmax(160px,1fr))]">
          {shown.map((service) => {
            const count = counts[service.id] ?? 0;
            return (
              <li key={service.id} className="relative">
                <button
                  type="button"
                  onClick={() => onAdd(service.id)}
                  aria-label={`Add ${service.name}`}
                  className={cn(
                    "flex min-h-14 w-full flex-col justify-between gap-2 rounded-xl border p-3 text-left transition-colors hover:border-ring hover:bg-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
                    count > 0 ? "border-accent bg-soft" : "border-line bg-surface",
                  )}
                >
                  <span>
                    <span className="block text-fine font-semibold tracking-[0.05em] text-muted uppercase">
                      {service.category?.trim() || "General"}
                    </span>
                    <strong className="block">{service.name}</strong>
                  </span>
                  <span className="flex items-center justify-between gap-2">
                    <span className="text-small text-muted">
                      {formatDuration(service.duration_minutes)}
                    </span>
                    <span className="font-heading font-semibold tabular-nums">
                      {formatMoney(service.price, currency)}
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
    </div>
  );
}

/**
 * Memoised: the till re-renders on every keystroke in its discount, loyalty and
 * payment fields, and the tiles (a menu of dozens) need not follow. It only
 * redraws when the menu, the basket counts or the add handler really change.
 */
export const ServiceTiles = memo(ServiceTilesImpl);
