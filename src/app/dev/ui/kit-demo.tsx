"use client";

import { useState, type ReactNode } from "react";

import { demoFlashAction } from "./actions";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { ChoiceGroup } from "@/components/ui/choice-group";
import { Combobox } from "@/components/ui/combobox";
import { cn } from "@/components/ui/cn";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Field,
  FileInput,
  Input,
  Select,
  SelectField,
  Textarea,
  TextareaField,
  TextField,
} from "@/components/ui/field";
import { Flash, type FlashTone } from "@/components/ui/flash";
import { Pill, type PillTone } from "@/components/ui/pill";
import { RouteTabs } from "@/components/ui/route-tabs";
import { ServiceTiles } from "@/components/ui/service-tiles";
import { Spinner } from "@/components/ui/spinner";
import { LocaleFields } from "@/components/locale-fields";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { SidePanel, Split, SplitMain } from "@/components/ui/side-panel";
import { Skeleton, SkeletonGroup } from "@/components/ui/skeleton";
import { StatTile } from "@/components/ui/stat-tile";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableFoot,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ToastProvider, useToast } from "@/components/ui/toast";
import {
  BODY_FONTS,
  DEFAULT_APPEARANCE,
  HEADING_FONTS,
  TEXT_SIZES,
  THEMES,
  type Appearance,
} from "@/lib/appearance";

const toOptions = <T extends string>(values: readonly T[]) =>
  values.map((v) => ({ value: v, label: v }));

const PILL_TONES: PillTone[] = ["good", "warning", "critical", "info", "neutral", "accent"];
const FLASH_TONES: FlashTone[] = ["success", "error", "warning", "info", "accent"];

const SWATCHES: { name: string; className: string }[] = [
  { name: "accent", className: "bg-accent" },
  { name: "accent-d", className: "bg-accent-d" },
  { name: "soft", className: "bg-soft" },
  { name: "side", className: "bg-side" },
  { name: "page (--bg)", className: "bg-page" },
  { name: "surface", className: "bg-surface" },
  { name: "ink", className: "bg-ink" },
  { name: "muted", className: "bg-muted" },
  { name: "line", className: "bg-line" },
  { name: "good", className: "bg-good" },
  { name: "good-bg", className: "bg-good-bg" },
  { name: "warning", className: "bg-warning" },
  { name: "warning-bg", className: "bg-warning-bg" },
  { name: "critical", className: "bg-critical" },
  { name: "critical-bg", className: "bg-critical-bg" },
  { name: "info", className: "bg-info" },
  { name: "info-bg", className: "bg-info-bg" },
  { name: "neutral", className: "bg-neutral" },
  { name: "neutral-bg", className: "bg-neutral-bg" },
];

