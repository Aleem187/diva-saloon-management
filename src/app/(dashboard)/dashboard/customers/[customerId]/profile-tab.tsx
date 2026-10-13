import { CustomerForm } from "../customer-form";
import { Card, CardTitle } from "@/components/ui/card";
import { ageFrom, formatDate } from "@/lib/format";
import type { CustomerRow } from "@/lib/types/database";

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-fine font-semibold tracking-[0.05em] text-muted uppercase">{label}</dt>
      <dd className="mt-0.5">{value}</dd>
    </div>
  );
}

/** Customer › Profile: the details, and (front desk) editing them in place. */
export function ProfileTab({
  customer,
  canManage,
}: {
  customer: CustomerRow;
  canManage: boolean;
}) {
  const age = ageFrom(customer.date_of_birth);

  return (
    <div className="space-y-4">
      <Card>
        <CardTitle>Details</CardTitle>
        <dl className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(180px,1fr))]">
          <Detail label="Phone" value={customer.phone} />
          <Detail label="Email" value={customer.email ?? "—"} />
          <Detail
            label="Date of birth"
            value={
              customer.date_of_birth
                ? `${formatDate(customer.date_of_birth)}${age !== null ? ` (${age})` : ""}`
                : "—"
            }
          />
          <Detail label="Customer since" value={formatDate(customer.created_at)} />
        </dl>
        {customer.notes ? (
          <div className="mt-4 border-t border-line pt-4">
            <p className="text-fine font-semibold tracking-[0.05em] text-muted uppercase">Notes</p>
            <p className="mt-1 whitespace-pre-wrap">{customer.notes}</p>
          </div>
        ) : null}
      </Card>

      {canManage ? (
        <Card className="max-w-3xl">
          <CardTitle>Edit details</CardTitle>
          <CustomerForm customer={customer} inline />
        </Card>
      ) : null}
    </div>
  );
}
