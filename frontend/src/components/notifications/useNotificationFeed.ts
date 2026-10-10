import { useEffect, useState } from "react";
import type { Notification } from "@/types";
import { api } from "@/utils/api";

const REFRESH_INTERVAL_MS = 30_000;
const MARK_READ_ERROR = "Could not mark the notification as read. Please try again.";

/** Shared loading and read state for the app's role-specific notification panels. */
export function useNotificationFeed({
  enabled,
  userId,
  loadError,
  filter,
}: {
  enabled: boolean;
  userId: string;
  loadError: string;
  filter?: (notification: Notification) => boolean;
}) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    let pending = false;
    const refresh = async () => {
      if (pending) return;
      pending = true;
      try {
        const data = await api<Notification[]>("/notifications");
        if (active) {
          setNotifications(filter ? data.filter(filter) : data);
          setError("");
        }
      } catch {
        if (active) setError(loadError);
      } finally {
        pending = false;
      }
    };
    void refresh();
    const interval = window.setInterval(() => {
      void refresh();
    }, REFRESH_INTERVAL_MS);
    window.addEventListener("focus", refresh);
    return () => {
      active = false;
      window.clearInterval(interval);
      window.removeEventListener("focus", refresh);
    };
  }, [enabled, userId, loadError, filter, retry]);

  const markRead = async (id: string) => {
    try {
      await api(`/notifications/${id}/read`, { method: "POST" });
      setNotifications((items) => items.map((item) => (item.id === id ? { ...item, read: true } : item)));
      setError("");
    } catch {
      setError(MARK_READ_ERROR);
    }
  };

  return { notifications, error, markRead, retry: () => setRetry((value) => value + 1) };
}
