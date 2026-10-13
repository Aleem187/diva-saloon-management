# Mockup gaps

Mockup elements in `design-reference/` that the app cannot fill today. Per `BUILD_BRIEF.md` › Frontend redesign: **no backend logic is invented for any of these.** Each is left out of the UI, or (only if the layout needs the slot) shown as a plainly disabled placeholder, until you approve it.

IDs are referenced from `docs/redesign-map.md`.

## Kinds

| Kind | Meaning |
| --- | --- |
| `no-data` | Nothing in the schema or session holds this. A new column, table, enum value or feature. |
| `no-query` | The data exists, but no query, RPC or loaded result serves it. Needs a new read — and sometimes new SQL. |
| `no-action` | A button or flow with no Server Action behind it. |

**DB change?** says whether closing the gap needs a migration. Only the **Appearance** and **Billing** phases may add one; every other `yes` is blocked until you approve it.

**Default** is what the redesign does until you decide: **omit** the element, or **disabled** placeholder. "Page data" means the element is built from rows the page already loads today, so it is not a gap.

Not in this list, because they need no backend: the Auth "Message preview" and "Invitation state" toggles, the Account "Preview as" role switcher, the simulated 380 ms loading delay, and everything marked presentational in the map (segmented filters over loaded rows, "Now" line, example text, etc.).

---

## Shell and Overview

| ID | Mockup element | Kind | What exists today | DB change? | Default |
| --- | --- | --- | --- | --- | --- |
| G-OVW-1 | Today KPIs: Appointments today, Still to arrive, Takings today / Receipts issued, New customers this week | no-query | `appointments`, `receipts`, `customers` tables exist (the Calendar and POS pages query them). The Overview queries none of them. | no | omit |
| G-OVW-2 | "Up next" list of today's appointments | no-query | As above; the Calendar page already reads the same rows. | no | omit |
| G-OVW-3 | "4 on shift now" | no-data | No shifts, rosters or clock-in. | yes | omit |
| G-OVW-4 | "Your access" list with levels (Full / Own / View / Limited) | no-data | `role_modules` is binary: a module is held or it is not. Own-work access is implicit in policies, not stored. See also G-TEAM-6. | yes | show Held / Not held only |
| G-OVW-5 | "Opening today 10:00 – 20:00" in the Your salon card | no-query | `salon_settings.business_hours` exists. The Overview does not read it. | no | omit |

## Auth and Settings

| ID | Mockup element | Kind | What exists today | DB change? | Default |
| --- | --- | --- | --- | --- | --- |
| G-AUTH-1 | Business types Spa, Barber, Nail studio (Signup and Settings › Business) | no-data | `business_type` enum has `salon` and `aesthetic_clinic` only; the sidebar and receipts label them from that. | yes | offer the two existing types |
| G-SET-1 | Logo upload / remove | no-data | No logo column or storage bucket on `salons`. The sidebar uses the first letter of the name. | yes | omit; keep the initial |
| G-SET-3 | Salon address / city on the receipt header and its Settings preview ("12 Mall Road, Lahore") | no-data | `salons` has name, country, timezone, currency. No address. The receipt prints country and timezone. | yes | keep what the receipt prints today |
| G-SET-4 | "Last saved 10 Oct, 09:15 by Ayesha" | no-query | `salon_settings.updated_at` exists. Who saved lives only in `audit_logs`, readable with the audit module. | no | omit |
| G-SET-5 | Loyalty **On / Off** switch | no-data | Only `loyalty_earn_rate`. An earn rate of 0 behaves as off, but switching back would lose the previous rate. | yes | the earn-rate field only |
| G-SET-6 | Loyalty panel: "Outstanding credit today", "Est. cost per month" | no-query / no-data | Outstanding is `report_loyalty_cost`, which needs the reports module, not settings. The estimate is invented. | no | omit |
| G-SET-7 | Opening hours › **Closed days** (holidays, one-off closures that block booking) | no-data | `business_hours` is a weekly pattern. No table of dates, and nothing blocks booking on a date. | yes | omit |
| G-SET-8 | **Appearance** tab: six colour schemes, four heading fonts, four body fonts, three text sizes, "applies to everyone in your salon" | no-data | **Built in Phase 4** (migration `20260924000038_salon_appearance.sql`, four columns on `salons`). The mockup's per-tab "unsaved" dot is not built. | **Appearance phase** | done |

