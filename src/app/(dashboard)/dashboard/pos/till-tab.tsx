import { Till, type CheckoutPrefill } from "./till";
import { Flash } from "@/components/ui/flash";
import { requireModule } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { salonToday } from "@/lib/time";
import type {
  AppointmentBalance,
  AppointmentRow,
  AppointmentServiceRow,
  CustomerRow,
  DealRow,
  DealServiceRow,
  ServiceRow,
  TeamMemberRow,
} from "@/lib/types/database";

type Params = Record<string, string | string[] | undefined>;

/** POS › Till: the checkout. Reads the menu, the team, today's deals, and any booking being billed. */
export async function TillTab({ params }: { params: Params }) {
  const session = await requireModule("pos");
  const supabase = await createClient();
  const currency = session.salon.currency;
  const today = salonToday(session.salon.timezone);

  const [{ data: services }, { data: team }, { data: deals }, { data: dealServices }] =
    await Promise.all([
      supabase.from("services").select("*").eq("is_active", true).order("category").order("name"),
      // The roster: who may be named against a line as having performed it.
      supabase.from("team_members").select("*").eq("is_active", true).order("full_name"),
      // Only deals actually running today can be applied.
      supabase
        .from("deals")
        .select("*")
        .eq("is_active", true)
        .lte("starts_on", today)
        .gte("ends_on", today)
        .order("name"),
      supabase.from("deal_services").select("*"),
    ]);

  const therapists = (team ?? []) as TeamMemberRow[];

  const servicesByDeal: Record<string, string[]> = {};
  for (const link of (dealServices ?? []) as DealServiceRow[]) {
    (servicesByDeal[link.deal_id] ??= []).push(link.service_id);
  }

  /*
   * Checking a booking out. The diary sends the visit here rather than the
   * front desk re-entering it, and the deposit already taken comes with it so
   * the till asks for the balance.
   *
   * An already-billed visit is deliberately NOT prefilled: create_receipt()
   * would refuse it, and an empty till with an explanation beats a filled one
   * that cannot be submitted.
   */
  const wantedAppointment =
    typeof params.appointment === "string" && params.appointment ? params.appointment : null;

  let prefill: CheckoutPrefill | undefined;
  let prefillProblem: string | null = null;

  if (wantedAppointment) {
    const [{ data: appointment }, { data: bookedLines }, { data: balanceRows }] =
      await Promise.all([
        supabase.from("appointments").select("*").eq("id", wantedAppointment).maybeSingle(),
        supabase
          .from("appointment_services")
          .select("*")
          .eq("appointment_id", wantedAppointment)
          .order("sort_order"),
        supabase.rpc("appointment_balance", { p_appointment_id: wantedAppointment }),
      ]);

    const appt = appointment as AppointmentRow | null;
    const balance = ((balanceRows ?? []) as AppointmentBalance[])[0];

    /*
     * Fetched by id, NOT read out of a capped customer list. In a salon with
     * more customers than the cap the booking's customer can simply be missing
     * from it -- and a customer created during booking is new enough to be
     * anywhere in the ordering.
     */
    const { data: visitCustomer } = appt
      ? await supabase.from("customers").select("*").eq("id", appt.customer_id).maybeSingle()
      : { data: null };
    const visitor = visitCustomer as CustomerRow | null;

    if (!appt) {
      prefillProblem = "That appointment could not be found.";
    } else if (balance?.has_receipt) {
      prefillProblem = "That appointment has already been billed.";
    } else if (appt.status === "cancelled" || appt.status === "no_show") {
      prefillProblem = `That appointment was ${appt.status.replace("_", "-")}, so there is nothing to bill.`;
    } else {
      prefill = {
        appointmentId: appt.id,
        customerId: appt.customer_id,
        customerName: visitor?.full_name ?? "the customer",
        customerLabel: visitor
          ? `${visitor.full_name}${visitor.phone ? ` — ${visitor.phone}` : ""}`
          : "Customer on this booking",
        deposit: Number(balance?.amount_paid ?? 0),
        lines: ((bookedLines ?? []) as AppointmentServiceRow[]).map((line) => ({
          serviceId: line.service_id,
          staffId: appt.staff_id,
          quantity: line.quantity,
        })),
      };
    }
  }

  return (
    <div className="space-y-4">
      {prefillProblem ? <Flash tone="warning">{prefillProblem}</Flash> : null}

      <Till
        key={prefill?.appointmentId ?? "walk-in"}
        services={(services ?? []) as ServiceRow[]}
        therapists={therapists.map((t) => ({ id: t.id, name: t.full_name }))}
        deals={(deals ?? []) as DealRow[]}
        servicesByDeal={servicesByDeal}
        currency={currency}
        prefill={prefill}
      />
    </div>
  );
}
