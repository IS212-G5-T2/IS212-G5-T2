import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { ApiError } from "@/utils/api";
import { formatDateTimeRange } from "@/utils/format";
import {
  getAssignedEvents,
  getLeadCoordinators,
  reassignEvent,
  type AssignedEvent,
  type LeadCoordinator,
} from "@/utils/lead-api";

const message = (error: unknown, fallback: string) =>
  error instanceof ApiError ? error.message : fallback;

// How a coordinator appears in an event's picker: the current one and
// unavailable ones are shown but can't be chosen.
function optionLabel(coordinator: LeadCoordinator, currentId: string) {
  if (coordinator.id === currentId) return `${coordinator.name} (current)`;
  if (!coordinator.available) return `${coordinator.name} (Unavailable)`;
  return `${coordinator.name} (${coordinator.activeAssignments} active)`;
}

// One assigned event with its own coordinator picker and Reassign button.
function AssignedEventCard({
  event,
  coordinators,
  onReassigned,
  onRefused,
}: {
  event: AssignedEvent;
  coordinators: LeadCoordinator[];
  onReassigned: (confirmation: string) => Promise<void>;
  onRefused: (error: string) => void;
}) {
  const [coordinatorId, setCoordinatorId] = useState("");
  const [reassigning, setReassigning] = useState(false);
  const pickerId = `reassign-${event.id}`;

  const reassign = async () => {
    setReassigning(true);
    try {
      // The page sends the coordinator it showed, so a stale page is refused.
      const result = await reassignEvent(event.id, coordinatorId, event.coordinatorId);
      await onReassigned(result.message);
      setCoordinatorId("");
    } catch (error) {
      onRefused(message(error, "Could not reassign this event. Please try again."));
    }
    setReassigning(false);
  };

  return (
    <article aria-label={event.name}>
      <Card>
        <CardBody>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-semibold text-gray-900 dark:text-gray-100">{event.name}</h2>
            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700 dark:bg-gray-700 dark:text-gray-300">
              {event.status}
            </span>
            {!event.coordinatorAvailable && (
              <span className="rounded-full bg-warning-100 px-2 py-0.5 text-xs font-medium text-warning-800 dark:bg-warning-900/30 dark:text-warning-300">
                Coordinator unavailable
              </span>
            )}
          </div>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
            {formatDateTimeRange(event.startDateTime, event.endDateTime)}
          </p>
          <p className="text-sm text-gray-700 dark:text-gray-300">{`Coordinator: ${event.coordinatorName}`}</p>
          <div className="mt-4 flex flex-wrap items-end gap-3">
            <div>
              <label htmlFor={pickerId} className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                Reassign to
              </label>
              <select
                id={pickerId}
                value={coordinatorId}
                onChange={(change) => setCoordinatorId(change.target.value)}
                disabled={reassigning}
                className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
              >
                <option value="">Choose a coordinator</option>
                {coordinators.map((coordinator) => (
                  <option
                    key={coordinator.id}
                    value={coordinator.id}
                    disabled={coordinator.id === event.coordinatorId || !coordinator.available}
                  >
                    {optionLabel(coordinator, event.coordinatorId)}
                  </option>
                ))}
              </select>
            </div>
            <Button onClick={reassign} disabled={!coordinatorId || reassigning}>
              {reassigning ? "Reassigning…" : "Reassign"}
            </Button>
          </div>
        </CardBody>
      </Card>
    </article>
  );
}

// SPM-47: the Event Coordinator Lead moves an assigned event to a different
// available coordinator, seeing everyone's availability and workload first.
// Events are listed soonest first, as the server sends them.
export function ReassignmentPage() {
  const [events, setEvents] = useState<AssignedEvent[] | null>(null);
  const [coordinators, setCoordinators] = useState<LeadCoordinator[]>([]);
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const [assigned, people] = await Promise.all([getAssignedEvents(), getLeadCoordinators()]);
    setEvents(assigned);
    setCoordinators(people);
  }, []);

  useEffect(() => {
    load().catch((caught) => setError(message(caught, "Could not load the assigned events.")));
  }, [load]);

  const reassigned = async (text: string) => {
    setError("");
    setConfirmation(text);
    await load().catch(() => undefined);
  };

  const refused = (text: string) => {
    setConfirmation("");
    setError(text);
    // The server may know something the page doesn't: the event moved, was
    // cancelled, or the coordinator just went unavailable.
    void load().catch(() => undefined);
  };

  return (
    <div>
      <PageHeader
        title="Reassign Events"
        description="Move an assigned event to a different available coordinator. Coordinators with the fewest active events are listed first."
      />
      {confirmation && (
        <p role="status" className="mb-4 rounded-lg border border-teal-200 bg-teal-50 p-3 text-sm text-teal-900">
          {confirmation}
        </p>
      )}
      {error && (
        <p role="alert" className="mb-4 rounded-lg border border-danger-200 bg-danger-50 p-3 text-sm text-danger-800">
          {error}
        </p>
      )}
      <div className="space-y-4">
        {events === null && !error && <p className="text-sm text-gray-500">Loading assigned events…</p>}
        {events?.length === 0 && <p className="text-sm text-gray-500 dark:text-gray-400">No assigned events to reassign.</p>}
        {events?.map((event) => (
          <AssignedEventCard
            key={event.id}
            event={event}
            coordinators={coordinators}
            onReassigned={reassigned}
            onRefused={refused}
          />
        ))}
      </div>
    </div>
  );
}
