# Branches

One salon, several locations. Added by migration `20261021000046_branches.sql`.

## What is shared and what is not

| Shared by the whole salon | Belongs to a branch |
| --- | --- |
| Customers and their loyalty balance, services, prices, deals, consent templates, roles, settings, the subscription | Team members, appointments, receipts (and their lines), payments |

A customer who visits two branches is one customer with one loyalty balance. Receipt numbers stay unique across the salon.

## Who sees what (enforced by Row Level Security)

- **Owner** (`profiles.branch_id` is NULL): every branch, or one at a time.
- **Everyone else** has exactly one `branch_id` (the database refuses a non-owner without one) and reaches only that branch's appointments, receipts, payments, team members and logins. Nothing the browser sends can widen that.
- Pay periods span the whole salon, so only an owner-level payroll holder sees them. A payroll holder tied to a branch sees pay entries and pay settings for that branch's people only, and cannot generate or pay a period.

## The owner's branch selector

The top bar's "All branches / Branch N" is a cookie, sent on every request as the `x-branch-id` header. Postgres reads it (`active_branch_filter()`) and uses it only to narrow an owner's view, so every query and every `SECURITY INVOKER` report follows it with no per-page filter. It is not a permission: for a branch-bound login it is ignored, and a forged value can only show less. Management (inviting, moving, deactivating people) is not narrowed by it (`can_manage_branch`).

## Where a new row goes

| Row | Branch |
| --- | --- |
| Appointment | The branch of the team member it is booked with |
| Receipt | The branch of the visit it settles; else the login's own branch; else (owner) the branch chosen in the top bar; else the salon's only open branch. An owner on "All branches" in a salon with several is asked to choose. |
| Payment | Its receipt's or visit's branch |
| Team member | The login's own branch; else the chosen branch; else the only open one. An invited person goes where their invitation says. |

## Moving people

Owner only (`move_team_member_to_branch`, `move_login_to_branch`). A login and its team member move together. Refused while they have upcoming appointments. Past bookings, sales and pay stay where they happened.

## The owner's comparison

Reports › Branches (owner, more than one branch): receipts, revenue, discounts, staff pay and profit per branch plus a total, from `report_branch_overview`. Revenue is issued receipts. Staff pay is commission and salary in pay periods that end in the range (draft or paid). **Profit is revenue less staff pay, before rent, stock and any other cost: this product records no other costs.**

## Existing data

Every existing salon got a "Main Branch"; every existing record was placed in it and nothing was altered (checked by `npm run test:branches`, which fingerprints every column before and after). Owners stay on "every branch"; every other login joined the Main Branch.

## Known limits

- Staff can read the shared customer list, including the consent records of customers who also visit other branches. That follows from customers being shared.
- Audit log, billing and Settings remain owner-level and are not per branch.
- A token that already exists can call the data API directly; branch isolation is enforced there too (it is Row Level Security), so it does not depend on the app.

## Testing

`npm run test:branches` starts a throwaway Postgres in Docker, loads every migration, fills it with pre-branch data, applies the branch migration, proves nothing changed, then runs the access rules as real database roles. It never touches a Supabase project.
