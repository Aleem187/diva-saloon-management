import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { requireSession } from "@/lib/auth/session";
import { SidebarNav } from "@/components/sidebar-nav";
import { SignOutButton } from "@/components/sign-out-button";
import { SubscriptionBox, initialsOf } from "@/components/shell-sidebar-parts";
import { ThemeRoot } from "@/components/theme-root";
import { SubscriptionInactive } from "@/components/subscription-inactive";
import { normaliseAppearance } from "@/lib/appearance";
import { billingConfigured, subscriptionAllowsAccess } from "@/lib/billing/status";
import { Topbar } from "@/components/shell-topbar";

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const session = await requireSession();
  const { profile, salon } = session;
  const displayName = profile.full_name || session.email;

  /*
   * The billing gate. Only when billing is configured (Stripe keys present), so
   * an install without them behaves as it always has. When the subscription is
   * not usable:
   *   - the owner is sent to Billings, the one page that can fix it. Account
   *     stays reachable (Billings lives on it), and sign-out is a route outside
   *     this layout, so it is never gated;
   *   - everyone else gets a screen saying whose job it is.
   * Enforced here, in the layout, because the proxy cannot read the database.
   */
  if (billingConfigured() && !subscriptionAllowsAccess(salon)) {
    if (!session.isOwner) {
      return (
        <ThemeRoot
          appearance={normaliseAppearance(salon)}
          className="grid min-h-dvh place-items-center p-6"
        >
          <SubscriptionInactive salonName={salon.name} />
        </ThemeRoot>
      );
    }
    const pathname = (await headers()).get("x-pathname") ?? "";
    if (pathname !== "/dashboard/account") {
      redirect("/dashboard/account?tab=billing&reason=inactive");
    }
  }

  return (
    /*
     * The salon's saved colour scheme, fonts and text size, read with the salon
     * itself (getSessionContext selects the whole row), so this costs no extra
     * query. Anything missing falls back to the defaults.
     */
    <ThemeRoot appearance={normaliseAppearance(salon)} className="flex min-h-dvh flex-col min-[810px]:flex-row">
      <aside className="flex shrink-0 flex-col gap-[22px] bg-side px-3.5 py-[22px] text-side-ink min-[810px]:sticky min-[810px]:top-0 min-[810px]:h-dvh min-[810px]:w-[252px] min-[810px]:overflow-y-auto">
        <div className="flex items-center gap-3 px-2">
          <span
            aria-hidden
            className="grid size-10 shrink-0 place-items-center rounded-xl bg-soft font-heading text-base font-bold text-accent-d"
          >
            {salon.name.charAt(0).toUpperCase()}
          </span>
          <div className="min-w-0">
            <p className="truncate font-heading font-semibold text-on-accent">{salon.name}</p>
            <p className="text-fine text-side-muted">
              {salon.business_type === "aesthetic_clinic" ? "Aesthetic clinic" : "Salon"}
            </p>
          </div>
        </div>

        <SidebarNav modules={[...session.modules]} />

        <div className="mt-auto flex flex-col gap-[22px]">
          <SubscriptionBox salon={salon} />

          <div className="flex items-center gap-2.5 px-1.5">
            <span
              aria-hidden
              className="grid size-9 shrink-0 place-items-center rounded-full bg-accent text-small font-bold text-on-accent"
            >
              {initialsOf(displayName)}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-small font-semibold text-on-accent">{displayName}</p>
              <p className="truncate text-fine text-side-muted">{session.role?.name ?? "No role"}</p>
            </div>
            <SignOutButton />
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar
          timeZone={salon.timezone}
          currency={salon.currency}
          modules={[...session.modules]}
          branches={session.branches}
          assignedBranch={session.branch}
          activeBranchId={session.activeBranch?.id ?? null}
          isOwner={session.isOwner}
        />
        {/*
          space-y-6 is what the pages' own sections were spaced by before the
          redesign; they still rely on it until each is rebuilt on the kit.
        */}
        <main className="w-full max-w-[1280px] space-y-6 px-4 pt-[26px] pb-14 sm:px-8">
          {children}
        </main>
      </div>
    </ThemeRoot>
  );
}
