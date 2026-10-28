import Link from "next/link";

import { DirectorySearch } from "./directory-search";
import { ButtonLink } from "@/components/ui/button";
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
import { requireModule } from "@/lib/auth/session";
import { formatDate } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import type { CustomerRow } from "@/lib/types/database";

type DirectoryRow = Pick<CustomerRow, "id" | "full_name" | "phone" | "created_at">;

const PAGE_SIZE = 50;

/** Customers › Directory: search, and the newest customers. */
export async function DirectoryTab({ q }: { q: string }) {
  await requireModule("customers");
  const supabase = await createClient();

  let query = supabase
    .from("customers")
    .select("id, full_name, phone, created_at")
    .order("created_at", { ascending: false })
    .limit(PAGE_SIZE);

  if (q) {
    // Phone is the primary identifier, so a numeric query is matched against
    // the normalised column -- "0300 123" finds "+92 300 1234567".
    const digits = q.replace(/[^0-9]/g, "");
    query =
      digits.length >= 3
        ? query.ilike("phone_normalized", `%${digits}%`)
        : query.ilike("full_name", `%${q}%`);
  }

  const { data: customers } = await query;
  const rows = (customers ?? []) as DirectoryRow[];

  return (
    <div className="space-y-4">
      <DirectorySearch q={q} />

      {rows.length === 0 ? (
        <EmptyState
          action={
            <ButtonLink href="/dashboard/customers?tab=add" size="sm">
              Add a customer
            </ButtonLink>
          }
        >
          {q ? "No customer matches that search." : "No customers yet. Add the first one."}
        </EmptyState>
      ) : (
        <Card padding="none">
          <CardHeader
            title={q ? "Search results" : "Recently added"}
            description={q ? undefined : `Showing up to ${PAGE_SIZE}.`}
          />
          <div className="p-5">
            <Table label="Customers">
              <TableHead>
                <TableRow>
                  <TableHeader>Name</TableHeader>
                  <TableHeader>Phone</TableHeader>
                  <TableHeader align="right">Added</TableHeader>
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.map((customer) => (
                  <TableRow key={customer.id}>
                    <TableCell>
                      <Link
                        href={`/dashboard/customers/${customer.id}`}
                        className="font-semibold text-ink hover:text-accent hover:underline"
                      >
                        {customer.full_name}
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted">{customer.phone}</TableCell>
                    <TableCell align="right" className="text-muted">
                      {formatDate(customer.created_at)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}
    </div>
  );
}
