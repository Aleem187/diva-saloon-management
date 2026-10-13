import { ButtonLink } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Pill } from "@/components/ui/pill";
import {
  STATUS_LABEL,
  STATUS_TONE,
  TRIAL_DAYS,
  trialDaysRemaining,
} from "@/components/shell-sidebar-parts";
import { requireOwner } from "@/lib/auth/session";
import { formatLongDayLabel, instantToSalonDate } from "@/lib/time";

/** What the plan includes, from BUILD_BRIEF. */
const INCLUDED = [
  "Bookings, calendar and customer profiles",
  "POS with loyalty credit",
  "Payroll and reports",
  "Consent and intake records",
];

/** Overview › Trial & plan. Owner only: this is the salon's billing. */
export async function TrialTab() {
  const { salon } = await requireOwner();
  const trialing = salon.subscription_status === "trialing";

  const daysLeft = trialDaysRemaining(salon.trial_ends_at);
  const endsOn = formatLongDayLabel(instantToSalonDate(salon.trial_ends_at, salon.timezone));

  return (
    <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(300px,1fr))]">
      <Card>
        {trialing ? (
          <>
            <CardTitle>Trial countdown</CardTitle>
            <p className="flex items-baseline gap-2">
              <span className="font-heading text-[3.429em] leading-none font-semibold">
                {daysLeft}
              </span>
              <span className="text-muted">
                {daysLeft === 1 ? "day" : "days"} remaining of {TRIAL_DAYS}
              </span>
            </p>
            <div
              role="progressbar"
              aria-label="Trial time left"
              aria-valuemin={0}
              aria-valuemax={TRIAL_DAYS}
              aria-valuenow={Math.min(daysLeft, TRIAL_DAYS)}
              className="my-3.5 h-1.5 overflow-hidden rounded-full bg-track"
            >
              <div
                className="h-full rounded-full bg-accent"
                style={{ width: `${Math.min(1, daysLeft / TRIAL_DAYS) * 100}%` }}
              />
            </div>
            <p className="text-small text-muted">Trial ends {endsOn}</p>
          </>
        ) : (
          <>
            <CardTitle>Subscription</CardTitle>
            <Pill tone={STATUS_TONE[salon.subscription_status]}>
              {STATUS_LABEL[salon.subscription_status]}
            </Pill>
          </>
        )}
      </Card>

      <Card>
        <CardTitle>Plan</CardTitle>
        <p className="flex items-baseline gap-1.5">
          <span className="font-heading text-[2.571em] leading-none font-semibold">$20</span>
          <span className="text-muted">/ month per salon</span>
        </p>
        <ul className="my-3.5 list-disc space-y-1.5 pl-[18px]">
          {INCLUDED.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <ButtonLink href="/dashboard/account?tab=billing" size="sm">
          Manage billing
        </ButtonLink>
      </Card>
    </div>
  );
}
