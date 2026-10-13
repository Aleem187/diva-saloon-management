import type { SessionContext } from "@/lib/auth/session";
import type { AppModule } from "@/lib/types/database";

/*
 * The tab model shared by every tabbed page.
 *
 * Deliberately NOT a "use client" module: the server resolves which tabs a
 * visitor may use, and the client tab bar builds its links from the same
 * helpers (CLAUDE.md rule 9).
 *
 * How access works here. A page lists ALL its tabs, each with an optional
 * `visibleFor` predicate over the session. `resolveTabs` runs the predicates on
 * the server and returns only the tabs this visitor may use, plus which one is
 * active. The page then renders -- and fetches data for -- the active tab and
 * nothing else, so a tab the visitor cannot use is never rendered and its data
 * is never read, whatever they type into ?tab=. (Row Level Security and the
 * action guards remain the real boundary; this is what keeps the page honest.)
 *
 * "Roles" in the product are custom, so `visibleFor` takes a predicate rather
 * than a list of role names. Use `ownerOnly` and `holdsModule(...)` below.
 */

export interface TabDefinition<S = SessionContext> {
  id: string;
  label: string;
  /**
   * A count badge. The page computes it, so only compute it for a tab the
   * visitor can see: it is only ever shown for visible tabs, but nothing here
   * stops a hidden tab's count from being queried if you do it up front.
   */
  count?: number | string;
  /** Omit for "everyone who can open the page". */
  visibleFor?: (session: S) => boolean;
}

/** What the client tab bar receives: serialisable, no predicates. */
export interface TabItem {
  id: string;
  label: string;
  count?: number | string;
}

export const ownerOnly = (session: SessionContext): boolean => session.isOwner;

export const holdsModule =
  (module: AppModule) =>
  (session: SessionContext): boolean =>
    session.modules.has(module);

/**
 * Filter the tab list for this visitor and pick the active one.
 *
 * `requested` is the raw `?tab=` value. An unknown, hidden or repeated value
 * falls back to the first visible tab rather than erroring, so a stale link
 * still lands somewhere sensible. `active` is null only when nothing is
 * visible at all.
 */
export function resolveTabs<S>(
  session: S,
  definitions: TabDefinition<S>[],
  requested: string | string[] | undefined,
): { tabs: TabItem[]; active: string | null } {
  const tabs: TabItem[] = definitions
    .filter((d) => !d.visibleFor || d.visibleFor(session))
    .map(({ id, label, count }) => ({ id, label, count }));

  const wanted = Array.isArray(requested) ? requested[0] : requested;
  const active = tabs.find((t) => t.id === wanted)?.id ?? tabs[0]?.id ?? null;

  return { tabs, active };
}

/** Which search parameter drives a bar: the page tabs, or the sub-tabs below. */
export type TabParam = "tab" | "sub";

/** The DOM ids that tie a tab to its panel (for aria-controls / aria-labelledby). */
export function tabDomIds(param: TabParam, id: string): { tab: string; panel: string } {
  return { tab: `${param}-tab-${id}`, panel: `${param}-panel-${id}` };
}

/**
 * The URL for a tab. `params` are the other search parameters to keep -- for
 * sub-tabs, the current `tab`. Anything not listed is dropped, which is how
 * switching a tab resets `sub`.
 */
export function tabHref(
  basePath: string,
  param: TabParam,
  id: string,
  params: Record<string, string> = {},
): string {
  const query = new URLSearchParams(params);
  query.set(param, id);
  return `${basePath}?${query.toString()}`;
}
