"use client";

import { useActionState, useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";

import { updateSettingsAction, type SettingsFormState } from "./actions";
import { LocaleFields } from "@/components/locale-fields";
import { Button, buttonClasses } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { ChoiceGroup } from "@/components/ui/choice-group";
import { Field, Input, Select } from "@/components/ui/field";
import { Flash } from "@/components/ui/flash";
import { PageTabs } from "@/components/ui/page-tabs";
import { Pill } from "@/components/ui/pill";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { SidePanel, Split, SplitMain } from "@/components/ui/side-panel";
import { SubmitButton } from "@/components/ui/submit-button";
import {
  BODY_FONT_META,
  BODY_FONTS,
  DEFAULT_APPEARANCE,
  HEADING_FONT_META,
  HEADING_FONTS,
  TEXT_SIZE_LABEL,
  TEXT_SIZES,
  THEME_META,
  THEMES,
  type Appearance,
} from "@/lib/appearance";
import { tabDomIds, tabHref, type TabItem } from "@/lib/tabs";
import type { BusinessHours, SalonRow } from "@/lib/types/database";

const DAYS = [
  ["mon", "Monday"],
  ["tue", "Tuesday"],
  ["wed", "Wednesday"],
  ["thu", "Thursday"],
  ["fri", "Friday"],
  ["sat", "Saturday"],
  ["sun", "Sunday"],
] as const;

const BASE_PATH = "/dashboard/settings";

/** Which tab a field lives on, by the name the action reports errors under. */
function tabOfField(field: string): string {
  if (field === "salonName" || field === "businessType") return "business";
  if (field === "country" || field === "currency" || field === "timezone") return "region";
  if (field.startsWith("loyalty")) return "loyalty";
  if (["theme", "fontHeading", "fontBody", "textSize"].includes(field)) return "appearance";
  if (field.startsWith("businessHours") || field.startsWith("hours")) return "hours";
  return "business";
}

/**
 * Settings: one form, one Server Action, four tabs.
 *
 * `updateSettingsAction` saves everything at once, so every tab's fields stay
 * in this one <form> and an inactive tab is hidden, not removed. Switching
 * tabs only changes the URL (?tab=); this component stays mounted, so nothing
 * typed on another tab is lost before Save.
 */
export function SettingsForm({
  salon,
  loyaltyEarnRate,
  businessHours,
  tabs,
  active,
  appearance,
}: {
  salon: SalonRow;
  loyaltyEarnRate: number;
  businessHours: BusinessHours;
  tabs: TabItem[];
  active: string;
  /** The saved appearance. Undefined until the appearance migration is applied. */
  appearance?: Appearance;
}) {
  const router = useRouter();
  const [state, formAction] = useActionState<SettingsFormState, FormData>(
    updateSettingsAction,
    {},
  );

  /*
   * The action state as it was when the visitor last edited something. Any
   * new result from the action replaces `state`, which makes this stale and so
   * clears "unsaved changes" -- after a save, or after a refusal that resets
   * the fields -- without an effect to reset it.
   */
  const [editedAt, setEditedAt] = useState<SettingsFormState | null>(null);
  const dirty = editedAt === state;
  // Bumping this remounts the fields from the loaded values: Discard.
  const [version, setVersion] = useState(0);
  // The appearance being chosen. It previews on the page at once and is saved
  // only with the rest of the form.
  const saved = appearance ?? DEFAULT_APPEARANCE;
  const [look, setLook] = useState<Appearance>(saved);

  /*
   * Preview: write the choice onto the dashboard root so the whole page changes
   * as you click. The cleanup puts the SAVED look back, so leaving the page or
   * discarding never leaves an unsaved choice on screen.
   */
  useEffect(() => {
    if (!appearance) return;
    const root = document.querySelector<HTMLElement>("[data-appearance-root]");
    if (!root) return;
    root.dataset.theme = look.theme;
    root.dataset.fontHeading = look.fontHeading;
    root.dataset.fontBody = look.fontBody;
    root.dataset.textSize = look.textSize;
    return () => {
      root.dataset.theme = appearance.theme;
      root.dataset.fontHeading = appearance.fontHeading;
      root.dataset.fontBody = appearance.fontBody;
      root.dataset.textSize = appearance.textSize;
    };
  }, [look, appearance]);

  function choose(patch: Partial<Appearance>) {
    setLook((current) => ({ ...current, ...patch }));
    // Buttons do not raise the form's input event the way radios do.
    setEditedAt(state);
  }

  // The first field the browser refused, to focus once its tab is showing.
  const refused = useRef<HTMLElement | null>(null);

  function goTo(tab: string) {
    router.replace(tabHref(BASE_PATH, "tab", tab), { scroll: false });
  }

  /*
   * A browser will not submit a form whose invalid field is hidden, and says
   * nothing. So the first refusal opens the tab that holds the field, and the
   * field is focused once it is visible.
   */
  function onInvalid(event: React.FormEvent<HTMLFormElement>) {
    if (refused.current) return;
    const field = event.target as HTMLElement;
    const panel = field.closest<HTMLElement>("[data-tab-panel]")?.dataset.tabPanel;
    if (panel && panel !== active) {
      refused.current = field;
      goTo(panel);
    }
  }

  useEffect(() => {
    const field = refused.current;
    if (!field) return;
    refused.current = null;
    field.focus();
    if ("reportValidity" in field) (field as HTMLInputElement).reportValidity();
  }, [active]);

  // Errors from the server: show them all, and open the first tab with one.
  const errorEntries = Object.entries(state.errors ?? {});
  const firstErrorTab = errorEntries.length > 0 ? tabOfField(errorEntries[0][0]) : null;
  useEffect(() => {
    if (firstErrorTab) router.replace(tabHref(BASE_PATH, "tab", firstErrorTab), { scroll: false });
  }, [firstErrorTab, state, router]);

  const label = (id: string) => tabs.find((t) => t.id === tabOfField(id))?.label ?? "";

  const panel = (id: string, children: ReactNode) => {
    const ids = tabDomIds("tab", id);
    return (
      <div
        role="tabpanel"
        id={ids.panel}
        aria-labelledby={ids.tab}
        data-tab-panel={id}
        hidden={id !== active}
      >
        {children}
      </div>
    );
  };

  return (
    <form
      action={formAction}
      onInput={() => setEditedAt(state)}
      onChange={() => setEditedAt(state)}
      onInvalidCapture={onInvalid}
      className="space-y-4"
    >
      {state.message ? <Flash tone="error">{state.message}</Flash> : null}
      {state.success ? <Flash tone="success">{state.success}</Flash> : null}
      {errorEntries.length > 0 ? (
        <Flash tone="error">
          <p className="font-semibold">Some settings need attention</p>
          <ul className="mt-1 list-disc pl-5">
            {errorEntries.map(([field, message]) => (
              <li key={field}>
                {label(field)}: {message}
              </li>
            ))}
          </ul>
        </Flash>
      ) : null}

      <PageTabs tabs={tabs} active={active} basePath={BASE_PATH} label="Settings sections" />

      <div key={version} className="space-y-4">
        {panel(
          "business",
          <div className="grid max-w-3xl gap-4">
            <Card>
              <CardTitle>Business name</CardTitle>
              <p className="-mt-2 mb-3.5 text-small text-muted">
                Shown in the sidebar, on receipts and in invitations.
              </p>
              <Field label="Salon name" htmlFor="salonName" error={state.errors?.salonName}>
                <Input
                  id="salonName"
                  name="salonName"
                  defaultValue={state.values?.salonName ?? salon.name}
                  required
                />
              </Field>
            </Card>
            <Card>
              <CardTitle>Business type</CardTitle>
              <Field label="Business type" htmlFor="businessType" error={state.errors?.businessType}>
                <Select
                  id="businessType"
                  name="businessType"
                  defaultValue={state.values?.businessType ?? salon.business_type}
                >
                  <option value="salon">Salon</option>
                  <option value="aesthetic_clinic">Aesthetic clinic</option>
                </Select>
              </Field>
            </Card>
          </div>,
        )}

        {panel(
          "region",
          <Card className="max-w-3xl">
            <CardTitle>Region</CardTitle>
            <LocaleFields
              idPrefix="settings"
              defaultCountry={state.values?.country ?? salon.country}
              defaultCurrency={state.values?.currency ?? salon.currency}
              defaultTimezone={state.values?.timezone ?? salon.timezone}
              errors={state.errors ?? {}}
            />
            <p className="mt-3 text-small text-muted">
              Appointments, receipts and every report are counted in this timezone.
            </p>
          </Card>,
        )}

        {panel(
          "loyalty",
          <Card className="max-w-xl">
            <CardTitle>Loyalty programme</CardTitle>
            <p className="-mt-2 mb-4 text-small text-muted">
              Points are held as a currency balance, not an abstract count.
            </p>
            <Field
              label="Earn rate"
              htmlFor="loyaltyEarnRatePercent"
              error={state.errors?.loyaltyEarnRatePercent}
              hint={`At ${(loyaltyEarnRate * 100).toFixed(2)}%, a 50 ${salon.currency} bill credits ${(50 * loyaltyEarnRate).toFixed(2)} ${salon.currency}.`}
            >
              <div className="flex items-center gap-2">
                <Input
                  id="loyaltyEarnRatePercent"
                  name="loyaltyEarnRatePercent"
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  defaultValue={(loyaltyEarnRate * 100).toFixed(2)}
                  required
                />
                <span className="text-small whitespace-nowrap text-muted">% of bill</span>
              </div>
            </Field>
          </Card>,
        )}

        {panel(
          "hours",
          <Card padding="none" className="max-w-3xl">
            <div className="border-b border-line px-5 py-4">
              <CardTitle className="mb-0">Weekly hours</CardTitle>
              <p className="mt-0.5 text-small text-muted">
                Used to bound the booking calendar.
                {state.errors?.businessHours ? (
                  <span className="ml-1 text-critical-fg">{state.errors.businessHours}</span>
                ) : null}
              </p>
            </div>
            <ul className="divide-y divide-line-soft">
              {DAYS.map(([key, dayLabel]) => {
                const day = businessHours[key];
                return (
                  <li key={key} className="flex flex-wrap items-center gap-3 px-5 py-3">
                    <span className="w-24 font-semibold">{dayLabel}</span>

                    <label className="flex items-center gap-2 text-muted">
                      <input
                        type="checkbox"
                        name={`hours.${key}.closed`}
                        defaultChecked={day.closed}
                        className="size-4 accent-accent"
                      />
                      Closed
                    </label>

                    <div className="flex items-center gap-2">
                      <label htmlFor={`hours-${key}-open`} className="sr-only">
                        {dayLabel} opening time
                      </label>
                      <Input
                        id={`hours-${key}-open`}
                        name={`hours.${key}.open`}
                        type="time"
                        defaultValue={day.open}
                        className="w-32"
                      />
                      <span className="text-muted">to</span>
                      <label htmlFor={`hours-${key}-close`} className="sr-only">
                        {dayLabel} closing time
                      </label>
                      <Input
                        id={`hours-${key}-close`}
                        name={`hours.${key}.close`}
                        type="time"
                        defaultValue={day.close}
                        className="w-32"
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          </Card>,
        )}

        {appearance
          ? panel(
              "appearance",
              <Split>
                <SplitMain className="space-y-4">
                  <Card>
                    <CardTitle>Colour scheme</CardTitle>
                    <p className="-mt-2 mb-4 text-small text-muted">
                      Applies to everyone in your salon. Changes preview instantly — save to keep
                      them.
                    </p>
                    <ChoiceGroup
                      name="theme"
                      legend="Colour scheme"
                      value={look.theme}
                      onValueChange={(theme) => choose({ theme })}
                      options={THEMES.map((theme) => ({
                        value: theme,
                        label: THEME_META[theme].name,
                        description: THEME_META[theme].hint,
                        // Scoped to its own scheme, so the swatches are that
                        // scheme's sidebar, accent and tint.
                        preview: (
                          <span
                            aria-hidden
                            data-theme={theme}
                            className="flex h-10 overflow-hidden rounded-[10px]"
                          >
                            <span className="flex-1 bg-side" />
                            <span className="flex-1 bg-accent" />
                            <span className="flex-1 bg-soft" />
                          </span>
                        ),
                      }))}
                    />
                  </Card>

                  <Card>
                    <CardTitle>Fonts</CardTitle>
                    <p className="-mt-2 mb-2 text-small text-muted">
                      Choose a font for headings and one for everyday text.
                    </p>

                    <p className="mt-4 mb-2 text-small font-semibold">Heading font</p>
                    <ChoiceGroup
                      name="fontHeading"
                      legend="Heading font"
                      minWidth={160}
                      value={look.fontHeading}
                      onValueChange={(fontHeading) => choose({ fontHeading })}
                      options={HEADING_FONTS.map((font) => ({
                        value: font,
                        label: "Aa Salon",
                        labelStyle: { fontFamily: HEADING_FONT_META[font].css },
                        description: `${HEADING_FONT_META[font].name} · ${HEADING_FONT_META[font].hint}`,
                      }))}
                    />

                    <p className="mt-5 mb-2 text-small font-semibold">Body text font</p>
                    <ChoiceGroup
                      name="fontBody"
                      legend="Body text font"
                      minWidth={200}
                      value={look.fontBody}
                      onValueChange={(fontBody) => choose({ fontBody })}
                      options={BODY_FONTS.map((font) => ({
                        value: font,
                        label: "Book a blow-dry for Tuesday at 11:00.",
                        labelStyle: { fontFamily: BODY_FONT_META[font].css, fontWeight: 400 },
                        description: BODY_FONT_META[font].name,
                      }))}
                    />

                    <p className="mt-5 mb-2 text-small font-semibold">Text size</p>
                    <input type="hidden" name="textSize" value={look.textSize} />
                    <SegmentedControl
                      aria-label="Text size"
                      value={look.textSize}
                      onValueChange={(textSize) => choose({ textSize })}
                      options={TEXT_SIZES.map((size) => ({
                        value: size,
                        label: TEXT_SIZE_LABEL[size],
                      }))}
                    />
                  </Card>
                </SplitMain>

                <SidePanel
                  title="Preview"
                  actions={
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={
                        look.theme === DEFAULT_APPEARANCE.theme &&
                        look.fontHeading === DEFAULT_APPEARANCE.fontHeading &&
                        look.fontBody === DEFAULT_APPEARANCE.fontBody &&
                        look.textSize === DEFAULT_APPEARANCE.textSize
                      }
                      onClick={() => choose(DEFAULT_APPEARANCE)}
                    >
                      Reset to default
                    </Button>
                  }
                >
                  {/* A small stand-in for the app. It is not interactive. */}
                  <div
                    aria-hidden
                    className="grid grid-cols-[64px_1fr] overflow-hidden rounded-xl border border-line"
                  >
                    <div className="space-y-1.5 bg-side p-2.5">
                      <span className="block h-2 w-3/4 rounded-full bg-side-hover" />
                      <span className="block h-2 rounded-full bg-soft" />
                      <span className="block h-2 rounded-full bg-side-hover" />
                      <span className="block h-2 w-4/5 rounded-full bg-side-hover" />
                    </div>
                    <div className="space-y-2.5 bg-page p-3.5">
                      <p className="font-heading text-section font-semibold">Customers</p>
                      <p className="flex gap-3 border-b border-line text-small">
                        <span className="-mb-px border-b-2 border-accent pb-1.5 font-semibold text-accent">
                          Directory
                        </span>
                        <span className="pb-1.5 text-muted">Add customer</span>
                      </p>
                      <div className="space-y-2 rounded-xl border border-line bg-surface p-3">
                        <strong className="block font-heading">Sample customer</strong>
                        <span className="block text-small text-muted">
                          23 visits · loyalty balance shown here
                        </span>
                        <span className="flex gap-1.5">
                          <span className={buttonClasses({ size: "sm" })}>Book</span>
                          <span className={buttonClasses({ size: "sm", variant: "ghost" })}>
                            Start sale
                          </span>
                        </span>
                      </div>
                    </div>
                  </div>

                  <dl className="text-small">
                    <div className="flex items-center justify-between border-b border-line-soft py-2.5">
                      <dt className="text-muted">Scheme</dt>
                      <dd className="font-semibold">{THEME_META[look.theme].name}</dd>
                    </div>
                    <div className="flex items-center justify-between border-b border-line-soft py-2.5">
                      <dt className="text-muted">Headings</dt>
                      <dd>{HEADING_FONT_META[look.fontHeading].name}</dd>
                    </div>
                    <div className="flex items-center justify-between py-2.5">
                      <dt className="text-muted">Body text</dt>
                      <dd>{BODY_FONT_META[look.fontBody].name}</dd>
                    </div>
                  </dl>
                  <p className="text-small text-muted">
                    Receipts and printed pages always use black text on white, so they stay
                    readable.
                  </p>
                  {look.theme !== saved.theme ||
                  look.fontHeading !== saved.fontHeading ||
                  look.fontBody !== saved.fontBody ||
                  look.textSize !== saved.textSize ? (
                    <Pill tone="warning">Not saved yet</Pill>
                  ) : null}
                </SidePanel>
              </Split>,
            )
          : null}
      </div>

      {/* Always present: one Save covers every tab. */}
      <div className="sticky bottom-4 z-10 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-surface px-4 py-3 shadow-lg">
        <span className="text-small text-muted" role="status">
          {dirty ? "You have unsaved changes." : "Saving applies to every tab."}
        </span>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={!dirty}
            onClick={() => {
              setVersion((v) => v + 1);
              setLook(saved);
              setEditedAt(null);
            }}
          >
            Discard
          </Button>
          <SubmitButton size="sm" pendingLabel="Saving...">
            Save changes
          </SubmitButton>
        </div>
      </div>
    </form>
  );
}
