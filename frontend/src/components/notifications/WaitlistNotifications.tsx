import { Link } from "react-router-dom";
import { useNotificationFeed } from "@/components/notifications/useNotificationFeed";
import { useAppStore } from "@/store/useAppStore";
import type { Notification } from "@/types";
import { Button } from "@/components/ui/Button";

/** SPM-138 AC9/AC12: the attendee's own waiting list notices. Other notification types are not shown here. */
const WAITING_LIST_TYPES: Notification["type"][] = ["WaitlistPromoted", "EventCancelled"];
const isWaitingListNotice = (notification: Notification) => WAITING_LIST_TYPES.includes(notification.type);

/**
 * Shows an attendee's unread waiting list notices (a promotion to a place, or a cancellation) with a link to the event.
 * It uses the shared feed, so it refreshes on sign-in, focus and periodically like the organiser's panel. The server
 * filters by recipient and type; this only renders what it returns.
 */
export function WaitlistNotifications() {
  const user = useAppStore((s) => s.currentUser);
  const { notifications, error, markRead, retry } = useNotificationFeed({
    enabled: user.role === "attendee",
    userId: user.id,
    loadError: "Could not load waiting list notices.",
    filter: isWaitingListNotice,
  });

  if (user.role !== "attendee") return null;
  const unread = notifications.filter((n) => !n.read);
  if (!unread.length && !error) return null;

  return (
    <section
      aria-label="Waiting list notifications"
      className="mb-6 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800"
    >
      {error && (
        <p role="alert" className="flex flex-wrap items-center gap-2 px-4 py-2 text-sm text-danger-700 dark:text-danger-300">
          {error}
          <Button variant="ghost" size="sm" onClick={retry}>
            Retry
          </Button>
        </p>
      )}
      <ul className="divide-y divide-gray-100 dark:divide-gray-700">
        {unread.map((n) => (
          <li key={n.id} className="flex flex-wrap items-center gap-4 px-4 py-3">
            <p className="min-w-0 flex-1 break-words text-sm text-gray-800 dark:text-gray-100">{n.message}</p>
            <div className="flex items-center gap-4 text-sm">
              {n.relatedEventId && (
                <Link
                  className="font-medium text-primary-700 underline-offset-2 hover:underline dark:text-primary-300"
                  to={`/events/${n.relatedEventId}`}
                >
                  View Event
                </Link>
              )}
              <button
                type="button"
                className="text-gray-500 underline-offset-2 hover:text-gray-700 hover:underline dark:text-gray-400 dark:hover:text-gray-200"
                onClick={() => void markRead(n.id)}
              >
                Mark As Read
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
