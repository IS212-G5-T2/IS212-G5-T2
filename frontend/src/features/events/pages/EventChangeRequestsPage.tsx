/*
 * SPM-64 — Change Requests page for one event (/events/:id/change-requests).
 *
 * - The owning organiser can open the Request Change form while the event
 *   accepts requests (Submitted to Confirmed, not started) and none is
 *   pending (AC1). After submitting they see a confirmation message (AC4)
 *   and the request with its status in the list below (AC5); a pending
 *   request can be withdrawn.
 * - SPM-65: the assigned coordinator reviews each pending request in the list
 *   (conflict preview, approve, deny), sees a confirmation after deciding
 *   (AC6), ticks off the arrangements to re-check (AC9) and, like the owner,
 *   reads the audit log (AC10). A request that is no longer pending reloads
 *   the list with the server's message (AC11: closed automatically when
 *   the organiser withdraws it or the event is cancelled).
 * - Everyone else gets the server's 404 message.
 *
 * Replaces the earlier mock page that read change requests from the client
 * store; all data now comes from /api/events/:id/change-requests.
 */
import { useCallback, useEffect, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { useAppStore } from "@/store/useAppStore";
import {
  hasRole,
  type ChangeRequest,
  type ChangeRequestApproval,
  type ChangeRequestSubmission,
  type EventRecord,
} from "@/types";
import { api } from "@/utils/api";
import {
  fetchEventChangeRequests,
  submitChangeRequest,
  withdrawChangeRequest,
} from "@/features/events/api/change-requests-api";
import { acceptsChangeRequests, pendingRequest } from "@/features/events/lib/changeRequests";
import { ChangeRequestAuditLog } from "@/features/events/pages/change-requests/ChangeRequestAuditLog";
import { ChangeRequestList, type ReviewHandlers } from "@/features/events/pages/change-requests/ChangeRequestList";
import { RequestChangeForm } from "@/features/events/pages/change-requests/RequestChangeForm";

export function EventChangeRequestsPage() {
  const { id } = useParams();
  const location = useLocation();
  const currentUser = useAppStore((s) => s.currentUser);
  const [event, setEvent] = useState<EventRecord | null>(null);
  const [requests, setRequests] = useState<ChangeRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  // Opened directly from the event page's "Request Change" button.
  const [formOpen, setFormOpen] = useState(Boolean((location.state as { openForm?: boolean } | null)?.openForm));
  const [confirmation, setConfirmation] = useState("");
  // Bumped after each decision so the audit log reloads.
  const [auditVersion, setAuditVersion] = useState(0);

  const loadRequests = useCallback(async () => {
    setRequests(await fetchEventChangeRequests(id!));
  }, [id]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setLoadError("");
    Promise.all([api<EventRecord>(`/events/${id}`), fetchEventChangeRequests(id!)])
      .then(([loadedEvent, loadedRequests]) => {
        if (!active) return;
        setEvent(loadedEvent);
        setRequests(loadedRequests);
      })
      .catch((e) => {
        if (active) setLoadError(e instanceof Error ? e.message : "Could not load change requests.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [id]);

  if (loading) return <p role="status">Loading change requests…</p>;
  if (loadError || !event)
    return (
      <div role="alert" className="text-sm text-danger-700 dark:text-danger-300">
        {loadError || "Event not found."}{" "}
        <Link to="/events" className="underline">
          Back To Events
        </Link>
      </div>
    );

  const isOwner = hasRole(currentUser, "organiser") && event.organiserId === currentUser.id;
  const isAssignedCoordinator = hasRole(currentUser, "coordinator") && event.coordinatorId === currentUser.id;
  const pending = pendingRequest(requests);
  const canRequest = isOwner && acceptsChangeRequests(event) && !pending;

  async function submit(submission: ChangeRequestSubmission) {
    const created = await submitChangeRequest(event!.id, submission);
    setFormOpen(false);
    // AC4: confirmation that the request was submitted.
    setConfirmation(`Your change request for ${event!.name} has been submitted for review.`);
    setRequests((list) => [created, ...list]);
    return created;
  }

  async function withdraw(request: ChangeRequest) {
    try {
      await withdrawChangeRequest(event!.id, request.id);
    } catch (e) {
      // AC8: the request may have been decided meanwhile; show its current state with the error.
      await loadRequests().catch(() => undefined);
      throw e;
    }
    setConfirmation("Your change request was withdrawn.");
    setAuditVersion((v) => v + 1);
    await loadRequests();
  }

  const replace = (updated: ChangeRequest) =>
    setRequests((list) => list.map((request) => (request.id === updated.id ? updated : request)));

  // SPM-65 AC6: a confirmation after each decision; AC8 says when the safety check was reset.
  const review: ReviewHandlers = {
    onApproved: (result: ChangeRequestApproval) => {
      replace(result.request);
      // AC8: a Confirmed event is back in Planning.
      setEvent({ ...event!, status: result.eventStatus });
      setConfirmation(
        `The change request was approved and ${event.name} has been updated.${
          result.safetyCheckReset ? " The safety check was reset; request a new safety check." : ""
        }${result.request.recheck.length ? " Re-check the affected arrangements below." : ""}`,
      );
      setAuditVersion((v) => v + 1);
    },
    onDenied: (request: ChangeRequest) => {
      replace(request);
      setConfirmation("The change request was denied. The organiser has been told why.");
      setAuditVersion((v) => v + 1);
    },
    onRechecked: replace,
    onStale: () => {
      void loadRequests().catch(() => undefined);
      setAuditVersion((v) => v + 1);
    },
  };

  return (
    <div>
      <PageHeader
        title={`Change Requests — ${event.name}`}
        description={
          isOwner
            ? "Request changes to your event. The assigned coordinator reviews each request before the event is updated."
            : isAssignedCoordinator
              ? "Review the changes the organiser has requested. Check for conflicts, then approve or deny each request."
              : "Changes the organiser has requested for this event."
        }
        actions={
          <Link to={`/events/${event.id}`}>
            <Button variant="secondary">Back To Event</Button>
          </Link>
        }
      />

      {confirmation && (
        <div role="status" className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-success-300 bg-success-50 px-4 py-3 text-sm text-success-900 dark:border-success-700 dark:bg-success-900/20 dark:text-success-200">
          <span>{confirmation}</span>
          <Button size="sm" variant="ghost" onClick={() => setConfirmation("")}>
            Dismiss
          </Button>
        </div>
      )}

      {isOwner && (
        <Card className="mb-6">
          <CardHeader>
            <h2 className="font-semibold text-gray-900 dark:text-gray-100">Request a Change</h2>
          </CardHeader>
          <CardBody>
            {formOpen && canRequest ? (
              <RequestChangeForm event={event} onSubmit={submit} onCancel={() => setFormOpen(false)} />
            ) : canRequest ? (
              <Button onClick={() => setFormOpen(true)}>Request Change</Button>
            ) : (
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {pending
                  ? "Your change request is awaiting the coordinator's review. You can request another change once it is decided or withdrawn."
                  : "This event can no longer be changed."}
              </p>
            )}
          </CardBody>
        </Card>
      )}

      <Card>
        <CardHeader>
          <h2 className="font-semibold text-gray-900 dark:text-gray-100">Change Request History</h2>
        </CardHeader>
        <CardBody>
          <ChangeRequestList
            requests={requests}
            onWithdraw={isOwner ? withdraw : undefined}
            review={isAssignedCoordinator ? review : undefined}
          />
        </CardBody>
      </Card>

      {(isOwner || isAssignedCoordinator) && (
        <Card className="mt-6">
          <CardHeader>
            <h2 className="font-semibold text-gray-900 dark:text-gray-100">Audit Log</h2>
          </CardHeader>
          <CardBody>
            <ChangeRequestAuditLog eventId={event.id} refreshKey={auditVersion} />
          </CardBody>
        </Card>
      )}
    </div>
  );
}