export function KitDemo({
  fontClass,
  flashSlot,
  tabsDemo,
}: {
  fontClass: string;
  /** Server-rendered `<PageFlash />`: shows a message left by a redirecting action. */
  flashSlot: ReactNode;
  /** Server-rendered PageHeader, PageTabs, SubTabs and Suspense demo. */
  tabsDemo: ReactNode;
}) {
  const [look, setLook] = useState<Appearance>(DEFAULT_APPEARANCE);

  return (
    <div
      data-theme={look.theme}
      data-font-heading={look.fontHeading}
      data-font-body={look.fontBody}
      data-text-size={look.textSize}
      className={cn(fontClass, "min-h-dvh bg-page leading-[1.45] text-ink")}
    >
      <ToastProvider>
        <main className="mx-auto max-w-[1280px] space-y-10 px-4 py-8 sm:px-8">
          <header className="space-y-1">
            <h1 className="font-heading text-title font-semibold">UI kit</h1>
            <p className="text-muted">
              Development only. Every component in every state, in the scheme, fonts and size
              chosen below.
            </p>
          </header>

          {flashSlot}

          <Section title="Appearance">
            <Card className="space-y-4">
              <Labelled label="Colour scheme">
                <SegmentedControl
                  aria-label="Colour scheme"
                  options={toOptions(THEMES)}
                  value={look.theme}
                  onValueChange={(theme) => setLook({ ...look, theme })}
                />
              </Labelled>
              <Labelled label="Heading font">
                <SegmentedControl
                  aria-label="Heading font"
                  options={toOptions(HEADING_FONTS)}
                  value={look.fontHeading}
                  onValueChange={(fontHeading) => setLook({ ...look, fontHeading })}
                />
              </Labelled>
              <Labelled label="Body font">
                <SegmentedControl
                  aria-label="Body font"
                  options={toOptions(BODY_FONTS)}
                  value={look.fontBody}
                  onValueChange={(fontBody) => setLook({ ...look, fontBody })}
                />
              </Labelled>
              <Labelled label="Text size">
                <SegmentedControl
                  aria-label="Text size"
                  options={toOptions(TEXT_SIZES)}
                  value={look.textSize}
                  onValueChange={(textSize) => setLook({ ...look, textSize })}
                />
              </Labelled>
            </Card>
          </Section>

          <Section title="Colour tokens">
            <div className="grid grid-cols-[repeat(auto-fill,minmax(130px,1fr))] gap-3">
              {SWATCHES.map((s) => (
                <div key={s.name} className="space-y-1.5">
                  <div className={cn("h-12 rounded-[10px] border border-line", s.className)} />
                  <p className="text-fine text-muted">{s.name}</p>
                </div>
              ))}
            </div>
          </Section>

          <Section title="Type scale">
            <Card className="space-y-2">
              <p className="font-heading text-title font-semibold">Page title — heading font</p>
              <p className="font-heading text-kpi font-semibold">KPI value 1,284.00</p>
              <p className="font-heading text-section font-semibold">Section title</p>
              <p>Body text in the body font. Book a blow-dry for Tuesday at 11:00.</p>
              <p className="text-small text-muted">Small, muted: secondary information.</p>
              <p className="text-fine font-semibold tracking-[0.05em] text-muted uppercase">
                Table header
              </p>
            </Card>
          </Section>

          <Section title="Button">
            <Card className="space-y-4">
              {(["primary", "ghost", "danger", "success"] as const).map((variant) => (
                <div key={variant} className="flex flex-wrap items-center gap-3">
                  <span className="w-16 text-fine text-muted">{variant}</span>
                  <Button variant={variant}>Default</Button>
                  <Button variant={variant} size="sm">
                    Small
                  </Button>
                  <Button variant={variant} disabled>
                    Disabled
                  </Button>
                  <Button variant={variant} loading>
                    Loading
                  </Button>
                </div>
              ))}
              <div className="flex flex-wrap items-center gap-3">
                <span className="w-16 text-fine text-muted">link</span>
                <ButtonLink href="/dev/ui">ButtonLink</ButtonLink>
                <ButtonLink href="/dev/ui" variant="ghost" size="sm">
                  Ghost link
                </ButtonLink>
              </div>
            </Card>
          </Section>

          <Section title="Pill">
            <Card className="flex flex-wrap gap-3">
              {PILL_TONES.map((tone) => (
                <Pill key={tone} tone={tone}>
                  {tone}
                </Pill>
              ))}
            </Card>
          </Section>

          <Section title="Card">
            <div className="grid gap-4 sm:grid-cols-3">
              <Card padding="lg">
                <CardTitle>padding=&quot;lg&quot;</CardTitle>
                <p className="text-muted">16px radius, 28px padding: the sign-in card.</p>
              </Card>
              <Card>
                <CardTitle>With a title</CardTitle>
                <p className="text-muted">Default padding, 14px radius, hairline border.</p>
              </Card>
              <Card padding="none">
                <CardHeader
                  title="CardHeader"
                  description="For a card that holds a list or table."
                  action={<Pill tone="neutral">3 shown</Pill>}
                />
                <p className="p-5 text-muted">padding=&quot;none&quot;: the content brings its own.</p>
              </Card>
            </div>
          </Section>

          <Section title="StatTile">
            <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(190px,1fr))]">
              <StatTile label="Takings today" value="$1,284.00" hint="9 receipts issued" />
              <StatTile
                label="Loyalty balance"
                value="$12.40"
                tone="good"
                hint="▲ 3 pts"
                hintTone="good"
              />
              <StatTile
                label="No-shows"
                value="12"
                tone="critical"
                hint="▼ 2 pts"
                hintTone="critical"
              />
              <StatTile label="No hint" value="618" />
            </div>
          </Section>

          <Section title="SegmentedControl">
            <Card className="space-y-4">
              <Labelled label="Uncontrolled (arrow keys move the selection)">
                <SegmentedControl
                  aria-label="Range"
                  defaultValue="week"
                  options={[
                    { value: "today", label: "Today" },
                    { value: "week", label: "This week" },
                    { value: "month", label: "This month" },
                  ]}
                />
              </Labelled>
              <Labelled label="With a disabled option">
                <SegmentedControl
                  aria-label="Group by"
                  defaultValue="week"
                  options={[
                    { value: "day", label: "Day", disabled: true },
                    { value: "week", label: "Week" },
                    { value: "month", label: "Month" },
                  ]}
                />
              </Labelled>
              <Labelled label="Full width">
                <SegmentedControl
                  aria-label="Payment method"
                  fullWidth
                  defaultValue="card"
                  options={[
                    { value: "card", label: "Card" },
                    { value: "cash", label: "Cash" },
                    { value: "split", label: "Split" },
                  ]}
                />
              </Labelled>
            </Card>
          </Section>

          <Section title="Switch">
            <Card className="flex flex-wrap gap-8">
              <Switch label="Off" />
              <Switch label="On" defaultChecked />
              <Switch label="Disabled off" disabled />
              <Switch label="Disabled on" disabled defaultChecked />
              <Switch aria-label="No visible label" defaultChecked />
            </Card>
          </Section>

          <Section title="Table">
            <div className="space-y-4">
              <Table label="Example team pay">
                <TableHead>
                  <TableRow>
                    <TableHeader>Team member</TableHeader>
                    <TableHeader align="right">Services</TableHeader>
                    <TableHeader align="right">Revenue</TableHeader>
                    <TableHeader>Status</TableHeader>
                  </TableRow>
                </TableHead>
                <TableBody>
                  <TableRow>
                    <TableCell>Sample one</TableCell>
                    <TableCell align="right">64</TableCell>
                    <TableCell align="right">$3,720.00</TableCell>
                    <TableCell>
                      <Pill tone="good">Paid</Pill>
                    </TableCell>
                  </TableRow>
                  <TableRow selected>
                    <TableCell>Sample two (selected)</TableCell>
                    <TableCell align="right">48</TableCell>
                    <TableCell align="right">$2,410.00</TableCell>
                    <TableCell>
                      <Pill tone="warning">Draft</Pill>
                    </TableCell>
                  </TableRow>
                </TableBody>
                <TableFoot>
                  <TableRow>
                    <TableCell>Total</TableCell>
                    <TableCell align="right">112</TableCell>
                    <TableCell align="right">$6,130.00</TableCell>
                    <TableCell />
                  </TableRow>
                </TableFoot>
              </Table>

              <p className="text-small text-muted">
                Narrow container (it scrolls sideways, and takes focus to scroll by keyboard):
              </p>
              <div className="max-w-xs">
                <Table label="Narrow example" className="min-w-[520px]">
                  <TableHead>
                    <TableRow>
                      <TableHeader>Receipt</TableHeader>
                      <TableHeader>Customer</TableHeader>
                      <TableHeader>Method</TableHeader>
                      <TableHeader align="right">Total</TableHeader>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    <TableRow>
                      <TableCell>Sample</TableCell>
                      <TableCell>Sample customer</TableCell>
                      <TableCell>Card</TableCell>
                      <TableCell align="right">$58.00</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            </div>
          </Section>

          <Section title="SidePanel (wraps below on a narrow screen)">
            <Split>
              <SplitMain>
                <Card>
                  <CardTitle>Main content</CardTitle>
                  <p className="text-muted">
                    The main column grows; the panel keeps at least ~300px.
                  </p>
                </Card>
              </SplitMain>
              <SidePanel title="Edit service" actions={<Pill tone="accent">Consent</Pill>}>
                <TextField label="Name" defaultValue="Chemical peel" />
                <div className="flex gap-2">
                  <Button className="flex-1">Save changes</Button>
                  <Button variant="ghost">Duplicate</Button>
                </div>
              </SidePanel>
            </Split>
          </Section>

          <Section title="Skeleton">
            <SkeletonGroup>
              <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(190px,1fr))]">
                <Skeleton className="h-[74px]" />
                <Skeleton className="h-[74px]" />
                <Skeleton className="h-[74px]" />
              </div>
              <Skeleton className="h-40" />
            </SkeletonGroup>
          </Section>

          <Section title="EmptyState">
            <div className="grid gap-4 sm:grid-cols-2">
              <EmptyState>Nothing booked.</EmptyState>
              <EmptyState
                title="No customers match “Raza”"
                action={<Button size="sm">Add a new customer</Button>}
              >
                Check the spelling, or search by phone number.
              </EmptyState>
            </div>
          </Section>

          <Section title="PageHeader, PageTabs, SubTabs, TabPanel, TabFallback">
            {tabsDemo}
          </Section>

          <Section title="RouteTabs (links between separate pages)">
            <RouteTabs
              label="Demo pages"
              active="/dev/ui"
              tabs={[
                { href: "/dev/ui", label: "This page" },
                { href: "/login", label: "Sign in" },
              ]}
            />
          </Section>

          <Section title="ServiceTiles">
            <TilesDemo />
          </Section>

          <Section title="ChoiceGroup">
            <ChoiceDemo />
          </Section>

          <Section title="Spinner">
            <Card className="flex flex-wrap items-center gap-6">
              <Spinner />
              <Spinner size="lg" />
              <span role="status" className="text-muted">
                Signing you in…
              </span>
            </Card>
          </Section>

          <Section title="Combobox and LocaleFields">
            <Card className="space-y-4">
              <Field label="Combobox" htmlFor="dev-combo" hint="Type to filter; arrows and Enter choose.">
                <Combobox
                  id="dev-combo"
                  name="demo"
                  placeholder="Start typing…"
                  options={[
                    { value: "pk", label: "Pakistan", hint: "PKR" },
                    { value: "gb", label: "United Kingdom", hint: "GBP" },
                    { value: "ae", label: "United Arab Emirates", hint: "AED" },
                  ]}
                />
              </Field>
              <LocaleFields idPrefix="dev" />
            </Card>
          </Section>

          <Section title="Flash and Toast">
            <FlashAndToast />
          </Section>

          <Section title="Fields">
            <Card className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(220px,1fr))]">
              <TextField label="Default" placeholder="Placeholder" />
              <TextField label="With a hint" hint="The phone number identifies them." />
              <TextField label="Required" required defaultValue="Filled in" />
              <TextField label="With an error" error="Enter a valid email address." defaultValue="nope" />
              <TextField label="Disabled" disabled defaultValue="Read only value" />
              <SelectField label="Select" defaultValue="card">
                <option value="card">Card</option>
                <option value="cash">Cash</option>
                <option value="split">Split</option>
              </SelectField>
              <SelectField label="Select with an error" error="Choose a method.">
                <option value="">Choose…</option>
                <option value="card">Card</option>
              </SelectField>
              <TextareaField
                label="Textarea"
                hint="Allergies, preferences, anything the team should know"
                className="sm:col-span-2"
              />
              <Field label="Field around a bare control" htmlFor="dev-bare" hint="You wire the id.">
                <Input id="dev-bare" aria-describedby="dev-bare-hint" />
              </Field>
              <Field label="File input" htmlFor="dev-file" hint="PDF, JPG or PNG.">
                <FileInput id="dev-file" />
              </Field>
              <Field label="Bare select" htmlFor="dev-bare-select">
                <Select id="dev-bare-select">
                  <option>One</option>
                </Select>
              </Field>
              <Field label="Bare textarea" htmlFor="dev-bare-ta">
                <Textarea id="dev-bare-ta" />
              </Field>
            </Card>
          </Section>
        </main>
      </ToastProvider>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="font-heading text-section font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function Labelled({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <p className="text-small font-semibold">{label}</p>
      {children}
    </div>
  );
}