## Calendar and appointment

| ID | Mockup element | Kind | What exists today | DB change? | Default |
| --- | --- | --- | --- | --- | --- |
| G-CAL-1 | "Checked in" status, **Check in** button, legend entry, KPIs "Checked in now" / "Still to arrive" | no-data + no-action | `appointment_status` is `booked`, `confirmed`, `completed`, `cancelled`, `no_show`. The existing actions are **Confirm** and **Complete**. Check in is not Confirm. | yes | keep Confirm / Complete; omit the rest |
| G-CAL-2 | Appointment reference "#AP-2105" | no-data | Appointments are identified by uuid only. | yes | omit |
| G-CAL-3 | "Status history" timeline: Booked, Reminder sent, Check in | no-data / no-query | Booked (`created_at`/`created_by`), completed, and cancelled / no-show (`resolved_at`, `resolved_by`, `resolution_reason`) can be shown from the appointment row, which the page loads. Reminders and check-in do not exist. A full history is only in `audit_logs`. | no | show the rows we have; omit reminder and check-in |
| G-CAL-4 | Automatic SMS reminders ("Reminder sent"; Audit "Reminders sent"; "agrees to SMS reminders") | no-data + no-action | No messaging at all (BUILD_BRIEF lists SMS as a stretch goal). | yes | omit |
| G-CAL-5 | "Available times" slot buttons with taken slots disabled | no-query | Booking takes a date and a start time. Conflicts are refused by the exclusion constraint at write time, and must stay that way (CLAUDE.md rule 3). No read serves free slots. | no (read only) | keep date + time inputs |
| G-CAL-6 | Discount entered as `$0.00 or %` | no-data | Booking stores a discount amount. A percentage would be converted to an amount, which is money maths (CLAUDE.md rule 4). | no | amount only |
| G-CAL-7 | Count badge on the Day tab ("13") | no-query | The diary loads appointments only for the tab being shown. A badge on every tab render needs its own count query. | no | omit |
| G-CAL-8 | Customer phone in the selected-appointment panel, and real customer names in a therapist's diary | no-query | The page loads customers for the front desk only, so a therapist's list shows "Customer". The panel itself was not built (see the map). | no | name only, as today |

## Customers

