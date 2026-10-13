import type { PillTone } from "@/components/ui/pill";
import type { AppointmentStatus } from "@/lib/types/database";

/*
 * How an appointment's service state looks. Shared by the diary, the agenda and
 * the appointment page. Not a "use client" module (CLAUDE.md rule 9).
 */

export const STATUS_LABEL: Record<AppointmentStatus, string> = {
  booked: "Booked",
  confirmed: "Confirmed",
  completed: "Completed",
  cancelled: "Cancelled",
  no_show: "No-show",
};

export const STATUS_TONE: Record<AppointmentStatus, PillTone> = {
  booked: "info",
  confirmed: "warning",
  completed: "good",
  cancelled: "neutral",
  no_show: "critical",
};

/** A tinted block with a coloured left edge: grid blocks, week chips, the legend. */
export const STATUS_TINT: Record<AppointmentStatus, string> = {
  booked: "bg-info-bg text-info-fg shadow-[inset_3px_0_0_var(--info)]",
  confirmed: "bg-warning-bg text-warning-fg shadow-[inset_3px_0_0_var(--warning)]",
  completed: "bg-good-bg text-good-fg shadow-[inset_3px_0_0_var(--good)]",
  cancelled: "bg-neutral-bg text-neutral-fg shadow-[inset_3px_0_0_var(--neutral)]",
  no_show: "bg-critical-bg text-critical-fg shadow-[inset_3px_0_0_var(--critical)]",
};

export const STATUS_ORDER: AppointmentStatus[] = [
  "booked",
  "confirmed",
  "completed",
  "no_show",
  "cancelled",
];
