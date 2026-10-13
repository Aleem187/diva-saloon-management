import { ServicesEditor } from "./services-editor";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { requireSession } from "@/lib/auth/session";
import { formatMoney } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import type { AppointmentRow, AppointmentServiceRow, ServiceRow } from "@/lib/types/database";

function Row({ label, value, good = false }: { label: string; value: string; good?: boolean }) {
  return (
    <div className="flex items-center justify-between text-muted">
      <dt>{label}</dt>
      <dd className={good ? "tabular-nums text-good-fg" : "tabular-nums"}>{value}</dd>
    </div>
  );
}

/** Appointment › Services & price: what was booked, and (front desk) changing it. */
export async function ServicesTab({
  appointment: appt,
  isFrontDesk,
  editable,
}: {
  appointment: AppointmentRow;
  isFrontDesk: boolean;
  editable: boolean;
}) {
  const session = await requireSession();
  const supabase = await createClient();
  const currency = session.salon.currency;

  const canEdit = isFrontDesk && editable;

  const [{ data: lines }, { data: services }] = await Promise.all([
    supabase
      .from("appointment_services")
      .select("*")
      .eq("appointment_id", appt.id)
      .order("sort_order"),
    // Only the editor needs the catalogue.
    canEdit
      ? supabase.from("services").select("*").eq("is_active", true).order("name")
      : Promise.resolve({ data: [] as ServiceRow[] }),
  ]);

  const bookedLines = (lines ?? []) as AppointmentServiceRow[];

  return (
    <div className="space-y-4">
      <Card padding="none">
        <CardHeader title="The booking" description="What was booked, and the price agreed." />

        {bookedLines.length === 0 ? (
          <div className="p-5">
            <EmptyState>No services recorded on this booking.</EmptyState>
          </div>
        ) : (
          <div className="p-5 pb-0">
            <Table label="Booked services">
              <TableHead>
                <TableRow>
                  <TableHeader>Service</TableHeader>
                  <TableHeader align="right">Qty</TableHeader>
                  <TableHeader align="right">Price</TableHeader>
                  <TableHeader align="right">Total</TableHeader>
                </TableRow>
              </TableHead>
              <TableBody>
                {bookedLines.map((line) => (
                  <TableRow key={line.id}>
                    <TableCell>{line.service_name}</TableCell>
                    <TableCell align="right">{line.quantity}</TableCell>
                    <TableCell align="right">{formatMoney(line.unit_price, currency)}</TableCell>
                    <TableCell align="right">
                      {formatMoney(Number(line.unit_price) * line.quantity, currency)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        <dl className="ml-auto w-full max-w-sm space-y-1.5 px-5 py-4 text-small">
          <Row label="Services subtotal" value={formatMoney(appt.services_subtotal, currency)} />
          {Number(appt.discount_amount) > 0 ? (
            <Row
              label="Discount"
              value={`− ${formatMoney(appt.discount_amount, currency)}`}
              good
            />
          ) : null}
          {appt.quoted_total !== null ? (
            <Row label="Quoted price" value={formatMoney(appt.quoted_total, currency)} />
          ) : null}
          <div className="flex items-center justify-between border-t border-line pt-2 font-semibold text-ink">
            <dt>Agreed at booking</dt>
            <dd className="font-heading text-section tabular-nums">
              {formatMoney(appt.price_at_booking, currency)}
            </dd>
          </div>
        </dl>
      </Card>

      {canEdit ? (
        <Card padding="none">
          <CardHeader
            title="Change the services or the price"
            description="Available until the visit is finished or billed. The slot length follows the services, and the new price cannot fall below what has already been paid."
          />
          <div className="p-5">
            <ServicesEditor
              appointmentId={appt.id}
              services={(services ?? []) as ServiceRow[]}
              booked={bookedLines}
              discount={Number(appt.discount_amount)}
              quotedTotal={appt.quoted_total === null ? null : Number(appt.quoted_total)}
              currency={currency}
            />
          </div>
        </Card>
      ) : null}
    </div>
  );
}
