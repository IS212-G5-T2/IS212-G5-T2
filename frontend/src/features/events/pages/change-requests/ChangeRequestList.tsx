/*
 * SPM-64 AC5 — an event's change requests, newest first, each with its status
 * (Pending review, Approved, Denied with the coordinator's reason, Withdrawn,
 * Closed when the event was cancelled), the requested changes (current →
 * requested) and who decided and when. The organiser can withdraw a pending
 * request.
 * SPM-65 — for the assigned coordinator (`review`), a pending request carries the
 * conflict preview and the Approve / Deny actions (AC2-AC6); a request closed
 * automatically (AC11: Withdrawn by the organiser, or Closed when the event was
 * cancelled) shows why and has no actions; an approved
 * request lists the arrangements to re-check (AC9) and whether the safety check
 * was reset (AC8).
 */
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import type { ChangeRequest, ChangeRequestApproval } from "@/types";
import { formatFieldValue } from "@/utils/planning";
import { formatSgtDateTime } from "@/utils/sgtDate";
import { STATUS_CLASSES, STATUS_LABELS, changeFieldLabel } from "@/features/events/lib/changeRequests";
import { ChangeRequestReview } from "@/features/events/pages/change-requests/ChangeRequestReview";
import { RecheckList } from "@/features/events/pages/change-requests/RecheckList";

/** SPM-65: the assigned coordinator's review callbacks. */
export interface ReviewHandlers {
  onApproved: (result: ChangeRequestApproval) => void;
  onDenied: (request: ChangeRequest) => void;
  onRechecked: (request: ChangeRequest) => void;
  onStale: () => void;
}

interface Props {
  requests: ChangeRequest[];
  /** Present only for the owning organiser. */
  onWithdraw?: (request: ChangeRequest) => Promise<unknown>;
  /** Present only for the assigned coordinator. */
  review?: ReviewHandlers;
}

export function ChangeRequestStatus({ request }: { request: ChangeRequest }) {
  return (
    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_CLASSES[request.status]}`}>
      {STATUS_LABELS[request.status]}
    </span>
  );
}

/** SPM-65 AC2: list fields show what is added (+) and removed (−); other values are shown in full. */
function listDiff(original: unknown, proposed: unknown): string[] | null {
  if (!Array.isArray(original) || !Array.isArray(proposed)) return null;
  return [
    ...proposed.filter((value) => !original.includes(value)).map((value) => `+ ${String(value)}`),
    ...original.filter((value) => !proposed.includes(value)).map((value) => `− ${String(value)}`),
  ];
}

/** SPM-64 AC5 / SPM-65 AC2: each requested field with its value when requested and the requested value. */
export function RequestedChangesTable({ request }: { request: ChangeRequest }) {
  return (
    <table className="mt-3 w-full text-left">
      <thead className="text-xs text-gray-500 dark:text-gray-400">
        <tr>
          <th className="py-1 pr-3 font-medium">Detail</th>
          <th className="py-1 pr-3 font-medium">When requested</th>
          <th className="py-1 font-medium">Requested</th>
        </tr>
      </thead>
      <tbody>
        {request.changes.map((change) => {
          const diff = listDiff(change.originalValue, change.proposedValue);
          return (
            <tr key={change.field} className="border-t border-gray-100 align-top dark:border-gray-800">
              <th scope="row" className="py-1 pr-3 font-medium text-gray-700 dark:text-gray-300">
                {changeFieldLabel(change.field)}
              </th>
              <td className="py-1 pr-3 text-gray-600 dark:text-gray-400">{formatFieldValue(change.field, change.originalValue)}</td>
              <td className="py-1 text-gray-900 dark:text-gray-100">
                {diff && diff.length ? (
                  <ul aria-label={`${changeFieldLabel(change.field)} changes`}>
                    {diff.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                ) : (
                  formatFieldValue(change.field, change.proposedValue)
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function RequestCard({ request, onWithdraw, review }: { request: ChangeRequest } & Pick<Props, "onWithdraw" | "review">) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const headingId = `change-request-${request.id}`;

  async function withdraw() {
    setBusy(true);
    setError("");
    try {
      await onWithdraw!(request);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not withdraw this change request.");
      setBusy(false);
    }
  }

  return (
    <article aria-labelledby={headingId} className="rounded-lg border border-gray-200 p-4 text-sm dark:border-gray-700">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h3 id={headingId} className="font-medium text-gray-900 dark:text-gray-100">
          Requested by {request.requestedBy} on {formatSgtDateTime(request.createdAt)}
        </h3>
        <ChangeRequestStatus request={request} />
      </header>

      <RequestedChangesTable request={request} />

      {request.reason && <p className="mt-2 text-gray-600 dark:text-gray-400">Reason: “{request.reason}”</p>}
      {request.status === "Pending" && request.requiresSafetyCheck && (
        <p className="mt-2 text-xs text-warning-800 dark:text-warning-300">
          If approved, the event will need a new safety check before it can be confirmed.
        </p>
      )}
      {request.status !== "Pending" && request.decidedAt && (
        <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
          {STATUS_LABELS[request.status]} by {request.decidedBy} on {formatSgtDateTime(request.decidedAt)}
        </p>
      )}
      {request.status === "Denied" && request.decisionReason && (
        <p className="mt-1 text-gray-700 dark:text-gray-300">Coordinator’s reason: “{request.decisionReason}”</p>
      )}
      {request.status === "Closed" && request.decisionReason && (
        <p className="mt-1 text-gray-700 dark:text-gray-300">{request.decisionReason}</p>
      )}
      {request.status === "Approved" && request.safetyCheckReset && (
        <p className="mt-1 text-xs text-warning-800 dark:text-warning-300">
          The event’s safety check was reset and must be requested again.
        </p>
      )}
      {request.status === "Approved" && <RecheckList request={request} onRechecked={review?.onRechecked} />}
      {review && request.status === "Pending" && (
        <ChangeRequestReview
          request={request}
          onApproved={review.onApproved}
          onDenied={review.onDenied}
          onStale={review.onStale}
        />
      )}

      {error && (
        <p role="alert" className="mt-2 text-danger-600 dark:text-danger-400">
          {error}
        </p>
      )}
      {onWithdraw && request.status === "Pending" && (
        <div className="mt-3">
          <Button size="sm" variant="secondary" disabled={busy} onClick={() => void withdraw()}>
            Withdraw Request
          </Button>
        </div>
      )}
    </article>
  );
}

export function ChangeRequestList({ requests, onWithdraw, review }: Props) {
  if (!requests.length)
    return <p className="text-sm text-gray-500 dark:text-gray-400">No change requests for this event.</p>;
  return (
    <div className="space-y-3">
      {requests.map((request) => (
        <RequestCard key={request.id} request={request} onWithdraw={onWithdraw} review={review} />
      ))}
    </div>
  );
}
