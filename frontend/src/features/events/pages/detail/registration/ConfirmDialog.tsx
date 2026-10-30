import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/Button";

/** withdraw: give up a registration. leave-waitlist: leave the waitlist, which also withdraws the registration. */
export type ConfirmVariant = "withdraw" | "leave-waitlist";

interface ConfirmDialogProps {
  variant: ConfirmVariant;
  /** Leave-waitlist only: the place in line that is given up (the warning box states it). */
  position?: number | null;
  /** Withdraw only: registration has closed, so withdrawing ends the chance to register again (the warning box says so). */
  registrationClosed?: boolean;
  /** True while the withdrawal request is in flight. */
  pending: boolean;
  /** A failure to show inside the dialog (announced as an alert); empty when none. The dialog stays open. */
  error: string;
  onConfirm: () => void;
  onCancel: () => void;
}

const FOCUSABLE = "button:not([disabled])";

const COPY: Record<ConfirmVariant, { title: string; body: string; safe: string; danger: string }> = {
  withdraw: {
    title: "Withdraw your registration?",
    body: "You'll give up your spot for this event.",
    safe: "Keep registration",
    danger: "Withdraw",
  },
  "leave-waitlist": {
    title: "Leave the waitlist?",
    body: "Leaving the waitlist also withdraws your registration for this event. You'll lose your place in line.",
    safe: "Keep my place",
    danger: "Leave waitlist",
  },
};

/** The warning box for leave-waitlist: it names the place given up and says it cannot be restored. */
const placeWarning = (position: number | null | undefined) =>
  position == null
    ? "Once you leave, it can't be restored."
    : `Your place is #${position} in line. Once you leave, it can't be restored.`;

/**
 * SPM-120 / SPM-138 confirmation before a withdrawal, evolved from the earlier withdrawal prompt. A modal dialog that is
 * mounted only while open. The safe option has the initial focus, so a held or repeated Enter from the opening button
 * cannot confirm at once. Tab and Shift+Tab stay inside it; Escape cancels; a click on the backdrop is ignored. While the
 * request is pending both buttons are disabled, the danger button shows a loading state, and Escape does nothing. Focus
 * returns to whatever opened the dialog when it closes.
 */
export function ConfirmDialog({ variant, position, registrationClosed = false, pending, error, onConfirm, onCancel }: ConfirmDialogProps) {
  const titleId = useId();
  const bodyId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const safeRef = useRef<HTMLButtonElement>(null);
  const copy = COPY[variant];

  // Move focus in on open and put it back on the opener on close.
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    safeRef.current?.focus();
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4" role="presentation">
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={bodyId}
        tabIndex={-1}
        className="w-full max-w-[480px] rounded-xl border-[0.5px] border-gray-200 bg-white p-6 shadow-xl outline-none dark:border-gray-700 dark:bg-gray-800"
      >
        <div className="flex items-start gap-3">
          <AlertTriangleIcon className="mt-0.5 h-5 w-5 shrink-0 text-danger-600 dark:text-danger-400" />
          <div className="min-w-0">
            <h2 id={titleId} className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              {copy.title}
            </h2>
            <div id={bodyId} className="mt-2 space-y-3 text-sm text-gray-700 dark:text-gray-300">
              <p>{copy.body}</p>
              {variant === "leave-waitlist" && (
                <p className="rounded-lg bg-danger-50 px-3 py-2 text-danger-700 dark:bg-danger-900/30 dark:text-danger-300">
                  {placeWarning(position)}
                </p>
              )}
              {variant === "withdraw" && registrationClosed && (
                <p className="rounded-lg bg-danger-50 px-3 py-2 text-danger-700 dark:bg-danger-900/30 dark:text-danger-300">
                  Registration has closed, and you will no longer be able to register again for the event.
                </p>
              )}
            </div>
          </div>
        </div>
        {error && (
          <p role="alert" className="mt-4 text-sm text-danger-700 dark:text-danger-300">
            <span aria-hidden="true">⚠ </span>
            {error}
          </p>
        )}
        <div className="mt-6 flex justify-end gap-2">
          <Button ref={safeRef} variant="secondary" disabled={pending} onClick={onCancel}>
            {copy.safe}
          </Button>
          <Button variant="danger" disabled={pending} aria-busy={pending} onClick={onConfirm}>
            {pending && <Spinner />}
            {copy.danger}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function Spinner() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 animate-spin" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.3" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

function AlertTriangleIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
    </svg>
  );
}
