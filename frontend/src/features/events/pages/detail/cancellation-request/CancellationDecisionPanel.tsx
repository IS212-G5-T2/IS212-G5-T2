/*
 * SPM-155 AC3 to AC5, Coordinator side: the Coordinator assigned to the event sees the newest cancellation request
 * and accepts or declines it (F1/F2/F7). Accept opens CancelEventDialog (cancelling releases bookings and notifies
 * attendees), and the dialog confirms through the request's decision route. Decline decides at once and changes
 * nothing else. Reasons are rendered as text only. The server stays authoritative (assignment, decided, closed).
 */
import { useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";
import { decideCancellationRequest } from "@/features/events/api/cancellation-requests-api";
import { canDecideCancellation, statusLabelFor } from "@/features/events/lib/cancellationRequests";
import { CancelEventDialog } from "@/features/events/pages/detail/cancel/CancelEventDialog";
import { useCancellationRequests } from "@/features/events/pages/detail/cancellation-request/useCancellationRequests";
import type { EventRecord } from "@/types";
import { formatSingaporeDateTime } from "@/utils/format";

interface Props {
  event: EventRecord;
  currentUser: { id: string; role: string };
  /** Called after the request is accepted and the event is cancelled, so the page can show the new status. */
  onAccepted: () => void;
}

export function CancellationDecisionPanel({ event, currentUser, onAccepted }: Props) {
  const assigned = canDecideCancellation({ event, currentUser });
  const { requests, loaded, error, reload } = useCancellationRequests(event.id, assigned);
  const [showDialog, setShowDialog] = useState(false);
  const [busy, setBusy] = useState(false);
  const [decisionError, setDecisionError] = useState("");
  const [message, setMessage] = useState("");
  const acceptRef = useRef<HTMLButtonElement>(null);

  if (!assigned) return null;
  const [current] = requests;
  if (loaded && !current && !error && !message) return null;

  // Both buttons are disabled while a decision is in flight, so a second click cannot send a second decision.
  const decline = async (requestId: string) => {
    setBusy(true);
    setDecisionError("");
    try {
      const result = await decideCancellationRequest(requestId, "decline");
      setMessage(result.message);
    } catch (e) {
      setDecisionError(e instanceof Error ? e.message : "Could not decline the cancellation request.");
    } finally {
      setBusy(false);
    }
    // Success or a lost race: either way the server's current status is what the Coordinator reads next.
    await reload();
  };

  const accept = async (requestId: string) => {
    const result = await decideCancellationRequest(requestId, "accept");
    return { message: result.message };
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
          {decisionError && (
            <p role="alert" className="mt-2 text-sm text-danger-900 dark:text-danger-300">
              {decisionError}
            </p>
          )}
          {current && (
            <div className="mt-2 space-y-1">
              <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{`Status: ${statusLabelFor(current.displayStatus)}`}</p>
              <p className="text-sm text-gray-700 dark:text-gray-300">{`Requested by ${current.requestedBy} on ${formatSingaporeDateTime(current.requestedAt)}`}</p>
              {current.closedNote && <p className="text-sm text-gray-700 dark:text-gray-300">{current.closedNote}</p>}
              {current.decidedAt && current.decidedBy && (
                <p className="text-sm text-gray-700 dark:text-gray-300">{`Decided by ${current.decidedBy} on ${formatSingaporeDateTime(current.decidedAt)}`}</p>
              )}
              {current.reason && <p className="whitespace-pre-wrap text-sm text-gray-900 dark:text-gray-100">{current.reason}</p>}
            </div>
          )}
          {current?.displayStatus === "pending" && (
            <div className="mt-3 flex gap-2">
              <Button ref={acceptRef} variant="danger" disabled={busy} onClick={() => setShowDialog(true)}>
                Accept
              </Button>
              <Button variant="secondary" disabled={busy} aria-busy={busy} onClick={() => void decline(current.id)}>
                Decline
              </Button>
            </div>
          )}
        </CardBody>
      </Card>
      {showDialog && current && (
        <CancelEventDialog
          eventId={event.id}
          eventName={event.name}
          confirm={() => accept(current.id)}
          onClose={() => {
            setShowDialog(false);
            void reload();
          }}
          returnFocus={() => acceptRef.current}
          onCancelled={(text) => {
            setMessage(text);
            onAccepted();
          }}
        />
      )}
    </section>
  );
}