| ID | Mockup element | Kind | What exists today | DB change? | Default |
| --- | --- | --- | --- | --- | --- |
| G-CUS-1 | Directory KPIs: Total customers, New this month, Visited in last 60 days, Loyalty credit held | no-query | Rows exist. Nothing counts them. Credit held is `report_loyalty_cost`, which needs the reports module. | no | omit |
| G-CUS-2 | Directory columns Last visit, Visits, Loyalty | no-query | The list reads `customers` only. Per-customer aggregates would need a bulk function; one `customer_loyalty_balance` call per row is not acceptable. | yes (if a function) | name, phone, added date |
| G-CUS-3 | Directory filters "Booked ahead" and "Lapsed" | no-query / no-data | "Recent" is the current order. "Lapsed" has no definition. | no | omit; keep search |
| G-CUS-4 | Customer tags (Regular, Sensitive scalp, Colour client, New, Lapsed) | no-data | No tags. | yes | omit |
| G-CUS-5 | Directory preview panel: Last visit, Next booking, Visits, Loyalty, Consent on file | no-query | Same as G-CUS-2. | no | omit the panel; open the profile instead |
| G-CUS-6 | **Start sale** / **Book** with the customer pre-selected | no-action | The till only accepts `?appointment=`. The booking form has no customer parameter. | no | omit the buttons: a plain link would start a sale for nobody in particular |
| G-CUS-7 | "Agrees to SMS reminders" on Add customer | no-data | See G-CAL-4. | yes | omit |
| G-CUS-8 | **Save & book appointment** | no-action | `saveCustomerAction` saves. It does not continue into booking. | no | omit; plain Save |
| G-CUS-9 | Profile stats: Lifetime spend; Receipts count badge | no-query | The profile loads the 20 most recent receipts, so a sum or count of them would be wrong. | no | omit |
| G-CUS-10 | Loyalty tab KPIs: Earned (all time), Redeemed, Earn rate | no-query | The ledger is capped at 20 entries. The balance is `customer_loyalty_balance`. | no | balance only |
| G-CUS-11 | Tab count badges (Receipts, Visits, Consent records) and the "Visits" stat in the profile hero | no-query | Each tab loads only its own data, and receipts and ledger are capped at 20, so a count needs its own query on every tab render. | no | omit |
| G-CUS-12 | "Favourite services" meter | no-query | `appointment_services` has the data. No query. | no | omit |
| G-CUS-13 | Consent record version ("Template v3") | no-data | `consent_templates` is edited in place. A signed form keeps its own copy of the statements, but no version number. | yes | omit the label |
| G-CUS-14 | Consent answers other than a tick (Yes / No, free text: "Pregnant? No", "Current medications: None") | no-data | `consent_template_items` is a label and a required flag. `consent_form_responses.checked` is a boolean. Only Medical history and Allergies are free text. Sensitive data: any change goes through `can_access_consent_form()`. | yes | tick-boxes plus the two free-text fields |

## Point of sale and receipts

| ID | Mockup element | Kind | What exists today | DB change? | Default |
| --- | --- | --- | --- | --- | --- |
| G-POS-1 | "Till open since 09:52" | no-data | No till sessions. | yes | omit |
| G-POS-2 | "Today's takings" pill in the top bar on every POS tab | no-query | The Receipts tab totals the range you chose. The Till tab loads receipts for the same range (default today) but does not use them. | no | show the Receipts-tab KPI only |
| G-POS-3 | Walk-in sale with no customer ("Walk-in customer", "No loyalty account") | no-data | `receipts.customer_id` is required and checkout needs a customer. | yes | require a customer, as today |
| G-POS-4 | Cash received quick amounts and **Change due** | no-data / no-action | The amount tendered is not stored. Computing change in the browser is money maths (CLAUDE.md rule 4). | yes (if stored) | omit |
| G-POS-5 | Receipts list "Items" column | no-query | `receipt_line_items` is not loaded for the list. | no | omit the column |
| G-POS-6 | **Email receipt** | no-action | Print only. Email / SMS / WhatsApp sending is a stretch goal in BUILD_BRIEF. | no | omit |
| G-POS-10 | Receipt "Related appointment" with date, time and staff | no-query | The receipt page links to the appointment but does not load it. | no | keep the link |
| G-POS-11 | "Card / cash" KPI on the Receipts tab; the customer's visit count in the sale panel | no-query | Each receipt stores its cash, card and transfer amounts, but adding them up in TypeScript is money maths (CLAUDE.md rule 4) and would ignore transfers. A visit count needs a query per customer. | yes (a report function) | omit |

## Services and consent templates

| ID | Mockup element | Kind | What exists today | DB change? | Default |
| --- | --- | --- | --- | --- | --- |
| G-SVC-1 | "Sold this month" in the service edit panel | no-query | `report_revenue_by_service` needs the reports module. The Services page does not call it. | no | omit |
| G-SVC-2 | **Duplicate** a service | no-action | No action. | no | omit |
| G-SVC-3 | **Preview as customer** on a consent template | no-action | No preview. | no | omit |
| G-SVC-4 | Template versions ("Save as new version", v1 / v2 / v3) | no-data | Same as G-CUS-13. Today's save edits in place; signed forms keep their copy. | yes | keep "Save"; the "signed records keep their wording" note is true today |
| G-SVC-5 | Statement answer types (Must agree / Yes-No / Free text) | no-data | Same as G-CUS-14. | yes | tick-box statements |
| G-SVC-6 | Deal "Used N times" | no-query | `receipts.deal_id` exists. No count. | no | omit |
| G-SVC-7 | **Run again** for an ended or archived deal | no-action | A deal can be archived; there is no restore. Editing the dates is possible. | no | omit |
| G-SVC-8 | Tab count badges (Services 9, Consent templates 3, Deals 3) and the "Average price" tile | no-query | A count on every tab would need a query per tab. An average of catalogue prices is arithmetic on money in TypeScript (CLAUDE.md rule 4). | no | omit |

