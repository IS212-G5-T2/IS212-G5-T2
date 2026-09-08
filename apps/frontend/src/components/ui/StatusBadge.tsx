import clsx from "clsx";
import type { BookingStatus, EquipmentRequestStatus, EventStatus, RegistrationStatus } from "@/types";

type AnyStatus = EventStatus | BookingStatus | EquipmentRequestStatus | RegistrationStatus;

const styles: Record<AnyStatus, string> = {
  draft: "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300",
  submitted: "bg-primary-100 dark:bg-primary-900/30 text-primary-800 dark:text-primary-300",
  under_review: "bg-warning-100 dark:bg-warning-900/30 text-warning-800 dark:text-warning-300",
  approved: "bg-success-100 dark:bg-success-900/30 text-success-800 dark:text-success-300",
  planning: "bg-primary-100 dark:bg-primary-900/30 text-primary-800 dark:text-primary-300",
  confirmed: "bg-success-100 dark:bg-success-900/30 text-success-800 dark:text-success-300",
  completed: "bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300",
  cancelled: "bg-danger-100 dark:bg-danger-900/30 text-danger-800 dark:text-danger-300",
  rejected: "bg-danger-100 dark:bg-danger-900/30 text-danger-800 dark:text-danger-300",
  pending: "bg-warning-100 dark:bg-warning-900/30 text-warning-800 dark:text-warning-300",
  requested: "bg-warning-100 dark:bg-warning-900/30 text-warning-800 dark:text-warning-300",
  checking: "bg-warning-100 dark:bg-warning-900/30 text-warning-800 dark:text-warning-300",
  reserved: "bg-success-100 dark:bg-success-900/30 text-success-800 dark:text-success-300",
  unavailable: "bg-danger-100 dark:bg-danger-900/30 text-danger-800 dark:text-danger-300",
  registered: "bg-success-100 dark:bg-success-900/30 text-success-800 dark:text-success-300",
  withdrawn: "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400",
};

const labels: Record<AnyStatus, string> = {
  draft: "Draft",
  submitted: "Submitted",
  under_review: "Under Review",
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
  registered: "Registered",
  withdrawn: "Withdrawn",
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