function FlashAndToast() {
  const toast = useToast();
  const [dismissed, setDismissed] = useState(false);

  return (
    <div className="space-y-3">
      {FLASH_TONES.map((tone) => (
        <Flash key={tone} tone={tone}>
          {tone === "success"
            ? "Settings saved. The change is recorded in the audit log."
            : tone === "error"
              ? "That email and password don't match. Try again."
              : tone === "warning"
                ? "That appointment has already been billed."
                : tone === "accent"
                  ? "14-day free trial · then $20/month"
                  : "Your free trial has 9 days left."}
        </Flash>
      ))}
      {dismissed ? (
        <Button size="sm" variant="ghost" onClick={() => setDismissed(false)}>
          Show the dismissible one again
        </Button>
      ) : (
        <Flash tone="info" onDismiss={() => setDismissed(true)}>
          Dismissible: has a close button.
        </Flash>
      )}
      <div className="flex flex-wrap gap-3">
        {FLASH_TONES.map((tone) => (
          <Button key={tone} variant="ghost" size="sm" onClick={() => toast.show(`A ${tone} toast`, tone)}>
            Toast: {tone}
          </Button>
        ))}
      </div>
      <form action={demoFlashAction} className="flex flex-wrap items-center gap-3">
        <span className="text-small text-muted">Server Action redirect + flash:</span>
        {FLASH_TONES.map((tone) => (
          <Button key={tone} type="submit" name="tone" value={tone} variant="ghost" size="sm">
            {tone}
          </Button>
        ))}
      </form>
    </div>
  );
}

