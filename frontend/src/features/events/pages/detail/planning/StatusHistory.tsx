/*
 * SPM-148 AC4: the event's status history, shown in Singapore time.
 * Reads GET /events/:id/status-history (assigned coordinator and owning organiser).
 */
import { useEffect, useState } from "react";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { api } from "@/utils/api";
import { sgtDateTimeParts } from "@/utils/sgtDate";

interface StatusHistoryEntry {
  fromStatus: string;
  toStatus: string;
  changedAt: string;
  changedBy: { id: string; name: string };
}

/** e.g. "15 Oct 2026 12:00 SGT" */
function formatSgt(value: string): string {
  const { date, time } = sgtDateTimeParts(value);
  return `${date} ${time} SGT`;
}

export function StatusHistory({ eventId }: { eventId: string }) {
  const [entries, setEntries] = useState<StatusHistoryEntry[]>([]);

  useEffect(() => {
    let cancelled = false;
    api<StatusHistoryEntry[]>(`/events/${encodeURIComponent(eventId)}/status-history`)
      .then((result) => {
        if (!cancelled && Array.isArray(result)) setEntries(result);
      })
      .catch(() => {
        // The history is supplementary; the page works without it.
      });
    return () => {
      cancelled = true;
    };
  }, [eventId]);

  if (entries.length === 0) return null;

  return (
    <Card className="mb-6">
      <CardHeader>
        <h2 className="font-semibold text-gray-900 dark:text-gray-100">Status History</h2>
      </CardHeader>
      <CardBody>
        <ul className="space-y-2 text-sm text-gray-800 dark:text-gray-200">
          {entries.map((entry) => (
            <li key={`${entry.changedAt}-${entry.toStatus}`}>
              {entry.fromStatus} to {entry.toStatus}, {formatSgt(entry.changedAt)}, by {entry.changedBy.name}
            </li>
          ))}
        </ul>
      </CardBody>
    </Card>
  );
}
