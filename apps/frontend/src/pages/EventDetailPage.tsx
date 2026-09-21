import { api } from "@/utils/api";
import type { EventComment, EventRecord } from "@/types";
import { useCallback, useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { useAppStore } from "@/store/useAppStore";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Button } from "@/components/ui/Button";
import { ClarificationThread } from "@/components/domain/ClarificationThread";
import { formatDateTimeRange, formatDateTime } from "@/utils/format";

const CLARIFIABLE_STATUSES = ["submitted", "approved"];

// Venue and technical support staff only get involved once a request is
// approved; anything earlier in the workflow is off-limits to them.
const STAFF_ACCESSIBLE_STATUSES = ["approved", "planning", "confirmed", "completed"];

const STATUS_FLOW = [
  "draft",
  "submitted",
  "approved",
  "planning",
  "confirmed",
  "completed",
] as const;

// Chrome and Firefox block top-level navigation of a link to a data: URL
// (a phishing-hardening measure), so `target="_blank"` on an `<a
// href="data:...">` silently fails to open a new tab in real browsers even
// though jsdom-based tests don't enforce that restriction. Converting to a
// Blob object URL first sidesteps the restriction entirely.
function openAttachmentPreview(dataUrl: string, fallbackType: string): void {
  const commaIndex = dataUrl.indexOf(",");
  const header = dataUrl.slice(0, commaIndex);
  const base64 = dataUrl.slice(commaIndex + 1);
  const mimeMatch = /^data:(.*?);base64$/.exec(header);
  const mime = mimeMatch?.[1] || fallbackType || "application/octet-stream";
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const blobUrl = URL.createObjectURL(new Blob([bytes], { type: mime }));
  window.open(blobUrl, "_blank", "noopener,noreferrer");
  setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
}

