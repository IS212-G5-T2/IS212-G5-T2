import { useCallback, useEffect, useState } from "react";
import clsx from "clsx";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { LeadNotifications } from "@/features/lead/components/LeadNotifications";
import { CoordinatorPicker } from "@/features/lead/components/CoordinatorPicker";
import { PageHeader } from "@/components/ui/PageHeader";
import { ApiError } from "@/utils/api";
import { formatDateRange } from "@/utils/format";
import {
  assignRequest,
  getLeadCoordinators,
  getLeadQueue,
  type LeadCoordinator,
  type QueuedRequest,
} from "@/features/lead/api/lead-api";

const message = (error: unknown, fallback: string) =>
  error instanceof ApiError ? error.message : fallback;

// One queued request with its own coordinator picker and Assign button.
function QueuedRequestCard({
  request,
  coordinators,
  noneAvailable,
  onAssigned,
  onRefused,
}: {
  request: QueuedRequest;
  coordinators: LeadCoordinator[];
  noneAvailable: boolean;
  onAssigned: (id: string, confirmation: string) => void;
  onRefused: (error: string) => void;
}) {
  const [coordinatorId, setCoordinatorId] = useState("");
  const [assigning, setAssigning] = useState(false);
  const pickerId = `assign-${request.id}`;

  const assign = async () => {
    setAssigning(true);
    try {
      const result = await assignRequest(request.id, coordinatorId);
      onAssigned(request.id, result.message);
    } catch (error) {
      onRefused(message(error, "Could not assign this request. Please try again."));
      setAssigning(false);
    }
  };

  return (
    <article aria-label={request.name}>
      <Card>
        <CardBody>
          <h2 className="font-semibold text-gray-900 dark:text-gray-100">{request.name}</h2>
          <p className="text-sm text-gray-600 dark:text-gray-300">{request.purpose}</p>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
            {formatDateRange(request.startDateTime, request.endDateTime)}
          </p>
          <p className="text-sm text-gray-500 dark:text-gray-400">{`Expected attendance: ${request.expectedAttendance}`}</p>
          <div className="mt-4 flex flex-wrap items-end gap-3">
            <CoordinatorPicker
              id={pickerId}
              label="Assign to"
              coordinators={coordinators}
              value={coordinatorId}
              onChange={setCoordinatorId}
              disabled={noneAvailable || assigning}
            />
            <Button onClick={assign} disabled={noneAvailable || !coordinatorId || assigning}>
              {assigning ? "Assigning…" : "Assign"}
            </Button>
          </div>
        </CardBody>
      </Card>
    </article>
  );
}

// SPM-123: the Event Coordinator Lead assigns each unassigned request to one
// available coordinator, seeing everyone's availability and workload first.
export function AssignmentQueuePage() {
  const [queue, setQueue] = useState<QueuedRequest[] | null>(null);
  const [coordinators, setCoordinators] = useState<LeadCoordinator[]>([]);
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");

  const loadCoordinators = useCallback(async () => {
    setCoordinators(await getLeadCoordinators());
  }, []);

  useEffect(() => {
    Promise.all([getLeadQueue(), getLeadCoordinators()])
      .then(([requests, people]) => {
        setQueue(requests);
        setCoordinators(people);
      })
      .catch((caught) => setError(message(caught, "Could not load the assignment queue.")));
  }, []);

  const noneAvailable = coordinators.every((coordinator) => !coordinator.available);

  const assigned = (id: string, text: string) => {
    setError("");
    setConfirmation(text);
    setQueue((items) => (items ?? []).filter((item) => item.id !== id));
    void loadCoordinators().catch(() => undefined);
  };

  const refused = (text: string) => {
    setConfirmation("");
    setError(text);
    // The server may know something the page doesn't: the coordinator went
    // unavailable, or the request was assigned, cancelled or deleted elsewhere.
    void Promise.all([getLeadQueue(), getLeadCoordinators()])
      .then(([requests, people]) => {
        setQueue(requests);
        setCoordinators(people);
      })
      .catch(() => undefined);
  };

  return (
    <div>
      {/* SPM-47 AC10: coordinators who went unavailable with active events. */}
      <LeadNotifications />
      <PageHeader
        title="Assignment Queue"
        description="Assign each unassigned event request to an available coordinator. Coordinators with the fewest active requests are listed first."
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
      {noneAvailable && queue !== null && (
        <p className="mb-4 rounded-lg border border-warning-200 bg-warning-50 p-3 text-sm text-warning-900">
          No coordinators are available right now. The request stays in the queue.
        </p>
      )}
      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <div className="space-y-4">
          {queue === null && !error && <p className="text-sm text-gray-500">Loading the queue…</p>}
          {queue?.length === 0 && <p className="text-sm text-gray-500 dark:text-gray-400">No unassigned requests.</p>}
          {queue?.map((request) => (
            <QueuedRequestCard
              key={request.id}
              request={request}
              coordinators={coordinators}
              noneAvailable={noneAvailable}
              onAssigned={assigned}
              onRefused={refused}
            />
          ))}
        </div>
        <section aria-label="Coordinators">
          <Card>
            <CardHeader>
              <h2 className="font-semibold text-gray-900 dark:text-gray-100">Coordinators</h2>
            </CardHeader>
            <CardBody>
              <ul className="space-y-2">
                {coordinators.map((coordinator) => (
                  <li key={coordinator.id} className="flex items-center justify-between gap-2 text-sm">
                    <span className="text-gray-900 dark:text-gray-100">{coordinator.name}</span>
                    <span className="flex items-center gap-2">
                      <span
                        className={clsx(
                          "rounded-full px-2 py-0.5 text-xs font-medium",
                          coordinator.available
                            ? "bg-success-100 text-success-800 dark:bg-success-900/30 dark:text-success-300"
                            : "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300",
                        )}
                      >
                        {coordinator.available ? "Available" : "Unavailable"}
                      </span>
                      <span className="text-gray-500 dark:text-gray-400">{`${coordinator.activeAssignments} active`}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </CardBody>
          </Card>
        </section>
      </div>
    </div>
  );
}
