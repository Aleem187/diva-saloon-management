# Performance audit

What was measured by reading, not by timing: there is no database here to profile against. Apply the migration and check `explain analyze` on the customer search if you want numbers.

## Done
- **Request path** (`getSessionContext`, runs on every dashboard request): the salon, team-login marker, role and role modules are read together instead of one after another. Two fewer database round trips per click.
- **POS › Receipts**: reads only the columns the list shows, and the names of the customers on those receipts (in groups of 80), instead of the first 500 customers in full. Also fixes a receipt showing "Customer" when its customer sorted outside the first 500.
- **POS till**: the menu (`ServiceTiles`) is memoised and given stable props, so typing a discount, reason or loyalty amount no longer redraws every tile.
- **Indexes** (`20261014000043_search_indexes.sql`): trigram indexes for the customer directory and picker, which search with `ilike '%text%'`.
- **Payroll** and **My earnings** already fetch only the selected period / the person's own rows; the earnings count pages through results instead of silently stopping at 1,000.

## Checked and fine
- Every RLS helper (`current_salon_id`, `current_app_role`, `current_team_member_id`, `has_module`, `is_owner`, `can_access_consent_form`) is `STABLE`; `salon_id = current_salon_id()` is therefore evaluated once per scan and uses the salon indexes.
- Existing indexes already cover salon + date / status / actor / action on receipts, line items, appointments, payments, payroll, audit_logs, loyalty and invoices.
- No query runs inside a loop. Every tab streams behind its own Suspense boundary and only the active tab fetches.

## Not done, and why
- **Two `getUser()` calls per request** (the proxy and `getSessionContext`) each ask the auth server. `getClaims()` would verify the token locally, but it would no longer notice a session revoked elsewhere until the token expires (up to an hour). That is a security trade-off, so it is left for you to decide.
- **Reports** still make seven RPC calls on every load; the Reports redesign (planned) splits them per tab.
- **`select("*")`** remains on small, bounded lists. Narrowing columns where components are typed on the full row risks `undefined` at runtime for little gain.

## Second pass
- **Browser bundle**: the consent form (a client component) imported one constant from `@/lib/validation`, which pulled the whole of Zod into the browser: ~96 KB gzipped, on the customer profile. The attachment rules now live in `lib/attachments.ts` (no imports); `validation.ts` re-exports them so server code is unchanged. Total client JS: 430 KB to 335 KB gzipped (1.6 MB to 1.2 MB raw). What remains is route-local: the Supabase browser client (68 KB gz) loads only on `/auth/callback`, Stripe's wrapper (8 KB gz, plus stripe.js from Stripe's CDN) only on `/dashboard/account`, and React and Next are shared.
- **Customer profile**: the customer and their loyalty balance are read together instead of one after the other.
- **N+1**: none. No query runs in a loop; the one `Promise.all(map)` (Receipts customer names) is 80 ids per request, in parallel, by design.
- **Effects and re-renders**: 14 effects in the whole app, all small and necessary (debounced customer search with stale-reply discard, the till's balance fetch, the appearance preview that restores itself, dismissing flash messages). The till was the only hot spot and is already memoised.
- **Caching (not added)**: pages are server components behind row-level security, so there is no client fetch layer for TanStack Query to cache. Caching tenant rows in a shared server cache is the thing most likely to leak one salon's data to another, and the per-request `cache()` already de-duplicates the session, salon and role reads. Static lists (categories, settings) are one small indexed query on a page that already makes others. Not worth the isolation risk.
- **Lazy loading (not added)**: nothing is heavy enough, and lazy loading was removed on request earlier.
- **Done: the auth round trip.** The proxy no longer asks the Auth server who you are on every request. It calls `getClaims()`, which refreshes an expired session and verifies the ES256 token's signature locally against the project's cached public keys. Measured against this project: `getUser` 307 ms median, `getClaims` 1.6 ms. Pages and Server Actions still call `getUser()`, which is the authoritative check, so a session revoked on the server is still refused; the proxy is a convenience gate.
- **Done: the redirect loop.** A request with a valid-looking token but no usable session (a switched-off login, a login with no profile or salon, a token revoked on the server) used to go `/dashboard` to `/login` (no usable session) and back to `/dashboard` (the proxy sends signed-in visitors away from `/login`). `requireSession` and the root page now send those to `/auth/session-ended`, which signs the session out (and clears the cookies even if the Auth server will not answer) before showing `/login` with the reason. It does nothing to a healthy session, so a crafted link cannot sign anyone out.

## Navigation and prefetching
- **Links**: every internal navigation uses `<Link>` or `router.replace`. The only plain `<a>` is the external Stripe invoice link. The sign-out forms post to a route handler on purpose (a real request that clears the session), and `/auth/callback` ends with a deliberate full navigation so the new session cookie is read.
- **Prefetching**: all dashboard routes are dynamic, and Next skips prefetching a dynamic route that has no `loading` file, so nothing was being prefetched (no over-fetching to turn off) and a click showed nothing until the server finished. `app/(dashboard)/dashboard/loading.tsx` fixes that: Next now prefetches only the shell down to that file (tiny, shared by every page) and shows the skeleton at once. No link needed `prefetch={false}`.
- **Measured in a real browser** (production build, six sidebar clicks, median): first thing on screen after a click **16 ms, was 875 ms**; fully loaded 1097 ms vs 1164 ms (unchanged: the server work is the same).
- **Tab switches** are unaffected: the page header and tab bar stay, and only the tab body shows its own skeleton.
- **Layouts**: a navigation re-renders only the page segment. The sidebar and top bar belong to the layout, which the router keeps; tab changes (`?tab=`) re-render the page, not the layout.
- **Behaviour change**: because the skeleton is sent before the page finishes, a page that refuses a visitor (`requireModule`) now redirects from inside the stream: HTTP 200 with a client-side redirect to `/dashboard?denied=1`, instead of HTTP 307. Nothing of the refused page is rendered (checked: no audit content in the body). `test-audit` accepts either form.
- **Still the dominant cost**: a full page load spends ~300 ms in the page's own `getUser()` call to the Auth server (the proxy no longer does). It is the authoritative session check, so it stays; replacing it with local verification would let a revoked-but-unexpired token keep working for up to an hour, which is a decision for the owner of the project.
