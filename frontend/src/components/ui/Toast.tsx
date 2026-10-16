import { useEffect } from "react";

interface ToastProps {
  message: string;
  /** Called when the toast times out. Pass a stable callback: a new one restarts the timer. */
  onDismiss: () => void;
  /** How long the message stays before it dismisses itself. */
  durationMs?: number;
}

/**
 * A minimal status toast, announced politely and removed after `durationMs`. The repo had no shared toast (the equipment
 * page keeps its own banner, which does not time out), so this is the one shared version. It takes no focus.
 */
export function Toast({ message, onDismiss, durationMs = 5000 }: ToastProps) {
  useEffect(() => {
    const timer = window.setTimeout(onDismiss, durationMs);
    return () => window.clearTimeout(timer);
  }, [message, durationMs, onDismiss]);

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-lg border border-success-300 bg-success-50 px-4 py-3 text-sm font-medium text-success-900 shadow-lg dark:border-success-700 dark:bg-success-900/40 dark:text-success-300"
    >
      <span aria-hidden="true">✓ </span>
      {message}
    </div>
  );
}
