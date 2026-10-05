import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/Button";

interface ConfirmationProps {
  eventName: string;
  /** True while the withdrawal request is in flight. */
  pending: boolean;
  /** A failure to show inside the dialog (announced as an alert); empty when none. */
  error: string;
  onConfirm: () => void;
  onCancel: () => void;
}

const FOCUSABLE = "button:not([disabled])";

/**
 * SPM-120 AC2/AC3: the confirmation prompt shown before a withdrawal. It is mounted
 * only while open. A modal dialog with the event name in its title, the consequences
 * in its body, and Confirm / Cancel. Initial focus is on Cancel, the least destructive
 * choice, so a held or repeated Enter from the Withdraw button cannot confirm at once.
 * Tab and Shift+Tab stay inside it, Escape cancels, and a click on the backdrop is
 * ignored (assumption F12). While the request is pending both buttons are disabled
 * and Escape does nothing. Focus returns to whatever opened it when it closes.
 */
export function WithdrawalConfirmation({ eventName, pending, error, onConfirm, onCancel }: ConfirmationProps) {
  const titleId = useId();
  const bodyId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  // Move focus in on open and put it back on the opener on close.
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    cancelRef.current?.focus();
    return () => opener?.focus();
  }, []);

  // Keep focus inside the dialog while a request is pending and the buttons are disabled.
  useEffect(() => {
    if (pending) panelRef.current?.focus();
  }, [pending]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const panel = panelRef.current;
      if (!panel) return;
      if (event.key === "Escape") {
        if (!pending) onCancel();
        return;
      }
      if (event.key !== "Tab") return;
      // The trap: wrap at the ends and pull focus back in if it ever left the dialog.
      const items = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (items.length === 0) {
        event.preventDefault();
        panel.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (!panel.contains(active)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [pending, onCancel]);

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/50 p-4" role="presentation">
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={bodyId}
        tabIndex={-1}
        className="w-full max-w-md rounded-xl bg-white shadow-xl outline-none dark:bg-gray-800"
      >
        <div className="px-5 py-4">
          <h2 id={titleId} className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Withdraw from {eventName}?
          </h2>
          <div id={bodyId} className="mt-3 space-y-2 text-sm text-gray-700 dark:text-gray-300">
            <p>This will free up a spot for other attendees.</p>
            <p>You can re-register if the registration period is open.</p>
          </div>
          {error && (
            <p role="alert" className="mt-3 text-sm text-danger-700 dark:text-danger-300">
              <span aria-hidden="true">⚠ </span>
              {error}
            </p>
          )}
        </div>
        <div className="flex justify-end gap-2 border-t border-gray-100 px-5 py-4 dark:border-gray-700">
          <Button ref={cancelRef} variant="secondary" disabled={pending} onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="danger" disabled={pending} aria-busy={pending} onClick={onConfirm}>
            Confirm Withdrawal
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

interface BannerProps {
  message: string;
  onDismiss: () => void;
}

/**
 * SPM-120 AC7: the on-screen confirmation after a successful withdrawal. A success
 * (not error) variant that stays until dismissed, with no timer, and is announced
 * politely to assistive technology. It carries no timestamp: that sits in the status area.
 */
export function WithdrawalSuccessBanner({ message, onDismiss }: BannerProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="Withdrawal confirmation"
      data-variant="success"
      className="rounded-lg border border-success-300 bg-success-50 px-4 py-3 text-sm text-success-900 dark:border-success-700 dark:bg-success-900/20 dark:text-success-300"
    >
      <p className="font-medium">
        <span aria-hidden="true">✓ </span>
        <span>{message}</span>
      </p>
      <Button variant="ghost" size="sm" className="mt-2" onClick={onDismiss}>
        Dismiss
      </Button>
    </div>
  );
}
