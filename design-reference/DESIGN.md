# Salon SaaS — Design reference

This folder is the visual target for the frontend redesign. Each `*.dc.html` file is the source of one clickable mockup artboard. They were built in a design tool and load a `support.js` runtime that is NOT included, so they will not run if opened directly. Read them as source: the `<style>` block inside `<helmet>` holds the exact CSS, the markup shows the layout, and the script at the bottom shows the tab logic and sample data.

Sample names, numbers and dates in the mockups are placeholders. Never copy them into the app.

## Files

| File | Covers |
| --- | --- |
| Main.dc.html | Original all-in-one prototype: dashboard shell, Overview page, role-filtered sidebar |
| Auth.dc.html | /login, /signup, /accept-invite, /auth/callback |
| Calendar.dc.html | /dashboard/calendar and /dashboard/calendar/[appointmentId] |
| Customers.dc.html | /dashboard/customers and /dashboard/customers/[customerId] |
| POS.dc.html | /dashboard/pos and /dashboard/pos/[receiptId] |
| Services.dc.html | /dashboard/services |
| Payroll.dc.html | /dashboard/payroll |
| Reports.dc.html | /dashboard/reports |
| Team.dc.html | /dashboard/team |
| Audit.dc.html | /dashboard/audit |
| Settings.dc.html | /dashboard/settings, including the new Appearance tab |
| Earnings.dc.html | /dashboard/earnings |
| Account.dc.html | /dashboard/account, including the new Billings tab (owner only) |

## Colour tokens (default scheme "plum")

| Token | Value | Use |
| --- | --- | --- |
| --bg | #F4F3F6 | Page background |
| --surface | #FFFFFF | Cards, tables, panels |
| --ink | #1C1724 | Main text |
| --muted | #6B6475 | Secondary text (4.5:1 on white) |
| --line | #E4E1E8 | Borders |
| --line-soft | #F0EEF2 | Row dividers |
| --side | #1C1724 | Sidebar background |
| --accent | #6B2C5C | Primary buttons, active tab, links |
| --accent-d | #4E1E43 | Hover, active nav text |
| --soft | #F3E8F0 | Active nav background, selected tints |
| good | #E3F0EB bg / #245647 text, strong #2F6F5E | Paid, active, completed |
| warning | #FBF0DC bg / #7A4710 text | Pending, confirmed, draft |
| critical | #FBE6E4 bg / #8E2A25 text, strong #A3312B | Failed, void, no-show, danger buttons |
| neutral | #EEECF1 bg / #4C4556 text | Inactive, cancelled |

### Appearance schemes (Settings › Appearance)

| Scheme | --side | --accent | --accent-d | --soft |
| --- | --- | --- | --- | --- |
| plum (default) | #1C1724 | #6B2C5C | #4E1E43 | #F3E8F0 |
| sage | #14231E | #2F6F5E | #1E4A3D | #E3F0EB |
| ocean | #0F1C26 | #1F5F8B | #154468 | #E1EEF7 |
| rose | #261219 | #A8335A | #7E2343 | #FBE7EE |
| terra | #24160F | #A4522D | #7A3B1F | #FBEDE5 |
| midnight | #13122A | #3D3A8C | #2B2967 | #E9E8F7 |

Status colours (good / warning / critical / neutral) do not change with the scheme.

## Typography

- Headings: Sora 600 (default). Options: Playfair Display, DM Serif Display, Poppins.
- Body: Figtree 400/500/600 (default). Options: Nunito Sans, Lato, Source Sans 3.
- Text size: Small 13px, Default 14px, Large 15.5px base.
- Page title 28px/600; section title 16px/600; KPI value 22–26px/600; table header 12px/600 uppercase, 0.05em tracking; labels 13px/600.

## Layout and components

