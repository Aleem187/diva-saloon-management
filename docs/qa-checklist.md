# QA checklist (redesign sign-off)

Walk this with three real sign-ins in one salon: **Owner**, **Front desk**, **Therapist**. Open each route at desktop width and at 390 px. Tick what you checked.

Access is module-based (`requireModule`). "Front desk" and "Therapist" below mean the stock roles; if you have edited a role under Team › Roles & permissions, the tabs follow the modules it holds. A tab a person may not use must be **absent** (not greyed out), and typing its `?tab=` by hand must land on the first allowed tab, never on a blank page or an error.

Legend: ✅ visible and usable, 🚫 hidden or refused, 👁 read-only.

## 0. Before you start

- [ ] Migrations `20260924000038`, `...39`, `...40` applied; `npm run db:types` run; `npm run test:rls`, `test:cascade`, `test:signup`, `test:time`, `test:money`, `test:reports` pass.
- [ ] With the app running (`npm run start`): `npm run test:audit` and `npm run test:forms` pass. Both were retargeted to tab URLs without being run against a live database, so a failure may be a stale selector rather than a bug.
- [ ] Three accounts exist and a second salon exists (for the isolation checks in section 7).

## 1. Every page, every role

For each row: open the route, switch every tab with the mouse **and** the keyboard (Tab to the tab list, arrow keys, Home / End), confirm the URL gets `?tab=` without scrolling to the top, reload on a non-default tab, and press Back (the tab must not add history entries).

| Route | Tab (`?tab=`) | Owner | Front desk | Therapist | Notes |
|---|---|---|---|---|---|
| `/login`, `/signup`, `/accept-invite`, `/auth/callback?error_description=x` | none | ✅ | ✅ | ✅ | Signed-out pages. Error from the callback shows as a banner on `/login`. |
| `/dashboard` | Today | ✅ | ✅ | ✅ | |
| | Trial & plan | ✅ | 🚫 | 🚫 | Owner only. |
| | Your access | ✅ | ✅ | ✅ | Lists the modules this person holds. |
| | Build status | ✅ | 🚫 | 🚫 | Owner only. Phases 9–11 done, 12 (Payroll, My earnings, Reports, Audit redesign) planned. |
| `/dashboard/calendar` | Day (`?view=day` still works) | ✅ | ✅ | ✅ own only | Therapist sees only their own appointments. |
| | Week | ✅ | ✅ | ✅ own only | |
| | Agenda | ✅ | ✅ | ✅ own only | |
| | New booking | ✅ | ✅ | 🚫 | Booking a taken slot is refused by the database, not by the page. |
| `/dashboard/calendar/[id]` | Summary | ✅ | ✅ | ✅ own only | Another therapist's appointment id returns not-found. |
| | Services & price | ✅ | ✅ | 👁 | |
| | Payments | ✅ | ✅ | 🚫 | |
| | Actions | ✅ | ✅ | 🚫 | Confirm, complete, cancel (reason), no-show (reason), reschedule. Completing must not require payment. |
| `/dashboard/customers` | Directory | ✅ | ✅ | ✅ | Search by name and phone. |
| | Add | ✅ | ✅ | 🚫 | |
| `/dashboard/customers/[id]` | Profile | ✅ | ✅ | ✅ | |
| | Loyalty | ✅ | ✅ | 🚫 | Balance matches the POS till. |
| | Receipts | ✅ | ✅ | 🚫 | |
| | Visits | ✅ | ✅ | 👁 | |
| | Consent records | ✅ | ✅ | ✅ own bookings only | Signature opens through `can_access_consent_form()`; opening one writes `consent_form.viewed`. |
| | New consent | ✅ | ✅ | ✅ | Needs a template; signature pad works by mouse and touch. |
| `/dashboard/pos` | Till | ✅ | ✅ | 🚫 (page refused) | See section 3. |
| | Receipts | ✅ | ✅ | 🚫 | `?from=&to=&status=` alone opens this tab. |
| `/dashboard/pos/[id]` | Receipt | ✅ | ✅ | 🚫 | Print preview is black on white in every scheme. |
| | Payment history | ✅ | ✅ | 🚫 | |
| | Void | ✅ | 🚫 | 🚫 | Owner only, and only while the receipt is issued. |
| `/dashboard/services` | Services | ✅ | 👁 or 🚫 per role | 🚫 | Follows the `services` module. |
| | Add service | ✅ | 🚫 | 🚫 | |
| | Consent templates | ✅ | 🚫 | 🚫 | |
| | Deals | ✅ | 🚫 | 🚫 | |
| `/dashboard/team` | Roster | ✅ | 🚫 | 🚫 | Whole page needs the `team` module. |
| | Invitations | ✅ | 🚫 | 🚫 | Invite, revoke. |
| | Roles & permissions | ✅ | 🚫 | 🚫 | Create, edit, delete a role; the Owner role cannot be removed. |
| | Linked accounts | ✅ | 🚫 | 🚫 | Link / unlink a login. ID document upload is owner only. |
| `/dashboard/settings` | Business | ✅ | 🚫 | 🚫 | One form: save on any tab saves all of them. |
| | Region | ✅ | 🚫 | 🚫 | |
| | Loyalty | ✅ | 🚫 | 🚫 | Earn rate persists; the till uses the new rate. |
| | Opening hours | ✅ | 🚫 | 🚫 | |
| | Appearance | ✅ | 🚫 | 🚫 | Only appears once migration 38 is applied. See section 5. |
| `/dashboard/account` | Profile | ✅ | ✅ | ✅ | |
| | Access | ✅ | ✅ | ✅ | |
| | Billings | ✅ | 🚫 | 🚫 | Sub-tabs `?sub=history`, `methods`, `discounts`. See section 6. |
| `/dashboard/payroll` | (legacy UI, no tabs) | ✅ | 🚫 | 🚫 | **Not redesigned.** Check behaviour only. Paid periods cannot be edited. |
| `/dashboard/earnings` | (legacy UI) | per module | 🚫 | ✅ own only | **Not redesigned.** A therapist sees only their own commission. |
| `/dashboard/reports` | (legacy UI) | ✅ | 🚫 | 🚫 | **Not redesigned.** Owner only; buckets by the salon's timezone. |
| `/dashboard/audit` | (legacy UI) | ✅ | 🚫 | 🚫 | **Not redesigned.** Read-only; new billing and appearance actions have labels. |
| `/dev/ui` | none | 404 in production | 404 | 404 | `npm run build && npm run start`, then open `/dev/ui`. |

