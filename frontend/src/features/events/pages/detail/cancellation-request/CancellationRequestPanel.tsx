/*
 * SPM-155 AC1 and AC2, Organiser side: the owning Organiser asks for the event to be cancelled and follows the
 * request (Pending, Accepted, Declined, or Closed when the event ended first). The newest request is current and
 * earlier ones stay listed. Reasons are rendered as text only (React escapes them). The server decides everything;
 * this panel only shows the action where it can succeed.
 */
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";
import { TextArea } from "@/components/ui/FormControls";
import { submitCancellationRequest } from "@/features/events/api/cancellation-requests-api";
import { REASON_MAX, canRequestCancellation, codePointLength, statusLabelFor } from "@/features/events/lib/cancellationRequests";
import { useCancellationRequests } from "@/features/events/pages/detail/cancellation-request/useCancellationRequests";
import type { CancellationRequest } from "@/features/events/types/cancellationRequest";
import type { EventRecord } from "@/types";
import { formatSingaporeDateTime } from "@/utils/format";

const REASON_ERROR = `Use ${REASON_MAX} characters or fewer.`;

interface Props {
  event: EventRecord;
  currentUser: { id: string; role: string };
}

function RequestDetails({ request }: { request: CancellationRequest }) {
  return (
    <>
      <p className="text-sm text-gray-700 dark:text-gray-300">{`Requested ${formatSingaporeDateTime(request.requestedAt)}`}</p>
      {request.closedNote && <p className="text-sm text-gray-700 dark:text-gray-300">{request.closedNote}</p>}
      {request.decidedAt && request.decidedBy && (
        <p className="text-sm text-gray-700 dark:text-gray-300">{`Decided by ${request.decidedBy} on ${formatSingaporeDateTime(request.decidedAt)}`}</p>
      )}
      {request.reason && <p className="whitespace-pre-wrap text-sm text-gray-900 dark:text-gray-100">{request.reason}</p>}
    </>
  );
}

export function CancellationRequestPanel({ event, currentUser }: Props) {
  const isOwner = currentUser.role === "organiser" && event.organiserId === currentUser.id;
  const { requests, loaded, error, reload } = useCancellationRequests(event.id, isOwner);
  const [formOpen, setFormOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [sending, setSending] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [message, setMessage] = useState("");

  if (!isOwner) return null;
  const [current, ...earlier] = requests;
  // The action waits for the first load, so a pending request is never offered a second one for a moment.
  const canRequest = loaded && canRequestCancellation({ event, currentUser }) && current?.displayStatus !== "pending";
  // Nothing to show: no request, nothing to ask, nothing failed.
  if (loaded && !current && !canRequest && !error && !message) return null;

  const overLimit = codePointLength(reason) > REASON_MAX;

  // Send request is disabled while sending and while the reason is over the limit, so neither can be submitted twice or too long.
  const send = async () => {
    setSending(true);
    setSubmitError("");
    try {
      const result = await submitCancellationRequest(event.id, reason);
      setMessage(result.message);
      setFormOpen(false);
      setReason("");
      await reload();
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : "Could not send the cancellation request.");
    } finally {
      setSending(false);
    }
  };

  return (
    <section aria-label="Cancellation request" className="mb-6">
      <Card>
        <CardBody>
          <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Cancellation request</h2>
          {error && (
            <p role="alert" className="mt-2 text-sm text-danger-900 dark:text-danger-300">
              {error}
            </p>
          )}
          {message && (
            <p role="status" className="mt-2 text-sm text-success-900 dark:text-success-300">
              {message}
            </p>
          )}
          {current && (
            <div className="mt-2 space-y-1">
              <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{`Status: ${statusLabelFor(current.displayStatus)}`}</p>
              <RequestDetails request={current} />
            </div>
          )}
          {earlier.length > 0 && (
            <div className="mt-3">
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Earlier requests</h3>
              <ul aria-label="Earlier requests" className="mt-1 space-y-2">
                {earlier.map((request) => (
                  <li key={request.id} className="rounded-md border border-gray-200 p-2 dark:border-gray-700">
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{statusLabelFor(request.displayStatus)}</p>
                    <RequestDetails request={request} />
                  </li>
                ))}
              </ul>
            </div>
          )}
          {canRequest && !formOpen && (
            <div className="mt-3">
              <Button variant="secondary" onClick={() => setFormOpen(true)}>
                Request Cancellation
              </Button>
            </div>
          )}
          {canRequest && formOpen && (
            <form
              className="mt-3 space-y-2"
              onSubmit={(submitEvent) => {
                submitEvent.preventDefault();
                void send();
              }}
            >
              <TextArea label="Reason (optional)" value={reason} onChange={(e) => setReason(e.target.value)} error={overLimit ? REASON_ERROR : undefined} />
              <p className="text-xs text-gray-500 dark:text-gray-400">{`${codePointLength(reason)}/${REASON_MAX}`}</p>
              {submitError && (
                <p role="alert" className="text-sm text-danger-900 dark:text-danger-300">
                  {submitError}
                </p>
              )}
              <div className="flex gap-2">
                <Button type="submit" disabled={sending || overLimit} aria-busy={sending}>
                  Send request
                </Button>
                <Button type="button" variant="secondary" disabled={sending} onClick={() => setFormOpen(false)}>
                  Close
                </Button>
              </div>
            </form>
          )}
        </CardBody>
      </Card>
    </section>
  );
}
