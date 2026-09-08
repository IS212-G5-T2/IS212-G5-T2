import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useAppStore } from "@/store/useAppStore";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { RadioGroup, TextArea } from "@/components/ui/FormControls";
import { formatDateRange, formatDateTime } from "@/utils/format";

const STATUS_FLOW = [
  "draft",
  "submitted",
  "under_review",
  "approved",
  "planning",
  "confirmed",
  "completed",
] as const;

export function EventDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const currentUser = useAppStore((s) => s.currentUser);
  const events = useAppStore((s) => s.events);
  const registrations = useAppStore((s) => s.registrations);
  const submitEvent = useAppStore((s) => s.submitEvent);
  const assignCoordinator = useAppStore((s) => s.assignCoordinator);
  const reviewEvent = useAppStore((s) => s.reviewEvent);
  const registerForEvent = useAppStore((s) => s.registerForEvent);
  const withdrawRegistration = useAppStore((s) => s.withdrawRegistration);

  const [reviewOpen, setReviewOpen] = useState(false);
  const [decision, setDecision] = useState<"approve" | "reject" | "clarify" | "">("");
  const [note, setNote] = useState("");

  const event = events.find((e) => e.id === id);

  if (!event) {
    return (
      <div className="rounded-lg border border-dashed border-gray-300 dark:border-gray-600 px-4 py-10 text-center text-sm text-gray-500 dark:text-gray-400">
        Event not found. <Link to="/events" className="text-primary-700 dark:text-primary-300 underline">Back to events</Link>
      </div>
    );
  }

  const isOwner = currentUser.role === "organiser" && event.organiserId === currentUser.id;
  const isAssignedCoordinator = currentUser.role === "coordinator" && event.coordinatorId === currentUser.id;
  const isUnassignedForCoordinator =
    currentUser.role === "coordinator" && !event.coordinatorId && event.status !== "draft";

  const myRegistration = registrations.find(
    (r) => r.eventId === event.id && r.attendeeId === currentUser.id
  );

  const submitReview = () => {
    if (!decision) return;
    reviewEvent(event.id, decision, note || undefined);
    setReviewOpen(false);
    setDecision("");
    setNote("");
  };

  const currentStepIndex = STATUS_FLOW.indexOf(event.status as (typeof STATUS_FLOW)[number]);

  return (
    <div>
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
            {isOwner && !["draft", "rejected", "cancelled", "completed"].includes(event.status) && (
              <Link to={`/events/${event.id}/edit`}>
                <Button variant="secondary">Request Change</Button>
              </Link>
            )}
            {isUnassignedForCoordinator && (
              <Button onClick={() => assignCoordinator(event.id, currentUser.id, currentUser.name)}>
                Assign Myself as Coordinator
              </Button>
            )}
            {isAssignedCoordinator && ["submitted", "under_review"].includes(event.status) && (
              <Button onClick={() => setReviewOpen(true)}>Review Event</Button>
            )}
            {isAssignedCoordinator && (
              <Link to={`/events/${event.id}/change-requests`}>
                <Button variant="secondary">
                  Change Requests
                  {event.changeRequests.filter((c) => c.status === "pending").length > 0 && (
                    <span className="ml-1 rounded-full bg-warning-500 px-1.5 text-xs text-white">
                      {event.changeRequests.filter((c) => c.status === "pending").length}
                    </span>
                  )}
                </Button>
              </Link>
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

      {event.clarificationNote && event.status === "under_review" && (
        <div className="mb-4 rounded-lg border border-warning-300 dark:border-warning-700 bg-warning-50 dark:bg-warning-900/20 px-4 py-3 text-sm text-warning-900 dark:text-warning-300">
          <strong>Clarification requested:</strong> {event.clarificationNote}
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
                  {formatDateRange(event.startDateTime, event.endDateTime)}
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
              <dd className="font-medium text-gray-800 dark:text-gray-200">{event.organiserName}</dd>
            </div>
            <div>
              <dt className="text-gray-400 dark:text-gray-500">Coordinator</dt>
              <dd className="font-medium text-gray-800 dark:text-gray-200">{event.coordinatorName ?? "Unassigned"}</dd>
            </div>
            <div>
              <dt className="text-gray-400 dark:text-gray-500">Last updated</dt>
              <dd className="font-medium text-gray-800 dark:text-gray-200">{formatDateTime(event.updatedAt)}</dd>
            </div>
          </CardBody>
        </Card>

        {currentUser.role === "attendee" && event.registrationEnabled && (
          <Card className="lg:col-span-3">
            <CardHeader>
              <h2 className="font-semibold text-gray-900 dark:text-gray-100">Registration</h2>
            </CardHeader>
            <CardBody className="flex flex-wrap items-center justify-between gap-3">
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
            </CardBody>
          </Card>
        )}
      </div>

      <Modal
        open={reviewOpen}
        onClose={() => setReviewOpen(false)}
        title={`Review — ${event.name}`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setReviewOpen(false)}>
              Cancel
            </Button>
            <Button
              variant={decision === "reject" ? "danger" : "primary"}
              disabled={!decision}
              onClick={submitReview}
            >
              Submit Decision
            </Button>
          </>
        }
      >
        <RadioGroup
          label="Coordinator decision"
          name="review-decision"
          value={decision}
          onChange={(v) => setDecision(v as typeof decision)}
          options={[
            { value: "approve", label: "Approve — move to planning" },
            { value: "clarify", label: "Request clarification from organiser" },
            { value: "reject", label: "Reject" },
          ]}
        />
        {(decision === "reject" || decision === "clarify") && (
          <TextArea
            label={decision === "reject" ? "Rejection reason" : "What needs clarifying?"}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        )}
      </Modal>

      <div className="mt-4">
        <button onClick={() => navigate(-1)} className="text-sm text-gray-500 dark:text-gray-400 hover:underline">
          ← Back
        </button>
      </div>
    </div>
  );
}
