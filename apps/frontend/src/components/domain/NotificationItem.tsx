import { Link } from "react-router-dom";
import clsx from "clsx";
import type { Notification } from "@/types";
import { timeAgo } from "@/utils/format";

const iconByType: Record<Notification["type"], string> = {
  submission: "📤",
  clarification: "❓",
  approval: "✅",
  rejection: "❌",
  coordinator_assignment: "🧑‍💼",
  venue_booking: "🏛️",
  event_change: "✏️",
  registration: "🎟️",
  confirmation: "🎉",
  cancellation: "🚫",
};

export function NotificationItem({
  notification,
  onRead,
}: {
  notification: Notification;
  onRead: (id: string) => void;
}) {
  const rowClasses = clsx(
    "flex w-full items-start gap-3 rounded-lg border px-4 py-3 text-left transition-colors hover:border-primary-200 dark:hover:border-primary-700",
    notification.read ? "border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-800" : "border-primary-200 dark:border-primary-800 bg-primary-50 dark:bg-primary-900/30"
  );

  const inner = (
    <>
      <span aria-hidden="true" className="text-lg">
        {iconByType[notification.type]}
      </span>
      <div className="flex-1">
        <p className={clsx("text-sm", notification.read ? "text-gray-600 dark:text-gray-400" : "font-medium text-gray-900 dark:text-gray-100")}>
          {notification.message}
        </p>
        <p className="mt-0.5 text-xs text-gray-400 dark:text-gray-500">{timeAgo(notification.createdAt)}</p>
      </div>
      {!notification.read && (
        <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-primary-600" aria-label="Unread" />
      )}
    </>
  );

  if (notification.relatedEventId) {
    return (
      <Link
        to={`/events/${notification.relatedEventId}`}
        onClick={() => onRead(notification.id)}
        className={rowClasses}
      >
        {inner}
      </Link>
    );
  }

  return (
    <button onClick={() => onRead(notification.id)} className={rowClasses}>
      {inner}
    </button>
  );
}
