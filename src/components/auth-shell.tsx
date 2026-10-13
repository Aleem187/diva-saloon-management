import Link from "next/link";
import type { ReactNode } from "react";

import { Card } from "@/components/ui/card";
import { ThemeRoot } from "@/components/theme-root";

const FEATURES = [
  "Calendar with day, week and agenda views",
  "Point of sale with loyalty credit",
  "Consent forms with signatures",
  "Payroll and reports for owners",
];

/**
 * The frame every signed-out screen sits in: a dark brand panel on the left
 * (stacked above the form on a narrow screen, with the feature list dropped to
 * keep the form near the top) and the form on the right.
 *
 * Shared by the (auth) routes and /auth/callback, which lives outside that
 * route group.
 */
export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <ThemeRoot className="flex min-h-dvh flex-wrap content-start min-[810px]:content-stretch">
      <section className="flex flex-[1_1_380px] flex-col justify-between gap-6 bg-side p-6 text-side-ink min-[810px]:gap-10 min-[810px]:p-12">
        <Link href="/" className="flex items-center gap-3 no-underline">
          <span
            aria-hidden
            className="grid size-11 place-items-center rounded-xl bg-soft font-heading font-bold text-accent-d"
          >
            SS
          </span>
          <span className="font-heading text-[1.214em] font-semibold text-on-accent">
            Salon Suite
          </span>
        </Link>

        <div className="flex flex-col gap-6">
          <p className="font-heading text-title font-semibold tracking-[-0.02em] text-on-accent min-[810px]:text-display">
            Bookings, till, loyalty and payroll for your salon — in one place.
          </p>
          <ul className="hidden flex-col gap-3 min-[810px]:flex">
            {FEATURES.map((feature) => (
              <li key={feature} className="flex items-center gap-2.5">
                <span aria-hidden className="size-2 flex-none rounded-full bg-meter-fill" />
                {feature}
              </li>
            ))}
          </ul>
        </div>

        <p className="text-small text-side-muted">14-day free trial · then $20/month per salon</p>
      </section>

      <main className="flex min-w-0 flex-[999_1_480px] flex-col items-center justify-start px-4 py-8 min-[810px]:px-6 min-[810px]:py-12">
        <div className="w-full max-w-[520px]">
          {children}
          <p className="mt-8 text-center text-fine text-muted">
            Every salon&rsquo;s data is isolated at the database level.
          </p>
        </div>
      </main>
    </ThemeRoot>
  );
}

/** The white card on the right: a title, a line under it, then the content. */
export function AuthCard({
  title,
  subtitle,
  children,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card padding="lg">
      <h1 className="mb-1.5 font-heading text-kpi font-semibold tracking-[-0.01em]">{title}</h1>
      {subtitle ? <p className="mb-5 text-muted">{subtitle}</p> : <div className="mb-5" />}
      {children}
    </Card>
  );
}

export const AUTH_TABS = [
  { href: "/login", label: "Sign in" },
  { href: "/signup", label: "Create account" },
];
