import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/Button";
import { useAppStore } from "@/store/useAppStore";
import { hasRole, type Notification } from "@/types";
import { api } from "@/utils/api";

// SPM-47 AC10: tells the Event Coordinator Lead when a coordinator with active
// events becomes unavailable, with a link to the reassignment page. Refreshes on
// sign-in, window focus and periodically, like the coordinator's panel.
export function LeadNotifications() {
  const user = useAppStore((s) => s.currentUser);
  const isLead = hasRole(user, "coordinator_lead");
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isLead) return;
    let active = true;
    let pending = false;
    const refresh = async () => {
      if (pending) return;
      pending = true;
      try {
        const data = await api<Notification[]>("/notifications");
        if (active) {
          setNotifications(data.filter((n) => n.type === "coordinator_unavailable"));
          setError("");
        }
      } catch {
        if (active) setError("Could not load coordinator availability notices.");
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
  }, [user.id, isLead]);

  const markRead = async (id: string) => {
    try {
      await api(`/notifications/${id}/read`, { method: "POST" });
      setNotifications((items) => items.map((item) => (item.id === id ? { ...item, read: true } : item)));
      setError("");
    } catch {
      setError("Could not mark the notification as read. Please try again.");
    }
  };

  const unread = notifications.filter((n) => !n.read);
  if (!isLead || (!unread.length && !error)) return null;

  return (
    <section
      aria-label="Coordinator availability"
      className="mb-6 rounded-xl border border-warning-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800"
    >
      <h2 className="font-semibold text-gray-900 dark:text-gray-100">Coordinator availability</h2>
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
              <Link to="/lead/reassign" className="font-medium text-primary-700 hover:underline">
                Review assigned events
              </Link>
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
