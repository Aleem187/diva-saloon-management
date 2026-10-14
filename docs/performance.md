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
