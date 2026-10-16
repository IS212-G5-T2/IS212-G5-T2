/*
 * SPM-64 AC5 — on the event page, the owning organiser sees the status of
 * their latest change request (pending, or the last decision with the
 * coordinator's reason) and a link to the full Change Requests page.
 * Renders nothing until the event has a change request.
 */
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { ChangeRequest } from "@/types";
import { formatSgtDateTime } from "@/utils/sgtDate";
import { fetchEventChangeRequests } from "@/features/events/api/change-requests-api";
import { changeFieldLabel } from "@/features/events/lib/changeRequests";
import { ChangeRequestStatus } from "@/features/events/pages/change-requests/ChangeRequestList";

export function ChangeRequestSummary({ eventId }: { eventId: string }) {
  const [latest, setLatest] = useState<ChangeRequest | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const requests = await fetchEventChangeRequests(eventId);
        if (active) setLatest(requests[0] ?? null);
      } catch {
        if (active) setError("Could not load your change requests.");
      }
    })();
    return () => {
      active = false;
    };
  }, [eventId]);

  if (error)
    return (
      <p role="alert" className="mb-4 text-sm text-danger-700 dark:text-danger-300">
        {error}
      </p>
    );
  if (!latest) return null;

  return (
    <section
      aria-label="Change request status"
      className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm dark:border-gray-700 dark:bg-gray-800"
    >
      <div>
        <p className="flex flex-wrap items-center gap-2 font-medium text-gray-900 dark:text-gray-100">
          Change request <ChangeRequestStatus request={latest} />
        </p>
        <p className="mt-1 text-gray-600 dark:text-gray-400">
          {latest.changes.map((change) => changeFieldLabel(change.field)).join(", ")} · submitted{" "}
          {formatSgtDateTime(latest.createdAt)}
        </p>
        {latest.status === "Denied" && latest.decisionReason && (
          <p className="mt-1 text-gray-700 dark:text-gray-300">Coordinator’s reason: “{latest.decisionReason}”</p>
        )}
      </div>
      <Link to={`/events/${eventId}/change-requests`} className="font-medium text-primary-700 hover:underline dark:text-primary-300">
        View Change Requests
      </Link>
    </section>
  );
}
