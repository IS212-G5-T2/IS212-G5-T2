import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/utils/api";
import { useAppStore } from "@/store/useAppStore";
import { formatDateTime, timeAgo } from "@/utils/format";
import { hasRole, type Notification } from "@/types";
import { Button } from "@/components/ui/Button";

// SPM-123 AC2: tells a coordinator a new event request has been assigned to
// them and is awaiting their review. Refreshes on sign-in, window focus and
// periodically for coordinators already online. Read notifications drop away,
// so the banner is only ever about work that still needs attention.
export function AssignmentNotifications() {
  const user = useAppStore((s) => s.currentUser);
  const isCoordinator = hasRole(user, "coordinator");
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    if (!isCoordinator) return;
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
        if (active) setError("Could not load assignment notifications.");
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
  }, [user.id, isCoordinator, retry]);

  if (!isCoordinator) return null;
  const unread = notifications.filter((n) => !n.read);
  if (!unread.length && !error) return null;

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

  return (
    <section
      aria-label="Assignment notifications"
      className="mb-6 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800"
    >
      <header className="border-b border-gray-100 px-4 py-3 dark:border-gray-700">
        <h2 className="font-semibold text-gray-900 dark:text-gray-100" aria-live="polite">
          New assigned requests
        </h2>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          <span className="font-medium text-primary-700 dark:text-primary-300">
            {unread.length} awaiting your review
          </span>
        </p>
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

      <ul className="divide-y divide-gray-100 dark:divide-gray-700">
        {unread.map((n) => (
          <li
            key={n.id}
            className="border-l-2 border-primary-400 bg-primary-50/50 px-4 py-3 dark:border-primary-500 dark:bg-primary-900/10"
          >
            <p className="break-words text-sm text-gray-800 dark:text-gray-100">{n.message}</p>
            <div className="mt-1 text-xs text-gray-400 dark:text-gray-500">
              <time dateTime={n.createdAt} title={formatDateTime(n.createdAt)}>
                {timeAgo(n.createdAt)}
              </time>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-4 text-sm">
              <Link
                className="font-medium text-primary-700 underline-offset-2 hover:underline dark:text-primary-300"
                to={`/events/${n.relatedEventId}`}
              >
                View request
              </Link>
              <button
                type="button"
                className="text-gray-500 underline-offset-2 hover:text-gray-700 hover:underline dark:text-gray-400 dark:hover:text-gray-200"
                onClick={() => void markRead(n.id)}
              >
                Mark as read
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
