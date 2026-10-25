import clsx from "clsx";
import type { BookingStatus, EquipmentRequestStatus, EventStatus, RegistrationStatus } from "@/types";

type AnyStatus = EventStatus | BookingStatus | EquipmentRequestStatus | RegistrationStatus;

// SPM-48 AC5 (MONITOR-QUEUE-05-A): each of the seven event statuses has its own colour, and its text label
// always says the status, so statuses stay distinguishable without colour (greyscale, colour blindness).
export const EVENT_STATUS_STYLES = {
  submitted: "bg-primary-100 dark:bg-primary-900/30 text-primary-800 dark:text-primary-300",
  approved: "bg-sky-100 dark:bg-sky-900/30 text-sky-800 dark:text-sky-300",
  planning: "bg-violet-100 dark:bg-violet-900/30 text-violet-800 dark:text-violet-300",
  confirmed: "bg-success-100 dark:bg-success-900/30 text-success-800 dark:text-success-300",
  completed: "bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300",
  cancelled: "bg-gray-700 dark:bg-gray-300 text-white dark:text-gray-900",
  rejected: "bg-danger-100 dark:bg-danger-900/30 text-danger-800 dark:text-danger-300",
} as const;

const styles: Record<AnyStatus, string> = {
  draft: "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300",
  ...EVENT_STATUS_STYLES,
  pending: "bg-warning-100 dark:bg-warning-900/30 text-warning-800 dark:text-warning-300",
  requested: "bg-warning-100 dark:bg-warning-900/30 text-warning-800 dark:text-warning-300",
  checking: "bg-warning-100 dark:bg-warning-900/30 text-warning-800 dark:text-warning-300",
  reserved: "bg-success-100 dark:bg-success-900/30 text-success-800 dark:text-success-300",
  unavailable: "bg-danger-100 dark:bg-danger-900/30 text-danger-800 dark:text-danger-300",
  registered: "bg-success-100 dark:bg-success-900/30 text-success-800 dark:text-success-300",
  withdrawn: "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400",
  // SPM-138: a waitlist entry is an accent (primary) variant, not confirmed and not withdrawn. Amber stays reserved for
  // pending requests; withdrawn is the existing gray. Removed is a closed-list outcome.
  waitlisted: "bg-primary-100 dark:bg-primary-900/30 text-primary-800 dark:text-primary-300",
  removed: "bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300",
};

const labels: Record<AnyStatus, string> = {
  draft: "Draft",
  submitted: "Submitted",
  approved: "Approved",
  planning: "Planning",
  confirmed: "Confirmed",
  completed: "Completed",
  cancelled: "Cancelled",
  rejected: "Rejected",
  pending: "Pending",
  requested: "Requested",
  checking: "Checking",
  reserved: "Reserved",
  unavailable: "Unavailable",
  // SPM-138 D3: a registration that holds a place is labelled "Confirmed" in the UI.
  registered: "Confirmed",
  withdrawn: "Withdrawn",
  waitlisted: "Waitlisted",
  removed: "Removed",
};

export function StatusBadge({ status }: { status: AnyStatus }) {
  return (
    <span
      className={clsx(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        styles[status]
      )}
    >
      {labels[status]}
    </span>
  );
}
