import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

/**
 * What everyone except the owner sees when the salon's subscription has lapsed.
 * They cannot fix it, so it says whose job that is -- and sign-out stays
 * reachable, as it must.
 */
export function SubscriptionInactive({ salonName }: { salonName: string }) {
  return (
    <Card padding="lg" className="w-full max-w-md text-center">
      <h1 className="mb-2 font-heading text-kpi font-semibold tracking-[-0.01em]">
        Subscription inactive
      </h1>
      <p className="text-muted">
        {salonName}&rsquo;s subscription is not active, so the dashboard is paused for now.
        Please contact the salon owner &mdash; they can restore it from their account.
      </p>
      <form action="/auth/signout" method="post" className="mt-6">
        <Button type="submit" variant="ghost" className="w-full">
          Sign out
        </Button>
      </form>
    </Card>
  );
}