export function EventDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  useEffect(() => {
    let active = true;
    setLoading(true); setLoadError("");
    api<EventRecord>(`/events/${id}`).then(event => {
      if (active) useAppStore.setState(s => ({ events: [event, ...s.events.filter(e => e.id !== event.id)] }));
    }).catch(e => { if (active) setLoadError(e.message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [id]);
  const currentUser = useAppStore((s) => s.currentUser);
  const events = useAppStore((s) => s.events);
  const registrations = useAppStore((s) => s.registrations);
  const submitEvent = useAppStore((s) => s.submitEvent);
  const registerForEvent = useAppStore((s) => s.registerForEvent);
  const withdrawRegistration = useAppStore((s) => s.withdrawRegistration);

  const [comments, setComments] = useState<EventComment[]>([]);
  const [commentsError, setCommentsError] = useState("");

  const [reviewNotice, setReviewNotice] = useState("");

  const event = events.find((e) => e.id === id);

  const refreshComments = useCallback(async () => {
    try {
      const data = await api<EventComment[]>(`/events/${id}/comments`);
      setComments(data);
      setCommentsError("");
    } catch (e) {
      setCommentsError(e instanceof Error ? e.message : "Could not load comments.");
    }
  }, [id]);

  useEffect(() => {
    if (loading || loadError || !event) return;
    const canView =
      currentUser.role === "organiser" ||
      (currentUser.role === "coordinator" && event.coordinatorId === currentUser.id);
    if (canView) refreshComments();
    // Only re-run when the values that decide *whether* we can view change;
    // refreshComments itself is called explicitly after posting/replying.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, loadError, event?.coordinatorId, currentUser.role, currentUser.id]);

  if (loading) return <p role="status">Loading event…</p>;
  if (loadError) return <div role="alert">{loadError} <Link to="/events">Back to My Events</Link></div>;

  if (!event) {
    return (
      <div className="rounded-lg border border-dashed border-gray-300 dark:border-gray-600 px-4 py-10 text-center text-sm text-gray-500 dark:text-gray-400">
        Event not found. <Link to="/events" className="text-primary-700 dark:text-primary-300 underline">Back to events</Link>
      </div>
    );
  }

  const isSupportStaff =
    currentUser.role === "venue_staff" || currentUser.role === "tech_support";
  if (isSupportStaff && !STAFF_ACCESSIBLE_STATUSES.includes(event.status)) {
    return (
      <div
        role="alert"
        className="rounded-lg border border-danger-300 dark:border-danger-700 bg-danger-50 dark:bg-danger-900/20 px-4 py-3 text-sm text-danger-900 dark:text-danger-300"
      >
        Access restricted: Venue and technical support staff cannot access unapproved submitted requests.{" "}
        <Link to="/events" className="underline">
          Back to events
        </Link>
      </div>
    );
  }

  const isOwner = currentUser.role === "organiser";
  const isAssignedCoordinator = currentUser.role === "coordinator" && event.coordinatorId === currentUser.id;

  const myRegistration = registrations.find(
    (r) => r.eventId === event.id && r.attendeeId === currentUser.id
  );

  const canRequestClarification =
    isAssignedCoordinator && CLARIFIABLE_STATUSES.includes(event.status);

  const submitClarification = async (message: string) => {
    await api(`/events/${event.id}/clarifications`, {
      method: "POST",
      body: JSON.stringify({ message }),
    });
    const [refreshedEvent] = await Promise.all([
      api<EventRecord>(`/events/${event.id}`),
      refreshComments(),
    ]);
    useAppStore.setState((s) => ({
      events: [
        { ...event, ...refreshedEvent },
        ...s.events.filter((e) => e.id !== refreshedEvent.id),
      ],
    }));
  };

  const submitClarificationReply = async (clarificationId: string, message: string) => {
    await api(`/events/${event.id}/clarifications/${clarificationId}/reply`, {
      method: "POST",
      body: JSON.stringify({ message }),
    });
    await refreshComments();
  };

  const submitClarificationResolve = async (clarificationId: string) => {
    await api(`/events/${event.id}/clarifications/${clarificationId}/resolve`, {
      method: "POST",
    });
    await refreshComments();
  };

  const currentStepIndex = STATUS_FLOW.indexOf(event.status as (typeof STATUS_FLOW)[number]);

  return (
    <div>
      {location.state?.submitted && <div role="status" className="mb-6 rounded-lg border border-teal-200 bg-teal-50 p-4 text-sm text-teal-900"><strong>Your event request was submitted successfully.</strong><p className="mt-1">You can find it in My Events.</p><Link className="mt-2 inline-block underline" to="/events">View My Events</Link></div>}
      <PageHeader
        title={event.name}
        description={event.purpose}
        actions={
          <>
            {isOwner && event.status === "draft" && (
              <>
                <Link to={`/events/${event.id}/edit`}>
                  <Button variant="secondary">Edit</Button>
                </Link>
                <Button onClick={() => submitEvent(event.id)}>Submit for Review</Button>
              </>
            )}
            {isAssignedCoordinator && event.status === "submitted" && (
              // The approve/reject workflow is not implemented for SPM-37; the
              // entrypoint stays visible but surfaces a not-available message.
              <Button onClick={() => setReviewNotice("Event review is not available yet.")}>
                Review Event
              </Button>
            )}
            {isAssignedCoordinator && ["approved", "planning"].includes(event.status) && (
              <Link to={`/venues?eventId=${event.id}`}>
                <Button variant="secondary">Search Venues</Button>
              </Link>
            )}
          </>
        }
      />

      {!STATUS_FLOW.includes(event.status as (typeof STATUS_FLOW)[number]) ? (
        <div className="mb-6">
          <StatusBadge status={event.status} />
        </div>
      ) : (
        <ol className="mb-6 flex flex-wrap items-center gap-2 text-xs" aria-label="Event status timeline">
          {STATUS_FLOW.map((s, i) => (
            <li key={s} className="flex items-center gap-2">
              <span
                className={`rounded-full px-2.5 py-1 font-medium ${
                  i <= currentStepIndex ? "bg-primary-100 dark:bg-primary-900/30 text-primary-800 dark:text-primary-300" : "bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-500"
                }`}
              >
                {s.replace("_", " ")}
              </span>
              {i < STATUS_FLOW.length - 1 && <span className="text-gray-300 dark:text-gray-600">→</span>}
            </li>
          ))}
        </ol>
      )}

      {reviewNotice && (
        <div role="alert" className="mb-4 rounded-lg border border-danger-300 dark:border-danger-700 bg-danger-50 dark:bg-danger-900/20 px-4 py-3 text-sm text-danger-900 dark:text-danger-300">
          {reviewNotice}
        </div>
      )}
      {commentsError && (
        <div role="alert" className="mb-4 rounded-lg border border-danger-300 dark:border-danger-700 bg-danger-50 dark:bg-danger-900/20 px-4 py-3 text-sm text-danger-900 dark:text-danger-300">
          {commentsError}
        </div>
      )}
      {event.rejectionReason && event.status === "rejected" && (
        <div className="mb-4 rounded-lg border border-danger-300 dark:border-danger-700 bg-danger-50 dark:bg-danger-900/20 px-4 py-3 text-sm text-danger-900 dark:text-danger-300">
          <strong>Rejected:</strong> {event.rejectionReason}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <h2 className="font-semibold text-gray-900 dark:text-gray-100">Event Details</h2>
          </CardHeader>
          <CardBody>
            <p className="mb-4 text-sm text-gray-600 dark:text-gray-400">{event.description || "No description provided."}</p>
            <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-gray-400 dark:text-gray-500">Date & time</dt>
                <dd className="font-medium text-gray-800 dark:text-gray-200">
                  {formatDateTimeRange(event.startDateTime, event.endDateTime)}
                </dd>
              </div>
              <div>
                <dt className="text-gray-400 dark:text-gray-500">Expected attendance</dt>
                <dd className="font-medium text-gray-800 dark:text-gray-200">{event.expectedAttendance}</dd>
              </div>
              <div>
                <dt className="text-gray-400 dark:text-gray-500">Venue</dt>
                <dd className="font-medium text-gray-800 dark:text-gray-200">{event.venueName ?? "Not yet booked"}</dd>
              </div>
              <div>
                <dt className="text-gray-400 dark:text-gray-500">Room layout</dt>
                <dd className="font-medium text-gray-800 dark:text-gray-200">{event.venueRequirements.layout || "—"}</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-gray-400 dark:text-gray-500">Required facilities</dt>
                <dd className="font-medium text-gray-800 dark:text-gray-200">
                  {event.venueRequirements.facilities.join(", ") || "None specified"}
                </dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-gray-400 dark:text-gray-500">Accessibility needs</dt>
                <dd className="font-medium text-gray-800 dark:text-gray-200">
                  {event.venueRequirements.accessibility.join(", ") || "None specified"}
                </dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-gray-400 dark:text-gray-500">Attached files</dt>
                <dd className="space-y-2 font-medium text-gray-800 dark:text-gray-200">
                  {event.attachments?.length ? (
                    event.attachments.map((attachment) => (
                      <div
                        key={attachment.id}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-gray-200 px-3 py-2 dark:border-gray-700"
                      >
                        <span>{attachment.name}</span>
                        <span className="flex items-center gap-3 text-xs">
                          <button
                            type="button"
                            onClick={() => openAttachmentPreview(attachment.dataUrl, attachment.type)}
                            className="text-primary-700 underline dark:text-primary-300"
                          >
                            View
                          </button>
                          <a
                            href={attachment.dataUrl}
                            download={attachment.name}
                            className="text-primary-700 underline dark:text-primary-300"
                          >
                            Download
                          </a>
                        </span>
                      </div>
                    ))
                  ) : (
                    "None specified"
                  )}
                </dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-gray-400 dark:text-gray-500">Equipment needs</dt>
                <dd className="font-medium text-gray-800 dark:text-gray-200">{event.equipmentNeeds || "None specified"}</dd>
              </div>
            </dl>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <h2 className="font-semibold text-gray-900 dark:text-gray-100">People</h2>
          </CardHeader>
          <CardBody className="space-y-3 text-sm">
            <div>
              <dt className="text-gray-400 dark:text-gray-500">Organiser</dt>
              <dd className="break-words font-medium text-gray-800 dark:text-gray-200">{event.organiserName}</dd>
            </div>
            <div>
              <dt className="text-gray-400 dark:text-gray-500">Coordinator</dt>
              <dd className="break-words font-medium text-gray-800 dark:text-gray-200">{event.coordinatorName ?? "Unassigned"}</dd>
            </div>
            <div>
              <dt className="text-gray-400 dark:text-gray-500">Last updated</dt>
              <dd className="font-medium text-gray-800 dark:text-gray-200">{formatDateTime(event.updatedAt)}</dd>
            </div>
          </CardBody>
        </Card>

        {currentUser.role === "attendee" && (
          <Card className="lg:col-span-3">
            <CardHeader>
              <h2 className="font-semibold text-gray-900 dark:text-gray-100">Registration</h2>
            </CardHeader>
            {!event.registrationEnabled ? (
              <CardBody className="text-sm text-gray-600 dark:text-gray-400">
                Registration through the website is not enabled for this event.
              </CardBody>
            ) : (
              <CardBody className="space-y-3">
                {myRegistration?.status !== "registered" && (
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Please sign up through the website first to attend this event.
                  </p>
                )}
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Status:{" "}
                    <span className="font-medium text-gray-900 dark:text-gray-100">
                      {myRegistration?.status === "registered" ? "You're registered" : "Not registered"}
                    </span>
                  </p>
                  {myRegistration?.status === "registered" ? (
                    <Button variant="secondary" onClick={() => withdrawRegistration(event.id)}>
                      Withdraw Registration
                    </Button>
                  ) : (
                    <Button onClick={() => registerForEvent(event.id)}>Register</Button>
                  )}
                </div>
              </CardBody>
            )}
          </Card>
        )}

        {(isOwner || isAssignedCoordinator) && (
          <div className="lg:col-span-3">
            <ClarificationThread
              comments={comments}
              canRequestClarification={canRequestClarification}
              onSubmitClarification={submitClarification}
              canReply={isOwner || isAssignedCoordinator}
              onSubmitReply={submitClarificationReply}
              canResolve={isOwner || isAssignedCoordinator}
              onResolve={submitClarificationResolve}
            />
          </div>
        )}
      </div>

      <div className="mt-4">
        <button onClick={() => navigate(-1)} className="text-sm text-gray-500 dark:text-gray-400 hover:underline">
          ← Back
        </button>
      </div>
    </div>
  );
}
