import { Link } from "react-router-dom";
import { Card, CardBody } from "@/components/ui/Card";
import { StatusBadge } from "@/components/ui/StatusBadge";
import type { EventRecord } from "@/types";
import { formatDateRange } from "@/utils/format";

interface EventCardProps {
  event: EventRecord;
  /** Adds a "Registered" badge beside the status badge (SPM-61 attendee view). */
  registered?: boolean;
}

export function EventCard({ event, registered = false }: EventCardProps) {
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
            <div className="flex shrink-0 flex-wrap justify-end gap-1.5">
              <StatusBadge status={event.status} />
              {registered && <StatusBadge status="registered" />}
              {event.reassignedFrom && (
                <span className="rounded-full bg-primary-50 px-2 py-0.5 text-xs font-medium text-primary-700 dark:bg-primary-900/30 dark:text-primary-300">
                  Reassigned
                </span>
              )}
            </div>
          </div>
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
