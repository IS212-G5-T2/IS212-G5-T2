/*
 * SPM-136 AC2: the cancelling user must confirm before the cancellation takes effect. An accessible modal:
 * initial focus on "Keep event", Escape / Keep event / a click outside close it with no request, Tab stays
 * inside, and "Confirm cancellation" is disabled and busy while the request is pending. Wording is MSG-CN-01
 * and MSG-CN-02.
 */
import { useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { cancelEvent } from "@/features/events/pages/detail/cancel/cancelEvent";

interface CancelEventDialogProps {
  eventId: string;
  eventName: string;
  onClose: () => void;
  /** Called with the server's MSG-CN-02 text after the event is cancelled. */
  onCancelled: (message: string) => void;
  /** Stable element that receives focus when the dialog closes, since the opener may have gone (CQ F2). */
  returnFocus?: () => HTMLElement | null | undefined;
}

const FALLBACK_ERROR = "Could not cancel the event.";

export function CancelEventDialog({ eventId, eventName, onClose, onCancelled, returnFocus }: CancelEventDialogProps) {
  const titleId = useId();
  const descriptionId = useId();
  // The first button is the safe choice (Keep event, or Close after success); it takes initial focus.
  const firstButtonRef = useRef<HTMLButtonElement>(null);
  const [pending, setPending] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  useEffect(() => {
    firstButtonRef.current?.focus();
  }, []);

  // After success the confirm button is removed; move focus to the remaining Close button instead of the body.
  useEffect(() => {
    if (successMessage) firstButtonRef.current?.focus();
  }, [successMessage]);

  // However the dialog closes (Keep event, Escape, backdrop, Close), return focus to a stable element.
  const returnFocusRef = useRef(returnFocus);
  useEffect(() => {
    returnFocusRef.current = returnFocus;
  });
  useEffect(() => {
    return () => {
      returnFocusRef.current?.()?.focus();
    };
  }, []);

  const dismiss = () => {
    if (!pending) onClose();
  };

  const handleConfirm = async () => {
    // The confirm button is disabled while a request is pending, so this cannot be entered twice.
    setPending(true);
    setErrorMessage("");
    try {
      const result = await cancelEvent(eventId);
      setSuccessMessage(result.message);
      onCancelled(result.message);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : FALLBACK_ERROR);
    } finally {
      setPending(false);
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      dismiss();
      return;
    }
    if (event.key !== "Tab") return;
    // Keep Tab and Shift+Tab inside the dialog, using the buttons that are enabled right now (one before success, Close after).
    // A keydown reaches this handler only from a focused, enabled button inside the dialog, so the list is never empty here.
    const focusable = Array.from(event.currentTarget.querySelectorAll<HTMLElement>("button:not(:disabled)"));
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <div
      data-testid="cancel-event-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/50 p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) dismiss();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        onKeyDown={handleKeyDown}
        className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl dark:bg-gray-900"
      >
        <h2 id={titleId} className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          {`Cancel ${eventName}?`}
        </h2>
        <p id={descriptionId} className="mt-2 text-sm text-gray-600 dark:text-gray-400">
          Venue bookings and equipment will be released and attendees notified. This cannot be undone.
        </p>
        {errorMessage && (
          <p role="alert" className="mt-4 rounded-lg border border-danger-300 bg-danger-50 px-4 py-3 text-sm text-danger-900 dark:border-danger-700 dark:bg-danger-900/20 dark:text-danger-300">
            {errorMessage}
          </p>
        )}
        {successMessage && (
          <p role="status" className="mt-4 text-sm text-success-900 dark:text-success-300">
            {successMessage}
          </p>
        )}
        <div className="mt-6 flex justify-end gap-3">
          {successMessage ? (
            // After success the dialog stays open so the MSG-CN-02 line is seen; only Close remains.
            <Button ref={firstButtonRef} variant="secondary" onClick={onClose}>
              Close
            </Button>
          ) : (
            <>
              <Button ref={firstButtonRef} variant="secondary" onClick={dismiss} disabled={pending}>
                Keep event
              </Button>
              <Button variant="danger" onClick={handleConfirm} disabled={pending} aria-busy={pending}>
                Confirm cancellation
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
