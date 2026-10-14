import type { AUDIT_ACTIONS } from "@/lib/audit";

/*
 * What the audit log page knows about the action vocabulary: a label for each
 * action, which category it belongs to, and which actions count as sensitive.
 *
 * Deliberately NOT a "use client" module and not "server-only" itself: the
 * feed, the filter and the tabs all read it (CLAUDE.md rule 9). It only takes
 * a TYPE from @/lib/audit, so nothing server-only is pulled in at runtime.
 *
 * Adding an audit action: add it to AUDIT_ACTIONS and give it a label here.
 * `AUDIT_ACTION_LABELS` is typed over every action, so a missing label, or a
 * misspelt one, fails the typecheck instead of showing a raw code to the owner.
 * Then decide whether it is sensitive.
 */

export type AuditActionValue = (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS];

/** Human labels for the action vocabulary in @/lib/audit. */
export const AUDIT_ACTION_LABELS: Record<AuditActionValue, string> = {
  "salon.created": "Salon created",
  "salon.settings_changed": "Settings changed",
  "salon.appearance_updated": "Appearance updated",
  "billing.checkout_started": "Subscription checkout started",
  "billing.portal_opened": "Billing portal opened",
  "billing.card_added": "Card added",
  "billing.default_card_changed": "Default card changed",
  "billing.card_removed": "Card removed",
  "billing.promo_code_applied": "Promo code applied",
  "staff.invited": "Staff invited",
  "staff.invite_revoked": "Invitation revoked",
  "staff.invite_accepted": "Invitation accepted",
  "staff.role_changed": "Role changed",
  "staff.deactivated": "Staff deactivated",
  "staff.reactivated": "Staff reactivated",
  "service.created": "Service created",
  "service.updated": "Service updated",
  "service.archived": "Service archived",
  "service.restored": "Service restored",
  "deal.created": "Deal created",
  "deal.updated": "Deal updated",
  "deal.archived": "Deal archived",
  "consent_template.created": "Consent template created",
  "consent_template.updated": "Consent template updated",
  "consent_template.archived": "Consent template archived",
  "customer.created": "Customer created",
  "customer.updated": "Customer updated",
  "consent_form.created": "Consent form collected",
  "consent_form.viewed": "Consent signature viewed",
  "appointment.booked": "Appointment booked",
  "appointment.rescheduled": "Appointment rescheduled",
  "appointment.confirmed": "Appointment confirmed",
  "appointment.completed": "Appointment completed",
  "appointment.cancelled": "Appointment cancelled",
  "appointment.no_show": "No-show recorded",
  "receipt.created": "Receipt issued",
  "receipt.voided": "Receipt voided",
  "receipt.discount_applied": "Discount given at the till",
  "loyalty.redeemed": "Loyalty redeemed",
  "payroll.generated": "Payroll generated",
  "payroll.marked_paid": "Payroll marked paid",
  "payroll.commission_rate_changed": "Pay basis changed",
  "staff_document.uploaded": "Staff ID document uploaded",
  "staff_document.viewed": "Staff ID document viewed",
  "staff_document.removed": "Staff ID document removed",
  "payment.recorded": "Payment received",
  "payment.refunded": "Payment refunded",
  "appointment.updated": "Appointment services changed",
  "team_member.added": "Team member added",
  "team_member.updated": "Team member updated",
  "team_member.deactivated": "Team member deactivated",
  "team_member.reactivated": "Team member reactivated",
  "team_member.login_linked": "Login linked to a team member",
  "team_member.login_unlinked": "Login unlinked",
  "team_login.created": "Team login created",
  "team_login.password_changed": "Team login password changed",
  "team_login.sessions_revoked": "Team login devices signed out",
  "team_login.limit_reached": "Team login refused: device limit reached",
  "role.created": "Role created",
  "role.updated": "Role permissions changed",
  "role.deleted": "Role deleted",
};

/** The label for an action, or the raw string for one this build does not know. */
export function actionLabel(action: string): string {
  return (AUDIT_ACTION_LABELS as Record<string, string>)[action] ?? action;
}

/* -------------------------------------------------------------------------- */
/* Categories                                                                  */
/* -------------------------------------------------------------------------- */

export const AUDIT_CATEGORIES = [
  { id: "sales", label: "Sales & payments" },
  { id: "payroll", label: "Payroll" },
  { id: "calendar", label: "Appointments" },
  { id: "customers", label: "Customers & consent" },
  { id: "services", label: "Services" },
  { id: "team", label: "Team & access" },
  { id: "documents", label: "Staff documents" },
  { id: "settings", label: "Settings" },
  { id: "billing", label: "Billing" },
] as const;

export type AuditCategoryId = (typeof AUDIT_CATEGORIES)[number]["id"];

/** Action prefix (the part before the dot) to category. */
const CATEGORY_BY_PREFIX: Record<string, AuditCategoryId> = {
  receipt: "sales",
  loyalty: "sales",
  payment: "sales",
  payroll: "payroll",
  appointment: "calendar",
  customer: "customers",
  consent_form: "customers",
  service: "services",
  deal: "services",
  consent_template: "services",
  staff: "team",
  team_member: "team",
  role: "team",
  team_login: "team",
  staff_document: "documents",
  salon: "settings",
  billing: "billing",
};

export function categoryOf(action: string): AuditCategoryId | null {
  return CATEGORY_BY_PREFIX[action.split(".")[0]] ?? null;
}

export function categoryLabel(id: AuditCategoryId): string {
  return AUDIT_CATEGORIES.find((c) => c.id === id)?.label ?? id;
}

export function isCategoryId(value: unknown): value is AuditCategoryId {
  return AUDIT_CATEGORIES.some((c) => c.id === value);
}

/** Every known action in a category, for filtering. */
export function actionsInCategory(id: AuditCategoryId): AuditActionValue[] {
  return (Object.keys(AUDIT_ACTION_LABELS) as AuditActionValue[]).filter(
    (action) => categoryOf(action) === id,
  );
}

/* -------------------------------------------------------------------------- */
/* Sensitive actions                                                           */
/* -------------------------------------------------------------------------- */

/**
 * The actions an owner should be able to review at a glance: they move or
 * disclose money, change who can do what, change pay, read protected personal
 * or medical data, or alter the rules the money runs on.
 *
 * This is presentation only. It decides which tab an entry also appears on and
 * whether it carries the "Sensitive" mark; it grants and restricts nothing.
 * Routine events (a receipt issued, a booking, a customer edit) are left out so
 * the list stays short enough to be read.
 */
export const SENSITIVE_ACTIONS: readonly AuditActionValue[] = [
  // Money
  "receipt.voided",
  "receipt.discount_applied",
  "payment.refunded",
  "loyalty.redeemed",
  "payroll.marked_paid",
  "payroll.generated",
  // Pay
  "payroll.commission_rate_changed",
  // Access and permissions
  "team_login.created",
  "team_login.password_changed",
  "team_login.sessions_revoked",
  "role.created",
  "role.updated",
  "role.deleted",
  "staff.role_changed",
  "staff.deactivated",
  "team_member.login_linked",
  "team_member.login_unlinked",
  // Protected personal and medical data
  "consent_form.viewed",
  "staff_document.viewed",
  "staff_document.uploaded",
  "staff_document.removed",
  // The rules the money runs on
  "salon.settings_changed",
  // Billing
  "billing.default_card_changed",
  "billing.card_removed",
  "billing.promo_code_applied",
];

const SENSITIVE_SET: ReadonlySet<string> = new Set(SENSITIVE_ACTIONS);

export function isSensitive(action: string): boolean {
  return SENSITIVE_SET.has(action);
}
