/*
 * People for an event: the organiser, the coordinator and, once the event is
 * confirmed or later, the registrations button for the coordinator's report.
 * Rendered inside the planning Event Info tab for approved and planning events,
 * and in its own card on the other phases. The registrations button is never
 * shown while registration has not begun (approved and planning).
 */
import { Button } from "@/components/ui/Button";
import type { EventRecord } from "@/types";
import { PRE_REGISTRATION_STATUSES } from "@/features/events/pages/detail/planning/preRegistration";
import { formatDateTime } from "@/utils/format";

interface Props {
  event: EventRecord;
  /** Whether the viewer may open the registrations report for this event. */
  canViewRegistrations: boolean;
  onViewRegistrations: () => void;
  /** The planning Event Info tab already shows its own "Last updated" line. */
  showLastUpdated?: boolean;
}

export function EventPeople({ event, canViewRegistrations, onViewRegistrations, showLastUpdated = true }: Props) {
  const preRegistration = (PRE_REGISTRATION_STATUSES as readonly string[]).includes(event.status);
  return (
    <dl className="space-y-3 text-sm">
      <div>
        <dt className="text-gray-400 dark:text-gray-500">Organiser</dt>
        <dd className="break-words font-medium text-gray-800 dark:text-gray-200">{event.organiserName}</dd>
      </div>
      <div>
        <dt className="text-gray-400 dark:text-gray-500">Coordinator</dt>
        <dd className="break-words font-medium text-gray-800 dark:text-gray-200">{event.coordinatorName ?? "Unassigned"}</dd>
      </div>
      {showLastUpdated && (
        <div>
          <dt className="text-gray-400 dark:text-gray-500">Last updated</dt>
          <dd className="font-medium text-gray-800 dark:text-gray-200">{formatDateTime(event.updatedAt)}</dd>
        </div>
      )}
      {canViewRegistrations && !preRegistration && (
        <Button variant="secondary" size="sm" onClick={onViewRegistrations}>
          View Registrations
        </Button>
      )}
    </dl>
  );
}