Also, for every page:
- [ ] A role that lacks the module is redirected or shown not-found, never a half-rendered page.
- [ ] A flash message (saved, error) appears once and is gone after a reload.
- [ ] Each tab shows a skeleton while loading, then content; switching tabs fast does not show stale content.
- [ ] No page scrolls sideways at 390 px. Wide tables scroll inside their own container.
- [ ] Every icon-only button has a tooltip or label read by a screen reader (automated check found none missing).

## 1a. Password reset (signed out)

- [ ] `/login`: "Forgot password?" sits at the right of the Password label, and tabbing and sign-in still work.
- [ ] `/forgot-password`: a real and an unknown email show the same "Check your email" message; a malformed email shows a field error.
- [ ] The emailed link opens `/auth/callback`, then `/reset-password` with "Signed in as …". Set a new password, land on the dashboard, sign out, sign in with the new one.
- [ ] Reusing the link, or opening `/reset-password` signed out, shows "This reset link is no longer valid".
- [ ] Supabase Auth › URL configuration lists `<site>/auth/callback` as an allowed redirect URL.

## 2. Role-specific spot checks

**Owner**
- [ ] All sidebar items present; trial / plan card in the sidebar footer matches Settings › Billings.
- [ ] Can void a receipt, mark payroll paid, invite staff, edit roles, change Appearance.

**Front desk**
- [ ] Sidebar shows only Overview, Calendar, Customers, POS (plus anything the role was given).
- [ ] Cannot reach `/dashboard/payroll`, `/reports`, `/audit`, `/team`, `/settings` by URL.
- [ ] Cannot see commission figures anywhere.
- [ ] Cannot void: the Void tab is absent, and a forged form post is refused.

**Therapist**
- [ ] Calendar shows only their own appointments; another therapist's appointment URL is not-found.
- [ ] Consent records only for customers they are booked with.
- [ ] My earnings shows their own totals and nothing else; no access to POS.

## 3. POS test sales

The brief refers to "Phase 3 step 9"; the POS was step 5 and no step 9 exists. These are the equivalent sales. Use test data only.

