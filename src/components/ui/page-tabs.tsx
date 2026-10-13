"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, type KeyboardEvent } from "react";

import { cn } from "./cn";
import { tabDomIds, tabHref, type TabItem, type TabParam } from "@/lib/tabs";

interface TabBarProps {
  tabs: TabItem[];
  /** The active tab id, already resolved on the server (see `resolveTabs`). */
  active: string;
  /** The page's path, e.g. `/dashboard/account`. */
  basePath: string;
  /** Other search parameters to keep when switching, e.g. `{ tab: "billing" }`. */
  params?: Record<string, string>;
  /** Accessible name for the tab list. */
  label: string;
}

/*
 * Tabs are links. Choosing one navigates to `?tab=<id>`, so the active tab
 * survives a refresh and can be shared, and the server renders only that tab.
 *
 * `scroll={false}` stops the page jumping; `replace` swaps the URL instead of
 * stacking a history entry per tab, so Back leaves the page rather than
 * stepping through every tab visited.
 *
 * Keyboard: Left / Right move to the previous / next tab (wrapping), Home and
 * End jump to the ends, and the selection follows focus -- each arrow press
 * navigates. Only the active tab is in the Tab order (roving tabindex).
 */
function TabBar({
  tabs,
  active,
  basePath,
  params,
  label,
  param,
  variant,
}: TabBarProps & { param: TabParam; variant: "tab" | "sub" }) {
  const router = useRouter();
  const refs = useRef<Array<HTMLAnchorElement | null>>([]);

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const focused = refs.current.findIndex((el) => el === document.activeElement);
    const current = focused >= 0 ? focused : tabs.findIndex((t) => t.id === active);

    let next: number;
    switch (event.key) {
      case "ArrowRight":
        next = (current + 1) % tabs.length;
        break;
      case "ArrowLeft":
        next = (current - 1 + tabs.length) % tabs.length;
        break;
      case "Home":
        next = 0;
        break;
      case "End":
        next = tabs.length - 1;
        break;
      default:
        return;
    }

    event.preventDefault();
    refs.current[next]?.focus();
    router.replace(tabHref(basePath, param, tabs[next].id, params), { scroll: false });
  }

  return (
    <div
      role="tablist"
      aria-label={label}
      aria-orientation="horizontal"
      onKeyDown={onKeyDown}
      className={cn(
        "flex overflow-x-auto border-b",
        variant === "tab" ? "mb-6 gap-0.5 border-line" : "mb-[18px] gap-1 border-track",
      )}
    >
      {tabs.map((tab, index) => {
        const selected = tab.id === active;
        const ids = tabDomIds(param, tab.id);

        return (
          <Link
            key={tab.id}
            ref={(el) => {
              refs.current[index] = el;
            }}
            href={tabHref(basePath, param, tab.id, params)}
            scroll={false}
            replace
            role="tab"
            id={ids.tab}
            aria-selected={selected}
            // Only the rendered panel exists, so only the active tab can point at it.
            aria-controls={selected ? ids.panel : undefined}
            tabIndex={selected ? 0 : -1}
            className={cn(
              "-mb-px inline-flex items-center gap-2 border-b-2 whitespace-nowrap no-underline transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent",
              variant === "tab"
                ? "min-h-[46px] px-3.5 py-3"
                : "min-h-11 px-3 py-2.5 font-semibold",
              selected
                ? cn(
                    "border-accent",
                    variant === "tab" ? "font-semibold text-accent" : "text-accent-d",
                  )
                : cn(
                    "border-transparent hover:text-ink",
                    variant === "tab" ? "font-medium text-muted" : "text-neutral-fg",
                  ),
            )}
          >
            {tab.label}
            {tab.count !== undefined && tab.count !== "" ? (
              <span className="rounded-full bg-track px-[7px] py-px text-[0.786em] font-bold text-neutral-fg">
                {tab.count}
              </span>
            ) : null}
          </Link>
        );
      })}
    </div>
  );
}

/** The page's main tab bar, driven by `?tab=`. */
export function PageTabs(props: TabBarProps) {
  return <TabBar {...props} param="tab" variant="tab" />;
}

/**
 * The second level, driven by `?sub=`: a lighter bar for a tab that has parts
 * of its own (Billings > History / Methods / Discounts). Pass
 * `params={{ tab: activeTab }}` so switching a sub-tab keeps the tab; switching
 * the main tab drops `sub`, so it starts at the first sub-tab again.
 */
export function SubTabs(props: TabBarProps) {
  return <TabBar {...props} param="sub" variant="sub" />;
}