## Payroll and My earnings

| ID | Mockup element | Kind | What exists today | DB change? | Default |
| --- | --- | --- | --- | --- | --- |
| G-PAY-1 | Export CSV (Payroll, Reports, Audit) | no-action | No export anywhere. | no | omit |
| G-PAY-2 | Download / view payslip (PDF) — Payroll and My earnings | no-action | No payslip document. The earnings page shows the period row. | no | omit |
| G-PAY-3 | Generate: live preview of the total and per-person amounts before generating | no-query | `generate_payroll_period` creates a draft. There is no dry run. | yes (new function) | omit; the draft is the preview |
| G-PAY-4 | Generate: choose who to include | no-action | The function takes dates and notes. Everyone payable is included. | yes | omit |
| G-PAY-5 | Generate: "Generating again replaces the draft" | no-action | Periods cannot overlap; to redo one, Discard the draft first. Keep this: it is what stops double payment. | n/a | keep today's rule |
| G-PAY-6 | Breakdown panel: services performed × count with revenue per service | no-query | `payroll_entries` has totals only. A per-service split needs `receipt_line_items` grouped by person and period. | no | omit |
| G-PAY-7 | Pay-settings example sentence ("in a month with $4,000 of revenue…") | no-data | A client-side money calculation (CLAUDE.md rule 4). | no | omit |
| G-ERN-1 | "October so far (estimate)" running estimate | no-data | No live estimate; payroll is computed server-side when a period is generated. | no | omit |
| G-ERN-3 | Recent services: Customer name and "Your commission" per line | no-data | A therapist cannot read the receipt header (by policy), and `receipt_line_items` holds no per-line commission. | yes | date, service, revenue (the line total) |
| G-ERN-4 | "Services this month" excluding voided sales | no-data | A therapist cannot read the receipt header, and `receipt_line_items` carries no voided flag, so the count (sum of line quantities, the unit payroll uses) includes sales that are later voided until payroll runs. Shown with that note. | yes | count as built, with the note |

## Reports

| ID | Mockup element | Kind | What exists today | DB change? | Default |
| --- | --- | --- | --- | --- | --- |
| G-REP-1 | KPI deltas vs the previous period (▲ 8.4 %) | no-query | The same RPCs could be called for the prior range. No such call is made. | no | omit |
| G-REP-2 | "How customers paid" (card / cash / split mix) | no-query | No report function over payment method. | yes (new function) | omit |
| G-REP-3 | "Manual discounts" line in Discounts given | no-data | The till has deals and loyalty only. Deals and loyalty redeemed are in the revenue buckets. | yes | Deals and Loyalty only |
| G-REP-4 | Loyalty "Highest balances" | no-query | No report function. | yes (new function) | omit |
| G-REP-5 | Retention: "Back within 60 days" and the cohort grid | no-query | `report_customer_retention` returns new / returning / repeat rate / visits per customer. | yes (new function) | the four existing figures |
| G-REP-6 | Peak times by **Revenue**; the written insight under the heat map | no-query / no-data | `report_peak_times` counts appointments only. | yes | Bookings only; omit the sentence |

## Team and access

