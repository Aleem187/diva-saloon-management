import {
  actionsInCategory,
  isCategoryId,
  SENSITIVE_ACTIONS,
  type AuditCategoryId,
} from "@/lib/audit-categories";
import { createClient } from "@/lib/supabase/server";
import type { AuditLogRow } from "@/lib/types/database";

export const PAGE_SIZE = 50;

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
 * The newest entries that match, or the newest sensitive ones.
 *
 * Owner-only by RLS: audit_logs has no policy that lets other roles read it, so
 * a forged `?tab=` gets rows only if the caller could read them anyway. The
 * date bounds are the same UTC day bounds the page has always used.
 */
export async function loadEntries(
  filters: AuditFilters,
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
  if (filters.from) query = query.gte("created_at", `${filters.from}T00:00:00Z`);
  if (filters.to) query = query.lte("created_at", `${filters.to}T23:59:59Z`);
  if (filters.category) query = query.in("action", actionsInCategory(filters.category));
  if (options.sensitiveOnly) query = query.in("action", [...SENSITIVE_ACTIONS]);

  const { data } = await query;
  return (data ?? []) as AuditLogRow[];
}
