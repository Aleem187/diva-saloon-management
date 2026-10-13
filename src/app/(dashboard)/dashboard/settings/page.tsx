import type { Metadata } from "next";

import { SettingsForm } from "./settings-form";
import { PageFlash } from "@/components/page-flash";
import { PageHeader } from "@/components/ui/page-header";
import { normaliseAppearance } from "@/lib/appearance";
import { requireModule } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { resolveTabs, type TabDefinition } from "@/lib/tabs";
import type { BusinessHours } from "@/lib/types/database";

export const metadata: Metadata = { title: "Settings" };

const DEFAULT_HOURS: BusinessHours = {
  mon: { open: "09:00", close: "18:00", closed: false },
  tue: { open: "09:00", close: "18:00", closed: false },
  wed: { open: "09:00", close: "18:00", closed: false },
  thu: { open: "09:00", close: "18:00", closed: false },
  fri: { open: "09:00", close: "18:00", closed: false },
  sat: { open: "10:00", close: "16:00", closed: false },
  sun: { open: "10:00", close: "16:00", closed: true },
};

/*
 * Appearance appears only once its migration (20260924000038) has been
 * applied: until the `theme` column exists there is nothing to save it to, so
 * the tab is not offered. Like the other tabs it needs the Settings module,
 * which is exactly what the salons UPDATE policy asks.
 */
const TABS: TabDefinition[] = [
  { id: "business", label: "Business" },
  { id: "region", label: "Region" },
  { id: "loyalty", label: "Loyalty" },
  { id: "hours", label: "Opening hours" },
  { id: "appearance", label: "Appearance", visibleFor: (s) => "theme" in s.salon },
];

export default async function SettingsPage({ searchParams }: PageProps<"/dashboard/settings">) {
  const session = await requireModule("settings");
  const params = await searchParams;
  const supabase = await createClient();

  /*
   * One read for every tab, unlike the other tabbed pages. A single Server
   * Action saves all of these fields together, so they all have to be in the
   * one form whichever tab is showing -- see SettingsForm.
   */
  const { data: settings } = await supabase
    .from("salon_settings")
    .select("*")
    .eq("salon_id", session.profile.salon_id)
    .maybeSingle();

  const { tabs, active } = resolveTabs(session, TABS, params.tab);

  return (
    <>
      <PageHeader
        title="Salon settings"
        subtitle="Business details, region, loyalty and opening hours."
      />

      <PageFlash />

      {active ? (
        <SettingsForm
          salon={session.salon}
          loyaltyEarnRate={settings?.loyalty_earn_rate ?? 0.05}
          businessHours={settings?.business_hours ?? DEFAULT_HOURS}
          tabs={tabs}
          active={active}
          appearance={"theme" in session.salon ? normaliseAppearance(session.salon) : undefined}
        />
      ) : null}
    </>
  );
}
