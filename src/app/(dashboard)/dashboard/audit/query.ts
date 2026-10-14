import {
  actionsInCategory,
  isCategoryId,
  SENSITIVE_ACTIONS,
  type AuditCategoryId,
} from "@/lib/audit-categories";
import { createClient } from "@/lib/supabase/server";
import { addDays, salonTimeToInstant, salonToday } from "@/lib/time";
import type { AuditLogRow } from "@/lib/types/database";

export const PAGE_SIZE = 50;

/** The audit page shows this many calendar days, today included. Nothing older is read. */
export const AUDIT_WINDOW_DAYS = 14;

/**
 * The window the page covers, in the salon's own timezone: the 14 calendar days
 * ending today. The entries older than that are not deleted (the log is
 * append-only); the page simply never asks for them.
 */
export function auditWindow(timeZone: string): { startDate: string; today: string; startsAt: string } {
  const today = salonToday(timeZone);
  const startDate = addDays(today, -(AUDIT_WINDOW_DAYS - 1));
  return { startDate, today, startsAt: salonTimeToInstant(startDate, "00:00", timeZone).toISOString() };
}

export type Params = Record<string, string | string[] | undefined>;

export interface AuditFilters {
  action: string;
  actor: string;
  from: string;
  to: string;
  category: AuditCategoryId | "";
}

export interface Actor {
  id: string;
  full_name: string | null;
  email: string;
}

const text = (value: unknown): string => (typeof value === "string" ? value : "");

export function readFilters(params: Params): AuditFilters {
  return {
    action: text(params.action),
    actor: text(params.actor),
    from: text(params.from),
    to: text(params.to),
    category: isCategoryId(params.category) ? params.category : "",
  };
}

/** The filters that are set, as the search parameters that carry them. */
export function filterParams(filters: AuditFilters): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(filters)) {
    if (value) out[key] = value;
  }
  return out;
}

export function hasFilters(filters: AuditFilters): boolean {
  return Object.keys(filterParams(filters)).length > 0;
}

/** A link to this page that keeps the filters and says which tab and entry. */
export function auditHref(
  filters: AuditFilters,
  extra: { tab: string; entry?: string | number; category?: AuditCategoryId | "" },
): string {
  const query = new URLSearchParams(filterParams(filters));
  if (extra.category !== undefined) {
    if (extra.category) query.set("category", extra.category);
    else query.delete("category");
  }
  query.set("tab", extra.tab);
  if (extra.entry !== undefined) query.set("entry", String(extra.entry));
  return `/dashboard/audit?${query.toString()}`;
}

/**
 * The newest entries that match, or the newest sensitive ones, from the last 14
 * days only.
 *
 * Owner-only by RLS: audit_logs has no policy that lets other roles read it, so
 * a forged `?tab=` gets rows only if the caller could read them anyway. The From
 * and To filters are the UTC day bounds the page has always used; the 14-day
 * floor is applied on top, so a From earlier than the window cannot reach past
 * it, and every tab (they all load through here) covers the same period.
 */
export async function loadEntries(
  filters: AuditFilters,
  timeZone: string,
  options: { sensitiveOnly?: boolean } = {},
): Promise<AuditLogRow[]> {
  const supabase = await createClient();

  let query = supabase
    .from("audit_logs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(PAGE_SIZE);

  if (filters.action) query = query.eq("action", filters.action);
  if (filters.actor) query = query.eq("actor_id", filters.actor);
  const { startsAt } = auditWindow(timeZone);
  const fromAt = filters.from ? `${filters.from}T00:00:00Z` : startsAt;
  query = query.gte("created_at", fromAt > startsAt ? fromAt : startsAt);
  if (filters.to) query = query.lte("created_at", `${filters.to}T23:59:59Z`);
  if (filters.category) query = query.in("action", actionsInCategory(filters.category));
  if (options.sensitiveOnly) query = query.in("action", [...SENSITIVE_ACTIONS]);

  const { data } = await query;
  return (data ?? []) as AuditLogRow[];
}
