/*
 * SPM-153 Mark as Completed (assigned coordinator, Confirmed events). The button stays disabled, with the reason,
 * until the event's end instant; a timer enables it at that instant without a reload (BR10). The server still
 * decides: a too-early or repeated request is refused and its message is shown.
 */
import { useEffect, useState } from "react";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { ApiError } from "@/utils/api";
import { completeEvent, hasEventEnded } from "@/utils/completion";

/** setTimeout cannot wait longer than this; a later end instant is reached by re-arming the timer. */
const MAX_TIMER_MS = 2_147_483_647;
const TOO_EARLY = "An event can only be marked as Completed after its event date has passed.";

interface CompleteEventPanelProps {
  eventId: string;
  /** Lower-case status as the page holds it. */
  status: string;
  /** The event's end instant (ISO 8601). */
  endDateTime: string;
  isAssignedCoordinator: boolean;
  onCompleted: () => void;
}

export function CompleteEventPanel({ eventId, status, endDateTime, isAssignedCoordinator, onCompleted }: CompleteEventPanelProps) {
  const [ended, setEnded] = useState(() => hasEventEnded(endDateTime));
  // The server refused the completion as too early: its answer wins over the client clock until the page reloads.
  const [refusedAsTooEarly, setRefusedAsTooEarly] = useState(false);
  const [pending, setPending] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const visible = isAssignedCoordinator && (status === "confirmed" || successMessage !== "");

  useEffect(() => {
    if (!visible || ended || refusedAsTooEarly) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const arm = () => {
      const remaining = Date.parse(endDateTime) - Date.now();
      if (remaining <= 0) {
        setEnded(true);
        return;
      }
      timer = setTimeout(arm, Math.min(remaining, MAX_TIMER_MS));
    };
    arm();
    return () => clearTimeout(timer);
  }, [visible, ended, refusedAsTooEarly, endDateTime]);

  const enabled = ended && !refusedAsTooEarly;

  if (!visible) return null;

  const handleComplete = async () => {
    if (pending) return;
    setPending(true);
    setErrorMessage("");
    try {
      const result = await completeEvent(eventId);
      setSuccessMessage(result.message);
      onCompleted();
    } catch (error) {
      if (error instanceof ApiError && error.code === "EVENT_NOT_ENDED") setRefusedAsTooEarly(true);
      setErrorMessage(error instanceof Error ? error.message : "Could not mark the event as Completed.");
    } finally {
      setPending(false);
    }
  };

  return (
    <Card className="mb-6">
      <CardHeader>
        <h2 className="font-semibold text-gray-900 dark:text-gray-100">Mark as Completed</h2>
      </CardHeader>
      <CardBody className="space-y-4">
        {successMessage ? (
          <p role="status" className="text-sm text-success-900 dark:text-success-300">
            {successMessage}
          </p>
        ) : (
          <>
            {errorMessage && (
              <div role="alert" className="rounded-lg border border-danger-300 dark:border-danger-700 bg-danger-50 dark:bg-danger-900/20 px-4 py-3 text-sm text-danger-900 dark:text-danger-300">
                {errorMessage}
              </div>
            )}
            {!enabled && (
              <p className="text-sm font-medium text-warning-800 dark:text-warning-300">{TOO_EARLY}</p>
            )}
            <Button onClick={handleComplete} disabled={pending || !enabled} aria-busy={pending}>
              Mark as Completed
            </Button>
          </>
        )}
      </CardBody>
    </Card>
  );
}