For each sale, afterwards check **Receipts**, the **customer's Loyalty tab**, the **receipt page** and **Payroll** (Owner).

1. [ ] **Plain cash sale**: customer, therapist, one service, cash. Total, loyalty earned (rate from Settings › Loyalty), line items and receipt page agree.
2. [ ] **Card sale** and **bank transfer sale** (if enabled): payment method shown correctly on the receipt.
3. [ ] **Split payment**: cash + card. They must add up to the total or the sale is refused (`cash + card + deposit = total`).
4. [ ] **Multiple services, two therapists**: each line is attributed to its own therapist.
5. [ ] **Deal applied**: price drops by the deal; ended or archived deals are not offered.
6. [ ] **Loyalty redeem**: redeem part of the balance, then try more than the balance and more than the bill; both refused. Points earned on this sale are not usable on this sale.
7. [ ] **Deposit**: open the till from an appointment (`?appointment=`) that already has a payment; the balance is collected, `deposit_applied` shown, and the receipt still adds up.
8. [ ] **Over-deposit**: appointment paid more than the services total; deposit is capped at the total and the excess stays a negative balance on the appointment.
9. [ ] **Commission follows the receipt**: give a discount at the till; Payroll commission falls with it.
10. [ ] **Void (Owner)**: reason required; receipt stays, marked voided; loyalty earned is reversed; Front desk cannot void.
11. [ ] **Refund / record payment** on an appointment from Calendar › Payments; Payment history on the receipt shows both.
12. [ ] **Print** the receipt: black on white in all six schemes, no sidebar or buttons, readable at A4 and 80 mm.
13. [ ] **Two tills at once**: two browsers book the same slot; exactly one succeeds.

## 4. Accessibility spot checks

Automated checks already pass (every tab has `role=tab`, `aria-selected`, roving tabindex and arrow / Home / End keys; no unnamed controls on the pages reachable signed out; text contrast ≥ 4.5:1 in all six schemes; no sideways scroll at 390 px on signed-out pages and `/dev/ui`). Check by hand:

- [ ] Tab through every signed-in page: focus ring always visible, order follows the layout, no focus traps. Side panels close with Escape and return focus.
- [ ] A screen reader announces tab names, selected state and the panel they control.
- [ ] Text size Large and Small do not break layouts.
- [ ] Form errors are announced and sit next to the field.

## 5. Appearance (Owner)

For each of the six schemes, three heading fonts, body fonts and three text sizes:
- [ ] Saves, and **another user** (Front desk) sees it after a reload without signing out.
- [ ] Sidebar, buttons, pills and tables remain readable; nothing hard-coded keeps the old colour.
- [ ] Printed receipt unchanged (black on white).
- [ ] A Front desk user cannot see the tab or save it with a forged form.

## 6. Stripe (test mode)

Set up with `docs/billing.md` › Setup (`npm run stripe:setup`, `npm run stripe:listen`). The scenarios are the checklists in `docs/billing.md`; run them in order:

- [ ] **A–H**: before subscribing, success `4242…`, declined `4000 0000 0000 0002`, the gate, 3-D Secure `4000 0025 0000 3155`, cancel and change, the webhook itself (bad signature rejected, replay is harmless), isolation between salons.
- [ ] **Billings tab** (5b, "Additional checklist (owner)"): plan card, balance card (read-only), history filters All / Paid / Open / Failed, Pay now, invoice link, add card through the Payment Element (including the 3-D Secure return), make default, remove, audit entries for default-card change and removal.
- [ ] **Discounts** (5c checklist): customer and subscription discounts listed, valid promo code applies, invalid code shows a plain error, a `billing.promo_code_applied` audit entry is written. There is no 100 % "Solo salon" discount (dropped by decision).
- [ ] **The gate**: an inactive subscription sends the Owner to `/dashboard/account?tab=billing&reason=inactive` and shows staff the "subscription inactive" screen; the Billings page itself stays reachable.
- [ ] With Stripe not configured (no keys), the app behaves as before: no gate, Billings explains that billing is not set up.

## 7. Isolation

- [ ] Sign in to salon B and open a salon A customer, receipt, appointment, consent form and billing id by URL: all not-found.
- [ ] `npm run test:rls` and `npm run test:cascade` pass, including after a salon delete.

## 8. Known gaps

Features in the mockups with no backend are listed in `docs/mockup-gaps.md`. They are deliberately absent, not bugs.
