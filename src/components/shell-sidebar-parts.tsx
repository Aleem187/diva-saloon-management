import { Pill, type PillTone } from "@/components/ui/pill";
import { formatDayLabel, instantToSalonDate } from "@/lib/time";
import type { SalonRow, SubscriptionStatus } from "@/lib/types/database";

export const STATUS_TONE: Record<SubscriptionStatus, PillTone> = {
  active: "good",
  trialing: "accent",
  past_due: "warning",
  incomplete: "warning",
  unpaid: "critical",
  canceled: "critical",
};

export const STATUS_LABEL: Record<SubscriptionStatus, string> = {
  active: "Active",
  trialing: "Trial",
  past_due: "Past due",
  incomplete: "Incomplete",
  unpaid: "Unpaid",
  canceled: "Cancelled",
};

/** Length of the free trial, per BUILD_BRIEF section A. */
export const TRIAL_DAYS = 14;

/** Whole days left on the trial, floored at zero. */
export function trialDaysRemaining(trialEndsAt: string): number {
  const msPerDay = 1000 * 60 * 60 * 24;
  const remaining = new Date(trialEndsAt).getTime() - Date.now();
  return Math.max(0, Math.ceil(remaining / msPerDay));
}

/**
 * Sidebar box: the trial countdown while trialing, otherwise the subscription
 * status. Reads only what the layout already loaded on the salon row.
 */
export function SubscriptionBox({ salon }: { salon: SalonRow }) {
  const dark = "flex flex-col gap-2 rounded-xl bg-side-box p-3.5";

  if (salon.subscription_status !== "trialing") {
    return (
      <div className={dark}>
        <div className="flex items-center justify-between gap-2">
          <span className="text-small font-semibold text-on-accent">Subscription</span>
          <Pill tone={STATUS_TONE[salon.subscription_status]}>
            {STATUS_LABEL[salon.subscription_status]}
          </Pill>
        </div>
      </div>
    );
  }

  const daysLeft = trialDaysRemaining(salon.trial_ends_at);
  const fraction = Math.min(1, daysLeft / TRIAL_DAYS);
  const endsOn = formatDayLabel(instantToSalonDate(salon.trial_ends_at, salon.timezone));

  return (
    <div className={dark}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-small font-semibold text-on-accent">Free trial</span>
        <Pill tone="accent">
          {daysLeft} {daysLeft === 1 ? "day" : "days"} left
        </Pill>
      </div>
      <div
        role="progressbar"
        aria-label="Trial time left"
        aria-valuemin={0}
        aria-valuemax={TRIAL_DAYS}
        aria-valuenow={Math.min(daysLeft, TRIAL_DAYS)}
        className="h-1.5 overflow-hidden rounded-full bg-side-meter"
      >
        <div className="h-full rounded-full bg-meter-fill" style={{ width: `${fraction * 100}%` }} />
      </div>
      <span className="text-fine text-side-muted">$20/month after {endsOn}</span>
    </div>
  );
}

/** Initials for the avatar: first letters of up to two words. */
export function initialsOf(name: string): string {
  const letters = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word.charAt(0).toUpperCase());
  return letters.join("") || "?";
}
