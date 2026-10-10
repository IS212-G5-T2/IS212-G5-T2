import { Link } from "react-router-dom";
import { Button } from "@/components/ui/Button";
import { useNotificationFeed } from "@/components/notifications/useNotificationFeed";
import { useAppStore } from "@/store/useAppStore";
import { hasRole, type Notification } from "@/types";

// An unassignment has no link: the event now belongs to another coordinator.
const COORDINATOR_TYPES: Notification["type"][] = ["coordinator_assignment", "coordinator_reassignment", "coordinator_unassignment"];
const isCoordinatorNotice = (notification: Notification) => COORDINATOR_TYPES.includes(notification.type);

// SPM-123 AC9: tells a coordinator which requests the Event Coordinator Lead
// has assigned to them; SPM-47 AC8: and which events were reassigned to or away from them. Shown on the coordinator's events page. Refreshes on
// sign-in, window focus and periodically, like RejectionNotifications, so an
// assignment made while the coordinator is online still appears.
export function AssignmentNotifications() {
  const user = useAppStore((s) => s.currentUser);
  const isCoordinator = hasRole(user, "coordinator");
  const { notifications, error, markRead } = useNotificationFeed({
    enabled: isCoordinator,
    userId: user.id,
    loadError: "Could not load your new assignments.",
    filter: isCoordinatorNotice,
  });

  const unread = notifications.filter((n) => !n.read);
  if (!isCoordinator || (!unread.length && !error)) return null;

  return (
    <section
      aria-label="Assignment updates"
      className="mb-6 rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800"
    >
      <h2 className="font-semibold text-gray-900 dark:text-gray-100">Assignment updates</h2>
      {error && (
        <p role="alert" className="mt-2 text-sm text-danger-700 dark:text-danger-300">
          {error}
        </p>
      )}
      <ul className="mt-2 divide-y divide-gray-100 dark:divide-gray-700">
        {unread.map((notification) => (
          <li key={notification.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
            <span className="text-gray-800 dark:text-gray-200">{notification.message}</span>
            <span className="flex items-center gap-3">
              {notification.relatedEventId && notification.type !== "coordinator_unassignment" && (
                <Link to={`/events/${notification.relatedEventId}`} className="font-medium text-primary-700 hover:underline">
                  View request
                </Link>
              )}
              <Button variant="ghost" size="sm" onClick={() => void markRead(notification.id)}>
                Mark as read
              </Button>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
