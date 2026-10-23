/*
 * SPM-48 Monitor Workspace Queue & Status: what the coordinator's queue shows on each event card.
 * Every indicator is text, never colour alone (AC5); the server decides each state
 * (backend src/events/queue/queue-indicators.ts), the card only labels it.
 */
import type { QueueIndicators } from "@/types";
import { StateLabel } from "@/features/events/components/StatusLabels";
import { QUEUE_ACTION_LABELS, QUEUE_SAFETY_LABELS } from "@/features/events/lib/queueLabels";
import { formatSingaporeDateTime } from "@/utils/format";

/** AC5: the attention marker. Shown only when the server lists at least one reason, which screen readers read out. */
export function NeedsActionMarker({ queue }: { queue: Pick<QueueIndicators, "actions" | "needsAction"> }) {
  if (!queue.needsAction) return null;
  const reasons = queue.actions.map((action) => QUEUE_ACTION_LABELS[action]).join(", ");
  return (
    <span
      title={`Needs action: ${reasons}`}
      className="inline-flex items-center gap-1 rounded-full bg-danger-700 px-2 py-0.5 text-xs font-semibold text-white dark:bg-danger-500 dark:text-gray-950"
    >
      <span aria-hidden="true">!</span>
      <span>Needs action</span>
      {/* CQ-48-01: the reasons are real text, so every screen reader announces them; sighted users see the title. */}
      <span className="sr-only">{`: ${reasons}`}</span>
    </span>
  );
}

/** AC6, AC7: at most one safety label. */
export function QueueSafetyLabel({ queue }: { queue: Pick<QueueIndicators, "safety"> }) {
  if (!queue.safety) return null;
  return <StateLabel {...QUEUE_SAFETY_LABELS[queue.safety]} />;
}

/** AC8 and AC9: one line per hold and per unavailable venue, naming the venue (and the hold's expiry in SGT). */
export function QueueVenueNotes({ queue }: { queue: Pick<QueueIndicators, "holds" | "unavailableVenues"> }) {
  if (queue.holds.length === 0 && queue.unavailableVenues.length === 0) return null;
  return (
    <ul aria-label="Venue notes" className="mt-2 space-y-1 text-xs">
      {queue.unavailableVenues.map((venue) => (
        <li key={`unavailable-${venue}`} className="font-medium text-danger-800 dark:text-danger-300">
          {`Venue unavailable – alternative arrangements needed: ${venue}`}
        </li>
      ))}
      {queue.holds.map((hold) =>
        hold.state === "ACTIVE" ? (
          <li key={`hold-${hold.venueName}-${hold.expiresAt}`} className="text-gray-700 dark:text-gray-300">
            {`Hold active: ${hold.venueName}, expires ${formatSingaporeDateTime(hold.expiresAt)}`}
          </li>
        ) : (
          <li key={`hold-${hold.venueName}-${hold.expiresAt}`} className="font-medium text-danger-800 dark:text-danger-300">
            {`Hold expired: ${hold.venueName}, expired ${formatSingaporeDateTime(hold.expiresAt)}`}
          </li>
        ),
      )}
    </ul>
  );
}
