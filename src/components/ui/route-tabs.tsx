import Link from "next/link";

import { cn } from "./cn";

export interface RouteTab {
  href: string;
  label: string;
}

/**
 * A tab-looking strip whose items are separate PAGES (Sign in / Create
 * account), not parts of one page. For tabs within a page use `PageTabs`.
 *
 * Because each item is its own route, this is plain navigation: a <nav> of
 * links, with `aria-current="page"` on the current one. It is not a tablist,
 * and so has no arrow-key behaviour to promise.
 */
export function RouteTabs({
  tabs,
  active,
  label,
}: {
  tabs: RouteTab[];
  /** The `href` of the current page. */
  active: string;
  label: string;
}) {
  return (
    <nav aria-label={label} className="mb-6 flex gap-0.5 overflow-x-auto border-b border-line">
      {tabs.map((tab) => {
        const current = tab.href === active;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={current ? "page" : undefined}
            className={cn(
              "-mb-px inline-flex min-h-[46px] items-center border-b-2 px-3.5 py-3 whitespace-nowrap no-underline transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent",
              current
                ? "border-accent font-semibold text-accent"
                : "border-transparent font-medium text-muted hover:text-ink",
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
