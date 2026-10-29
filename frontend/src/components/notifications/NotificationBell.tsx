import { useEffect, useId, useRef, useState } from "react";
import { useNotificationFeed } from "@/components/notifications/useNotificationFeed";
import { NotificationRow } from "@/components/notifications/NotificationRow";
import { useAppStore } from "@/store/useAppStore";
import { Button } from "@/components/ui/Button";

const BADGE_CAP = 9;

/**
 * Top-bar notification bell (SPM-88, SC-SPM88-10). Organisers only for now: it lists their unread request
 * decisions in a dropdown; other roles get nothing until later tickets add their notification types.
 */
export function NotificationBell() {
  const user = useAppStore((s) => s.currentUser);
  const isOrganiser = user.role === "organiser";
  const { notifications, error, markRead, retry } = useNotificationFeed({
    enabled: isOrganiser,
    userId: user.id,
    loadError: "Could not load request decisions.",
  });
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const bellRef = useRef<HTMLButtonElement>(null);
  const headingId = useId();

  // Esc closes the dropdown and returns focus to the bell; a click outside closes it without moving focus,
  // so focus stays wherever the user clicked. While closed, no document listener is attached.
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      bellRef.current?.focus();
    };
    const onOutsideClick = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("click", onOutsideClick);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("click", onOutsideClick);
    };
  }, [open]);

  if (!isOrganiser) return null;
  // Only unread notifications are listed, newest first.
  const unread = notifications
    .filter((n) => !n.read)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const count = unread.length;

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={bellRef}
        type="button"
        aria-label={count > 0 ? `Notifications, ${count} unread` : "Notifications"}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((v) => !v)}
        className="relative rounded-md p-2 text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700"
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M10 21h4" strokeLinecap="round" />
        </svg>
        {count > 0 && (
          <span
            aria-hidden="true"
            className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger-600 px-1 text-[10px] font-semibold leading-none text-white"
          >
            {count > BADGE_CAP ? `${BADGE_CAP}+` : count}
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-labelledby={headingId}
          className="fixed inset-x-2 top-[4.5rem] z-30 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-800 sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-2 sm:w-96"
        >
          <h2 id={headingId} className="border-b border-gray-100 px-4 py-3 font-semibold text-gray-900 dark:border-gray-700 dark:text-gray-100">
            Notifications
          </h2>
          {error && (
            <p
              role="alert"
              className="flex flex-wrap items-center gap-2 border-b border-danger-100 bg-danger-50 px-4 py-2 text-sm text-danger-700 dark:border-danger-900/40 dark:bg-danger-900/20 dark:text-danger-300"
            >
              {error}
              <Button variant="ghost" size="sm" onClick={retry}>
                Retry
              </Button>
            </p>
          )}
          {count === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-gray-500 dark:text-gray-400">You&apos;re all caught up</p>
          ) : (
            // Every unread notification is listed; the capped, focusable area keeps the dropdown short and keyboard reachable.
            <ul
              tabIndex={0}
              aria-label="Unread notifications"
              className="max-h-96 divide-y divide-gray-100 overflow-y-auto dark:divide-gray-700"
            >
              {unread.map((n) => (
                <NotificationRow
                  key={n.id}
                  notification={n}
                  onMarkRead={(id) => void markRead(id)}
                  onOpen={() => setOpen(false)}
                />
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
