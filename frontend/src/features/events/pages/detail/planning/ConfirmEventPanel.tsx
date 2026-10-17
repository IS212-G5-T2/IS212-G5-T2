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
import { PLANNING_REFRESH_MS } from "@/utils/planning";
import {
  confirmEvent,
  fetchArrangementsStatus,
  type OutstandingArrangement,
  type OutstandingType,
} from "@/utils/arrangements";

/** The prerequisite named in a "Pending ..." bullet above a greyed-out Confirm button. */
const REASON: Record<OutstandingType, string> = {
  venue: "venue booking",
  equipment: "equipment request",
  safety: "safety check",
};

interface ConfirmEventPanelProps {
  eventId: string;
  /** Lower-case status as the page holds it. */
  status: string;
  isAssignedCoordinator: boolean;
  onConfirmed: () => void;
  /** Changes when the planning state changes (for example a safety check reset); re-reads the list. */
  refreshKey?: string;
}

export function ConfirmEventPanel({ eventId, status, isAssignedCoordinator, onConfirmed, refreshKey }: ConfirmEventPanelProps) {
  const [outstanding, setOutstanding] = useState<OutstandingArrangement[]>([]);
  // Confirm stays disabled until the readiness answer has loaded and nothing is outstanding.
  const [loaded, setLoaded] = useState(false);
  const [pending, setPending] = useState(false);
  const [blockedMessage, setBlockedMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const planning = status === "planning";
  const visible = isAssignedCoordinator && (planning || successMessage !== "");

  useEffect(() => {
    if (!isAssignedCoordinator || !planning) return;
    let cancelled = false;
    const load = () =>
      fetchArrangementsStatus(eventId)
        .then((view) => {
          if (!cancelled) {
            setOutstanding(view.outstanding);
            setLoaded(true);
          }
        })
        .catch(() => undefined);
    load();
    const timer = setInterval(() => {
      if (typeof document === "undefined" || document.visibilityState !== "hidden") load();
    }, PLANNING_REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [eventId, isAssignedCoordinator, planning, refreshKey]);

  if (!visible) return null;

  // A safety check cannot be requested until venue and equipment are confirmed, so while either is
  // pending the safety check counts as pending too. It is also listed when it is the only thing left.
  const pendingTypes = new Set(outstanding.map((item) => item.type));
  if (pendingTypes.has("venue") || pendingTypes.has("equipment")) pendingTypes.add("safety");
  const reasons = (["venue", "equipment", "safety"] as OutstandingType[])
    .filter((type) => pendingTypes.has(type))
    .map((type) => REASON[type]);

  const refreshOutstanding = async () => {
    try {
      const view = await fetchArrangementsStatus(eventId);
      setOutstanding(view.outstanding);
      setLoaded(true);
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
        <h2 className="font-semibold text-gray-900 dark:text-gray-100">Confirm Event</h2>
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
            {reasons.length > 0 && (
              <ul aria-label="Pending" className="list-disc space-y-1 pl-5 text-sm font-medium text-warning-800 dark:text-warning-300">
                {reasons.map((reason) => (
                  <li key={reason}>Pending {reason}</li>
                ))}
              </ul>
            )}
            <Button onClick={handleConfirm} disabled={pending || !loaded || reasons.length > 0} aria-busy={pending}>
              Confirm Event
            </Button>
          </>
        )}
      </CardBody>
    </Card>
  );
}
