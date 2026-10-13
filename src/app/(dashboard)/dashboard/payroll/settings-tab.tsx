import Link from "next/link";

import { CommissionForm } from "./commission-form";
import { EmptyState } from "@/components/ui/empty-state";
import { SidePanel, Split, SplitMain } from "@/components/ui/side-panel";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { requireModule } from "@/lib/auth/session";
import { describeArrangement } from "@/lib/pay-arrangement";
import { createClient } from "@/lib/supabase/server";
import type { StaffCompensationRow, TeamMemberRow } from "@/lib/types/database";

/**
 * Payroll › Pay settings: how each person on the roster is paid.
 *
 * The roster is who payroll pays. A person with no login appears here exactly
 * like anyone else: being payable has nothing to do with being able to sign in.
 * Editing is a link (`?edit=`), so the form is a server-chosen panel and the
 * table stays a plain table.
 */
export async function SettingsTab({ editId }: { editId: string }) {
  const session = await requireModule("payroll");
  const supabase = await createClient();
  const currency = session.salon.currency;

  const [{ data: team }, { data: compensation }] = await Promise.all([
    supabase.from("team_members").select("*").eq("is_active", true).order("full_name"),
    supabase.from("staff_compensation").select("*"),
  ]);

  const payable = (team ?? []) as TeamMemberRow[];
  const compByStaff = new Map<string, StaffCompensationRow>();
  for (const row of (compensation ?? []) as StaffCompensationRow[]) compByStaff.set(row.staff_id, row);

  if (payable.length === 0) return <EmptyState>No team members yet.</EmptyState>;

  const editing = payable.find((p) => p.id === editId) ?? null;

  return (
    <div className="space-y-3">
      <p className="text-small text-muted">
        Only you can see these. Each team member can see their own, and nobody else&rsquo;s.
      </p>

      <Split>
        <SplitMain>
          <Table label="Pay settings" className="min-w-[620px]">
            <TableHead>
              <TableRow>
                <TableHeader>Team member</TableHeader>
                <TableHeader>Arrangement</TableHeader>
                <TableHeader>Salary</TableHeader>
                <TableHeader>Commission</TableHeader>
                <TableHeader align="right">
                  <span className="sr-only">Edit</span>
                </TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {payable.map((person) => {
                const pay = describeArrangement(compByStaff.get(person.id) ?? null, currency);
                const chosen = editing?.id === person.id;
                return (
                  <TableRow key={person.id} selected={chosen}>
                    <TableCell className="font-semibold">{person.full_name}</TableCell>
                    <TableCell>{pay.type}</TableCell>
                    <TableCell>{pay.salary}</TableCell>
                    <TableCell>{pay.commission}</TableCell>
                    <TableCell align="right">
                      <Link
                        href={`/dashboard/payroll?tab=settings&edit=${person.id}`}
                        scroll={false}
                        aria-label={`Edit pay settings for ${person.full_name}`}
                        aria-current={chosen ? "true" : undefined}
                        className="inline-flex min-h-9 items-center rounded-[10px] border border-field bg-surface px-3 text-small font-semibold text-accent hover:bg-soft hover:text-accent-d focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                      >
                        Edit
                      </Link>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </SplitMain>

        {editing ? (
          <SidePanel
            title={editing.full_name}
            actions={
              <Link
                href="/dashboard/payroll?tab=settings"
                scroll={false}
                className="text-small font-semibold text-accent underline underline-offset-[3px]"
              >
                Close
              </Link>
            }
          >
            <CommissionForm
              key={editing.id}
              staffId={editing.id}
              name={editing.full_name}
              compensation={compByStaff.get(editing.id)}
              currency={currency}
            />
          </SidePanel>
        ) : null}
      </Split>
    </div>
  );
}
