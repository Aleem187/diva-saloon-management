import type { ServiceRow } from "@/lib/types/database";

/**
 * Pure helpers for presenting the service catalogue.
 *
 * Deliberately NOT in the picker component: that file is "use client", and a
 * server component importing a plain function from a client module gets a
 * client reference it cannot call. The services page renders on the server.
 */

export interface PickableService {
  id: string;
  name: string;
  category: string;
  price: number;
  duration_minutes: number;
}

/** Services grouped under their category, categories in alphabetical order. */
export function groupByCategory<T extends { category: string }>(
  items: T[],
): [string, T[]][] {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = item.category?.trim() || "General";
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
}

export function toPickable(services: ServiceRow[]): PickableService[] {
  return services.map((s) => ({
    id: s.id,
    name: s.name,
    category: s.category,
    price: Number(s.price),
    duration_minutes: s.duration_minutes,
  }));
}

/* -------------------------------------------------------------------------- */
/* Category names                                                              */
/* -------------------------------------------------------------------------- */

const categoryKey = (category: string) => category.trim().replace(/\s+/g, " ").toLowerCase();

/** A typed category with stray spaces removed: "  Hair   Care " becomes "Hair Care". */
export function cleanCategory(raw: string): string {
  return raw.trim().replace(/\s+/g, " ");
}

/**
 * The salon's categories, once each. "Hair" and "hair" are the same category, and
 * the first spelling met wins, so a typo-by-case cannot split a menu group in two.
 * Alphabetical.
 */
export function distinctCategories(values: (string | null | undefined)[]): string[] {
  const seen = new Map<string, string>();
  for (const value of values) {
    const cleaned = cleanCategory(value ?? "");
    if (cleaned && !seen.has(categoryKey(cleaned))) seen.set(categoryKey(cleaned), cleaned);
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b));
}

/**
 * What a typed category should be stored as: an existing category's own spelling
 * if it matches ignoring case and spacing, otherwise the cleaned text as a new
 * one. Blank means "General". Used by the form's hint and, authoritatively, by
 * the server when saving.
 */
export function canonicalCategory(raw: string, existing: string[]): string {
  const cleaned = cleanCategory(raw);
  if (!cleaned) return "General";
  return existing.find((c) => categoryKey(c) === categoryKey(cleaned)) ?? cleaned;
}
