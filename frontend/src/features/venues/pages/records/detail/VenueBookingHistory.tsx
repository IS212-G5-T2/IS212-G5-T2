import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { api } from "@/utils/api";
import { formatSingaporeDateTime, formatSingaporeRange } from "@/utils/format";
import { bookingHistoryStatus, type VenueBookingHistoryEntry } from "./bookingHistory";

/**
 * SPM-125 AC5: the venue's booking history for Venue Staff: every booking and tentative hold, past and future, of
 * every status, so bookings stay visible after the venue is marked unavailable or made available again. Reloads
 * when `refreshKey` changes.
 */
export function VenueBookingHistory({ venueId, refreshKey }: { venueId: string; refreshKey: number }) {
  const [entries, setEntries] = useState<VenueBookingHistoryEntry[]>();
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  // Loaded only once Venue Staff open it, so the venue page does not read the whole history on every visit.
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    // Ignore a response that arrives after the venue changed or the card unmounted.
    let current = true;
    setError("");
    api<VenueBookingHistoryEntry[]>(`/venues/${encodeURIComponent(venueId)}/booking-history`)
      .then((rows) => {
        if (current) setEntries(rows);
      })
      .catch(() => {
        if (current) setError("Unable to load the booking history.");
      });
    return () => {
      current = false;
    };
  }, [open, venueId, refreshKey, retry]);

  const toggle = (
    <Button variant="secondary" size="sm" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
      {open ? "Hide booking history" : "Show booking history"}
    </Button>
  );
  if (!open) return toggle;
  return (
    <div className="space-y-3">
      {toggle}
      {renderBody()}
    </div>
  );

  function renderBody() {
    if (error)
      return (
        <div role="alert" className="flex flex-wrap items-center gap-3 text-sm text-red-800 dark:text-red-200">
          <p>{error}</p>
          <Button variant="secondary" size="sm" onClick={() => setRetry((value) => value + 1)}>
            Retry
          </Button>
        </div>
      );
    if (!entries) return <p role="status" className="text-sm">Loading the booking history…</p>;
    if (!entries.length)
      return <p className="text-sm text-gray-600 dark:text-gray-300">No bookings or tentative holds have been made at this venue.</p>;
    const now = Date.now();
    return (
      <ul aria-label="Booking history" className="space-y-3">
        {entries.map((entry) => (
          <li key={entry.id} className="rounded-lg border border-gray-200 p-4 text-sm dark:border-gray-700">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="break-words font-semibold">{entry.eventName}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Reference {entry.bookingReference} · {entry.requestKind === "tentative_hold" ? "Tentative hold" : "Booking"}
                </p>
              </div>
              <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-700 dark:bg-gray-700 dark:text-gray-200">
                {bookingHistoryStatus(entry, now)}
              </span>
            </div>
            <p className="mt-2">{formatSingaporeRange(entry.start, entry.end)}</p>
            <p className="text-gray-600 dark:text-gray-300">Coordinator: {entry.coordinatorName ?? "Not assigned"}</p>
            {entry.requestKind === "tentative_hold" && entry.status === "approved" && entry.holdExpiresAt && (
              <p className="text-gray-600 dark:text-gray-300">Hold expires {formatSingaporeDateTime(entry.holdExpiresAt)}</p>
            )}
            {entry.affectedByUnavailablePeriod && (
              <p className="mt-1 text-danger-700 dark:text-danger-300">Overlaps an unavailable period</p>
            )}
          </li>
        ))}
      </ul>
    );
  }
}
