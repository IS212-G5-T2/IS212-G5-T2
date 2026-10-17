/*
 * SPM-65 AC1 — on the coordinator's events page, the pending change requests for the events
 * assigned to them, oldest first: event, organiser, requested details and when it was submitted,
 * each linking to the event page, where the review panel sits above the planning cards (SPM-65 AC2).
 * Shown at the top of the coordinator's events page. A request the coordinator has not opened yet
 * (unread SPM-64 AC3 notice) is tagged New; opening its review marks it read.
 */
import { Link } from "react-router-dom";
import type { ChangeRequest } from "@/types";
import { formatSgtDateTime } from "@/utils/sgtDate";
import { changeFieldLabel, oldestFirst } from "@/features/events/lib/changeRequests";

export function PendingChangeRequests({
  requests,
  newEventIds = new Set(),
}: {
  requests: readonly ChangeRequest[];
  /** Events whose change request notice is still unread. */
  newEventIds?: ReadonlySet<string>;
}) {
  return (
    <section
      aria-label="Pending change requests"
      className="mb-6 rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800"
    >
      <h2 className="font-semibold text-gray-900 dark:text-gray-100">Pending Change Requests</h2>
      {requests.length === 0 ? (
        <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">No pending change requests.</p>
      ) : (
        <ul className="mt-2 divide-y divide-gray-100 text-sm dark:divide-gray-700">
          {oldestFirst(requests).map((request) => (
            <li key={request.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <div>
                <p className="flex flex-wrap items-center gap-2 font-medium text-gray-900 dark:text-gray-100">
                  {request.eventName}
                  {newEventIds.has(request.eventId) && (
                    <span className="rounded-full bg-primary-100 px-2 py-0.5 text-xs font-medium text-primary-800 dark:bg-primary-900/40 dark:text-primary-200">
                      New
                    </span>
                  )}
                </p>
                <p className="text-gray-600 dark:text-gray-400">
                  {request.organiserName ?? request.requestedBy} ·{" "}
                  {request.changes.map((change) => changeFieldLabel(change.field)).join(", ")} · submitted{" "}
                  {formatSgtDateTime(request.createdAt)}
                </p>
              </div>
              <Link
                to={`/events/${request.eventId}`}
                className="font-medium text-primary-700 hover:underline dark:text-primary-300"
              >
                Review Change Request
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
