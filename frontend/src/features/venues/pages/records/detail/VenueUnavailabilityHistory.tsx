import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { api } from "@/utils/api";
import { formatSingaporeDateTime, formatSingaporeRange } from "@/utils/format";

/** SPM-125 AC1: one entry of `GET /api/venues/:id/unavailability-history`, newest first. */
export interface VenueUnavailabilityHistoryEntry {
  id: string;
  periodId: string;
  action: "created" | "ended_early";
  start: string;
  end: string;
  /** Only for an early end: the end the period had before. */
  previousEnd?: string;
  reason: string;
  /** Null for periods saved before the history recorded who made the change. */
  changedBy: string | null;
  changedAt: string;
}

const ACTION_LABEL: Record<VenueUnavailabilityHistoryEntry["action"], string> = {
  created: "Marked unavailable",
  ended_early: "Ended early",
};

/**
 * SPM-125 AC1: the venue's unavailability history for Venue Staff: each time a period was created or ended early,
 * with the period, its reason, who made the change and when. Read only; reloads when `refreshKey` changes (after a
 * period is saved or ended on the same page).
 */
export function VenueUnavailabilityHistory({ venueId, refreshKey }: { venueId: string; refreshKey: number }) {
  const [entries, setEntries] = useState<VenueUnavailabilityHistoryEntry[]>();
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  // Loaded only once Venue Staff open it, so the venue page does not read the whole history on every visit.
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    // Ignore a response that arrives after the venue changed or the card unmounted.
    let current = true;
    setError("");
    api<VenueUnavailabilityHistoryEntry[]>(`/venues/${encodeURIComponent(venueId)}/unavailability-history`)
      .then((rows) => {
        if (current) setEntries(rows);
      })
      .catch(() => {
        if (current) setError("Unable to load the unavailability history.");
      });
    return () => {
      current = false;
    };
  }, [open, venueId, refreshKey, retry]);

  const toggle = (
    <Button variant="secondary" size="sm" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
      {open ? "Hide unavailability history" : "Show unavailability history"}
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
    if (!entries) return <p role="status" className="text-sm">Loading the unavailability history…</p>;
    if (!entries.length)
      return <p className="text-sm text-gray-600 dark:text-gray-300">No unavailable periods have been recorded for this venue.</p>;
    return (
      <ol aria-label="Unavailability history" className="space-y-3">
        {entries.map((entry) => (
          <li key={entry.id} className="rounded-lg border border-gray-200 p-4 text-sm dark:border-gray-700">
            <span
              className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${entry.action === "created" ? "bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-200" : "bg-green-50 text-green-800 dark:bg-green-950 dark:text-green-200"}`}
            >
              {ACTION_LABEL[entry.action]}
            </span>
            <p className="mt-2 font-semibold">{formatSingaporeRange(entry.start, entry.end)}</p>
            {entry.previousEnd && (
              <p className="text-gray-600 dark:text-gray-300">Was due to end {formatSingaporeDateTime(entry.previousEnd)}</p>
            )}
            <p className="break-words text-gray-600 dark:text-gray-300">Reason: {entry.reason}</p>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              By {entry.changedBy ?? "Not recorded"} ·{" "}
              <time dateTime={entry.changedAt}>{formatSingaporeDateTime(entry.changedAt)}</time>
            </p>
          </li>
        ))}
      </ol>
    );
  }
}
