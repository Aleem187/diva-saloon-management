import { formatMoney } from "@/lib/format";
import type { StaffCompensationRow } from "@/lib/types/database";

export interface PayArrangement {
  type: string;
  salary: string;
  commission: string;
}

/**
 * How one person is paid, as three plain statements.
 *
 * Salary and commission are independent arrangements, so this has to be able
 * to say both, either, or neither -- "neither" being the case where every
 * service carries its own rate and the person has none of their own. Display
 * only: the amounts are the stored rates, and nothing here is multiplied.
 */
export function describeArrangement(
  comp: Pick<
    StaffCompensationRow,
    "commission_basis" | "commission_rate" | "fixed_amount" | "salary_amount"
  > | null,
  currency: string,
): PayArrangement {
  if (!comp) return { type: "Not set", salary: "Not set", commission: "Not set" };

  const hasSalary = Number(comp.salary_amount) > 0;
  const salary = hasSalary ? `${formatMoney(comp.salary_amount, currency)} a month` : "None";

  let commission: string;
  let commissionKind: "rate" | "own" | "none";
  if (comp.commission_basis === "percentage") {
    commission = `${(Number(comp.commission_rate ?? 0) * 100).toFixed(2)}% of each service`;
    commissionKind = "rate";
  } else if (comp.commission_basis === "fixed_per_service") {
    commission = `${formatMoney(comp.fixed_amount ?? 0, currency)} per service`;
    commissionKind = "rate";
  } else if (comp.commission_basis === null) {
    commission = "Each service's own rate";
    commissionKind = "own";
  } else {
    commission = "None";
    commissionKind = "none";
  }

  let type: string;
  if (hasSalary) {
    type =
      commissionKind === "rate"
        ? "Salary + commission"
        : commissionKind === "own"
          ? "Salary + each service's own rate"
          : "Salary only";
  } else {
    type = commissionKind === "rate" ? "Commission only" : commissionKind === "own" ? "Each service's own rate" : "Not set";
  }

  return { type, salary, commission };
}
