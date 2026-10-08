import type { BookingConflict } from "@/types";
import { formatDateRange } from "@/utils/format";

export function ConflictAlert({ conflict }: { conflict: BookingConflict }) {
  return (
    <div
      role="alert"
      className="mb-4 flex items-start gap-2 rounded-lg border border-warning-300 dark:border-warning-700 bg-warning-50 dark:bg-warning-900/20 px-4 py-3 text-sm text-warning-900 dark:text-warning-300"
    >
      <span aria-hidden="true">⚠️</span>
      <div>
        <p className="font-semibold">Conflict detected</p>
        <p>
          "{conflict.eventName}" is already booked {formatDateRange(conflict.start, conflict.end)}.
          Approving this request may create a double-booking.
        </p>
      </div>
    </div>
  );
}
