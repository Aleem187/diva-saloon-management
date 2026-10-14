import { Suspense } from "react";
import type { Metadata } from "next";

import { AccountsTab } from "./accounts-tab";
import { AddStaffTab } from "./add-staff-tab";
import { InvitesTab } from "./invites-tab";
import { RolesTab } from "./roles-tab";
import { RosterTab } from "./roster-tab";
import { PageFlash } from "@/components/page-flash";
import { PageHeader } from "@/components/ui/page-header";
import { PageTabs } from "@/components/ui/page-tabs";
import { TabFallback } from "@/components/ui/tab-fallback";
import { TabPanel } from "@/components/ui/tab-panel";
import { requireModule } from "@/lib/auth/session";
import { ownerOnly, resolveTabs, type TabDefinition } from "@/lib/tabs";

export const metadata: Metadata = { title: "Team" };

const TABS: TabDefinition[] = [
  { id: "roster", label: "Roster" },
  // Creates an account with a password the owner chooses, so it is owner only.
  { id: "addstaff", label: "Add staff", visibleFor: ownerOnly },
  { id: "invites", label: "Invitations" },
  { id: "roles", label: "Roles & permissions" },
  { id: "accounts", label: "Linked accounts" },
];

export default async function TeamPage({ searchParams }: PageProps<"/dashboard/team">) {
  const session = await requireModule("team");
  const params = await searchParams;

  // Only the active tab below is rendered, so nothing else is fetched.
  const { tabs, active } = resolveTabs(session, TABS, params.tab);

  return (
    <>
      <PageHeader
        title="Team & access"
        subtitle="Who works here, and who can sign in. They are deliberately not the same list."
      />

      <PageFlash />

      {active ? (
        <>
          <PageTabs tabs={tabs} active={active} basePath="/dashboard/team" label="Team sections" />

          <TabPanel id={active}>
            <Suspense key={active} fallback={<TabFallback kpis={4} bodyHeight={320} />}>
              {active === "roster" ? <RosterTab /> : null}
              {active === "addstaff" ? <AddStaffTab /> : null}
              {active === "invites" ? <InvitesTab /> : null}
              {active === "roles" ? <RolesTab /> : null}
              {active === "accounts" ? <AccountsTab /> : null}
            </Suspense>
          </TabPanel>
        </>
      ) : null}
    </>
  );
}
