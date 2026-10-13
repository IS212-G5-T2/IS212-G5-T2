/*
 * SPM-135 Confirm an Event (coordinator). Rendered only for the assigned
 * coordinator on a Planning event (D13). Too-early clicks show the outstanding
 * list from the server (AC3); success is announced in a status region and the
 * badge is updated from the response through onConfirmed (AC4).
 */
import { useEffect, useState } from "react";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { ApiError } from "@/utils/api";
import {
  confirmEvent,
  fetchArrangementsStatus,
  outstandingText,
  type OutstandingArrangement,
} from "@/utils/arrangements";

interface ConfirmEventPanelProps {
  eventId: string;
  /** Lower-case status as the page holds it. */
  status: string;
  isAssignedCoordinator: boolean;
  onConfirmed: () => void;
}

export function ConfirmEventPanel({ eventId, status, isAssignedCoordinator, onConfirmed }: ConfirmEventPanelProps) {
  const [outstanding, setOutstanding] = useState<OutstandingArrangement[]>([]);
  const [pending, setPending] = useState(false);
  const [blockedMessage, setBlockedMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const planning = status === "planning";
  const visible = isAssignedCoordinator && (planning || successMessage !== "");

  useEffect(() => {
    if (!isAssignedCoordinator || !planning) return;
    let cancelled = false;
    fetchArrangementsStatus(eventId)
      .then((view) => {
        if (!cancelled) setOutstanding(view.outstanding);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [eventId, isAssignedCoordinator, planning]);

  if (!visible) return null;

  const refreshOutstanding = async () => {
    try {
      const view = await fetchArrangementsStatus(eventId);
      setOutstanding(view.outstanding);
    } catch {
      // The button still reports the server's answer; the list is best effort.
    }
  };

  const handleConfirm = async () => {
    if (pending) return;
    setPending(true);
    setBlockedMessage("");
    setErrorMessage("");
    try {
      const result = await confirmEvent(eventId);
      setSuccessMessage(result.message);
      setOutstanding([]);
      onConfirmed();
    } catch (error) {
      if (error instanceof ApiError && error.code === "CONFIRM_BLOCKED") {
        setBlockedMessage(error.message);
        await refreshOutstanding();
      } else {
        setErrorMessage(error instanceof Error ? error.message : "Could not confirm the event.");
      }
    } finally {
      setPending(false);
    }
  };

  return (
    <Card className="mb-6">
      <CardHeader>
        <h2 className="font-semibold text-gray-900 dark:text-gray-100">Confirm event</h2>
      </CardHeader>
      <CardBody className="space-y-4">
        {successMessage ? (
          <p role="status" className="text-sm text-success-900 dark:text-success-300">
            {successMessage}
          </p>
        ) : (
          <>
            {blockedMessage && (
              <div role="alert" className="rounded-lg border border-danger-300 dark:border-danger-700 bg-danger-50 dark:bg-danger-900/20 px-4 py-3 text-sm text-danger-900 dark:text-danger-300">
                <p>{blockedMessage}</p>
              </div>
            )}
            {errorMessage && (
              <div role="alert" className="rounded-lg border border-danger-300 dark:border-danger-700 bg-danger-50 dark:bg-danger-900/20 px-4 py-3 text-sm text-danger-900 dark:text-danger-300">
                {errorMessage}
              </div>
            )}
            {outstanding.length > 0 && (
              <ul aria-label="Outstanding arrangements" className="list-disc space-y-1 pl-5 text-sm text-gray-800 dark:text-gray-200">
                {outstanding.map((item) => (
                  <li key={`${item.type}-${item.label}-${item.detail}`}>{outstandingText(item)}</li>
                ))}
              </ul>
            )}
            <Button onClick={handleConfirm} disabled={pending} aria-busy={pending}>
              Confirm Event
            </Button>
          </>
        )}
      </CardBody>
    </Card>
  );
}
