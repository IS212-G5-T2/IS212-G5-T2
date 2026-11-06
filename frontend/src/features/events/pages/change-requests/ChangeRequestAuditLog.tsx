/*
 * SPM-65 AC10 — the event's change request audit log, newest first: every outcome (approved,
 * denied, withdrawn, closed) with the requested changes, who requested and decided it, when, and
 * the reason. Read-only; shown to the owning organiser and the assigned coordinator.
 */
import { useEffect, useState } from "react";
import type { ChangeRequestAuditEntry } from "@/types";
import { formatSgtDateTime } from "@/utils/sgtDate";
import { fetchChangeRequestAudit } from "@/features/events/api/change-requests-api";
import { changeFieldLabel } from "@/features/events/lib/changeRequests";

export function ChangeRequestAuditLog({ eventId, refreshKey = 0 }: { eventId: string; refreshKey?: number }) {
  const [entries, setEntries] = useState<ChangeRequestAuditEntry[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    setError("");
    fetchChangeRequestAudit(eventId)
      .then((loaded) => {
        if (active) setEntries(loaded);
      })
      .catch((e: unknown) => {
        if (active) setError(e instanceof Error ? e.message : "Could not load the audit log.");
      });
    return () => {
      active = false;
    };
  }, [eventId, refreshKey]);

  if (error)
    return (
      <p role="alert" className="text-sm text-danger-600 dark:text-danger-400">
        {error}
      </p>
    );
  if (!entries) return <p role="status">Loading audit log…</p>;
  if (!entries.length) return <p className="text-sm text-gray-500 dark:text-gray-400">No decisions recorded yet.</p>;
  return (
    <ol className="space-y-2 text-sm">
      {entries.map((entry) => (
        <li key={entry.id} className="rounded-md border border-gray-200 px-3 py-2 dark:border-gray-700">
          <p className="font-medium text-gray-900 dark:text-gray-100">
            {entry.outcome} by {entry.decidedBy} on {formatSgtDateTime(entry.decidedAt)}
          </p>
          <p className="text-gray-600 dark:text-gray-400">
            Requested by {entry.requestedBy}: {entry.changes.map((change) => changeFieldLabel(change.field)).join(", ")}
          </p>
          {entry.reason && <p className="text-gray-700 dark:text-gray-300">Reason: “{entry.reason}”</p>}
        </li>
      ))}
    </ol>
  );
}
