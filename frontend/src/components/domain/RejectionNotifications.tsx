import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/utils/api";
import { useAppStore } from "@/store/useAppStore";
import { formatDateTime, timeAgo } from "@/utils/format";
import type { Notification } from "@/types";
import { Button } from "@/components/ui/Button";

// Rejections carry a reason in one combined backend message. Split that reason
// into its own block; approval messages remain intact as a confirmation line.
function splitRejectionMessage(message: string): { headline: string; reason: string | null } {
  const marker = " was rejected: ";
  const idx = message.indexOf(marker);
  if (idx === -1) return { headline: message, reason: null };
  return {
    headline: `${message.slice(0, idx)} was rejected`,
    reason: message.slice(idx + marker.length),
  };
}

// Refresh on sign-in, window focus and periodically for organisers already online.
export function RejectionNotifications() {
  const user = useAppStore((s) => s.currentUser);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [expanded, setExpanded] = useState(false);
  useEffect(() => {
    if (user.role !== "organiser") return;
    let active = true;
    let pending = false;
    const refresh = async () => {
      if (pending) return;
      pending = true;
      try {
        const data = await api<Notification[]>("/notifications");
        if (active) {
          setNotifications(data);
          setError("");
        }
      } catch {
        if (active) setError("Could not load request decisions.");
      } finally {
        pending = false;
      }
    };
    void refresh();
    const interval = window.setInterval(() => {
      void refresh();
    }, 30000);
    window.addEventListener("focus", refresh);
    return () => {
      active = false;
      window.clearInterval(interval);
      window.removeEventListener("focus", refresh);
    };
  }, [user.id, user.role, retry]);

  if (user.role !== "organiser") return null;
  const unread = notifications.filter((n) => !n.read);
  if (!notifications.length && !error) return null;

  const markRead = async (id: string) => {
    try {
      await api(`/notifications/${id}/read`, { method: "POST" });
      setNotifications((items) =>
        items.map((item) => (item.id === id ? { ...item, read: true } : item)),
      );
      setError("");
    } catch {
      setError("Could not mark the notification as read. Please try again.");
    }
  };

  const visible = expanded ? notifications : unread;

  return (
    <section
      aria-label="Request decision notifications"
      className="mb-6 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800"
    >
      <header className="flex items-center justify-between gap-3 border-b border-gray-100 px-4 py-3 dark:border-gray-700">
        <div className="flex items-center gap-3">
          <span
            aria-hidden="true"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-100 text-primary-700 dark:bg-primary-900/40 dark:text-primary-300"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M10 21h4" strokeLinecap="round" />
            </svg>
          </span>
          <div>
            <h2 className="font-semibold text-gray-900 dark:text-gray-100" aria-live="polite">
              Request decisions
            </h2>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {unread.length > 0 ? (
                <>
                  <span className="font-medium text-danger-600 dark:text-danger-400">
                    {unread.length} new
                  </span>{" "}
                  · {notifications.length} total
                </>
              ) : (
                <>All caught up · {notifications.length} total</>
              )}
            </p>
          </div>
        </div>
        {notifications.length > 0 && (
          <Button variant="ghost" size="sm" onClick={() => setExpanded((v) => !v)}>
            {expanded ? "Show unread" : "Show all"}
          </Button>
        )}
      </header>

      {error && (
        <p
          role="alert"
          className="flex flex-wrap items-center gap-2 border-b border-danger-100 bg-danger-50 px-4 py-2 text-sm text-danger-700 dark:border-danger-900/40 dark:bg-danger-900/20 dark:text-danger-300"
        >
          {error}
          <Button variant="ghost" size="sm" onClick={() => setRetry((r) => r + 1)}>
            Retry
          </Button>
        </p>
      )}

      {visible.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-gray-500 dark:text-gray-400">
          No unread decisions. Choose “Show all” to review past decisions.
        </p>
      ) : (
        <ul className="divide-y divide-gray-100 dark:divide-gray-700">
          {visible.map((n) => {
            const { headline, reason } = splitRejectionMessage(n.message);
            const isApproval = n.type === "approval";
            return (
            <li
              key={n.id}
              className={`flex gap-3 px-4 py-3 ${
                n.read
                  ? ""
                  : isApproval
                    ? "border-l-2 border-success-400 bg-success-50/50 dark:border-success-500 dark:bg-success-900/10"
                    : "border-l-2 border-danger-400 bg-danger-50/50 dark:border-danger-500 dark:bg-danger-900/10"
              }`}
            >
              <span
                aria-hidden="true"
                className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                  n.read ? "bg-transparent" : isApproval ? "bg-success-500" : "bg-danger-500"
                }`}
              />
              <div className="min-w-0 flex-1">
                <p className="break-words text-sm text-gray-800 dark:text-gray-100">
                  {headline}
                </p>
                {reason && (
                  <pre className="mt-2 whitespace-pre-wrap break-words rounded-md border border-gray-200 bg-gray-50 px-3 py-2 font-mono text-xs text-gray-800 dark:border-gray-700 dark:bg-gray-900/60 dark:text-gray-200">
                    Reason: {reason}
                  </pre>
                )}
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-gray-400 dark:text-gray-500">
                  <time dateTime={n.createdAt} title={formatDateTime(n.createdAt)}>
                    {timeAgo(n.createdAt)}
                  </time>
                  {!n.read && (
                    <span className={`rounded-full px-2 py-0.5 font-medium ${
                      isApproval
                        ? "bg-success-100 text-success-700 dark:bg-success-900/40 dark:text-success-300"
                        : "bg-danger-100 text-danger-700 dark:bg-danger-900/40 dark:text-danger-300"
                    }`}>
                      New
                    </span>
                  )}
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-4 text-sm">
                  <Link
                    className="font-medium text-primary-700 underline-offset-2 hover:underline dark:text-primary-300"
                    to={`/events/${n.relatedEventId}`}
                  >
                    View request
                  </Link>
                  {!n.read && (
                    <button
                      type="button"
                      className="text-gray-500 underline-offset-2 hover:text-gray-700 hover:underline dark:text-gray-400 dark:hover:text-gray-200"
                      onClick={() => void markRead(n.id)}
                    >
                      Mark as read
                    </button>
                  )}
                </div>
              </div>
            </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