- Shell: sidebar 252px (stacks above content under ~810px), top bar, content max-width ~1280–1320px, padding 26px 32px.
- Radius: cards and tables 14px; buttons and inputs 10px; pills fully round.
- Controls are at least 44px tall (small buttons 36px).
- Buttons: primary (accent fill), ghost (white, accent text), danger (white, red text).
- Pill: small rounded status label in the status colours above.
- StatTile (KPI): label 12px muted, value 22–26px.
- SegmentedControl: grey track, white selected segment; used for filters, ranges, payment method.
- Table: header row on #FAF9FB, rows divided by --line-soft, wrapped in a horizontally scrolling box on small screens. The mockups use CSS grid rows; a real `<table>` is fine.
- SidePanel: a right-hand card (min ~300px) beside the main content, used for previews and edit forms; wraps below on narrow screens.
- Skeleton: shimmering grey blocks shown while a tab loads.
- Flash: green success / red error banner at the top of the page content after an action.
- Switch: 40×22 toggle, green when on.

## Tabs

- Every page's sections are split into tabs under the page header. Tab bar: 46px tall buttons, active tab = accent text + 2px accent underline; optional count badge.
- Sub-tabs (e.g. Billings › Billing history / Payment methods / Discounts) use a lighter second row.
- Switching tabs never reloads the page; the active tab is kept in the URL (?tab=, ?sub=).
- A tab a role cannot use is not shown at all.

## How to build a tabbed page

A page is a header, an optional flash, a tab bar, and **one** tab panel: the active tab. Every other tab is simply not rendered, so it fetches nothing. The pilot is `src/app/(dashboard)/dashboard/account/`; copy its shape.

1. **Guard the page** with `requireSession()` / `requireModule()` / `requireOwner()` as before. The guard does not change.
2. **List every tab** in a `TabDefinition[]` (`@/lib/tabs`): `{ id, label, count?, visibleFor? }`. `visibleFor` is a predicate over the session; use `ownerOnly` or `holdsModule("payroll")`. Roles are custom in this product, so tabs are gated by module or owner, never by role name. Leave it out for "everyone who can open the page".
3. **Resolve on the server**: `const { tabs, active } = resolveTabs(session, TABS, params.tab)`. It drops tabs the visitor may not use and picks the active one (an unknown or hidden `?tab=` falls back to the first visible tab). Never decide visibility in the client.
4. **Render the shell**: `<PageHeader title subtitle actions breadcrumb />`, `<PageFlash />`, then `<PageTabs tabs active basePath label />`. For a second level add `<SubTabs ... param={{ tab: active }} />`, driven by `?sub=`; resolve it the same way.
5. **Render only the active tab**, inside `<TabPanel id={active}>` and a `<Suspense key={active} fallback={<TabFallback />}>`. The key makes the fallback show when the tab changes.
6. **Each tab is an async server component** in its own file (`profile-tab.tsx`) that does its own fetching and re-calls `requireSession()` (it is cached per request). A tab's data is read only when that tab is rendered, so compute a tab's `count` only if the visitor can see that tab.
7. **Tabs are links** (`?tab=`), with `scroll={false}` and `replace`: no reload, no scroll jump, and the tab survives a refresh. `replace` means Back leaves the page instead of stepping through every tab visited. Arrow keys, Home and End move between tabs.
8. **Parameters that belong to a tab** (a date range, a filter) stay in the URL beside `tab`. Pass any that should survive a switch in `params`; anything not passed is dropped, which is how `sub` resets.
9. **After an action**: if it ends in a redirect, `await redirectWithFlash(path, "success", "Saved.", { tab: "profile" })` (`@/lib/flash`) and the page's `<PageFlash />` shows it on that tab. If it returns state to a `useActionState` form, show `state.message` / `state.success` in a `<Flash>` inside the form. The flash travels in a one-minute cookie, not the URL, so no link can put words on someone's screen.
10. **Do not add a tab the mockup does not have**, and do not render a placeholder for one a role cannot use. If a mockup tab needs a backend that does not exist, it is in `docs/mockup-gaps.md`.

`/dev/ui` (development only) shows the tab bar, sub-tabs, panel, fallback and flash working together.
