import { Link } from "react-router-dom";
import { Card, CardBody } from "@/components/ui/Card";
import { StatusBadge } from "@/components/ui/StatusBadge";
import type { EventRecord } from "@/types";
import { formatDateRange } from "@/utils/format";
import { SafetyIndicator } from "@/features/events/components/StatusIndicators";
import { StateLabel, cardArrangementLabels, type StateLabelInfo } from "@/features/events/components/StatusLabels";
import { NeedsActionMarker, QueueSafetyLabel, QueueVenueNotes } from "@/features/events/components/QueueIndicators";
import { attendeeRegistrationLabel } from "@/features/events/lib/attendeeEventView";
import { listLabelFor } from "@/features/events/lib/cancellationRequests";
import type { CancellationDisplayStatus } from "@/features/events/types/cancellationRequest";

/** The attendee's own registration for this event; a badge is shown only when there is one (Confirmed, Waitlisted, Withdrawn). */
export type CardRegistrationStatus = "registered" | "waitlisted" | "withdrawn";

interface EventCardProps {
  event: EventRecord;
  /**
   * Attendee browse view. The event-status "Confirmed" badge is hidden here: "Confirmed" means the attendee has registered,
   * so it is shown only through the registration badge. Other event statuses (Completed, Cancelled) are unchanged.
   */
  attendeeView?: boolean;
  /** The attendee's own registration for this event, shown as its badge beside the event status. */
  registrationStatus?: CardRegistrationStatus;
  /** SPM-64 AC5: the organiser has a change request awaiting the coordinator's review. */
  changeRequestPending?: boolean;
  /** SPM-155 AC2: the organiser's latest cancellation request for this event, as it should be shown. */
  cancellationRequest?: CancellationDisplayStatus;
}

/**
 * The SPM-94 arrangement labels, except that a queue card whose venue became unavailable (SPM-48 AC9) does not also
 * claim the venue is reserved: "Venue Reserved" is dropped and the combined label keeps only "Equipment Reserved".
 */
function arrangementLabels(event: EventRecord): StateLabelInfo[] {
  const labels = cardArrangementLabels(event);
  if (!event.queue?.unavailableVenues.length) return labels;
  return labels
    .filter((l) => l.label !== "Venue Reserved")
    .map((l) => (l.label === "Equipment & Venue Reserved" ? { ...l, label: "Equipment Reserved" } : l));
}

const REGISTRATION_CHIPS: Record<CardRegistrationStatus, { label: string; className: string }> = {
  registered: {
    label: "Registered",
    className: "bg-primary-100 text-primary-800 dark:bg-primary-900/40 dark:text-primary-200",
  },
  waitlisted: {
    label: "Waitlisted",
    className: "bg-warning-100 text-warning-800 dark:bg-warning-900/30 dark:text-warning-300",
  },
  withdrawn: {
    label: "Withdrawn",
    className: "bg-danger-100 text-danger-800 dark:bg-danger-900/30 dark:text-danger-300",
  },
};

/** A status label in the attendee card's shared label box; the colour carries the state. */
function Chip({ label, className }: { label: string; className: string }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${className}`}>{label}</span>
  );
}

export function EventCard({ event, attendeeView = false, registrationStatus, changeRequestPending = false, cancellationRequest }: EventCardProps) {
  // For an attendee, an approved event is internal workflow and carries no badge. A confirmed event shows only its
  // registration label, Registration open or Registration closed (never the event's own status).
  const showEventBadge = !(attendeeView && event.status === "approved");
  const attendeeLabel = attendeeView ? attendeeRegistrationLabel(event, new Date()) : null;
  // The attendee's own registration is one chip: Registered, Waitlisted or Withdrawn. A cancelled event keeps its own
  // Cancelled badge instead of a Registered chip (SPM-136).
  const registrationChip = registrationStatus && !(registrationStatus === "registered" && event.status === "cancelled")
    ? REGISTRATION_CHIPS[registrationStatus]
    : null;
  return (
    <Link to={`/events/${event.id}`} className="block">
      <Card className="transition-shadow hover:shadow-md">
        <CardBody>
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="font-semibold text-gray-900 dark:text-gray-100">{event.name}</h3>
              <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">{event.purpose}</p>
              {event.reassignedFrom && (
                <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{`from ${event.reassignedFrom.coordinatorName}`}</p>
              )}
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1.5">
              {attendeeLabel && (
                <Chip
                  label={attendeeLabel}
                  className={
                    attendeeLabel === "Registration open"
                      ? "bg-success-100 text-success-800 dark:bg-success-900/30 dark:text-success-300"
                      : "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300"
                  }
                />
              )}
              {showEventBadge && !attendeeLabel && <StatusBadge status={event.status} />}
              {/* SPM-48 AC5: the coordinator queue marks events that need action. */}
              {event.queue && <NeedsActionMarker queue={event.queue} />}
              {registrationChip && <Chip label={registrationChip.label} className={registrationChip.className} />}
              {/* SPM-94 AC3: organiser-facing indicators; the attendee card never shows them. */}
              {!attendeeView && arrangementLabels(event).map((l) => <StateLabel key={`${l.tone}-${l.label}`} {...l} />)}
              {/* SPM-48 AC6, AC7: a queue card shows the queue's safety state instead of the SPM-94 indicator. */}
              {event.queue ? <QueueSafetyLabel queue={event.queue} /> : !attendeeView && <SafetyIndicator event={event} />}
              {changeRequestPending && (
                <span className="rounded-full bg-warning-100 px-2 py-0.5 text-xs font-medium text-warning-800 dark:bg-warning-900/30 dark:text-warning-300">
                  Change requested: Pending
                </span>
              )}
              {cancellationRequest && (
                <span className="rounded-full bg-warning-100 px-2 py-0.5 text-xs font-medium text-warning-800 dark:bg-warning-900/30 dark:text-warning-300">
                  {listLabelFor(cancellationRequest)}
                </span>
              )}
              {event.reassignedFrom && (
                <span className="rounded-full bg-primary-50 px-2 py-0.5 text-xs font-medium text-primary-700 dark:bg-primary-900/30 dark:text-primary-300">
                  Reassigned
                </span>
              )}
            </div>
          </div>
          {/* SPM-48 AC8, AC9: holds and unavailable venues, each naming the venue. */}
          {event.queue && <QueueVenueNotes queue={event.queue} />}
          <dl className="mt-3 grid grid-cols-2 gap-2 text-xs text-gray-600 dark:text-gray-400 sm:grid-cols-4">
            <div className="min-w-0">
              <dt className="text-gray-400 dark:text-gray-500">When</dt>
              <dd className="truncate" title={formatDateRange(event.startDateTime, event.endDateTime)}>
                {formatDateRange(event.startDateTime, event.endDateTime)}
              </dd>
            </div>
            <div className="min-w-0">
              <dt className="text-gray-400 dark:text-gray-500">Attendance</dt>
              <dd className="truncate">{event.expectedAttendance}</dd>
            </div>
            <div className="min-w-0">
              <dt className="text-gray-400 dark:text-gray-500">Venue</dt>
              <dd className="truncate" title={event.venueName ?? "Not booked"}>
                {event.venueName ?? "Not booked"}
              </dd>
            </div>
            <div className="min-w-0">
              <dt className="text-gray-400 dark:text-gray-500">Coordinator</dt>
              <dd className="truncate" title={event.coordinatorName ?? "Unassigned"}>
                {event.coordinatorName ?? "Unassigned"}
              </dd>
            </div>
          </dl>
        </CardBody>
      </Card>
    </Link>
  );
}
