import { BookingForm } from "./booking-form";
import { asDate } from "./diary-range";
import { Card, CardTitle } from "@/components/ui/card";
import { requireSession } from "@/lib/auth/session";
import { staffInScope } from "@/lib/branches";
import { createClient } from "@/lib/supabase/server";
import { salonToday } from "@/lib/time";
import type { ServiceRow, TeamMemberRow } from "@/lib/types/database";

type Params = Record<string, string | string[] | undefined>;

/** Calendar › New booking. Reads only the team and the services. */
export async function BookingTab({ params }: { params: Params }) {
  const session = await requireSession();
  const supabase = await createClient();

  const [{ data: team }, { data: services }] = await Promise.all([
    // The roster, not the logins: who can be booked.
    supabase.from("team_members").select("*").eq("is_active", true).order("full_name"),
    supabase.from("services").select("*").eq("is_active", true).order("name"),
  ]);

  // Only the people at the branch being served: a booking is at its therapist's branch.
  const therapists = staffInScope((team ?? []) as TeamMemberRow[], {
    branchId: session.scopeBranchId,
  });
  const defaultDate = asDate(params.date, salonToday(session.salon.timezone));

  return (
    <Card className="max-w-4xl">
      <CardTitle>Book an appointment</CardTitle>
      <p className="-mt-2 mb-4 text-small text-muted">
        The slot length is the sum of the services booked. A walk-in skips the conflict check and
        is squeezed in.
      </p>
      <BookingForm
        therapists={therapists.map((t) => ({ id: t.id, name: t.full_name }))}
        services={(services ?? []) as ServiceRow[]}
        defaultDate={defaultDate}
        currency={session.salon.currency}
      />
    </Card>
  );
}
