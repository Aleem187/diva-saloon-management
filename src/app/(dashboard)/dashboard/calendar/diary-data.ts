import "server-only";

import type { SessionContext } from "@/lib/auth/session";
import { isFrontDeskSession } from "@/lib/front-desk";
import { createClient } from "@/lib/supabase/server";
import {
  addDays,
  instantToSalonDate,
  instantToSalonTime,
} from "@/lib/time";
import type {
  AppointmentBalance,
  AppointmentRow,
  AppointmentServiceRow,
  BusinessHours,
  CustomerRow,
  ProfileRow,
  ServiceRow,
  TeamMemberRow,
} from "@/lib/types/database";


/**
 * Everything the Day, Week and Agenda tabs read, with the queries exactly as
 * they were when they lived in the page. Moved here so that a tab runs them
 * only when it is the tab being shown.
 *
 * `withHours` is true for the grid views, which bound themselves by the
 * opening hours; the agenda does not read them.
 */
export async function loadDiary(
  session: SessionContext,
  range: { rangeStart: string; rangeEnd: string },
  { withHours }: { withHours: boolean },
) {
  const supabase = await createClient();
  const isFrontDesk = isFrontDeskSession(session);

  // Query a generous window in salon-local terms, then bucket by local date.
  // The extra day on each side absorbs the timezone offset.
  const windowStart = `${addDays(range.rangeStart, -1)}T00:00:00.000Z`;
  const windowEnd = `${addDays(range.rangeEnd, 2)}T00:00:00.000Z`;

  const [
    { data: appointments },
    { data: team },
    { data: services },
    { data: customers },
    { data: settings },
  ] = await Promise.all([
    // RLS already limits a therapist to their own appointments; no filter here
    // decides who sees what.
    supabase
      .from("appointments")
      .select("*")
      .gte("starts_at", windowStart)
      .lt("starts_at", windowEnd)
      .order("starts_at"),
    // The ROSTER, not the logins. Who can be booked is a question about the
    // team, and plenty of the team never sign in.
    supabase.from("team_members").select("*").eq("is_active", true).order("full_name"),
    supabase.from("services").select("*").eq("is_active", true).order("name"),
    isFrontDesk
      ? supabase.from("customers").select("*").order("full_name").limit(500)
      : Promise.resolve({ data: [] as CustomerRow[] }),
    withHours
      ? supabase
          .from("salon_settings")
          .select("business_hours")
          .eq("salon_id", session.profile.salon_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  /*
   * The booked services. `appointments.service_id` is only the FIRST line --
   * it is kept for the qualification guard and the Phase 6 reports -- so
   * anything that shows a customer what they booked reads this table instead.
   */
  const appointmentIds = ((appointments ?? []) as AppointmentRow[]).map((a) => a.id);
  const { data: bookedServices } = appointmentIds.length
    ? await supabase
        .from("appointment_services")
        .select("*")
        .in("appointment_id", appointmentIds)
        .order("sort_order")
    : { data: [] as AppointmentServiceRow[] };

  /*
   * What each visit is owed and has been paid. Summed in Postgres rather than
   * here: money arithmetic is the database's job, and one call beats a query
   * per row. The front desk alone can read the ledger, so a therapist simply
   * gets an empty list and no payment badges.
   */
  const { data: balanceRows } =
    isFrontDesk && appointmentIds.length
      ? await supabase.rpc("appointment_balances", { p_appointment_ids: appointmentIds })
      : { data: [] as (AppointmentBalance & { appointment_id: string })[] };

  const balanceByAppointment = new Map<string, AppointmentBalance>();
  for (const row of (balanceRows ?? []) as (AppointmentBalance & {
    appointment_id: string;
  })[]) {
    balanceByAppointment.set(row.appointment_id, row);
  }

  const linesByAppointment = new Map<string, AppointmentServiceRow[]>();
  for (const line of (bookedServices ?? []) as AppointmentServiceRow[]) {
    linesByAppointment.set(line.appointment_id, [
      ...(linesByAppointment.get(line.appointment_id) ?? []),
      line,
    ]);
  }

  // Everyone on the roster is bookable.
  const therapists = (team ?? []) as TeamMemberRow[];

  // A therapist sees only their own column of the diary -- matched on their
  // roster entry, which is what appointments actually reference.
  const columns = isFrontDesk
    ? therapists
    : therapists.filter((p) => p.id === session.teamMemberId);

  const nameById = new Map<string, string>();
  for (const p of therapists) nameById.set(p.id, p.full_name);

  // Who took each booking. A login, deliberately separate from the roster.
  const { data: logins } = await supabase.from("profiles").select("id, full_name, email");
  const bookedByName = new Map<string, string>();
  for (const p of (logins ?? []) as Pick<ProfileRow, "id" | "full_name" | "email">[]) {
    bookedByName.set(p.id, p.full_name || p.email);
  }

  const serviceById = new Map<string, ServiceRow>();
  for (const s of (services ?? []) as ServiceRow[]) serviceById.set(s.id, s);

  const customerById = new Map<string, CustomerRow>();
  for (const c of (customers ?? []) as CustomerRow[]) customerById.set(c.id, c);

  const businessHours = (settings?.business_hours ?? null) as BusinessHours | null;
  const timeZone = session.salon.timezone;

  const visible = ((appointments ?? []) as AppointmentRow[]).map((appointment) => {
    const lines = linesByAppointment.get(appointment.id) ?? [];
    return {
      ...appointment,
      localDate: instantToSalonDate(appointment.starts_at, timeZone),
      localStart: instantToSalonTime(appointment.starts_at, timeZone),
      localEnd: instantToSalonTime(appointment.ends_at, timeZone),
      lines,
      // A booking made before the lines table existed still has its one
      // service on the appointment itself.
      serviceSummary:
        lines.length > 0
          ? lines
              .map((l) => (l.quantity > 1 ? `${l.service_name} ×${l.quantity}` : l.service_name))
              .join(", ")
          : (serviceById.get(appointment.service_id)?.name ?? "Service"),
      blockTitle:
        lines.length > 1
          ? `${lines[0].service_name} +${lines.length - 1}`
          : (lines[0]?.service_name ?? serviceById.get(appointment.service_id)?.name ?? "Service"),
      customerName: customerById.get(appointment.customer_id)?.full_name ?? "Customer",
      staffName: nameById.get(appointment.staff_id) ?? "Team member",
      balance: balanceByAppointment.get(appointment.id) ?? null,
    };
  });

  const inRange = visible.filter(
    (a) => a.localDate >= range.rangeStart && a.localDate <= range.rangeEnd,
  );

  return {
    isFrontDesk,
    therapists,
    columns,
    businessHours,
    bookedByName,
    inRange,
    timeZone,
    currency: session.salon.currency,
  };
}

export type DiaryAppointment = Awaited<ReturnType<typeof loadDiary>>["inRange"][number];
