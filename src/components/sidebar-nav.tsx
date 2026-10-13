"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/components/ui/cn";
import type { AppModule } from "@/lib/types/database";

interface NavItem {
  href: string;
  label: string;
  /**
   * The module this page belongs to, mirroring the guard on the page and the
   * `has_module()` call in its policies. Undefined means everyone: the
   * overview, their own account, and their own earnings are not delegated
   * powers and are never taken away.
   */
  module?: AppModule;
}

interface NavGroup {
  name: string;
  items: NavItem[];
}

const NAV: NavGroup[] = [
  {
    name: "Front desk",
    items: [
      { href: "/dashboard", label: "Overview" },
      { href: "/dashboard/calendar", label: "Calendar" },
      { href: "/dashboard/customers", label: "Customers", module: "customers" },
      { href: "/dashboard/pos", label: "Point of sale", module: "pos" },
    ],
  },
  {
    name: "Business",
    items: [
      { href: "/dashboard/services", label: "Services & pricing", module: "services" },
      { href: "/dashboard/payroll", label: "Payroll", module: "payroll" },
      { href: "/dashboard/reports", label: "Reports", module: "reports" },
      { href: "/dashboard/team", label: "Team", module: "team" },
      { href: "/dashboard/audit", label: "Audit log", module: "audit" },
      { href: "/dashboard/settings", label: "Settings", module: "settings" },
    ],
  },
  {
    name: "You",
    items: [
      { href: "/dashboard/earnings", label: "My earnings" },
      { href: "/dashboard/account", label: "My account" },
    ],
  },
];

/**
 * Hiding a link is a courtesy, not a control. Every page behind these guards
 * itself, and every policy behind it asks `has_module()` -- so a hand-typed
 * URL reaches a refusal, not the data.
 *
 * The calendar has no module: a therapist with no permissions at all still
 * sees their own diary, because the appointments policy admits their own rows
 * regardless.
 *
 * A group with nothing left in it after filtering is not drawn at all.
 */
export function SidebarNav({ modules }: { modules: AppModule[] }) {
  const pathname = usePathname();
  const held = new Set(modules);

  const groups = NAV.map((group) => ({
    name: group.name,
    items: group.items.filter((item) => !item.module || held.has(item.module)),
  })).filter((group) => group.items.length > 0);

  return (
    <div className="flex flex-wrap gap-x-6 gap-y-3 min-[810px]:flex-col min-[810px]:flex-nowrap min-[810px]:gap-[22px]">
      {groups.map((group) => (
        <nav key={group.name} aria-label={group.name} className="flex flex-col gap-0.5">
          <p className="mb-1.5 px-2.5 text-[0.786em] font-semibold tracking-[0.09em] text-side-muted uppercase">
            {group.name}
          </p>
          {group.items.map((item) => {
            const isActive =
              pathname === item.href ||
              (item.href !== "/dashboard" && pathname.startsWith(`${item.href}/`));

            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "flex min-h-10 items-center gap-2.5 rounded-[10px] px-2.5 py-2 no-underline transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-side-ink",
                  isActive
                    ? "bg-soft font-semibold text-accent-d"
                    : "text-side-ink hover:bg-side-hover hover:text-on-accent",
                )}
              >
                <span aria-hidden className="size-1.5 flex-none rounded-full bg-current opacity-55" />
                {item.label}
              </Link>
            );
          })}
        </nav>
      ))}
    </div>
  );
}
