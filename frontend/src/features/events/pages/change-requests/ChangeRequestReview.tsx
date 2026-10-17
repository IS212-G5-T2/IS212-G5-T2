/*
 * SPM-65 — the assigned coordinator's review of one pending change request.
 *
 * - Opening the panel marks the coordinator's change request notice for the event as read (the New tag
 *   on the events page goes away).
 * - AC3: a read-only conflict preview loads with the request: venue bookings, equipment
 *   reservations and registrations the requested values conflict with. Loading it changes nothing.
 * - AC4: Approve asks for confirmation first, then applies the change.
 * - AC5: Deny needs a reason of 10 to 500 characters.
 * - AC6: the parent shows the confirmation message (onDecided).
 * - AC11: a pending request is closed automatically when the organiser withdraws it or the event is
 *   cancelled. If that happened while the panel was open, the server's 409 message (for example "The
 *   organiser has withdrawn this change request.") is shown and the parent reloads the list
 *   (onStale), so the request cannot be decided.
 */
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { TextArea } from "@/components/ui/FormControls";
import type { ArrangementImpact, ChangeRequest, ChangeRequestApproval, ChangeRequestConflicts } from "@/types";
import { ApiError } from "@/utils/api";
import {
  approveChangeRequest,
  denyChangeRequest,
  markChangeRequestNoticesRead,
  previewChangeRequestConflicts,
} from "@/features/events/api/change-requests-api";
import { DENIAL_REASON_MAX, denialReasonError } from "@/features/events/lib/changeRequests";

interface Props {
  request: ChangeRequest;
  onApproved: (result: ChangeRequestApproval) => void;
  onDenied: (request: ChangeRequest) => void;
  /** The request is no longer pending: reload the list. */
  onStale: () => void;
}

type Mode = "idle" | "confirmApprove" | "deny";

function ImpactList({ title, items }: { title: string; items: ArrangementImpact[] }) {
  if (!items.length) return null;
  return (
    <div className="mt-2">
      <h5 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{title}</h5>
      <ul className="mt-1 space-y-1">
        {items.map((item) => (
          <li key={item.refId}>
            <span className="font-medium text-gray-900 dark:text-gray-100">{item.name}</span>
            <ul className="ml-4 list-disc text-gray-700 dark:text-gray-300">
              {item.details.map((detail) => (
                <li key={detail}>{detail}</li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ConflictPreview({ conflicts }: { conflicts: ChangeRequestConflicts }) {
  if (!conflicts.hasConflicts)
    return <p className="text-success-800 dark:text-success-300">No conflicts with existing bookings or registrations.</p>;
  return (
    <div className="text-sm">
      <ImpactList title="Venue bookings" items={conflicts.venueBookings} />
      <ImpactList title="Equipment reservations" items={conflicts.equipment} />
      {conflicts.registrations.details.length > 0 && (
        <div className="mt-2">
          <h5 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Registrations</h5>
          <ul className="ml-4 mt-1 list-disc text-gray-700 dark:text-gray-300">
            {conflicts.registrations.details.map((detail) => (
              <li key={detail}>{detail}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export function ChangeRequestReview({ request, onApproved, onDenied, onStale }: Props) {
  const [conflicts, setConflicts] = useState<ChangeRequestConflicts | null>(null);
  const [previewError, setPreviewError] = useState("");
  const [mode, setMode] = useState<Mode>("idle");
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // Opening the review counts as seeing the request: it is no longer tagged New on the events page.
  useEffect(() => {
    markChangeRequestNoticesRead(request.eventId).catch(() => undefined);
  }, [request.eventId]);

  useEffect(() => {
    let active = true;
    previewChangeRequestConflicts(request.eventId, request.id)
      .then((loaded) => {
        if (active) setConflicts(loaded);
      })
      .catch((e: unknown) => {
        if (active) setPreviewError(e instanceof Error ? e.message : "Could not check for conflicts.");
      });
    return () => {
      active = false;
    };
  }, [request.eventId, request.id]);

  async function decide(work: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await work();
    } catch (e) {
      const message = e instanceof Error ? e.message : "Could not record the decision.";
      if (e instanceof ApiError && e.errors?.reason) setReasonError(e.errors.reason);
      else setError(message);
      setBusy(false);
      // AC11: withdrawn or closed (or decided) meanwhile; show the current state.
      if (e instanceof ApiError && e.status === 409 && e.code?.startsWith("change_request_")) onStale();
    }
  }

  const approve = () =>
    decide(async () => {
      onApproved(await approveChangeRequest(request.eventId, request.id));
    });

  const deny = () => {
    const problem = denialReasonError(reason);
    setReasonError(problem);
    if (problem) return;
    void decide(async () => {
      onDenied((await denyChangeRequest(request.eventId, request.id, reason.trim())).request);
    });
  };

  return (
    <section aria-label="Review this change request" className="mt-3 rounded-md border border-primary-200 bg-primary-50/40 p-3 dark:border-primary-800 dark:bg-primary-900/10">
      <h4 className="font-medium text-gray-900 dark:text-gray-100">Conflict check</h4>
      <p className="text-xs text-gray-500 dark:text-gray-400">A preview only: nothing changes until you approve.</p>
      <div className="mt-2">
        {previewError ? (
          <p role="alert" className="text-danger-600 dark:text-danger-400">
            {previewError}
          </p>
        ) : conflicts ? (
          <ConflictPreview conflicts={conflicts} />
        ) : (
          <p role="status">Checking for conflicts…</p>
        )}
      </div>

      {error && (
        <p role="alert" className="mt-3 text-danger-600 dark:text-danger-400">
          {error}
        </p>
      )}

      {mode === "idle" && (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button size="sm" onClick={() => setMode("confirmApprove")}>
            Approve Change
          </Button>
          <Button size="sm" variant="secondary" onClick={() => setMode("deny")}>
            Deny Change
          </Button>
        </div>
      )}

      {mode === "confirmApprove" && (
        <div className="mt-3 rounded-md border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-800">
          <p className="text-gray-800 dark:text-gray-200">
            Approve this change? The event will be updated with the requested values.
            {request.requiresSafetyCheck && " Its safety check will be reset and must be requested again."}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button size="sm" disabled={busy} onClick={() => void approve()}>
              Confirm Approval
            </Button>
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => setMode("idle")}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {mode === "deny" && (
        <div className="mt-3 rounded-md border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-800">
          <TextArea
            id={`deny-reason-${request.id}`}
            label="Reason for denying"
            required
            rows={3}
            maxLength={DENIAL_REASON_MAX}
            value={reason}
            error={reasonError}
            hint={`The organiser sees this reason. ${reason.trim().length}/${DENIAL_REASON_MAX} characters.`}
            onChange={(e) => {
              setReason(e.target.value);
              setReasonError("");
            }}
          />
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="danger" disabled={busy} onClick={deny}>
              Confirm Denial
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={() => {
                setMode("idle");
                setReasonError("");
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
