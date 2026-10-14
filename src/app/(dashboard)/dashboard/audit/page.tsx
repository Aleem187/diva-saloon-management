import { Suspense } from "react";
import type { Metadata } from "next";

import { ActivityTab } from "./activity-tab";
import { PeopleTab } from "./people-tab";
import { AUDIT_WINDOW_DAYS, auditWindow, hasFilters, filterParams, readFilters, type Actor } from "./query";
import { SensitiveTab } from "./sensitive-tab";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/field";
import { PageHeader } from "@/components/ui/page-header";
import { PageTabs } from "@/components/ui/page-tabs";
import { TabFallback } from "@/components/ui/tab-fallback";
import { TabPanel } from "@/components/ui/tab-panel";
import { requireModule } from "@/lib/auth/session";
import { AUDIT_CATEGORIES, actionLabel, actionsInCategory } from "@/lib/audit-categories";
import { createClient } from "@/lib/supabase/server";
import { resolveTabs, type TabDefinition } from "@/lib/tabs";

export const metadata: Metadata = { title: "Audit log" };

const TABS: TabDefinition[] = [
  { id: "activity", label: "All activity" },
  { id: "people", label: "By person" },
  { id: "sensitive", label: "Sensitive actions" },
];

export default async function AuditPage({ searchParams }: PageProps<"/dashboard/audit">) {
  const session = await requireModule("audit");
  const params = await searchParams;

  const window = auditWindow(session.salon.timezone);
  const read = readFilters(params);
  // A From before the window is shown as the window's first day: that is what
  // the query will use, and the date box should not claim otherwise.
  const filters = read.from && read.from < window.startDate ? { ...read, from: window.startDate } : read;
  const entryId = typeof params.entry === "string" ? params.entry : "";

  // Only the active tab below is rendered, so nothing else is fetched.
  const { tabs, active } = resolveTabs(session, TABS, params.tab);

  const supabase = await createClient();
  const { data: actorRows } = await supabase
    .from("profiles")
    .select("id, full_name, email")
    .order("full_name");
  const actors = (actorRows ?? []) as Actor[];

  return (
    <>
      <PageHeader
        title="Audit log"
        subtitle={`The last ${AUDIT_WINDOW_DAYS} days of an append-only record of sensitive actions. It cannot be edited or deleted, here or anywhere else.`}
      />

      {active ? (
        <>
          <Card className="mb-4">
            {/* A plain GET form: a filtered view is a link you can share and refresh. */}
            <form method="get" className="flex flex-wrap items-end gap-3">
              <input type="hidden" name="tab" value={active} />
              {filters.category ? (
                <input type="hidden" name="category" value={filters.category} />
              ) : null}

              <Field label="Action" htmlFor="audit-action" className="w-56">
                <Select id="audit-action" name="action" defaultValue={filters.action}>
                  <option value="">All actions</option>
                  {AUDIT_CATEGORIES.map((category) => (
                    <optgroup key={category.id} label={category.label}>
                      {actionsInCategory(category.id).map((action) => (
                        <option key={action} value={action}>
                          {actionLabel(action)}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </Select>
              </Field>

              <Field label="Actor" htmlFor="audit-actor" className="w-52">
                <Select id="audit-actor" name="actor" defaultValue={filters.actor}>
                  <option value="">Anyone</option>
                  {actors.map((actor) => (
                    <option key={actor.id} value={actor.id}>
                      {actor.full_name || actor.email}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field label="From" htmlFor="audit-from" className="w-40">
                <Input
                  id="audit-from"
                  name="from"
                  type="date"
                  min={window.startDate}
                  max={window.today}
                  defaultValue={filters.from}
                />
              </Field>

              <Field label="To" htmlFor="audit-to" className="w-40">
                <Input
                  id="audit-to"
                  name="to"
                  type="date"
                  min={window.startDate}
                  max={window.today}
                  defaultValue={filters.to}
                />
              </Field>

              <Button type="submit" variant="ghost">
                Apply
              </Button>
              {hasFilters(filters) ? (
                <ButtonLink href={`/dashboard/audit?tab=${active}`} variant="ghost">
                  Clear
                </ButtonLink>
              ) : null}
            </form>
          </Card>

          <PageTabs
            tabs={tabs}
            active={active}
            basePath="/dashboard/audit"
            params={filterParams(filters)}
            label="Audit log sections"
          />

          <TabPanel id={active}>
            <Suspense key={active} fallback={<TabFallback kpis={0} bodyHeight={360} />}>
              {active === "activity" ? (
                <ActivityTab filters={filters} entryId={entryId} actors={actors} />
              ) : null}
              {active === "people" ? <PeopleTab filters={filters} actors={actors} /> : null}
              {active === "sensitive" ? (
                <SensitiveTab filters={filters} entryId={entryId} actors={actors} />
              ) : null}
            </Suspense>
          </TabPanel>
        </>
      ) : null}
    </>
  );
}
