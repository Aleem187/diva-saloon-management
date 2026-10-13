"use client";

import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { Input } from "@/components/ui/field";
import { formatDuration, formatMoney } from "@/lib/format";
import { groupByCategory, type PickableService } from "@/lib/services";

/**
 * Adding services to a booking or a sale.
 *
 * Two ways in, because a busy front desk has two different jobs. Typing a few
 * letters and pressing Enter is fastest when you know what you want. "All
 * services" opens the full catalogue grouped by category, where several can be
 * ticked and added in one go -- a bridal package is six taps here instead of
 * six separate rounds of "Add service".
 */
export function ServicePicker({
  services,
  currency,
  onAdd,
  label = "Add services",
}: {
  services: PickableService[];
  currency: string;
  onAdd: (serviceIds: string[]) => void;
  label?: string;
}) {
  const [query, setQuery] = useState("");
  const [browsing, setBrowsing] = useState(false);
  const [checked, setChecked] = useState<Set<string>>(new Set());

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return services
      .filter(
        (s) => s.name.toLowerCase().includes(q) || s.category.toLowerCase().includes(q),
      )
      .slice(0, 6);
  }, [query, services]);

  const grouped = useMemo(() => groupByCategory(services), [services]);

  function addOne(id: string) {
    onAdd([id]);
    setQuery("");
  }

  function toggle(id: string) {
    setChecked((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function addChecked() {
    if (checked.size > 0) onAdd([...checked]);
    setChecked(new Set());
    setBrowsing(false);
  }

  return (
    <div>
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-56 flex-1">
          <label htmlFor="service-search" className="mb-1.5 block text-small font-medium text-ink">
            {label}
          </label>
          <Input
            id="service-search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && matches[0]) {
                event.preventDefault();
                addOne(matches[0].id);
              }
            }}
            placeholder="Search services..."
            autoComplete="off"
          />
        </div>
        <Button type="button" variant="ghost" onClick={() => setBrowsing(true)}>
          All services
        </Button>
      </div>

      {matches.length > 0 ? (
        <ul className="mt-2 divide-y divide-line-soft rounded-lg border border-line">
          {matches.map((service) => (
            <li key={service.id}>
              <button
                type="button"
                onClick={() => addOne(service.id)}
                className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-small text-ink hover:bg-soft hover:text-accent-d"
              >
                <span className="min-w-0">
                  <span className="truncate font-medium">{service.name}</span>
                  <span className="ml-2 text-fine text-muted">{service.category}</span>
                </span>
                <span className="shrink-0 text-fine tabular-nums text-muted">
                  {formatMoney(service.price, currency)} &middot;{" "}
                  {formatDuration(service.duration_minutes)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {browsing ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="All services"
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4"
          onClick={(event) => {
            if (event.target === event.currentTarget) setBrowsing(false);
          }}
        >
          <div className="flex max-h-[80vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl bg-surface shadow-xl">
            <div className="flex items-center justify-between border-b border-line px-5 py-3">
              <h2 className="text-small font-semibold text-ink">All services</h2>
              <Button type="button" variant="ghost" size="sm" onClick={() => setBrowsing(false)}>
                Close
              </Button>
            </div>

            <div className="flex-1 overflow-auto px-5 py-3">
              {grouped.length === 0 ? (
                <p className="py-8 text-center text-small text-muted">
                  No services defined yet.
                </p>
              ) : (
                grouped.map(([category, items]) => (
                  <section key={category} className="mb-4 last:mb-0">
                    <h3 className="mb-1.5 text-fine font-bold uppercase tracking-wide text-muted">
                      {category}
                    </h3>
                    <ul className="divide-y divide-line-soft">
                      {items.map((service) => (
                        <li key={service.id}>
                          <label
                            className={cn(
                              "flex cursor-pointer items-center justify-between gap-3 px-1 py-2 text-small",
                              checked.has(service.id) ? "text-accent-d" : "text-ink",
                            )}
                          >
                            <span className="flex min-w-0 items-center gap-2.5">
                              <input
                                type="checkbox"
                                checked={checked.has(service.id)}
                                onChange={() => toggle(service.id)}
                                className="size-4 shrink-0 rounded border-field text-accent "
                              />
                              <span className="truncate font-medium">{service.name}</span>
                            </span>
                            <span className="shrink-0 text-fine tabular-nums text-muted">
                              {formatMoney(service.price, currency)} &middot;{" "}
                              {formatDuration(service.duration_minutes)}
                            </span>
                          </label>
                        </li>
                      ))}
                    </ul>
                  </section>
                ))
              )}
            </div>

            <div className="flex items-center justify-between gap-3 border-t border-line bg-head px-5 py-3">
              <span className="text-small text-muted">
                {checked.size === 0
                  ? "Nothing selected"
                  : `${checked.size} selected`}
              </span>
              <Button type="button" onClick={addChecked} disabled={checked.size === 0}>
                Add selected
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
