import { Button } from "@/components/ui/Button";
import { WAITLIST_MESSAGES } from "@/features/events/lib/registration";

interface Props {
  eventName: string;
  /** The join request is in flight: the control is disabled so a second click cannot send one (01-E). */
  pending: boolean;
  /** A refusal from the server, announced in an alert; empty when none. */
  error: string;
  /** The position from a successful join, shown once as the MSG-WL-01 banner; null when there is none. */
  joinedPosition: number | null;
  /** Shows the Join control and the MSG-WL-02 sentence. Omitted once the attendee is waiting or may not join. */
  onJoin?: () => void;
  onDismissBanner: () => void;
}

/**
 * SPM-138 waitlist controls for the event page: the Join Waitlist control while the event is full, the waiting
 * indicator once the attendee is on the list, and the confirmation banner (MSG-WL-01, built from the event name and the
 * response position). The server decides every outcome; this only shows it.
 */
export function WaitlistPanel({ eventName, pending, error, joinedPosition, onJoin, onDismissBanner }: Props) {
  return (
    <div className="space-y-2">
      {onJoin && (
        <>
          <p className="text-sm text-gray-600 dark:text-gray-400">{WAITLIST_MESSAGES.full}</p>
          <Button variant="secondary" disabled={pending} aria-busy={pending} onClick={onJoin}>
            {WAITLIST_MESSAGES.join}
          </Button>
        </>
      )}
      {error && (
        <p role="alert" className="text-sm text-danger-700 dark:text-danger-300">
          <span aria-hidden="true">⚠ </span>
          {error}
        </p>
      )}
      {joinedPosition !== null && (
        <div role="status" className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-success-200 bg-success-50 p-3 text-sm text-success-900 dark:border-success-800 dark:bg-success-900/20 dark:text-success-200">
          <span>{WAITLIST_MESSAGES.joined(eventName, joinedPosition)}</span>
          <Button variant="ghost" size="sm" onClick={onDismissBanner}>
            Dismiss
          </Button>
        </div>
      )}
    </div>
  );
}
