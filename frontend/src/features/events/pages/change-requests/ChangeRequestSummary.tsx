/*
 * SPM-64 AC5 — on the event page, the owning organiser sees the status of
 * their latest change request (pending, or the last decision with the
 * coordinator's reason) and a link to the full Change Requests page.
 * AC3 — the assigned coordinator sees the same block, so the proposed changes
 * are one click away from the event page as well as from the notification.
 * SPM-65 AC2-AC6 — for the assigned coordinator (`reviewer`), a pending request
 * is shown in full as "Change Requested by Organiser" above the Update Event
 * Information and Changes Awaiting Review cards: each change (value when
 * requested → requested value), who asked and when, the read-only conflict
 * check and the Approve / Deny actions. After a decision the block confirms it
 * and `onDecided` lets the event page reload the updated event.
 * Renders nothing until the event has a change request; the full list,
 * values and empty state are on the Change Requests page.
 */
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { ChangeRequest, ChangeRequestApproval } from "@/types";
import { formatSgtDateTime } from "@/utils/sgtDate";
import { fetchEventChangeRequests } from "@/features/events/api/change-requests-api";
import { changeFieldLabel } from "@/features/events/lib/changeRequests";
import { ChangeRequestStatus, RequestedChangesTable } from "@/features/events/pages/change-requests/ChangeRequestList";
import { ChangeRequestReview } from "@/features/events/pages/change-requests/ChangeRequestReview";

interface Props {
  eventId: string;
  /** The viewer is the event's assigned coordinator. */
  reviewer?: boolean;
  /** SPM-65: a decision was recorded; the event may have changed. */
  onDecided?: () => void;
}

export function ChangeRequestSummary({ eventId, reviewer = false, onDecided }: Props) {
  const [latest, setLatest] = useState<ChangeRequest | null>(null);
  const [error, setError] = useState("");
  const [confirmation, setConfirmation] = useState("");

  const load = useCallback(async () => {
    const requests = await fetchEventChangeRequests(eventId);
    return requests[0] ?? null;
  }, [eventId]);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const found = await load();
        if (active) setLatest(found);
      } catch {
        if (active) setError("Could not load your change requests.");
      }
    })();
    return () => {
      active = false;
    };
  }, [load]);

  if (error)
    return (
      <p role="alert" className="mb-4 text-sm text-danger-700 dark:text-danger-300">
        {error}
      </p>
    );
  if (!latest) return null;
  const awaitingReview = reviewer && latest.status === "Pending";

  function decided(request: ChangeRequest, message: string) {
    setLatest(request);
    setConfirmation(message);
    onDecided?.();
  }

  return (
    <section
      aria-label="Change request status"
      className="mb-6 rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm dark:border-gray-700 dark:bg-gray-800"
    >
      {confirmation && (
        <p role="status" className="mb-2 text-success-800 dark:text-success-300">
          {confirmation}
        </p>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="flex flex-wrap items-center gap-2 font-medium text-gray-900 dark:text-gray-100">
            {awaitingReview ? "Change Requested by Organiser" : "Change request"} <ChangeRequestStatus request={latest} />
          </p>
          <p className="mt-1 text-gray-600 dark:text-gray-400">
            {awaitingReview
              ? `Requested by ${latest.requestedBy} on ${formatSgtDateTime(latest.createdAt)}`
              : `${latest.changes.map((change) => changeFieldLabel(change.field)).join(", ")} · submitted ${formatSgtDateTime(latest.createdAt)}`}
          </p>
          {latest.status === "Denied" && latest.decisionReason && (
            <p className="mt-1 text-gray-700 dark:text-gray-300">Coordinator’s reason: “{latest.decisionReason}”</p>
          )}
        </div>
        <Link to={`/events/${eventId}/change-requests`} className="font-medium text-primary-700 hover:underline dark:text-primary-300">
          View Change Requests
        </Link>
      </div>
      {awaitingReview && (
        <>
          <RequestedChangesTable request={latest} />
          {latest.reason && <p className="mt-2 text-gray-600 dark:text-gray-400">Reason: “{latest.reason}”</p>}
          <ChangeRequestReview
            request={latest}
            onApproved={(result: ChangeRequestApproval) =>
              decided(
                result.request,
                `Change request approved. Event details have been updated.${
                  result.safetyCheckReset ? " The safety check was reset; request a new safety check." : ""
                }${result.request.recheck.length ? " See the arrangements to re-check on the Change Requests page." : ""}`,
              )
            }
            onDenied={(request) => decided(request, "Change request denied. The organiser has been notified.")}
            onStale={() => {
              void load()
                .then(setLatest)
                .catch(() => undefined);
            }}
          />
        </>
      )}
    </section>
  );
}
