import { Suspense } from "react";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { ActionsTab } from "./actions-tab";
import { PaymentsTab } from "./payments-tab";
import { ServicesTab } from "./services-tab";
import { SummaryTab } from "./summary-tab";
import { isFrontDeskSession } from "@/lib/front-desk";
import { STATUS_LABEL, STATUS_TONE } from "@/lib/appointment-status";
import { PageFlash } from "@/components/page-flash";
import { ButtonLink } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { PageTabs } from "@/components/ui/page-tabs";
import { Pill } from "@/components/ui/pill";
import { TabFallback } from "@/components/ui/tab-fallback";
import { TabPanel } from "@/components/ui/tab-panel";
import { requireSession } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { formatLongDayLabel, instantToSalonDate, instantToSalonTime } from "@/lib/time";
import { resolveTabs, type TabDefinition } from "@/lib/tabs";
import type { AppointmentBalance, AppointmentRow, TeamMemberRow } from "@/lib/types/database";

export const metadata: Metadata = { title: "Appointment" };

/*
 * Summary and Services are for anyone who can open the appointment (RLS lets a
 * therapist open only their own). Payments and Actions are the front desk's:
 * the payments ledger is front-desk-only by policy, and so are the actions.
 */
const TABS: TabDefinition[] = [
  { id: "summary", label: "Summary" },
  { id: "services", label: "Services & price" },
  { id: "payments", label: "Payments", visibleFor: isFrontDeskSession },
  { id: "actions", label: "Actions", visibleFor: isFrontDeskSession },
];

export default async function AppointmentPage({
  params,
  searchParams,
}: PageProps<"/dashboard/calendar/[appointmentId]">) {
  const { appointmentId } = await params;
  const query = await searchParams;
  const session = await requireSession();
  const supabase = await createClient();

  const timeZone = session.salon.timezone;
  const isFrontDesk = isFrontDeskSession(session);
  const isOwner = session.profile.role === "owner";

  // RLS decides visibility: a therapist reaching another therapist's
  // appointment gets nothing back and falls through to notFound().
  const { data: appointment } = await supabase
    .from("appointments")
    .select("*")
    .eq("id", appointmentId)
    .maybeSingle();

  if (!appointment) notFound();
  const appt = appointment as AppointmentRow;

  // What the header needs: who performs it, and (front desk) what is owed.
  const [{ data: team }, { data: balanceRows }] = await Promise.all([
    // The roster performs the work; the logins only record who acted.
    supabase.from("team_members").select("*").eq("is_active", true).order("full_name"),
    isFrontDesk
      ? supabase.rpc("appointment_balance", { p_appointment_id: appointmentId })
      : Promise.resolve({ data: [] as AppointmentBalance[] }),
  ]);

  const roster = (team ?? []) as TeamMemberRow[];
  const staffName = roster.find((m) => m.id === appt.staff_id)?.full_name ?? "Team member";

  const balance = ((balanceRows ?? []) as AppointmentBalance[])[0];
  const due = Number(balance?.amount_due ?? appt.price_at_booking);
  const paid = Number(balance?.amount_paid ?? 0);
  const outstanding = Number(balance?.balance ?? due);

  const localDate = instantToSalonDate(appt.starts_at, timeZone);
  const localStart = instantToSalonTime(appt.starts_at, timeZone);
  const localEnd = instantToSalonTime(appt.ends_at, timeZone);

  const editable = appt.status === "booked" || appt.status === "confirmed";
  const payable = editable || appt.status === "completed";

  /*
   * The payment state, which is deliberately NOT the service state. A visit can
   * be paid for in full before it happens, and completed while still owing.
   */
  const paymentLabel =
    paid <= 0 ? "Unpaid" : outstanding > 0.005 ? "Part-paid" : outstanding < -0.005 ? "Overpaid" : "Paid";
  const paymentTone =
    paymentLabel === "Paid" ? "good" : paymentLabel === "Unpaid" ? "critical" : "warning";

  const { tabs, active } = resolveTabs(session, TABS, query.tab);

  const money = { due, paid, outstanding };
  const when = { localDate, localStart, localEnd };

  return (
    <>
      <PageHeader
        breadcrumb={[
          { label: "Calendar", href: `/dashboard/calendar?tab=day&date=${localDate}` },
          { label: "Appointment" },
        ]}
        title={`${localStart}–${localEnd}`}
        subtitle={`${formatLongDayLabel(localDate)} · ${staffName} · times in ${timeZone}`}
        actions={
          <>
            <Pill tone={STATUS_TONE[appt.status]}>{STATUS_LABEL[appt.status]}</Pill>
            {appt.is_walk_in ? <Pill tone="warning">Walk-in</Pill> : null}
            {isFrontDesk ? <Pill tone={paymentTone}>{paymentLabel}</Pill> : null}
            {isFrontDesk && payable && outstanding > 0.005 ? (
              <ButtonLink
                href={`/dashboard/calendar/${appointmentId}?tab=payments`}
                size="sm"
              >
                Take payment
              </ButtonLink>
            ) : null}
          </>
        }
      />

      <PageFlash />

      {active ? (
        <>
          <PageTabs
            tabs={tabs}
            active={active}
            basePath={`/dashboard/calendar/${appointmentId}`}
            label="Appointment sections"
          />

          <TabPanel id={active}>
            <Suspense key={active} fallback={<TabFallback kpis={0} bodyHeight={300} />}>
              {active === "summary" ? (
                <SummaryTab appointment={appt} staffName={staffName} when={when} />
              ) : null}
              {active === "services" ? (
                <ServicesTab appointment={appt} isFrontDesk={isFrontDesk} editable={editable} />
              ) : null}
              {active === "payments" ? (
                <PaymentsTab
                  appointment={appt}
                  isOwner={isOwner}
                  payable={payable}
                  money={money}
                />
              ) : null}
              {active === "actions" ? (
                <ActionsTab appointment={appt} roster={roster} when={when} editable={editable} />
              ) : null}
            </Suspense>
          </TabPanel>
        </>
      ) : null}
    </>
  );
}
