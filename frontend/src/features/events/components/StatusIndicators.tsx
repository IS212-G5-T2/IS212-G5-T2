import type { EventRecord } from "@/types";
import { safetyCheckReady } from "@/features/events/components/StatusLabels";

/** SPM-94 D4: the exact indicator texts. */
export const SAFETY_INDICATOR_LABELS: Record<NonNullable<EventRecord["safetyIndicator"]>, string> = {
  AWAITING_CHECK: "Awaiting Safety Officer Check",
  CHANGES_REQUESTED: "Safety Changes Requested",
  CLEARED: "Safety Check Cleared",
};

/** SPM-94 AC2: shown only while the event is Submitted and not assigned. Text, not colour alone. */
export function AssignmentIndicator({ event }: { event: Pick<EventRecord, "awaitingCoordinatorAssignment"> }) {
  if (!event.awaitingCoordinatorAssignment) return null;
  return (
    <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-900/30 dark:text-amber-200">
      Awaiting Coordinator Assignment
    </span>
  );
}

/** SPM-94 AC3: renders at most one element, from the single safetyIndicator value. */
export function SafetyIndicator({
  event,
}: {
  event: Pick<EventRecord, "safetyIndicator" | "status" | "venueRequestStatus" | "equipmentStatuses">;
}) {
  if (!event.safetyIndicator) return null;
  if (!safetyCheckReady(event)) return null;
  return (
    <span
      className={
        event.safetyIndicator === "AWAITING_CHECK" || event.safetyIndicator === "CHANGES_REQUESTED"
          ? "rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-900/30 dark:text-amber-200"
          : "rounded-full bg-sky-50 px-2 py-0.5 text-xs font-medium text-sky-800 dark:bg-sky-900/30 dark:text-sky-200"
      }
    >
      {SAFETY_INDICATOR_LABELS[event.safetyIndicator]}
    </span>
  );
}