const SAMPLE_SERVICES = [
  { id: "a", name: "Cut & style", category: "Hair", price: 45, duration_minutes: 60 },
  { id: "b", name: "Blow-dry", category: "Hair", price: 25, duration_minutes: 30 },
  { id: "c", name: "Hydrating facial", category: "Skin", price: 70, duration_minutes: 60 },
  { id: "d", name: "Gel manicure", category: "Nails", price: 35, duration_minutes: 45 },
];

function TilesDemo() {
  const [counts, setCounts] = useState<Record<string, number>>({ a: 1 });
  return (
    <Card>
      <ServiceTiles
        services={SAMPLE_SERVICES}
        currency="USD"
        counts={counts}
        onAdd={(id) => setCounts((c) => ({ ...c, [id]: (c[id] ?? 0) + 1 }))}
      />
    </Card>
  );
}

function ChoiceDemo() {
  const [picked, setPicked] = useState<"a" | "b" | "c">("b");
  return (
    <Card>
      <ChoiceGroup
        name="demo-choice"
        legend="Demo choice"
        value={picked}
        onValueChange={setPicked}
        options={[
          { value: "a", label: "First", description: "Plain" },
          { value: "b", label: "Second", description: "Selected to begin with" },
          { value: "c", label: "Third", description: "Arrow keys move between them" },
        ]}
      />
    </Card>
  );
}
