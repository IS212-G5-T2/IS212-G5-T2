/*
 * SPM-153 Mark as Completed. A bottom-right action for the assigned coordinator on a Confirmed event. The button stays
 * disabled, with the reason, until the event's end instant; a timer enables it at that instant without a reload (BR10).
 * The server still decides: a too-early or repeated request is refused and its message is shown. Once the event is
 * Completed, a line states it for everyone who views the event.
 */
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { ApiError } from "@/utils/api";
import { completeEvent, hasEventEnded } from "@/utils/completion";

/** setTimeout cannot wait longer than this; a later end instant is reached by re-arming the timer. */
const MAX_TIMER_MS = 2_147_483_647;
const TOO_EARLY = "An event can only be marked as Completed after its event date has passed.";
const COMPLETED = "This event has been marked as completed.";

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
  const [completedHere, setCompletedHere] = useState(false);
  const [pending, setPending] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const showAction = isAssignedCoordinator && status === "confirmed" && !completedHere;
  const enabled = ended && !refusedAsTooEarly;

  useEffect(() => {
    if (!showAction || ended || refusedAsTooEarly) return;
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
  }, [showAction, ended, refusedAsTooEarly, endDateTime]);

  if (status === "completed" || completedHere)
    return (
      <p role="status" className="ml-auto text-sm font-medium text-success-900 dark:text-success-300">
        {COMPLETED}
      </p>
    );
  if (!showAction) return null;

  const handleComplete = async () => {
    if (pending) return;
    setPending(true);
    setErrorMessage("");
    try {
      await completeEvent(eventId);
      setCompletedHere(true);
      onCompleted();
    } catch (error) {
      // The too-early refusal is shown by the standing reason, so it is not repeated as an alert.
      if (error instanceof ApiError && error.code === "EVENT_NOT_ENDED") setRefusedAsTooEarly(true);
      else setErrorMessage(error instanceof Error ? error.message : "Could not mark the event as Completed.");
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="ml-auto flex max-w-md flex-col items-end gap-2 text-right">
      {errorMessage && (
        <p role="alert" className="text-sm text-danger-900 dark:text-danger-300">
          {errorMessage}
        </p>
      )}
      {!enabled && <p className="text-sm font-medium text-warning-800 dark:text-warning-300">{TOO_EARLY}</p>}
      <Button onClick={handleComplete} disabled={pending || !enabled} aria-busy={pending}>
        Mark as Completed
      </Button>
    </div>
  );
}
