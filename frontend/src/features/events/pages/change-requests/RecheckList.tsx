/*
 * SPM-65 AC9 — after approval, the venue bookings and equipment reservations the change affects.
 * The assigned coordinator ticks each one off once re-checked (agreed); everyone else sees the list
 * read-only.
 */
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import type { ChangeRequest, RecheckItem } from "@/types";
import { formatSgtDateTime } from "@/utils/sgtDate";
import { markArrangementRechecked } from "@/features/events/api/change-requests-api";

interface Props {
  request: ChangeRequest;
  /** Present only for the assigned coordinator. */
  onRechecked?: (request: ChangeRequest) => void;
}

function RecheckRow({ request, item, onRechecked }: Props & { item: RecheckItem }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function mark() {
    setBusy(true);
    setError("");
    try {
      onRechecked!(await markArrangementRechecked(request.eventId, request.id, item.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not mark this arrangement as re-checked.");
      setBusy(false);
    }
  }

  return (
    <li className="flex items-start justify-between gap-3 border-t border-gray-100 py-2 first:border-t-0 dark:border-gray-800">
      <div className="min-w-0 flex-1">
        <p className="font-medium text-gray-900 dark:text-gray-100">
          {item.kind === "venue" ? "Venue booking" : "Equipment"}: {item.name}
        </p>
        <ul className="ml-4 list-disc text-gray-700 dark:text-gray-300">
          {item.details.map((detail) => (
            <li key={detail}>{detail}</li>
          ))}
        </ul>
        {error && (
          <p role="alert" className="text-danger-600 dark:text-danger-400">
            {error}
          </p>
        )}
      </div>
      {item.checkedAt ? (
        <span className="shrink-0 text-xs text-success-800 dark:text-success-300">
          Re-checked by {item.checkedBy} on {formatSgtDateTime(item.checkedAt)}
        </span>
      ) : onRechecked ? (
        <Button size="sm" variant="secondary" className="shrink-0" disabled={busy} onClick={() => void mark()}>
          Mark As Re-checked
        </Button>
      ) : (
        <span className="shrink-0 text-xs text-warning-800 dark:text-warning-300">Awaiting re-check</span>
      )}
    </li>
  );
}

export function RecheckList({ request, onRechecked }: Props) {
  if (!request.recheck.length) return null;
  const remaining = request.recheck.filter((item) => !item.checkedAt).length;
  return (
    <section aria-label="Arrangements to re-check" className="mt-3 rounded-md border border-warning-200 p-3 dark:border-warning-800">
      <h4 className="font-medium text-gray-900 dark:text-gray-100">Arrangements to re-check</h4>
      <p className="text-xs text-gray-500 dark:text-gray-400">
        {remaining ? `${remaining} of ${request.recheck.length} still to re-check.` : "All arrangements are up to date."}
      </p>
      <ul className="mt-1">
        {request.recheck.map((item) => (
          <RecheckRow key={item.id} request={request} item={item} onRechecked={onRechecked} />
        ))}
      </ul>
    </section>
  );
}
