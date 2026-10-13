/*
 * SPM-135 AC5: the Organiser who submitted a Confirmed event sees its confirmed
 * arrangements. Reads the allowlist endpoint only; never the raw event row.
 */
import { useEffect, useState } from "react";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { fetchConfirmedArrangements, type ConfirmedArrangements } from "@/utils/arrangements";
import { sgtDateTimeParts } from "@/utils/sgtDate";

/** Slot shown in Singapore time (SPM-135 05-B), e.g. "5 Nov 2026 10:00 to 12:00 SGT". */
function formatSgtSlot(start: string, end: string): string {
  const from = sgtDateTimeParts(start);
  const to = sgtDateTimeParts(end);
  return `${from.date} ${from.time} to ${to.time} SGT`;
}

export function ConfirmedArrangementsPanel({ eventId }: { eventId: string }) {
  const [view, setView] = useState<ConfirmedArrangements | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetchConfirmedArrangements(eventId)
      .then((result) => {
        if (!cancelled) setView(result);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Could not load confirmed arrangements.");
      });
    return () => {
      cancelled = true;
    };
  }, [eventId]);

  if (error) {
    return (
      <div role="alert" className="mb-4 rounded-lg border border-danger-300 dark:border-danger-700 bg-danger-50 dark:bg-danger-900/20 px-4 py-3 text-sm text-danger-900 dark:text-danger-300">
        {error}
      </div>
    );
  }
  if (!view) return null;

  return (
    <Card className="mb-6">
      <CardHeader>
        <h2 className="font-semibold text-gray-900 dark:text-gray-100">Confirmed Arrangements</h2>
      </CardHeader>
      <CardBody className="space-y-3 text-sm text-gray-800 dark:text-gray-200">
        <div>
          <h3 className="font-medium">Venue</h3>
          <ul className="list-disc pl-5">
            {view.venueBookings.map((booking) => (
              <li key={`${booking.venueName}-${booking.start}`}>
                {booking.venueName}: {formatSgtSlot(booking.start, booking.end)} ({booking.status})
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h3 className="font-medium">Equipment</h3>
          <ul className="list-disc pl-5">
            {view.equipment.map((line) => (
              <li key={line.name}>
                {line.name} x{line.quantity} ({line.status})
              </li>
            ))}
          </ul>
        </div>
        <p>
          <span className="font-medium">Safety Officer approval:</span> {view.safety.state}
        </p>
      </CardBody>
    </Card>
  );
}
