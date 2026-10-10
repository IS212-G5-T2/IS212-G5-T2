/*
 * SPM-85 — the assigned coordinator reviews and resolves flagged changes.
 *
 * Each pending change is an article named after its field showing the current
 * and proposed values (AC2), with whole-change "Confirm change" (AC4) and
 * "Reject change" (AC3) actions. Below that, one group per venue booking lists
 * its impacts, including setup/turnaround clashes (AC2, AC6). Impacted
 * bookings get their own "Confirm/Reject for this booking" actions that
 * resolve only that booking (AC7); a booking with no impact has no actions.
 *
 * Per-booking semantics (agreed interpretation of AC7, confirm with the team):
 * the server records each booking's decision independently and closes the
 * change once every impacted booking is decided — Applied if all confirmed,
 * Rejected otherwise. The change history (AC5) lists resolved changes.
 */
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import type { BookingImpact, ChangeHistoryEntry, FlaggedChange, ResolveChangeRequest } from "@/types";
import { formatDateTime } from "@/utils/format";
import { fieldLabel, formatFieldValue } from "@/utils/planning";

interface Props {
  changes: FlaggedChange[];
  history: ChangeHistoryEntry[];
  onResolve: (request: ResolveChangeRequest) => Promise<unknown>;
}

function BookingGroup({
  impact,
  busy,
  onDecide,
}: {
  impact: BookingImpact;
  busy: boolean;
  onDecide: (decision: "confirm" | "reject") => void;
}) {
  return (
    <div
      role="group"
      aria-label={impact.venueName}
      className="rounded-md border border-gray-200 px-3 py-2 dark:border-gray-700"
    >
      <p className="font-medium text-gray-800 dark:text-gray-200">{impact.venueName}</p>
      {impact.impacted ? (
        <ul className="mt-1 list-disc space-y-1 pl-5 text-gray-600 dark:text-gray-400">
          {impact.conflicts.map((conflict, index) => (
            <li key={`${conflict.kind}-${conflict.withBookingId ?? index}`}>{conflict.detail}</li>
          ))}
        </ul>
      ) : (
        <p className="mt-1 text-gray-500 dark:text-gray-400">No impact on this booking.</p>
      )}
      {impact.impacted && impact.decision && (
        <p className="mt-2 text-xs font-medium text-gray-700 dark:text-gray-300">
          {impact.decision === "Applied" ? "Confirmed" : "Rejected"} for this booking
          {impact.decidedBy ? ` by ${impact.decidedBy}` : ""}
        </p>
      )}
      {impact.impacted && !impact.decision && (
        <div className="mt-2 flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" disabled={busy} onClick={() => onDecide("confirm")}>
            Confirm for this booking
          </Button>
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => onDecide("reject")}>
            Reject for this booking
          </Button>
        </div>
      )}
    </div>
  );
}

function ChangeCard({
  change,
  busyKey,
  error,
  resolve,
}: {
  change: FlaggedChange;
  busyKey: string | null;
  error?: string;
  resolve: (request: ResolveChangeRequest) => void;
}) {
  const headingId = `flagged-change-${change.id}`;
  const label = fieldLabel(change.field);
  const impacts = change.impacts ?? [];
  const wholeBusy = busyKey === change.id;
  return (
    <article
      aria-labelledby={headingId}
      className="space-y-3 rounded-lg border border-warning-300 bg-warning-50/40 p-4 text-sm dark:border-warning-700 dark:bg-warning-900/10"
    >
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h3 id={headingId} className="font-semibold text-gray-900 dark:text-gray-100">
          {label}
        </h3>
        <span className="rounded-full bg-warning-100 px-2 py-0.5 text-xs font-medium text-warning-800 dark:bg-warning-900/30 dark:text-warning-300">
          {change.status}
        </span>
      </header>

      <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <dt className="text-gray-400 dark:text-gray-500">Current value</dt>
          <dd className="font-medium text-gray-800 dark:text-gray-200">
            {formatFieldValue(change.field, change.currentValue)}
          </dd>
        </div>
        <div>
          <dt className="text-gray-400 dark:text-gray-500">Proposed value</dt>
          <dd className="font-medium text-gray-800 dark:text-gray-200">
            {formatFieldValue(change.field, change.proposedValue)}
          </dd>
        </div>
      </dl>

      <div className="space-y-2">
        <h4 className="font-medium text-gray-800 dark:text-gray-200">Impacted bookings</h4>
        {impacts.length ? (
          impacts.map((impact) => (
            <BookingGroup
              key={impact.bookingId}
              impact={impact}
              busy={busyKey === `${change.id}:${impact.bookingId}` || wholeBusy}
              onDecide={(decision) => resolve({ changeId: change.id, decision, bookingId: impact.bookingId })}
            />
          ))
        ) : (
          <p className="text-gray-500 dark:text-gray-400">No venue bookings affected.</p>
        )}
      </div>

      {!!change.equipmentImpacts?.length && (
        <div>
          <h4 className="font-medium text-gray-800 dark:text-gray-200">Equipment arrangements to re-check</h4>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-gray-600 dark:text-gray-400">
            {change.equipmentImpacts.map((item) => (
              <li key={item.arrangementId}>
                {item.name} (Qty {item.quantity}): {item.detail}
              </li>
            ))}
          </ul>
        </div>
      )}

      {error && (
        <p role="alert" className="text-danger-600 dark:text-danger-400">
          {error}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <Button disabled={wholeBusy} onClick={() => resolve({ changeId: change.id, decision: "confirm" })}>
          Confirm change
        </Button>
        <Button variant="secondary" disabled={wholeBusy} onClick={() => resolve({ changeId: change.id, decision: "reject" })}>
          Reject change
        </Button>
      </div>
    </article>
  );
}

export function FlaggedChangeReview({ changes, history, onResolve }: Props) {
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  async function resolve(request: ResolveChangeRequest) {
    const key = request.bookingId ? `${request.changeId}:${request.bookingId}` : request.changeId;
    setBusyKey(key);
    setErrors((e) => ({ ...e, [request.changeId]: "" }));
    try {
      await onResolve(request);
    } catch (error) {
      setErrors((e) => ({
        ...e,
        [request.changeId]: error instanceof Error ? error.message : "Could not resolve this change.",
      }));
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        {changes.length ? (
          changes.map((change) => (
            <ChangeCard
              key={change.id}
              change={change}
              busyKey={busyKey}
              error={errors[change.id] || undefined}
              resolve={resolve}
            />
          ))
        ) : (
          <p className="text-sm text-gray-500 dark:text-gray-400">No changes are awaiting review.</p>
        )}
      </div>

      <div>
        <h3 className="mb-2 font-medium text-gray-900 dark:text-gray-100">Change history</h3>
        {history.length ? (
          <ul aria-label="Change history" className="space-y-2 text-sm">
            {history.map((entry) => (
              <li
                key={entry.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-gray-200 px-3 py-2 dark:border-gray-700"
              >
                <span>
                  <span className="font-medium text-gray-800 dark:text-gray-200">{fieldLabel(entry.field)}:</span>{" "}
                  <span>
                    {formatFieldValue(entry.field, entry.originalValue)} → {formatFieldValue(entry.field, entry.proposedValue)}
                  </span>
                </span>
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  <span className="font-medium">{entry.status}</span> by {entry.resolvedBy} ·{" "}
                  <time dateTime={entry.resolvedAt}>{formatDateTime(entry.resolvedAt)}</time>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-gray-500 dark:text-gray-400">No resolved changes yet.</p>
        )}
      </div>
    </div>
  );
}