| ID | Mockup element | Kind | What exists today | DB change? | Default |
| --- | --- | --- | --- | --- | --- |
| G-TEAM-1 | Roster phone number | no-data | `team_members` has name, specialty, active flag. A phone exists only on a login (`profiles.phone`). | yes | omit |
| G-TEAM-2 | Roster "Pay" summary ($900/mo + 15 %) | no-query | `staff_compensation` is readable by payroll holders and the owner; the Team page does not load it. | no | omit |
| G-TEAM-4 | Upload an ID document while adding a roster entry | no-action | The document is attached after the entry exists. | no | keep the two steps |
| G-TEAM-5 | Invitations: "Expired" rows and **Resend** | no-query / no-action | The page lists `pending` only. Revoke exists; resend does not (revoke and invite again). | no | pending + Revoke only |
| G-TEAM-6 | Permission levels per module (None / Own / View / Full) | no-data | `role_modules` is binary. | yes | a tick per module, as today |
| G-TEAM-7 | "Consent records" as its own permission | no-data | Consent access follows the customers module and `can_access_consent_form()` (CLAUDE.md rule 2). Widen it there only. | yes | not shown |
| G-TEAM-8 | "Void receipts" as a per-role setting | no-data | Voiding is owner-only in the action and the function. | yes | not shown; owner-only stays |
| G-TEAM-9 | Linked accounts / My account "Last sign-in" | no-data | Only Auth holds it, and `@/lib/supabase/admin` is reserved for the Auth admin API. | no | omit |
| G-TEAM-10 | Tab count badges (Roster 7, Invitations 2) | no-query | Each tab loads only its own data, so a count on every tab needs its own query on every render. | no | omit |

## Audit log

| ID | Mockup element | Kind | What exists today | DB change? | Default |
| --- | --- | --- | --- | --- | --- |
| G-AUD-1 | Free-text search over summaries | no-query | Filters are action, actor, from, to. | no | keep the four filters |
| G-AUD-2 | "Signed in" and "Reminders sent" entries; actor "System" for automation | no-data | Sign-in is not audited. No automation. Entries with no actor already show as "system". | yes | omit |
| G-AUD-3 | Before / after "Change" panel | no-data | `metadata` varies by action. Role change records the new role only. | yes | show metadata as it is, laid out neatly |
| G-AUD-4 | Per-person action totals, last action, sensitive counts, and category-chip counts over the full range | no-query | The page reads the newest 50 entries and has no pagination. Counts over 50 rows would be wrong. | no | omit counts, or label "in the 50 shown" |
| G-AUD-6 | Export CSV | no-action | See G-PAY-1. | no | omit |

## My account › Billings

**Phase 5a built the flat-plan billing in BUILD_BRIEF §J**: plan and status, Start subscription (Stripe Checkout), Manage billing (Stripe's portal), billing history from the `invoices` mirror, and access gating. See `docs/billing.md`. The rest of the mockup is a larger billing product than §J asks for and stays unbuilt.

| ID | Mockup element | Kind | Status |
| --- | --- | --- | --- |
| G-BILL-1 | Plan card: "$20 / month", next charge date and source | no-data | **Built** (plan, status, trial end, next charge, card label) |
| G-BILL-2 | Billing history: status, method, amount, discount, **Pay now**, **Invoice** | no-data | **Built** (Phase 5b), with the All / Paid / Open / Failed filter |
| G-BILL-3 | Payment methods: cards, make default, remove, **Add card** | no-data | **Built** (Phase 5b). Add card is Stripe's Payment Element via a SetupIntent: no card fields of ours, by design |
| G-BILL-4 | Account balance and **Add balance** (prepaid top-up) | no-data | Balance shown **read-only** from Stripe's customer credit (Phase 5b). No top-up, as requested |
| G-BILL-5 | Discounts: discount cards and the **promo code** box | no-data | **Built** (Phase 5c): cards from Stripe (customer and subscription), promo-code action, discount % in history. The mockup's 100 % **Solo salon** card was confirmed **not a pricing rule** and is not built |
| G-BILL-6 | Subscription status gating | no-action | **Built** (layout gate; owner redirect, staff screen) |
