import { GeneratePayrollForm } from "./generate-form";
import { Card, CardTitle } from "@/components/ui/card";
import { requireModule } from "@/lib/auth/session";

/** Payroll › Generate period: dates in, a draft out. All the arithmetic is in Postgres. */
export async function GenerateTab() {
  await requireModule("payroll");

  return (
    <Card className="max-w-2xl">
      <CardTitle>Generate a pay period</CardTitle>
      <p className="-mt-2 mb-4 text-small text-muted">
        Commission is read from the issued receipts in the period (voided ones are excluded) and
        counted by your salon&rsquo;s own timezone, using each team member&rsquo;s pay settings and
        the services they performed. Salaries are pro-rated across the period. The result is a
        draft you can check before marking it paid. Periods cannot overlap, so the same work can
        never be paid twice.
      </p>
      <GeneratePayrollForm />
    </Card>
  );
}
